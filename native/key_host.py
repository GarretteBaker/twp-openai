"""TWP OpenAI native messaging host. MPL-2.0. No shell execution or network access."""
import json
import re
import shlex
import struct
import sys
from pathlib import Path

EXTENSION_ID = 'twp-openai@garrettbaker.local'
HOST_NAME = 'local.twp_openai_key'


def resolve_key(path):
    if not path.is_file():
        return {'error': 'No .bashrc file found.'}
    assignments = re.findall(r'^\s*(?:export\s+)?OPENAI_API_KEY\s*=(.*)$', path.read_text(), re.M)
    if not assignments:
        return {'error': 'No literal OPENAI_API_KEY assignment found in .bashrc.'}
    parts = shlex.split(assignments[-1], comments=True)
    if len(parts) != 1 or not re.fullmatch(r'sk-[A-Za-z0-9_-]+', parts[0]):
        return {'error': 'OPENAI_API_KEY must be a literal key in .bashrc; shell expressions are not executed.'}
    return {'apiKey': parts[0], 'source': '~/.bashrc'}


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError('Incomplete native message header.')
    size = struct.unpack('=I', header)[0]
    if not 0 < size <= 4096:
        raise ValueError('Invalid native message size.')
    payload = stream.read(size)
    if len(payload) != size:
        raise ValueError('Incomplete native message.')
    return json.loads(payload)


def handle(message, path):
    if message != {'action': 'get_key'}:
        return {'error': 'Unsupported native message.'}
    return resolve_key(path)


def main():
    # Firefox supplies the host manifest path and the calling extension ID.
    if len(sys.argv) < 3 or sys.argv[2] != EXTENSION_ID:
        raise PermissionError('Unexpected calling extension.')
    message = read_message(sys.stdin.buffer)
    if message is None:
        return
    output = json.dumps(handle(message, Path.home() / '.bashrc')).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(output)))
    sys.stdout.buffer.write(output)
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
