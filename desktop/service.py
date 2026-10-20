"""One frozen Python runtime for the desktop engine and MCP media worker."""
import json, sys
import serve
from mcp import media_worker
if __name__=='__main__':
    if '--media-worker' in sys.argv:
        try: print(json.dumps(media_worker.main()))
        except Exception as error:
            print(json.dumps({'error':str(error)}));sys.exit(1)
    else: serve.main()
