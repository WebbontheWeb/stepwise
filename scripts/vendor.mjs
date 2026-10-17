// Copies the browser builds of xterm.js and its fit addon from node_modules into src/vendor/,
// so the app loads them as plain <script> and <link> tags without a bundler.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'vendor');
const files = [
  ['@xterm/xterm/lib/xterm.js', 'xterm.js'],
  ['@xterm/xterm/css/xterm.css', 'xterm.css'],
  ['@xterm/addon-fit/lib/addon-fit.js', 'addon-fit.js'],
];

mkdirSync(out, { recursive: true });
for (const [from, to] of files) copyFileSync(join(root, 'node_modules', from), join(out, to));
console.log(`Copied ${files.length} files to src/vendor/`);
