import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../extension');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
for (const file of [manifest.action.default_popup, manifest.background.service_worker, manifest.options_page.split('#')[0], ...Object.values(manifest.icons)]) await access(resolve(root, file));
await access(resolve(root, 'file-upload.css'));
for (const name of ['popup.html', 'workspace.html', 'capture-processor.html']) {
  const html = await readFile(resolve(root, name), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!match[1].includes('://')) await access(resolve(root, match[1].split('#')[0]));
  }
}
if (manifest.permissions.some(permission => ['identity', 'alarms', 'notifications'].includes(permission))) throw new Error('UI 검토 버전에 미사용 권한이 있습니다.');
console.log('Manifest, HTML assets and UI-only permissions: OK');
