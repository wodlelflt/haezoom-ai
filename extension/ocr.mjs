export async function extractText(file, progress = () => {}) {
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PDF, PNG, JPG, WEBP 파일을 선택해 주세요.');
  if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하 파일을 선택해 주세요.');
  let worker;
  const recognize = async image => {
    if (!worker) {
      worker = await globalThis.Tesseract.createWorker('kor+eng', 1, {
        workerPath: new URL('./vendor/tesseract/worker.min.js', import.meta.url).href,
        corePath: new URL('./vendor/tesseract/tesseract-core-simd-lstm.wasm.js', import.meta.url).href,
        langPath: 'https://tessdata.projectnaptha.com/4.0.0', workerBlobURL: false,
        logger: message => { if (message.status === 'recognizing text') progress(`글자를 읽고 있어요 · ${Math.round(message.progress * 100)}%`); }
      });
    }
    return (await worker.recognize(image)).data.text;
  };
  try {
    if (file.type !== 'application/pdf') return await recognize(file);
    const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    try {
      const document = await loadingTask.promise;
      if (document.numPages > 30) throw new Error('PDF는 30페이지 이하로 나누어 주세요.');
      const pages = [];
      for (let index = 1; index <= document.numPages; index++) {
        progress(`${index} / ${document.numPages}페이지를 읽고 있어요`);
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        const lines = []; let lastY;
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          if (lastY !== undefined && Math.abs(lastY - item.transform[5]) > 5) lines.push('\n');
          lines.push(item.str, item.hasEOL ? '\n' : ' '); lastY = item.transform[5];
        }
        let text = lines.join('').trim();
        if (text.length < 35) {
          const viewport = page.getViewport({ scale: 1.5 });
          if (viewport.width * viewport.height > 16000000) throw new Error('페이지 해상도가 너무 큽니다. 크기를 줄여 주세요.');
          const canvas = globalThis.document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          text = await recognize(canvas); canvas.width = canvas.height = 0;
        }
        pages.push(`--- ${index}페이지 ---\n${text}`); page.cleanup();
      }
      return pages.join('\n\n');
    } finally { await loadingTask.destroy(); }
  } finally { if (worker) await worker.terminate(); }
}
