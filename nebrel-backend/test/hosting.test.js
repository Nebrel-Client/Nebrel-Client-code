import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { PGlite } from "@electric-sql/pglite";
process.env.JWT_SECRET = "h".repeat(96);
process.env.DATABASE_URL = "postgres://test:test@localhost:1/test";
process.env.REDIS_URL = "redis://localhost:1";
const {
  default: hosting,
  handshakeHost,
  validSlug,
} = await import("../src/routes/hosting.js");
const { issueToken } = await import("../src/token.js");
const me = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
function vint(n) {
  const a = [];
  do {
    let b = n & 127;
    n >>>= 7;
    if (n) b |= 128;
    a.push(b);
  } while (n);
  return Buffer.from(a);
}
function handshake(host) {
  const h = Buffer.from(host),
    body = Buffer.concat([
      vint(0),
      vint(767),
      vint(h.length),
      h,
      Buffer.from([0x63, 0xdd]),
      vint(2),
    ]);
  return Buffer.concat([vint(body.length), body]);
}
test("Minecraft host parsing handles fragmented packets and rejects invalid handshakes", () => {
  const data = handshake("pauls-server.nebrel.de");
  for (let i = 0; i < data.length; i++)
    assert.equal(handshakeHost(data.subarray(0, i)), null);
  assert.equal(handshakeHost(data), "pauls-server.nebrel.de");
  assert.throws(() => handshakeHost(Buffer.from([255, 255, 255, 255, 255])));
  for (const slug of [
    "api",
    "www",
    "x",
    "-abc",
    "abc-",
    "a.b",
    "../etc",
    "Aaa",
  ])
    assert.equal(validSlug(slug), false);
  assert.equal(validSlug("pauls-server"), true);
});
test(
  "hosting reservations enforce ownership and tunnel relays actual TCP bytes",
  { timeout: 30000 },
  async () => {
    const db = new PGlite();
    const app = Fastify();
    const sockets = [];
    const allocator = net.createServer();
    allocator.listen(0, "127.0.0.1");
    await once(allocator, "listening");
    const port = allocator.address().port;
    await new Promise((r) => allocator.close(r));
    try {
      await db.exec(
        await readFile(new URL("../schema.sql", import.meta.url), "utf8"),
      );
      await db.query("INSERT INTO users(uuid,username) VALUES($1,$2),($3,$4)", [
        me,
        "Paul",
        other,
        "Other",
      ]);
      const database = {
        query: async (...a) => (await db.query(...a)).rows,
        transaction: (fn) =>
          db.transaction((tx) => fn(async (...a) => (await tx.query(...a)).rows)),
      };
      await app.register(websocket, { options: { maxPayload: 8192 } });
      await app.register(hosting, { database, port, host: "127.0.0.1" });
      await app.listen({ port: 0, host: "127.0.0.1" });
      const call = (method, url, payload, user = me) =>
        app.inject({
          method,
          url,
          payload,
          headers: { authorization: `Bearer ${issueToken("Paul", user)}` },
        });
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/hosting/servers",
            payload: { id, slug: "pauls-server" },
          })
        ).statusCode,
        401,
      );
      assert.equal(
        (await call("POST", "/hosting/servers", { id, slug: "api" }))
          .statusCode,
        400,
      );
      assert.equal(
        (await call("POST", "/hosting/servers", { id, slug: "pauls-server" }))
          .statusCode,
        200,
      );
      assert.equal(
        (
          await call(
            "POST",
            "/hosting/servers",
            { id, slug: "pauls-server" },
            other,
          )
        ).statusCode,
        409,
      );
      assert.equal(
        (await call("GET", "/hosting/servers", undefined, other)).json().length,
        0,
      );
      assert.equal(
        (await call("DELETE", `/hosting/servers/${id}`, undefined, other))
          .statusCode,
        404,
      );
      assert.equal((await call("POST", "/hosting/servers", { id: "44444444-4444-4444-8444-444444444444", slug: "pauls-server" }, other)).statusCode, 409);
    for (let n = 0; n < 5; n++) {
      assert.equal((await call("POST", "/hosting/servers", { id: `55555555-5555-4555-8555-55555555555${n}`, slug: `other-server-${n}` }, other)).statusCode, 200);
    }
    assert.equal((await call("POST", "/hosting/servers", { id: "66666666-6666-4666-8666-666666666666", slug: "one-too-many" }, other)).statusCode, 409);
    const base = `ws://127.0.0.1:${app.server.address().port}`;
      const control = new WebSocket(`${base}/hosting/control/${id}`, {
        headers: { authorization: `Bearer ${issueToken("Paul", me)}` },
      });
      sockets.push(control);
      const ready = once(control, "message");
      await once(control, "open");
      assert.equal(JSON.parse((await ready)[0]).type, "ready");
      assert.equal(
        (await call("GET", "/hosting/servers")).json()[0].online,
        true,
      );
      const tcp = net.connect(port, "127.0.0.1");
      sockets.push(tcp);
      await once(tcp, "connect");
      const request = once(control, "message");
      const first = handshake("pauls-server.nebrel.de");
      tcp.write(first.subarray(0, 4));
      tcp.write(first.subarray(4));
      const streamId = JSON.parse((await request)[0]).id;
      const denied = new WebSocket(`${base}/hosting/stream/${streamId}`, {
        headers: { authorization: `Bearer ${issueToken("Other", other)}` },
      });
      denied.on("error", () => {});
      sockets.push(denied);
      const rejection = await new Promise((resolve) =>
        denied.once("unexpected-response", (_, res) => {
          resolve(res.statusCode);
          res.destroy();
          denied.terminate();
        }),
      );
      assert.equal(rejection, 404);
      const stream = new WebSocket(`${base}/hosting/stream/${streamId}`, {
        headers: { authorization: `Bearer ${issueToken("Paul", me)}` },
      });
      sockets.push(stream);
      stream.on("message", (data, binary) => {
        assert.equal(binary, true);
        stream.send(data, { binary: true });
      });
      const chunks = [];
      let received = 0;
      const extra = Buffer.alloc(200000, 83),
        expected = Buffer.concat([first, extra]);
      const echo = new Promise((resolve) =>
        tcp.on("data", (data) => {
          chunks.push(data);
          received += data.length;
          if (received === expected.length) resolve(Buffer.concat(chunks));
        }),
      );
      await once(stream, "open");
      tcp.write(extra);
      assert.deepEqual(await echo, expected);
      const closed = once(tcp, "close");
      assert.equal(
        (await call("DELETE", `/hosting/servers/${id}`)).statusCode,
        200,
      );
      await closed;
    } finally {
      for (const s of sockets) {
        if (s instanceof WebSocket) s.terminate();
        else s.destroy();
      }
      await app.close();
      await db.close();
    }
  },
);
