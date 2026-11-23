"""敏感值加密存储 — Windows 用 DPAPI（CryptProtectData）绑定当前用户，非 Windows 退化为前缀标记"""
import base64
import ctypes
import sys

if sys.platform == "win32":
    from ctypes import wintypes

    class _Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    _crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    def _make_blob(data: bytes) -> _Blob:
        buf = ctypes.create_string_buffer(data, len(data))
        return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def protect(value: str) -> str:
        src = _make_blob(value.encode("utf-8"))
        dst = _Blob()
        if not _crypt32.CryptProtectData(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(dst)):
            raise OSError(ctypes.get_last_error(), "CryptProtectData 失败")
        try:
            raw = ctypes.string_at(dst.pbData, dst.cbData)
        finally:
            _kernel32.LocalFree(dst.pbData)
        return base64.b64encode(raw).decode("ascii")

    def unprotect(payload: str) -> str:
        src = _make_blob(base64.b64decode(payload))
        dst = _Blob()
        if not _crypt32.CryptUnprotectData(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(dst)):
            raise OSError(ctypes.get_last_error(), "CryptUnprotectData 失败")
        try:
            return ctypes.string_at(dst.pbData, dst.cbData).decode("utf-8")
        finally:
            _kernel32.LocalFree(dst.pbData)

else:
    # 非 Windows 仅做 base64 编码，不提供机密性，仅保证接口一致
    PREFIX = "b64:"

    def protect(value: str) -> str:
        return PREFIX + base64.b64encode(value.encode("utf-8")).decode("ascii")

    def unprotect(payload: str) -> str:
        if not payload.startswith(PREFIX):
            return payload
        return base64.b64decode(payload[len(PREFIX):]).decode("utf-8")
