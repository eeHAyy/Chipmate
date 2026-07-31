from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import threading
import time
import re
import json

router = APIRouter()

ERROR_PATTERNS = [
    {"pattern": r"HardFault_Handler|HardFault", "severity": "critical",
     "cause": "非法内存访问、除零、未对齐访问",
     "fix": "检查栈溢出、野指针、外设时钟未使能"},
    {"pattern": r"BusFault", "severity": "critical",
     "cause": "总线访问错误",
     "fix": "检查外设时钟、地址范围"},
    {"pattern": r"UsageFault", "severity": "critical",
     "cause": "未定义指令、除零、未对齐访问",
     "fix": "检查函数指针初始化、除零操作"},
    {"pattern": r"MemManage", "severity": "critical",
     "cause": "MPU 违规或非法内存访问",
     "fix": "检查 MPU 配置、数组越界"},
    {"pattern": r"stack overflow|Stack_overflow", "severity": "critical",
     "cause": "栈溢出",
     "fix": "增大 Stack_Size 或检查递归深度"},
    {"pattern": r"panic|PANIC", "severity": "warning",
     "cause": "固件调用了 panic",
     "fix": "检查 panic 调用前的日志"},
    {"pattern": r"assert|ASSERT", "severity": "warning",
     "cause": "断言失败",
     "fix": "检查断言条件"},
    {"pattern": r"Watchdog|WDT|IWDG|WWDG", "severity": "warning",
     "cause": "看门狗复位",
     "fix": "检查主循环是否及时喂狗"},
    {"pattern": r"Error|ERROR", "severity": "info",
     "cause": "一般错误",
     "fix": "查看错误码和上下文"},
    {"pattern": r"Timeout|TIMEOUT", "severity": "info",
     "cause": "操作超时",
     "fix": "检查外设响应、硬件连接"},
]


class SerialPortManager:
    def __init__(self):
        self.serial = None
        self.thread: Optional[threading.Thread] = None
        self.running = False
        self.lines: list[dict] = []
        self.max_lines = 500
        self.rx_bytes = 0
        self._lock = threading.Lock()
        self.sim_thread: Optional[threading.Thread] = None
        self.sim_running = False

    def connect(self, port: str, baudrate: int = 115200,
                bytesize: int = 8, parity: str = "N", stopbits: float = 1):
        import serial
        self.stop_simulate()
        if self.running:
            self.disconnect()
        BS = {5: serial.FIVEBITS, 6: serial.SIXBITS, 7: serial.SEVENBITS, 8: serial.EIGHTBITS}
        PS = {"N": serial.PARITY_NONE, "E": serial.PARITY_EVEN, "O": serial.PARITY_ODD,
              "M": serial.PARITY_MARK, "S": serial.PARITY_SPACE}
        SS = {1: serial.STOPBITS_ONE, 1.5: serial.STOPBITS_ONE_POINT_FIVE, 2: serial.STOPBITS_TWO}
        self.serial = serial.Serial(
            port, baudrate,
            bytesize=BS.get(bytesize, serial.EIGHTBITS),
            parity=PS.get(parity, serial.PARITY_NONE),
            stopbits=SS.get(stopbits, serial.STOPBITS_ONE),
            timeout=0.1,
        )
        self.running = True
        with self._lock:
            self.lines = []
        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()

    def disconnect(self):
        self.stop_simulate()
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
            self.thread = None
        if self.serial and self.serial.is_open:
            self.serial.close()
            self.serial = None
        with self._lock:
            self.lines = []

    def _read_loop(self):
        while self.running:
            try:
                if self.serial and self.serial.is_open and self.serial.in_waiting > 0:
                    raw = self.serial.read(self.serial.in_waiting)
                    if not raw:
                        continue
                    try:
                        text = raw.decode("utf-8", errors="replace").rstrip()
                    except Exception:
                        text = str(raw)

                    matched = None
                    for ep in ERROR_PATTERNS:
                        if re.search(ep["pattern"], text, re.IGNORECASE):
                            matched = dict(ep)
                            break

                    entry = {"text": text, "raw_hex": raw.hex(" ").upper(), "ts": time.time(), "error": matched}
                    with self._lock:
                        self.rx_bytes += len(raw)
                        self.lines.append(entry)
                        if len(self.lines) > self.max_lines:
                            self.lines = self.lines[-self.max_lines:]
            except Exception:
                time.sleep(0.05)

    def write(self, data: str, hex_mode: bool = False, newline: bool = True) -> bool:
        if self.serial and self.serial.is_open:
            try:
                if hex_mode:
                    raw = bytes.fromhex(data.replace(" ", "").replace("\n", "").replace("\r", ""))
                    self.serial.write(raw)
                else:
                    payload = (data + "\r\n") if newline else data
                    self.serial.write(payload.encode("utf-8"))
                return True
            except Exception:
                return False
        return False

    def get_lines(self, since: float = 0) -> list[dict]:
        with self._lock:
            if since == 0:
                return list(self.lines[-200:])
            return [l for l in self.lines if l["ts"] >= since]

    # ---------- 模拟数据演示模式 ----------
    SIM_SAMPLES = [
        "HardFault_Handler entered",
        "BusFault: address 0x40021000 access denied",
        "UsageFault: undefined instruction at PC=0x08001234",
        "WDT: IWDG reset occurred",
        "Assertion failed: os_mutex_lock, line 42",
        "Stack overflow detected in task 'main'",
        "Timeout: waiting for sensor response",
        "panic: kernel oops",
        "USART1 RX: 55 AA 01 00 0F",
        "ADC ch0: 2048, Temp: 25.3C",
        "SysTick: 1000ms, heap: 4096B free",
        "GPIOA->ODR = 0x0001",
        "I2C1: ACK error at addr 0x50",
        "SPI2: transfer complete, data=0xAB",
        "TIM2: update event, cnt=1000",
        "FreeRTOS: task 'led' deleted",
    ]

    def start_simulate(self):
        if self.running:
            self.disconnect()
        self.sim_running = True
        with self._lock:
            self.lines = []
            self.rx_bytes = 0
        self.sim_thread = threading.Thread(target=self._sim_loop, daemon=True)
        self.sim_thread.start()

    def stop_simulate(self):
        self.sim_running = False
        if self.sim_thread:
            self.sim_thread.join(timeout=2)
            self.sim_thread = None

    def _sim_loop(self):
        import random
        while self.sim_running:
            text = random.choice(self.SIM_SAMPLES)
            matched = None
            for ep in ERROR_PATTERNS:
                if re.search(ep["pattern"], text, re.IGNORECASE):
                    matched = dict(ep)
                    break
            raw = text.encode("utf-8")
            entry = {"text": text, "raw_hex": raw.hex(" ").upper(), "ts": time.time(), "error": matched}
            with self._lock:
                self.rx_bytes += len(raw)
                self.lines.append(entry)
                if len(self.lines) > self.max_lines:
                    self.lines = self.lines[-self.max_lines:]
            time.sleep(0.4)


