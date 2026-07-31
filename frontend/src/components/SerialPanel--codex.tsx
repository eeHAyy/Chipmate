import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./api--codex";
import type { SerialLine, SerialSeverity, SerialPortInfo } from "./api--codex";

const SEVERITY_COLORS: Record<SerialSeverity, string> = {
  critical: "var(--error)", warning: "var(--warning)", info: "var(--text-muted)"
};

interface SerialPanelProps {
  selectedChip: string;
  onDiagnose: (line: SerialLine) => void;
}

/* ===== Toolbar ===== */
function SerialToolbar({ ports, port, setPort, baud, setBaud, connected, simulating, onConnect, onDisconnect, onSimulate, onStopSimulate,
  paused, setPaused, hexView, setHexView, showTs, setShowTs, autoScroll, setAutoScroll,
  hexSend, setHexSend, lines, exportLogs, setLines, rxBytes, txBytes }: {
    ports: SerialPortInfo[]; port: string; setPort: (v: string) => void;
    baud: number; setBaud: (v: number) => void;
    connected: boolean; simulating: boolean;
    onConnect: () => void; onDisconnect: () => void; onSimulate: () => void; onStopSimulate: () => void;
    paused: boolean; setPaused: (v: boolean) => void;
    hexView: boolean; setHexView: (v: boolean) => void;
    showTs: boolean; setShowTs: (v: boolean) => void;
    autoScroll: boolean; setAutoScroll: (v: boolean) => void;
    hexSend: boolean; setHexSend: (v: boolean) => void;
    lines: SerialLine[]; exportLogs: (fmt: "txt" | "csv") => void; setLines: (v: SerialLine[]) => void;
    rxBytes: number; txBytes: number;
  }) {
  const Btn = { p: "3px 8px", r: 4, b: "1px solid var(--border)", bg: "transparent", c: "var(--text-muted)", f: 11, cur: "pointer" };
  return (
    <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border)", background: "#0d0e14", flexWrap: "wrap" }}>
      <select value={port} onChange={e => setPort(e.target.value)}
        style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, maxWidth: 260 }}>
        {ports.length > 0
          ? ports.map(p => {
              const desc = p.description.replace(/\(COM\d+\)/g, "").trim();
              return <option key={p.device} value={p.device}>{desc ? p.device + " — " + desc : p.device}</option>;
            })
          : <option>未检测到串口</option>}
      </select>
      <select value={baud} onChange={e => setBaud(Number(e.target.value))}
        style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}>
        {[9600,19200,38400,57600,115200,230400,460800,921600].map(b => <option key={b}>{b}</option>)}
      </select>
      {simulating ? (
        <button onClick={onStopSimulate} title="停止模拟数据" style={{ padding: "3px 12px", borderRadius: 4, border: "none", background: "var(--error)", color: "#fff", fontSize: 11, cursor: "pointer" }}>停止模拟</button>
      ) : connected ? (
        <button onClick={onDisconnect} title="点击断开连接"
          style={{ padding: "3px 12px", borderRadius: 4, border: "1px solid var(--success)", background: "rgba(0,184,148,0.15)", color: "var(--success)", fontSize: 11, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)", display: "inline-block" }} />
          已连接 {port}
        </button>
      ) : (
        <>
          <button onClick={onConnect} title="连接真实串口" style={{ padding: "3px 12px", borderRadius: 4, border: "none", background: "var(--success)", color: "#fff", fontSize: 11, cursor: "pointer" }}>连接</button>
          <button onClick={onSimulate} title="无需硬件，生成模拟串口日志" style={{ padding: "3px 12px", borderRadius: 4, border: "1px dashed var(--warning)", background: "transparent", color: "var(--warning)", fontSize: 11, cursor: "pointer" }}>模拟</button>
        </>
      )}
      <button onClick={() => setPaused(!paused)} title="暂停/继续" style={Btn}>{paused ? "▶" : "⏸"}</button>
      <button onClick={() => setHexView(!hexView)} title="Hex 视图" style={{ ...Btn, background: hexView ? "var(--accent)" : "transparent", color: hexView ? "#fff" : "var(--text-muted)" }}>HEX</button>
      <button onClick={() => setShowTs(!showTs)} title="时间戳" style={{ ...Btn, background: showTs ? "rgba(108,92,231,0.2)" : "transparent", color: showTs ? "var(--accent)" : "var(--text-muted)" }}>TS</button>
      <button onClick={() => setAutoScroll(!autoScroll)} title="自动滚动" style={Btn}>{autoScroll ? "↓" : "⏬"}</button>
      <button onClick={() => setHexSend(!hexSend)} title="Hex 发送模式" style={{ ...Btn, background: hexSend ? "var(--accent)" : "transparent", color: hexSend ? "#fff" : "var(--text-muted)" }}>HEX发</button>
      <button onClick={() => exportLogs("txt")} disabled={lines.length === 0} title="导出 TXT" style={{ ...Btn, cursor: lines.length === 0 ? "default" : "pointer", color: lines.length === 0 ? "var(--border)" : "var(--text-muted)" }}>TXT</button>
      <button onClick={() => exportLogs("csv")} disabled={lines.length === 0} title="导出 CSV" style={{ ...Btn, cursor: lines.length === 0 ? "default" : "pointer", color: lines.length === 0 ? "var(--border)" : "var(--text-muted)" }}>CSV</button>
      <button onClick={() => setLines([])} style={Btn}>清空</button>
      <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)", fontFamily: "Consolas, monospace" }}>
        RX {rxBytes} / TX {txBytes}
      </span>
    </div>
  );
}

