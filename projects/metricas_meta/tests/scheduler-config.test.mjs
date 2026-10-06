import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = Object.fromEntries(await Promise.all(
  ['run-scheduled.ps1', 'install-scheduled-tasks.ps1', 'uninstall-scheduled-tasks.ps1']
    .map(async (name) => [name, await readFile(resolve(projectRoot, 'scripts', name), 'utf8')]),
));

test('defines the approved task names and local-time schedules', () => {
  const installer = scripts['install-scheduled-tasks.ps1'];
  assert.match(installer, /InstagramPresenton-Weekly/);
  assert.match(installer, /InstagramPresenton-Monthly/);
  assert.match(installer, /-Weekly -DaysOfWeek Monday -At '08:00'/);
  assert.match(installer, /-Monthly -DaysOfMonth 1 -At '08:00'/);
  assert.match(installer, /machine's local timezone/);
});

test('constructs the runner from its own project path and passes the window', () => {
  const runner = scripts['run-scheduled.ps1'];
  const installer = scripts['install-scheduled-tasks.ps1'];
  assert.match(runner, /Resolve-Path \(Join-Path \$PSScriptRoot '\.\.'\)/);
  assert.match(runner, /Push-Location \$ProjectRoot/);
  assert.match(runner, /npm run instagram:present -- --window \$Window/);
  assert.match(installer, /Join-Path \$ProjectRoot 'scripts\\run-scheduled\.ps1'/);
  assert.match(installer, /-Window \{1\}/);
});

test('restricts the runner to valid windows and logs under data/logs', () => {
  const runner = scripts['run-scheduled.ps1'];
  assert.match(runner, /\[ValidateSet\('weekly', 'monthly'\)\]/);
  assert.match(runner, /Join-Path \$ProjectRoot 'data\\logs'/);
  assert.match(runner, /\$LASTEXITCODE/);
  assert.match(runner, /exit 1/);
  assert.match(runner, /scheduler-common\.ps1/);
});

test('redacts .env, bearer, labeled, and unlabeled token-like output before logging', { skip: process.platform !== 'win32' }, async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), 'instagram-scheduler-'));
  const common = resolve(projectRoot, 'scripts', 'scheduler-common.ps1');
  const logPath = resolve(tempRoot, 'scheduled.log');
  const envSecret = 'dotenv-weekly-secret';
  const shortSecret = 'q';
  const apiSecret = 'dotenv-api-key-secret';
  const authSecret = 'auth-field-secret';
  const refreshSecret = 'refresh-field-secret';
  const bearerSecret = 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature';
  const unlabeledSecret = 'sk_live_1234567890abcdef';
  const command = [
    `. (Get-Item '${quotePowerShell(common)}').FullName`,
    `Set-Content -LiteralPath '${quotePowerShell(resolve(tempRoot, '.env'))}' -Value @('META_ACCESS_TOKEN=${envSecret}', 'PRESENTON_API_KEY="${apiSecret}"', 'SHORT_SECRET=${shortSecret}')`,
    `$text = 'access_token=${envSecret}; auth_token=${authSecret}; refresh_token=${refreshSecret}; short=${shortSecret}; Authorization: ${bearerSecret}; custom=${unlabeledSecret}; trace=0123456789abcdef0123456789abcdef'`,
    `$safe = Write-ScheduledLog -Path '${quotePowerShell(logPath)}' -Text $text -Secrets (Get-ScheduledRedactionSecrets -ProjectRoot '${quotePowerShell(tempRoot)}')`,
    `if ((Get-Content -Raw '${quotePowerShell(logPath)}') -match '${envSecret}|${apiSecret}|${authSecret}|${refreshSecret}|${shortSecret}|${bearerSecret.replace('Bearer ', '')}|${unlabeledSecret}|0123456789abcdef0123456789abcdef') { exit 2 }`,
    'Write-Output $safe',
  ].join('; ');
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
    const log = await readFile(logPath, 'utf8');
    assert.doesNotMatch(output, new RegExp(`${envSecret}|${apiSecret}|${authSecret}|${refreshSecret}|${shortSecret}|${unlabeledSecret}`));
    assert.doesNotMatch(log, new RegExp(`${envSecret}|${apiSecret}|${authSecret}|${refreshSecret}|${shortSecret}|${unlabeledSecret}`));
    assert.match(log, /\[REDACTED\]/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('returns failure when the scheduled pipeline exits non-zero and logs safe output', { skip: process.platform !== 'win32' }, async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), 'instagram-scheduler-failure-'));
  const fakeNpm = resolve(tempRoot, 'npm.cmd');
  const runner = resolve(projectRoot, 'scripts', 'run-scheduled.ps1');
  const logDirectory = resolve(projectRoot, 'data', 'logs');
  const before = await readdir(logDirectory).catch(() => []);
  await writeFile(fakeNpm, '@echo off\r\necho access_token=runner-secret\r\nexit /b 7\r\n');
  const command = [
    `$env:PATH = '${quotePowerShell(tempRoot)};' + $env:PATH`,
    "$env:PRESENTON_API_KEY = 'runner-api-secret'",
    `& '${quotePowerShell(runner)}' -Window weekly`,
  ].join('; ');
  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const after = await readdir(logDirectory);
    const created = after.filter((name) => !before.includes(name) && name.startsWith('scheduled-weekly-'));
    assert.equal(created.length, 1);
    const logPath = resolve(logDirectory, created[0]);
    const log = await readFile(logPath, 'utf8');
    assert.doesNotMatch(log, /runner-secret|runner-api-secret/);
    await rm(logPath, { force: true });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('uninstaller is idempotent and does not register tasks', () => {
  const uninstaller = scripts['uninstall-scheduled-tasks.ps1'];
  assert.match(uninstaller, /-ErrorAction SilentlyContinue/);
  assert.match(uninstaller, /Unregister-ScheduledTask/);
  assert.doesNotMatch(uninstaller, /AllUsers/);
  assert.doesNotMatch(uninstaller, /Register-ScheduledTask/);
});

function quotePowerShell(value) {
  return value.replace(/'/g, "''");
}
