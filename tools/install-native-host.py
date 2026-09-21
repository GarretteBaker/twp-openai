"""Install the Linux native helper for this user's Firefox. Run with uv run python."""
import json
import os
from pathlib import Path
import subprocess
import sys

assert sys.platform.startswith('linux'), 'This installer currently supports Linux only.'
root = Path(__file__).resolve().parents[1]
data = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'twp-openai'
data.mkdir(parents=True, exist_ok=True, mode=0o700)
venv = data / '.venv'
if not (venv / 'bin/python').exists():
    subprocess.run(['uv', 'venv', '--python', sys.executable, str(venv)], check=True)
helper = data / 'key_host.py'
helper.write_text(f'#!{venv}/bin/python -I\n' + (root / 'native/key_host.py').read_text())
helper.chmod(0o700)
manifest = {
    'name': 'local.twp_openai_key',
    'description': 'Read OPENAI_API_KEY from the local .bashrc for TWP OpenAI.',
    'path': str(helper),
    'type': 'stdio',
    'allowed_extensions': ['twp-openai@garrettbaker.local'],
}
# Support both legacy ~/.mozilla and current XDG-based Linux builds.
config = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
for directory in [Path.home() / '.mozilla/native-messaging-hosts', config / 'mozilla/native-messaging-hosts']:
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / 'local.twp_openai_key.json'
    path.write_text(json.dumps(manifest, indent=2) + '\n')
    path.chmod(0o600)
    print('Registered native host:', path)
print('Installed helper:', helper)
print('No API key was copied. Only the TWP OpenAI extension ID is allowed to connect.')
