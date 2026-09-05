// Read-only preview server. External packages are not required.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT, listSiteFiles } from './scripts/site-files.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

export function normalizeBasePath(path = '/') {
  const value = `/${path.split('/').filter(Boolean).join('/')}/`.replace(/^\/\/$/, '/');
  if (!/^(?:\/[a-zA-Z0-9_-]+)*\/$/.test(value)) {
    throw new Error('ベースパスには英数字・ハイフン・アンダースコアを使用してください。');
  }
  return value;
}

export async function createArtworkServer({ root = PROJECT_ROOT, basePath = '/' } = {}) {
  const base = normalizeBasePath(basePath);
  const allowed = new Set(await listSiteFiles(root));
  return createServer(async (req, res) => {
    const text = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        text(405, 'Method not allowed', { Allow: 'GET, HEAD' }); return;
      }
      let url, pathname;
      try {
        url = new URL(req.url || '/', 'http://localhost');
        pathname = decodeURIComponent(url.pathname);
      } catch {
        text(400, 'Bad request'); return;
      }
      if (base !== '/' && pathname === base.slice(0, -1)) {
        res.writeHead(308, { Location: `${base}${url.search}`, 'Cache-Control': 'no-store' });
        res.end(); return;
      }
      if (!pathname.startsWith(base)) { text(404, 'Not found'); return; }
      const relative = pathname.slice(base.length) || 'index.html';
      if (!allowed.has(relative)) { text(404, 'Not found'); return; }
      const data = await readFile(join(root, relative));
      res.writeHead(200, {
        'Content-Type': MIME[extname(relative)] || 'application/octet-stream',
        'Content-Length': data.byteLength,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!res.headersSent) text(error.code === 'ENOENT' ? 404 : 500, 'Could not read the site file');
      else res.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const lan = args.includes('--lan');
    const unknown = args.find(arg => arg !== '--lan' && !arg.startsWith('--port=') && !arg.startsWith('--base='));
    if (unknown) throw new Error(`不明なオプション: ${unknown}`);
    const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) ?? process.env.PORT ?? '8000');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ポートは1〜65535の整数で指定してください。');
    const basePath = normalizeBasePath(args.find(arg => arg.startsWith('--base='))?.slice(7) ?? '/');
    const server = await createArtworkServer({ basePath });
    server.on('error', error => { console.error(`サーバーを開始できませんでした: ${error.message}`); process.exitCode = 1; });
    server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
      console.log('\nSILICON DRIFT 1.1.0');
      console.log(`PC: http://localhost:${port}${basePath}`);
      if (lan) {
        console.log('\nスマホを同じWi-Fiに接続し、次のURLをSafariなどのブラウザで開いてください。');
        for (const [name, addresses] of Object.entries(networkInterfaces())) {
          for (const a of addresses ?? []) {
            if ((a.family === 'IPv4' || a.family === 4) && !a.internal) console.log(`  ${name}: http://${a.address}:${port}${basePath}`);
          }
        }
        console.log('\n--lan はこの作品をLANに公開します。信頼できるネットワークで使用してください。');
      } else {
        console.log('スマホから見る場合: node serve.mjs --lan');
      }
      console.log('GitHub Pagesと同じパスで試す場合: node serve.mjs --base=/SILICON-DRIFT/');
      console.log('停止: Ctrl + C\n');
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
