import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve('dist');
async function walk(dir) {
  const all = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) all.push(...await walk(file));
    else if (!item.name.endsWith('.map') && !['offline-manifest.json', 'sw.js'].includes(item.name)) all.push(file);
  }
  return all;
}
const files = (await walk(root)).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(file));
await writeFile(path.join(root, 'offline-manifest.json'), JSON.stringify({ version: hash.digest('hex').slice(0, 16), files: files.filter(f => path.relative(root, f).split(path.sep)[0] !== 'ocr').map(f => '/' + path.relative(root, f).split(path.sep).join('/')) }));
console.log(`Offline preview manifest: ${files.length} local assets`);
