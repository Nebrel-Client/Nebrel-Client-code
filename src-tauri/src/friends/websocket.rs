use crate::error::{AppError, Result};
use crate::friends::models::{
    ChatMessage, FriendOnlineEvent, OnlineStateChangeEvent, UserTypingEvent,
};
use crate::minecraft::api::norisk_api::NoRiskApi;
use futures_util::{SinkExt, StreamExt};
use log::error;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WebSocketMessage {
    channel: String,
    payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub enum WsCommand {
    Connect {
        uuid: Uuid,
        username: String,
        token: String,
    },
    Disconnect,
    SendTyping {
        chat_id: String,
    },
}

pub struct FriendsWebSocket {
    connected: Arc<RwLock<bool>>,
    command_tx: Option<mpsc::Sender<WsCommand>>,
    task: Option<tokio::task::JoinHandle<()>>,
    session: Option<(Uuid, String, bool)>,
}

impl FriendsWebSocket {
    pub fn new() -> Self {
        Self {
            connected: Arc::new(RwLock::new(false)),
            command_tx: None,
            task: None,
            session: None,
        }
    }

    pub async fn is_connected(&self) -> bool {
        *self.connected.read().await
    }

    pub async fn connect(
        &mut self,
        app_handle: Arc<tauri::AppHandle>,
        uuid: Uuid,
        username: String,
        token: String,
        is_experimental: bool,
    ) -> Result<()> {
        let identity = (uuid, token.clone(), is_experimental);
        if self.session.as_ref() == Some(&identity) && self.task.as_ref().is_some_and(|task| !task.is_finished()) {
            return Ok(());
        }
        self.disconnect().await?;
        self.session = Some(identity);
        let (cmd_tx, mut cmd_rx) = mpsc::channel::<WsCommand>(32);
        self.command_tx = Some(cmd_tx);
        let connected = self.connected.clone();
        self.task = Some(tokio::spawn(async move {
            let mut delay = 1u64;
            loop {
                let base = NoRiskApi::get_api_base(is_experimental)
                    .replacen("https://", "wss://", 1).replacen("http://", "ws://", 1);
                // Credentials only travel in the Authorization header, never in URLs/logs.
                let request = tokio_tungstenite::tungstenite::http::Request::builder()
                    .uri(format!("{}/core/ws", base))
                    .header("Host", crate::branding::api_host(is_experimental))
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Connection", "Upgrade")
                    .header("Upgrade", "websocket")
                    .header("Sec-WebSocket-Version", "13")
                    .header("Sec-WebSocket-Key", tokio_tungstenite::tungstenite::handshake::client::generate_key())
                    .body(());
                let Ok(request) = request else { return; };
                if let Ok(Ok((stream, _))) = tokio::time::timeout(Duration::from_secs(20), connect_async(request)).await {
                    *connected.write().await = true;
                    let _ = app_handle.emit("friends:ws_connected", ());
                    delay = 1;
                    let (mut write, mut read) = stream.split();
                    loop {
                        tokio::select! {
                            message = tokio::time::timeout(Duration::from_secs(75), read.next()) => {
                                match message {
                                    Ok(Some(Ok(Message::Text(text)))) => Self::handle_message(&app_handle, &text).await,
                                    Ok(Some(Ok(Message::Ping(data)))) => {
                                        if write.send(Message::Pong(data)).await.is_err() { break; }
                                    }
                                    Ok(Some(Ok(Message::Close(_)))) | Ok(Some(Err(_))) | Ok(None) | Err(_) => break,
                                    _ => {}
                                }
                            }
                            command = cmd_rx.recv() => {
                                match command {
                                    Some(WsCommand::SendTyping { chat_id }) => {
                                        let message = serde_json::json!({"channel":"messaging:user_typing", "payload":{"chatId":chat_id}});
                                        if write.send(Message::Text(message.to_string().into())).await.is_err() { break; }
                                    }
                                    Some(WsCommand::Disconnect) | None => {
                                        let _ = write.close().await;
                                        *connected.write().await = false;
                                        let _ = app_handle.emit("friends:ws_disconnected", ());
                                        return;
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                *connected.write().await = false;
                let _ = app_handle.emit("friends:ws_disconnected", ());
                tokio::time::sleep(Duration::from_secs(delay)).await;
                delay = (delay * 2).min(30);
            }
        }));
        Ok(())
    }

    async fn handle_message(app: &tauri::AppHandle, text: &str) {
        let parts: Vec<&str> = text.splitn(3, ' ').collect();
        if parts.len() < 3 {
            return;
        }

        let channel = parts[0];
        let payload: serde_json::Value = match serde_json::from_str(parts[2]) {
            Ok(p) => p,
            Err(_) => return,
        };

        match channel {
            "nrc_friends:friend_online" => {
                if let Ok(event) = serde_json::from_value::<FriendOnlineEvent>(payload.clone()) {
                    let _ = app.emit("friends:friend_online", event);
                } else {
                    let _ = app.emit("friends:friend_online", payload);
                }
            }
            "nrc_friends:friend_offline" => {
                if let Ok(event) = serde_json::from_value::<FriendOnlineEvent>(payload.clone()) {
                    let _ = app.emit("friends:friend_offline", event);
                } else {
                    let _ = app.emit("friends:friend_offline", payload);
                }
            }
            "nrc_friends:friend_changed_online_state" => {
                if let Ok(event) = serde_json::from_value::<OnlineStateChangeEvent>(payload.clone()) {
                    let _ = app.emit("friends:status_changed", event);
                } else {
                    let _ = app.emit("friends:status_changed", payload);
                }
            }
            "nrc_friends:friends_changed" => {
                let _ = app.emit("friends:changed", payload);
            }
            "nrc_friends:friend_request" => {
                let _ = app.emit("friends:request_received", payload);
            }
            "nrc_friends:server_change" => {
                let _ = app.emit("friends:server_changed", payload);
            }
            "messaging:message_received" => {
                if let Ok(message) = serde_json::from_value::<ChatMessage>(payload.clone()) {
                    let _ = app.emit("chat:message_received", message);
                } else {
                    let _ = app.emit("chat:message_received", payload);
                }
            }
            "messaging:message_updated" => {
                let _ = app.emit("chat:message_updated", payload);
            }
            "messaging:message_deleted" => {
                let _ = app.emit("chat:message_deleted", payload);
            }
            "messaging:user_typing" => {
                if let Ok(event) = serde_json::from_value::<UserTypingEvent>(payload) {
                    let _ = app.emit("chat:user_typing", event);
                }
            }
            "messaging:chat_created" => {
                let _ = app.emit("chat:created", payload);
            }
            _ => {}
        }
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        if let Some(task) = self.task.take() {
            task.abort();
            let _ = task.await;
        }
        self.command_tx = None;
        self.session = None;
        *self.connected.write().await = false;
        Ok(())
    }

    pub async fn send_typing(&self, chat_id: String) -> Result<()> {
        if let Some(tx) = &self.command_tx {
            tx.send(WsCommand::SendTyping { chat_id })
                .await
                .map_err(|e| AppError::Other(format!("Failed to send typing: {}", e)))?;
        }
        Ok(())
    }
}

impl Default for FriendsWebSocket {
    fn default() -> Self {
        Self::new()
    }
}
