const BASE = "http://127.0.0.1:8720";

export type BackendStatus = "checking" | "online" | "offline";
export type SerialSeverity = "critical" | "warning" | "info";
export type ApiStatus = "ok" | "error";

export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface ChipInfo {
  name: string;
  manufacturer: string;
  has_datasheet: boolean;
  has_pinmap: boolean;
}

export interface UploadDatasheetResponse {
  status: ApiStatus;
  chip: string;
  pins_count?: number;
  registers_count?: number;
  chapters_count?: number;
  error?: string;
}

export interface SearchResult {
  chip: string;
  query: string;
  pin_results: Record<string, unknown>[];
  register_results: Record<string, unknown>[];
  chapter_results: Record<string, unknown>[];
}

export interface ChatResponse {
  reply: string;
  sources: string[];
}

export interface SerialFault {
  pattern: string;
  severity: SerialSeverity;
  cause: string;
  fix: string;
}

export interface SerialLine {
  text: string;
  raw_hex: string;
  ts: number;
  error: SerialFault | null;
}

export interface DiagnosticRequest {
  id: number;
  message: string;
}

export interface SerialStatusResponse {
  connected: boolean;
  simulating: boolean;
  port: string;
  baudrate: number;
  line_count: number;
}

export interface SerialConnectResponse {
  status: ApiStatus;
  port?: string;
  baudrate?: number;
  bytesize?: number;
  parity?: string;
  stopbits?: number;
  message?: string;
  detail?: string;
}

export interface StatusResponse {
  status: ApiStatus;
}

export interface SerialLinesResponse {
  lines: SerialLine[];
  rx_bytes?: number;
}

export interface SerialPortInfo {
  device: string;
  description: string;
  vid?: number | null;
  pid?: number | null;
  manufacturer?: string;
}

export async function healthCheck(): Promise<HealthResponse> {
  const r = await fetch(BASE + "/health");
  return r.json();
}

export async function listChips(): Promise<ChipInfo[]> {
  const r = await fetch(BASE + "/datasheet/chips");
  return r.json();
}

export async function uploadDatasheet(file: File, chipName: string): Promise<UploadDatasheetResponse> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("chip_name", chipName || file.name.replace(/\.pdf$/i, ""));
  const r = await fetch(BASE + "/datasheet/upload", { method: "POST", body: fd });
  return r.json();
}

export async function searchChip(name: string, query: string): Promise<SearchResult> {
  const q = query ? "?query=" + encodeURIComponent(query) : "";
  const r = await fetch(BASE + "/datasheet/search/" + name + q);
  return r.json();
}

export async function chat(message: string, chipName: string, history?: {role:string;content:string}[]): Promise<ChatResponse> {
  const r = await fetch(BASE + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, chip_name: chipName || "", history: history || [] })
  });
  return r.json();
}

/** 流式聊天：通过 SSE 逐块接收，onChunk 每收到一段文本就回调 */
export async function chatStream(
  message: string,
  chipName: string,
  onChunk: (text: string) => void,
  onError?: (err: string) => void,
  signal?: AbortSignal,
  history?: {role:string;content:string}[],
): Promise<void> {
  const r = await fetch(BASE + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, chip_name: chipName || "", stream: true, history: history || [] }),
    signal
  });

  if (!r.body) {
    onError?.("后端未返回流式数据");
    return;
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) onChunk(parsed.content);
          if (parsed.error) onError?.(parsed.error);
        } catch { /* 跳过非 JSON 行 */ }
      }
    }
  }
}

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  const r = await fetch(BASE + "/serial/ports");
  return r.json();
}

export async function checkFlashTool(): Promise<{ok:boolean;version?:string;hint?:string}> {
  const r = await fetch(BASE + "/flash/check");
  return r.json();
}

export async function uploadHex(file: File): Promise<{status:string;filename:string;size:number}> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(BASE + "/flash/upload", { method: "POST", body: fd });
  return r.json();
}

export interface FlashBurnRequest {
  filename: string;
  protocol: string;
  port: string;
  baudrate: number;
  autoreset: boolean;
}

/** 流式烧录：SSE 逐行回调 */
export async function flashBurn(
  req: FlashBurnRequest,
  onLog: (line: string) => void,
  onDone: (code: number) => void,
): Promise<void> {
  const r = await fetch(BASE + "/flash/burn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });
  if (!r.body) { onLog("后端未返回数据流"); return; }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("{")) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.type === "log") onLog(evt.data);
        else if (evt.type === "cmd") onLog("$ " + evt.data);
        else if (evt.type === "error") onLog("⚠ " + evt.data);
        else if (evt.type === "done") onDone(evt.code);
      } catch {}
    }
  }
}

export async function serialSimulateStart(): Promise<StatusResponse> {
  const r = await fetch(BASE + "/serial/simulate/start", { method: "POST" });
  return r.json();
}

export async function serialSimulateStop(): Promise<StatusResponse> {
  const r = await fetch(BASE + "/serial/simulate/stop", { method: "POST" });
  return r.json();
}

export async function serialStatus(): Promise<SerialStatusResponse> {
  const r = await fetch(BASE + "/serial/status");
  return r.json();
}

export async function serialConnect(port: string, baudrate: number, bytesize?: number, parity?: string, stopbits?: number): Promise<SerialConnectResponse> {
  const r = await fetch(BASE + "/serial/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port, baudrate, bytesize: bytesize ?? 8, parity: parity ?? "N", stopbits: stopbits ?? 1 })
  });
  return r.json();
}

export async function serialDisconnect(): Promise<StatusResponse> {
  const r = await fetch(BASE + "/serial/disconnect", { method: "POST" });
  return r.json();
}

export async function serialLines(since: number): Promise<SerialLinesResponse> {
  const r = await fetch(BASE + "/serial/lines?since=" + (since || 0));
  return r.json();
}

export async function getChatSettings(): Promise<{base_url:string;model:string;has_key:boolean}> {
  const r = await fetch(BASE + "/chat/settings");
  if (!r.ok) throw new Error("获取设置失败");
  return r.json();
}

export async function updateChatSettings(body: {api_key?:string;base_url?:string;model?:string}): Promise<{status:string}> {
  const r = await fetch(BASE + "/chat/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error("保存设置失败");
  return r.json();
}

export async function serialSend(data: string, hexMode: boolean, newline?: boolean): Promise<StatusResponse> {
  let url = BASE + "/serial/send?data=" + encodeURIComponent(data);
  if (hexMode) url += "&hex=1";
  if (newline === false) url += "&newline=0";
  const r = await fetch(url, { method: "POST" });
  return r.json();
}

