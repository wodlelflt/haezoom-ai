(() => {
  const version = chrome.runtime.getManifest?.().version || 'dev';
  if (globalThis.__haezoomReview?.version === version && globalThis.__haezoomReview.runtime === chrome.runtime) return;
  globalThis.__haezoomReview?.dispose();
  document.dispatchEvent(new Event('haezoom-review-replace'));
  document.querySelectorAll('[data-haezoom-review]').forEach(element => element.remove());
  const lifecycle = new AbortController(); let closeCurrent = () => {};
  const create = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
  globalThis.__haezoomShowReview = ({ image, text: initialText = '' }) => {
    closeCurrent();
    const controller = new AbortController(); const previousFocus = document.activeElement;
    const hidden = [...document.querySelectorAll('[data-haezoom-helper],[data-haezoom-launcher]')].map(element => ({ element, visibility: element.style.visibility }));
    hidden.forEach(({ element }) => { element.style.visibility = 'hidden'; });
    const host = create('div'); host.setAttribute('data-haezoom-review', ''); host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const cleanup = () => { controller.abort(); host.remove(); hidden.forEach(({ element, visibility }) => { element.style.visibility = visibility; }); if (previousFocus?.isConnected) previousFocus.focus(); };
    closeCurrent = cleanup;
    const style = create('style');
    style.textContent = ':host{color-scheme:light}*{box-sizing:border-box}[hidden]{display:none!important}.backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#14171f88;font:14px/1.6 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#14171f;letter-spacing:-.025em}.review{display:flex;flex-direction:column;width:min(1000px,calc(100vw - 32px));height:min(640px,calc(100dvh - 32px));overflow:hidden;border-radius:24px;background:white;box-shadow:0 16px 80px #0005}.review header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #eceef1;flex-shrink:0}.brand{font-weight:750;font-size:18px}.review main{display:flex;flex-direction:column;flex:1;min-height:0;padding:20px 24px;gap:12px}h2{font-size:23px;line-height:1.4;margin:0}p{font-size:12px;color:#6b7280;margin:0}.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;flex:1;min-height:0}.columns.text-only{grid-template-columns:1fr}.pane{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0}label,.pane strong{font-weight:650;font-size:12px}.image-wrap{flex:1;min-height:0;background:#f3f4f6;border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:auto}.image-wrap img{display:block;width:100%;height:100%;min-height:0;object-fit:contain}textarea{width:100%;flex:1;min-height:0;resize:none;font:14px/1.7 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#14171f;background:#f6f7f9;border:1px solid #dfe2e8;border-radius:12px;padding:14px;user-select:text}button{font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:10px;background:#f3f4f6;color:#14171f;padding:10px 14px}button:disabled{opacity:.45;cursor:wait}button:focus-visible,textarea:focus-visible{outline:2px solid #2298ff;outline-offset:2px}.primary{background:#14171f;color:white}.close{width:34px;height:34px;padding:0;font-size:24px;border-radius:50%}.actions{display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0}[role=status]{min-height:20px;flex-shrink:0;white-space:pre-wrap}.note{font-size:11px;flex-shrink:0}@media(max-width:640px){.review{width:calc(100vw - 16px);height:calc(100dvh - 16px);border-radius:18px}.review main{padding:14px;gap:10px}.review header{padding:12px 16px}h2{font-size:19px}.columns{grid-template-columns:1fr;grid-template-rows:minmax(0,.8fr) minmax(0,1.2fr);gap:12px}.columns.text-only{grid-template-rows:1fr}.image-pane .image-wrap{min-height:50px}.note{font-size:10px}.actions button{padding:8px 10px;font-size:12px}}';
    const backdrop = create('div', '', 'backdrop'); const panel = create('section', '', 'review'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', image ? '캡쳐한 내용 확인' : '선택한 내용 확인');
    const header = create('header'); header.append(create('strong', 'h.  해줌 AI', 'brand'));
    const exit = create('button', '×', 'close'); exit.setAttribute('aria-label', '확인 창 닫기'); exit.onclick = cleanup; header.append(exit);
    const body = create('main'); const heading = create('h2', image ? '캡쳐한 내용을 확인해요.' : '선택한 내용을 확인해요.');
    const fitStyle = create('style'); fitStyle.textContent = '.review{position:relative}.image-wrap{overflow:hidden}.image-wrap img{object-fit:contain;object-position:center}.image-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}.image-heading button{padding:4px 8px;font-size:11px}.zoom-view{position:absolute;inset:10px;z-index:2;border-radius:18px;background:white;display:flex;flex-direction:column;overflow:hidden}.zoom-view header{padding:10px 14px}.zoom-view .image-wrap{margin:12px;min-height:0}.zoom-view h3{font-size:15px;margin:0}'; shadow.append(fitStyle);
    const zoom = create('section', '', 'zoom-view'); zoom.hidden = true; zoom.setAttribute('aria-label', '캡쳐 전체 이미지');
    const zoomHeader = create('header'); zoomHeader.append(create('h3', '캡쳐 전체 이미지'));
    const zoomBack = create('button', '돌아가기'); zoomHeader.append(zoomBack);
    const zoomImageWrap = create('div', '', 'image-wrap');
    const zoomImage = create('img'); zoomImage.alt = '선택한 캡쳐 영역 전체 보기'; if (image) zoomImage.src = image; zoomImageWrap.append(zoomImage); zoom.append(zoomHeader, zoomImageWrap);
    const columns = create('div', '', `columns${image ? '' : ' text-only'}`);
    const status = create('p', image ? '이미지를 확인한 뒤 글자 읽기를 눌러 주세요.' : '가져온 문장을 확인하고 필요한 부분을 수정해 주세요.'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const editor = create('div', '', 'pane'); const label = create('label', '읽어온 내용'); label.htmlFor = 'haezoom-review-text';
    const text = create('textarea'); text.id = label.htmlFor; text.maxLength = 45000; text.placeholder = image ? '글자 읽기를 누르거나 직접 입력해 주세요.' : '내용을 확인하고 수정해 주세요.'; text.value = initialText;
    const copy = create('button', '내용 복사'); copy.onclick = async () => { try { await navigator.clipboard.writeText(text.value); status.textContent = '내용을 복사했어요.'; } catch { text.focus(); text.select(); status.textContent = '내용을 선택했어요. ⌘C 또는 Ctrl+C로 복사해 주세요.'; } };
    const analysisOutput = create('section'); analysisOutput.hidden = true; analysisOutput.setAttribute('aria-live', 'polite'); analysisOutput.style.cssText = 'max-height:180px;overflow:auto;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;';
    const renderAnalysis = result => {
      analysisOutput.replaceChildren(create('strong', '분석 요약'), create('p', result.summary));
      const addGroup = (title, items, kind) => {
        const group = create('div'); group.style.marginTop = '12px'; group.append(create('strong', title));
        if (!items.length) group.append(create('p', '해당 항목이 없어요.'));
        for (const item of items) {
          const row = create('article'); row.style.cssText = 'padding:8px 0;border-top:1px solid #e5e7eb;';
          row.append(create('strong', item.title));
          const detail = kind === 'task'
            ? [item.deadline || '날짜 확인 필요', item.action, item.materials.length ? `준비물 · ${item.materials.join(', ')}` : '', item.cost != null ? `비용 · ${item.cost.toLocaleString()}원` : '', item.submission ? `제출처 · ${item.submission}` : '']
            : [item.date || '날짜 확인 필요', item.time, item.location, item.details];
          row.append(create('p', detail.filter(Boolean).join(' · ')));
          row.append(create('p', `근거 · ${item.evidence || '없음'}${item.needs_review ? ' · 원문 확인 필요' : ''}`));
          group.append(row);
        }
        analysisOutput.append(group);
      };
      addGroup('할 일', result.tasks, 'task'); addGroup('일정', result.schedules, 'schedule');
      analysisOutput.hidden = false;
    };
    const analyze = create('button', '할 일 정리하기', 'primary');
    analyze.onclick = async () => {
      const value = text.value.trim();
      if (!value) { status.textContent = '분석할 원문을 입력해 주세요.'; text.focus(); return; }
      if (value.length > 45000) { status.textContent = '원문은 45,000자 이내여야 해요.'; return; }
      if (!confirm('원문 텍스트를 해줌 Cloudflare Worker를 거쳐 Claude API로 전송해 분석합니다. 동의하고 진행할까요?')) return;
      analyze.disabled = true; status.textContent = '원문을 전송하고 분석하고 있어요.';
      try {
        const response = await chrome.runtime.sendMessage({ type: 'analyzeText', payload: { text: value } });
        if (!response?.ok) throw new Error(response?.error || '분석에 실패했어요.');
        renderAnalysis(response.data); status.textContent = '분석이 완료됐어요. 원문과 결과를 확인해 주세요.';
      } catch (error) {
        status.textContent = /context invalidated/i.test(error.message) ? '해줌이 업데이트되었어요. 창을 닫고 페이지를 새로고침해 주세요.' : `분석에 실패했어요. ${error.message}`;
      } finally { analyze.disabled = false; }
    };
    const editActions = create('div', '', 'actions'); editActions.append(copy, analyze); editor.append(label, text, editActions);
    if (image) {
      const imagePane = create('div', '', 'pane image-pane');
      const imageHeading = create('div', '', 'image-heading'); imageHeading.append(create('strong', '캡쳐한 부분'));
      const enlarge = create('button', '크게 보기 ↗'); enlarge.onclick = () => { zoom.hidden = false; zoomBack.focus(); }; zoomBack.onclick = () => { zoom.hidden = true; enlarge.focus(); }; imageHeading.append(enlarge); imagePane.append(imageHeading);
      const imageWrap = create('div', '', 'image-wrap'); const screenshot = create('img'); screenshot.src = image; screenshot.alt = '선택한 캡쳐 영역'; imageWrap.append(screenshot);
      const read = create('button', '캡쳐한 글자 읽기', 'primary');
      read.onclick = async () => {
        read.disabled = true; read.textContent = '글자를 읽고 있어요…'; status.textContent = '처음에는 언어 데이터를 준비하느라 잠시 걸릴 수 있어요.';
        try {
          const result = await chrome.runtime.sendMessage({ type: 'readCapture', payload: { image } });
          if (controller.signal.aborted) return;
          if (!result?.ok || typeof result.data !== 'string') throw new Error(result?.error || '글자를 읽지 못했어요.');
          text.value = result.data.slice(0, 45000);
          status.textContent = text.value.trim() ? '글자를 읽었어요. 원문과 비교해 틀린 부분을 수정해 주세요.' : '글자를 찾지 못했어요. 다른 영역을 선택하거나 직접 입력해 주세요.';
        } catch (error) {
          if (controller.signal.aborted) return;
          status.textContent = /context invalidated/i.test(error.message) ? '해줌이 업데이트되었어요. 창을 닫고 페이지를 새로고침해 주세요.' : `${error.message} 다시 시도하거나 직접 입력해 주세요.`;
        } finally { read.disabled = false; read.textContent = '캡쳐한 글자 읽기'; }
      };
      imagePane.append(imageWrap, read); columns.append(imagePane);
    }
    columns.append(editor); body.append(heading, columns, analysisOutput, status, create('p', image ? '캡쳐 이미지는 전송하지 않아요. 분석 동의 후 OCR 텍스트를 Claude에 전송합니다.' : '분석 동의 후 원문 텍스트를 해줌 Cloudflare Worker를 거쳐 Claude에 전송합니다.', 'note'));
    panel.append(header, body, zoom); backdrop.append(panel); shadow.prepend(style); shadow.append(backdrop); document.documentElement.append(host);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!zoom.hidden) zoomBack.click(); else cleanup(); }
      if (event.key === 'Tab') { const controls = [...(zoom.hidden ? panel : zoom).querySelectorAll('button,textarea')].filter(element => !element.disabled && !element.closest('[hidden]')); const index = controls.indexOf(shadow.activeElement); event.preventDefault(); controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length].focus(); }
    }, { capture: true, signal: controller.signal }); exit.focus();
  };
  const listener = (message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message.type !== 'showSelectionReview') return false;
    const text = message.payload?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 45000) { reply({ ok: false, error: '선택한 내용을 확인해 주세요.' }); return false; }
    globalThis.__haezoomShowReview({ text }); reply({ ok: true }); return false;
  };
  const dispose = () => { closeCurrent(); lifecycle.abort(); try { chrome.runtime.onMessage.removeListener(listener); } catch {} delete globalThis.__haezoomShowReview; delete globalThis.__haezoomReview; };
  document.addEventListener('haezoom-review-replace', dispose, { signal: lifecycle.signal });
  chrome.runtime.onMessage.addListener(listener); globalThis.__haezoomReview = { version, runtime: chrome.runtime, dispose };
})();
