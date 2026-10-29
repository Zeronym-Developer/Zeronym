// Ganache's bundled lock includes a macOS watcher as an extraneous package.
// Mark that one entry optional for installation, then restore the shipped lock.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const pool = new URL('../../contracts/pool/', import.meta.url);
const path = new URL('package-lock.json', pool);
const original = readFileSync(path);
const lock = JSON.parse(original);
const watcher = lock.packages['node_modules/ganache/node_modules/fsevents'];
if (watcher?.extraneous && watcher.os?.length === 1 && watcher.os[0] === 'darwin') {
  watcher.optional = true;
}
let result;
try {
  writeFileSync(path, JSON.stringify(lock, null, 2) + '\n');
  result = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: fileURLToPath(pool), stdio: 'inherit',
  });
} finally {
  writeFileSync(path, original);
}
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