/* ===== Advanced Params Row ===== */
function SerialParamsRow({ bytesize, setBytesize, parity, setParity, stopbits, setStopbits,
  appendNewline, setAppendNewline, autoSend, setAutoSend, autoSendInterval, setAutoSendInterval }: {
    bytesize: number; setBytesize: (v: number) => void;
    parity: string; setParity: (v: string) => void;
    stopbits: number; setStopbits: (v: number) => void;
    appendNewline: boolean; setAppendNewline: (v: boolean) => void;
    autoSend: boolean; setAutoSend: (v: boolean) => void;
    autoSendInterval: number; setAutoSendInterval: (v: number) => void;
  }) {
  const Sel = { padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 11 };
  const Btn = { p: "3px 8px", r: 4, b: "1px solid var(--border)", bg: "transparent", c: "var(--text-muted)", f: 11, cur: "pointer" };
  return (
    <div style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border)", background: "#0d0e14", flexWrap: "wrap" }}>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>数据位</span>
      <select value={bytesize} onChange={e => setBytesize(Number(e.target.value))} style={Sel}>
        {[8,7,6,5].map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>校验</span>
      <select value={parity} onChange={e => setParity(e.target.value)} style={Sel}>
        <option value="N">无</option>
        <option value="E">偶</option>
        <option value="O">奇</option>
        <option value="M">标记</option>
        <option value="S">空格</option>
      </select>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>停止位</span>
      <select value={stopbits} onChange={e => setStopbits(Number(e.target.value))} style={Sel}>
        {[1,1.5,2].map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <button onClick={() => setAppendNewline(!appendNewline)} title="发送时追加 CRLF"
        style={{ ...Btn, background: appendNewline ? "rgba(108,92,231,0.2)" : "transparent", color: appendNewline ? "var(--accent)" : "var(--text-muted)" }}>
        {appendNewline ? "\\r\\n" : "无换行"}
      </button>
      <button onClick={() => setAutoSend(!autoSend)} title="定时发送"
        style={{ ...Btn, background: autoSend ? "var(--accent)" : "transparent", color: autoSend ? "#fff" : "var(--text-muted)" }}>
        定时{autoSend ? "开" : "关"}
      </button>
      {autoSend && (
        <>
          <input type="number" value={autoSendInterval} min={10} max={60000}
            onChange={e => setAutoSendInterval(Number(e.target.value) || 1000)}
            style={{ width: 70, ...Sel, fontFamily: "Consolas, monospace" }} />
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>ms</span>
        </>
      )}
    </div>
  );
}

/* ===== Quick Cmds ===== */
function SerialQuickCmds({ cmds, onSend }: { cmds: string[]; onSend: (c: string, h: boolean) => void }) {
  return (
    <div style={{ padding: "4px 12px", display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--border)", background: "#0d0e14" }}>
      {cmds.map((c, i) => (
        <button key={i} onClick={() => onSend(c, false)}
          style={{ padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontFamily: "Consolas, monospace", fontSize: 10, cursor: "pointer", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.replace("\\r\\n", "")}
        </button>
      ))}
    </div>
  );
}

/* ===== Search Bar ===== */
function SerialSearchBar({ search, setSearch, filterOnly, setFilterOnly, matchCount }: {
  search: string; setSearch: (v: string) => void;
  filterOnly: boolean; setFilterOnly: (v: boolean) => void;
  matchCount: number;
}) {
  return (
    <div style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--border)", background: "#0d0e14" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🔍</span>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="搜索日志..."
        style={{ flex: 1, padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, fontFamily: "Consolas, monospace", outline: "none" }} />
      <button onClick={() => setFilterOnly(!filterOnly)} title="只显示匹配行"
        style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: filterOnly ? "var(--accent)" : "transparent", color: filterOnly ? "#fff" : "var(--text-muted)", fontSize: 11, cursor: "pointer" }}>
        过滤
      </button>
      {search && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{matchCount} 条</span>}
      {search && (
        <button onClick={() => setSearch("")} title="清除搜索"
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>✕</button>
      )}
    </div>
  );
}

