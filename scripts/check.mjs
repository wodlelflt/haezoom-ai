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
if (!manifest.permissions.includes('identity') || manifest.oauth2?.scopes?.join(',') !== 'https://www.googleapis.com/auth/calendar.events') throw new Error('Google Calendar OAuth 권한 설정이 없습니다.');
if (manifest.permissions.some(permission => ['alarms', 'notifications'].includes(permission))) throw new Error('사용하지 않는 알림 권한이 있습니다.');
console.log('Manifest, HTML assets and Calendar OAuth permissions: OK');
