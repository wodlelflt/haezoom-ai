import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeDocument, analyzeImageDataUrl, analyzeText } from '../extension/api.mjs';

const emptyResult = { summary: '요약', tasks: [], schedules: [] };

test('posts text to the configured Haezoom Worker and validates its response', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return Response.json({ result: emptyResult });
  };
  try {
    assert.deepEqual(await analyzeText('공지 원문', '표 구조'), emptyResult);
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

test('uploads the original PDF and optional context as multipart form data', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return Response.json({ result: emptyResult });
  };
  try {
    const file = new File(['%PDF-fake'], 'notice.pdf', { type: 'application/pdf' });
    assert.deepEqual(await analyzeDocument(file, '급식비와 준비물을 확인해 주세요.'), emptyResult);
    assert.equal(requestUrl, 'https://haezoom.sleepwhale.workers.dev/api/analyze');
    assert.equal(requestOptions.method, 'POST');
    assert.equal(requestOptions.body.get('file').name, 'notice.pdf');
    assert.equal(await requestOptions.body.get('file').text(), '%PDF-fake');
    assert.equal(requestOptions.body.get('context'), '급식비와 준비물을 확인해 주세요.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uploads captured image bytes without an OCR text payload', async () => {
  const originalFetch = globalThis.fetch;
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return Response.json({ result: emptyResult });
  };
  try {
    await analyzeImageDataUrl('data:image/png;base64,aGVsbG8=');
    assert.equal(requestOptions.body.get('file').type, 'image/png');
    assert.equal(await requestOptions.body.get('file').text(), 'hello');
    assert.equal(requestOptions.body.has('text'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});