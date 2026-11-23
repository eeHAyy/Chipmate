import sys

if len(sys.argv) > 1 and sys.argv[1] == "--stcgal":
    from stcgal.frontend import cli as stcgal_cli
    sys.argv = ["stcgal"] + sys.argv[2:]
    raise SystemExit(stcgal_cli())

from dotenv import load_dotenv
load_dotenv(dotenv_path="../.env")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from app import security
from app.chat import router as chat_router
from app.serial_monitor import router as serial_router
from app.datasheet import router as datasheet_router
from app.flash import router as flash_router

app = FastAPI(title="ChipMate Backend", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=security.DEV_ORIGINS + ["null"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-ChipMate-Token"],
)

app.include_router(chat_router, prefix="/chat", tags=["chat"])
app.include_router(serial_router, prefix="/serial", tags=["serial"])
app.include_router(datasheet_router, prefix="/datasheet", tags=["datasheet"])
app.include_router(flash_router, prefix="/flash", tags=["flash"])


@app.get("/token")
async def local_token(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in security.DEV_ORIGINS:
        raise HTTPException(status_code=403, detail="该来源不允许读取本地令牌")
    return {"token": security.token()}


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.4.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8720)