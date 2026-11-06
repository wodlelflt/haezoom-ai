import { analyzeImageDataUrl, analyzeText } from './api.mjs';
import { makeItems, validDate } from './core.mjs';
import { eligibleForCalendar, GoogleCalendarError, syncGoogleEvent } from './calendar.mjs';
import { mergeItems } from './item-store.mjs';

const globalOrigins = ['https://*/*', 'http://*/*'];
let globalQueue = Promise.resolve();
let storageQueue = Promise.resolve();
const ITEMS_KEY = 'haezoomItems';
const itemPatchFields = new Set(['title', 'date', 'originalDate', 'confirmed', 'completed', 'needs_review', 'action', 'details', 'materials', 'cost', 'submission', 'evidence', 'kind', 'time', 'location', 'source']);
const extensionMessages = new Set(['getItems', 'addItems', 'updateItem', 'deleteItem', 'calendarStatus', 'calendarConnect', 'calendarDisconnect', 'syncCalendar']);
const supportedMessages = new Set(['selection', 'openWorkspace', 'captureViewport', 'readCapture', 'startCapture', 'analyzeText', 'analyzeImage', 'enableGlobal', 'disableGlobal', 'saveAnalysis', ...extensionMessages]);

function inStorageQueue(work) {
  const result = storageQueue.then(work);
  storageQueue = result.catch(() => {});
  return result;
}

function requireWorkspace(sender) {
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('해줌 작업 화면에서 요청해 주세요.');
}

async function storedItems() {
  const stored = await chrome.storage.local.get(ITEMS_KEY);
  const items = stored[ITEMS_KEY] ?? [];
  if (!Array.isArray(items)) throw new Error('저장된 할 일 목록을 읽을 수 없습니다.');
  return items;
}

async function acquireCalendarToken(interactive = false) {
  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    if (!result?.token) throw new Error('Google 인증 토큰이 없습니다.');
    return result.token;
  } catch {
    throw new Error(interactive
      ? 'Google 로그인을 완료하지 못했어요. OAuth 클라이언트 설정과 계정 권한을 확인해 주세요.'
      : 'Google 캘린더 연결이 만료됐어요. 다시 연결해 주세요.');
  }
}

async function saveCalendarLink(itemId, eventId) {
  return inStorageQueue(async () => {
    const items = await storedItems();
    const item = items.find(entry => entry.id === itemId);
    if (!item) return items;
    item.calendarEventId = eventId;
    await chrome.storage.local.set({ [ITEMS_KEY]: items });
    return items;
  });
}

