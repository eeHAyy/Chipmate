import os
import shutil
import sys
from pathlib import Path


def data_dir() -> Path:
    """运行数据目录：打包后放用户目录，避免升级/卸载丢数据。"""
    custom = os.getenv("CHIPMATE_DATA_DIR")
    if custom:
        target = Path(custom)
    elif getattr(sys, "frozen", False):
        base = os.getenv("APPDATA") or str(Path.home())
        target = Path(base) / "ChipMate" / "data"
    else:
        target = Path(__file__).resolve().parent.parent / "data"
    target.mkdir(parents=True, exist_ok=True)
    return target


def migrate_legacy(target: Path) -> None:
    """首次运行时把老版本留在安装目录里的数据搬到用户目录。"""
    if not getattr(sys, "frozen", False):
        return
    marker = target / ".migrated"
    if marker.exists():
        return
    legacy = Path(sys.executable).resolve().parent / "_internal" / "data"
    if legacy.is_dir() and legacy.resolve() != target.resolve():
        for item in legacy.iterdir():
            dest = target / item.name
            if dest.exists():
                continue
            if item.is_dir():
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)
    marker.write_text("migrated", encoding="utf-8")
