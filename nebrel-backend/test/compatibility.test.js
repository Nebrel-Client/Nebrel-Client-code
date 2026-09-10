import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
process.env.JWT_SECRET='a'.repeat(96);
process.env.DATABASE_URL='postgres://test:test@localhost:1/test';
process.env.REDIS_URL='redis://localhost:1';
const {default:coreRoutes}=await import('../src/routes/core.js');
const {default:launcherRoutes}=await import('../src/routes/launcher.js');
const {issueToken}=await import('../src/token.js');

test('launcher user DTO and notification read methods preserve account ownership',async()=>{
 const db=new PGlite(),app=Fastify();
 const me='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
 try {
  await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  await db.query("INSERT INTO users(uuid,username) VALUES($1,'Alice'),($2,'Bob')",[me,other]);
  await db.query("INSERT INTO notifications(uuid,title,body) VALUES($1,'Hello','Welcome'),($2,'Private','Bob only')",[me,other]);
  await app.register(coreRoutes,{query:async(q,p)=>(await db.query(q,p)).rows});
  const call=(method,url)=>app.inject({method,url,headers:{authorization:`Bearer ${issueToken('Alice',me)}`}});
  assert.equal((await call('GET',`/core/user/info/${me}`)).json().ign,'Alice');
  const list=(await call('GET','/core/notifications')).json();
  assert.equal(list.length,1);assert.equal(list[0].userId,me);assert.equal(list[0].seen,false);assert.equal(list[0].notification.type,'string');assert.equal(list[0].notification.fallback,'Hello\nWelcome');
  assert.equal((await call('PUT','/core/notifications/read?notificationId=2')).statusCode,200);
  assert.equal((await db.query('SELECT read_at FROM notifications WHERE id=2')).rows[0].read_at,null);
  assert.equal((await call('PUT','/core/notifications/read?notificationId=1')).statusCode,200);
  assert.equal((await call('GET','/core/notifications')).json()[0].seen,true);
  assert.equal((await call('PUT','/core/notifications/read/all')).statusCode,200);
  assert.equal((await call('PUT','/core/notifications/read?notificationId=invalid')).statusCode,400);
  assert.equal((await app.inject({url:'/core/notifications'})).statusCode,401);
 }finally{await app.close();await db.close();}
});

test('pack manifest points to downloadable client files; unrelated paths stay unavailable',async()=>{
 const app=Fastify();
 try{
  await app.register(launcherRoutes,{dataDir:fileURLToPath(new URL('../data/',import.meta.url))});
  const pack=(await app.inject({url:'/launcher/pack/nebrel-prod'})).json();
  for(const comp of Object.values(pack.mods[0].compatibility)){
   const p=new URL(comp.fabric.identifier).pathname.replace('/api/v1','');
   const r=await app.inject({url:p});assert.equal(r.statusCode,200);assert.equal(r.rawPayload.subarray(0,2).toString(),'PK');
   assert.equal(r.rawPayload.length,(await readFile(new URL('../data/mods/'+comp.fabric.filename,import.meta.url))).length);
  }
  assert.equal((await app.inject({url:'/launcher/files/package.json'})).statusCode,404);
 }finally{await app.close();}
});

test('updates only offer a signed installer for the requested architecture',async()=>{
 const app=Fastify();let signatures=0;
 try{
  await app.register(launcherRoutes,{getRelease:async()=>({tag_name:'v0.2.0',published_at:'2026-09-10T12:00:00Z',assets:[
   {name:'nebrelclient-release.exe',browser_download_url:'https://example.test/installer.exe'},
   {name:'nebrelclient-release.exe.sig',browser_download_url:'https://example.test/installer.exe.sig'}]}),
   signatureFetch:async()=>{signatures++;return {ok:true,text:async()=>'test-signature'}}});
  const r=await app.inject({url:'/launcher/releases-v2/windows/x86_64/0.1.0'});assert.equal(r.statusCode,200);assert.equal(r.json().signature,'test-signature');
  assert.equal((await app.inject({url:'/launcher/releases-v2/windows/aarch64/0.1.0'})).statusCode,204);
  assert.equal((await app.inject({url:'/launcher/releases-v2/windows/x86_64/0.2.0'})).statusCode,204);assert.equal(signatures,1);
 }finally{await app.close();}
});
