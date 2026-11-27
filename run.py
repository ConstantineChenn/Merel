"""Local MEREL launcher. Configuration stays on the server."""
from pathlib import Path
import argparse
import os

ROOT = Path(__file__).resolve().parent


def load_local_environment():
    path = ROOT / '.env'
    allowed = {'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
               'MEREL_DB', 'MEREL_MODEL_TIMEOUT'}
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key, value = key.strip(), value.strip()
        if key not in allowed:
            continue
        if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def main():
    parser = argparse.ArgumentParser(description='Run the local MEREL prototype')
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--open-browser', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be in 1..65535')
    os.chdir(ROOT)
    load_local_environment()
    if args.open_browser and args.host in {'127.0.0.1', 'localhost'}:
        import threading
        import time
        import urllib.request
        import webbrowser
        def open_when_ready():
            url = f'http://127.0.0.1:{args.port}'
            for _ in range(100):
                try:
                    with urllib.request.urlopen(url + '/health', timeout=1):
                        webbrowser.open(url)
                    return
                except OSError:
                    time.sleep(.15)
        threading.Thread(target=open_when_ready, daemon=True).start()
    import uvicorn
    import mimetypes
    # Windows registry mappings may label WebP as an arbitrary binary file.
    mimetypes.add_type('image/webp', '.webp')
    uvicorn.run('backend.app:app', host=args.host, port=args.port, access_log=False)


if __name__ == '__main__':
    main()
