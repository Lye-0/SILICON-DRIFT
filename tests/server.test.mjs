import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createArtworkServer, normalizeBasePath } from '../serve.mjs';

async function usingServer(options, run) {
  const server = await createArtworkServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('root serves the split HTML with no caching', async () => {
  await usingServer({}, async base => {
    const r = await fetch(base + '/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(await r.text(), /1\.1\.0-split-pages/);
    assert.equal((await fetch(base + '/index.html?seed=42&safe=1')).status, 200);
  });
});

test('CSS, JavaScript and icon use executable/usable MIME types', async () => {
  await usingServer({}, async base => {
    for (const [path, mime] of [['css/style.css', 'text/css'], ['css/noscript.css', 'text/css'], ['js/app.js', 'text/javascript'], ['js/bootstrap.js', 'text/javascript'], ['assets/favicon.svg', 'image/svg+xml']]) {
      const r = await fetch(`${base}/${path}`);
      assert.equal(r.status, 200, path);
      assert.ok(r.headers.get('content-type').startsWith(mime), path);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.ok((await r.text()).length > 0);
    }
  });
});

test('GitHub Pages subdirectory serves every relative dependency', async () => {
  await usingServer({ basePath: '/SILICON-DRIFT/' }, async base => {
    const home = `${base}/SILICON-DRIFT/`;
    const r = await fetch(home);
    assert.equal(r.status, 200);
    const html = await r.text();
    const refs = [...html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)].map(m => m[1]);
    assert.equal(refs.length, 10);
    for (const ref of refs) assert.equal((await fetch(new URL(ref, home))).status, 200, ref);
    assert.equal((await fetch(base + '/js/app.js')).status, 404);
    assert.equal((await fetch(base + '/silicon-drift/')).status, 404);
    const redirect = await fetch(base + '/SILICON-DRIFT?seed=42', { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/SILICON-DRIFT/?seed=42');
  });
});

test('server does not expose repository, docs, tests, env or path traversal', async () => {
  await usingServer({}, async base => {
    for (const path of ['/.git/config', '/.env', '/README.md', '/package.json', '/serve.mjs', '/tests/core.test.mjs', '/scripts/prepare-pages.mjs', '/css/..%2fserve.mjs', '/js/%2e%2e%2f.env', '/missing.js']) {
      assert.equal((await fetch(base + path)).status, 404, path);
    }
    assert.equal((await fetch(base + '/%FF')).status, 400);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
    const head = await fetch(base + '/js/math.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.ok(Number(head.headers.get('content-length')) > 0);
  });
});

test('preview base path normalization rejects unsafe names', () => {
  assert.equal(normalizeBasePath('/'), '/');
  assert.equal(normalizeBasePath('SILICON-DRIFT'), '/SILICON-DRIFT/');
  assert.throws(() => normalizeBasePath('/../'));
  assert.throws(() => normalizeBasePath('/%2f/'));
});
