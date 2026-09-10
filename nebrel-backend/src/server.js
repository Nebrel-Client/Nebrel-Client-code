import { readFile } from "node:fs/promises";
import { env } from "./env.js";
import { pool,redis,transaction } from "./db.js";
import { buildApp } from "./app.js";

// Apply additive migrations before accepting requests, including existing installations.
try {
  const schema=await readFile(new URL("../schema.sql",import.meta.url),"utf8");
  await transaction(async q=>{await q("SELECT pg_advisory_xact_lock(734394000)");await q(schema);});
  await redis.connect();
  await redis.ping();
  const app=await buildApp();
  let stopping=false;
  const shutdown=async()=>{if(stopping)return;stopping=true;await app.close();await pool.end();await redis.quit();};
  process.on("SIGTERM",()=>shutdown().catch(()=>process.exit(1)));
  process.on("SIGINT",()=>shutdown().catch(()=>process.exit(1)));
  await app.listen({port:env.port,host:env.host});
} catch(error) {
  console.error("Backend startup failed. Check database/Redis access and schema compatibility.",error.code ?? error.name);
  await pool.end(); redis.disconnect(); process.exitCode=1;
}
