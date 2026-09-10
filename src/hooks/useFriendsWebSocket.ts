import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useMinecraftAuthStore } from "../store/minecraft-auth-store";
import { useFriendsStore, type OnlineState } from "../store/friends-store";
import { useChatStore, type ChatMessage } from "../store/chat-store";
import { toast } from "../components/ui/GlobalToaster";
import i18n from "../i18n/i18n";

// Serialize native connect/disconnect calls across account changes and StrictMode remounts.
let lifecycle: Promise<unknown> = Promise.resolve();
export function useFriendsWebSocket() {
  const accountId=useMinecraftAuthStore(s=>s.activeAccount?.id);
  useEffect(()=> {
    let disposed=false, busy=false;
    const unlisteners:UnlistenFn[]=[];
    const typingTimers=new Map<string,ReturnType<typeof setTimeout>>();
    const active=()=>!disposed && useMinecraftAuthStore.getState().activeAccount?.id===accountId;
    useFriendsStore.setState({friends:[],pendingRequests:[],currentUser:null,activeChatFriend:null,lastFetchedAt:null,wsConnected:false,error:null,isLoading:false});
    useChatStore.setState({activeChat:null,activeFriend:null,messages:[],chats:[],typingUsers:new Set(),error:null,isLoading:false});
    const refresh=async()=> {
      if(!active() || !accountId || busy) return;
      busy=true;
      try {
        const friends=useFriendsStore.getState();
        await Promise.all([friends.loadCurrentUser(),friends.loadFriends(true),friends.loadPendingRequests(),useChatStore.getState().loadChats()]);
        if(active()) {
          const chatId=useChatStore.getState().activeChat?._id;
          if(chatId) await useChatStore.getState().loadMessages(chatId);
        }
      } finally {busy=false;}
    };
    async function on<T>(name:string, handler:(payload:T)=>void) {
      const stop=await listen<T>(name,event=>{if(active())handler(event.payload);});
      if(disposed) stop(); else unlisteners.push(stop);
    }
    const setup=async()=> {
      await invoke("disconnect_friends_websocket");
      if(!active() || !accountId) return;
      await on("friends:ws_connected",()=>{useFriendsStore.getState().setWsConnected(true);void refresh();});
      await on("friends:ws_disconnected",()=>{useFriendsStore.getState().setWsConnected(false);});
      await on("friends:changed",()=>{void refresh();});
      await on<{newState:OnlineState;user:{uuid:string;ign:string}}>("friends:status_changed",payload=> {
        const store=useFriendsStore.getState();
        const friend=store.friends.find(f=>f.uuid===payload.user.uuid);
        const wasOnline=friend && ["ONLINE","AFK","BUSY"].includes(friend.state);
        const isOnline=["ONLINE","AFK","BUSY"].includes(payload.newState);
        store.updateFriendState(payload.user.uuid,payload.newState,isOnline ? undefined : null);
        if(friend && store.notificationsEnabled && friend.pingEnabled!==false && Boolean(wasOnline)!==isOnline) {
          toast.player(i18n.t(isOnline?'friends.notifications.online':'friends.notifications.offline',{username:payload.user.ign}),payload.user.uuid);
        }
      });
      await on<{noriskUser:{uuid:string};server:string|null}>("friends:server_changed",p=>useFriendsStore.getState().updateFriendServer(p.noriskUser.uuid,p.server));
      await on<ChatMessage>("chat:message_received",message=> {
        const chats=useChatStore.getState();
        chats.addMessage(message);
        void chats.loadChats();
        const friends=useFriendsStore.getState();
        if(message.senderId===friends.currentUser?.uuid)return;
        if(chats.activeChat?._id===message.chatId || friends.activeChatFriend?.uuid===message.senderId) {
          void invoke("mark_message_received",{chatId:message.chatId,messageId:message._id}).catch(()=>{});
        } else if(friends.notificationsEnabled) {
          const friend=friends.friends.find(f=>f.uuid===message.senderId);
          if(friend?.pingEnabled!==false) toast.player(i18n.t('friends.notifications.chat_preview',{name:friend?.username ?? 'Friend',message:message.content.slice(0,50)}),message.senderId);
        }
      });
      await on<ChatMessage>("chat:message_updated",message=>{useChatStore.getState().updateMessage(message);void useChatStore.getState().loadChats();});
      await on("chat:created",()=>{void useChatStore.getState().loadChats();});
      await on<{chatId:string;userUuid:string}>("chat:user_typing",p=> {
        const key=`${p.chatId}:${p.userUuid}`;
        clearTimeout(typingTimers.get(key));
        useChatStore.getState().addTypingUser(p.chatId,p.userUuid);
        typingTimers.set(key,setTimeout(()=>{typingTimers.delete(key);if(active())useChatStore.getState().removeTypingUser(p.chatId,p.userUuid);},3000));
      });
      if(!active())return;
      await invoke("connect_friends_websocket");
      await refresh();
    };
    lifecycle=lifecycle.catch(()=>{}).then(setup).catch(()=>{if(active())useFriendsStore.getState().setWsConnected(false);});
    // Refresh cached credentials and recover if startup happened before login completed.
    const timer=setInterval(()=> {
      lifecycle=lifecycle.catch(()=>{}).then(async()=> {
        if(!active() || !accountId)return;
        await invoke("connect_friends_websocket");
        await refresh();
      }).catch(()=>{});
    },30000);
    return ()=> {
      disposed=true;clearInterval(timer);
      for(const stop of unlisteners)stop();
      for(const timer of typingTimers.values())clearTimeout(timer);
      lifecycle=lifecycle.catch(()=>{}).then(()=>invoke("disconnect_friends_websocket")).catch(()=>{});
    };
  },[accountId]);
}
