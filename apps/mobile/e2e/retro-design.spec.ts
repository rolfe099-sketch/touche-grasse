import { expect, test } from '@playwright/test';
import { addDays } from '../src/domain/history';
import { dayKey } from '../src/domain/model';

test('Today week strip navigates recorded days without changing any logged nutrition', async ({ page }) => {
  await page.goto('/');
  const today = new Date(), todayKey = dayKey(today), previousKey = dayKey(addDays(today, -1));
  await expect(page.getByTestId('today-day-strip')).toBeVisible();
  await expect(page.getByTestId(`today-day-${todayKey}`)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('universal-log').click();
  await page.getByTestId('quick-text').fill('10g olive oil');
  await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  const nutrition = await page.getByTestId('nutrition-kcal').innerText();
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await page.getByTestId(`calendar-${previousKey}`).click();
  await expect(page.getByTestId('log-row')).toHaveCount(0);
  await expect(page.getByTestId(`today-day-${previousKey}`)).toHaveAttribute('aria-pressed', 'true');
  // A new week is shown when crossing Monday; the Today shortcut stays one tap away.
  if (today.getDay() === 1) await page.getByRole('button', { name: 'Today', exact: true }).click();
  else await page.getByTestId(`today-day-${todayKey}`).click();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText(nutrition);
  const future = addDays(today, 1);
  if (today.getDay() !== 0) await expect(page.getByTestId(`today-day-${dayKey(future)}`)).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText(nutrition);
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('log-row')).toHaveCount(0);
});

test('week strip crosses Sunday and Monday without selecting a future day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-26T12:00:00+01:00') });
  await page.goto('/');
  await expect(page.getByTestId('today-day-2026-10-26')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('today-day-2026-10-27')).toBeDisabled();
  await page.getByRole('button', { name: 'Choose date', exact: true }).click();
  await page.getByTestId('calendar-2026-10-25').click();
  await expect(page.getByTestId('today-day-2026-10-25')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('today-day-2026-10-19')).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByTestId('today-day-2026-10-26')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('today-day-2026-11-01')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next day', exact: true })).toHaveCount(0);
});
