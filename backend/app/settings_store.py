"""运行时设置存储 — API Key 用 DPAPI 加密落盘，env 变量优先级更高"""
import json
import os

from . import paths
from .secrets_store import protect, unprotect

SETTINGS_FILE = paths.data_dir() / "settings.json"
paths.migrate_legacy(SETTINGS_FILE.parent)

DEFAULT = {
    "api_key": "",
    "base_url": "https://api.deepseek.com",
    "model": "deepseek-chat",
}

ENV_MAP = {
    "api_key": "DEEPSEEK_API_KEY",
    "base_url": "DEEPSEEK_BASE_URL",
    "model": "DEEPSEEK_MODEL",
}

FIELD_KEYS = ("base_url", "model")


def _read_raw() -> dict:
    if not SETTINGS_FILE.exists():
        return {}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _write_raw(raw: dict):
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)


def load() -> dict:
    raw = _read_raw()

    # 老版本把 Key 明文存盘，这里就地加密并抹掉明文
    if raw.get("api_key") and not raw.get("api_key_enc"):
        try:
            raw["api_key_enc"] = protect(raw["api_key"])
            raw.pop("api_key", None)
            _write_raw(raw)
        except Exception:
            pass

    s = dict(DEFAULT)
    if raw.get("api_key_enc"):
        try:
            s["api_key"] = unprotect(raw["api_key_enc"])
        except Exception:
            s["api_key"] = ""
    elif raw.get("api_key"):
        s["api_key"] = raw["api_key"]
    for k in FIELD_KEYS:
        if k in raw:
            s[k] = raw[k]
    return s


def save(partial: dict):
    raw = _read_raw()
    for k, v in partial.items():
        if k == "api_key":
            if v:
                raw["api_key_enc"] = protect(v)
            else:
                raw.pop("api_key_enc", None)
            raw.pop("api_key", None)
        elif k in FIELD_KEYS:
            raw[k] = v
    _write_raw(raw)


def get(key: str) -> str:
    """获取设置：env 变量优先，其次加密存储，最后默认值"""
    env_key = ENV_MAP.get(key)
    if env_key and os.getenv(env_key):
        return os.getenv(env_key)
    s = load()
    return s.get(key, DEFAULT.get(key, ""))
