"""Native helper tests use only fake keys in temporary files. Run with uv run python."""
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('key_host', Path(__file__).resolve().parents[1] / 'native/key_host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

class NativeHostTests(unittest.TestCase):
    def test_literal_key_and_comments(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'bashrc'
            path.write_text('export OPENAI_API_KEY="sk-old"\nexport OPENAI_API_KEY=\'sk-new_fake\' # comment\n')
            self.assertEqual(host.resolve_key(path),{'apiKey':'sk-new_fake','source':'~/.bashrc'})
    def test_does_not_execute_shell(self):
        with tempfile.TemporaryDirectory() as d:
            marker=Path(d)/'executed'
            path=Path(d)/'bashrc'
            path.write_text(f'export OPENAI_API_KEY="$(touch {marker})"\n')
            self.assertIn('error',host.resolve_key(path))
            self.assertFalse(marker.exists())
    def test_missing_assignment(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'bashrc'
            self.assertIn('error',host.resolve_key(path))
            path.write_text('export UNRELATED_KEY="sk-test"\n')
            self.assertIn('error',host.resolve_key(path))
    def test_does_not_accept_arbitrary_file_requests(self):
        self.assertIn('error',host.handle({'action':'get_key','path':'/etc/passwd'},Path('/nonexistent')))
    def test_message_framing(self):
        payload=json.dumps({'action':'get_key'}).encode()
        self.assertEqual(host.read_message(io.BytesIO(struct.pack('=I',len(payload))+payload)),{'action':'get_key'})
        self.assertIsNone(host.read_message(io.BytesIO()))
        with self.assertRaises(ValueError): host.read_message(io.BytesIO(struct.pack('=I',999999)))
        with self.assertRaises(ValueError): host.read_message(io.BytesIO(struct.pack('=I',len(payload))+payload[:-1]))

unittest.main()
