/* Inline styles.css and js/*.js into one self-contained page.
   Output is a body fragment (no doctype/html/head/body) so it can be
   published directly as an Artifact; it also renders standalone. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('index.html');
const css = read('styles.css');
const JS_FILES = ['js/core.js', 'js/data.js', 'js/compile.js', 'js/schedule.js', 'js/memory.js'];
const js = JS_FILES.map((f) => `/* ── ${f} ── */\n${read(f)}`).join('\n');

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800' +
  '&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

// body markup, minus the script tags that pulled in the separate files
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const out = `<title>The Go Machine</title>
<style>
@import url("${FONTS}");

${css}
</style>

${body}

<script>
${js}
window.GoMachine.boot();
</script>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'go-machine.html'), out, 'utf8');
console.log(`dist/go-machine.html — ${(out.length / 1024).toFixed(1)} KB`);
