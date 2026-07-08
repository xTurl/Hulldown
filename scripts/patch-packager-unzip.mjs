/**
 * Patches @electron/packager to use the system `unzip` binary on Linux.
 *
 * extract-zip (yauzl + Node streams) hangs on Node.js 26+ after the first
 * entry — packaging then stalls forever at "Copying files" with only
 * locales/da.pak in the temp dir. System unzip works reliably on all versions.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const unzipPath = path.join(
  path.dirname(require.resolve('@electron/packager/package.json')),
  'dist',
  'unzip.js',
);

const MARKER = 'PATCHED_LINUX_UNZIP_CLI';

if (fs.readFileSync(unzipPath, 'utf8').includes(MARKER)) {
  process.exit(0);
}

const patched = `"use strict";
// ${MARKER}
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractElectronZip = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const extract_zip_1 = __importDefault(require("extract-zip"));
async function extractElectronZip(zipPath, targetDir) {
    if (process.platform === "linux") {
        fs_1.default.mkdirSync(targetDir, { recursive: true });
        (0, child_process_1.execFileSync)("unzip", ["-q", "-o", zipPath, "-d", targetDir], { stdio: "inherit" });
        return;
    }
    await (0, extract_zip_1.default)(zipPath, { dir: targetDir });
}
exports.extractElectronZip = extractElectronZip;
`;

fs.writeFileSync(unzipPath, patched);
console.log('[patch-packager-unzip] Patched @electron/packager to use system unzip on Linux');
