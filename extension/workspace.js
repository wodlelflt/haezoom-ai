import { makeItems, validDate } from './core.mjs';
import { samples } from './samples.mjs';
import { extractText } from './ocr.mjs';
import { analyzeText } from './api.mjs';

const find = id => document.getElementById(id);
let items = []; let draft = []; let sampleIndex = 0; let source = { title: '입력한 문서' }; let busy = false;
const notify = text => { find('status').textContent = text; };
function invalidateResult() { draft = []; find('analysis-result').hidden = true; find('result-empty').hidden = false; find('save').disabled = true; }
find('input-text').addEventListener('input', () => { invalidateResult(); source = { title: '입력한 문서' }; });
function route() {
  const target = ['analyze', 'tasks', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'analyze';
  document.body.dataset.view = target;
  find('page-label').textContent = { analyze: '문서 정리', tasks: '내 할 일 · 일정 관리', settings: '사용 안내' }[target];
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== target; });
  document.querySelectorAll('nav a').forEach(link => link.classList.toggle('active', link.hash === `#${target}`));
  if (target === 'tasks') renderItems();
  if (location.hash === '#upload') find('file').focus({ preventScroll: true });
}
addEventListener('hashchange', route);
const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
function detailText(item) {
  return [item.action || item.details, item.materials?.length ? `준비물 · ${item.materials.join(', ')}` : '', item.cost != null ? `비용 · ${item.cost.toLocaleString()}원` : '', item.submission ? `제출처 · ${item.submission}` : '', item.time ? `시간 · ${item.time}` : ''].filter(Boolean).join('\n');
}
function card(item, editable = false) {
  const element = node('article', undefined, `task-card${item.completed ? ' done' : ''}`);
  const heading = node('div', undefined, 'row');
  heading.append(node('h3', item.title), node('span', item.confirmed ? '확인 완료' : '확인 필요', item.confirmed ? 'pill' : 'badge'));
  element.append(heading, node('p', `${item.kind === 'task' ? '마감일' : '일정'} · ${item.date || '날짜 없음'}`), node('p', detailText(item), 'details'));
  const details = node('details'); details.append(node('summary', '원문 근거와 출처 확인'), node('p', item.evidence || '근거 없음'), node('p', item.source?.title || '직접 입력', 'muted'));
  if (item.source?.url) details.append(node('p', item.source.url, 'source'));
  element.append(details);
  if (!editable) return element;
  const actions = node('div', undefined, 'actions');
  const button = (text, handler) => { const control = node('button', text, 'secondary'); control.type = 'button'; control.onclick = handler; return control; };
  actions.append(button(item.completed ? '다시 할 일로' : '완료 표시', () => { item.completed = !item.completed; renderItems(); }));
  const editForm = node('form', undefined, 'edit-form'); editForm.hidden = true;
  const titleLabel = node('label', '할 일 제목'); const title = node('input'); title.value = item.title; title.maxLength = 500; title.required = true; titleLabel.append(title);
  const dateLabel = node('label', '확인한 날짜'); const date = node('input'); date.type = 'date'; date.value = validDate(item.date) ? item.date : ''; dateLabel.append(date);
  const confirmed = node('input'); confirmed.type = 'checkbox'; confirmed.checked = Boolean(item.confirmed);
  const confirmation = node('label', undefined, 'consent'); confirmation.append(confirmed, node('span', '원문을 확인했고 제목과 날짜가 맞습니다'));
  const error = node('p', '', 'privacy'); error.setAttribute('role', 'alert');
  const apply = node('button', '화면에 반영', 'primary'); apply.type = 'submit';
  editForm.append(titleLabel, dateLabel, confirmation, error, apply);
  editForm.onsubmit = event => { event.preventDefault(); if (!title.value.trim()) { error.textContent = '제목을 입력해 주세요.'; return; } if (confirmed.checked && !validDate(date.value)) { error.textContent = '정확한 날짜를 입력해 주세요.'; return; } item.originalDate ||= item.date; item.title = title.value.trim(); item.date = date.value || null; item.confirmed = confirmed.checked; item.needs_review = !confirmed.checked; renderItems(); notify('현재 화면에 반영했어요. 영구 저장은 아직 연결 전이에요.'); };
  actions.append(button('날짜·내용 확인', () => { editForm.hidden = !editForm.hidden; if (!editForm.hidden) title.focus(); }));
  actions.append(button('삭제', () => { if (!confirm('이 미리보기 항목을 삭제할까요?')) return; items = items.filter(entry => entry.id !== item.id); renderItems(); }));
  const calendar = button('캘린더 연결 예정', () => notify('캘린더 연결은 후속 개발 범위입니다.')); calendar.disabled = true; calendar.title = '후배 개발자가 연결할 예정입니다.'; actions.append(calendar);
  element.append(actions, editForm); return element;
}
function renderItems() {
  find('nav-count').textContent = items.filter(item => !item.completed).length;
  const filter = find('filter').value; const query = find('search').value.trim().toLowerCase();
  const visible = items.filter(item => (!query || `${item.title} ${detailText(item)}`.toLowerCase().includes(query)) && (filter === 'all' || (filter === 'pending' && !item.completed) || (filter === 'completed' && item.completed) || (filter === 'review' && !item.confirmed)));
  find('task-list').replaceChildren(...visible.map(item => card(item, true)));
  if (!visible.length) find('task-list').append(node('p', items.length ? '조건에 맞는 할 일이 없어요.' : '아직 가져온 항목이 없어요. 문서 정리에서 샘플을 먼저 둘러보세요.', 'empty'));
}
find('filter').onchange = renderItems; find('search').oninput = renderItems;
function showDraft(result, sample = false) {
  draft = makeItems(result, source);
  find('summary').textContent = result.summary;
  find('sample-badge').hidden = !sample;
  find('result-empty').hidden = true; find('analysis-result').hidden = false;
  find('draft-list').replaceChildren(...draft.map(item => card(item)));
  find('save').disabled = !draft.length;
  if (!draft.length) find('draft-list').append(node('p', '이 문서에는 해야 할 일이나 날짜가 있는 일정이 없어요.', 'muted'));
}
find('sample').onclick = () => {
  const sample = samples[sampleIndex++ % samples.length]; find('input-text').value = sample.text; source = { title: `가상 샘플 문서 ${(sampleIndex - 1) % samples.length + 1}` };
  showDraft(sample.result, true);
  notify('미리 작성한 샘플 결과예요. AI 분석이 아닙니다. 다시 누르면 다른 유형을 볼 수 있어요.');
};
find('save').onclick = () => { let added = 0; for (const item of draft) if (!items.some(old => old.title === item.title && old.date === item.date && old.source?.title === item.source?.title)) { items.push(structuredClone(item)); added++; } location.hash = 'tasks'; renderItems(); notify(`${added}개를 미리보기 목록에 담았어요. 새로고침하면 초기화됩니다.`); };
find('run').onclick = async () => {
  const text = find('input-text').value.trim();
  if (!text) { notify('정리할 내용을 붙여 넣거나 파일을 선택해 주세요.'); find('input-text').focus(); return; }
  if (busy) return;
  if (!confirm('원문 텍스트를 해줌 Cloudflare Worker를 거쳐 Claude API로 전송해 분석합니다. 동의하고 진행할까요?')) return;
  busy = true; find('run').disabled = true; find('sample').disabled = true; find('input-text').disabled = true; invalidateResult();
  notify('원문을 전송하고 분석하고 있어요.');
  try {
    showDraft(await analyzeText(text), false);
    notify('분석이 완료됐어요. 원문과 결과를 확인해 주세요.');
  } catch (error) {
    notify(`분석에 실패했어요. ${error.message}`);
  } finally {
    busy = false; find('run').disabled = false; find('sample').disabled = false; find('input-text').disabled = false;
  }
};
find('manual').onsubmit = event => { event.preventDefault(); const title = find('manual-title').value.trim(); if (!title) return; items.push({ id: crypto.randomUUID(), kind: 'task', title, date: find('manual-date').value || null, evidence: '사용자가 직접 입력', source: { title: '직접 입력' }, needs_review: true, confirmed: false, completed: false }); event.target.reset(); renderItems(); notify('미리보기 목록에 추가했어요. 실제 저장은 연결 전입니다.'); };
find('export-ics').disabled = true; find('export-ics').title = '캘린더 연결은 후속 개발 예정입니다.';
find('export-json').onclick = () => {
  if (!items.length) return notify('내려받을 항목이 없어요.');
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, mode: 'ui-preview', items }, null, 2)], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'haezoom-preview.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
};
async function readFile(file) {
  if (!file || busy) return;
  busy = true; find('file').disabled = true; find('run').disabled = true; find('input-text').disabled = true;
  find('file-status').textContent = `${file.name} · 문서를 읽고 있어요`;
  try {
    const text = await extractText(file, message => { find('file-status').textContent = `${file.name} · ${message}`; });
    if (!text.trim()) throw new Error('읽을 수 있는 글자가 없어요. 선명한 파일을 선택해 주세요.');
    if (text.length > 45000) throw new Error('45,000자를 넘는 문서예요. 문서를 나누어 다시 선택해 주세요.');
    invalidateResult(); find('input-text').value = text; source = { title: file.name }; find('file-status').textContent = `${file.name} · ${text.length.toLocaleString()}자를 읽었어요. 인식된 내용을 확인해 주세요.`;
  } catch (error) { find('file-status').textContent = error.message.includes('fetch') ? 'OCR 언어 데이터를 내려받지 못했어요. 인터넷 연결을 확인하거나 내용을 직접 붙여 넣어 주세요.' : error.message; }
  finally { busy = false; find('file').disabled = false; find('run').disabled = false; find('input-text').disabled = false; }
}
find('file').onchange = event => readFile(event.target.files[0]);
for (const type of ['dragenter', 'dragover']) find('drop').addEventListener(type, event => { event.preventDefault(); find('drop').classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) find('drop').addEventListener(type, event => { event.preventDefault(); find('drop').classList.remove('dragging'); });
find('drop').addEventListener('drop', event => readFile(event.dataTransfer.files[0]));
route();
