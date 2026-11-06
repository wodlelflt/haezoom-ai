import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeItems } from '../extension/item-store.mjs';

const first = { id: 'one', title: '신청서 제출', date: '2026-11-12', source: { title: '학교 안내' } };
const second = { id: 'two', title: '준비물 확인', date: null, source: { title: '학교 안내' } };

test('선택된 incoming 항목만 추가하고 기존 항목은 보존한다', () => {
  const result = mergeItems([first], [second]);
  assert.deepEqual(result.items, [first, second]);
  assert.equal(result.added, 1);
});

test('중복 저장 요청은 항목 ID 또는 같은 제목·날짜·출처로 중복 생성하지 않는다', () => {
  const result = mergeItems([first], [{ ...first, id: 'duplicate-id' }, second]);
  assert.deepEqual(result.items, [first, second]);
  assert.equal(result.added, 1);
});

test('잘못된 목록, 항목, 크기 제한은 저장 전에 명시적으로 거부한다', () => {
  assert.throws(() => mergeItems({}, [first]));
  assert.throws(() => mergeItems([], [{ id: 'invalid', title: '  ' }]));
  assert.throws(() => mergeItems([], Array.from({ length: 101 }, (_, index) => ({ id: `${index}`, title: '항목' }))));
  assert.throws(() => mergeItems(Array.from({ length: 1000 }, (_, index) => ({ id: `old-${index}`, title: `기존 ${index}` })), [first]));
});
