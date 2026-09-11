use crate::config::{ProjectDirsExt, LAUNCHER_DIRECTORY};
use crate::minecraft::downloads::java_download::JavaDownloadService;
use crate::minecraft::dto::JavaDistribution;
use crate::state::State;
use futures::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tokio::{
    fs,
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
    sync::{mpsc, Mutex},
    task::JoinHandle,
};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message},
};
use uuid::Uuid;

const API: &str = "https://api.nebrel.de/api/v1";
const WS: &str = "wss://api.nebrel.de/api/v1";
const MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
static RUNNING: Lazy<Mutex<HashMap<Uuid, Arc<Running>>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static START_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static CREATE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
struct Running {
    tx: mpsc::Sender<String>,
    status: Mutex<String>,
    logs: Mutex<VecDeque<String>>,
    relay: Mutex<Option<JoinHandle<()>>>,
    public_status: Mutex<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServer {
    id: Uuid,
    name: String,
    slug: String,
    software: String,
    version: String,
    ram_mb: u32,
    max_players: u32,
    port: u16,
    #[serde(default)]
    automatic_port: bool,
    java_major: u32,
    #[serde(default)]
    icon: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateServer {
    name: String,
    slug: String,
    software: String,
    version: String,
    ram_mb: u32,
    max_players: u32,
    port: u16,
    accept_eula: bool,
    icon: Option<String>,
}
fn root() -> PathBuf {
    LAUNCHER_DIRECTORY.root_dir().join("hosted-servers")
}
fn directory(id: Uuid) -> PathBuf {
    root().join(id.to_string())
}
fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Nebrel-Hosting/0.2.0 (https://nebrel.de)")
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .unwrap()
}
async fn fetch(url: &str) -> Result<Value, String> {
    client()
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}
fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key]
        .as_str()
        .ok_or_else(|| format!("Download-Metadaten fehlen: {key}"))
}
async fn read(id: Uuid) -> Result<HostedServer, String> {
    let bytes = fs::read(directory(id).join("server.json"))
        .await
        .map_err(|e| e.to_string())?;
    let config: HostedServer = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if config.id != id {
        return Err("Ungültige Server-ID".into());
    }
    Ok(config)
}
async fn log(run: &Running, line: String) {
    let mut lines = run.logs.lock().await;
    if lines.len() >= 400 {
        lines.pop_front();
    }
    lines.push_back(line.chars().take(4096).collect());
}
async fn token() -> Result<String, String> {
    let state = State::get().await.map_err(|e| e.to_string())?;
    let account = state
        .minecraft_account_manager_v2
        .get_active_account()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Bitte zuerst bei Nebrel anmelden.")?;
    account
        .norisk_credentials
        .production
        .as_ref()
        .map(|t| t.value.clone())
        .ok_or("Nebrel-Anmeldung fehlt. Bitte erneut anmelden.".into())
}
async fn api(method: reqwest::Method, path: &str, body: Value) -> Result<Value, String> {
    let response = client()
        .request(method, format!("{API}{path}"))
        .bearer_auth(token().await?)
        .json(&body)
        .send()
        .await
        .map_err(|_| "Nebrel-Backend nicht erreichbar.".to_string())?;
    let status = response.status();
    let data: Value = response.json().await.unwrap_or(json!({}));
    if !status.is_success() {
        return Err(data["error"]
            .as_str()
            .unwrap_or("Serverfreigabe fehlgeschlagen.")
            .to_string());
    }
    Ok(data)
}
#[tauri::command]
pub async fn hosting_versions() -> Result<Vec<String>, String> {
    let v = fetch(MANIFEST).await?;
    Ok(v["versions"]
        .as_array()
        .ok_or("Versionsliste fehlt")?
        .iter()
        .filter(|x| x["type"] == "release")
        .filter_map(|x| x["id"].as_str().map(str::to_owned))
        .take(80)
        .collect())
}
#[tauri::command]
pub async fn hosting_list() -> Result<Vec<Value>, String> {
    fs::create_dir_all(root())
        .await
        .map_err(|e| e.to_string())?;
    let mut entries = fs::read_dir(root()).await.map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let Ok(id) = Uuid::parse_str(&entry.file_name().to_string_lossy()) else {
            continue;
        };
        let Ok(server) = read(id).await else { continue };
        let run = RUNNING.lock().await.get(&id).cloned();
        let mut value = serde_json::to_value(server).map_err(|e| e.to_string())?;
        value["status"] = json!(if let Some(r) = &run {
            r.status.lock().await.clone()
        } else {
            "stopped".into()
        });
        value["publicStatus"] = json!(if let Some(r) = &run {
            r.public_status.lock().await.clone()
        } else {
            String::new()
        });
        result.push(value);
    }
    Ok(result)
}
#[tauri::command]
pub async fn hosting_create(input: CreateServer) -> Result<HostedServer, String> {
    let _guard = CREATE_LOCK.lock().await;
    if !input.accept_eula {
        return Err("Bitte die Minecraft-EULA bestätigen.".into());
    }
    if input.name.trim().is_empty() || input.name.len() > 80 || input.name.contains(['\n', '\r']) {
        return Err("Bitte einen gültigen Servernamen eingeben.".into());
    }
    if input.slug.len() < 3
        || input.slug.len() > 40
        || !input
            .slug
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        || input.slug.starts_with('-')
        || input.slug.ends_with('-')
    {
        return Err("Adresse: 3–40 Kleinbuchstaben, Zahlen oder Bindestriche.".into());
    }
    if !(1024..=32768).contains(&input.ram_mb)
        || !(1..=100).contains(&input.max_players)
        || (input.port != 0 && input.port < 1024)
    {
        return Err("RAM, Spielerzahl oder Port ist ungültig.".into());
    }
    if input.ram_mb as u64 + 1024 > crate::utils::system_info::total_ram_mb() {
        return Err("Bitte mindestens 1 GB RAM für dein Betriebssystem freilassen.".into());
    }
    let manifest = fetch(MANIFEST).await?;
    let entry = manifest["versions"]
        .as_array()
        .ok_or("Versionsliste fehlt")?
        .iter()
        .find(|v| v["id"] == input.version && v["type"] == "release")
        .ok_or("Unbekannte Minecraft-Version")?;
    let meta = fetch(text(entry, "url")?).await?;
    let java_major = meta["javaVersion"]["majorVersion"].as_u64().unwrap_or(8) as u32;
    let url = match input.software.as_str() {
        "vanilla" => text(&meta["downloads"]["server"], "url")?.to_string(),
        "paper" | "folia" => {
            let builds = fetch(&format!(
                "https://fill.papermc.io/v3/projects/{}/versions/{}/builds",
                input.software, input.version
            ))
            .await?;
            let build=builds.as_array().ok_or("Keine Builds verfügbar")?.iter().find(|b|b["channel"]=="STABLE").ok_or("Für diese Version gibt es keinen stabilen Build. Bitte eine andere Version wählen.")?;
            text(&build["downloads"]["server:default"], "url")?.to_string()
        }
        "purpur" => format!(
            "https://api.purpurmc.org/v2/purpur/{}/latest/download",
            input.version
        ),
        "fabric" => {
            let loaders = fetch(&format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}",
                input.version
            ))
            .await?;
            let loader = loaders
                .as_array()
                .and_then(|a| a.iter().find(|v| v["loader"]["stable"] == true))
                .ok_or("Kein stabiler Fabric-Loader verfügbar")?;
            let installers = fetch("https://meta.fabricmc.net/v2/versions/installer").await?;
            let installer = installers
                .as_array()
                .and_then(|a| a.iter().find(|v| v["stable"] == true))
                .ok_or("Kein Fabric-Installer verfügbar")?;
            format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}/{}/{}/server/jar",
                input.version,
                text(&loader["loader"], "version")?,
                text(installer, "version")?
            )
        }
        _ => return Err("Diese Server-Software wird noch nicht unterstützt.".into()),
    };
    let id = Uuid::new_v4();
    let dir = directory(id);
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let setup:Result<HostedServer,String>=async{
  let response=client().get(&url).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?;
  let mut stream=response.bytes_stream();let mut file=fs::File::create(dir.join("server.jar.part")).await.map_err(|e|e.to_string())?;let mut bytes=0u64;
  while let Some(chunk)=stream.next().await{let chunk=chunk.map_err(|e|e.to_string())?;bytes+=chunk.len() as u64;if bytes>512*1024*1024{return Err("Server-Datei ist zu groß.".into());}file.write_all(&chunk).await.map_err(|e|e.to_string())?;}file.flush().await.map_err(|e|e.to_string())?;drop(file);
  let mut magic=[0u8;2];fs::File::open(dir.join("server.jar.part")).await.map_err(|e|e.to_string())?.read_exact(&mut magic).await.map_err(|e|e.to_string())?;if magic!=*b"PK"{return Err("Download ist keine JAR-Datei.".into());}
  fs::rename(dir.join("server.jar.part"),dir.join("server.jar")).await.map_err(|e|e.to_string())?;
  fs::write(dir.join("eula.txt"),"eula=true\n").await.map_err(|e|e.to_string())?;
  fs::write(dir.join("server.properties"),format!("server-ip=127.0.0.1\nserver-port={}\nmax-players={}\nonline-mode=true\nenable-rcon=false\nenable-query=false\nmotd=Nebrel Server\n",input.port,input.max_players)).await.map_err(|e|e.to_string())?;
  let icon=if let Some(data)=input.icon{if data.len()>100000{return Err("Server-Icon zu groß.".into());}let encoded=data.strip_prefix("data:image/png;base64,").ok_or("PNG-Icon erforderlich")?;use base64::Engine;let bytes=base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_|"Ungültiges Icon")?;let image=image::load_from_memory(&bytes).map_err(|_|"Ungültiges PNG")?;if image.width()!=64||image.height()!=64{return Err("Icon muss 64 × 64 Pixel groß sein.".into());}fs::write(dir.join("server-icon.png"),bytes).await.map_err(|e|e.to_string())?;Some(data)}else{None};
  let server=HostedServer{id,name:input.name.trim().into(),slug:input.slug,software:input.software,version:input.version,ram_mb:input.ram_mb,max_players:input.max_players,port:input.port,automatic_port:input.port==0,java_major,icon};
  fs::write(dir.join("server.json"),serde_json::to_vec_pretty(&server).map_err(|e|e.to_string())?).await.map_err(|e|e.to_string())?;Ok(server)
 }.await;
    if setup.is_err() {
        let _ = fs::remove_dir_all(&dir).await;
    }
    setup
}
#[tauri::command]
pub async fn hosting_start(id: Uuid) -> Result<(), String> {
    let _start_guard = START_LOCK.lock().await;
    if let Some(run) = RUNNING.lock().await.get(&id) {
        if !matches!(run.status.lock().await.as_str(), "stopped" | "failed") {
            return Err("Server läuft bereits.".into());
        }
    }
    let mut config = read(id).await?;
    let listener = tokio::net::TcpListener::bind((
        "127.0.0.1",
        if config.automatic_port {
            0
        } else {
            config.port
        },
    ))
    .await
    .map_err(|_| {
        format!(
            "Port {} ist auf diesem PC belegt. Wähle beim Anlegen einen anderen Port.",
            config.port
        )
    })?;
    config.port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let properties = directory(id).join("server.properties");
    let current = fs::read_to_string(&properties)
        .await
        .map_err(|e| e.to_string())?;
    let filtered = current
        .lines()
        .filter(|line| !line.starts_with("server-port=") && !line.starts_with("server-ip="))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(
        &properties,
        format!(
            "{filtered}\nserver-port={}\nserver-ip=127.0.0.1\n",
            config.port
        ),
    )
    .await
    .map_err(|e| e.to_string())?;
    fs::write(
        directory(id).join("server.json"),
        serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    let java = JavaDownloadService::new()
        .get_or_download_java(config.java_major, &JavaDistribution::Zulu, None)
        .await
        .map_err(|e| e.to_string())?;
    let mut command = tokio::process::Command::new(java);
    command
        .current_dir(directory(id))
        .args([
            "-Xms512M",
            &format!("-Xmx{}M", config.ram_mb),
            "-jar",
            "server.jar",
            "nogui",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    drop(listener);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Serverausgabe fehlt")?;
    let stderr = child.stderr.take().ok_or("Serverausgabe fehlt")?;
    let mut stdin = child.stdin.take().ok_or("Servereingabe fehlt")?;
    let (tx, mut rx) = mpsc::channel::<String>(32);
    let run = Arc::new(Running {
        tx,
        status: Mutex::new("starting".into()),
        logs: Mutex::new(VecDeque::new()),
        relay: Mutex::new(None),
        public_status: Mutex::new(String::new()),
    });
    RUNNING.lock().await.insert(id, run.clone());
    for reader in [
        Box::new(stdout) as Box<dyn tokio::io::AsyncRead + Unpin + Send>,
        Box::new(stderr),
    ] {
        let r = run.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.contains("Done (") {
                    *r.status.lock().await = "running".into();
                }
                log(&r, line).await;
            }
        });
    }
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(300));
        let mut stopping = None;
        loop {
            tokio::select! {
             cmd=rx.recv()=>{if let Some(cmd)=cmd{if cmd=="stop"{*run.status.lock().await="stopping".into();stopping=Some(tokio::time::Instant::now());}let _=stdin.write_all(format!("{cmd}\n").as_bytes()).await;}},
             _=tick.tick()=>{match child.try_wait(){Ok(Some(status))=>{*run.status.lock().await=if status.success(){"stopped"}else{"failed"}.into();log(&run,format!("Prozess beendet: {status}")).await;break;},Err(e)=>{log(&run,e.to_string()).await;*run.status.lock().await="failed".into();break;},_=>{}}
              if stopping.is_some_and(|t:tokio::time::Instant|t.elapsed()>Duration::from_secs(30)){let _=child.kill().await;*run.status.lock().await="stopped".into();break;}}
            }
        }
        if let Some(task) = run.relay.lock().await.take() {
            task.abort();
        }
        *run.public_status.lock().await = String::new();
    });
    Ok(())
}
#[tauri::command]
pub async fn hosting_command(id: Uuid, command: String) -> Result<(), String> {
    if command.trim().is_empty() || command.len() > 512 || command.contains(['\n', '\r']) {
        return Err("Ungültiger Konsolenbefehl.".into());
    }
    let run = RUNNING
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Server läuft nicht")?;
    run.tx
        .send(command)
        .await
        .map_err(|_| "Server läuft nicht".into())
}
#[tauri::command]
pub async fn hosting_logs(id: Uuid) -> Result<Vec<String>, String> {
    let run = RUNNING.lock().await.get(&id).cloned();
    if let Some(r) = run {
        Ok(r.logs.lock().await.iter().cloned().collect())
    } else {
        Ok(Vec::new())
    }
}
#[tauri::command]
pub async fn hosting_folder(app_handle: tauri::AppHandle, id: Uuid) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    read(id).await?;
    app_handle
        .opener()
        .open_path(directory(id).to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
async fn websocket(
    path: &str,
    token: &str,
) -> Result<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>, String>
{
    let mut request = format!("{WS}{path}")
        .into_client_request()
        .map_err(|e| e.to_string())?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {token}")
            .parse()
            .map_err(|_| "Ungültige Anmeldung")?,
    );
    tokio::time::timeout(Duration::from_secs(15), connect_async(request))
        .await
        .map_err(|_| "Verbindung dauert zu lange")?
        .map(|(ws, _)| ws)
        .map_err(|_| "Tunnelverbindung fehlgeschlagen".into())
}
async fn stream(id: Uuid, port: u16, token: String) -> Result<(), String> {
    let tcp = tokio::time::timeout(
        Duration::from_secs(5),
        TcpStream::connect(("127.0.0.1", port)),
    )
    .await
    .map_err(|_| "Lokaler Server antwortet nicht")?
    .map_err(|e| e.to_string())?;
    let (mut read, mut write) = tcp.into_split();
    let ws = websocket(&format!("/hosting/stream/{id}"), &token).await?;
    let (mut sender, mut receiver) = ws.split();
    let mut buf = [0u8; 4096];
    loop {
        tokio::select! {
         result=read.read(&mut buf)=>{let n=result.map_err(|e|e.to_string())?;if n==0{break;}sender.send(Message::Binary(buf[..n].to_vec().into())).await.map_err(|e|e.to_string())?;},
         msg=receiver.next()=>{match msg{Some(Ok(Message::Binary(data)))=>write.write_all(&data).await.map_err(|e|e.to_string())?,Some(Ok(Message::Ping(p)))=>sender.send(Message::Pong(p)).await.map_err(|e|e.to_string())?,Some(Ok(Message::Close(_)))|None=>break,Some(Err(_))=>break,_=>{}}}
        }
    }
    let _ = sender.close().await;
    Ok(())
}
#[tauri::command]
pub async fn hosting_share(id: Uuid, enabled: bool) -> Result<Value, String> {
    let config = read(id).await?;
    let run = RUNNING
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or("Bitte den Server zuerst starten.")?;
    let mut relay = run.relay.lock().await;
    if let Some(task) = relay.take() {
        task.abort();
    }
    *run.public_status.lock().await = String::new();
    if !enabled {
        return Ok(json!({}));
    }
    if *run.status.lock().await != "running" {
        return Err("Bitte warten, bis der Server vollständig gestartet ist.".into());
    }
    let reservation = api(
        reqwest::Method::POST,
        "/hosting/servers",
        json!({"id":id,"slug":config.slug}),
    )
    .await?;
    let address = text(&reservation, "address")?.to_owned();
    let initial_token = token().await?;
    let initial = websocket(&format!("/hosting/control/{id}"), &initial_token).await?;
    let r = run.clone();
    let address_clone = address.clone();
    *relay = Some(tokio::spawn(async move {
        let mut connection = Some(initial);
        let mut auth = initial_token;
        let mut streams = tokio::task::JoinSet::new();
        loop {
            let mut ws = match connection.take() {
                Some(ws) => ws,
                None => {
                    *r.public_status.lock().await = "Verbindung wird wiederhergestellt …".into();
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    auth = match token().await {
                        Ok(t) => t,
                        Err(_) => continue,
                    };
                    match websocket(&format!("/hosting/control/{id}"), &auth).await {
                        Ok(ws) => ws,
                        Err(_) => continue,
                    }
                }
            };
            while let Some(msg) = ws.next().await {
                match msg {
                    Ok(Message::Text(t)) => {
                        if let Ok(v) = serde_json::from_str::<Value>(&t) {
                            if v["type"] == "ready" {
                                *r.public_status.lock().await = address_clone.clone();
                            } else if v["type"] == "open" {
                                if let Some(s) =
                                    v["id"].as_str().and_then(|s| Uuid::parse_str(s).ok())
                                {
                                    if streams.len() < 100 {
                                        let token = auth.clone();
                                        let port = config.port;
                                        streams.spawn(async move {
                                            let _ = stream(s, port, token).await;
                                        });
                                    }
                                }
                            }
                        }
                    }
                    Ok(Message::Ping(p)) => {
                        if ws.send(Message::Pong(p)).await.is_err() {
                            break;
                        }
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
                while streams.try_join_next().is_some() {}
            }
            streams.abort_all();
        }
    }));
    Ok(json!({"address":address}))
}
#[tauri::command]
pub async fn hosting_release(id: Uuid) -> Result<(), String> {
    api(
        reqwest::Method::DELETE,
        &format!("/hosting/servers/{id}"),
        Value::Null,
    )
    .await?;
    Ok(())
}

pub async fn shutdown_hosted_servers() {
    let runs: Vec<_> = RUNNING.lock().await.values().cloned().collect();
    for r in &runs {
        let _ = r.tx.send("stop".into()).await;
    }
    for _ in 0..110 {
        let mut active = false;
        for r in &runs {
            if matches!(
                r.status.lock().await.as_str(),
                "running" | "starting" | "stopping"
            ) {
                active = true;
            }
        }
        if !active {
            return;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}
