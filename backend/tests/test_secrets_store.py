import unittest

from app import secrets_store


class SecretsStoreTests(unittest.TestCase):
    def test_roundtrip_ascii(self):
        value = "sk-test-abcdefghijklmnop"
        self.assertEqual(secrets_store.unprotect(secrets_store.protect(value)), value)

    def test_roundtrip_unicode(self):
        value = "中文测试🔒"
        self.assertEqual(secrets_store.unprotect(secrets_store.protect(value)), value)

    def test_ciphertext_does_not_contain_plaintext(self):
        value = "sk-test-abcdefghijklmnop"
        self.assertNotIn(value, secrets_store.protect(value))


if __name__ == "__main__":
    unittest.main()
