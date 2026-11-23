import { useState, useEffect, useRef, useCallback } from "react";
import type { DragEvent } from "react";
import { listChips, uploadDatasheet, searchChip } from "./api";
import type { BackendStatus, ChipInfo } from "./api";
import { t } from "../i18n";

interface ChipPanelProps {
  selectedChip: string;
  onSelectChip: (chip: string) => void;
  backendStatus: BackendStatus;
}

export default function ChipPanel({ selectedChip, onSelectChip, backendStatus }: ChipPanelProps) {
  const [chips, setChips] = useState<ChipInfo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const inpRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try { setChips(await listChips()); } catch {}
  }, []);

  useEffect(() => { if (backendStatus === "online") load(); }, [backendStatus, load]);

  const onUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const d = await uploadDatasheet(file, "");
      onSelectChip(d.chip);
      load();
    } catch {}
    setUploading(false);
  }, [onSelectChip, load]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".pdf")) onUpload(f);
  }, [onUpload]);

  const filtered = chips.filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <aside style={{ width: "100%", minWidth: 0, background: "var(--bg-card)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{t("chip.manage")}</div>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inpRef.current?.click()}
          style={{ border: "2px dashed " + (dragOver ? "var(--accent)" : "var(--border)"), borderRadius: 8, padding: "14px", textAlign: "center", cursor: "pointer", fontSize: 12, color: "var(--text-muted)", background: dragOver ? "rgba(108,92,231,0.1)" : "transparent" }}>
          {uploading ? t("chip.parsing") : t("chip.drop")}
        </div>
        <input ref={inpRef} type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
      </div>
      <div style={{ padding: "8px 14px" }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("chip.search")}
          style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none" }} />
      </div>
      <nav style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map(c => (
          <div key={c.name} onClick={() => onSelectChip(c.name)}
            style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13, background: selectedChip === c.name ? "rgba(108,92,231,0.15)" : "transparent", borderLeft: selectedChip === c.name ? "3px solid var(--accent)" : "3px solid transparent" }}>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.has_pinmap ? t("chip.parsed") : t("chip.upload")} · {c.manufacturer}</div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
