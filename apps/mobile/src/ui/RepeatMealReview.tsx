import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { display, logName } from '../domain/model';
import { repeatAvailability, reviewRepeatedMeal } from '../domain/repeatMeal';
import { batchBalance } from '../domain/portions';
import { useApp } from '../state/AppContext';
import { Button, TextButton, styles } from './components';
import { Text, TextInput } from './Text';
import { colors } from './theme';
import { foodLabel } from '../domain/foodLanguage';
import { mealLabel } from '../i18n';

export function RepeatMealReview({ onLogged }: { onLogged?: () => void }) {
  const { repo } = useApp(), review = repo.quickEntry.repeatReview;
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void repo.waitForWrites().then(() => { if (active) setFocused(true); });
    return () => { active = false; setFocused(false); };
  }, [repo]));
  return review && focused ? <RepeatEditor key={review.id} onLogged={onLogged} /> : null;
}

function RepeatEditor({ onLogged }: { onLogged?: () => void }) {
  const app = useApp(), review = app.repo.quickEntry.repeatReview!;
  const [amounts, setAmounts] = useState(review.amounts), [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const progress = reviewRepeatedMeal({ ...review, amounts });
  const availabilityError = repeatAvailability({ ...review, amounts }, app.repo.preparedBatches, app.repo.logs);
  function change(index: number, value: string) {
    const next = [...amounts]; next[index] = value; setAmounts(next); setError('');
    void app.saveRepeatAmounts(review.id, next).catch(() => { if (mounted.current) setError('Could not save these amounts. Log will retry, or keep this view open.'); });
  }
  return <View testID="repeat-review" style={{ marginTop: 12, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '600' }}>{review.shortcutId ? app.repo.shortcuts.find(item => item.id === review.shortcutId)?.name ?? 'Adjusted shortcut' : 'Repeat with changes'}</Text><TextButton label="Cancel" accessibilityLabel="Cancel adjusted repeat" disabled={app.busy} onPress={() => void app.run(() => app.repo.cancelRepeatReview(review.id))} /></View>
    <Text style={{ color: colors.secondary, fontSize: 12, marginBottom: 5 }}>{[...new Set(review.entries.map(entry => mealLabel(entry.meal)))].join(', ')} · today</Text>
    {progress.rows.map(({ entry, nutrition, error: rowError }, index) => { const batch = entry.preparedBatchId ? app.repo.preparedBatches.find(item => item.id === entry.preparedBatchId) : undefined; return <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderTopWidth: index ? 1 : 0, borderColor: colors.line, minHeight: 55 }}>
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600' }}>{entry.snapshot.kind === 'food' ? foodLabel(entry.snapshot.ingredient.food) : logName(entry)}</Text><Text style={{ color: rowError ? colors.error : colors.secondary, fontSize: 12 }}>{rowError ?? `${display(nutrition!.kcal, 0)} kcal`}{batch ? ` · ${display(batchBalance(batch, app.repo.logs).servings.toFixed(), 2)} servings left` : ''}</Text></View>
      <TextInput accessibilityLabel={`Repeat amount ${index + 1}`} testID={`repeat-amount-${index}`} value={amounts[index]} onChangeText={value => change(index, value)} editable={!app.busy} keyboardType="decimal-pad" selectTextOnFocus maxLength={100} style={[styles.input, { width: 78, minHeight: 44, fontSize: 16, textAlign: 'right', paddingVertical: 6 }]} />
      <Text style={{ width: 52, color: colors.secondary, fontSize: 12 }}>{entry.snapshot.kind === 'food' ? entry.snapshot.ingredient.unit : entry.snapshot.unit}</Text>
    </View>; })}
    <View testID="repeat-totals" style={{ paddingVertical: 8, gap: 3 }}><Text style={{ fontSize: 15, fontWeight: '600' }}>{progress.valid ? 'Meal total' : 'Resolved subtotal'} · {display(progress.nutrition.kcal, 0)} kcal</Text><Text style={{ color: colors.secondary, fontSize: 12 }}>Protein {display(progress.nutrition.protein)} g · Carbs {display(progress.nutrition.carbohydrate)} g · Fat {display(progress.nutrition.fat)} g · Fiber {display(progress.nutrition.fiber)} g</Text></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, marginBottom: 6 }}>{error}</Text>}
    {!!availabilityError && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12, marginBottom: 6 }}>{availabilityError}</Text>}
    {review.shortcutId && <TextButton label="Update saved amounts" disabled={app.busy || !progress.valid || !app.repo.shortcuts.some(item => item.id === review.shortcutId && !item.deletedAt)} onPress={() => void app.run(() => { const shortcut = app.repo.shortcuts.find(item => item.id === review.shortcutId)!; return app.repo.saveShortcut(shortcut.name, progress.rows.map(row => ({ ...row.entry, snapshot: row.snapshot!, nutrition: row.nutrition! })), shortcut.id); }, 'Saved amounts updated')} />}
    <Button label="Log adjusted meal today" primary disabled={app.busy || !progress.valid || !!availabilityError} onPress={() => void app.run(async () => { await app.repo.saveRepeatAmounts(review.id, amounts); await app.repo.logRepeatReview(review.id); }, 'Adjusted meal logged').then(ok => { if (ok) onLogged?.(); })} />
  </View>;
}
