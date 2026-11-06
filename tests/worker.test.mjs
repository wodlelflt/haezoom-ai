import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../cloudflare-worker.js';

const analysis = {
  summary: '가정통신문 요약',
  tasks: [{ title: '신청서 제출', action: '신청서를 제출하세요', deadline: '11월 8일', materials: ['신청서'], cost: null, submission: '담임 선생님', evidence: '11월 8일까지 제출', needs_review: true }],
  schedules: [{ title: '학부모 상담', date: '11월 18일', time: null, location: null, details: '상담 일정', evidence: '11월 18일 상담', needs_review: true }],
};

test('status reports configured model without exposing the secret', async () => {
  const response = await worker.fetch(new Request('https://haezoom.sleepwhale.workers.dev/api/status'), {
    ANTHROPIC_API_KEY: 'test-secret',
    CLAUDE_MODEL: 'test-model',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { configured: true, model: 'test-model', provider: 'claude' });
});

test('forwards non-API requests to static assets', async () => {
  let forwarded = false;
  const response = await worker.fetch(new Request('https://haezoom.sleepwhale.workers.dev/'), {
    ASSETS: { fetch: async () => { forwarded = true; return new Response('site asset'); } },
  });
  assert.equal(forwarded, true);
  assert.equal(await response.text(), 'site asset');
});

test('rate limits analysis per client IP before calling Anthropic', async () => {
  let rateLimitKey;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Anthropic must not be called'); };
  try {
    const response = await worker.fetch(new Request('https://haezoom.sleepwhale.workers.dev/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
      body: JSON.stringify({ text: '공지 원문' }),
    }), {
      ANTHROPIC_API_KEY: 'test-secret',
      RATE_LIMITER: { limit: async ({ key }) => { rateLimitKey = key; return { success: false }; } },
    });
    assert.equal(response.status, 429);
    assert.equal(rateLimitKey, '203.0.113.10');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns yearless dates unchanged for user review', async () => {
  const originalFetch = globalThis.fetch;
  let anthropicRequest;
  globalThis.fetch = async (url, options) => {
    anthropicRequest = { url, options, body: JSON.parse(options.body) };
    return Response.json({ content: [{ type: 'text', text: JSON.stringify(analysis) }] });
  };
  try {
    const response = await worker.fetch(new Request('https://haezoom.sleepwhale.workers.dev/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.11' },
      body: JSON.stringify({ text: '11월 8일 신청서 제출', layoutText: '' }),
    }), {
      ANTHROPIC_API_KEY: 'test-secret',
      CLAUDE_MODEL: 'test-model',
      RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    assert.equal(response.status, 200);
    assert.equal(anthropicRequest.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(anthropicRequest.body.model, 'test-model');
    assert.equal(anthropicRequest.options.headers['x-api-key'], 'test-secret');
    assert.deepEqual(await response.json(), { result: analysis });
  } finally {
    globalThis.fetch = originalFetch;
  }
});