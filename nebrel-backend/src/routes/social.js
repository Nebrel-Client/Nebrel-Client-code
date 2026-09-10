import { uuid, fail } from "../social.js";
import { requireAuth } from "../token.js";

export default async function socialRoutes(app, { social }) {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", async request => { await social.user(request.user.uuid); });
  const me = r => r.user.uuid;
  app.get("/friends/user", r=>social.current(me(r)));
  app.get("/friends/:uuid", r=> { if(uuid(r.params.uuid)!==me(r)) fail(403,"This friend list is private"); return social.list(me(r)); });
  app.post("/friends/:uuid/add", r=>social.request(me(r),uuid(r.params.uuid)));
  app.delete("/friends/:uuid/remove", r=>social.remove(me(r),uuid(r.params.uuid)));
  app.post("/friends/status", r=>social.status(me(r),r.body));
  app.put("/friends/privacy/:setting", r=>social.privacy(me(r),r.params.setting,r.body));
  app.post("/friends/:uuid/toggle-ping", r=>social.togglePing(me(r),uuid(r.params.uuid)));
  app.get("/messaging/chat/private", r=>social.chats(me(r)));
  app.get("/messaging/chat/private/:uuid", r=>social.getChat(me(r),uuid(r.params.uuid)));
  app.get("/messaging/chat/:id/messages", r=>social.messages(me(r),uuid(r.params.id),r.query.page,r.query.limit));
  app.post("/messaging/chat/:id/messages", r=>social.sendMessage(me(r),uuid(r.params.id),r.body));
  app.put("/messaging/message/:id", r=>social.edit(me(r),uuid(r.params.id),r.body));
  app.delete("/messaging/message/:id", r=>social.deleteMessage(me(r),uuid(r.params.id)));
  app.post("/messaging/chat/:id/messages/received", r=>social.received(me(r),uuid(r.params.id),uuid(r.body?.messageId)));
  app.post("/messaging/message/:id/reaction", r=>social.reaction(me(r),uuid(r.params.id),r.body?.emoji));
  app.delete("/messaging/message/:id/reaction", r=>social.reaction(me(r),uuid(r.params.id),r.query.emoji,true));
}
