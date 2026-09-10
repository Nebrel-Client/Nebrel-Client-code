import Fastify from "fastify";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { createSocial } from "./social.js";
import socialRoutes from "./routes/social.js";
import friendsWebsocket from "./routes/friends-ws.js";
import authRoutes from "./routes/auth.js";
import launcherRoutes from "./routes/launcher.js";
import coreRoutes from "./routes/core.js";
import * as db from "./db.js";

export async function buildApp({database=db,logger=true,includeCore=true}={}) {
  // Do not log query strings (login challenges, HWIDs, legacy tokens) or bodies.
  const app=Fastify({bodyLimit:16384,logger:logger ? {
    serializers:{req:req=>({method:req.method,url:req.url?.split('?')[0]}),err:err=>({type:err.name,statusCode:err.statusCode})},
    redact:["req.headers.authorization","req.query","req.body"]
  }:false});
  await app.register(websocket,{options:{maxPayload:8192}});
  await app.register(rateLimit,{max:1000,timeWindow:"1 minute"});
  const social=createSocial(database);
  app.decorate("social",social);
  app.setErrorHandler((error,request,reply)=>{
    const status=error.statusCode ?? 500;
    if(status>=500) request.log.error({err:error},"Backend request failed");
    reply.code(status).send({error:status>=500 ? "Backend temporarily unavailable" : error.message});
  });
  app.get("/health",async()=>{await database.query("SELECT 1"); if(includeCore) await db.redis.ping(); return {ok:true};});
  await app.register(async api=> {
    if(includeCore) {await api.register(authRoutes); await api.register(launcherRoutes); await api.register(coreRoutes);}
    await api.register(socialRoutes,{social});
    await api.register(friendsWebsocket,{social});
  },{prefix:"/api/v1"});
  app.addHook("preClose",async()=>social.close());
  return app;
}
