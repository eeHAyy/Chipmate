import { useState, useEffect, useCallback } from "react";
import * as api from "./api--codex";
import { t } from "../i18n";

interface SettingsData {
  base_url: string;
  model: string;
  has_key: boolean;
  note?: string;
}

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<SettingsData>({
    base_url: "https://api.deepseek.com",
    model: "deepseek-chat",
    has_key: false,
  });
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.getChatSettings().then(setSettings).catch(() => {});
  }, []);

  const resolveNote = useCallback((note?: string) => {
    if (!note) return t("settings.preset_hint");
    if (note.startsWith("placeholder-")) {
      return t("settings.preset_" + note.replace("placeholder-", ""));
    }
    return note;
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setMsg("");
    try {
      const body: Record<string, string> = {};
      if (apiKey.trim()) body.api_key = apiKey.trim();
      if (settings.base_url !== "https://api.deepseek.com") body.base_url = settings.base_url;
      if (settings.model !== "deepseek-chat") body.model = settings.model;
      await api.updateChatSettings(body);
      setMsg(t("settings.saved"));
      setApiKey("");
    } catch {
      setMsg("Save failed");
    }
    setSaving(false);
  }, [apiKey, settings]);

  const clearKey = useCallback(async () => {
    setSaving(true);
    setMsg("");
    try {
      await api.updateChatSettings({ api_key: "" });
      setSettings(s => ({ ...s, has_key: false }));
      setApiKey("");
      setMsg("API Key cleared");
    } catch {
      setMsg("Clear failed");
    }
    setSaving(false);
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.5)"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg-card)", borderRadius: 12, padding: 24,
        width: 420, maxWidth: "90vw", maxHeight: "80vh", overflow: "auto",
        border: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>AI {t("settings.title")}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
            API Key {settings.has_key ? <span style={{ color: "var(--success)", fontSize: 11, fontWeight: 400 }}>✓</span> : <span style={{ color: "var(--warning)", fontSize: 11, fontWeight: 400 }}>{t("settings.not_configured")}</span>}
          </label>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={settings.has_key ? t("settings.keep_existing") : "sk-..."}
            type="password"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none" }} />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            {t("settings.get_key")}<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>platform.deepseek.com</a>
            {settings.has_key && (
              <button onClick={clearKey} disabled={saving}
                style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--error)", background: "transparent", color: "var(--error)", fontSize: 11, cursor: "pointer" }}>
                清除 Key
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>{t("settings.base_url")}</label>
          <input value={settings.base_url} onChange={e => setSettings(s => ({ ...s, base_url: e.target.value }))}
            placeholder="https://api.deepseek.com"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none" }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {[
              ["DeepSeek", "https://api.deepseek.com", "deepseek-chat", "placeholder-deepseek"],
              ["豆包", "https://ark.cn-beijing.volces.com/api/v3/", "doubao-pro-32k", "placeholder-doubao"],
              ["Ollama", "http://127.0.0.1:11434/v1", "qwen2.5:7b", "placeholder-ollama"],
              ["OpenAI", "https://api.openai.com/v1", "gpt-4o-mini", "placeholder-openai"],
            ].map(([label, url, model, note]) => (
              <button key={label} onClick={() => setSettings(s => ({ ...s, base_url: url, model, note }))}
                style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border)", background: settings.base_url === url ? "var(--accent)" : "transparent", color: settings.base_url === url ? "#fff" : "var(--text-muted)", fontSize: 11, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            {resolveNote(settings.note)}：
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>{t("settings.model")}</label>
          <input value={settings.model} onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
            placeholder="deepseek-chat"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none" }} />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            DeepSeek: deepseek-chat | OpenAI: gpt-4o-mini | Ollama: qwen2.5:7b
          </div>
        </div>

        {msg && <div style={{ fontSize: 13, color: msg.includes("失败") ? "var(--error)" : "var(--success)", marginBottom: 12 }}>{msg}</div>}

        <button onClick={save} disabled={saving}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? t("settings.saving") : t("settings.save")}
        </button>

        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {t("settings.footer1")}<br />
          {t("settings.footer2")}
        </div>
      </div>
    </div>
  );
}
