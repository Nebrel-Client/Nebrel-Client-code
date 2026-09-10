import { randomUUID } from "node:crypto";

export function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}
export function uuid(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(400, "Invalid UUID");
  return value.toLowerCase();
}
const millis = value => value == null ? null : new Date(value).getTime();
const visible = state => ["ONLINE", "AFK", "BUSY"].includes(state);

// One Node process owns the live sockets. Persistent data is stored in PostgreSQL.
export function createSocial({ query, transaction }) {
  const connections = new Map();
  const servers = new Map();
  const send = (id, channel, payload) => {
    for (const socket of connections.get(id) ?? []) {
      if (socket.readyState === 1) {
        if (socket.bufferedAmount > 1024 * 1024) socket.close(1013, "Slow consumer");
        else socket.send(`${channel} ${Date.now()} ${JSON.stringify(payload)}`);
      }
    }
  };
  async function user(id) {
    const [row] = await query("SELECT * FROM users WHERE uuid=$1", [id]);
    if (!row) fail(404, "Player has not signed in to Nebrel yet");
    return row;
  }
  function state(row) {
    return connections.get(row.uuid)?.size && visible(row.online_state) ? row.online_state : "OFFLINE";
  }
  async function friendIds(id) {
    return (await query(`SELECT CASE WHEN requester=$1 THEN addressee ELSE requester END AS uuid
      FROM friendships WHERE (requester=$1 OR addressee=$1) AND status='accepted'`, [id])).map(r => r.uuid);
  }
  async function assertFriends(a, b, q = query) {
    const [row] = await q(`SELECT 1 FROM friendships WHERE status='accepted'
      AND ((requester=$1 AND addressee=$2) OR (requester=$2 AND addressee=$1))`, [a, b]);
    if (!row) fail(403, "An accepted friendship is required");
  }
  async function changed(ids) {
    for (const id of ids) send(id, "nrc_friends:friends_changed", {});
  }
  async function broadcastState(id) {
    const row = await user(id);
    for (const friend of await friendIds(id)) {
      send(friend, "nrc_friends:friend_changed_online_state", { newState: state(row), user: { uuid: id, ign: row.username } });
      send(friend, "nrc_friends:server_change", { noriskUser: { uuid: id, ign: row.username }, server: state(row) !== "OFFLINE" && row.show_server ? servers.get(id) ?? null : null });
    }
    send(id, "nrc_friends:friends_changed", {});
  }
  async function list(id) {
    const rows = await query(`SELECT u.*, COALESCE(p.ping,true) AS ping FROM friendships f
      JOIN users u ON u.uuid=CASE WHEN f.requester=$1 THEN f.addressee ELSE f.requester END
      LEFT JOIN friend_preferences p ON p.owner=$1 AND p.friend=u.uuid
      WHERE (f.requester=$1 OR f.addressee=$1) AND f.status='accepted' ORDER BY lower(u.username)`, [id]);
    const pending = await query(`SELECT f.*, a.username AS sender_name, b.username AS receiver_name FROM friendships f
      JOIN users a ON a.uuid=f.requester JOIN users b ON b.uuid=f.addressee
      WHERE (requester=$1 OR addressee=$1) AND status='pending' ORDER BY created_at`, [id]);
    return {
      friends: rows.map(row => ({ noriskUser: { uuid: row.uuid, ign: row.username },
        otherUser: { uuid: row.uuid, hasPingNotification: row.ping }, onlineState: state(row),
        server: state(row) !== "OFFLINE" && row.show_server ? servers.get(row.uuid) ?? null : null })),
      pending: pending.map(row => ({ friendRequest: { _id: `${row.requester}:${row.addressee}`, sender: row.requester,
        receiver: row.addressee, currentState: "PENDING", timestamp: millis(row.created_at) },
        users: [{ uuid: row.requester, ign: row.sender_name }, { uuid: row.addressee, ign: row.receiver_name }] }))
    };
  }
  async function current(id) {
    const row = await user(id);
    return { _id: id, state: row.online_state, lastActiveState: row.online_state, server: servers.get(id) ?? null,
      privacy: { showServer: row.show_server, allowRequests: row.allow_requests, allowServerInvites: row.allow_server_invites } };
  }
  // Lock users in a stable order to serialize reciprocal requests and message/removal races.
  async function pair(q, a, b) {
    await q("SELECT uuid FROM users WHERE uuid IN ($1,$2) ORDER BY uuid FOR UPDATE", [a,b]);
  }
  async function request(a, b) {
    if (a === b) fail(400, "You cannot add yourself");
    await transaction(async q => {
      await pair(q, a, b);
      const [target] = await q("SELECT * FROM users WHERE uuid=$1", [b]);
      if (!target) fail(404, "Player must sign in to Nebrel first");
      const [existing] = await q("SELECT * FROM friendships WHERE (requester=$1 AND addressee=$2) OR (requester=$2 AND addressee=$1)", [a,b]);
      if (existing?.status === "blocked") fail(403, "Friend request unavailable");
      if (existing?.status === "accepted") return;
      if (existing?.status === "pending" && existing.addressee === a) {
        await q("UPDATE friendships SET status='accepted' WHERE requester=$1 AND addressee=$2", [b,a]);
      } else if (!existing) {
        if (!target.allow_requests) fail(403, "This player has disabled friend requests");
        await q("INSERT INTO friendships(requester,addressee,status) VALUES($1,$2,'pending')", [a,b]);
      }
    });
    await changed([a,b]);
    return { ok: true };
  }
  async function remove(a,b) {
    await transaction(async q => { await pair(q,a,b);
      await q("DELETE FROM friendships WHERE (requester=$1 AND addressee=$2) OR (requester=$2 AND addressee=$1)", [a,b]);
    });
    await changed([a,b]);
    return { ok: true };
  }
  async function status(id, value) {
    if (!["ONLINE","OFFLINE","AFK","BUSY","INVISIBLE"].includes(value)) fail(400, "Invalid online status");
    await query("UPDATE users SET online_state=$2 WHERE uuid=$1", [id,value]);
    await broadcastState(id);
    return value;
  }
  async function privacy(id, field, value) {
    const column = { "show-server":"show_server", "allow-friend-requests":"allow_requests", "allow-server-invites":"allow_server_invites" }[field];
    if (!column || typeof value !== "boolean") fail(400, "Invalid privacy setting");
    await query(`UPDATE users SET ${column}=$2 WHERE uuid=$1`, [id,value]);
    await broadcastState(id);
    return { ok:true };
  }
  async function togglePing(a,b) {
    await assertFriends(a,b);
    const [row] = await query(`INSERT INTO friend_preferences(owner,friend,ping) VALUES($1,$2,false)
      ON CONFLICT(owner,friend) DO UPDATE SET ping=NOT friend_preferences.ping RETURNING ping`, [a,b]);
    return row.ping;
  }
  const chatDto = row => ({ _id: row.id, type:"PRIVATE", timestamp: millis(row.created_at),
    participants: [row.user_a,row.user_b].map(userId => ({ userId, joinedAt: millis(row.created_at) })) });
  async function chat(id, viewer, q=query) {
    const [row] = await q("SELECT * FROM private_chats WHERE id=$1 AND (user_a=$2 OR user_b=$2)", [id,viewer]);
    if (!row) fail(404, "Chat not found");
    await assertFriends(row.user_a,row.user_b,q);
    return row;
  }
  async function getChat(a,b) {
    if (a===b) fail(400,"Cannot message yourself");
    const row = await transaction(async q => {
      await pair(q,a,b); await assertFriends(a,b,q);
      const [first,second]=[a,b].sort();
      const [row]=await q(`INSERT INTO private_chats(id,user_a,user_b) VALUES($1,$2,$3)
        ON CONFLICT(user_a,user_b) DO UPDATE SET user_a=EXCLUDED.user_a RETURNING *`, [randomUUID(),first,second]);
      return row;
    });
    const result=chatDto(row);
    send(a,"messaging:chat_created",result); send(b,"messaging:chat_created",result);
    return result;
  }
  async function messageDto(row) {
    const reactions=await query("SELECT emoji,reactor FROM message_reactions WHERE message_id=$1 ORDER BY emoji,reactor",[row.id]);
    return { _id:row.id, chatId:row.chat_id, senderId:row.sender, content:row.deleted_at ? "" : row.content,
      relatesTo:row.relates_to, createdAt:millis(row.created_at), sentAt:millis(row.created_at), timestamp:millis(row.created_at),
      receivedAt:millis(row.received_at), editedAt:millis(row.edited_at), deletedAt:millis(row.deleted_at), reactions:row.deleted_at ? [] : reactions };
  }
  async function chats(viewer) {
    const rows=await query(`SELECT c.* FROM private_chats c WHERE (user_a=$1 OR user_b=$1) AND EXISTS (
      SELECT 1 FROM friendships f WHERE status='accepted' AND
      ((f.requester=c.user_a AND f.addressee=c.user_b) OR (f.requester=c.user_b AND f.addressee=c.user_a))) ORDER BY created_at DESC`,[viewer]);
    return Promise.all(rows.map(async row=> {
      const [last]=await query("SELECT * FROM chat_messages WHERE chat_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",[row.id]);
      const [count]=await query("SELECT count(*)::int AS n FROM chat_messages WHERE chat_id=$1 AND sender<>$2 AND received_at IS NULL AND deleted_at IS NULL",[row.id,viewer]);
      return { ...chatDto(row), unreadMessages:count.n, latestMessage:last ? await messageDto(last) : null };
    }));
  }
  async function messages(viewer,id,page=0,limit=50) {
    await chat(id,viewer);
    page=Number(page); limit=Number(limit);
    if (!Number.isInteger(page) || page<0 || page>10000 || !Number.isInteger(limit) || limit<1 || limit>100) fail(400,"Invalid pagination");
    return Promise.all((await query("SELECT * FROM chat_messages WHERE chat_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",[id,limit,page*limit])).map(messageDto));
  }
  function content(value) {
    if (typeof value!=="string" || !value.trim() || value.length>4000) fail(400,"Message must contain 1–4000 characters");
    return value.trim();
  }
  async function publishMessage(row,channel) {
    const result=await messageDto(row);
    const [room]=await query("SELECT * FROM private_chats WHERE id=$1",[row.chat_id]);
    for (const id of [room.user_a,room.user_b]) send(id,channel,result);
    return result;
  }
  async function sendMessage(viewer,id,body) {
    const text=content(body?.content);
    const room=await chat(id,viewer);
    const row=await transaction(async q=> {
      await pair(q,room.user_a,room.user_b); await assertFriends(room.user_a,room.user_b,q);
      if (body.relatesTo) {
        const [parent]=await q("SELECT id FROM chat_messages WHERE id=$1 AND chat_id=$2 AND deleted_at IS NULL",[uuid(body.relatesTo),id]);
        if (!parent) fail(400,"Reply target is not in this chat");
      }
      const [row]=await q("INSERT INTO chat_messages(id,chat_id,sender,content,relates_to) VALUES($1,$2,$3,$4,$5) RETURNING *",[randomUUID(),id,viewer,text,body.relatesTo || null]);
      return row;
    });
    return publishMessage(row,"messaging:message_received");
  }
  async function message(viewer,id) {
    const [row]=await query("SELECT * FROM chat_messages WHERE id=$1",[id]);
    if (!row) fail(404,"Message not found");
    await chat(row.chat_id,viewer); return row;
  }
  async function edit(viewer,id,body) {
    const row=await message(viewer,id);
    if(row.sender!==viewer) fail(403,"Only the sender may edit a message");
    const [updated]=await query("UPDATE chat_messages SET content=$2,edited_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING *",[id,content(body?.content)]);
    if(!updated) fail(404,"Message deleted");
    return publishMessage(updated,"messaging:message_updated");
  }
  async function deleteMessage(viewer,id) {
    const row=await message(viewer,id);
    if(row.sender!==viewer) fail(403,"Only the sender may delete a message");
    const [updated]=await query("UPDATE chat_messages SET content='',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 RETURNING *",[id]);
    await publishMessage(updated,"messaging:message_updated"); return {ok:true};
  }
  async function received(viewer,chatId,id) {
    const row=await message(viewer,id);
    if(row.chat_id!==chatId || row.sender===viewer) fail(403,"Invalid receipt");
    const [updated]=await query("UPDATE chat_messages SET received_at=COALESCE(received_at,now()) WHERE id=$1 RETURNING *",[id]);
    await publishMessage(updated,"messaging:message_updated"); return {ok:true};
  }
  async function reaction(viewer,id,emoji,remove=false) {
    const row=await message(viewer,id);
    if(row.deleted_at) fail(404,"Message deleted");
    if(typeof emoji!=="string" || !emoji.trim() || emoji.length>32) fail(400,"Invalid reaction");
    if(remove) await query("DELETE FROM message_reactions WHERE message_id=$1 AND reactor=$2 AND emoji=$3",[id,viewer,emoji]);
    else await query("INSERT INTO message_reactions(message_id,reactor,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[id,viewer,emoji]);
    await publishMessage(row,"messaging:message_updated"); return {ok:true};
  }
  function connect(id,socket) {
    const set=connections.get(id) ?? new Set(); set.add(socket); connections.set(id,set);
    return broadcastState(id);
  }
  async function disconnect(id,socket) {
    const set=connections.get(id); set?.delete(socket);
    if(!set?.size) { connections.delete(id); servers.delete(id); await query("UPDATE users SET last_seen=now() WHERE uuid=$1",[id]); await broadcastState(id); }
  }
  async function typing(viewer,id) {
    const room=await chat(uuid(id),viewer); const row=await user(viewer);
    if(state(row)==="OFFLINE") return;
    send(room.user_a===viewer ? room.user_b : room.user_a,"messaging:user_typing",{chatId:id,userUuid:viewer,username:row.username});
  }
  return { user,list,current,request,remove,status,privacy,togglePing,getChat,chats,messages,sendMessage,edit,deleteMessage,received,reaction,connect,disconnect,typing,send,
    close:()=>{ for(const set of connections.values()) for(const socket of set) socket.close(1001,"Server stopping"); } };
}
