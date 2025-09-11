import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, rename, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
const exec = promisify(_exec);

// --- read config from CLI/env, default '05preprod'
function argVal(names) {
  for (const a of process.argv.slice(2)) {
    for (const n of names) {
      if (a === n) return null;                 // value is next token
      if (a.startsWith(n + '=')) return a.split('=').slice(1).join('=');
    }
  }
  const idx = process.argv.findIndex(a => names.includes(a));
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1];
  return undefined;
}
const CONFIG =
  process.env.CONFIG ??
  process.env.ANGULAR_CONFIGURATION ??
  argVal(['--config','--configuration']) ??
  '05preprod';

const ANGULAR_BUILD_CMD = `npm run build -- --configuration ${CONFIG}`;
const HOST_DIR = 'host';
const DIST_ROOT = 'dist/myapp';
const DIST_APP = join(DIST_ROOT, 'app');

async function run(cmd, cwd) {
  console.log(`\n> ${cmd}${cwd ? `  (cwd: ${cwd})` : ''}`);
  await exec(cmd, { cwd, env: process.env });
}

// robust move (rename with copy+delete fallback)
async function moveEntry(from, to) {
  await rm(to, { recursive: true, force: true });
  try { await rename(from, to); }
  catch (err) {
    if (['EXDEV','EPERM','EINVAL'].includes(err?.code)) {
      await cp(from, to, { recursive: true, force: true });
      await rm(from, { recursive: true, force: true });
    } else throw err;
  }
}
async function moveDirContents(srcDir, destDir, { skip = [] } = {}) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    if (skip.includes(e.name)) continue;
    await moveEntry(join(srcDir, e.name), join(destDir, e.name));
  }
}
async function copyDirContents(srcDir, destDir, { skip = [] } = {}) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    if (skip.includes(e.name)) continue;
    await cp(join(srcDir, e.name), join(destDir, e.name), { recursive: true, force: true });
  }
}

(async () => {
  try {
    await run(ANGULAR_BUILD_CMD);
    try { await run('npm run build', HOST_DIR); }
    catch { console.warn('host build skipped.'); }

    await rm(DIST_APP, { recursive: true, force: true });
    await mkdir(DIST_APP, { recursive: true });
    await moveDirContents(DIST_ROOT, DIST_APP, { skip: ['app'] });
    await copyDirContents(HOST_DIR, DIST_ROOT, { skip: ['node_modules', '.git'] });

    console.log(`\n✅ Done with configuration: ${CONFIG}\n`);
  } catch (err) {
    console.error('\n❌ Error:', err?.stderr || err?.message || err);
    process.exit(1);
  }
})();


- run: npm run build:preprod -- --config ${{ vars.CONFIG || '05preprod' }}

Env var (POSIX / PowerShell / CMD):

macOS/Linux: CONFIG=05preprod npm run build:preprod

PowerShell: $env:CONFIG='05preprod'; npm run build:preprod

CMD: set CONFIG=05preprod && npm run build:preprod
(If you prefer one syntax everywhere, add cross-env and use cross-env CONFIG=05preprod ….)
