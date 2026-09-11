import net from "node:net";
import crypto from "node:crypto";
import { requireAuth } from "../token.js";

const validId = (s) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const reserved = new Set([
  "www",
  "api",
  "mail",
  "admin",
  "ftp",
  "panel",
  "node",
  "smtp",
  "imap",
  "pop",
  "autodiscover",
  "status",
  "cdn",
  "download",
  "downloads",
  "blog",
  "ns1",
  "ns2",
  "localhost",
  "relay",
  "hosting",
  ...(process.env.HOSTING_RESERVED_NAMES ?? "").split(","),
]);
export const validSlug = (s) =>
  typeof s === "string" &&
  /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s) &&
  !reserved.has(s);
function varint(b, start) {
  let n = 0;
  for (let i = 0; i < 5; i++) {
    if (start + i >= b.length) return null;
    const v = b[start + i];
    n |= (v & 127) << (7 * i);
    if (!(v & 128)) return [n >>> 0, start + i + 1];
  }
  throw Error("Invalid VarInt");
}
export function handshakeHost(b) {
  const frame = varint(b, 0);
  if (!frame) return null;
  if (frame[0] > 2048 || frame[0] < 6) throw Error("Invalid handshake size");
  const end = frame[1] + frame[0];
  if (b.length < end) return null;
  const packet = b.subarray(0, end);
  const id = varint(packet, frame[1]);
  if (!id || id[0] !== 0) throw Error("Expected handshake");
  const protocol = varint(packet, id[1]);
  if (!protocol) throw Error("Protocol missing");
  const length = varint(packet, protocol[1]);
  if (
    !length ||
    length[0] > 255 ||
    length[0] < 1 ||
    length[1] + length[0] + 3 > end
  )
    throw Error("Invalid host");
  const state = varint(packet, length[1] + length[0] + 2);
  if (!state || ![1, 2].includes(state[0]) || state[1] !== end)
    throw Error("Invalid state");
  return packet
    .subarray(length[1], length[1] + length[0])
    .toString("utf8")
    .split("\0")[0]
    .toLowerCase()
    .replace(/\.$/, "");
}

