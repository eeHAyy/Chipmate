import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import * as api from "./api--codex";
import type { DiagnosticRequest } from "./api--codex";

const STORAGE_KEY = "chipmate-chat-msgs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  selectedChip: string;
  diagnosticRequest: DiagnosticRequest | null;
}

function loadMsgs(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveMsgs(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50)));
  } catch {}
}

/** Markdown 渲染组件：支持 GFM 表格 + 代码高亮 */
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const code = String(children).replace(/\n$/, "");
          if (match) {
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{ margin: 0, borderRadius: 6, fontSize: 13 }}
              >
                {code}
              </SyntaxHighlighter>
            );
          }
          return (
            <code className={className} {...props}
              style={{ background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>
              {children}
            </code>
          );
        },
        table({ children }) {
          return (
            <div style={{ overflowX: "auto", margin: "8px 0" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return <th style={{ border: "1px solid var(--border)", padding: "6px 10px", background: "rgba(108,92,231,0.15)", textAlign: "left" }}>{children}</th>;
        },
        td({ children }) {
          return <td style={{ border: "1px solid var(--border)", padding: "4px 10px" }}>{children}</td>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function ChatPanel({ selectedChip, diagnosticRequest }: ChatPanelProps) {
  const ref = useRef<HTMLElement | null>(null);
  const lastDiagnosticId = useRef(0);
  const firstLoad = useRef(true);
  const userAtBottom = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>(loadMsgs);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // 每次 msgs 变化时持久化（跳过首次加载）
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    saveMsgs(msgs);
  }, [msgs]);

  useEffect(() => {
    if (userAtBottom.current) {
      ref.current?.scrollTo(0, ref.current.scrollHeight);
    }
  }, [msgs]);

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clearMsgs = useCallback(() => {
    setMsgs([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;
    setMsgs(prev => [...prev, { role: "user", content: message }]);

    const msgIdx = msgs.length + 1;
    setMsgs(prev => [...prev, { role: "assistant", content: "" }]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let fullContent = "";
    try {
      const historyMsgs = msgs.slice(0, msgIdx).filter(m => m.content).map(m => ({ role: m.role, content: m.content }));
      await api.chatStream(
        message,
        selectedChip,
        (chunk) => {
          fullContent += chunk;
          setMsgs(prev => {
            const newMsgs = [...prev];
            if (newMsgs[msgIdx]) {
              newMsgs[msgIdx] = { ...newMsgs[msgIdx], content: fullContent };
            }
            return newMsgs;
          });
        },
        (err) => {
          setMsgs(prev => {
            const newMsgs = [...prev];
            if (newMsgs[msgIdx]) {
              newMsgs[msgIdx] = { ...newMsgs[msgIdx], content: "⚠ " + err };
            }
            return newMsgs;
          });
        },
        controller.signal,
        historyMsgs
      );
    } catch (e: unknown) {
      const isAbort = e && typeof e === "object" && "name" in e && (e as {name:string}).name === "AbortError";
      if (!isAbort) {
        setMsgs(prev => {
          const newMsgs = [...prev];
          if (newMsgs[msgIdx]) {
            newMsgs[msgIdx] = { ...newMsgs[msgIdx], content: "☠ 后端未连接" };
          }
          return newMsgs;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [selectedChip, msgs.length]);

  const send = useCallback(() => {
    if (!input.trim() || loading) return;
    const message = input;
    setInput("");
    sendMessage(message);
  }, [input, sendMessage, loading]);

  useEffect(() => {
    if (!diagnosticRequest || diagnosticRequest.id <= lastDiagnosticId.current) return;
    lastDiagnosticId.current = diagnosticRequest.id;
    sendMessage(diagnosticRequest.message);
  }, [diagnosticRequest, sendMessage]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <main ref={ref} onScroll={() => {
        const el = ref.current;
        if (!el) return;
        userAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }} style={{
        flex: 1, overflowY: "auto", padding: "16px 20px",
        display: "flex", flexDirection: "column", gap: 12
      }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: "center", marginTop: "15vh", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>欢迎使用 ChipMate</div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              左侧拖入 PDF 手册 → AI 自动解析<br />
              点击 ⚡ 串口 → 连接硬件实时调试<br />
              错误自动识别，一键分析
            </div>
          </div>
        )}
        {msgs.length > 0 && (
          <div style={{ textAlign: "center", marginBottom: 4 }}>
            <button onClick={clearMsgs}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", padding: "4px 12px", borderRadius: 4 }}
              title="清空聊天记录">🗑 清空记录</button>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%", padding: "10px 15px", borderRadius: 12,
            background: m.role === "user" ? "var(--accent)" : "var(--bg-card)",
            fontSize: 14, lineHeight: 1.65,
            overflowWrap: "break-word",
            wordBreak: "break-word",
          }}>
            {m.role === "user" ? (
              <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
            ) : m.content === "" && loading ? (
              <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "dotBounce 1.4s infinite ease-in-out both" }} />
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "dotBounce 1.4s infinite ease-in-out both", animationDelay: "0.2s" }} />
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "dotBounce 1.4s infinite ease-in-out both", animationDelay: "0.4s" }} />
              </span>
            ) : (
              <MarkdownContent content={m.content} />
            )}
          </div>
        ))}
      </main>
      <footer style={{
        padding: "10px 18px", borderTop: "1px solid var(--border)",
        display: "flex", gap: 8, background: "var(--bg-card)", flexShrink: 0,
        alignItems: "flex-end"
      }}>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={selectedChip ? "向 " + selectedChip + " 提问..." : "输入芯片型号或技术问题..."}
          disabled={loading}
          rows={1}
          style={{
            flex: 1, padding: "9px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--bg)",
            color: "var(--text)", fontSize: 14, outline: "none", resize: "none",
            fontFamily: "inherit", lineHeight: 1.5
          }}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 160) + "px";
          }} />
        {loading ? (
          <button onClick={stopGenerating}
            style={{
              padding: "9px 16px", borderRadius: 8, border: "none",
              background: "var(--error)", color: "#fff", fontSize: 14,
              cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4
            }}>
            ■ 停止
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim()}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: "var(--accent)", color: "#fff", fontSize: 14,
              cursor: input.trim() ? "pointer" : "default",
              fontWeight: 600, opacity: input.trim() ? 1 : 0.5
            }}>
            发送
          </button>
        )}
      </footer>
    </div>
  );
}