/* ===== Highlight helper ===== */
function highlightText(text: string, search: string) {
  if (!search) return text;
  const q = search.toLowerCase();
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={idx} style={{ background: "var(--warning)", color: "#1a1a1a", borderRadius: 2, padding: "0 1px" }}>
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
  }
  return parts;
}

/* ===== Log View ===== */
function SerialLogView({ innerRef, lines, hexView, showTs, onErrorClick, search, filterOnly }: {
  innerRef: React.Ref<HTMLDivElement>;
  lines: SerialLine[]; hexView: boolean; showTs: boolean;
  onErrorClick: (line: SerialLine) => void;
  search: string; filterOnly: boolean;
}) {
  const q = search.trim().toLowerCase();
  const visible = q
    ? lines.filter(l => {
        const target = hexView ? l.raw_hex : l.text;
        return target.toLowerCase().includes(q);
      })
    : lines;

  if (q && filterOnly && visible.length === 0) {
    return (
      <div ref={innerRef} style={{ flex: 1, overflowY: "auto", padding: "4px 12px", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, background: "#0a0b10", color: "var(--text-muted)", textAlign: "center", paddingTop: 40 }}>
        没有匹配 " {search} " 的日志
      </div>
    );
  }

  return (
    <div ref={innerRef} style={{ flex: 1, overflowY: "auto", padding: "4px 12px", fontFamily: "Consolas, monospace", fontSize: 12, lineHeight: 1.6, background: "#0a0b10" }}>
      {(q && filterOnly ? visible : lines).map((l, i) => {
        const content = hexView ? l.raw_hex : l.text;
        const display = q && !filterOnly ? highlightText(content, q) : content;
        return (
          <div key={i} onClick={() => l.error && onErrorClick(l)}
            style={{ color: l.error ? SEVERITY_COLORS[l.error.severity] || "var(--text)" : "var(--text-muted)", cursor: l.error ? "pointer" : "default", padding: "1px 4px", borderRadius: 2, background: l.error ? "rgba(225,112,85,0.08)" : "transparent" }}>
            {showTs ? "[" + new Date(l.ts * 1000).toLocaleTimeString() + "] " : ""}{display}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Input Area ===== */
function SerialInput({ input, setInput, onSend, onKey, inpRef }: {
  input: string; setInput: (v: string) => void;
  onSend: () => void; onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inpRef: React.Ref<HTMLInputElement>;
}) {
  return (
    <div style={{ padding: "6px 12px", display: "flex", gap: 6, borderTop: "1px solid var(--border)", background: "#0d0e14" }}>
      <input ref={inpRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
        placeholder="发送 (Enter 发送, ↑↓ 历史)"
        style={{ flex: 1, padding: "5px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, fontFamily: "Consolas, monospace", outline: "none" }} />
      <button onClick={onSend}
        style={{ padding: "5px 12px", borderRadius: 4, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, cursor: "pointer" }}>发送</button>
    </div>
  );
}

/* ===== Main ===== */
export default function SerialPanel({ selectedChip, onDiagnose }: SerialPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inpRef = useRef<HTMLInputElement | null>(null);
  const lastTs = useRef(0);

  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [port, setPort] = useState("COM3");
  const [baud, setBaud] = useState(115200);
  const [bytesize, setBytesize] = useState(8);
  const [parity, setParity] = useState("N");
  const [stopbits, setStopbits] = useState(1);
  const [connected, setConnected] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [lines, setLines] = useState<SerialLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [hexView, setHexView] = useState(false);
  const [hexSend, setHexSend] = useState(false);
  const [showTs, setShowTs] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [appendNewline, setAppendNewline] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [autoSendInterval, setAutoSendInterval] = useState(1000);
  const [rxBytes, setRxBytes] = useState(0);
  const [txBytes, setTxBytes] = useState(0);
  const [search, setSearch] = useState("");
  const [filterOnly, setFilterOnly] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [cmds] = useState(["AT\\r\\n", "AT+GMR\\r\\n", "help\\r\\n"]);

  useEffect(() => { api.listSerialPorts().then(setPorts).catch(() => {}); }, []);

  const startPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (paused) return;
      try {
        const d = await api.serialLines(lastTs.current);
        if (d.lines && d.lines.length > 0) {
          setLines(prev => [...prev, ...d.lines].slice(-500));
          lastTs.current = d.lines[d.lines.length - 1].ts + 0.001;
        }
        if (typeof d.rx_bytes === "number") setRxBytes(d.rx_bytes);
      } catch {}
    }, 500);
  }, [paused]);

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  // 以后端真实状态为准，周期性同步连接状态
  useEffect(() => {
    if (!connected && !simulating) return;
    const iv = setInterval(async () => {
      try {
        const s = await api.serialStatus();
        setConnected(s.connected);
        setSimulating(s.simulating);
      } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, [connected, simulating]);

  useEffect(() => { if (autoScroll) ref.current?.scrollTo(0, ref.current.scrollHeight); }, [lines, autoScroll, search, filterOnly]);

  // 定时发送
  useEffect(() => {
    if (!autoSend || !connected) return;
    const iv = setInterval(() => {
      if (input.trim()) doSend(input, hexSend);
    }, Math.max(10, autoSendInterval));
    return () => clearInterval(iv);
  }, [autoSend, connected, autoSendInterval, input, hexSend]);

  const onConnect = useCallback(async () => {
    try {
      if (simulating) await api.serialSimulateStop();
      const r = await api.serialConnect(port, baud, bytesize, parity, stopbits);
      if (r.status !== "ok") {
        alert("连接失败：" + (r.message || r.detail || "未知错误"));
        return;
      }
      setConnected(true);
      setSimulating(false);
      lastTs.current = 0;
      setLines([]);
      setRxBytes(0);
      setTxBytes(0);
      startPoll();
    } catch (e) {
      alert("连接失败：" + String(e));
    }
  }, [port, baud, bytesize, parity, stopbits, startPoll, simulating]);

  const onDisconnect = useCallback(async () => {
    await api.serialDisconnect();
    setConnected(false);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const onSimulate = useCallback(async () => {
    if (connected) await api.serialDisconnect();
    await api.serialSimulateStart();
    setSimulating(true);
    setConnected(false);
    lastTs.current = 0;
    setLines([]);
    setRxBytes(0);
    startPoll();
  }, [connected, startPoll]);

  const onStopSimulate = useCallback(async () => {
    await api.serialSimulateStop();
    setSimulating(false);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const doSend = useCallback(async (text: string, isHex: boolean) => {
    if (!text) return;
    if (isHex) {
      const clean = text.replace(/[\s]/g, "");
      if (!/^[0-9a-fA-F]+$/.test(clean)) { alert("Hex 发送失败：包含非法字符\n只允许 0-9 A-F 和空格"); return; }
      if (clean.length % 2 !== 0) { alert("Hex 数据长度必须为偶数"); return; }
      const ok = await api.serialSend(clean, true, false);
      if (ok.status === "ok") setTxBytes(n => n + clean.length / 2);
    } else {
      const ok = await api.serialSend(text, false, appendNewline);
      if (ok.status === "ok") setTxBytes(n => n + text.length + (appendNewline ? 2 : 0));
    }
    setHistory(prev => [...prev, (isHex ? "[HEX] " : "") + text].slice(-20));
  }, [appendNewline]);

  const onSend = useCallback(async () => {
    if (!input) return;
    await doSend(input, hexSend);
    setHIdx(-1);
    setInput("");
    inpRef.current?.focus();
  }, [input, hexSend, doSend]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); onSend(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = hIdx < history.length - 1 ? hIdx + 1 : hIdx; setInput(history[history.length - 1 - n] || ""); setHIdx(n); }
    else if (e.key === "ArrowDown") { e.preventDefault(); const n = hIdx > 0 ? hIdx - 1 : -1; setInput(n >= 0 ? history[history.length - 1 - n] : ""); setHIdx(n); }
  }, [onSend, history, hIdx]);

  const onErrorClick = useCallback((line: SerialLine) => {
    if (!line.error) return;
    onDiagnose(line);
  }, [onDiagnose]);

  const exportLogs = useCallback((format: "txt" | "csv") => {
    try {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:]/g, "-");
      const q = search.trim().toLowerCase();
      const exportLines = q ? lines.filter(l => l.text.toLowerCase().includes(q)) : lines;
      if (format === "txt") {
        const txt = exportLines.map(l => "[" + new Date(l.ts * 1000).toLocaleString() + "] " + l.text).join("\n");
        const blob = new Blob([txt], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "chipmate-log-" + ts + ".txt";
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const csv = "Timestamp,Text,Severity,Cause,Fix\n" + exportLines.map(l =>
          '"' + new Date(l.ts * 1000).toLocaleString() + '","' +
          l.text.replace(/"/g, '""') + '","' +
          (l.error?.severity || "") + '","' +
          (l.error?.cause || "").replace(/"/g, '""') + '","' +
          (l.error?.fix || "").replace(/"/g, '""') + '"'
        ).join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "chipmate-log-" + ts + ".csv";
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (e) { console.error("export error", e); }
  }, [lines, search]);

  const q = search.trim().toLowerCase();
  const matchCount = q
    ? lines.filter(l => (hexView ? l.raw_hex : l.text).toLowerCase().includes(q)).length
    : lines.length;

  return (
    <>
      <SerialToolbar
        ports={ports} port={port} setPort={setPort} baud={baud} setBaud={setBaud}
        connected={connected} simulating={simulating} onConnect={onConnect} onDisconnect={onDisconnect} onSimulate={onSimulate} onStopSimulate={onStopSimulate}
        paused={paused} setPaused={setPaused} hexView={hexView} setHexView={setHexView}
        showTs={showTs} setShowTs={setShowTs} autoScroll={autoScroll} setAutoScroll={setAutoScroll}
        hexSend={hexSend} setHexSend={setHexSend}
        lines={lines} exportLogs={exportLogs} setLines={setLines}
        rxBytes={rxBytes} txBytes={txBytes}
      />
      <SerialParamsRow
        bytesize={bytesize} setBytesize={setBytesize}
        parity={parity} setParity={setParity}
        stopbits={stopbits} setStopbits={setStopbits}
        appendNewline={appendNewline} setAppendNewline={setAppendNewline}
        autoSend={autoSend} setAutoSend={setAutoSend}
        autoSendInterval={autoSendInterval} setAutoSendInterval={setAutoSendInterval}
      />
      <SerialQuickCmds cmds={cmds} onSend={doSend} />
      <SerialSearchBar search={search} setSearch={setSearch} filterOnly={filterOnly} setFilterOnly={setFilterOnly} matchCount={matchCount} />
      <SerialLogView innerRef={ref} lines={lines} hexView={hexView} showTs={showTs} onErrorClick={onErrorClick} search={search} filterOnly={filterOnly} />
      <SerialInput input={input} setInput={setInput} onSend={onSend} onKey={onKey} inpRef={inpRef} />
    </>
  );
}
