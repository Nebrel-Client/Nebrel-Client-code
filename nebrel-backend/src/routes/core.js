import { query as databaseQuery } from "../db.js";
import { requireAuth } from "../token.js";
import { uuid } from "../social.js";

export default async function coreRoutes(app, { query = databaseQuery } = {}) {
  app.addHook("preHandler", requireAuth);
  app.get("/core/permissions", async request =>
    (await query("SELECT permission FROM user_permissions WHERE uuid = $1", [request.user.uuid])).map(row => row.permission));

  app.get("/core/user/info/:uuid", async (request, reply) => {
    const [user] = await query("SELECT uuid, username, created_at, last_seen FROM users WHERE uuid = $1", [uuid(request.params.uuid)]);
    if (!user) return reply.code(404).send({ error: "unknown user" });
    return { uuid: user.uuid, ign: user.username, lastSeen: user.last_seen };
  });

  app.get("/core/notifications", async request => {
    const rows = await query(`SELECT id, title, body, read_at, created_at FROM notifications
      WHERE uuid = $1 ORDER BY created_at DESC LIMIT 50`, [request.user.uuid]);
    return rows.map(row => ({
      _id: String(row.id), userId: request.user.uuid, seen: row.read_at !== null, deletionDate: null,
      notification: { type: "string", translationKey: null, args: {},
        fallback: [row.title, row.body].filter(Boolean).join("\n"), createdAt: new Date(row.created_at).toISOString() }
    }));
  });

  const markRead = async (request, reply) => {
    const id = request.query.notificationId;
    if (typeof id !== "string" || !/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
      return reply.code(400).send({error: "Invalid notification ID"});
    await query("UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE uuid = $1 AND id = $2", [request.user.uuid, id]);
    return { ok: true };
  };
  const markAll = async request => {
    await query("UPDATE notifications SET read_at = now() WHERE uuid = $1 AND read_at IS NULL", [request.user.uuid]);
    return { ok: true };
  };
  // Keep POST for existing callers and add the PUT methods used by the launcher.
  app.route({method: ["PUT", "POST"], url: "/core/notifications/read", handler: markRead});
  app.route({method: ["PUT", "POST"], url: "/core/notifications/read/all", handler: markAll});
  app.get("/core/stats/uniquePlayers24h", async () => {
    const [row] = await query("SELECT count(*)::int AS count FROM users WHERE last_seen > now() - interval '24 hours'");
    return { unique_players: row.count };
  });
}
