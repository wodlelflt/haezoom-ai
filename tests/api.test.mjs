import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeText } from '../extension/api.mjs';

test('posts text to the configured Haezoom Worker and validates its response', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return Response.json({ result: { summary: '요약', tasks: [], schedules: [] } });
  };
  try {
    assert.deepEqual(await analyzeText('공지 원문', '표 구조'), { summary: '요약', tasks: [], schedules: [] });
    assert.equal(requestUrl, 'https://haezoom.sleepwhale.workers.dev/api/analyze');
    assert.deepEqual(requestBody, { text: '공지 원문', layoutText: '표 구조' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects empty or oversized analysis input before sending it', async () => {
  await assert.rejects(analyzeText('  '), /45,000자/);
  await assert.rejects(analyzeText('가'.repeat(45001)), /45,000자/);
});