from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import shutil
import subprocess
import json
import sys
import queue
import threading
import time
from pathlib import Path

router = APIRouter()

from . import paths
from .security import require_token
from .serial_monitor import serial_manager

DATA_DIR = paths.data_dir()
paths.migrate_legacy(DATA_DIR)
FLASH_DIR = DATA_DIR / "flash"
FLASH_DIR.mkdir(parents=True, exist_ok=True)

PROTOCOLS = ["auto", "stc89", "stc89a", "stc12a", "stc12b", "stc12", "stc15a", "stc15", "stc8", "stc8d", "stc8g", "usb15"]

# auto 模式下按最常见的芯片系列依次尝试
AUTO_CANDIDATES = ["stc15", "stc8", "stc89"]
AUTO_ATTEMPT_TIMEOUT = 25.0
# 单协议最长握手等待，超时后杀掉 stcgal 释放串口
FLASH_TIMEOUT = 180.0

_active_lock = threading.Lock()
_active_proc = {"proc": None}


def kill_active_burn():
    """杀掉还没结束的烧录进程，避免它一直占着串口。"""
    with _active_lock:
        proc = _active_proc.get("proc")
    if proc is not None and proc.poll() is None:
        try:
            proc.kill()
            return True
        except Exception:
            pass
    return False

PROTOCOL_LABELS = {
    "auto": "自动检测",
    "stc89": "STC89/90",
    "stc12a": "STC12C/A (old)",
    "stc12b": "STC12C/A (new)",
    "stc12": "STC12 (auto)",
    "stc15a": "STC15 (old)",
    "stc15": "STC15 (new)",
    "stc8": "STC8A/8F",
    "stc8d": "STC8D",
    "stc8g": "STC8G/8H",
    "usb15": "STC15 USB",
}


class BurnRequest(BaseModel):
    filename: str
    protocol: str = "auto"
    port: str = ""
    baudrate: int = 115200
    autoreset: bool = False


@router.post("/upload")
async def upload_hex(file: UploadFile = File(...), _=Depends(require_token)):
    name = Path(file.filename).name
    if not name.lower().endswith((".hex", ".bin")):
        raise HTTPException(status_code=400, detail="只支持 .hex / .bin 文件")
    dest = FLASH_DIR / name
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"status": "ok", "filename": name, "size": dest.stat().st_size}


@router.get("/check")
async def check_tool():
    try:
        import stcgal  # noqa
        return {"ok": True, "version": getattr(stcgal, "__version__", "1.10")}
    except ImportError:
        return {"ok": False, "hint": "pip install stcgal"}


def _run_once(cmd, emit, timeout=None):
    """跑一次 stcgal，边跑边把输出 emit 出去；返回 (返回码, 是否超时)。"""
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    q: "queue.Queue" = queue.Queue()

    def pump():
        try:
            for line in proc.stdout:
                q.put(line.rstrip())
        finally:
            q.put(None)

    threading.Thread(target=pump, daemon=True).start()
    with _active_lock:
        _active_proc["proc"] = proc
    deadline = time.time() + timeout if timeout else None
    try:
        while True:
            try:
                line = q.get(timeout=0.2)
            except queue.Empty:
                if deadline and time.time() > deadline:
                    proc.kill()
                    proc.wait()
                    return -1, True
                continue
            if line is None:
                break
            emit({"type": "log", "data": line})
        proc.wait()
        return proc.returncode, False
    finally:
        with _active_lock:
            if _active_proc.get("proc") is proc:
                _active_proc["proc"] = None


@router.post("/burn")
async def burn(req: BurnRequest, _=Depends(require_token)):
    filepath = FLASH_DIR / req.filename
    if not filepath.exists():
        raise HTTPException(status_code=400, detail="文件不存在，请先上传 HEX")

    if req.protocol not in PROTOCOLS:
        req.protocol = "auto"

    def gen():
        # 上一次没结束的烧录可能还占着端口
        if kill_active_burn():
            yield json.dumps({"type": "log", "data": "⚠ 已终止上一次未结束的烧录进程"}) + "\n"
        # 烧录和串口监控抢同一个端口，先让监控让位
        held = serial_manager.serial.port if serial_manager.serial else ""
        if serial_manager.running and req.port and held.lower() == req.port.lower():
            serial_manager.disconnect()
            yield json.dumps({"type": "log",
                              "data": f"⚠ 已自动断开串口监控，释放 {req.port} 供烧录使用"}) + "\n"

        base = [sys.executable, "--stcgal"] if getattr(sys, "frozen", False) else [sys.executable, "-m", "stcgal"]
        candidates = AUTO_CANDIDATES if req.protocol == "auto" else [req.protocol]
        multi = len(candidates) > 1
        opened_bad = False

        for idx, proto in enumerate(candidates):
            cmd = list(base) + ["-P", proto, "-p", req.port, "-b", str(req.baudrate)]
            if req.autoreset:
                cmd.append("-a")
            cmd.append(str(filepath))
            if multi:
                yield json.dumps({"type": "log", "data":
                                  f"【自动检测 {idx + 1}/{len(candidates)}】按 {proto} 协议握手，请按一下板上的 RST 复位键"}) + "\n"
            yield json.dumps({"type": "cmd", "data": " ".join(cmd)}) + "\n"

            out_lines = []

            def emit(ev):
                out_lines.append(ev)

            code, timed_out = _run_once(
                cmd, emit, timeout=AUTO_ATTEMPT_TIMEOUT if multi else FLASH_TIMEOUT)

            for ev in out_lines:
                yield json.dumps(ev, ensure_ascii=False) + "\n"
                if "could not open port" in ev.get("data", "") or "PermissionError" in ev.get("data", ""):
                    opened_bad = True

            if code == 0:
                yield json.dumps({"type": "done", "code": 0}) + "\n"
                return
            if opened_bad:
                yield json.dumps({"type": "log", "data":
                                  "⚠ 串口打不开：可能被 STC-ISP、串口助手等程序占用，或板子未插好。请关闭占用程序后重试"}) + "\n"
                yield json.dumps({"type": "done", "code": code}) + "\n"
                return
            if timed_out:
                if idx + 1 < len(candidates):
                    yield json.dumps({"type": "log", "data":
                                      f"⚠ {proto} 协议无应答，换下一个协议"}) + "\n"
                    continue
                yield json.dumps({"type": "log", "data":
                                  "⚠ 等待超时：没有等到单片机应答。请确认已按 RST 复位键、串口线接好、烧录前波特率正确"}) + "\n"
                yield json.dumps({"type": "done", "code": -1}) + "\n"
                return
            yield json.dumps({"type": "done", "code": code}) + "\n"
            return

    return StreamingResponse(gen(), media_type="text/event-stream")
