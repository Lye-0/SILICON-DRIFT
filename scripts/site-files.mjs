/** The same allowlist is used by the preview server and the Pages packager.
 * Only website files are served/published. No Git metadata, docs, tests or secrets.
 */
import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SITE_ENTRIES = ['index.html', 'css', 'js', 'assets', '.nojekyll'];

export async function listSiteFiles(root = PROJECT_ROOT) {
  const files = [];
  async function visit(relative) {
    const absolute = join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in the site: ${relative}`);
    if (info.isDirectory()) {
      const entries = (await readdir(absolute)).sort();
      for (const name of entries) {
        if (!name.startsWith('.')) await visit(`${relative}/${name}`);
      }
    } else if (info.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Not a regular site file: ${relative}`);
    }
  }
  for (const entry of SITE_ENTRIES) await visit(entry);
  return files.sort();
}
