import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { PRODUCT } from './release-contract.mjs';

const execute = promisify(execFile);
const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    artifact: { type: 'string' },
    executable: { type: 'string' },
    version: { type: 'string' },
  },
});
if (!values.artifact || !values.version) throw new Error('--artifact and --version are required');
const artifact = resolve(values.artifact);

if (values.platform === 'linux') {
  const fields = (await execute('dpkg-deb', [
    '-f', artifact, 'Package', 'Version', 'Maintainer', 'Description',
  ])).stdout;
  for (const expected of [PRODUCT.packageName, values.version, PRODUCT.author]) {
    if (!fields.includes(expected)) throw new Error(`Debian metadata missing: ${expected}`);
  }
  const extraction = await mkdtemp(join(tmpdir(), 'evitania-deb-inspect-'));
  try {
    await execute('dpkg-deb', ['-x', artifact, extraction]);
    const applicationDirectory = join(extraction, 'usr/share/applications');
    const desktopName = (await readdir(applicationDirectory)).find((name) => name.endsWith('.desktop'));
    if (!desktopName) throw new Error('Debian desktop entry is missing');
    const desktop = await readFile(join(applicationDirectory, desktopName), 'utf8');
    for (const expected of [
      `Name=${PRODUCT.name}`,
      'Comment=Gerenciador de produção e coleta para Evitania',
      'Icon=evitania-manager',
    ]) {
      if (!desktop.includes(expected)) throw new Error(`Debian desktop metadata missing: ${expected}`);
    }
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
      const icon = join(
        extraction,
        `usr/share/icons/hicolor/${size}x${size}/apps/evitania-manager.png`,
      );
      const bytes = await readFile(icon);
      if (bytes.length < 64) throw new Error(`Debian ${size}px icon is invalid`);
    }
  } finally {
    await rm(extraction, { recursive: true, force: true });
  }
  console.log(`Debian metadata, desktop entry, and icons valid: ${basename(artifact)}`);
} else if (values.platform === 'windows') {
  const executable = resolve(values.executable ?? values.artifact);
  const escaped = (path) => path.replaceAll("'", "''");
  const script = [
    `Add-Type -AssemblyName System.Drawing`,
    `$installer = Get-Item '${escaped(artifact)}'`,
    `$executable = Get-Item '${escaped(executable)}'`,
    `$installerIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($installer.FullName)`,
    `$executableIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($executable.FullName)`,
    `if ($null -eq $installerIcon -or $null -eq $executableIcon) { throw 'native icon missing' }`,
    `$installerSignature = Get-AuthenticodeSignature $installer.FullName`,
    `$executableSignature = Get-AuthenticodeSignature $executable.FullName`,
    `[pscustomobject]@{ installerProduct=$installer.VersionInfo.ProductName; `
      + `executableProduct=$executable.VersionInfo.ProductName; `
      + `company=$executable.VersionInfo.CompanyName; `
      + `description=$executable.VersionInfo.FileDescription; `
      + `version=$executable.VersionInfo.ProductVersion; `
      + `installerSignature=$installerSignature.Status.ToString(); `
      + `executableSignature=$executableSignature.Status.ToString() } | ConvertTo-Json -Compress`,
  ].join('; ');
  const result = JSON.parse((await execute('powershell', ['-NoProfile', '-Command', script])).stdout);
  for (const [field, expected] of Object.entries({
    installerProduct: PRODUCT.name,
    executableProduct: PRODUCT.name,
    company: PRODUCT.author,
    version: values.version,
  })) {
    if (!String(result[field]).includes(expected)) throw new Error(`Windows metadata mismatch: ${field}`);
  }
  if (!String(result.description).trim()) throw new Error('Windows executable description is missing');
  const credentialsPresent = Boolean(process.env.WIN_CSC_LINK && process.env.WIN_CSC_KEY_PASSWORD);
  const signatures = [result.installerSignature, result.executableSignature];
  if (credentialsPresent && signatures.some((status) => status !== 'Valid')) {
    throw new Error('signed Windows installer/executable is not valid');
  }
  if (!credentialsPresent && signatures.some((status) => status !== 'NotSigned')) {
    throw new Error(`unsigned Windows status is not explicit: ${signatures.join(', ')}`);
  }
  console.log(`NSIS/executable metadata, icons, and signing valid: ${basename(artifact)} (${signatures[0]})`);
} else {
  throw new Error('--platform must be linux or windows');
}
