import http from 'node:http';
import path from 'node:path';
import { stat, readFile } from 'node:fs/promises';
const root = path.resolve('dist');
const types = { '.wasm': 'application/wasm', '.gz': 'application/gzip', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(file).catch(() => null))?.isFile()) file = path.join(root, 'index.html');
    // Read before committing headers: an export can replace a file between stat and read.
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(500).end('Preview unavailable'); }
}).listen(4173, '127.0.0.1', () => console.log('Local offline-test preview http://127.0.0.1:4173'));
