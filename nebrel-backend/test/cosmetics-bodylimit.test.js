import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
process.env.JWT_SECRET = "h".repeat(96);
process.env.DATABASE_URL = "postgres://test:test@localhost:1/test";
process.env.REDIS_URL = "redis://localhost:1";
const { default: cosmetics } = await import("../src/routes/cosmetics.js");
const { issueToken } = await import("../src/token.js");

const me = "11111111-1111-4111-8111-111111111111";

test("an upload bigger than the app's global 16KB bodyLimit still goes through whole", async () => {
  const db = new PGlite();
  await db.exec(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));
  await db.query("INSERT INTO users(uuid,username) VALUES($1,$2)", [me, "Paul"]);
  const database = {
    query: async (...a) => (await db.query(...a)).rows,
    transaction: (fn) => db.transaction((tx) => fn(async (...a) => (await tx.query(...a)).rows)),
  };

  // Mirror app.js exactly: a real global bodyLimit of 16384, cosmetics
  // registered as a sub-plugin, same as production.
  const app = Fastify({ bodyLimit: 16384 });
  await app.register(async (api) => {
    await api.register(cosmetics, { query: database.query, transaction: database.transaction });
  });
  await app.ready();

  // A PNG bigger than the 16KB global limit, well under the route's own 2MB
  // limit. Random (incompressible) pixel data so deflate can't shrink it
  // back under the threshold this test exists to exercise.
  const width = 200, height = 50;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  const zlib = await import("node:zlib");
  const idat = zlib.deflateSync(raw, { level: 0 });
  console.log("raw size", raw.length, "idat size", idat.length);

  function crc32(buf) {
    let c, t = crc32.t || (crc32.t = (() => { const a=[]; for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;a[n]=c>>>0;} return a; })());
    let crc = 0xffffffff; for (const b of buf) crc = t[(crc^b)&0xff]^(crc>>>8); return (crc^0xffffffff)>>>0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const tb = Buffer.from(type, "ascii");
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([len, tb, data, cb]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8]=8; ihdr[9]=6;
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
  console.log("full png size:", png.length);
  assert.ok(png.length > 16384, "test payload must exceed the global bodyLimit to be meaningful");

  const res = await app.inject({
    method: "POST",
    url: "/cosmetics/cape",
    payload: png,
    headers: { authorization: `Bearer ${issueToken("Paul", me)}` },
  });
  console.log("upload status:", res.statusCode, "body:", res.body);
  assert.equal(res.statusCode, 200);
  const hash = res.body;

  const imgRes = await app.inject({ method: "GET", url: `/cosmetics/cape/image/review/${hash}.png` });
  console.log("stored size:", imgRes.rawPayload.length, "original size:", png.length);
  assert.equal(imgRes.rawPayload.length, png.length, "stored image must match the uploaded size exactly - if this fails, the global bodyLimit truncated it");

  await app.close();
});
