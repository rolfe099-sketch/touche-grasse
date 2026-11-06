import { DestinationConflict } from './DestinationConflict';
import { Icon } from './Icon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { display, logName } from '../domain/model';
import { repeatAvailability, reviewRepeatedMeal } from '../domain/repeatMeal';
import { batchBalance } from '../domain/portions';
import { useApp } from '../state/AppContext';
import { Button, TextButton } from './components';
import { Text, TextInput } from './Text';
import { colors, numeric } from './theme';
import { foodLabel } from '../domain/foodLanguage';
import { LoggingDestination } from './LoggingDestination';
import { calendarKey, loggingDayLabel } from '../domain/calendarDay';

export function RepeatMealReview({ onLogged, requestedDate }: { onLogged?: (date?: string) => void; requestedDate?: string }) {
  const app = useApp(), { repo } = app, review = repo.quickEntry.repeatReview;
  const reviewId = review?.id;
  const [ready, setReady] = useState<{ id: string; attempt: number }>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  // Finish legacy-date initialization before exposing editable inputs. A write
  // after the first frame can disable a just-focused native/WebKit input.
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      await repo.waitForWrites();
      const current = repo.quickEntry.repeatReview;
      if (current?.id !== reviewId) return;
      if (current && !current.loggingDate) await repo.saveRepeatDestination(current.id, { loggingDate: calendarKey(new Date()) });
      if (active) { setError(''); setReady(current ? { id: current.id, attempt } : undefined); }
    })().catch(() => { if (active) setError('Could not open this saved repeat. Your saved amounts are kept.'); });
    return () => { active = false; setReady(undefined); };
  }, [repo, reviewId, attempt]));
  if (error && review) return <View><Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text><TextButton label="Retry opening repeat" disabled={app.busy} onPress={() => { setError(''); setAttempt(value => value + 1); }} /><TextButton label="Cancel adjusted repeat" disabled={app.busy} onPress={() => void app.run(() => repo.cancelRepeatReview(review.id))} /></View>;
  return review && ready?.id === review.id && ready.attempt === attempt ? <RepeatEditor key={review.id} onLogged={onLogged} requestedDate={requestedDate} /> : null;
}

