import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./api--codex";
import type { SerialPortInfo } from "./api--codex";

const PROTOCOLS: [string, string][] = [
  ["auto", "自动检测"],
  ["stc15", "STC15 (新)"],
  ["stc15a", "STC15 (旧)"],
  ["stc8", "STC8A/8F"],
  ["stc8g", "STC8G/8H"],
  ["stc12", "STC12"],
  ["stc89", "STC89/90"],
];

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

function logColor(line: string): string {
  if (line.startsWith("✓")) return "var(--success)";
  if (line.startsWith("✗") || line.startsWith("⚠") || line.startsWith("ERROR")) return "var(--error)";
  if (line.startsWith("$")) return "var(--accent)";
  if (line.includes("Wait for MCU") || line.includes("握手") || line.includes("断电")) return "var(--warning)";
  return "var(--text-muted)";
}

export default function FlashPanel() {
  const logRef = useRef<HTMLDivElement | null>(null);
  const [toolOk, setToolOk] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [protocol, setProtocol] = useState("auto");
  const [port, setPort] = useState("");
  const [baud, setBaud] = useState(115200);
  const [autoreset, setAutoreset] = useState(false);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [burning, setBurning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const inpRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.checkFlashTool().then(d => setToolOk(d.ok)).catch(() => setToolOk(false));
    api.listSerialPorts().then(setPorts).catch(() => {});
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [logs]);

  const onPickFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!/\.(hex|bin)$/i.test(f.name)) { alert("只支持 .hex / .bin 文件"); return; }
    setFile(f);
    setLogs([]);
  }, []);

  const startBurn = useCallback(async () => {
    if (!file) { alert("请先选择 HEX 文件"); return; }
    if (!port) { alert("请选择串口"); return; }
    setBurning(true);
    setLogs([]);
    try {
      const up = await api.uploadHex(file);
      if (up.status !== "ok") { alert("上传失败"); setBurning(false); return; }
      setLogs(prev => [...prev, "✓ 已上传 " + up.filename + " (" + up.size + " 字节)"]);
      await api.flashBurn(
        { filename: up.filename, protocol, port, baudrate: baud, autoreset },
        (line) => setLogs(prev => [...prev, line]),
        (code) => {
          setLogs(prev => [...prev, code === 0 ? "✓ 烧录完成，校验通过" : "✗ 烧录失败 (退出码 " + code + ")"]);
          setBurning(false);
        }
      );
    } catch (e) {
      setLogs(prev => [...prev, "⚠ " + String(e)]);
      setBurning(false);
    }
  }, [file, port, protocol, baud, autoreset]);

  const fieldLabel: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontWeight: 500 };
  const fieldCtrl: React.CSSProperties = { width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, outline: "none" };

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* ===== 左列：配置区 ===== */}
      <div style={{ width: 280, minWidth: 280, padding: 14, borderRight: "1px solid var(--border)", background: "#0d0e14", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        {/* 工具状态 */}
        <div style={{ fontSize: 11, padding: "6px 10px", borderRadius: 6,
          background: toolOk === null ? "rgba(253,203,110,0.1)" : toolOk ? "rgba(0,184,148,0.1)" : "rgba(225,112,85,0.1)",
          color: toolOk === null ? "var(--warning)" : toolOk ? "var(--success)" : "var(--error)" }}>
          {toolOk === null ? "⏳ 检查烧录工具..." : toolOk ? "✓ stcgal 已就绪" : "✗ 未安装 stcgal\npip install stcgal"}
        </div>

        {/* 文件卡片 */}
        <div>
          <div style={fieldLabel}>固件文件</div>
          <div onClick={() => inpRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); onPickFile(e.dataTransfer.files?.[0] || null); }}
            style={{
              border: "2px dashed " + (dragOver ? "var(--accent)" : file ? "var(--success)" : "var(--border)"),
              borderRadius: 10, padding: "18px 12px", textAlign: "center", cursor: "pointer",
              background: dragOver ? "rgba(108,92,231,0.1)" : file ? "rgba(0,184,148,0.06)" : "transparent",
              transition: "all 0.2s",
            }}>
            {file ? (
              <>
                <div style={{ fontSize: 28, marginBottom: 4 }}>📦</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", wordBreak: "break-all" }}>{file.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{file.size} 字节</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 4 }}>📁</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>点击选择或拖入<br />HEX / BIN 文件</div>
              </>
            )}
          </div>
          <input ref={inpRef} type="file" accept=".hex,.bin" hidden onChange={e => onPickFile(e.target.files?.[0] || null)} />
        </div>

        {/* 参数表单 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={fieldLabel}>芯片型号</div>
            <select value={protocol} onChange={e => setProtocol(e.target.value)} style={fieldCtrl}>
              {PROTOCOLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>串口</div>
            <select value={port} onChange={e => setPort(e.target.value)} style={fieldCtrl}>
              <option value="">选择串口...</option>
              {ports.map(p => {
                const desc = p.description.replace(/\(COM\d+\)/g, "").trim();
                return <option key={p.device} value={p.device}>{desc ? p.device + " — " + desc : p.device}</option>;
              })}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>波特率</div>
            <select value={baud} onChange={e => setBaud(Number(e.target.value))} style={fieldCtrl}>
              {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text)", cursor: "pointer", padding: "4px 0" }}>
              <input type="checkbox" checked={autoreset} onChange={e => setAutoreset(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              自动断电重启 (DTR)
            </label>
          </div>
        </div>

        {/* 烧录按钮 */}
        <button onClick={startBurn} disabled={burning || !file || !port}
          style={{
            padding: "12px", borderRadius: 8, border: "none",
            background: burning ? "var(--border)" : "linear-gradient(135deg, #6c5ce7, #a55eea)",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: burning ? "default" : "pointer",
            opacity: !file || !port ? 0.5 : 1, transition: "all 0.2s",
            boxShadow: burning ? "none" : "0 2px 10px rgba(108,92,231,0.3)",
          }}>
          {burning ? "⏳ 烧录中..." : "🔥 开始烧录"}
        </button>

        {/* 冷启动提示 */}
        <div style={{ fontSize: 11, color: "var(--warning)", lineHeight: 1.6, padding: "8px 10px", borderRadius: 6, background: "rgba(253,203,110,0.08)", border: "1px solid rgba(253,203,110,0.2)" }}>
          💡 点击"开始烧录"后，等待日志出现握手提示，再给 MCU <b>断电上电</b>，stcgal 将自动完成擦除、下载和校验。
        </div>
      </div>

      {/* ===== 右列：日志区 ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--border)", background: "#0d0e14", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>烧录日志</span>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--success)" }}>✓ 成功</span>
            <span style={{ fontSize: 10, color: "var(--error)" }}>✗ 失败</span>
            <span style={{ fontSize: 10, color: "var(--warning)" }}>! 握手</span>
          </div>
        </div>
        <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: "10px 14px", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.7, background: "#0a0b10" }}>
          {logs.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 40, color: "var(--text-muted)", fontSize: 12, lineHeight: 2 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>🔥</div>
              选择固件并点击开始烧录<br />实时日志将显示在这里
            </div>
          )}
          {logs.map((l, i) => (
            <div key={i} style={{ color: logColor(l), whiteSpace: "pre-wrap" }}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
