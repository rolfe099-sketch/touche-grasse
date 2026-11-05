import { DayReview, daySignature } from './dailyWorkflows';
import { D, dayKey, LogEntry, Nutrition, scaleRatio, total } from './model';

export type DayRecord = { key: string; date: Date; entries: LogEntry[]; nutrition: Nutrition; meals: number; complete: boolean };
export type HistoryIndex = { byDay: Map<string, DayRecord>; days: DayRecord[]; entries: number; meals: number; recipeServings: string; earliest?: Date };
export type Scope = 'day' | 'week' | 'month' | 'all';

export function localDate(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error('Use a date in YYYY-MM-DD format.');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (dayKey(date) !== key || date.getFullYear() < 1900 || date.getFullYear() > 2200) throw new Error('Choose a valid date between 1900 and 2200.');
  return date;
}
export function addDays(date: Date, count: number) { const next = new Date(date); next.setHours(12, 0, 0, 0); next.setDate(next.getDate() + count); return next; }
export function startOfWeek(date: Date) { return addDays(date, -((date.getDay() + 6) % 7)); }
export function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1, 12); }
export function shiftMonth(date: Date, count: number) { return new Date(date.getFullYear(), date.getMonth() + count, 1, 12); }
export function daysInPeriod(date: Date, scope: 'day' | 'week' | 'month'): Date[] {
  const start = scope === 'day' ? addDays(date, 0) : scope === 'week' ? startOfWeek(date) : startOfMonth(date);
  const count = scope === 'day' ? 1 : scope === 'week' ? 7 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
export function historyIndex(logs: LogEntry[], reviews: DayReview[] = []): HistoryIndex {
  const grouped = new Map<string, LogEntry[]>();
  let servings = new D(0);
  for (const entry of logs) {
    const key = dayKey(new Date(entry.recordedAt));
    const group = grouped.get(key) ?? []; group.push(entry); grouped.set(key, group);
    if (entry.snapshot.kind === 'recipe' && entry.snapshot.unit === 'servings') servings = servings.plus(entry.snapshot.quantity);
  }
  const reviewByDate = new Map(reviews.map(review => [review.id, review]));
  for (const review of reviews) if (review.complete && review.signature === '[]' && !grouped.has(review.id)) grouped.set(review.id, []);
  const days = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([key, entries]) => ({ key, date: localDate(key), entries: entries.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)), nutrition: total(entries.map(e => e.nutrition)), meals: new Set(entries.map(e => e.meal)).size, complete: !!reviewByDate.get(key)?.complete && reviewByDate.get(key)?.signature === daySignature(entries, key) }));
  return { byDay: new Map(days.map(day => [day.key, day])), days, entries: logs.length, meals: days.reduce((n, day) => n + day.meals, 0), recipeServings: servings.toFixed(), earliest: days.find(day => day.entries.length)?.date };
}
export function periodSummary(index: HistoryIndex, dates: Date[]) {
  const days = dates.flatMap(date => { const day = index.byDay.get(dayKey(date)); return day ? [day] : []; });
  const complete = days.filter(day => day.complete), recorded = days.filter(day => day.entries.length);
  return { days, completeDays: complete.length, partialDays: recorded.filter(day => !day.complete).length, completeAverage: complete.length ? scaleRatio(total(complete.map(day => day.nutrition)), '1', String(complete.length)) : null, loggedDays: recorded.length, possibleDays: dates.length, entries: days.reduce((n, d) => n + d.entries.length, 0), meals: days.reduce((n, d) => n + d.meals, 0),
    average: recorded.length ? scaleRatio(total(recorded.map(d => d.nutrition)), '1', String(recorded.length)) : null };
}
export function monthlyTrend(index: HistoryIndex, completeOnly = false) {
  const groups = new Map<string, DayRecord[]>();
  for (const day of index.days) { if (completeOnly ? !day.complete : !day.entries.length) continue; const key = day.key.slice(0, 7); const group = groups.get(key) ?? []; group.push(day); groups.set(key, group); }
  if (!index.days.length) return [];
  const first = startOfMonth(index.days[0].date), last = startOfMonth(index.days[index.days.length - 1].date);
  const points: { key: string; date: Date; days: number; average: Nutrition | null }[] = [];
  for (let date = first; date <= last; date = shiftMonth(date, 1)) {
    const key = dayKey(date).slice(0, 7), days = groups.get(key) ?? [];
    points.push({ key, date, days: days.length, average: days.length ? scaleRatio(total(days.map(d => d.nutrition)), '1', String(days.length)) : null });
  }
  return points;
}