function RepeatEditor({ onLogged, requestedDate }: { onLogged?: (date?: string) => void; requestedDate?: string }) {
  const app = useApp(), review = app.repo.quickEntry.repeatReview!;
  const pathname = usePathname();
  const [amounts, setAmounts] = useState(review.amounts), [error, setError] = useState(''), [focusedAmount, setFocusedAmount] = useState<number>();
  const [keepDate, setKeepDate] = useState(false);
  const dateConflict = !keepDate && requestedDate && requestedDate !== (review.loggingDate ?? calendarKey(new Date()));
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const progress = reviewRepeatedMeal({ ...review, amounts });
  const availabilityError = repeatAvailability({ ...review, amounts }, app.repo.preparedBatches, app.repo.logs);
  function change(index: number, value: string) {
    const next = [...amounts]; next[index] = value; setAmounts(next); setError('');
    void app.saveRepeatAmounts(review.id, next).catch(() => { if (mounted.current) setError('Could not save these amounts. Log will retry, or keep this view open.'); });
  }
  return <View testID="repeat-review" style={{ marginTop: 12, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingBottom: 4 }}><View style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={16} /></View><View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '600' }}>{review.shortcutId ? app.repo.shortcuts.find(item => item.id === review.shortcutId)?.name ?? 'Adjusted shortcut' : 'Repeat with changes'}</Text><Text style={{ color: colors.secondary, fontSize: 12 }}>{review.entries.length} {review.entries.length === 1 ? 'food' : 'foods'}</Text></View><TextButton label="Cancel" accessibilityLabel="Cancel adjusted repeat" disabled={app.busy} onPress={() => void app.run(() => app.repo.cancelRepeatReview(review.id))} /></View>
    {dateConflict && <DestinationConflict date={review.loggingDate} meal={review.meal ?? review.entries[0].meal} requestedDate={requestedDate!} disabled={app.busy} onUse={() => void app.run(() => app.repo.saveRepeatDestination(review.id, { loggingDate: requestedDate }))} onKeep={() => setKeepDate(true)} />}
    <LoggingDestination date={review.loggingDate} meal={review.meal ?? review.entries[0].meal} disabled={app.busy || !!dateConflict} onChange={change => void app.run(() => app.repo.saveRepeatDestination(review.id, change))} />
    {progress.rows.map(({ entry, nutrition, error: rowError }, index) => { const batch = entry.preparedBatchId ? app.repo.preparedBatches.find(item => item.id === entry.preparedBatchId) : undefined; return <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: index ? 1 : 0, borderColor: colors.line, minHeight: 55 }}>
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600' }}>{entry.snapshot.kind === 'food' ? foodLabel(entry.snapshot.ingredient.food) : logName(entry)}</Text><Text style={{ color: rowError ? colors.error : colors.secondary, fontSize: 12 }}>{rowError ?? `${display(nutrition!.kcal, 0)} kcal`}{batch ? ` · ${display(batchBalance(batch, app.repo.logs).servings.toFixed(), 2)} servings left` : ''}</Text></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: 120, minHeight: 46, borderWidth: 1, borderColor: focusedAmount === index ? colors.action : colors.line, borderRadius: 9, backgroundColor: colors.night }}><TextInput focusRing="container" accessibilityLabel={`Repeat amount ${index + 1}`} testID={`repeat-amount-${index}`} value={amounts[index]} onChangeText={value => change(index, value)} onFocus={() => setFocusedAmount(index)} onBlur={() => setFocusedAmount(undefined)} editable={!app.busy} keyboardType="decimal-pad" selectTextOnFocus maxLength={100} style={{ flex: 1, minWidth: 48, minHeight: 44, fontSize: 18, fontFamily: numeric, fontVariant: ['tabular-nums'], textAlign: 'right', paddingHorizontal: 8, color: colors.ink }} /><Text style={{ minWidth: 29, maxWidth: 55, paddingRight: 8, color: colors.secondary, fontSize: 12 }}>{entry.snapshot.kind === 'food' ? entry.snapshot.ingredient.unit : entry.snapshot.unit}</Text></View>
    </View>; })}
    <View testID="repeat-totals" style={{ paddingVertical: 13, gap: 8, borderTopWidth: 1, borderColor: colors.line, marginTop: 5 }}><View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.secondary, fontSize: 13 }}>{progress.valid ? 'Meal total' : 'Resolved subtotal'}</Text><Text style={{ fontFamily: numeric, fontVariant: ['tabular-nums'], fontSize: 24, fontWeight: '600' }}>{display(progress.nutrition.kcal, 0)} <Text style={{ fontSize: 12, color: colors.secondary }}>kcal</Text></Text></View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{([['Protein', progress.nutrition.protein], ['Carbs', progress.nutrition.carbohydrate], ['Fat', progress.nutrition.fat], ['Fiber', progress.nutrition.fiber]] as const).map(([label, value]) => <View key={label} style={{ flexGrow: 1, minWidth: 65, gap: 2 }}><Text style={{ fontSize: 11, color: colors.secondary }}>{label}</Text><Text style={{ fontFamily: numeric, fontVariant: ['tabular-nums'], fontSize: 15 }}>{display(value)} <Text style={{ color: colors.secondary, fontSize: 11 }}>g</Text></Text></View>)}</View></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, marginBottom: 6 }}>{error}</Text>}
    {!!availabilityError && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, marginBottom: 6 }}>{availabilityError}</Text>}
    {review.shortcutId && <TextButton label="Edit foods" disabled={app.busy || !progress.valid} onPress={() => void app.run(() => app.repo.editRepeatFoods(review.id)).then(ok => { if (ok && pathname !== '/entry') router.push('/entry'); })} />}
    {review.shortcutId && <TextButton label="Update saved amounts" disabled={app.busy || !progress.valid || !app.repo.shortcuts.some(item => item.id === review.shortcutId && !item.deletedAt)} onPress={() => void app.run(() => { const shortcut = app.repo.shortcuts.find(item => item.id === review.shortcutId)!; return app.repo.saveShortcut(shortcut.name, progress.rows.map(row => ({ ...row.entry, snapshot: row.snapshot!, nutrition: row.nutrition! })), shortcut.id); }, 'Saved amounts updated')} />}
    <Button label={`Log adjusted meal ${loggingDayLabel(review.loggingDate).toLowerCase()}`} primary disabled={app.busy || !!dateConflict || !progress.valid || !!availabilityError} onPress={() => void app.run(async () => { await app.repo.saveRepeatAmounts(review.id, amounts); await app.repo.logRepeatReview(review.id); }, 'Adjusted meal logged').then(ok => { if (ok) onLogged?.(review.loggingDate); })} />
  </View>;
}
