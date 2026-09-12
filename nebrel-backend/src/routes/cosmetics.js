import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import cors from "@fastify/cors";
import { requireAuth } from "../token.js";
import { fail, uuid } from "../social.js";

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), "data", "cape-templates");
const MAX_CAPE_BYTES = 2 * 1024 * 1024; // generous for a cape texture; keeps uploads off disk-filling territory

const dto = (row) => ({
  _id: row.hash,
  accepted: row.review_state === "ACCEPTED",
  uses: row.uses,
  firstSeen: row.owner_uuid,
  moderatorMessage: row.moderator_message,
  creationDate: new Date(row.created_at).getTime(),
  elytra: row.elytra,
  blurHash: row.blur_hash ?? undefined,
});

const isPng = (buf) =>
  buf.length > 8 &&
  buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
  buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;

/**
 * Cape/cosmetic hosting, served from our own database instead of a CDN.
 * Mounted under /api/v1/cosmetics to match the Rust client's `CapeApi::get_api_base`.
 */
export default async function cosmeticsRoutes(app, { query, transaction, templateDir = DEFAULT_TEMPLATE_DIR } = {}) {
  // The image/template routes are loaded by <img crossOrigin="anonymous">
  // (CapeImage.tsx draws them into a canvas, which needs that attribute to
  // avoid tainting it) - without a CORS response the browser refuses the
  // load outright instead of just restricting pixel access, which is what
  // was actually behind every cape thumbnail showing "Error".
  await app.register(cors, { origin: true, methods: ["GET"] });

  // Raw-PNG upload body: the launcher posts bytes with no (or a generic)
  // Content-Type, so every content type in this plugin is read as a buffer.
  // Only the upload route actually has a body; GET/DELETE routes ignore it.
  app.addContentTypeParser("*", { parseAs: "buffer" }, (req, body, done) => done(null, body));

  app.get("/cosmetics/cape/browse", { preHandler: requireAuth }, async (request) => {
    const q = request.query ?? {};
    const page = Math.max(0, parseInt(q.page, 10) || 0);
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 20));
    const conditions = ["review_state = 'ACCEPTED'"];
    const params = [];
    if (q.filterHasElytra === "true" || q.filterHasElytra === "false") {
      params.push(q.filterHasElytra === "true");
      conditions.push(`elytra = $${params.length}`);
    }
    if (typeof q.filterCreator === "string") {
      params.push(uuid(q.filterCreator));
      conditions.push(`owner_uuid = $${params.length}`);
    }
    if (q.timeFrame === "weekly" || q.timeFrame === "monthly") {
      conditions.push(`created_at > now() - interval '1 ${q.timeFrame === "weekly" ? "week" : "month"}'`);
    }
    const order = q.sortBy === "oldest" ? "created_at ASC" : q.sortBy === "mostUsed" ? "uses DESC, created_at DESC" : "created_at DESC";
    const where = conditions.join(" AND ");

    const [{ count }] = await query(`SELECT count(*)::int AS count FROM cosmetic_capes WHERE ${where}`, params);
    params.push(pageSize, page * pageSize);
    const rows = await query(
      `SELECT * FROM cosmetic_capes WHERE ${where} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      capes: rows.map(dto),
      pagination: {
        currentPage: page,
        pageSize,
        totalItems: count,
        totalPages: Math.max(1, Math.ceil(count / pageSize)),
      },
    };
  });

  // Public, unauthenticated lookup: the Minecraft mod isn't logged into a
  // Nebrel account, it just sees a player's UUID in the world and needs to
  // ask "does this person have a cape". A UUID isn't a secret - this is the
  // same trust model as Mojang's own public profile/skin lookup.
  app.get("/cosmetics/cape/public/:uuid", async (request, reply) => {
    let playerUuid;
    try { playerUuid = uuid(request.params.uuid); } catch { return reply.code(400).send({ error: "Invalid UUID" }); }
    const [user] = await query("SELECT equipped_cape FROM users WHERE uuid = $1", [playerUuid]);
    if (!user?.equipped_cape) return reply.code(204).send();
    const [cape] = await query(
      "SELECT hash, elytra FROM cosmetic_capes WHERE hash = $1 AND review_state = 'ACCEPTED'",
      [user.equipped_cape],
    );
    if (!cape) return reply.code(204).send();
    reply.header("cache-control", "public, max-age=60");
    return { hash: cape.hash, elytra: cape.elytra, imageUrl: `/api/v1/cosmetics/cape/image/prod/${cape.hash}.png` };
  });

  app.get("/cosmetics/cape/user/:uuid", { preHandler: requireAuth }, async (request) => {
    const playerUuid = uuid(request.params.uuid);
    const [user] = await query("SELECT equipped_cape FROM users WHERE uuid = $1", [playerUuid]);
    if (!user?.equipped_cape) return [];
    const [cape] = await query(
      "SELECT * FROM cosmetic_capes WHERE hash = $1 AND review_state = 'ACCEPTED'",
      [user.equipped_cape],
    );
    return cape ? [dto(cape)] : [];
  });

  app.get("/cosmetics/cape/owned/list", { preHandler: requireAuth }, async (request) => {
    const rows = await query("SELECT * FROM cosmetic_capes WHERE owner_uuid = $1 ORDER BY created_at DESC", [request.user.uuid]);
    const grouped = { ACCEPTED: [], IN_REVIEW: [], DENIED: [] };
    for (const row of rows) grouped[row.review_state].push(dto(row));
    return grouped;
  });

  app.get("/cosmetics/cape/many", { preHandler: requireAuth }, async (request) => {
    const hashes = String(request.query.hash ?? "").split(",").filter(Boolean).slice(0, 100);
    if (!hashes.length) return [];
    const rows = await query(
      "SELECT * FROM cosmetic_capes WHERE hash = ANY($1) AND review_state = 'ACCEPTED'",
      [hashes],
    );
    return rows.map(dto);
  });

  app.post(
    "/cosmetics/cape",
    { preHandler: requireAuth, bodyLimit: MAX_CAPE_BYTES },
    async (request, reply) => {
      const image = request.body;
      if (!Buffer.isBuffer(image) || !image.length) return reply.code(400).send({ error: "Missing image body" });
      if (image.length > MAX_CAPE_BYTES) return reply.code(413).send({ error: "Cape image too large" });
      if (!isPng(image)) return reply.code(400).send({ error: "Cape image must be a PNG" });

      const hash = crypto.createHash("sha256").update(image).digest("hex").slice(0, 32);
      const elytra = request.query.elytra !== "false";
      // Re-uploading identical bytes hashes to the same row. Refresh it
      // (image + back to review) instead of a silent no-op, so a cape that
      // got stored broken by some earlier bug isn't stuck broken forever -
      // the only way to fix it would otherwise be a manual DB edit.
      await query(
        `INSERT INTO cosmetic_capes(hash, owner_uuid, image, elytra) VALUES($1,$2,$3,$4)
         ON CONFLICT(hash) DO UPDATE SET image = EXCLUDED.image, elytra = EXCLUDED.elytra, review_state = 'IN_REVIEW'
         WHERE cosmetic_capes.owner_uuid = EXCLUDED.owner_uuid`,
        [hash, request.user.uuid, image, elytra],
      );
      reply.type("text/plain");
      return hash;
    },
  );

  app.post("/cosmetics/cape/:hash/equip", { preHandler: requireAuth }, async (request, reply) => {
    const [cape] = await query(
      "SELECT hash FROM cosmetic_capes WHERE hash = $1 AND owner_uuid = $2 AND review_state = 'ACCEPTED'",
      [request.params.hash, request.user.uuid],
    );
    if (!cape) return reply.code(404).send({ error: "Cape not found or not yours to equip" });
    await query("UPDATE users SET equipped_cape = $1 WHERE uuid = $2", [cape.hash, request.user.uuid]);
    return { ok: true };
  });

  app.delete("/cosmetics/cape/unequip", { preHandler: requireAuth }, async (request) => {
    await query("UPDATE users SET equipped_cape = NULL WHERE uuid = $1", [request.user.uuid]);
    return { ok: true };
  });

  app.delete("/cosmetics/cape/:hash", { preHandler: requireAuth }, async (request, reply) => {
    const rows = await query(
      "DELETE FROM cosmetic_capes WHERE hash = $1 AND owner_uuid = $2 RETURNING hash",
      [request.params.hash, request.user.uuid],
    );
    if (!rows.length) return reply.code(404).send({ error: "Cape not found" });
    return { ok: true };
  });

  app.put("/cosmetics/cape/favorite/:hash", { preHandler: requireAuth }, async (request) => {
    await transaction(async (q) => {
      const [cape] = await q("SELECT hash FROM cosmetic_capes WHERE hash = $1 AND review_state = 'ACCEPTED'", [request.params.hash]);
      if (!cape) fail(404, "Cape not found");
      await q("INSERT INTO cape_favorites(uuid, cape_hash) VALUES($1,$2) ON CONFLICT DO NOTHING", [request.user.uuid, cape.hash]);
    });
    const rows = await query("SELECT cape_hash FROM cape_favorites WHERE uuid = $1", [request.user.uuid]);
    return rows.map((r) => r.cape_hash);
  });

  app.delete("/cosmetics/cape/favorite/:hash", { preHandler: requireAuth }, async (request) => {
    await query("DELETE FROM cape_favorites WHERE uuid = $1 AND cape_hash = $2", [request.user.uuid, request.params.hash]);
    const rows = await query("SELECT cape_hash FROM cape_favorites WHERE uuid = $1", [request.user.uuid]);
    return rows.map((r) => r.cape_hash);
  });

  // Images are drawn straight into a <canvas>/<img>, which never sends an
  // Authorization header, so these two are intentionally public - same trust
  // model the old CDN paths had (an unguessable hash instead of a real ACL).
  app.get("/cosmetics/cape/image/prod/:file", async (request, reply) => {
    const hash = request.params.file.replace(/\.png$/i, "");
    const [cape] = await query("SELECT image FROM cosmetic_capes WHERE hash = $1 AND review_state = 'ACCEPTED'", [hash]);
    if (!cape) return reply.code(404).send();
    reply.type("image/png").header("cache-control", "public, max-age=86400");
    return cape.image;
  });

  app.get("/cosmetics/cape/image/review/:file", async (request, reply) => {
    const hash = request.params.file.replace(/\.png$/i, "");
    const [cape] = await query("SELECT image FROM cosmetic_capes WHERE hash = $1", [hash]);
    if (!cape) return reply.code(404).send();
    reply.type("image/png").header("cache-control", "no-store");
    return cape.image;
  });

  // The actual template artwork (a blank cape UV guide) is a design asset,
  // not something to fabricate here - drop template.png / template_no_elytra.png
  // into data/cape-templates/ and these start serving them.
  for (const file of ["template.png", "template_no_elytra.png"]) {
    app.get(`/cosmetics/cape/${file}`, async (request, reply) => {
      try {
        const bytes = await readFile(path.join(templateDir, file));
        reply.type("image/png").header("cache-control", "public, max-age=86400");
        return bytes;
      } catch {
        return reply.code(404).send({ error: `${file} is not on the server yet - add it under data/cape-templates/` });
      }
    });
  }
}
