import unittest

from fastapi.testclient import TestClient

import main as backend_main
from app import paths
from app.pdf_parser import DatasheetParser, CHIPS_DIR

SAMPLE = """3 Pin Definitions
GPIO0  Input/Output  ADC2_CH1, TOUCH1
GPIO18 Input/Output  SPI2_SCK
PA9   USART1_TX  Alternate function push-pull
PB0   ADC8_IN0   Analog input
"""

REG_SAMPLE = """4 Register Map
0x89  TMOD  Timer mode control
0x40021018 RCC_APB2ENR  APB2 clock enable
"""


class TokenGuardTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(backend_main.app)

    def test_health_needs_no_token(self):
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_write_endpoint_rejects_missing_token(self):
        self.assertEqual(self.client.post("/serial/simulate/stop").status_code, 401)

    def test_write_endpoint_rejects_wrong_token(self):
        r = self.client.post("/serial/simulate/stop", headers={"X-ChipMate-Token": "wrong"})
        self.assertEqual(r.status_code, 401)

    def test_write_endpoint_accepts_local_token(self):
        token = self.client.get("/token", headers={"Origin": "http://127.0.0.1:5174"}).json()["token"]
        r = self.client.post("/serial/simulate/stop", headers={"X-ChipMate-Token": token})
        self.assertEqual(r.status_code, 200)

    def test_token_endpoint_refuses_foreign_origin(self):
        r = self.client.get("/token", headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status_code, 403)

    def test_token_endpoint_refuses_missing_origin(self):
        self.assertEqual(self.client.get("/token").status_code, 403)


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.parser = DatasheetParser.__new__(DatasheetParser)
        self.parser.chip_name = "VERIFY"
        self.parser.full_text = SAMPLE + REG_SAMPLE
        self.parser.chapters = [
            {"id": "3", "title": "Pin Definitions", "body": SAMPLE},
            {"id": "4", "title": "Register Map", "body": REG_SAMPLE},
        ]

    def test_pinmap_covers_esp32_and_stm32_styles(self):
        names = {p["name"] for p in self.parser._extract_pinmap()}
        self.assertSetEqual(names, {"GPIO0", "GPIO18", "PA9", "PB0"})

    def test_registers_cover_8bit_and_32bit_addresses(self):
        addrs = {r["address"].lower() for r in self.parser._extract_registers()}
        self.assertIn("0x89", addrs)
        self.assertIn("0x40021018", addrs)

    def test_chips_dir_is_user_data_dir(self):
        self.assertEqual(CHIPS_DIR, paths.data_dir() / "chips")


if __name__ == "__main__":
    unittest.main()
