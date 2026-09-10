import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
process.env.REDIS_URL='redis://localhost:1';
process.env.JWT_SECRET='a'.repeat(96);
process.env.DATABASE_URL='postgres://test:test@localhost:1/test';
const {default:authRoutes}=await import('../src/routes/auth.js');
const {verifyToken}=await import('../src/token.js');
test('Mojang login verifies ownership, expires challenges and rejects replay', async()=>{
  const ids=new Set(); let profile={id:'1234567890abcdef1234567890abcdef',name:'Alice'}; let saved=0;
  const app=Fastify();
  await app.register(authRoutes,{storage:{set:async key=>ids.add(key),del:async key=>Number(ids.delete(key))},
    saveUser:async()=>{saved++;},sessionFetch:async()=>({status:200,json:async()=>profile})});
  try {
    const challenge=async()=>(await app.inject({method:'POST',url:'/launcher/auth/request-server-id'})).json().serverId;
    const login=id=>app.inject({method:'POST',url:`/launcher/auth/validate/v2?username=Alice&server_id=${id}`});
    const id=await challenge(); const valid=await login(id);
    assert.equal(valid.statusCode,200);
    assert.equal(verifyToken(valid.json().value).uuid,'12345678-90ab-cdef-1234-567890abcdef');
    assert.equal((await login(id)).statusCode,401); assert.equal(saved,1);
    const expired=await challenge(); ids.clear(); assert.equal((await login(expired)).statusCode,401);
    profile={id:'1234567890abcdef1234567890abcdef',name:'OtherPlayer'};
    assert.equal((await login(await challenge())).statusCode,401); assert.equal(saved,1);
    profile={id:'invalid',name:'Alice'};
    assert.equal((await login(await challenge())).statusCode,401); assert.equal(saved,1);
  } finally {await app.close();}
});
