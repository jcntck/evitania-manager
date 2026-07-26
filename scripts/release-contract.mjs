import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export const PRODUCT = Object.freeze({
  name: 'Evitania Manager',
  packageName: 'evitania-manager',
  description: 'Gerenciador de produção e coleta para Evitania',
  author: 'João Neto',
});

export const PLATFORM_CONTRACT = Object.freeze({
  linux: Object.freeze({ extension: '.deb', tagSuffix: '-linux' }),
  windows: Object.freeze({ extension: '.exe', tagSuffix: '-windows' }),
});

export const releaseTags = (version) => [
  `${version}-linux`,
  `${version}-windows`,
  version,
];

export const assertReleaseVersion = (version, packageVersion) => {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`invalid release version: ${version}`);
  }
  if (version !== `v${packageVersion}`) {
    throw new Error(`release ${version} does not match package version ${packageVersion}`);
  }
  return version;
};

const sha256 = (content) => createHash('sha256').update(content).digest('hex');

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

const crc32 = (content) => {
  let crc = 0xffffffff;
  for (const byte of content) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export const createSingleFileZip = async (sourcePath, zipPath) => {
  const content = await readFile(sourcePath);
  const name = Buffer.from(basename(sourcePath), 'utf8');
  const crc = crc32(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + content.length, 16);
  await writeFile(zipPath, Buffer.concat([local, name, content, central, name, end]));
};

const readZipEntries = async (zipPath) => {
  const content = await readFile(zipPath);
  const entries = [];
  let offset = 0;
  while (offset + 30 <= content.length && content.readUInt32LE(offset) === 0x04034b50) {
    const method = content.readUInt16LE(offset + 8);
    const compressedSize = content.readUInt32LE(offset + 18);
    const nameLength = content.readUInt16LE(offset + 26);
    const extraLength = content.readUInt16LE(offset + 28);
    const dataOffset = offset + 30 + nameLength + extraLength;
    entries.push({
      name: content.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'),
      method,
      content: content.subarray(dataOffset, dataOffset + compressedSize),
    });
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return entries;
};

export const readZipMembers = async (zipPath) =>
  (await readZipEntries(zipPath)).map((entry) => entry.name);

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const regularFileNames = async (directory, { strict = true } = {}) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const invalid = strict ? entries.find((entry) => !entry.isFile()) : undefined;
  if (invalid) throw new Error(`release inventory contains non-file entry: ${invalid.name}`);
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
};

const nativeArtifact = async (directory, platform, options) => {
  const contract = PLATFORM_CONTRACT[platform];
  if (!contract) throw new Error(`unsupported platform: ${platform}`);
  const files = await regularFileNames(directory, options);
  const matches = files.filter((name) => name.toLowerCase().endsWith(contract.extension));
  if (matches.length !== 1) throw new Error(`${platform} requires exactly one ${contract.extension} artifact`);
  return matches[0];
};

const sbomFor = (packageLock, version) => ({
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${sha256(JSON.stringify(packageLock)).slice(0, 32)}`,
  version: 1,
  metadata: {
    component: {
      type: 'application',
      name: PRODUCT.packageName,
      version,
      authors: [{ name: PRODUCT.author }],
      description: PRODUCT.description,
    },
  },
  components: Object.entries(packageLock.packages ?? {})
    .filter(([path, metadata]) => path.startsWith('node_modules/') && metadata.version)
    .map(([path, metadata]) => ({
      type: 'library',
      name: path.split('node_modules/').at(-1),
      version: metadata.version,
    })),
});

export const preparePlatformEvidence = async ({
  platform,
  buildDirectory,
  publishDirectory,
  packageLockPath,
  packageVersion,
  signed = false,
}) => {
  const artifactName = await nativeArtifact(buildDirectory, platform, { strict: false });
  const artifact = await readFile(join(buildDirectory, artifactName));
  await writeFile(join(publishDirectory, artifactName), artifact);
  const zipName = `${artifactName}.zip`;
  await createSingleFileZip(join(publishDirectory, artifactName), join(publishDirectory, zipName));
  const subjects = [];
  for (const name of [artifactName, zipName]) {
    const content = await readFile(join(publishDirectory, name));
    subjects.push({ name, digest: { sha256: sha256(content) } });
  }
  await writeFile(
    join(publishDirectory, 'SHA256SUMS.txt'),
    `${subjects.map((subject) => `${subject.digest.sha256}  ${subject.name}`).join('\n')}\n`,
  );
  const packageLock = await readJson(packageLockPath);
  await writeFile(
    join(publishDirectory, 'sbom.cdx.json'),
    `${JSON.stringify(sbomFor(packageLock, packageVersion), null, 2)}\n`,
  );
  await writeFile(
    join(publishDirectory, 'provenance-subjects.json'),
    `${JSON.stringify({ subjects }, null, 2)}\n`,
  );
  await writeFile(
    join(publishDirectory, 'release-metadata.json'),
    `${JSON.stringify({
      product: PRODUCT.name,
      packageName: PRODUCT.packageName,
      version: packageVersion,
      description: PRODUCT.description,
      author: PRODUCT.author,
      platform,
      tag: `v${packageVersion}${PLATFORM_CONTRACT[platform].tagSuffix}`,
    }, null, 2)}\n`,
  );
  await writeFile(
    join(publishDirectory, 'signing-status.json'),
    `${JSON.stringify({
      platform,
      status: platform === 'windows' && signed ? 'signed' : 'unsigned',
      conditional: platform === 'windows',
      credentialsSource: platform === 'windows' && signed ? 'ci-environment' : null,
    }, null, 2)}\n`,
  );
  return validatePlatformEvidence({ platform, directory: publishDirectory, packageVersion });
};

export const validatePlatformEvidence = async ({ platform, directory, packageVersion }) => {
  const artifactName = await nativeArtifact(directory, platform);
  const zipName = `${artifactName}.zip`;
  const expected = [
    'SHA256SUMS.txt',
    artifactName,
    zipName,
    'provenance-subjects.json',
    'release-metadata.json',
    'sbom.cdx.json',
    'signing-status.json',
  ].sort();
  const files = await regularFileNames(directory);
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    throw new Error(`${platform} evidence inventory mismatch: ${files.join(', ')}`);
  }
  const zipEntries = await readZipEntries(join(directory, zipName));
  if (zipEntries.length !== 1 || zipEntries[0].name !== artifactName) {
    throw new Error(`${zipName} must contain exactly ${artifactName}`);
  }
  if (zipEntries[0].method !== 0
    || !zipEntries[0].content.equals(await readFile(join(directory, artifactName)))) {
    throw new Error(`${zipName} does not contain the exact native artifact bytes`);
  }
  const checksumLines = (await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
  const expectedSubjects = [];
  for (const name of [artifactName, zipName]) {
    const digest = sha256(await readFile(join(directory, name)));
    expectedSubjects.push({ name, digest: { sha256: digest } });
    if (!checksumLines.includes(`${digest}  ${name}`)) throw new Error(`checksum mismatch for ${name}`);
  }
  if (checksumLines.length !== 2) throw new Error('checksum inventory must contain exactly two artifacts');
  const provenance = await readJson(join(directory, 'provenance-subjects.json'));
  if (JSON.stringify(provenance.subjects) !== JSON.stringify(expectedSubjects)) {
    throw new Error('provenance subject inventory mismatch');
  }
  const sbom = await readJson(join(directory, 'sbom.cdx.json'));
  const app = sbom.metadata?.component;
  if (sbom.bomFormat !== 'CycloneDX' || app?.name !== PRODUCT.packageName || app?.version !== packageVersion) {
    throw new Error('CycloneDX application component mismatch');
  }
  const metadata = await readJson(join(directory, 'release-metadata.json'));
  for (const [field, value] of Object.entries({
    product: PRODUCT.name,
    version: packageVersion,
    description: PRODUCT.description,
    author: PRODUCT.author,
    platform,
  })) {
    if (metadata[field] !== value) throw new Error(`release metadata mismatch: ${field}`);
  }
  const signing = await readJson(join(directory, 'signing-status.json'));
  if (platform === 'windows') {
    if (!signing.conditional || !['signed', 'unsigned'].includes(signing.status)) {
      throw new Error('Windows signing status must be explicit and conditional');
    }
    if (signing.status === 'signed' && signing.credentialsSource !== 'ci-environment') {
      throw new Error('Windows signing credentials must come from CI environment');
    }
  } else if (signing.status !== 'unsigned' || signing.conditional) {
    throw new Error('Linux signing status contract mismatch');
  }
  return { artifactName, zipName, files, subjects: expectedSubjects };
};

export const validatePackageContract = async ({
  packageJson,
  requestedVersion,
  rootDirectory,
  generatedIconSizes = [16, 24, 32, 48, 64, 128, 256, 512],
  signingEnvironment = {},
}) => {
  assertReleaseVersion(requestedVersion, packageJson.version);
  if (packageJson.description !== PRODUCT.description || packageJson.author !== PRODUCT.author) {
    throw new Error('package description/author metadata mismatch');
  }
  const build = packageJson.build ?? {};
  if (!Array.isArray(build.asarUnpack) || !build.asarUnpack.includes('node_modules/@img/**/*')) {
    throw new Error('native image runtime dependencies must be unpacked from asar');
  }
  if (build.productName !== PRODUCT.name || build.linux?.maintainer !== PRODUCT.author
    || build.linux?.vendor !== PRODUCT.author
    || build.win?.signtoolOptions?.publisherName !== PRODUCT.author) {
    throw new Error('native package identity metadata mismatch');
  }
  const linuxTargets = Array.isArray(build.linux?.target) ? build.linux.target : [build.linux?.target];
  if (!linuxTargets.includes('deb') || linuxTargets.some((target) => /appimage/i.test(String(target)))) {
    throw new Error('Linux target must be Debian only');
  }
  const winTargets = Array.isArray(build.win?.target) ? build.win.target : [build.win?.target];
  if (!winTargets.includes('nsis')) throw new Error('Windows target must be NSIS');
  if (!build.linux?.desktop?.entry?.Name || !build.linux?.desktop?.entry?.Comment
    || !build.linux?.desktop?.entry?.Icon || !build.linux?.icon) {
    throw new Error('Debian desktop/icon metadata is incomplete');
  }
  if (!build.win?.icon || !build.nsis?.installerIcon || !build.nsis?.uninstallerIcon) {
    throw new Error('NSIS executable/installer icons are incomplete');
  }
  const iconPaths = [
    'assets/app/icon.svg',
    'assets/app/icon.png',
    'assets/app/icon.ico',
    ...generatedIconSizes.map((size) => `assets/app/icons/${size}x${size}.png`),
  ];
  for (const relativePath of iconPaths) {
    try {
      const info = await stat(resolve(rootDirectory, relativePath));
      if (!info.isFile() || info.size < 64) throw new Error();
    } catch {
      throw new Error(`required icon is missing or invalid: ${relativePath}`);
    }
  }
  const hasLink = Boolean(signingEnvironment.WIN_CSC_LINK);
  const hasPassword = Boolean(signingEnvironment.WIN_CSC_KEY_PASSWORD);
  if (hasLink !== hasPassword) throw new Error('Windows signing credentials are incomplete');
  return { signingStatus: hasLink ? 'signed' : 'unsigned', credentialSource: hasLink ? 'ci-environment' : null };
};
