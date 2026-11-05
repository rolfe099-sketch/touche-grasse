import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { calendarDate, calendarDaySchema, calendarKey, loggingTime, yesterdayKey } from '../src/domain/calendarDay';
import { extractLoggingDestination, hasMealDraft } from '../src/domain/loggingDestination';
import { applyCommand, applyCommandSequence } from '../src/domain/commands';
import { emptyDraft } from '../src/domain/model';
import { emptyPreferences } from '../src/domain/quickEntry';
import { FoodIndex } from '../src/domain/search';

const now = new Date(2026, 10, 5, 9, 30), index = new FoodIndex();
const command = (text: string) => applyCommand(text, emptyDraft(randomUUID), index, emptyPreferences(), randomUUID, now);

it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '1899-12-31', '2201-01-01', '05/11/2026', '2026-1-01'])('rejects invalid calendar day %s', key => {
  expect(calendarDaySchema.safeParse(key).success).toBe(false);
});
it('uses local calendar dates and preserves actual submission time for today', () => {
  expect(calendarKey(calendarDate('2024-02-29'))).toBe('2024-02-29');
  expect(calendarDate('2026-11-04').getHours()).toBe(12);
  expect(loggingTime('2026-11-05', now).toISOString()).toBe(now.toISOString());
  expect(calendarKey(loggingTime('2026-11-04', now))).toBe('2026-11-04');
  expect(() => loggingTime('2026-11-06', now)).toThrow('earlier date');
  expect(() => loggingTime('', now)).toThrow('YYYY-MM-DD');
});
it.each(['Europe/Oslo', 'America/Los_Angeles', 'Pacific/Auckland'])('crosses daylight saving and month boundaries by calendar day in %s', timezone => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = timezone;
    for (const [date, expected] of [[new Date(2026, 2, 30, 0, 15), '2026-03-29'], [new Date(2026, 9, 26, 0, 15), '2026-10-25'], [new Date(2026, 0, 1), '2025-12-31']] as const) {
      expect(yesterdayKey(date)).toBe(expected);
      expect(calendarKey(loggingTime(expected, date))).toBe(expected);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
it('separates a spoken destination from food matching without assuming a chicken product', () => {
  const result = command('Can you add 200 grams of chicken to yesterday’s dinner?');
  expect(result.kind).toBe('draft');
  if (result.kind !== 'draft') throw new Error('Expected ingredient review');
  expect(result.draft).toMatchObject({ loggingDate: '2026-11-04', meal: 'Middag', lines: [{ query: 'chicken', quantityText: '200', food: null }] });
});
it('supports date-only and meal-only commands, including explicit today on a retained draft', () => {
  const draft = { ...emptyDraft(randomUUID), loggingDate: '2026-11-01' };
  expect(applyCommandSequence('Set meal to breakfast then log this for yesterday', draft, index, emptyPreferences(), randomUUID, now)).toMatchObject({ draft: { loggingDate: '2026-11-04', meal: 'Frokost' }, command: { kind: 'log' } });
  expect(applyCommandSequence('Log this today', draft, index, emptyPreferences(), randomUUID, now).draft.loggingDate).toBe('2026-11-05');
});
it('keeps yesterday as a repeat source and does not strip day words from recipe names or compound foods', () => {
  expect(command('Same breakfast as yesterday')).toEqual({ kind: 'repeat', yesterdayMeal: 'Frokost' });
  expect(command('Start a recipe called Dinner for yesterday')).toMatchObject({ kind: 'draft', draft: { recipeName: 'Dinner for yesterday' } });
  expect(extractLoggingDestination('Add 10g oil to yesterdays breakfast', now)).toMatchObject({ text: 'Add 10g oil', destination: { loggingDate: '2026-11-04', meal: 'Frokost' } });
  expect(extractLoggingDestination('100g breakfast cereal', now)).toEqual({ text: '100g breakfast cereal' });
  expect(extractLoggingDestination('100g today special sauce', now)).toEqual({ text: '100g today special sauce' });
});
it.each(['Add 10g oil for tomorrow', 'Log this for 2026-11-06', 'Add 10g oil for 2026-02-30', 'Log this for 05/11/2026'])('rejects unsupported or future destinations without creating food queries: %s', text => {
  expect(() => command(text)).toThrow();
});
it('validates a whole utterance before applying any destination or ingredient change', () => {
  const draft = emptyDraft(randomUUID), before = structuredClone(draft);
  expect(() => applyCommandSequence('Add 10g oil to yesterday’s breakfast then remove chicken', draft, index, emptyPreferences(), randomUUID, now)).toThrow('not in this meal');
  expect(draft).toEqual(before);
});
it('can target a saved meal without confusing it with a draft ingredient modification', () => {
  expect(applyCommandSequence('Log my oats for yesterday', emptyDraft(randomUUID), index, emptyPreferences(), randomUUID, now)).toMatchObject({ draft: { loggingDate: '2026-11-04' }, command: { kind: 'shortcut', name: 'my oats' } });
});

it('an empty dated composer does not require an unfinished-meal conflict decision', () => {
  expect(hasMealDraft({ ...emptyDraft(randomUUID), loggingDate: '2026-11-04' })).toBe(false);
  expect(hasMealDraft({ ...emptyDraft(randomUUID), loggingDate: '2026-11-04', text: '10g olive oil' })).toBe(true);
});
