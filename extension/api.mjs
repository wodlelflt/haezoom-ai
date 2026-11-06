import { HAEZOOM_API_BASE_URL } from './api-config.js';
import { validateAnalysis } from './core.mjs';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_CAPTURE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

export async function analyzeText(text, layoutText = '') {
  if (typeof text !== 'string' || !text.trim() || text.length > 45000) throw new Error('분석할 내용을 45,000자 이내로 입력해 주세요.');
  if (typeof layoutText !== 'string' || layoutText.length > 45000) throw new Error('문서 구조 정보가 너무 큽니다.');

  const response = await fetch(`${HAEZOOM_API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, layoutText }),
    signal: AbortSignal.timeout(95000),
  });
  return readAnalysisResponse(response);
}

export async function analyzeDocument(file, contextText = '') {
  if (!(file instanceof File) || !ALLOWED_TYPES.has(file.type)) throw new Error('PDF, PNG, JPG, WEBP 파일을 선택해 주세요.');
  if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('20MB 이하의 PDF 또는 이미지를 선택해 주세요.');
  if (file.type.startsWith('image/') && file.size > 5 * 1024 * 1024) throw new Error('이미지는 5MB 이하로 선택해 주세요.');
  if (typeof contextText !== 'string' || contextText.length > 45000) throw new Error('추가 메모는 45,000자 이내로 입력해 주세요.');

  const form = new FormData();
  form.append('file', file, file.name || 'document');
  form.append('context', contextText);
  const response = await fetch(`${HAEZOOM_API_BASE_URL}/api/analyze`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(95000),
  });
  return readAnalysisResponse(response);
}

export async function analyzeImageDataUrl(dataUrl, contextText = '') {
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('캡쳐 이미지 형식이 올바르지 않습니다.');
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_CAPTURE_SIZE) throw new Error('캡쳐 이미지는 8MB 이하로 선택해 주세요.');
  const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].slice('image/'.length);
  return analyzeDocument(new File([bytes], `capture.${extension}`, { type: match[1] }), contextText);
}

async function readAnalysisResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `AI 분석에 실패했어요 (${response.status}).`);
  return validateAnalysis(payload.result);
}