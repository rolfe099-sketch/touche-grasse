import { Draft, Meal } from './model';
import { calendarKey, loggingDayLabel, loggingTime, yesterdayKey } from './calendarDay';

export type LoggingDestination = { loggingDate?: string; meal?: Meal };
const mealNames: Record<string, Meal> = { breakfast: 'Frokost', lunch: 'Lunsj', dinner: 'Middag', snack: 'Annet', snacks: 'Annet' };
// Only reserved command suffixes are destinations. Ingredient and recipe names
// containing day/meal words remain intact. “Same breakfast as yesterday” still
// selects yesterday as the source, not the day to log to.
export function extractLoggingDestination(text: string, now = new Date()): { text: string; destination?: LoggingDestination } {
  const clean = text.trim().replace(/[.!?]+$/, '');
  if (!/^(?:add|include|log|save|repeat|set (?:date|meal)|\d)/i.test(clean)) return { text };
  if (/^(?:log|save) (?:it|this|meal|this meal) today$/i.test(clean)) return { text: clean.replace(/ today$/i, ''), destination: { loggingDate: calendarKey(now) } };
  const suffix = /\s+(?:to|for|at)\s+(?:(today|yesterday|\d{4}-\d{2}-\d{2})(?:['’]?s)?(?:\s+(breakfast|lunch|dinner|snacks?))?|(breakfast|lunch|dinner|snacks?)(?:\s+(today|yesterday|\d{4}-\d{2}-\d{2}))?)$/i.exec(clean);
  if (!suffix) {
    if (/\s+(?:to|for|at)\s+(?:tomorrow|next\s+\w+|\d{1,2}[/.]\d)/i.test(clean)) throw new Error('Use today, yesterday or a date in YYYY-MM-DD format. Future food cannot be logged.');
    return { text };
  }
  const day = (suffix[1] ?? suffix[4])?.toLowerCase();
  const meal = mealNames[(suffix[2] ?? suffix[3] ?? '').toLowerCase()];
  const loggingDate = day === 'today' ? calendarKey(now) : day === 'yesterday' ? yesterdayKey(now) : day;
  if (loggingDate) loggingTime(loggingDate, now);
  return { text: clean.slice(0, suffix.index), destination: { ...(loggingDate ? { loggingDate } : {}), ...(meal ? { meal } : {}) } };
}
export function hasMealDraft(draft: Draft): boolean { return !!(draft.text.trim() || draft.lines.length || draft.recipeName || draft.splitPlan); }
export function destinationDescription(destination: LoggingDestination, now = new Date()): string {
  const meal = Object.entries(mealNames).find(([, value]) => value === destination.meal)?.[0];
  return [loggingDayLabel(destination.loggingDate, now), meal].filter(Boolean).join(' · ');
}
