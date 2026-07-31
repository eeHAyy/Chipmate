from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import os
import json
import shutil
from pathlib import Path

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent / "data"
CHIPS_DIR = DATA_DIR / "chips"
UPLOAD_DIR = DATA_DIR / "uploads"

CHIPS_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class ChipInfo(BaseModel):
    name: str
    manufacturer: str
    has_datasheet: bool = False
    has_pinmap: bool = False


class SearchResult(BaseModel):
    chip: str
    query: str
    pin_results: list[dict] = []
    register_results: list[dict] = []
    chapter_results: list[dict] = []


PRESET_CHIPS = [
    {"name": "STM32F103C8T6", "manufacturer": "STMicroelectronics"},
    {"name": "STM32F407VGT6", "manufacturer": "STMicroelectronics"},
    {"name": "ESP32", "manufacturer": "Espressif"},
    {"name": "ESP32-S3", "manufacturer": "Espressif"},
    {"name": "ATmega328P", "manufacturer": "Microchip"},
    {"name": "RP2040", "manufacturer": "Raspberry Pi"},
]


@router.get("/chips", response_model=list[ChipInfo])
async def list_chips():
    result = []
    for chip in PRESET_CHIPS:
        chip_dir = CHIPS_DIR / chip["name"]
        has_ds = os.path.exists(chip_dir / "index.json")
        has_pin = os.path.exists(chip_dir / "pinmap.json")
        result.append(ChipInfo(
            name=chip["name"],
            manufacturer=chip["manufacturer"],
            has_datasheet=has_ds,
            has_pinmap=has_pin
        ))

    for d in CHIPS_DIR.iterdir():
        if d.is_dir() and not any(c["name"] == d.name for c in PRESET_CHIPS):
            idx_path = d / "index.json"
            pin_path = d / "pinmap.json"
            result.append(ChipInfo(
                name=d.name,
                manufacturer="user",
                has_datasheet=idx_path.exists(),
                has_pinmap=pin_path.exists()
            ))
    return result


@router.post("/upload")
async def upload_datasheet(file: UploadFile = File(...), chip_name: str = Form("")):
    name = chip_name.strip() or Path(file.filename).stem
    tmp_path = UPLOAD_DIR / file.filename
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    from app.pdf_parser import parse_datasheet
    try:
        result = parse_datasheet(str(tmp_path), name)
        return {
            "status": "ok",
            "chip": name,
            "pins_count": len(result.get("pinmap", [])),
            "registers_count": len(result.get("registers", [])),
            "chapters_count": len(result.get("chapters", [])),
            }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "chip": name, "error": str(e)}
    finally:
        if tmp_path.exists():
            os.remove(tmp_path)


@router.get("/search/{chip_name}", response_model=SearchResult)
async def search_chip(chip_name: str, query: str = ""):
    chip_dir = CHIPS_DIR / chip_name
    result = SearchResult(chip=chip_name, query=query)

    pinmap_path = chip_dir / "pinmap.json"
    if pinmap_path.exists():
        with open(pinmap_path, "r", encoding="utf-8") as f:
            all_pins = json.load(f)
        q = query.lower()
        result.pin_results = [
            p for p in all_pins
            if q in p["name"].lower() or any(q in fn.lower() for fn in p.get("functions", []))
        ][:50]

    reg_path = chip_dir / "registers.json"
    if reg_path.exists():
        with open(reg_path, "r", encoding="utf-8") as f:
            all_regs = json.load(f)
        q = query.lower()
        result.register_results = [
            r for r in all_regs
            if q in r["name"].lower() or q in r.get("description", "").lower()
        ][:50]

    idx_path = chip_dir / "index.json"
    if idx_path.exists():
        with open(idx_path, "r", encoding="utf-8") as f:
            idx_data = json.load(f)
        q = query.lower()
        result.chapter_results = [
            {"id": c["id"], "title": c["title"], "body": c["body"][:500]}
            for c in idx_data.get("chapters", [])
            if q in c["title"].lower() or q in c.get("body", "").lower()
        ][:10]

    return result