"""运行时设置存储 — 持久化到 JSON 文件，env 变量优先级更高"""
import json
import os
from pathlib import Path

from . import paths

SETTINGS_FILE = paths.data_dir() / "settings.json"
paths.migrate_legacy(SETTINGS_FILE.parent)

DEFAULT = {
    "api_key": "",
    "base_url": "https://api.deepseek.com",
    "model": "deepseek-chat",
}

# env 变量名映射
ENV_MAP = {
    "api_key": "DEEPSEEK_API_KEY",
    "base_url": "DEEPSEEK_BASE_URL",
    "model": "DEEPSEEK_MODEL",
}


def load() -> dict:
    s = dict(DEFAULT)
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                s.update(json.load(f))
        except Exception:
            pass
    return s


def save(partial: dict):
    current = load()
    current.update(partial)
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=2)


def get(key: str) -> str:
    """获取设置：env 变量优先，其次 JSON 持久化，最后默认值"""
    env_key = ENV_MAP.get(key)
    if env_key and os.getenv(env_key):
        return os.getenv(env_key)
    s = load()
    return s.get(key, DEFAULT.get(key, ""))
