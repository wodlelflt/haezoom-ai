import { validDate } from './core.mjs';

const calendarApi = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export class GoogleCalendarError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.status = status;
  }
}

export function googleEventId(itemId) {
  if (typeof itemId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(itemId)) {
    throw new Error('일정 ID 형식이 올바르지 않습니다.');
  }
  return `a${itemId.replaceAll('-', '').toLowerCase()}`;
}

export function eligibleForCalendar(item) {
  if (!item || item.completed || !validDate(item.date) || !item.title?.trim()) return false;
  return item.kind === 'schedule' || (item.confirmed && !item.needs_review);
}

function scheduledTime(value) {
  if (typeof value !== 'string') return null;
  const clock = value.match(/^(오전|오후)\s*(\d{1,2})(?:시)?(?:\s*(\d{1,2})분?)?$/);
  if (clock) {
    let hour = Number(clock[2]);
    const minute = Number(clock[3] || 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (clock[1] === '오전') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const twentyFourHour = value.match(/^(?:[01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    const [hour, minute] = value.split(':').map(Number);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return null;
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function makeGoogleEvent(item) {
  if (!eligibleForCalendar(item)) {
    throw new Error('유효한 날짜가 있는 일정 또는 확인 완료한 미완료 항목만 캘린더에 등록할 수 있습니다.');
  }
  const details = [
    item.action || item.details,
    item.materials?.length ? `준비물: ${item.materials.join(', ')}` : '',
    item.cost != null ? `비용: ${item.cost.toLocaleString()}원` : '',
    item.submission ? `제출처: ${item.submission}` : '',
    item.location ? `장소: ${item.location}` : '',
    item.evidence ? `원문 근거: ${item.evidence}` : '',
    item.source?.title ? `출처: ${item.source.title}` : '',
    item.source?.url ? `출처 링크: ${item.source.url}` : ''
  ].filter(Boolean).join('\n');
  const event = { summary: item.title.trim(), description: details.slice(0, 8000) };
  const time = item.kind === 'schedule' ? scheduledTime(item.time) : null;
  if (!time) {
    event.start = { date: item.date };
    event.end = { date: nextDate(item.date) };
  } else {
    const start = Date.parse(`${item.date}T${time}:00+09:00`);
    event.start = { dateTime: new Date(start).toISOString() };
    event.end = { dateTime: new Date(start + 60 * 60 * 1000).toISOString() };
  }
  return event;
}

async function checkResponse(response) {
  if (response.ok) return;
  let detail = '';
  try {
    const body = await response.json();
    detail = typeof body.error?.message === 'string' ? body.error.message : '';
  } catch {}
  throw new GoogleCalendarError(detail || `Google Calendar API 오류 (${response.status})`, response.status);
}

export async function syncGoogleEvent(token, item, fetcher = fetch, timeoutMs = 15000) {
  const id = googleEventId(item.id);
  const event = makeGoogleEvent(item);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const url = `${calendarApi}/${encodeURIComponent(id)}`;
  const request = async (target, options) => {
    const controller = new AbortController();
    let timeout;
    try {
      return await Promise.race([
        fetcher(target, { ...options, signal: controller.signal }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            reject(new GoogleCalendarError('Google Calendar 응답 시간이 초과됐어요. 네트워크 연결을 확인하고 다시 시도해 주세요.', 0));
            controller.abort();
          }, timeoutMs);
        })
      ]);
    } finally { clearTimeout(timeout); }
  };
  const existing = await request(url, { headers });
  if (existing.ok) {
    const response = await request(url, { method: 'PATCH', headers, body: JSON.stringify(event) });
    await checkResponse(response);
    return { id, action: 'updated' };
  }
  if (existing.status !== 404) await checkResponse(existing);
  const response = await request(calendarApi, { method: 'POST', headers, body: JSON.stringify({ ...event, id }) });
  if (response.status === 409) {
    const update = await request(url, { method: 'PATCH', headers, body: JSON.stringify(event) });
    await checkResponse(update);
    return { id, action: 'updated' };
  }
  await checkResponse(response);
  return { id, action: 'created' };
}
