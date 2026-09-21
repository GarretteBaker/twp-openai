"""Create an unsigned Firefox package from the source; no transpilation required (Firefox 128+)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
output = root / 'build' / 'twp-openai-10.2.1.1.xpi'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted((root / 'src').rglob('*')):
        if path.is_file() and path.name != 'chrome_manifest.json':
            archive.write(path, str(path.relative_to(root / 'src')))
print(output)
