export function mergeItems(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming) || incoming.length > 100) {
    throw new Error('저장할 항목 목록이 올바르지 않습니다.');
  }
  const items = structuredClone(existing);
  let added = 0;
  for (const item of incoming) {
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500 || JSON.stringify(item).length > 20000) {
      throw new Error('저장할 항목 내용이 올바르지 않습니다.');
    }
    const duplicate = items.some(old => old.id === item.id || (old.title === item.title && old.date === item.date && old.source?.title === item.source?.title));
    if (!duplicate) { items.push(structuredClone(item)); added++; }
  }
  if (items.length > 1000) throw new Error('저장 가능한 항목 수를 초과했습니다.');
  return { items, added };
}
