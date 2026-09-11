import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Server,
  Plus,
  Play,
  Square,
  FolderOpen,
  Copy,
  Terminal,
  Globe,
  X,
  LoaderCircle,
  HardDrive,
  Users,
  ArrowUpRight,
  ImagePlus,
} from "lucide-react";
import { useThemeStore } from "../../store/useThemeStore";
import { openExternalUrl } from "../../services/tauri-service";
import "./ServerHostingTab.css";

type LocalServer = {
  id: string;
  name: string;
  slug: string;
  software: string;
  version: string;
  ramMb: number;
  maxPlayers: number;
  port: number;
  status: string;
  publicStatus: string;
  icon?: string;
};
const statusLabels: Record<string, string> = {
  stopped: "Gestoppt",
  starting: "Startet …",
  running: "Läuft",
  stopping: "Wird beendet …",
  failed: "Start fehlgeschlagen",
};
const softwareOptions = [
  ["vanilla", "Vanilla"],
  ["paper", "Paper"],
  ["purpur", "Purpur"],
  ["fabric", "Fabric"],
  ["folia", "Folia"],
];
const errorText = (e: unknown) =>
  typeof e === "string"
    ? e
    : e instanceof Error
      ? e.message
      : JSON.stringify(e);
export function ServerHostingTab() {
  const accent = useThemeStore((s) => s.accentColor.value);
  const [servers, setServers] = useState<LocalServer[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [creating, setCreating] = useState(false),
    [consoleId, setConsoleId] = useState<string | null>(null),
    [copied, setCopied] = useState("");
  const refresh = useCallback(async () => {
    try {
      setServers(await invoke<LocalServer[]>("hosting_list"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  const action = async (
    id: string,
    command: string,
    args: Record<string, unknown> = {},
  ) => {
    setBusy(id);
    setError("");
    try {
      await invoke(command, { id, ...args });
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };
  const copy = async (value: string) => {
    try {
      await writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(""), 2000);
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section
      className="hosting-page"
      style={{ "--hosting-accent": accent } as React.CSSProperties}
    >
      <header className="hosting-heading">
        <div>
          <div className="hosting-eyebrow">NEBREL / MULTIPLAYER</div>
          <h1>Server-Hosting</h1>
          <p>Deine Welt. Dein PC. Zusammen mit deinen Freunden.</p>
        </div>
        <button className="hosting-primary" onClick={() => setCreating(true)}>
          <Plus size={19} />
          Neuer Server
        </button>
      </header>
      <div className="hosting-info">
        <span>
          <HardDrive size={17} />
          Läuft auf deinem PC
        </span>
        <span>
          <Globe size={17} />
          Freigabe ohne Router-Einstellungen
        </span>
        <span>
          <Users size={17} />
          {servers.length} Server
        </span>
      </div>
      {error && (
        <div className="hosting-error" role="alert">
          {error}
          <button aria-label="Meldung schließen" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {loading ? (
        <div className="hosting-empty">
          <LoaderCircle className="hosting-spin" />
          <p>Server werden geladen …</p>
        </div>
      ) : servers.length === 0 ? (
        <div className="hosting-empty">
          <div className="hosting-empty-icon">
            <Server size={38} />
          </div>
          <h2>Dein nächstes Abenteuer wartet.</h2>
          <p>
            Erstelle deinen ersten Minecraft-Server und lade deine Freunde ein.
          </p>
          <button className="hosting-primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            Server erstellen
          </button>
          <small>
            Der Server ist erreichbar, solange dein PC und Nebrel laufen.
          </small>
        </div>
      ) : (
        <div className="hosting-grid">
          {servers.map((s) => {
            const running = ["running", "starting", "stopping"].includes(
                s.status,
              ),
              working = busy === s.id,
              publicOnline = s.publicStatus.includes(".");
            return (
              <article className="hosting-card" key={s.id}>
                <div className="hosting-card-top">
                  <div className="hosting-server-icon">
                    {s.icon ? (
                      <img src={s.icon} alt="" />
                    ) : (
                      <Server size={28} />
                    )}
                  </div>
                  <div>
                    <h2>{s.name}</h2>
                    <span
                      className={`hosting-status ${s.status === "running" ? "is-online" : ""}`}
                    >
                      <i />
                      {statusLabels[s.status] ?? s.status}
                    </span>
                  </div>
                  <button
                    className="hosting-icon-button"
                    title="Serverordner öffnen"
                    aria-label="Serverordner öffnen"
                    onClick={() => void action(s.id, "hosting_folder")}
                  >
                    <FolderOpen size={19} />
                  </button>
                </div>
                <div className="hosting-specs">
                  <span>
                    {s.software}
                    <strong>{s.version}</strong>
                  </span>
                  <span>
                    Speicher<strong>{s.ramMb / 1024} GB</strong>
                  </span>
                  <span>
                    Spielerlimit<strong>{s.maxPlayers}</strong>
                  </span>
                </div>
                <div className="hosting-address">
                  <Globe size={17} />
                  <div>
                    <small>
                      {publicOnline
                        ? "Öffentlich erreichbar"
                        : "Gewünschte Serveradresse"}
                    </small>
                    <strong>
                      {publicOnline ? s.publicStatus : `${s.slug}.nebrel.de`}
                    </strong>
                  </div>
                  {publicOnline && (
                    <button
                      title="Adresse kopieren"
                      aria-label="Adresse kopieren"
                      onClick={() => void copy(s.publicStatus)}
                    >
                      <Copy size={17} />
                    </button>
                  )}
                </div>
                {s.publicStatus && !publicOnline && (
                  <p className="hosting-hint">{s.publicStatus}</p>
                )}
                <div className="hosting-actions">
                  <button
                    disabled={working || s.status === "stopping"}
                    className={
                      running ? "hosting-secondary" : "hosting-primary"
                    }
                    onClick={() =>
                      void action(
                        s.id,
                        running ? "hosting_command" : "hosting_start",
                        running ? { command: "stop" } : {},
                      )
                    }
                  >
                    {working ? (
                      <LoaderCircle size={17} className="hosting-spin" />
                    ) : running ? (
                      <Square size={16} />
                    ) : (
                      <Play size={17} />
                    )}{" "}
                    {running ? "Stoppen" : "Starten"}
                  </button>
                  <button
                    className="hosting-secondary"
                    onClick={() => setConsoleId(s.id)}
                  >
                    <Terminal size={17} />
                    Konsole
                  </button>
                  <button
                    className="hosting-secondary"
                    disabled={working || s.status !== "running"}
                    onClick={() =>
                      void action(s.id, "hosting_share", {
                        enabled: !s.publicStatus,
                      })
                    }
                  >
                    <Globe size={17} />
                    {s.publicStatus
                      ? "Freigabe beenden"
                      : "Für Freunde freigeben"}
                  </button>
                </div>
                {s.status === "running" && (
                  <button
                    className="hosting-local"
                    onClick={() => void copy(`127.0.0.1:${s.port}`)}
                  >
                    Lokale Adresse kopieren <ArrowUpRight size={13} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {copied && (
        <div role="status" className="hosting-toast">
          Adresse kopiert: {copied}
        </div>
      )}
      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void refresh();
          }}
        />
      )}
      {consoleId && (
        <ConsoleDialog
          id={consoleId}
          name={servers.find((s) => s.id === consoleId)?.name ?? "Server"}
          onClose={() => setConsoleId(null)}
        />
      )}
    </section>
  );
}
function CreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [versions, setVersions] = useState<string[]>([]),
    [version, setVersion] = useState(""),
    [software, setSoftware] = useState("vanilla"),
    [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [ram, setRam] = useState(4096),
    [players, setPlayers] = useState(20),
    [port, setPort] = useState(0),
    [eula, setEula] = useState(false),
    [icon, setIcon] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    invoke<string[]>("hosting_versions")
      .then((v) => {
        if (!cancelled) {
          setVersions(v);
          setVersion(v[0] ?? "");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await invoke("hosting_create", {
        input: {
          name,
          slug,
          software,
          version,
          ramMb: ram,
          maxPlayers: players,
          port,
          acceptEula: eula,
          icon: icon ?? null,
        },
      });
      onCreated();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const pickIcon = async (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "image/png" || f.size > 75000) {
      setError("Bitte ein PNG mit 64 × 64 Pixeln und maximal 75 KB wählen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setIcon(String(reader.result));
    reader.readAsDataURL(f);
  };
  return (
    <dialog
      ref={dialog}
      className="hosting-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <div className="hosting-eyebrow">DEIN EIGENER SERVER</div>
            <h2>Neuen Server anlegen</h2>
          </div>
          <button
            type="button"
            aria-label="Schließen"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <fieldset disabled={busy}>
          <button
            className="hosting-icon-upload"
            type="button"
            onClick={() => file.current?.click()}
          >
            {icon ? (
              <img src={icon} alt="Server-Icon" />
            ) : (
              <ImagePlus size={33} />
            )}
            <span>
              Server-Icon wählen<small>PNG · 64 × 64 Pixel</small>
            </span>
          </button>
          <input
            ref={file}
            hidden
            type="file"
            accept="image/png"
            onChange={(e) => void pickIcon(e.target.files?.[0])}
          />
          <label>
            Servername
            <input
              autoFocus
              required
              maxLength={80}
              placeholder="Pauls Server"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")
                    .slice(0, 40),
                );
              }}
            />
          </label>
          <label>
            Deine Adresse
            <div className="hosting-slug">
              <input
                required
                minLength={3}
                maxLength={40}
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                value={slug}
                placeholder="pauls-server"
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
              />
              <span>.nebrel.de</span>
            </div>
            <small>
              Der Name wird bei der ersten Freigabe auf Verfügbarkeit geprüft.
            </small>
          </label>
          <div className="hosting-fields">
            <label>
              Speicher (RAM)
              <select
                value={ram}
                onChange={(e) => setRam(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 6, 8, 10, 16, 32].map((g) => (
                  <option key={g} value={g * 1024}>
                    {g} GB
                  </option>
                ))}
              </select>
            </label>
            <label>
              Maximale Spieler
              <input
                type="number"
                min={1}
                max={100}
                required
                value={players}
                onChange={(e) => setPlayers(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="hosting-fields">
            <label>
              Server-Software
              <select
                value={software}
                onChange={(e) => setSoftware(e.target.value)}
              >
                {softwareOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Minecraft-Version
              <select
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              >
                {versions.length === 0 && (
                  <option value="">Versionen werden geladen …</option>
                )}
                {versions.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <details>
            <summary>Erweiterte Einstellungen</summary>
            <label>
              Lokaler Port
              <input
                type="number"
                min={0}
                max={65535}
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
              <small>
                0 = automatisch. Keine Portfreigabe im Router nötig.
              </small>
            </label>
          </details>
          <label className="hosting-check">
            <input
              type="checkbox"
              checked={eula}
              onChange={(e) => setEula(e.target.checked)}
              required
            />
            <span>
              Ich akzeptiere die{" "}
              <button
                type="button"
                onClick={() =>
                  void openExternalUrl("https://www.minecraft.net/eula")
                }
              >
                Minecraft-EULA
              </button>
              .
            </span>
          </label>
        </fieldset>
        {error && (
          <p className="hosting-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="hosting-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button
            className="hosting-primary"
            disabled={busy || !version || !eula}
          >
            {busy ? (
              <LoaderCircle size={18} className="hosting-spin" />
            ) : (
              <Plus size={18} />
            )}{" "}
            {busy ? "Server wird heruntergeladen …" : "Server erstellen"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
function ConsoleDialog({
  id,
  name,
  onClose,
}: {
  id: string;
  name: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    output = useRef<HTMLPreElement>(null);
  const [lines, setLines] = useState<string[]>([]),
    [command, setCommand] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    const refresh = () =>
      invoke<string[]>("hosting_logs", { id })
        .then((v) => {
          if (live) setLines(v);
        })
        .catch((e) => {
          if (live) setError(errorText(e));
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [lines]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await invoke("hosting_command", { id, command });
      setCommand("");
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <dialog
      ref={ref}
      className="hosting-dialog hosting-console"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{name} · Konsole</h2>
        <button onClick={onClose} aria-label="Schließen">
          <X />
        </button>
      </header>
      <pre ref={output}>
        {lines.length
          ? lines.join("\n")
          : "Noch keine Ausgabe. Starte den Server, um seine Konsole zu sehen."}
      </pre>
      {error && (
        <p role="alert" className="hosting-error">
          {error}
        </p>
      )}
      <form onSubmit={send}>
        <input
          autoFocus
          aria-label="Konsolenbefehl"
          placeholder="Befehl eingeben, z. B. list"
          maxLength={512}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <button className="hosting-primary" disabled={!command.trim()}>
          Senden
        </button>
      </form>
    </dialog>
  );
}
