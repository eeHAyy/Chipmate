import { useState, useEffect, useCallback, useRef } from "react";
import SerialPanel from "./components/SerialPanel";
import ChatPanel from "./components/ChatPanel";
import ChipPanel from "./components/ChipPanel";
import { healthCheck } from "./components/api";
import SettingsPanel from "./components/SettingsPanel";
import FlashPanel from "./components/FlashPanel";
import type { BackendStatus, DiagnosticRequest, SerialLine } from "./components/api";
import { t, getLang, setLang } from "./i18n";

function getInitialTheme(): "dark" | "light" {
  const saved = localStorage.getItem("chipmate-theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function App() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [selectedChip, setSelectedChip] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSerial, setShowSerial] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [bottomH, setBottomH] = useState(320);
  const [diagnosticRequest, setDiagnosticRequest] = useState<DiagnosticRequest | null>(null);
  const diagnosticId = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("chipmate-theme", theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const tick = () => {
      healthCheck()
        .then(() => { if (alive) setBackendStatus("online"); })
        .catch(() => {
          if (!alive) return;
          setBackendStatus("offline");
          timer = window.setTimeout(tick, 1200);
        });
    };
    tick();
    return () => { alive = false; if (timer) window.clearTimeout(timer); };
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  }, []);

  const onDiagnose = useCallback((line: SerialLine) => {
    if (!line.error) return;
    diagnosticId.current += 1;
    setDiagnosticRequest({
      id: diagnosticId.current,
      message: [
        "请分析以下嵌入式串口故障，并给出可执行的排查步骤和修复建议。",
        "故障级别：" + line.error.severity,
        "串口日志：" + line.text,
        "匹配原因：" + line.error.cause,
        "已有建议：" + line.error.fix
      ].join("\n")
    });
  }, []);

  const startDrag = useCallback((dir: "h" | "v") => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startW = sidebarWidth, startH = bottomH;
    const onMove = (ev: MouseEvent) => {
      if (dir === "h") setSidebarWidth(Math.min(500, Math.max(180, startW + ev.clientX - startX)));
      else setBottomH(Math.min(window.innerHeight - 160, Math.max(140, startH + startY - ev.clientY)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = dir === "h" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth, bottomH]);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
      {showSidebar && (
        <>
          <div style={{ width: sidebarWidth, minWidth: 180, maxWidth: 500, flexShrink: 0 }}>
            <ChipPanel
              selectedChip={selectedChip}
              onSelectChip={setSelectedChip}
              backendStatus={backendStatus}
            />
          </div>
          <div onMouseDown={startDrag("h")} title="拖拽调整侧栏宽度"
            style={{ width: 4, cursor: "col-resize", background: "var(--border)", flexShrink: 0, userSelect: "none" }} />
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
        <header style={{
          padding: "10px 18px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)"
        }}>
          <span onClick={() => setShowSidebar(!showSidebar)}
            style={{ cursor: "pointer", fontSize: 18, color: "var(--text)" }}>☰</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>ChipMate</span>
          {selectedChip && (
            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 8,
              background: "rgba(108,92,231,0.15)", color: "var(--accent)" }}>
              {selectedChip}
            </span>
          )}

          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span onClick={() => setShowSettings(true)} title={t("settings.title")} style={{ fontSize: 16, cursor: "pointer", padding: "2px 6px", color: "var(--text-muted)", userSelect: "none" }}>⚙</span>
            <span onClick={() => setLang(getLang() === "zh" ? "en" : "zh")} title={t("theme")}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                color: "var(--accent)", border: "1px solid var(--border)", userSelect: "none", fontWeight: 600 }}>
              {getLang() === "zh" ? "EN" : "中"}
            </span>
            <span onClick={toggleTheme} title={t("theme")}
              style={{ fontSize: 16, cursor: "pointer", padding: "2px 6px", borderRadius: 4,
                color: "var(--text-muted)", userSelect: "none" }}>
              {theme === "dark" ? "☀️" : "🌙"}
            </span>
            <span onClick={() => { setShowFlash(false); setShowSerial(!showSerial); }}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6,
                cursor: "pointer", background: showSerial ? "var(--accent)" : "var(--bg)",
                color: showSerial ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)", transition: "all 0.2s" }}>
              ⚡ {t("serial")}
            </span>
            <span onClick={() => { setShowSerial(false); setShowFlash(!showFlash); }}
              style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6,
                cursor: "pointer", background: showFlash ? "var(--accent)" : "var(--bg)",
                color: showFlash ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)", transition: "all 0.2s" }}>
              🔥 {t("flash")}
            </span>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10,
              background: backendStatus === "online" ? "rgba(0,184,148,0.15)" : "rgba(225,112,85,0.15)",
              color: backendStatus === "online" ? "var(--success)" : "var(--error)" }}>
              {backendStatus === "online" ? t("online") : t("offline")}
            </span>
          </span>
        </header>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <ChatPanel selectedChip={selectedChip} diagnosticRequest={diagnosticRequest} onOpenSettings={() => setShowSettings(true)} />
          </div>

          {(showSerial || showFlash) && (
            <div onMouseDown={startDrag("v")} title="拖拽调整面板高度"
              style={{ height: 4, cursor: "row-resize", background: "var(--border)", flexShrink: 0, userSelect: "none" }} />
          )}

          {showSerial && (
            <div style={{ height: bottomH, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <SerialPanel selectedChip={selectedChip} onDiagnose={onDiagnose} />
            </div>
          )}
          {showFlash && (
            <div style={{ height: bottomH, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <FlashPanel />
            </div>
          )}
        </div>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
