import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../assets/app/icon.svg', import.meta.url);
const outputDirectory = new URL('../assets/app/', import.meta.url);
const linuxDirectory = new URL('../assets/app/icons/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await mkdir(linuxDirectory, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const sourceBytes = await readFile(source);
if (sourceBytes.length < 64 || !sourceBytes.toString('utf8').includes('<svg')) {
  throw new Error('assets/app/icon.svg is missing or invalid');
}
const pngBuffers = await Promise.all(sizes.map(async (size) => {
  const buffer = await sharp(fileURLToPath(source)).resize(size, size).png().toBuffer();
  const metadata = await sharp(buffer).metadata();
  if (metadata.width !== size || metadata.height !== size) throw new Error(`invalid generated ${size}px icon`);
  await writeFile(new URL(`${size}x${size}.png`, linuxDirectory), buffer);
  return buffer;
}));
await writeFile(new URL('icon.png', outputDirectory), pngBuffers.at(-1));
await writeFile(new URL('icon.ico', outputDirectory), await pngToIco(pngBuffers));
