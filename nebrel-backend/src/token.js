import jwt from "jsonwebtoken";
import { env } from "./env.js";

export function issueToken(username, uuid) {
  return jwt.sign({ username, uuid }, env.jwtSecret, { algorithm:"HS256", expiresIn:env.tokenTtl });
}
export function verifyToken(value) {
  const claims=jwt.verify(value,env.jwtSecret,{algorithms:["HS256"]});
  if(typeof claims!=="object" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.uuid ?? "") || typeof claims.username!=="string" || !Number.isFinite(claims.exp)) throw new Error("Invalid identity");
  return {...claims,uuid:claims.uuid.toLowerCase()};
}
export async function requireAuth(request,reply) {
  const header=request.headers.authorization ?? "";
  try {
    if(!header.startsWith("Bearer ")) throw new Error("Missing token");
    request.user=verifyToken(header.slice(7));
  } catch { return reply.code(401).send({error:"A valid Nebrel login is required"}); }
}
