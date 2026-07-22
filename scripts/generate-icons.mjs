import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../assets/app/icon.svg', import.meta.url);
const outputDirectory = new URL('../assets/app/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const pngBuffers = await Promise.all(sizes.map((size) => sharp(fileURLToPath(source)).resize(size, size).png().toBuffer()));
await writeFile(new URL('icon.png', outputDirectory), pngBuffers.at(-1));
await writeFile(new URL('icon.ico', outputDirectory), await pngToIco(pngBuffers.slice(0, -1)));
