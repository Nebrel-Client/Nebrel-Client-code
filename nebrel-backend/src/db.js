import pg from "pg";
import Redis from "ioredis";
import { env } from "./env.js";
export const pool = new pg.Pool({ connectionString:env.databaseUrl, max:10, connectionTimeoutMillis:10000 });
export const redis = new Redis(env.redisUrl,{ lazyConnect:true, maxRetriesPerRequest:2 });
redis.on("error",()=>console.error("Redis connection unavailable"));
export async function query(text,params) { return (await pool.query(text,params)).rows; }
export async function transaction(work) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await work(async(text,params)=>(await client.query(text,params)).rows);
    await client.query("COMMIT"); return result;
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function upsertUser(uuid,username,hwid) {
  await query(`INSERT INTO users(uuid,username,hwid) VALUES($1,$2,$3) ON CONFLICT(uuid) DO UPDATE
    SET username=EXCLUDED.username,hwid=COALESCE(EXCLUDED.hwid,users.hwid),last_seen=now()`,[uuid,username,hwid ?? null]);
}
