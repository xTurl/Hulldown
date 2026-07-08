/**
 * Ensures better-sqlite3 is compiled for the bundled Electron version.
 * Must run before `electron-forge package` — extraResource copies the module
 * into resources/node_modules and needs build/Release/*.node present.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeFile = path.join(
  repoRoot,
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
);
const rebuildCli = path.join(repoRoot, 'node_modules/@electron/rebuild/lib/cli.js');

if (!fs.existsSync(rebuildCli)) {
  console.error(`[ensure-native-deps] ERROR: ${rebuildCli} not found — run npm install`);
  process.exit(1);
}

// Invoke the CLI via node — node_modules/.bin/electron-rebuild is a .cmd shim on
// Windows and execFileSync cannot spawn it (ENOENT).
execFileSync(process.execPath, [rebuildCli, '-f', '-w', 'better-sqlite3'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (!fs.existsSync(nodeFile)) {
  console.error(`[ensure-native-deps] ERROR: missing ${nodeFile}`);
  process.exit(1);
}

console.log('[ensure-native-deps] better-sqlite3 ready for packaging');
