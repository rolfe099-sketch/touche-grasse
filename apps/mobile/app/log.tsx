import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { dayKey, display, logName, logQuantity, meals, parseAmount, Unit } from '../src/domain/model';
import { localDate } from '../src/domain/history';
import { dateLabel, mealLabel, plural } from '../src/i18n';
import { useApp } from '../src/state/AppContext';
import { Button, Field, NutritionView, Screen, Section, styles, TextButton } from '../src/ui/components';
import { Text } from '../src/ui/Text';
import { colors } from '../src/ui/theme';
import { DeleteLogButton } from '../src/ui/Diary';

export default function LogDetails() {
  const app = useApp(), params = useLocalSearchParams<{ id: string }>();
  const entry = app.repo.logs.find(log => log.id === params.id);
  const snapshot = entry?.snapshot;
  const [quantity, setQuantity] = useState(snapshot?.kind === 'food' ? snapshot.ingredient.quantity : snapshot?.quantity ?? '1');
  const [unit, setUnit] = useState<Unit | 'servings'>(snapshot?.kind === 'food' ? snapshot.ingredient.unit : snapshot?.unit ?? 'servings');
  const [meal, setMeal] = useState(entry?.meal ?? 'Middag');
  const [date, setDate] = useState(entry ? dayKey(new Date(entry.recordedAt)) : dayKey(new Date()));
  const originalTime = entry ? new Date(entry.recordedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '12:00';
  const [time, setTime] = useState(originalTime), [audit, setAudit] = useState(false);
  if (!entry || !snapshot) return <Screen title="Entry unavailable" back><Text style={styles.body}>This entry may have been deleted or undone. Your other records are still here.</Text></Screen>;
  async function save() {
    const ok = await app.run(async () => {
      const amount = parseAmount(quantity); if (amount === null) throw new Error('Check the amount.');
      localDate(date);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Use a time in 24-hour HH:MM format.');
      const at = date === dayKey(new Date(entry!.recordedAt)) && time === originalTime ? entry!.recordedAt : new Date(`${date}T${time}:00`).toISOString();
      await app.repo.correctLog(entry!.id, { quantity: amount, unit, meal, recordedAt: at });
    }, 'Entry corrected');
    if (ok) router.back();
  }
  return <Screen testID="log-screen" title="Logged entry" back eyebrow={`${dateLabel(new Date(entry.recordedAt))} · ${originalTime}`} trailing={<DeleteLogButton entries={[entry]} label="Delete entry" onDeleted={() => router.canGoBack() ? router.back() : router.replace('/')} />}>
    <Text style={{ fontSize: 24, fontWeight: '600', lineHeight: 29, marginBottom: 4 }}>{logName(entry)}</Text>
    <Text style={styles.subtitle}>{logQuantity(entry)} · {mealLabel(entry.meal)}</Text>
    <NutritionView value={entry.nutrition} />
    <Section title="Correct this entry" />
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}><View style={{ flex: 1 }}><Field label="Logged amount" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /></View><View style={{ flexDirection: 'row', gap: 5, marginBottom: 14 }}>{(snapshot.kind === 'recipe' ? ['servings', 'g'] as const : ['g', 'kg', 'ml', 'l'] as const).map(value => <Button key={value} label={value} compact selected={unit === value} onPress={() => setUnit(value)} />)}</View></View>
    <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} /></View><View style={{ width: 92 }}><Field label="Time (HH:MM)" value={time} onChangeText={setTime} /></View></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 }}>{meals.map(value => <Button key={value} label={mealLabel(value)} compact selected={meal === value} onPress={() => setMeal(value)} />)}</View>
    <Text style={[styles.subtitle, { fontSize: 13, marginBottom: 17 }]}>Amounts use the food or recipe values captured when you logged. The previous version is kept with every correction.</Text>
    <Button label="Save correction" primary disabled={app.busy} onPress={() => void save()} />
    {snapshot.kind === 'recipe' && <><Section title="Ingredients when logged" />{snapshot.recipe.ingredients.map(i => <View key={i.id} style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 10, flexDirection: 'row', gap: 10 }}><Text style={{ flex: 1, fontSize: 14 }}>{i.food.name}</Text><Text style={{ fontSize: 14 }}>{display(i.quantity)} {i.unit}</Text></View>)}<Text style={[styles.subtitle, { marginTop: 10, fontSize: 12 }]}>Amounts above are for the whole recipe ({display(snapshot.recipe.servings)} servings).</Text></>}
    <TextButton label={`${audit ? 'Hide' : 'View'} ${plural(entry.corrections?.length ?? 0, 'correction')}`} onPress={() => setAudit(!audit)} />
    {audit && (entry.corrections?.length ? entry.corrections.map((correction, i) => <View key={i} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line }}><Text style={{ fontWeight: '600', fontSize: 14 }}>Corrected {dateLabel(new Date(correction.correctedAt))}</Text><Text style={styles.subtitle}>Previous: {correction.previous.snapshot.kind === 'food' ? `${display(correction.previous.snapshot.ingredient.quantity)} ${correction.previous.snapshot.ingredient.unit}` : `${display(correction.previous.snapshot.quantity)} ${correction.previous.snapshot.unit}`} · {display(correction.previous.nutrition.kcal, 0)} kcal · {mealLabel(correction.previous.meal)} · {dateLabel(new Date(correction.previous.recordedAt))}</Text></View>) : <Text style={styles.subtitle}>This entry has not been corrected.</Text>)}
  </Screen>;
}
