export const normaliseSearchText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const characterOverlap = (text, query) => {
  const available = new Map();
  for (const character of text.replace(/\s/g, '')) {
    available.set(character, (available.get(character) || 0) + 1);
  }
  let matched = 0;
  for (const character of query.replace(/\s/g, '')) {
    const count = available.get(character) || 0;
    if (!count) continue;
    matched += 1;
    available.set(character, count - 1);
  }
  return query.replace(/\s/g, '').length ? matched / query.replace(/\s/g, '').length : 0;
};

const unorderedTokenScore = (text, query) => {
  const textTokens = text.split(' ').filter(Boolean);
  const queryTokens = query.split(' ').filter(Boolean);
  if (!textTokens.length || !queryTokens.length) return null;
  const overlaps = queryTokens.map(queryToken => {
    const candidates = textTokens.filter(textToken => {
      const ratio = textToken.length / Math.max(queryToken.length, 1);
      return ratio >= 0.6 && ratio <= 1.65;
    });
    return candidates.reduce((best, textToken) => Math.max(best, characterOverlap(textToken, queryToken)), 0);
  });
  if (!overlaps.every(overlap => overlap >= 0.78)) return null;
  return overlaps.reduce((total, overlap) => total + overlap, 0) / overlaps.length;
};

const orderedCharacterScore = (text, query) => {
  const exactIndex = text.indexOf(query);
  if (exactIndex >= 0) {
    return 1000 + (exactIndex === 0 ? 240 : 0) + (query.length / Math.max(text.length, 1)) * 120 - exactIndex;
  }

  let cursor = 0;
  let first = -1;
  let previous = -2;
  let consecutive = 0;
  let wordStarts = 0;
  for (const character of query) {
    if (character === ' ') continue;
    const index = text.indexOf(character, cursor);
    if (index < 0) return null;
    if (first < 0) first = index;
    if (index === previous + 1) consecutive += 1;
    if (index === 0 || text[index - 1] === ' ') wordStarts += 1;
    previous = index;
    cursor = index + 1;
  }
  const compactQueryLength = query.replace(/\s/g, '').length;
  const spread = previous - first + 1;
  return 520 + consecutive * 14 + wordStarts * 18
    + (compactQueryLength / Math.max(spread, 1)) * 120
    - Math.max(first, 0) * 0.5;
};

export const fuzzyScore = (value, rawQuery) => {
  const text = normaliseSearchText(value);
  const query = normaliseSearchText(rawQuery);
  if (!query) return 0;
  if (!text) return Number.NEGATIVE_INFINITY;

  const ordered = orderedCharacterScore(text, query);
  if (ordered != null) return ordered;

  const queryTokens = query.split(' ').filter(Boolean);
  const tokenScores = queryTokens.map(token => orderedCharacterScore(text, token));
  if (tokenScores.every(score => score != null)) {
    return tokenScores.reduce((total, score) => total + score, 0) / tokenScores.length;
  }

  const overlap = unorderedTokenScore(text, query);
  return overlap != null ? 220 + overlap * 180 : Number.NEGATIVE_INFINITY;
};

export const fuzzyMatches = (value, query) => Number.isFinite(fuzzyScore(value, query));

export const rankByFuzzyMatch = (items, query, textForItem = item => item) => {
  if (!normaliseSearchText(query)) return [...items];
  return items
    .map((item, index) => {
      const searchValue = textForItem(item);
      const score = Array.isArray(searchValue)
        ? Math.max(...searchValue.map(value => fuzzyScore(value, query)))
        : fuzzyScore(searchValue, query);
      return { item, index, score };
    })
    .filter(result => Number.isFinite(result.score))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(result => result.item);
};