async function syncCalendarItems(itemIds) {
  const items = await inStorageQueue(storedItems);
  const requested = Array.isArray(itemIds) ? new Set(itemIds) : null;
  const eligible = items.filter(item => (!requested || requested.has(item.id)) && eligibleForCalendar(item));
  const token = await acquireCalendarToken(false);
  const outcome = { synced: 0, skipped: 0, failed: [] };
  for (const item of eligible) {
    try {
      let result;
      try {
        result = await syncGoogleEvent(token, item);
      } catch (error) {
        if (!(error instanceof GoogleCalendarError) || error.status !== 401) throw error;
        await chrome.identity.removeCachedAuthToken({ token });
        const refreshedToken = await acquireCalendarToken(false);
        result = await syncGoogleEvent(refreshedToken, item);
      }
      await saveCalendarLink(item.id, result.id);
      outcome.synced++;
    } catch (error) {
      outcome.failed.push({ id: item.id, title: item.title, error: error.message || '캘린더 등록에 실패했어요.' });
    }
  }
  outcome.skipped = items.filter(item => requested?.has(item.id) && !eligibleForCalendar(item)).length;
  outcome.items = await inStorageQueue(storedItems);
  return outcome;
}
function enableGlobal() {
  const work = globalQueue.then(async () => {
    if (!await chrome.permissions.contains({ origins: globalOrigins })) return false;
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    if (!scripts.some(script => script.id === 'hz-global')) await chrome.scripting.registerContentScripts([{ id: 'hz-global', matches: globalOrigins, js: ['selection-helper.js'], runAt: 'document_idle' }]);
    const oldIds = scripts.filter(script => script.id.startsWith('hz-') && script.id !== 'hz-global').map(script => script.id);
    if (oldIds.length) await chrome.scripting.unregisterContentScripts({ ids: oldIds });
    const tabs = await chrome.tabs.query({ url: globalOrigins });
    await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] })));
    return true;
  });
  globalQueue = work.catch(() => {}); return work;
}
chrome.permissions.onAdded.addListener(() => { enableGlobal().catch(console.error); });
async function reconnectAllowedPages() {
  if (await enableGlobal()) return;
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  const matches = [...new Set(scripts.filter(script => script.id.startsWith('hz-')).flatMap(script => script.matches))];
  if (await chrome.extension.isAllowedFileSchemeAccess()) matches.push('file:///*.pdf', 'file:///*.PDF');
  if (!matches.length) return;
  const tabs = await chrome.tabs.query({ url: matches });
  await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] })));
}
chrome.runtime.onInstalled.addListener(() => {
  reconnectAllowedPages().catch(console.error);
  chrome.storage.session.get(null).then(stored => {
    const legacy = Object.keys(stored).filter(key => key.startsWith('capture-') || ['pendingCapture', 'pendingSelection'].includes(key));
    if (legacy.length) return chrome.storage.session.remove(legacy);
  }).catch(console.error);
});
chrome.runtime.onStartup.addListener(() => { enableGlobal().catch(console.error); });
let readingCapture = false;
async function readCapture(image) {
  if (readingCapture) throw new Error('다른 캡쳐의 글자를 읽고 있어요. 잠시 뒤 다시 눌러 주세요.');
  readingCapture = true;
  let timeout;
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!contexts.length) await chrome.offscreen.createDocument({ url: 'capture-processor.html', reasons: ['WORKERS', 'BLOBS'], justification: '사용자가 선택한 캡쳐 이미지의 글자를 새 창 없이 기기 안에서 읽습니다.' });
    const result = await Promise.race([
      chrome.runtime.sendMessage({ type: 'processCapture', image }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('글자 읽기가 오래 걸리고 있어요. 더 작은 영역으로 다시 시도해 주세요.')), 120000); })
    ]);
    if (!result?.ok || typeof result.text !== 'string') throw new Error(result?.error || '글자를 읽지 못했어요.');
    return result.text.slice(0, 45000);
  } finally {
    clearTimeout(timeout);
    try { await chrome.offscreen.closeDocument(); } catch {}
    readingCapture = false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !supportedMessages.has(message.type)) return false;
  const open = async () => {
    if (message.type === 'saveAnalysis') {
      if (!sender.tab || !/^(https?|file):/.test(sender.tab.url || '')) throw new Error('해줌이 표시된 웹페이지에서 저장해 주세요.');
      const sourceUrl = new URL(sender.tab.url);
      const source = { title: sender.tab.title || '가져온 문서' };
      if (sourceUrl.protocol !== 'file:') source.url = `${sourceUrl.origin}${sourceUrl.pathname}`;
      const incoming = makeItems(message.payload?.result, source);
      return inStorageQueue(async () => {
        const result = mergeItems(await storedItems(), incoming);
        await chrome.storage.local.set({ [ITEMS_KEY]: result.items });
        return result;
      });
    }
    if (extensionMessages.has(message.type)) {
      requireWorkspace(sender);
      if (message.type === 'getItems') return inStorageQueue(storedItems);
      if (message.type === 'addItems') {
        const incoming = message.payload?.items;
        if (!Array.isArray(incoming) || incoming.length > 100) throw new Error('저장할 항목 목록이 올바르지 않습니다.');
        return inStorageQueue(async () => {
          const result = mergeItems(await storedItems(), incoming);
          await chrome.storage.local.set({ [ITEMS_KEY]: result.items });
          return result;
        });
      }
      if (message.type === 'updateItem') {
        const { id, patch } = message.payload || {};
        if (typeof id !== 'string' || !patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !itemPatchFields.has(key))) throw new Error('수정할 항목 정보가 올바르지 않습니다.');
        if (patch.title !== undefined && (typeof patch.title !== 'string' || !patch.title.trim() || patch.title.length > 500)) throw new Error('제목을 확인해 주세요.');
        if (patch.date !== undefined && patch.date !== null && !validDate(patch.date)) throw new Error('날짜 형식이 올바르지 않습니다.');
        if (patch.confirmed === true && !validDate(patch.date ?? (await inStorageQueue(async () => (await storedItems()).find(item => item.id === id)?.date)))) throw new Error('확인 완료하려면 정확한 날짜를 입력해 주세요.');
        return inStorageQueue(async () => {
          const items = await storedItems();
          const item = items.find(entry => entry.id === id);
          if (!item) throw new Error('수정할 항목을 찾지 못했습니다.');
          Object.assign(item, structuredClone(patch), { revision: (item.revision || 0) + 1 });
          if (patch.confirmed !== undefined) item.needs_review = !patch.confirmed;
          await chrome.storage.local.set({ [ITEMS_KEY]: items });
          return items;
        });
      }
      if (message.type === 'deleteItem') {
        const id = message.payload?.id;
        if (typeof id !== 'string') throw new Error('삭제할 항목 ID가 없습니다.');
        return inStorageQueue(async () => {
          const items = await storedItems();
          const remaining = items.filter(item => item.id !== id);
          if (remaining.length === items.length) throw new Error('삭제할 항목을 찾지 못했습니다.');
          await chrome.storage.local.set({ [ITEMS_KEY]: remaining });
          return remaining;
        });
      }
      if (message.type === 'calendarStatus') {
        try { await acquireCalendarToken(false); return { connected: true }; }
        catch { return { connected: false }; }
      }
      if (message.type === 'calendarConnect') {
        await acquireCalendarToken(true);
        return { connected: true };
      }
      if (message.type === 'calendarDisconnect') {
        let token;
        try { token = await acquireCalendarToken(false); } catch { return { connected: false }; }
        await chrome.identity.removeCachedAuthToken({ token });
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token })
        });
        if (!response.ok) throw new Error('이 기기의 연결은 해제했지만 Google 토큰 폐기는 실패했어요. 네트워크 연결 후 다시 확인해 주세요.');
        return { connected: false };
      }
      if (message.type === 'syncCalendar') {
        const itemIds = message.payload?.itemIds;
        if (itemIds !== undefined && (!Array.isArray(itemIds) || itemIds.length > 100 || itemIds.some(id => typeof id !== 'string'))) throw new Error('동기화할 항목 목록이 올바르지 않습니다.');
        return syncCalendarItems(itemIds);
      }
    }
    if (message.type === 'analyzeImage') {
      const image = message.payload?.image;
      if (!sender.tab || typeof image !== 'string' || image.length > 12 * 1024 * 1024) throw new Error('분석할 캡쳐 이미지를 확인해 주세요.');
      return analyzeImageDataUrl(image, message.payload?.context || '');
    }
    if (message.type === 'analyzeText') {
      if (!sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('확장 프로그램에서 분석을 시작해 주세요.');
      if (sender.tab && !/^(https?|file):/.test(sender.tab.url || '')) throw new Error('웹페이지에서 분석을 시작해 주세요.');
      return analyzeText(message.payload?.text, message.payload?.layoutText || '');
    }
    if (message.type === 'enableGlobal' || message.type === 'disableGlobal') {
      if (!sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('확장 설정에서 변경해 주세요.');
      if (message.type === 'enableGlobal') return enableGlobal();
      await globalQueue;
      const scripts = await chrome.scripting.getRegisteredContentScripts();
      const ids = scripts.filter(script => script.id.startsWith('hz-')).map(script => script.id);
      if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
      const tabs = await chrome.tabs.query({ url: globalOrigins });
      await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'disableHelper' })));
      await chrome.permissions.remove({ origins: globalOrigins });
      return true;
    }
    if (message.type === 'startCapture') {
      const requestedTabId = message.payload?.tabId;
      if (requestedTabId !== undefined && (!Number.isInteger(requestedTabId) || requestedTabId < 0)) throw new Error('캡쳐할 탭 정보를 확인해 주세요.');
      if (sender.tab && requestedTabId !== undefined && requestedTabId !== sender.tab.id) throw new Error('현재 페이지에서 캡쳐를 시작해 주세요.');
      const [active] = sender.tab ? [] : await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = sender.tab || (requestedTabId !== undefined ? await chrome.tabs.get(requestedTabId) : active);
      if (!tab?.id || !/^(https?|file):/.test(tab.url || '')) throw new Error('웹페이지 또는 PDF 파일에서 캡쳐해 주세요.');
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['review.js', 'capture.js'] });
      } catch {
        throw new Error('이 탭에 캡쳐 도구를 실행할 수 없습니다. 웹페이지를 새로고침하거나 PDF 파일 접근 권한을 확인해 주세요.');
      }
      let result;
      try { result = await chrome.tabs.sendMessage(tab.id, { type: 'startCapture' }); }
      catch {
        throw new Error('캡쳐 도구가 페이지에서 응답하지 않습니다. 페이지를 새로고침하고 다시 눌러 주세요.');
      }
      if (!result?.ok) throw new Error(result?.error || '캡쳐를 시작하지 못했어요.');
      return;
    }
    if (message.type === 'captureViewport') {
      if (!sender.tab?.id) throw new Error('캡쳐할 페이지를 찾지 못했어요.');
      const [active] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
      if (active?.id !== sender.tab.id) throw new Error('캡쳐를 시작한 탭으로 돌아와 주세요.');
      try { return await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }); }
      catch { throw new Error('상단 해줌 아이콘에서 ‘현재 화면 캡쳐하기’를 눌러 시작해 주세요.'); }
    }
    if (message.type === 'readCapture') {
      const image = message.payload?.image;
      if (!sender.tab || typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 8 * 1024 * 1024) throw new Error('캡쳐 영역이 너무 커요. 더 작은 영역을 골라 주세요.');
      return readCapture(image);
    }
    if (message.type === 'openWorkspace') {
      const view = ['analyze', 'tasks', 'settings', 'upload'].includes(message.payload?.view) ? message.payload.view : 'analyze';
      await chrome.tabs.create({ url: chrome.runtime.getURL(`workspace.html#${view}`) });
      return;
    }
    const text = message.payload?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 45000) throw new Error('분석할 내용을 45,000자 이내로 선택해 주세요.');
    const [active] = sender.tab ? [] : await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = sender.tab || active;
    if (!tab?.id || !/^(https?|file):/.test(tab.url || '')) throw new Error('공지 웹페이지에서 문장을 선택해 주세요.');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['review.js'] });
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'showSelectionReview', payload: { text } });
    if (!result?.ok) throw new Error(result?.error || '내용 확인 창을 열지 못했어요.');
  };
  open().then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message }));
  return true;
});
