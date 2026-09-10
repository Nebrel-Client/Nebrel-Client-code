import crypto from "node:crypto";
import { redis, upsertUser } from "../db.js";
import { issueToken } from "../token.js";

const SERVER_ID_TTL = 60;
const HAS_JOINED = "https://sessionserver.mojang.com/session/minecraft/hasJoined";

/**
 * Ownership of a Minecraft account is proven through Mojang, not through us.
 * We hand out a one-shot server id, the launcher authenticates against the
 * Mojang session server with it, and we then ask Mojang who did that.
 */
export default async function authRoutes(app, options = {}) {
  const storage = options.storage ?? redis;
  const saveUser = options.saveUser ?? upsertUser;
  const sessionFetch = options.sessionFetch ?? fetch;
  app.post("/launcher/auth/request-server-id", async () => {
    const serverId = `nbr-${crypto.randomBytes(12).toString("hex")}`;
    await storage.set(`serverid:${serverId}`, "1", "EX", SERVER_ID_TTL);
    return { server_id: serverId, expires_in: SERVER_ID_TTL };
  });

  app.post("/launcher/auth/validate/v2", async (request, reply) => {
    const { username, server_id: serverId, hwid } = request.query;

    if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,16}$/.test(username) ||
        typeof serverId !== "string" || !/^nbr-[0-9a-f]{24}$/.test(serverId) ||
        (hwid !== undefined && (typeof hwid !== "string" || hwid.length > 512))) {
      return reply.code(400).send({ error: "username and server_id are required" });
    }

    // Consume the id so a captured handshake cannot be replayed.
    const known = await storage.del(`serverid:${serverId}`);
    if (known !== 1) {
      return reply.code(401).send({ error: "unknown or expired server_id" });
    }

    const url = `${HAS_JOINED}?username=${encodeURIComponent(username)}&serverId=${encodeURIComponent(serverId)}`;
    const response = await sessionFetch(url, { signal: AbortSignal.timeout(10000) });

    // Mojang answers 204 with an empty body when the join did not happen.
    if (response.status !== 200) {
      return reply.code(401).send({ error: "session not verified by Mojang" });
    }

    const profile = await response.json();
    if (!/^[0-9a-f]{32}$/i.test(profile.id ?? "") ||
        typeof profile.name !== "string" || !/^[A-Za-z0-9_]{1,16}$/.test(profile.name) ||
        profile.name.toLowerCase() !== username.toLowerCase()) {
      return reply.code(401).send({ error: "invalid Minecraft identity" });
    }
    const uuid = formatUuid(profile.id.toLowerCase());

    await saveUser(uuid, profile.name, hwid);

    return { value: issueToken(profile.name, uuid) };
  });

  app.post("/launcher/auth/bridge/confirm", { preHandler: notImplemented }, async () => ({}));
}

/** Mojang returns the uuid without dashes, Postgres and the launcher want them. */
function formatUuid(raw) {
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20),
  ].join("-");
}

function notImplemented(request, reply, done) {
  reply.code(501).send({ error: "not implemented yet" });
  done();
}
