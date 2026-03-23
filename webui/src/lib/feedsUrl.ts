export type FeedsFilters = {
  channel?: string;
  ref?: string;
  author?: string;
  search?: string;
  tags?: string;
  days?: number;
};

export const DAYS_OPTIONS = [
  { value: 1, label: '今天' },
  ...Array.from({ length: 6 }, (_, i) => ({ value: i + 2, label: `最近 ${i + 2} 天` })),
  { value: 0, label: '全部时间' },
];

export function parseFeedsFilters(params: URLSearchParams): FeedsFilters {
  const daysVal = params.get('days');
  return {
    channel: params.get('channel') || undefined,
    ref: params.get('ref') || undefined,
    author: params.get('author') || undefined,
    search: params.get('search') || params.get('q') || undefined,
    tags: params.get('tags') || undefined,
    days:
      daysVal === null || daysVal === ''
        ? 3
        : Number(daysVal) === 0
          ? 0
          : Math.max(1, Math.min(365, Number(daysVal) || 1)),
  };
}

export function buildFeedsHref(
  filters: FeedsFilters,
  ch: string,
  withDays?: number,
  overrides?: { ref?: string; author?: string; tags?: string }
): string {
  const p = new URLSearchParams();
  p.set('channel', ch);
  const refVal = overrides?.ref ?? filters.ref;
  const author = overrides?.author ?? filters.author;
  const tagsVal = overrides?.tags ?? filters.tags;
  if (refVal) p.set('ref', refVal);
  if (author) p.set('author', author);
  if (filters.search) p.set('search', filters.search);
  if (tagsVal) p.set('tags', tagsVal);
  const daysVal = withDays ?? filters.days;
  if (daysVal !== undefined && daysVal !== null) p.set('days', String(daysVal));
  return '/feeds?' + p.toString();
}

export function clearFilterHref(
  filters: FeedsFilters,
  omit: 'ref' | 'author' | 'search' | 'tags'
): string {
  const p = new URLSearchParams();
  p.set('channel', filters.channel || 'all');
  if (omit !== 'ref' && filters.ref) p.set('ref', filters.ref);
  if (omit !== 'author' && filters.author) p.set('author', filters.author);
  if (omit !== 'search' && filters.search) p.set('search', filters.search);
  if (omit !== 'tags' && filters.tags) p.set('tags', filters.tags);
  if (filters.days !== undefined && filters.days !== null) p.set('days', String(filters.days));
  return '/feeds?' + p.toString();
}

export function feedsDaysLabel(filters: FeedsFilters): string {
  const d = filters.days;
  if (d === undefined || d === 0) return '全部时间';
  if (d === 1) return '今天';
  return `最近 ${d} 天`;
}
