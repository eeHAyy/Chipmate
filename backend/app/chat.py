from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import os
import asyncio
from pathlib import Path

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent / "data"
CHIPS_DIR = DATA_DIR / "chips"


class ChatRequest(BaseModel):
    message: str
    model: str = "deepseek-chat"
    chip_name: str = ""
    stream: bool = False
    history: list[dict] = []  # [{"role":"user","content":"..."}, {"role":"assistant","content":"..."}]


SYSTEM_PROMPT = """你是 ChipMate，嵌入式开发 AI 助手。
知识覆盖 STM32、ESP32、Arduino、FPGA 等平台。
回答要求：
1. 涉及寄存器/引脚时，给出具体地址和位域
2. 不确定的信息明确标注"待验证"
3. 代码示例用 C 语言或 MicroPython"""


def load_chip_context(chip_name: str) -> str:
    if not chip_name:
        return ""
    chip_dir = CHIPS_DIR / chip_name
    if not chip_dir.exists():
        return ""

    parts = []

    pinmap_path = chip_dir / "pinmap.json"
    if pinmap_path.exists():
        with open(pinmap_path, "r", encoding="utf-8") as f:
            pins = json.load(f)
        pin_lines = []
        for p in pins[:50]:
            funcs = ", ".join(p.get("functions", [])) or "-"
            pin_lines.append(f"  {p['name']}: {funcs}")
        parts.append(f"引脚列表 ({len(pins)} 个):\n" + "\n".join(pin_lines))

    reg_path = chip_dir / "registers.json"
    if reg_path.exists():
        with open(reg_path, "r", encoding="utf-8") as f:
            regs = json.load(f)
        reg_lines = []
        for r in regs[:30]:
            reg_lines.append(f"  {r['name']} ({r['address']}): {r.get('description', '-')}")
        parts.append(f"寄存器列表 ({len(regs)} 个):\n" + "\n".join(reg_lines))

    return "以下是芯片 " + chip_name + " 的手册数据:\n\n" + "\n\n".join(parts)


def build_messages(request: ChatRequest) -> list[dict]:
    """构建完整 messages：system + 历史对话 + 当前用户消息"""
    chip_context = load_chip_context(request.chip_name)
    system_msg = SYSTEM_PROMPT
    if chip_context:
        system_msg += "\n\n" + chip_context + "\n\n请基于以上芯片手册数据回答问题，引用具体引脚名和寄存器。"

    messages = [{"role": "system", "content": system_msg}]
    # 取最近 20 条历史，避免 token 超长
    for h in request.history[-20:]:
        if h["role"] in ("user", "assistant"):
            messages.append(h)
    messages.append({"role": "user", "content": request.message})
    return messages


async def stream_openai(request: ChatRequest):
    """异步生成器：流式读取 OpenAI 响应，产出 SSE 事件"""
    from openai import AsyncOpenAI

    from . import settings_store as cfg
    api_key = cfg.get("api_key")
    base_url = cfg.get("base_url")

    if not api_key:
        yield f"data: {json.dumps({'error': '未配置 API Key'})}\n\n"
        return

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        messages = build_messages(request)
        stream = await client.chat.completions.create(
            model=request.model,
            messages=messages,
            stream=True,
            temperature=0.3,
            max_tokens=2048,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield f"data: {json.dumps({'content': delta.content})}\n\n"
        yield "data: [DONE]\n\n"
    except asyncio.CancelledError:
        pass
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.get("/settings")
async def get_settings():
    from . import settings_store as cfg
    s = cfg.load()
    return {
        "base_url": s.get("base_url", "https://api.deepseek.com"),
        "model": s.get("model", "deepseek-chat"),
        "has_key": bool(s.get("api_key") or os.getenv("DEEPSEEK_API_KEY")),
    }


@router.post("/settings")
async def update_settings(body: dict):
    from . import settings_store as cfg
    allowed = {"api_key", "base_url", "model"}
    cfg.save({k: v for k, v in body.items() if k in allowed})
    return {"status": "ok"}


@router.post("")
async def chat(request: ChatRequest):
    if request.stream:
        return StreamingResponse(stream_openai(request), media_type="text/event-stream")

    from openai import AsyncOpenAI

    from . import settings_store as cfg
    api_key = cfg.get("api_key")
    base_url = cfg.get("base_url")

    if not api_key:
        return {"reply": "未配置 API Key。请在项目根目录 .env 文件中配置 DEEPSEEK_API_KEY。\n获取 Key: https://platform.deepseek.com/api_keys"}

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        messages = build_messages(request)
        resp = await client.chat.completions.create(
            model=request.model,
            messages=messages,
            temperature=0.3,
            max_tokens=2048
        )
        return {"reply": resp.choices[0].message.content}
    except Exception as e:
        return {"reply": f"API 调用失败: {str(e)}"}
