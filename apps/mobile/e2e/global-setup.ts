import { mkdirSync } from 'node:fs';
import path from 'node:path';

// A fresh clone has no ignored verification folders. Individual specs must also
// work alone, without an earlier screenshot incidentally creating their folder.
export default function setup() {
  for (const directory of [
    process.env.TG_REDESIGN_OUTPUT,
    process.env.TG_POLISH_OUTPUT,
    process.env.TG_PORTIONS_OUTPUT,
    ...['craft-redesign', 'daily-loop', 'dark-redesign', 'design-revision', 'fiber',
      'quick-entry-polish', 'quick-entry-polish/regressions', 'portions', 'retro-redesign',
      'targets-support'].map(name => `../../verification/${name}`),
    path.dirname(process.env.TG_TEST_REPORT ?? '../../verification/dark-redesign/browser-results.json'),
  ]) if (directory) mkdirSync(path.resolve(directory), { recursive: true });
}
