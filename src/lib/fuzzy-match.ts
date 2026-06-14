export type FuzzyMatchField = "label" | "symbol" | "kind" | "keyword";

export type FuzzyMatchTieBreaker = "original" | "label";

export interface FuzzyMatchItem {
  label: string;
  keywords?: readonly string[];
  symbol?: string;
  kind?: string;
}

export interface FuzzyMatchOptions {
  limit?: number;
  tieBreaker?: FuzzyMatchTieBreaker;
}

export interface FuzzyItemMatch<T extends FuzzyMatchItem> {
  item: T;
  matchedField: FuzzyMatchField;
  matchedText: string;
  score: number;
}

export interface FuzzyMatchResult<T extends FuzzyMatchItem> extends FuzzyItemMatch<T> {
  originalIndex: number;
}

interface FuzzyMatchFieldScore {
  field: FuzzyMatchField;
  score: number;
  text: string;
}

const EXACT_MATCH_SCORE = 10_000;
const PREFIX_MATCH_SCORE = 8_000;
const WORD_PREFIX_SCORE = 6_000;
const SUBSEQUENCE_SCORE = 1_000;

const FIELD_SCORE_ADJUSTMENTS: Record<FuzzyMatchField, number> = {
  symbol: 125,
  label: 0,
  keyword: -75,
  kind: -125,
};

export function scoreFuzzyMatch(query: string, text: string): number | null {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedText = normalizeSearchText(text);

  if (normalizedQuery.length === 0) {
    return 0;
  }

  if (normalizedText.length === 0) {
    return null;
  }

  if (normalizedText === normalizedQuery) {
    return EXACT_MATCH_SCORE + normalizedQuery.length * 20;
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return PREFIX_MATCH_SCORE
      + normalizedQuery.length * 18
      - (normalizedText.length - normalizedQuery.length);
  }

  const wordPrefixIndex = findWordPrefixIndex(normalizedText, normalizedQuery);
  if (wordPrefixIndex !== null) {
    return WORD_PREFIX_SCORE
      + normalizedQuery.length * 16
      - wordPrefixIndex * 3
      - (normalizedText.length - normalizedQuery.length);
  }

  const positions = findSubsequencePositions(normalizedQuery, normalizedText);
  if (positions === null) {
    return null;
  }

  const firstPosition = positions[0] ?? 0;
  const lastPosition = positions[positions.length - 1] ?? firstPosition;
  const span = lastPosition - firstPosition + 1;
  const gapPenalty = Math.max(0, span - normalizedQuery.length) * 8;
  const lengthPenalty = Math.max(0, normalizedText.length - normalizedQuery.length);
  const earlyBonus = Math.max(0, 50 - firstPosition * 2);
  const consecutiveBonus = countConsecutivePairs(positions) * 30;
  const wordStartBonus = positions.filter((position) => isWordStart(normalizedText, position)).length * 25;

  return SUBSEQUENCE_SCORE
    + normalizedQuery.length * 14
    + earlyBonus
    + consecutiveBonus
    + wordStartBonus
    - gapPenalty
    - lengthPenalty;
}

export function scoreFuzzyItem<T extends FuzzyMatchItem>(
  query: string,
  item: T,
): FuzzyItemMatch<T> | null {
  if (normalizeSearchText(query).length === 0) {
    return {
      item,
      matchedField: "label",
      matchedText: item.label,
      score: 0,
    };
  }

  const fieldScores = getFieldScores(query, item);
  if (fieldScores.length === 0) {
    return null;
  }

  const best = fieldScores.reduce((bestScore, candidate) => (
    candidate.score > bestScore.score ? candidate : bestScore
  ));

  return {
    item,
    matchedField: best.field,
    matchedText: best.text,
    score: best.score,
  };
}

export function filterFuzzyMatches<T extends FuzzyMatchItem>(
  items: readonly T[],
  query: string,
  options: FuzzyMatchOptions = {},
): FuzzyMatchResult<T>[] {
  const results = items.flatMap((item, originalIndex) => {
    const match = scoreFuzzyItem(query, item);
    if (match === null) {
      return [];
    }

    return [{ ...match, originalIndex }];
  });

  results.sort((first, second) => compareMatches(first, second, options.tieBreaker ?? "original"));

  if (options.limit === undefined) {
    return results;
  }

  return results.slice(0, Math.max(0, Math.floor(options.limit)));
}

function getFieldScores<T extends FuzzyMatchItem>(query: string, item: T): FuzzyMatchFieldScore[] {
  const fields: Array<{ field: FuzzyMatchField; text: string }> = [
    { field: "label", text: item.label },
  ];

  if (item.symbol !== undefined) {
    fields.push({ field: "symbol", text: item.symbol });
  }

  if (item.kind !== undefined) {
    fields.push({ field: "kind", text: item.kind });
  }

  for (const keyword of item.keywords ?? []) {
    fields.push({ field: "keyword", text: keyword });
  }

  return fields.flatMap(({ field, text }) => {
    const score = scoreFuzzyMatch(query, text);
    if (score === null) {
      return [];
    }

    return [{
      field,
      score: score + FIELD_SCORE_ADJUSTMENTS[field],
      text,
    }];
  });
}

function compareMatches<T extends FuzzyMatchItem>(
  first: FuzzyMatchResult<T>,
  second: FuzzyMatchResult<T>,
  tieBreaker: FuzzyMatchTieBreaker,
): number {
  if (second.score !== first.score) {
    return second.score - first.score;
  }

  if (tieBreaker === "label") {
    const labelComparison = compareLabels(first.item.label, second.item.label);
    if (labelComparison !== 0) {
      return labelComparison;
    }
  }

  return first.originalIndex - second.originalIndex;
}

function compareLabels(first: string, second: string): number {
  const normalizedFirst = normalizeSearchText(first);
  const normalizedSecond = normalizeSearchText(second);

  if (normalizedFirst < normalizedSecond) {
    return -1;
  }

  if (normalizedFirst > normalizedSecond) {
    return 1;
  }

  return 0;
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function findWordPrefixIndex(text: string, query: string): number | null {
  for (let index = 0; index <= text.length - query.length; index += 1) {
    if (isWordStart(text, index) && text.startsWith(query, index)) {
      return index;
    }
  }

  return null;
}

function findSubsequencePositions(query: string, text: string): number[] | null {
  const positions: number[] = [];
  let searchIndex = 0;

  for (const queryCharacter of query) {
    const position = text.indexOf(queryCharacter, searchIndex);
    if (position === -1) {
      return null;
    }

    positions.push(position);
    searchIndex = position + 1;
  }

  return positions;
}

function countConsecutivePairs(positions: readonly number[]): number {
  let consecutivePairs = 0;

  for (let index = 1; index < positions.length; index += 1) {
    if (positions[index] === positions[index - 1] + 1) {
      consecutivePairs += 1;
    }
  }

  return consecutivePairs;
}

function isWordStart(text: string, index: number): boolean {
  return index === 0 || !isAsciiAlphaNumeric(text[index - 1]);
}

function isAsciiAlphaNumeric(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }

  const charCode = character.charCodeAt(0);

  return (charCode >= 48 && charCode <= 57)
    || (charCode >= 97 && charCode <= 122);
}
