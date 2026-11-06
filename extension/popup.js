const open = hash => chrome.tabs.create({ url: chrome.runtime.getURL(`workspace.html#${hash}`) });
const status = document.getElementById('status');
const globalButton = document.getElementById('global-helper');
const globalOrigins = ['https://*/*', 'http://*/*'];
const hasGlobal = (await chrome.scripting.getRegisteredContentScripts({ ids: ['hz-global'] })).length > 0;
globalButton.textContent = hasGlobal ? '모든 사이트에서 해줌 버튼 끄기' : '모든 사이트에서 해줌 버튼 켜기';
globalButton.onclick = async () => {
  try {
    if (hasGlobal) {
      const result = await chrome.runtime.sendMessage({ type: 'disableGlobal' });
      if (!result?.ok) throw new Error(result?.error);
    } else {
      if (!await chrome.permissions.request({ origins: globalOrigins })) { status.textContent = '허용하지 않은 사이트에는 버튼이 표시되지 않아요.'; return; }
      const result = await chrome.runtime.sendMessage({ type: 'enableGlobal' });
      if (!result?.ok || !result.data) throw new Error(result?.error || '권한을 확인해 주세요.');
    }
    location.reload();
  } catch (error) { status.textContent = error.message || '해줌 버튼 설정을 변경하지 못했어요.'; }
};
document.getElementById('tasks').onclick = () => open('tasks');
document.getElementById('upload').onclick = () => open('upload');
document.getElementById('settings').onclick = () => open('settings');
document.getElementById('capture').onclick = async () => {
  const button = document.getElementById('capture');
  button.disabled = true;
  status.textContent = '현재 탭에서 캡쳐를 시작하고 있어요.';
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !/^(https?|file):/.test(tab.url || '')) throw new Error('일반 웹페이지나 PDF에서 캡쳐를 시작해 주세요. Chrome 설정·새 탭에서는 캡쳐할 수 없습니다.');
    const result = await chrome.runtime.sendMessage({ type: 'startCapture', payload: { tabId: tab.id } });
    if (!result?.ok) throw new Error(result?.error || '캡쳐를 시작하지 못했어요.');
    window.close();
  } catch (error) {
    status.textContent = error.message || '캡쳐 권한을 확인하고 다시 시도해 주세요.';
    button.disabled = false;
  }
};
document.getElementById('selection').onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('공지 웹페이지에서 문장을 드래그해 주세요.');
    const [selection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ text: window.getSelection()?.toString() || '', source: { title: document.title, url: location.origin + location.pathname } }) });
    const response = await chrome.runtime.sendMessage({ type: 'selection', payload: selection.result });
    if (!response.ok) throw new Error(response.error);
  } catch (error) { status.textContent = error.message; }
};
const helper = document.getElementById('helper');
let currentOrigin; let registrationId;
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('file:')) {
    const allowed = await chrome.extension.isAllowedFileSchemeAccess();
    helper.disabled = false;
    helper.textContent = allowed ? '이 PDF에 해줌 버튼 표시하기' : 'PDF 파일 접근 설정 열기';
    if (!allowed) status.textContent = 'PDF에 버튼을 표시하려면 ‘표시 설정’에서 파일 접근을 허용해 주세요.';
    helper.onclick = async () => {
      if (!allowed) return chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] }); window.close(); }
      catch { status.textContent = 'PDF를 새로고침해 주세요. 표시되지 않으면 PDF 업로드도 사용할 수 있어요.'; }
    };
  } else {
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('일반 웹페이지에서 켤 수 있어요.');
  currentOrigin = new URL(tab.url).origin;
  registrationId = 'hz-' + [...new TextEncoder().encode(currentOrigin)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: [registrationId] });
  if (hasGlobal) { helper.disabled = true; helper.textContent = '모든 일반 웹사이트에서 자동 표시 중'; }
  else
  helper.textContent = registrations.length ? '이 사이트 해줌 버튼 끄기' : '이 사이트 해줌 버튼 켜기';
  }
} catch (error) { helper.disabled = true; helper.textContent = error.message; }
if (currentOrigin) {
helper.onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const registrations = await chrome.scripting.getRegisteredContentScripts({ ids: [registrationId] });
    if (registrations.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [registrationId] });
      const tabs = await chrome.tabs.query({ url: `${currentOrigin}/*` });
      await Promise.allSettled(tabs.map(entry => chrome.tabs.sendMessage(entry.id, { type: 'disableHelper' })));
      await chrome.permissions.remove({ origins: [`${currentOrigin}/*`] });
      helper.textContent = '이 사이트 해줌 버튼 켜기'; status.textContent = '이 사이트의 드래그 도우미를 껐어요.';
    } else {
      if (!await chrome.permissions.request({ origins: [`${currentOrigin}/*`] })) return;
      await chrome.scripting.registerContentScripts([{ id: registrationId, matches: [`${currentOrigin}/*`], js: ['selection-helper.js'], runAt: 'document_idle' }]);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selection-helper.js'] });
      helper.textContent = '이 사이트 해줌 버튼 끄기'; status.textContent = '오른쪽 아래 동그란 해줌 버튼을 눌러 기능을 열어보세요. 문장 드래그도 지원해요.';
    }
  } catch { status.textContent = '이 페이지에서는 도우미를 켤 수 없어요. 복사해 직접 붙여 넣어 주세요.'; }
};
}
