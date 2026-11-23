from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import shutil
import subprocess
import json
import sys
from pathlib import Path

router = APIRouter()

from . import paths
from .security import require_token

DATA_DIR = paths.data_dir()
paths.migrate_legacy(DATA_DIR)
FLASH_DIR = DATA_DIR / "flash"
FLASH_DIR.mkdir(parents=True, exist_ok=True)

PROTOCOLS = ["auto", "stc89", "stc89a", "stc12a", "stc12b", "stc12", "stc15a", "stc15", "stc8", "stc8d", "stc8g", "usb15"]

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


@router.post("/burn")
async def burn(req: BurnRequest, _=Depends(require_token)):
    filepath = FLASH_DIR / req.filename
    if not filepath.exists():
        raise HTTPException(status_code=400, detail="文件不存在，请先上传 HEX")

    if req.protocol not in PROTOCOLS:
        req.protocol = "auto"

    def gen():
        if getattr(sys, "frozen", False):
            cmd = [sys.executable, "--stcgal"]
        else:
            cmd = [sys.executable, "-m", "stcgal"]
        cmd += ["-P", req.protocol, "-p", req.port, "-b", str(req.baudrate)]
        if req.autoreset:
            cmd.append("-a")
        cmd.append(str(filepath))
        yield json.dumps({"type": "cmd", "data": " ".join(cmd)}) + "\n"
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
            for line in proc.stdout:
                yield json.dumps({"type": "log", "data": line.rstrip()}) + "\n"
            proc.wait()
            yield json.dumps({"type": "done", "code": proc.returncode}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "data": str(e)}) + "\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
