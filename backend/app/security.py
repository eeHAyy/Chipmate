import os
import secrets

from fastapi import Header, HTTPException

from . import paths

DEV_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5173",
    "http://localhost:5174",
]


def token() -> str:
    """本机访问令牌：Electron 通过环境变量注入，独立运行时落盘复用。"""
    env = os.getenv("CHIPMATE_TOKEN", "").strip()
    if env:
        return env
    path = paths.data_dir() / "token.txt"
    if path.exists():
        saved = path.read_text(encoding="utf-8").strip()
        if saved:
            return saved
    created = secrets.token_urlsafe(24)
    path.write_text(created, encoding="utf-8")
    return created


async def require_token(x_chipmate_token: str | None = Header(default=None)) -> None:
    expected = token()
    if not x_chipmate_token or not secrets.compare_digest(x_chipmate_token, expected):
        raise HTTPException(status_code=401, detail="缺少或无效的本地访问令牌")
