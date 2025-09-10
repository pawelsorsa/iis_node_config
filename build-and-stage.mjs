// Node 16+
// Build Angular app, build host, then stage outputs:
// - Copy all files from dist/myapp -> dist/myapp/app
// - Copy all files from host -> dist/myapp (not into a subfolder)

import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, stat, cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const exec = promisify(_exec);

const ANGULAR_BUILD_CMD = 'npm run build -- --configuration 05preprod'; // note the extra -- to forward args
const HOST_DIR = 'host';
const DIST_ROOT = 'dist/myapp';
const DIST_APP = join(DIST_ROOT, 'app');

// Run a command (shows output in CI logs)
async function run(cmd, cwd) {
  console.log(`\n> ${cmd}${cwd ? `  (cwd: ${cwd})` : ''}`);
  await exec(cmd, { cwd, env: process.env });
}

// Copy contents of a directory into another directory (not the directory itself).
// Optional: skip names like ['node_modules', '.git']
async function copyDirContents(srcDir, destDir, { skip = [] } = {}) {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.includes(entry.name)) continue;
    const from = join(srcDir, entry.name);
    const to = join(destDir, entry.name);
    // Ensure dest parent exists
    await mkdir(destDir, { recursive: true });
    const s = await stat(from);
    if (s.isDirectory()) {
      await cp(from, to, { recursive: true, force: true });
    } else {
      await cp(from, to, { force: true });
    }
  }
}

(async () => {
  try {
    // 1) Angular build
    await run(ANGULAR_BUILD_CMD);

    // 2) host build (ignore if no package.json or no build script)
    try {
      await run('npm run build', HOST_DIR);
    } catch (e) {
      console.warn('host build skipped (no script or failed). Continuing…');
    }

    // 3) Copy dist/myapp -> dist/myapp/app  (do NOT remove originals)
    await mkdir(DIST_ROOT, { recursive: true }); // ensure exists
    await mkdir(DIST_APP, { recursive: true });
    // avoid copying app into itself if script is re-run
    await copyDirContents(DIST_ROOT, DIST_APP, { skip: ['app'] });

    // 4) Copy host/* -> dist/myapp  (skip noisy folders)
    await copyDirContents(HOST_DIR, DIST_ROOT, { skip: ['node_modules', '.git'] });

    // Optional: if host has its own dist or build output you DON'T want, skip it:
    // await copyDirContents(HOST_DIR, DIST_ROOT, { skip: ['node_modules', '.git', 'dist'] });

    console.log('\n✅ Staging complete.\n');
  } catch (err) {
    console.error('\n❌ Failed:', err?.stderr || err?.message || err);
    process.exit(1);
  }
})();
