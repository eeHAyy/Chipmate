import re
import json
import os
from pathlib import Path
from typing import Optional
from pypdf import PdfReader

from . import paths

DATA_DIR = paths.data_dir()
CHIPS_DIR = DATA_DIR / "chips"


class DatasheetParser:

    PIN_PATTERNS = [
        re.compile(
            r"((?:P[A-K]\d{1,2}|GPIO\d{1,2}))\s+.*?(?:Input|Output|I/O|Analog|GPIO|TIM|USART|UART|SPI|I2C|ADC|DAC)",
            re.IGNORECASE
        ),
        re.compile(
            r"^((?:P[A-K]\d{1,2}|GPIO\d{1,2}))\s+([A-Z]{2,4})?\s*(.*?)$",
            re.MULTILINE | re.IGNORECASE
        ),
    ]

    REGISTER_PATTERNS = [
        re.compile(
            r"(0x[0-9A-Fa-f]{2,8})\s+(\w+)\s+(.*?)(?=\s+0x[0-9A-Fa-f]{2,8}|\Z)",
            re.DOTALL
        ),
        re.compile(
            r"(\w+)\s+(?:Register|REG|寄存器)\s*(?:Address|地址)?\s*(0x[0-9A-Fa-f]{2,8})",
            re.IGNORECASE
        ),
    ]

    def __init__(self, pdf_path: str, chip_name: str):
        self.pdf_path = pdf_path
        self.chip_name = chip_name
        self.chip_dir = CHIPS_DIR / chip_name
        self.chip_dir.mkdir(parents=True, exist_ok=True)
        self.full_text = ""
        self.chapters: list[dict] = []

    def parse(self) -> dict:
        self._extract_text()
        self._split_chapters()
        pinmap = self._extract_pinmap() or self._extract_with_llm(self.full_text, "pinmap")
        registers = self._extract_registers() or self._extract_with_llm(self.full_text, "registers")
        result = {
            "chip": self.chip_name,
            "chapters": self.chapters,
            "pinmap": pinmap,
            "registers": registers,
        }
        self._save(result)
        return result

    def _extract_text(self):
        reader = PdfReader(self.pdf_path)
        pages_text = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages_text.append(text)
        self.full_text = "\n".join(pages_text)

    def _split_chapters(self):
        chapter_split = re.split(
            r"(?:\n|\r\n)\s*(\d+(?:\.\d+)*)\s+([A-Z][A-Za-z\s\-/]{3,60})(?:\n|\r\n)",
            self.full_text
        )
        self.chapters = []
        i = 1
        while i < len(chapter_split) - 1:
            section_id = chapter_split[i].strip()
            section_title = chapter_split[i + 1].strip()
            section_body = chapter_split[i + 2].strip() if i + 2 < len(chapter_split) else ""
            self.chapters.append({
                "id": section_id,
                "title": section_title,
                "body": section_body[:5000],
            })
            i += 3

    def _extract_pinmap(self) -> list[dict]:
        pins = []
        seen = set()

        for ch in self.chapters:
            if not any(kw in ch["title"].lower() for kw in ["pin", "package", "ball", "lqfp", "bga"]):
                if not any(kw in ch["body"].lower() for kw in ["pin ", "pins ", "pinout"]):
                    continue

            lines = ch["body"].split("\n")
            for line in lines:
                for pat in self.PIN_PATTERNS:
                    m = pat.search(line)
                    if m:
                        pin_name = m.group(1).upper().strip()
                        if pin_name not in seen:
                            seen.add(pin_name)
                            funcs = m.group(2) if m.lastindex and m.lastindex >= 2 else ""
                            desc = m.group(m.lastindex) if m.lastindex else ""
                            pins.append({
                                "name": pin_name,
                                "functions": [f.strip() for f in funcs.split("/") if f.strip()] if funcs else [],
                                "description": desc.strip()[:200],
                            })
                        break

        if not pins:
            pin_candidates = set()
            for line in self.full_text.split("\n"):
                m = re.match(r"^((?:P[A-K]\d{1,2}|GPIO\d{1,2}))\b", line.strip(), re.IGNORECASE)
                if m:
                    pin_candidates.add(m.group(1).upper())

            for name in sorted(pin_candidates, key=lambda x: (re.sub(r"\d+", "", x), int(re.search(r"\d+", x).group())))[:200]:
                if name not in seen:
                    pins.append({"name": name, "functions": [], "description": ""})

        return pins

    def _extract_registers(self) -> list[dict]:
        registers = []
        seen = set()

        for ch in self.chapters:
            if not any(kw in ch["title"].lower() for kw in ["register", "reg", "memory", "map"]):
                continue

            for pat in self.REGISTER_PATTERNS:
                for m in pat.finditer(ch["body"]):
                    if pat == self.REGISTER_PATTERNS[0]:
                        addr = m.group(1)
                        name = m.group(2)
                        desc = m.group(3)[:200] if m.lastindex and m.lastindex >= 3 else ""
                    else:
                        name = m.group(1)
                        addr = m.group(2)
                        desc = ""

                    key = f"{name}_{addr}"
                    if key not in seen:
                        seen.add(key)
                        registers.append({
                            "name": name,
                            "address": addr,
                            "description": desc.strip()[:200],
                        })

        return registers
    def _extract_with_llm(self, text: str, extract_type: str) -> list[dict]:
        from openai import OpenAI
        from . import settings_store as cfg

        saved = cfg.load()
        api_key = os.getenv("DEEPSEEK_API_KEY", "") or saved.get("api_key", "")
        if not api_key:
            return []

        base_url = saved.get("base_url") or os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        model = saved.get("model") or "deepseek-chat"
        client = OpenAI(api_key=api_key, base_url=base_url)
        prompt = self._build_extraction_prompt(text[:15000], extract_type)

        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=4096,
            )
            raw = resp.choices[0].message.content
            return self._parse_llm_json(raw)
        except Exception:
            return []

    def _build_extraction_prompt(self, text: str, extract_type: str) -> str:
        if extract_type == "pinmap":
            return f"""从以下芯片数据手册片段中提取所有引脚信息，返回纯 JSON 数组。

每个引脚格式: {{"name": "引脚名", "functions": ["功能1", "功能2"], "description": "描述"}}

只输出 JSON 数组，不要任何解释:
{text}"""
        elif extract_type == "registers":
            return f"""从以下芯片数据手册片段中提取所有寄存器信息，返回纯 JSON 数组。

每个寄存器格式: {{"name": "寄存器名", "address": "0x地址", "description": "描述"}}

只输出 JSON 数组，不要任何解释:
{text}"""
        return "[]"

    def _parse_llm_json(self, raw: str) -> list[dict]:
        import json as _json
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:]) if lines else raw
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        try:
            return _json.loads(raw)
        except Exception:
            return []


    def _save(self, result: dict):
        with open(self.chip_dir / "index.json", "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        pinmap_path = self.chip_dir / "pinmap.json"
        with open(pinmap_path, "w", encoding="utf-8") as f:
            json.dump(result["pinmap"], f, ensure_ascii=False, indent=2)

        reg_path = self.chip_dir / "registers.json"
        with open(reg_path, "w", encoding="utf-8") as f:
            json.dump(result["registers"], f, ensure_ascii=False, indent=2)


def parse_datasheet(pdf_path: str, chip_name: str) -> dict:
    parser = DatasheetParser(pdf_path, chip_name)
    return parser.parse()