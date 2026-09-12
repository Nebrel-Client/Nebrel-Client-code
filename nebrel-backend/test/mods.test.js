import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
const { default: mods } = await import("../src/routes/mods.js");

test("serves a mod jar when present, and a clear 404 when it isn't", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nebrel-mod-"));
  writeFileSync(path.join(dir, "nebrel-mod-26.1.jar"), Buffer.from("fake jar bytes"));

  const app = Fastify();
  await app.register(mods, { dir });
  await app.ready();

  const present = await app.inject({ method: "GET", url: "/mods/nebrel-mod/nebrel-mod-26.1.jar" });
  assert.equal(present.statusCode, 200);
  assert.equal(present.headers["content-type"], "application/java-archive");
  assert.equal(present.body, "fake jar bytes");

  const missing = await app.inject({ method: "GET", url: "/mods/nebrel-mod/nebrel-mod-26.2.jar" });
  assert.equal(missing.statusCode, 404);
  assert.match(missing.json().error, /data\/nebrel-mod/);

  await app.close();
});
