// Node 18+
// 1) npm run build -- --configuration 05preprod
// 2) w host/ -> npm run build (jeśli jest)
// 3) PRZENIEŚ (move) zawartość dist/myapp -> dist/myapp/app
// 4) skopiuj pliki z host/ -> dist/myapp

import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, rename, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const exec = promisify(_exec);

const ANGULAR_BUILD_CMD = 'npm run build -- --configuration 05preprod';
const HOST_DIR = 'host';
const DIST_ROOT = 'dist/myapp';
const DIST_APP = join(DIST_ROOT, 'app');

async function run(cmd, cwd) {
  console.log(`\n> ${cmd}${cwd ? `  (cwd: ${cwd})` : ''}`);
  await exec(cmd, { cwd, env: process.env });
}

// solidny "move": rename z fallbackiem copy+delete (EXDEV, Windows itp.)
async function moveEntry(from, to) {
  // upewnij się, że cel nie istnieje
  await rm(to, { recursive: true, force: true });
  try {
    await rename(from, to);
  } catch (err) {
    if (['EXDEV', 'EPERM', 'EINVAL'].includes(err?.code)) {
      await cp(from, to, { recursive: true, force: true });
      await rm(from, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

async function moveDirContents(srcDir, destDir, { skip = [] } = {}) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.includes(entry.name)) continue;
    const from = join(srcDir, entry.name);
    const to = join(destDir, entry.name);
    await moveEntry(from, to);
  }
}

async function copyDirContents(srcDir, destDir, { skip = [] } = {}) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.includes(entry.name)) continue;
    const from = join(srcDir, entry.name);
    const to = join(destDir, entry.name);
    await cp(from, to, { recursive: true, force: true });
  }
}

(async () => {
  try {
    // 1) build Angular
    await run(ANGULAR_BUILD_CMD);

    // 2) build host (jeśli jest)
    try {
      await run('npm run build', HOST_DIR);
    } catch {
      console.warn('host build pominięty (brak skryptu lub błąd) – kontynuuję…');
    }

    // 3) czyść i przenieś do dist/myapp/app
    await rm(DIST_APP, { recursive: true, force: true });
    await mkdir(DIST_APP, { recursive: true });
    // przenieś WSZYSTKO z dist/myapp oprócz samego folderu "app"
    await moveDirContents(DIST_ROOT, DIST_APP, { skip: ['app'] });

    // 4) skopiuj zawartość host/ do dist/myapp (bez node_modules itp.)
    await copyDirContents(HOST_DIR, DIST_ROOT, { skip: ['node_modules', '.git'] });

    console.log('\n✅ Gotowe: pliki aplikacji są w dist/myapp/app, a pliki host w dist/myapp.\n');
  } catch (err) {
    console.error('\n❌ Błąd:', err?.stderr || err?.message || err);
    process.exit(1);
  }
})();
