/** Copy, never bundle: HTML, CSS and JS stay separate in the deployed artifact. */
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT, listSiteFiles } from './site-files.mjs';

export async function preparePages({ root = PROJECT_ROOT, output = join(PROJECT_ROOT, '_site') } = {}) {
  if (resolve(root) === resolve(output)) throw new Error('The output cannot be the source directory.');
  // Validate the source first, so a missing entry does not erase a previous artifact.
  const files = await listSiteFiles(root);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const file of files) {
    const destination = join(output, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, file), destination);
  }
  return { files, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await preparePages();
    console.log(`Prepared ${result.files.length} separate static files in _site/. No bundling or compilation.`);
  } catch (error) {
    console.error(`Pages packaging failed: ${error.message}`);
    process.exitCode = 1;
  }
}
