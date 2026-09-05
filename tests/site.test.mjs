import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { listSiteFiles, PROJECT_ROOT } from '../scripts/site-files.mjs';
import { preparePages } from '../scripts/prepare-pages.mjs';

const html = await readFile(join(PROJECT_ROOT, 'index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const expectedScripts = ['bootstrap', 'math', 'geometry', 'renderer', 'world', 'controls', 'app'];

test('HTML contains external scripts in dependency order, without inline application code', () => {
  assert.equal(scriptTags.length, expectedScripts.length);
  scriptTags.forEach((match, i) => {
    assert.match(match[1], /\bdefer\b/);
    assert.ok(match[1].includes(`./js/${expectedScripts[i]}.js`));
    assert.equal(match[2].trim(), '');
    assert.ok(!/\basync\b/.test(match[1]));
  });
  assert.ok(!/<style\b/i.test(html));
  assert.ok(!/\son[a-z]+=/.test(html));
  assert.ok(!/\/\*__[A-Z]+__\*\//.test(html));
});

test('all website asset references remain within /SILICON-DRIFT/', async () => {
  const publicFiles = new Set(await listSiteFiles());
  const refs = [...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map(m => m[1]);
  assert.equal(refs.length, 10);
  for (const ref of refs) {
    assert.ok(ref.startsWith('./'), ref);
    assert.ok(publicFiles.has(ref.slice(2)), ref);
    const resolved = new URL(ref, 'https://example.github.io/SILICON-DRIFT/');
    assert.ok(resolved.pathname.startsWith('/SILICON-DRIFT/'), ref);
  }
});

test('each split JavaScript file parses independently', async () => {
  for (const name of expectedScripts) {
    const code = await readFile(join(PROJECT_ROOT, 'js', `${name}.js`), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: name + '.js' }));
  }
});

test('website does not load a CDN or call a remote API', async () => {
  for (const path of (await listSiteFiles()).filter(f => /\.(?:html|js|css)$/.test(f))) {
    const code = await readFile(join(PROJECT_ROOT, path), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(code), path);
    assert.ok(!/url\(['"]?https?:/i.test(code), path);
    assert.ok(!/(?:src|href)=["']https?:/i.test(code), path);
  }
});

test('Pages package copies only public files byte-for-byte, preserving the split layout', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'silicon-drift-package-'));
  try {
    const output = join(temp, '_site');
    await mkdir(output);
    await writeFile(join(output, 'stale.txt'), 'old file');
    const { files } = await preparePages({ output });
    assert.equal(files.length, 12);
    assert.deepEqual(await listSiteFiles(output), files);
    for (const path of files) assert.deepEqual(await readFile(join(output, path)), await readFile(join(PROJECT_ROOT, path)), path);
    await assert.rejects(() => readFile(join(output, 'stale.txt')));
    for (const path of ['README.md', 'serve.mjs', '.env', '.git/config', '.github/workflows/deploy-pages.yml', 'tests/core.test.mjs']) await assert.rejects(() => readFile(join(output, path)));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('packager refuses to overwrite its source directory', async () => {
  await assert.rejects(() => preparePages({ output: PROJECT_ROOT }), /source directory/);
});

test('site allowlist ignores hidden files inside public directories', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'silicon-drift-hidden-'));
  try {
    const fixture = join(temp, 'fixture');
    await preparePages({ output: fixture });
    await writeFile(join(fixture, 'assets', '.env'), 'not published');
    assert.ok(!(await listSiteFiles(fixture)).includes('assets/.env'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('workflow deploys only main, with the required Pages permission and artifact path', async () => {
  const yaml = await readFile(join(PROJECT_ROOT, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(yaml, /push:\s*branches: \[main\]/);
  assert.match(yaml, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(yaml, /pages: write/);
  assert.match(yaml, /id-token: write/);
  assert.match(yaml, /name: github-pages/);
  assert.match(yaml, /path: \.\/_site/);
  assert.match(yaml, /run: npm test/);
  assert.match(yaml, /run: npm run package:pages/);
  assert.ok(!/^\s*(pull_request|schedule):/m.test(yaml));
  assert.ok(yaml.indexOf('run: npm test') < yaml.indexOf('uses: actions/deploy-pages@'));
});
