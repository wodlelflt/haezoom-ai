import { HAEZOOM_API_BASE_URL } from './api-config.js';
import { validateAnalysis } from './core.mjs';

export async function analyzeText(text, layoutText = '') {
  if (typeof text !== 'string' || !text.trim() || text.length > 45000) throw new Error('분석할 내용을 45,000자 이내로 입력해 주세요.');
  if (typeof layoutText !== 'string' || layoutText.length > 45000) throw new Error('문서 구조 정보가 너무 큽니다.');

  const response = await fetch(`${HAEZOOM_API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, layoutText }),
    signal: AbortSignal.timeout(95000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `AI 분석에 실패했어요 (${response.status}).`);
  return validateAnalysis(payload.result);
}