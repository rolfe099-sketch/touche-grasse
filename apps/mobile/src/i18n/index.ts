import { Meal } from '../domain/model';

// UI locale is independent of source-food language and persisted meal identifiers.
export const locale = 'en-GB';
export const messages = {
  en: {
    today: 'Today', history: 'History', recipes: 'Recipes', food: 'Foods', log: 'Log food',
    back: 'Back', close: 'Close', save: 'Save', cancel: 'Cancel',
    day: 'Day', week: 'Week', month: 'Month', all: 'Lifetime',
    breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', other: 'Other',
  },
} as const;
export type MessageKey = keyof typeof messages.en;
export function t(key: MessageKey) { return messages.en[key]; }
export const mealLabel = (meal: Meal) => ({ Frokost: t('breakfast'), Lunsj: t('lunch'), Middag: t('dinner'), Annet: t('other') })[meal];
export const plural = (count: number, singular: string, many = singular + 's') => `${count} ${count === 1 ? singular : many}`;
export const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => date.toLocaleDateString(locale, options);
