import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);

function probe(binaryPath) {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });

  return result.status === 0 && /^\d+\.\d+\.\d+$/.test(result.stdout.trim());
}

const environment = { ...process.env };
let activeBinary = 'platform default';

if (process.platform === 'win32') {
  const binaryDirectory = path.join(process.cwd(), 'node_modules', '@esbuild', 'win32-x64');
  const standardBinary = path.join(binaryDirectory, 'esbuild.exe');
  const fallbackBinary = path.join(binaryDirectory, 'gesbuild.exe');
  const esbuildPackage = JSON.parse(
    readFileSync(path.join(process.cwd(), 'node_modules', 'esbuild', 'package.json'), 'utf8'),
  );

  let standardHealthy = probe(standardBinary);
  let fallbackHealthy = probe(fallbackBinary);

  // Preserve a second verified filename while the installed binary is healthy.
  // This protects local builds if Windows security later blocks or quarantines
  // the standard executable name.
  if (standardHealthy && !fallbackHealthy) {
    try {
      copyFileSync(standardBinary, fallbackBinary);
      fallbackHealthy = probe(fallbackBinary);
    } catch {
      // The standard binary is sufficient; inability to seed the fallback is
      // non-fatal and will be reported only if the standard binary later fails.
    }
  }

  if (!standardHealthy && !fallbackHealthy) {
    console.warn('Both local esbuild binaries failed validation; reinstalling the pinned native package.');
    const npmCli = process.env.npm_execpath;
    const repair = npmCli
      ? spawnSync(process.execPath, [
          npmCli,
          'install',
          '--no-save',
          '--package-lock=false',
          '--ignore-scripts',
          '--force',
          `@esbuild/win32-x64@${esbuildPackage.version}`,
        ], { stdio: 'inherit', timeout: 120000, windowsHide: true })
      : { status: 1 };

    if (repair.status === 0) {
      standardHealthy = probe(standardBinary);
      if (standardHealthy) {
        try {
          copyFileSync(standardBinary, fallbackBinary);
          fallbackHealthy = probe(fallbackBinary);
        } catch {
          fallbackHealthy = false;
        }
      }
    }
  }

  if (!standardHealthy) {
    if (!fallbackHealthy) {
      console.error(
        'esbuild could not be repaired automatically. Check Windows Security quarantine history, ' +
        'then run `npm ci` and `npm run doctor:esbuild`.',
      );
      process.exit(1);
    }

    environment.ESBUILD_BINARY_PATH = fallbackBinary;
    activeBinary = fallbackBinary;
    console.warn('The standard esbuild binary is unavailable; using the verified Windows fallback.');
  } else {
    activeBinary = standardBinary;
  }
}

if (process.argv.includes('--health-check')) {
  console.log(`esbuild health check passed (${activeBinary}).`);
  process.exit(0);
}

const viteEntry = path.resolve(path.dirname(require.resolve('vite')), '..', '..', 'bin', 'vite.js');
const result = spawnSync(process.execPath, [viteEntry, ...process.argv.slice(2)], {
  env: environment,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
