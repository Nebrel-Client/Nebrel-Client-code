import { readFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

/** Where launcher builds are published. Tag carries the version, e.g. `v0.2.0`. */
const CLIENT_RELEASES =
  "https://api.github.com/repos/Nebrel-Client/Nebrel-Client-code/releases/latest";

/** How long a fetched release stays good before we ask GitHub again. */
const RELEASE_TTL_MS = 5 * 60 * 1000;

/**
 * Installer asset name per platform. Fixed names rather than the ones Tauri
 * generates, because those carry the version and would change every release.
 * Each one needs a sibling `<name>.sig` or the update is refused.
 */
const INSTALLER_ASSET = {
  windows: "nebrelclient-release.exe",
  darwin: "nebrelclient-release.app.tar.gz",
  linux: "nebrelclient-release.AppImage",
  debian: "nebrelclient-release.deb",
};

/**
 * Architectures each fixed asset is actually built for. One name per platform
 * means the name cannot say which architecture it is, so it is pinned here
 * instead: without this we would hand an x64 installer to an ARM machine.
 */
const INSTALLER_ARCH = {
  windows: ["x86_64"],
  darwin: ["x86_64", "aarch64"],
  linux: ["x86_64"],
  debian: ["x86_64"],
};

let releaseCache = { at: 0, release: null };

/**
 * Pack and version metadata. Backed by JSON files on disk for now, which is
 * enough until there is an admin interface worth writing.
 */
export default async function launcherRoutes(app, options = {}) {
  const getRelease = options.getRelease ?? latestClientRelease;
  const signatureFetch = options.signatureFetch ?? fetch;
  const dataDir = options.dataDir ?? DATA_DIR;
  const readData = (name, fallback) => readJson(name, fallback, dataDir);

  app.get("/launcher/files/:filename", async (request, reply) => {
    const name = request.params.filename;
    if (!/^nebrelclient-(26\.1(?:\.[12])?|26\.2)\.jar$/.test(name))
      return reply.code(404).send({error: "Unknown client file"});
    try {
      const data = await readFile(path.join(dataDir, "mods", name));
      return reply.type("application/java-archive").header("Cache-Control", "public, max-age=300").send(data);
    } catch (error) {
      if (error.code === "ENOENT") return reply.code(404).send({error: "Client file not installed"});
      throw error;
    }
  });
  app.get("/launcher/versions-v3", async () => readData("versions-v3.json", { profiles: [] }));

  app.get("/launcher/modpacks-v3", async () => readData("modpacks-v3.json", { packs: {} }));

  app.get("/launcher/pack/:packId", async (request, reply) => {
    const packs = await readData("modpacks-v3.json", { packs: {} });
    const pack = packs.packs?.[request.params.packId];

    if (!pack) {
      return reply.code(404).send({ error: "unknown pack" });
    }
    return pack;
  });

  app.get("/launcher/releases-v2", async () => readData("releases-v2.json", { releases: [] }));

  /**
   * Update manifest for the launcher itself. The client calls this with its own
   * version and expects either 204 (already current) or a Tauri update
   * manifest. The actual installer lives on the GitHub release; we only tell
   * the client which version exists and where to get it.
   */
  app.get("/launcher/releases-v2/:target/:arch/:currentVersion", async (request, reply) => {
    const { target, arch, currentVersion } = request.params;
    if (!["windows", "darwin", "linux", "debian"].includes(target) || !["x86_64", "aarch64", "i686"].includes(arch)) return reply.code(204).send();

    let release;
    try {
      release = await getRelease();
    } catch (error) {
      request.log.error({ err: error }, "Could not reach the release feed");
      return reply.code(503).send({ error: "Update feed unavailable" });
    }

    if (!release) return reply.code(204).send();

    const version = release.tag_name?.replace(/^v/, "");
    if (!version || !isNewer(version, currentVersion)) return reply.code(204).send();

    const assetName = INSTALLER_ASSET[target];
    if (!assetName || !INSTALLER_ARCH[target]?.includes(arch)) return reply.code(204).send();

    const assets = release.assets ?? [];
    const installer = assets.find((asset) => asset.name === assetName);
    const signatureAsset = installer
      ? assets.find((asset) => asset.name === `${assetName}.sig`)
      : null;

    // Tauri refuses an unsigned manifest, so an unsigned release is no release.
    if (!installer || !signatureAsset) {
      request.log.warn(
        { version, target, expected: assetName, signed: Boolean(signatureAsset) },
        "Release is missing the installer or its signature for this target",
      );
      return reply.code(204).send();
    }

    let signature;
    try {
      const response = await signatureFetch(signatureAsset.browser_download_url, {signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error(`signature responded ${response.status}`);
      signature = (await response.text()).trim();
    } catch (error) {
      request.log.error({ err: error, version }, "Could not read release signature");
      return reply.code(503).send({ error: "Update feed unavailable" });
    }

    return {
      version,
      pub_date: release.published_at,
      notes: release.body ?? "",
      url: installer.browser_download_url,
      signature,
    };
  });
}

async function latestClientRelease() {
  if (releaseCache.at && Date.now() - releaseCache.at < RELEASE_TTL_MS) {
    return releaseCache.release;
  }

  const response = await fetch(CLIENT_RELEASES, {
    signal: AbortSignal.timeout(10000),
    headers: { accept: "application/vnd.github+json", "user-agent": "nebrel-backend" },
  });

  // No release published yet is a normal state, not a failure.
  if (response.status === 404) {
    releaseCache = { at: Date.now(), release: null };
    return null;
  }
  if (!response.ok) throw new Error(`GitHub responded ${response.status}`);

  const release = await response.json();
  releaseCache = { at: Date.now(), release };
  return release;
}

/**
 * Compares two dotted versions numerically, so 0.10.0 beats 0.9.0 where a
 * string comparison would not.
 */
export function isNewer(candidate, current) {
  const parse = (value) =>
    String(value)
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

  const a = parse(candidate);
  const b = parse(current);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

async function readJson(name, fallback, dataDir = DATA_DIR) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
