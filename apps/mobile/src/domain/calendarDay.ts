import { z } from 'zod';

export function calendarKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function calendarDate(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error('Use a date in YYYY-MM-DD format.');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (calendarKey(date) !== key || date.getFullYear() < 1900 || date.getFullYear() > 2200) throw new Error('Choose a valid date between 1900 and 2200.');
  return date;
}
export const calendarDaySchema = z.string().max(10).refine(key => { try { calendarDate(key); return true; } catch { return false; } }, 'Choose a valid date in YYYY-MM-DD format.');
export function yesterdayKey(now = new Date()): string {
  const date = new Date(now); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - 1); return calendarKey(date);
}
// A calendar date never goes through UTC parsing. Noon avoids DST transitions.
// Today's entries retain their actual submission time; backdated entries have
// a date only in the UI, not a fabricated consumption time.
export function loggingTime(key: string | undefined, now = new Date()): Date {
  if (key === undefined) return new Date(now);
  const date = calendarDate(key);
  if (key > calendarKey(now)) throw new Error('Choose today or an earlier date to log food.');
  return key === calendarKey(now) ? new Date(now) : date;
}
export function loggingDayLabel(key: string | undefined, now = new Date()): string {
  return !key || key === calendarKey(now) ? 'Today' : key === yesterdayKey(now) ? 'Yesterday' : key;
}
