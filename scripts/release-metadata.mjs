import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const releaseDirectory = new URL('../release/', import.meta.url);
const files = (await readdir(releaseDirectory)).filter((name) => !name.endsWith('.blockmap'));
const artifacts = files.filter((name) => /\.(AppImage|exe|zip)$/i.test(name));
const checksums = [];

for (const artifact of artifacts) {
  const content = await readFile(new URL(artifact, releaseDirectory));
  checksums.push(`${createHash('sha256').update(content).digest('hex')}  ${artifact}`);
}

await writeFile(new URL('SHA256SUMS.txt', releaseDirectory), `${checksums.join('\n')}\n`);
const packageLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const components = Object.entries(packageLock.packages).filter(([path]) => path.startsWith('node_modules/'))
  .map(([path, metadata]) => ({ type: 'library', name: path.split('node_modules/').at(-1),
    version: metadata.version, purl: `pkg:npm/${path.split('node_modules/').at(-1)}@${metadata.version}` }));
const serial = createHash('sha256').update(JSON.stringify(packageLock)).digest('hex').slice(0, 32);
const sbom = { bomFormat: 'CycloneDX', specVersion: '1.6', serialNumber: `urn:uuid:${serial}`,
  version: 1, metadata: { component: { type: 'application', name: 'evitania-manager', version: packageLock.version } }, components };
await writeFile(new URL('sbom.cdx.json', releaseDirectory), `${JSON.stringify(sbom, null, 2)}\n`);

console.log(`Metadados gerados para: ${artifacts.map((name) => join('release', name)).join(', ')}`);
