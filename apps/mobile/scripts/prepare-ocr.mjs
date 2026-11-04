import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('public/ocr');
await mkdir(root, { recursive: true });
await copyFile('node_modules/tesseract.js/dist/worker.min.js', path.join(root, 'worker.min.js'));
for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) for (const extension of ['wasm', 'wasm.js']) {
  const name = `tesseract-core-${variant}.${extension}`;
  await copyFile(path.join('node_modules/tesseract.js-core', name), path.join(root, name));
}
for (const language of ['eng', 'nor']) await copyFile(`node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`, path.join(root, `${language}.traineddata.gz`));
for (const name of ['Tesseract.js-Apache-2.0.txt', 'Tesseract-core-Apache-2.0.txt', 'OCR-MIT-notices.txt']) await copyFile(path.join('assets/licenses', name), path.join(root, name));
console.log('Local OCR assets prepared (English and Norwegian; no photo uploads).');
