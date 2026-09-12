import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
process.env.JWT_SECRET = "h".repeat(96);
process.env.DATABASE_URL = "postgres://test:test@localhost:1/test";
process.env.REDIS_URL = "redis://localhost:1";
const { default: cosmetics } = await import("../src/routes/cosmetics.js");
const { issueToken } = await import("../src/token.js");

const me = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";

// Smallest possible valid PNG (1x1, transparent) - enough to pass the
// magic-byte check without needing a real cape texture.
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function setup() {
  const db = new PGlite();
  await db.exec(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));
  await db.query("INSERT INTO users(uuid,username) VALUES($1,$2),($3,$4)", [me, "Paul", other, "Other"]);
  const database = {
    query: async (...a) => (await db.query(...a)).rows,
    transaction: (fn) => db.transaction((tx) => fn(async (...a) => (await tx.query(...a)).rows)),
  };
  const app = Fastify();
  // An empty temp dir, not the real data/cape-templates/ (which may or may not
  // have real artwork on this machine) - keeps this test independent of that.
  const templateDir = mkdtempSync(path.join(tmpdir(), "cape-templates-"));
  await app.register(cosmetics, { query: database.query, transaction: database.transaction, templateDir });
  await app.ready();
  const call = (method, url, payload, user = me) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${issueToken("Paul", user)}` } });
  return { app, db, call };
}

test("cape upload, review, and browse visibility", async () => {
  const { app, db, call } = await setup();

  // No auth at all is rejected.
  assert.equal((await app.inject({ method: "POST", url: "/cosmetics/cape", payload: onePixelPng })).statusCode, 401);

  const upload = await call("POST", "/cosmetics/cape", onePixelPng);
  assert.equal(upload.statusCode, 200);
  const hash = upload.body;
  assert.match(hash, /^[0-9a-f]{32}$/);

  // Fresh upload is pending review: visible to its owner, not in the public browse list.
  const owned = (await call("GET", "/cosmetics/cape/owned/list")).json();
  assert.equal(owned.IN_REVIEW.length, 1);
  assert.equal(owned.IN_REVIEW[0]._id, hash);
  assert.equal(owned.ACCEPTED.length, 0);
  const browseBefore = (await call("GET", "/cosmetics/cape/browse")).json();
  assert.equal(browseBefore.capes.length, 0);

  // A non-PNG body is rejected outright.
  assert.equal((await call("POST", "/cosmetics/cape", Buffer.from("not a png"))).statusCode, 400);

  // Simulate moderator approval (no review endpoint yet - direct DB write, as a human moderator's tool would do).
  await db.query("UPDATE cosmetic_capes SET review_state='ACCEPTED' WHERE hash=$1", [hash]);

  const browseAfter = (await call("GET", "/cosmetics/cape/browse")).json();
  assert.equal(browseAfter.capes.length, 1);
  assert.equal(browseAfter.pagination.totalItems, 1);

  const image = await call("GET", `/cosmetics/cape/image/prod/${hash}.png`);
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/png");
  assert.ok(Buffer.from(image.rawPayload).equals(onePixelPng));

  await app.close();
});

test("equip, unequip, favorites, and ownership boundaries", async () => {
  const { app, db, call } = await setup();
  const hash = (await call("POST", "/cosmetics/cape", onePixelPng)).body;
  await db.query("UPDATE cosmetic_capes SET review_state='ACCEPTED' WHERE hash=$1", [hash]);

  // Someone else cannot equip a cape they don't own.
  assert.equal((await call("POST", `/cosmetics/cape/${hash}/equip`, null, other)).statusCode, 404);

  assert.equal((await call("POST", `/cosmetics/cape/${hash}/equip`)).statusCode, 200);
  const equipped = (await call("GET", `/cosmetics/cape/user/${me}`)).json();
  assert.equal(equipped.length, 1);
  assert.equal(equipped[0]._id, hash);

  // Someone with no equipped cape gets an empty list, not an error.
  assert.deepEqual((await call("GET", `/cosmetics/cape/user/${other}`)).json(), []);

  // The public lookup (for the Minecraft mod, which has no Nebrel login) needs no auth header at all.
  const publicLookup = await app.inject({ method: "GET", url: `/cosmetics/cape/public/${me}` });
  assert.equal(publicLookup.statusCode, 200);
  assert.deepEqual(publicLookup.json(), { hash, elytra: true, imageUrl: `/api/v1/cosmetics/cape/image/prod/${hash}.png` });
  assert.equal((await app.inject({ method: "GET", url: `/cosmetics/cape/public/${other}` })).statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: "/cosmetics/cape/public/not-a-uuid" })).statusCode, 400);

  assert.equal((await call("DELETE", "/cosmetics/cape/unequip")).statusCode, 200);
  assert.deepEqual((await call("GET", `/cosmetics/cape/user/${me}`)).json(), []);

  const favorited = (await call("PUT", `/cosmetics/cape/favorite/${hash}`)).json();
  assert.deepEqual(favorited, [hash]);
  const unfavorited = (await call("DELETE", `/cosmetics/cape/favorite/${hash}`)).json();
  assert.deepEqual(unfavorited, []);

  // Deleting someone else's cape fails; deleting your own works.
  assert.equal((await call("DELETE", `/cosmetics/cape/${hash}`, null, other)).statusCode, 404);
  assert.equal((await call("DELETE", `/cosmetics/cape/${hash}`)).statusCode, 200);
  assert.deepEqual((await call("GET", "/cosmetics/cape/owned/list")).json().ACCEPTED, []);

  await app.close();
});

test("missing template files answer with a clear 404 instead of a silent CDN gap", async () => {
  const { app, call } = await setup();
  const res = await call("GET", "/cosmetics/cape/template.png");
  assert.equal(res.statusCode, 404);
  assert.match(res.json().error, /data\/cape-templates/);
  await app.close();
});
