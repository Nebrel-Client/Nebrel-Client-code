import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
process.env.JWT_SECRET="a".repeat(96);
process.env.DATABASE_URL="postgres://test:test@127.0.0.1:1/test";
process.env.REDIS_URL="redis://127.0.0.1:1";
const {buildApp}=await import("../src/app.js");
const {issueToken}=await import("../src/token.js");
let db,app;
const request=(who,method,url,payload)=>app.inject({method,url:'/api/v1'+url,headers:{...(who?{authorization:`Bearer ${issueToken(who.name,who.id)}`} : {}),...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});
async function player(name) {const p={id:randomUUID(),name};await db.query('INSERT INTO users(uuid,username) VALUES($1,$2)',[p.id,name]);return p;}
async function friends(a,b) {assert.equal((await request(a,'POST',`/friends/${b.id}/add`)).statusCode,200);assert.equal((await request(b,'POST',`/friends/${a.id}/add`)).statusCode,200);}
before(async()=> {
  db=new PGlite();
  const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
  await db.exec(schema); await db.exec(schema); // Migration must be repeatable.
  app=await buildApp({logger:false,includeCore:false,database:{query:async(t,p)=>(await db.query(t,p)).rows,
    transaction:work=>db.transaction(tx=>work(async(t,p)=>(await tx.query(t,p)).rows))}});
  await app.ready();
});
after(async()=>{await app?.close();await db?.close();});

test('authentication, identity ownership and invalid inputs',async()=>{
  const a=await player('Alice'); const b=await player('Bob');
  assert.equal((await request(null,'GET','/friends/user')).statusCode,401);
  assert.equal((await request(a,'GET',`/friends/${b.id}`)).statusCode,403);
  assert.equal((await request(a,'POST','/friends/not-a-uuid/add')).statusCode,400);
  assert.equal((await request(a,'POST',`/friends/${a.id}/add`)).statusCode,400);
  assert.equal((await request(a,'POST',`/friends/${randomUUID()}/add`)).statusCode,404);
  assert.equal((await request(a,'POST','/friends/status','BOGUS')).statusCode,400);
});
test('request, acceptance, privacy, ping, withdrawal and removal',async()=>{
  const a=await player('RequestA'),b=await player('RequestB');
  assert.equal((await request(b,'PUT','/friends/privacy/allow-friend-requests',false)).statusCode,200);
  assert.equal((await request(a,'POST',`/friends/${b.id}/add`)).statusCode,403);
  await request(b,'PUT','/friends/privacy/allow-friend-requests',true);
  await request(a,'POST',`/friends/${b.id}/add`);
  await request(a,'POST',`/friends/${b.id}/add`);
  let list=(await request(b,'GET',`/friends/${b.id}`)).json();
  assert.equal(list.pending.length,1);assert.equal(list.pending[0].users[0].ign,'RequestA');
  assert.equal(list.pending[0].friendRequest.currentState,'PENDING');
  await request(b,'POST',`/friends/${a.id}/add`);
  list=(await request(a,'GET',`/friends/${a.id}`)).json();
  assert.equal(list.pending.length,0);assert.equal(list.friends[0].noriskUser.uuid,b.id);
  assert.equal(list.friends[0].onlineState,'OFFLINE');
  assert.equal((await request(a,'POST',`/friends/${b.id}/toggle-ping`)).json(),false);
  assert.equal((await request(a,'POST',`/friends/${b.id}/toggle-ping`)).json(),true);
  await request(a,'DELETE',`/friends/${b.id}/remove`);
  assert.equal((await request(b,'GET',`/friends/${b.id}`)).json().friends.length,0);
  await request(a,'POST',`/friends/${b.id}/add`);await request(a,'DELETE',`/friends/${b.id}/remove`);
  assert.equal((await request(b,'GET',`/friends/${b.id}`)).json().pending.length,0);
});
test('private messages enforce friendship, membership, authorship and pagination',async()=>{
  const a=await player('ChatA'),b=await player('ChatB'),c=await player('Outsider');
  assert.equal((await request(a,'GET',`/messaging/chat/private/${b.id}`)).statusCode,403);
  await friends(a,b);
  const room=(await request(a,'GET',`/messaging/chat/private/${b.id}`)).json();
  assert.equal((await request(b,'GET',`/messaging/chat/private/${a.id}`)).json()._id,room._id);
  assert.equal((await request(c,'GET',`/messaging/chat/${room._id}/messages`)).statusCode,404);
  assert.equal((await request(a,'POST',`/messaging/chat/${room._id}/messages`,{content:' '})).statusCode,400);
  const response=await request(a,'POST',`/messaging/chat/${room._id}/messages`,{content:'Hello Nebrel'});
  assert.equal(response.statusCode,200,response.body); const m=response.json();
  assert.equal(m.senderId,a.id);assert.equal(typeof m.sentAt,'number');
  assert.equal((await request(b,'GET','/messaging/chat/private')).json()[0].unreadMessages,1);
  assert.equal((await request(b,'PUT',`/messaging/message/${m._id}`,{content:'Hijack'})).statusCode,403);
  assert.equal((await request(c,'DELETE',`/messaging/message/${m._id}`)).statusCode,404);
  assert.equal((await request(b,'POST',`/messaging/chat/${room._id}/messages/received`,{messageId:m._id})).statusCode,200);
  assert.equal((await request(b,'GET','/messaging/chat/private')).json()[0].unreadMessages,0);
  assert.equal((await request(a,'PUT',`/messaging/message/${m._id}`,{content:'Edited'})).json().content,'Edited');
  assert.equal((await request(b,'POST',`/messaging/message/${m._id}/reaction`,{emoji:'👍'})).statusCode,200);
  let messages=(await request(a,'GET',`/messaging/chat/${room._id}/messages?page=0&limit=1`)).json();
  assert.equal(messages.length,1);assert.equal(messages[0].reactions[0].reactor,b.id);
  assert.equal((await request(a,'GET',`/messaging/chat/${room._id}/messages?limit=1000`)).statusCode,400);
  await request(a,'DELETE',`/messaging/message/${m._id}`);
  messages=(await request(b,'GET',`/messaging/chat/${room._id}/messages`)).json();
  assert.equal(messages[0].content,'');assert.ok(messages[0].deletedAt);assert.deepEqual(messages[0].reactions,[]);
  await request(a,'DELETE',`/friends/${b.id}/remove`);
  assert.equal((await request(b,'POST',`/messaging/chat/${room._id}/messages`,{content:'Still here'})).statusCode,403);
});
test('a reply cannot reference a different private conversation',async()=>{
  const a=await player('ReplyA'),b=await player('ReplyB'),c=await player('ReplyC');await friends(a,b);await friends(a,c);
  const ab=(await request(a,'GET',`/messaging/chat/private/${b.id}`)).json()._id;
  const ac=(await request(a,'GET',`/messaging/chat/private/${c.id}`)).json()._id;
  const parent=(await request(a,'POST',`/messaging/chat/${ab}/messages`,{content:'Private'})).json();
  assert.equal((await request(a,'POST',`/messaging/chat/${ac}/messages`,{content:'Leak',relatesTo:parent._id})).statusCode,400);
});
test('websocket binds to token, supports multiple devices and hides invisible status',async()=>{
  const a=await player('LiveA'),b=await player('LiveB');await friends(a,b);
  await assert.rejects(app.injectWS('/api/v1/core/ws?token=invalid'));
  const open=()=>app.injectWS(`/api/v1/core/ws?uuid=${b.id}`,{headers:{authorization:`Bearer ${issueToken(a.name,a.id)}`}});
  const first=await open(),second=await open();
  try {
    let list=(await request(b,'GET',`/friends/${b.id}`)).json();assert.equal(list.friends[0].onlineState,'ONLINE');
    await request(a,'POST','/friends/status','INVISIBLE');
    list=(await request(b,'GET',`/friends/${b.id}`)).json();assert.equal(list.friends[0].onlineState,'OFFLINE');
    await request(a,'POST','/friends/status','BUSY');
    first.close();
    list=(await request(b,'GET',`/friends/${b.id}`)).json();assert.equal(list.friends[0].onlineState,'BUSY');
    // Query UUID is ignored: the impersonated user remains disconnected.
    list=(await request(a,'GET',`/friends/${a.id}`)).json();assert.equal(list.friends[0].onlineState,'OFFLINE');
  } finally {first.terminate();second.terminate();}
});
test('live events use the launcher wire format and only reach the chat participants',async()=>{
  const a=await player('WireA'),b=await player('WireB'),c=await player('WireC');await friends(a,b);
  const sockets=await Promise.all([a,b,c].map(p=>app.injectWS('/api/v1/core/ws',{headers:{authorization:`Bearer ${issueToken(p.name,p.id)}`}})));
  const events=[[],[],[]];sockets.forEach((s,i)=>s.on('message',raw=>events[i].push(raw.toString())));
  try {
    const room=(await request(a,'GET',`/messaging/chat/private/${b.id}`)).json();
    const msg=(await request(a,'POST',`/messaging/chat/${room._id}/messages`,{content:'Live'})).json();
    await new Promise(r=>setTimeout(r,30));
    for(const i of [0,1]) {
      const wire=events[i].find(s=>s.startsWith('messaging:message_received '));assert.ok(wire);
      assert.equal(JSON.parse(wire.slice(wire.indexOf(' ',wire.indexOf(' ')+1)+1))._id,msg._id);
    }
    assert.equal(events[2].some(s=>s.startsWith('messaging:')),false);
  } finally {sockets.forEach(s=>s.terminate());}
});
