"""Local dev server that never caches.

Python's http.server sends Last-Modified but no Cache-Control, so browsers
apply a heuristic freshness window and happily serve a stale .js after you have
edited it. That is fine for a static host and very confusing while developing.

This is a development convenience only. It lives in .claude/ and is not part of
the deployed site; GitHub Pages serves the repository directly and never runs
this file.

    python .claude/devserver.py [port]
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print("Free Bird dev server (no-cache) on http://localhost:%d" % port)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
