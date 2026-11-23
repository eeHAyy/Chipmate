import unittest

from app.serial_monitor import SerialPortManager


class FakeSerial:
    def __init__(self, incoming=None):
        self.is_open = True
        self.written = []
        self._incoming = bytearray(b"".join(incoming or []))
        self.on_exhausted = None

    @property
    def in_waiting(self):
        return len(self._incoming)

    def read(self, size):
        data = bytes(self._incoming[:size])
        del self._incoming[:size]
        if not self._incoming and self.on_exhausted:
            self.on_exhausted()
        return data

    def write(self, data):
        self.written.append(data)
        return len(data)

    def close(self):
        self.is_open = False


class SerialPortManagerTests(unittest.TestCase):
    def setUp(self):
        self.manager = SerialPortManager()

    def read_entries(self, *lines):
        fake_serial = FakeSerial(lines)
        fake_serial.on_exhausted = lambda: setattr(self.manager, "running", False)
        self.manager.serial = fake_serial
        self.manager.running = True
        self.manager._read_loop()
        return self.manager.get_lines()

    def test_ascii_write_appends_crlf(self):
        fake_serial = FakeSerial()
        self.manager.serial = fake_serial

        result = self.manager.write("芯片状态 OK")

        self.assertTrue(result)
        self.assertEqual(fake_serial.written, ["芯片状态 OK\r\n".encode("utf-8")])

    def test_hex_write_ignores_whitespace(self):
        fake_serial = FakeSerial()
        self.manager.serial = fake_serial

        result = self.manager.write("48 65\n6C\r6C 6F", hex_mode=True)

        self.assertTrue(result)
        self.assertEqual(fake_serial.written, [b"Hello"])

    def test_invalid_hex_returns_false_without_writing(self):
        fake_serial = FakeSerial()
        self.manager.serial = fake_serial

        result = self.manager.write("12 GG", hex_mode=True)

        self.assertFalse(result)
        self.assertEqual(fake_serial.written, [])

    def test_write_returns_false_when_disconnected(self):
        for hex_mode in (False, True):
            with self.subTest(hex_mode=hex_mode):
                self.assertFalse(self.manager.write("48", hex_mode=hex_mode))

    def test_recognizes_all_fault_patterns(self):
        cases = [
            ("HardFault_Handler entered", r"HardFault_Handler|HardFault", "critical"),
            ("BusFault at address 0x20000000", r"BusFault", "critical"),
            ("UsageFault detected", r"UsageFault", "critical"),
            ("MemManage exception", r"MemManage", "critical"),
            ("stack overflow in task", r"stack overflow|Stack_overflow", "critical"),
            ("panic: invalid state", r"panic|PANIC", "warning"),
            ("assert failed", r"assert|ASSERT", "warning"),
            ("Watchdog reset", r"Watchdog|WDT|IWDG|WWDG", "warning"),
            ("Error code 17", r"Error|ERROR", "info"),
            ("Timeout waiting for SPI", r"Timeout|TIMEOUT", "info"),
        ]

        for text, expected_pattern, expected_severity in cases:
            with self.subTest(text=text):
                self.manager = SerialPortManager()
                entries = self.read_entries((text + "\r\n").encode("utf-8"))

                self.assertEqual(len(entries), 1)
                self.assertEqual(entries[0]["text"], text)
                self.assertIsNotNone(entries[0]["error"])
                self.assertEqual(entries[0]["error"]["pattern"], expected_pattern)
                self.assertEqual(entries[0]["error"]["severity"], expected_severity)

    def test_normal_line_is_not_marked_as_fault(self):
        entries = self.read_entries(b"temperature=25 C\r\n")

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["text"], "temperature=25 C")
        self.assertIsNone(entries[0]["error"])

    def test_raw_hex_preserves_binary_bytes(self):
        entries = self.read_entries(b"\xff\x00\r\n")

        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["raw_hex"], "FF 00 0D 0A")


if __name__ == "__main__":
    unittest.main()
