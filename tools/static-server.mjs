// 開発用の軽量静的サーバ。web/ を配信する。プレビュー確認専用（本番未使用）。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../web/', import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const filePath = normalize(join(ROOT, path));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
    const info = await stat(filePath).catch(() => null);
    const target = info && info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    res.writeHead(200, { 'content-type': TYPES[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(PORT, () => console.log(`static server: http://localhost:${PORT}/ -> web/`));
