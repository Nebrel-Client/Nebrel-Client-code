import { requireAuth } from "../token.js";

export default async function friendsWebsocket(app, { social }) {
  app.get("/core/ws", {
    websocket: true,
    preValidation: [requireAuth, async request => { await social.user(request.user.uuid); }],
  }, (socket, request) => {
    const id=request.user.uuid;
    let alive=true, closed=false, lastTyping=0;
    const report=()=>app.log.warn("Friend socket operation failed");
    // Register handlers synchronously; initialization may still be awaiting SQL.
    const ready=social.connect(id,socket);
    ready.catch(()=>socket.close(1011,"Unable to initialize session"));
    socket.on("error", report);
    socket.on("pong",()=>{ alive=true; });
    socket.on("message",raw=> {
      if(raw.length>8192) { socket.close(1009,"Message too large"); return; }
      let data; try {data=JSON.parse(raw.toString());} catch {return;}
      if(data?.channel!=="messaging:user_typing" || Date.now()-lastTyping<1000) return;
      lastTyping=Date.now();
      ready.then(()=>{ if(!closed) return social.typing(id,data.payload?.chatId); }).catch(report);
    });
    const timer=setInterval(()=> {
      if(!alive || request.user.exp*1000<=Date.now()) { socket.terminate(); return; }
      alive=false; socket.ping();
    },30000);
    timer.unref();
    socket.on("close",()=> {
      closed=true; clearInterval(timer);
      ready.catch(()=>{}).then(()=>social.disconnect(id,socket)).catch(report);
    });
  });
}
