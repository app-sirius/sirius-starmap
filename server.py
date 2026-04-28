from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import sys

UPSTREAM = 'https://data.stellarium-web.org'
PROXY_PREFIX = '/data/'

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        SimpleHTTPRequestHandler.end_headers(self)

    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            self.proxy()
            return
        SimpleHTTPRequestHandler.do_GET(self)

    def proxy(self):
        upstream_path = self.path[len(PROXY_PREFIX) - 1:]
        url = UPSTREAM + upstream_path
        try:
            req = Request(url, headers={'User-Agent': 'stellarium-proxy'})
            with urlopen(req, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                ct = resp.headers.get('Content-Type', 'application/octet-stream')
                self.send_header('Content-Type', ct)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
        except (URLError, TimeoutError) as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())

def run(port=8000):
    httpd = HTTPServer(('0.0.0.0', port), CORSRequestHandler)
    print(f'Serveur sur http://localhost:{port}')
    print(f'Proxy: {PROXY_PREFIX}* -> {UPSTREAM}/*')
    httpd.serve_forever()

if __name__ == '__main__':
    run(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