serial_manager = SerialPortManager()


class SerialConfig(BaseModel):
    port: str = "COM3"
    baudrate: int = 115200
    bytesize: int = 8          # 5/6/7/8
    parity: str = "N"          # N=无 E=偶 O=奇 M=标记 S=空格
    stopbits: float = 1        # 1 / 1.5 / 2


class SerialStatus(BaseModel):
    connected: bool = False
    simulating: bool = False
    port: str = ""
    baudrate: int = 0
    line_count: int = 0
    rx_bytes: int = 0


@router.get("/ports")
async def list_ports():
    try:
        import serial.tools.list_ports
        result = []
        for p in serial.tools.list_ports.comports():
            result.append({
                "device": p.device,
                "description": p.description,
                "vid": p.vid,
                "pid": p.pid,
                "manufacturer": p.manufacturer or "",
            })
        return result
    except ImportError:
        return []


@router.get("/status", response_model=SerialStatus)
async def get_status():
    return SerialStatus(
        connected=serial_manager.running,
        simulating=serial_manager.sim_running,
        port=serial_manager.serial.port if serial_manager.serial else "",
        baudrate=serial_manager.serial.baudrate if serial_manager.serial else 0,
        line_count=len(serial_manager.get_lines()),
        rx_bytes=serial_manager.rx_bytes,
    )


@router.post("/simulate/start")
async def simulate_start():
    serial_manager.start_simulate()
    return {"status": "ok", "simulating": True}


@router.post("/simulate/stop")
async def simulate_stop():
    serial_manager.stop_simulate()
    return {"status": "ok", "simulating": False}


@router.post("/connect")
async def connect(config: SerialConfig):
    try:
        serial_manager.connect(config.port, config.baudrate, config.bytesize, config.parity, config.stopbits)
        return {"status": "ok", "port": config.port, "baudrate": config.baudrate,
                "bytesize": config.bytesize, "parity": config.parity, "stopbits": config.stopbits}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/disconnect")
async def disconnect():
    serial_manager.disconnect()
    return {"status": "ok"}


@router.get("/lines")
async def get_lines(since: float = 0):
    return {"lines": serial_manager.get_lines(since), "rx_bytes": serial_manager.rx_bytes}


@router.post("/send")
async def send_data(data: str = "", hex: bool = False, newline: bool = True):
    ok = serial_manager.write(data, hex_mode=hex, newline=newline)
    if not ok:
        raise HTTPException(status_code=400, detail="发送失败：请检查串口连接和输入数据")
    return {"status": "ok"}
