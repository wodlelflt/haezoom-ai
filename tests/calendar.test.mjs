import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleCalendarError, googleEventId, makeGoogleEvent, syncGoogleEvent } from '../extension/calendar.mjs';

const item = {
  id: '00112233-4455-4677-8899-aabbccddeeff',
  kind: 'schedule',
  title: '학부모 설명회',
  date: '2026-11-18',
  time: '오후 2시 30분',
  location: '강당',
  details: '참석해 주세요.',
  evidence: '11월 18일 오후 2시 30분',
  source: { title: '학교 안내문' },
  confirmed: true,
  needs_review: false,
  completed: false
};

test('항목 ID로 충돌하지 않는 안정적 Calendar 이벤트 ID를 만든다', () => {
  assert.equal(googleEventId(item.id), 'a00112233445546778899aabbccddeeff');
  assert.equal(googleEventId(item.id), googleEventId(item.id));
  assert.throws(() => googleEventId('not-an-id'));
});

test('한국 시간으로 확인된 행사 시간과 상세 정보를 Calendar 이벤트로 변환한다', () => {
  const event = makeGoogleEvent(item);
  assert.equal(event.summary, item.title);
  assert.equal(event.start.dateTime, '2026-11-18T05:30:00.000Z');
  assert.equal(event.end.dateTime, '2026-11-18T06:30:00.000Z');
  assert.match(event.description, /장소: 강당/);
  assert.match(event.description, /원문 근거:/);
});

test('할 일 또는 시간을 해석할 수 없는 일정은 종일 일정으로 만든다', () => {
  const task = makeGoogleEvent({ ...item, kind: 'task', date: '2026-12-31' });
  assert.deepEqual(task.start, { date: '2026-12-31' });
  assert.deepEqual(task.end, { date: '2027-01-01' });
  const unknownTime = makeGoogleEvent({ ...item, time: '저녁 무렵' });
  assert.deepEqual(unknownTime.start, { date: item.date });
});

test('미확인, 검토 필요, 완료, 잘못된 날짜는 Calendar에 보낼 수 없다', () => {
  for (const change of [
    { confirmed: false },
    { needs_review: true },
    { completed: true },
    { date: '11월 18일' }
  ]) assert.throws(() => makeGoogleEvent({ ...item, ...change }));
});

test('기존 이벤트는 PATCH로 갱신하고 없는 이벤트는 고정 ID로 생성한다', async () => {
  const calls = [];
  const update = await syncGoogleEvent('token', item, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  });
  assert.equal(update.action, 'updated');
  assert.equal(calls[1].options.method, 'PATCH');

  calls.length = 0;
  const create = await syncGoogleEvent('token', item, async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? { ok: false, status: 404 } : { ok: true, status: 200 };
  });
  assert.equal(create.action, 'created');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(JSON.parse(calls[1].options.body).id, googleEventId(item.id));
});

test('동시 등록 충돌은 PATCH로 이어서 중복 생성을 피한다', async () => {
  let call = 0;
  const result = await syncGoogleEvent('token', item, async () => {
    call++;
    if (call === 1) return { ok: false, status: 404 };
    if (call === 2) return { ok: false, status: 409 };
    return { ok: true, status: 200 };
  });
  assert.equal(result.action, 'updated');
  assert.equal(call, 3);
});

test('응답하지 않는 Calendar API는 제한 시간 안에 취소하고 오류로 돌려준다', async () => {
  let aborted = false;
  await assert.rejects(
    syncGoogleEvent('token', item, (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
    }), 10),
    error => error instanceof GoogleCalendarError && error.status === 0 && /시간이 초과/.test(error.message)
  );
  assert.equal(aborted, true);
});