export default async function hostingRoutes(
  app,
  {
    database,
    port = Number(process.env.HOSTING_RELAY_PORT ?? 0),
    host = process.env.HOSTING_RELAY_HOST ?? "0.0.0.0",
    domain = process.env.HOSTING_DOMAIN ?? "nebrel.de",
  } = {},
) {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain))
    throw Error("Invalid HOSTING_DOMAIN");
  const address = (slug) =>
    `${slug}.${domain}${port === 25565 || process.env.HOSTING_SRV === "true" ? "" : ":" + port}`;
  const controls = new Map(),
    pending = new Map(),
    sockets = new Set(),
    ipCounts = new Map();
  let listening = false;
  const server = net.createServer((socket) => {
    const ip = socket.remoteAddress;
    if (sockets.size >= 512 || (ipCounts.get(ip) ?? 0) >= 20) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
    socket.once("close", () => {
      sockets.delete(socket);
      const n = (ipCounts.get(ip) ?? 1) - 1;
      if (n) ipCounts.set(ip, n);
      else ipCounts.delete(ip);
    });
    socket.on("error", () => socket.destroy());
    socket.setTimeout(10000, () => socket.destroy());
    let prefix = Buffer.alloc(0);
    const receive = (chunk) => {
      prefix = Buffer.concat([prefix, chunk]);
      if (prefix.length > 65536) {
        socket.destroy();
        return;
      }
      let hostname;
      try {
        hostname = handshakeHost(prefix);
      } catch {
        socket.destroy();
        return;
      }
      if (!hostname) return;
      socket.removeListener("data", receive);
      socket.pause();
      const suffix = "." + domain;
      const slug = hostname.endsWith(suffix)
        ? hostname.slice(0, -suffix.length)
        : "";
      const control = controls.get(slug);
      if (
        !validSlug(slug) ||
        !control ||
        control.ws.readyState !== 1 ||
        control.connections >= 100
      ) {
        socket.destroy();
        return;
      }
      const id = crypto.randomUUID();
      control.connections++;
      const timer = setTimeout(() => {
        pending.delete(id);
        socket.destroy();
      }, 10000);
      timer.unref();
      const entry = { socket, prefix, control, timer };
      pending.set(id, entry);
      socket.once("close", () => {
        clearTimeout(timer);
        pending.delete(id);
        control.connections--;
      });
      control.ws.send(JSON.stringify({ type: "open", id }), (error) => {
        if (error) socket.destroy();
      });
    };
    socket.on("data", receive);
  });
  server.on("error", (error) => {
    listening = false;
    app.log.error({ code: error.code }, "Hosting relay listener failed");
  });
  app.addHook("onReady", async () => {
    if (port === 0) return;
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw Error("Invalid HOSTING_RELAY_PORT");
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.removeListener("error", reject);
        listening = true;
        resolve();
      });
    });
  });
  app.addHook("preClose", async () => {
    for (const c of controls.values()) c.ws.close(1001, "Shutdown");
    for (const s of sockets) s.destroy();
    for (const p of pending.values()) clearTimeout(p.timer);
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  });
  app.get("/hosting/config", async () => ({
    enabled: listening,
    domain,
    port,
  }));
  app.get("/hosting/servers", { preHandler: requireAuth }, async (req) => {
    const { rows } = await database.query(
      "SELECT id,slug FROM hosted_servers WHERE owner_uuid=$1 ORDER BY created_at",
      [req.user.uuid],
    );
    return rows.map((r) => ({
      ...r,
      address: address(r.slug),
      online: controls.has(r.slug),
    }));
  });
  app.post(
    "/hosting/servers",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!listening)
        return reply
          .code(503)
          .send({
            error:
              "Die öffentliche Serverfreigabe ist noch nicht eingerichtet.",
          });
      const { id, slug } = req.body ?? {};
      if (!validId(id) || !validSlug(slug))
        return reply
          .code(400)
          .send({
            error:
              "Name: 3–40 Kleinbuchstaben, Zahlen oder Bindestriche; reservierte Namen sind gesperrt.",
          });
      try {
        await database.transaction(async (q) => {
          await q("SELECT uuid FROM users WHERE uuid=$1 FOR UPDATE", [
            req.user.uuid,
          ]);
          const existing = (
            await q("SELECT owner_uuid,slug FROM hosted_servers WHERE id=$1", [
              id,
            ])
          ).rows[0];
          if (existing) {
            if (existing.owner_uuid !== req.user.uuid || existing.slug !== slug)
              throw Object.assign(
                Error("Server gehört bereits zu einer anderen Reservierung."),
                { statusCode: 409 },
              );
            return;
          }
          const count = (
            await q(
              "SELECT count(*)::int AS count FROM hosted_servers WHERE owner_uuid=$1",
              [req.user.uuid],
            )
          ).rows[0].count;
          if (count >= 5)
            throw Object.assign(
              Error("Maximal fünf öffentliche Server pro Account."),
              { statusCode: 409 },
            );
          await q(
            "INSERT INTO hosted_servers(id,owner_uuid,slug) VALUES($1,$2,$3)",
            [id, req.user.uuid, slug],
          );
        });
      } catch (e) {
        if (e.code === "23505")
          return reply
            .code(409)
            .send({ error: "Dieser Servername ist bereits vergeben." });
        throw e;
      }
      return { id, slug, address: address(slug) };
    },
  );
  app.delete(
    "/hosting/servers/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!validId(req.params.id))
        return reply.code(400).send({ error: "Invalid server ID" });
      const { rows } = await database.query(
        "DELETE FROM hosted_servers WHERE id=$1 AND owner_uuid=$2 RETURNING slug",
        [req.params.id, req.user.uuid],
      );
      if (!rows.length)
        return reply.code(404).send({ error: "Server not found" });
      controls.get(rows[0].slug)?.ws.close(1000, "Reservation released");
      return { ok: true };
    },
  );
  // Authenticate before the websocket upgrade. Credentials are never put into URLs.
  app.get(
    "/hosting/control/:id",
    {
      websocket: true,
      preValidation: [
        requireAuth,
        async (req, reply) => {
          if (!listening)
            return reply.code(503).send({ error: "Relay unavailable" });
          if (!validId(req.params.id))
            return reply.code(400).send({ error: "Invalid server ID" });
          const row = (
            await database.query(
              "SELECT slug FROM hosted_servers WHERE id=$1 AND owner_uuid=$2",
              [req.params.id, req.user.uuid],
            )
          ).rows[0];
          if (!row) return reply.code(404).send({ error: "Server not found" });
          req.hostingSlug = row.slug;
        },
      ],
    },
    (ws, req) => {
      const slug = req.hostingSlug;
      const old = controls.get(slug);
      old?.ws.close(1000, "Reconnected");
      const control = { ws, owner: req.user.uuid, connections: 0 };
      controls.set(slug, control);
      let alive = true;
      ws.on("pong", () => {
        alive = true;
      });
      ws.on("error", () => ws.terminate());
      const heartbeat = setInterval(() => {
        if (!alive) {
          ws.terminate();
          return;
        }
        alive = false;
        ws.ping();
      }, 30000);
      heartbeat.unref();
      const expiry = setTimeout(
        () => ws.close(1008, "Login expired"),
        Math.max(0, req.user.exp * 1000 - Date.now()),
      );
      expiry.unref();
      ws.on("close", () => {
        clearInterval(heartbeat);
        clearTimeout(expiry);
        if (controls.get(slug) === control) controls.delete(slug);
        for (const p of pending.values())
          if (p.control === control) p.socket.destroy();
        for (const s of sockets) if (s.hostingControl === control) s.destroy();
      });
      ws.send(JSON.stringify({ type: "ready" }));
    },
  );
  app.get(
    "/hosting/stream/:id",
    {
      websocket: true,
      preValidation: [
        requireAuth,
        async (req, reply) => {
          const p = pending.get(req.params.id);
          if (!p || p.control.owner !== req.user.uuid)
            return reply.code(404).send({ error: "Stream not found" });
          req.hostingStream = p;
        },
      ],
    },
    (ws, req) => {
      const p = req.hostingStream;
      if (pending.get(req.params.id) !== p) {
        ws.close();
        return;
      }
      pending.delete(req.params.id);
      clearTimeout(p.timer);
      const socket = p.socket;
      socket.hostingControl = p.control;
      if (socket.destroyed) {
        ws.close();
        return;
      }
      socket.setTimeout(120000); // also bounds stalled connections
      const send = (chunk) => {
        socket.pause();
        let offset = 0;
        const next = () => {
          if (ws.readyState !== 1) {
            socket.destroy();
            return;
          }
          if (offset >= chunk.length) {
            socket.resume();
            return;
          }
          const part = chunk.subarray(offset, offset + 4096);
          offset += part.length;
          ws.send(part, { binary: true }, (err) => {
            if (err) socket.destroy();
            else next();
          });
        };
        next();
      };
      socket.on("data", send);
      socket.on("close", () => ws.close());
      ws.on("message", (data, binary) => {
        if (!binary) {
          ws.close(1003);
          return;
        }
        if (!socket.write(data)) ws.pause();
      });
      socket.on("drain", () => ws.resume());
      ws.on("close", () => socket.destroy());
      ws.on("error", () => socket.destroy());
      send(p.prefix);
    },
  );
}
