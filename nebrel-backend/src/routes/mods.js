import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_DIR = path.join(process.cwd(), "data", "nebrel-mod");

// Files launcher profiles pull down over HTTP (NoriskModSourceDefinition::Url
// in src-tauri/src/minecraft/downloads/norisk_pack_downloader.rs downloads
// any non-"bundled:" identifier as a direct URL), instead of shipping every
// mod update inside a new launcher installer.
//
// One jar per Minecraft *minor* line - 26.1's patches (26.1.1, 26.1.2) all
// resolve to the same 26.1 jar, since fabric.mod.json declares a "~26.1"
// dependency range that already covers them; only 26.2 needs its own build.
export default async function modsRoutes(app, { dir = DEFAULT_DIR } = {}) {
  for (const file of ["nebrel-mod-26.1.jar", "nebrel-mod-26.2.jar"]) {
    app.get(`/mods/nebrel-mod/${file}`, async (request, reply) => {
      try {
        const bytes = await readFile(path.join(dir, file));
        reply.type("application/java-archive").header("cache-control", "public, max-age=3600");
        return bytes;
      } catch {
        return reply.code(404).send({ error: `${file} is not on the server yet - add it under data/nebrel-mod/` });
      }
    });
  }
}
