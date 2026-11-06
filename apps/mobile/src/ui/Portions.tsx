import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { dayKey, display, parseAmount, PreparedBatch, Recipe, recipePortion, SplitPlan } from '../domain/model';
import { batchBalance, batchRecipe, convertPortionAmount, portionFits, quickBatchPortion } from '../domain/portions';
import { addDays, localDate } from '../domain/history';
import { readableLayout } from '../domain/accessibility';
import { loggingDayLabel } from '../domain/calendarDay';
import { useApp } from '../state/AppContext';
import { AmountControl } from './AmountControl';
import { Button, Field, SegmentButton, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';
import { Icon } from './Icon';
import { Reveal } from './Motion';

type PortionUnit = 'servings' | 'g';
function macros(value: ReturnType<typeof recipePortion>) { return `P ${display(value.protein, 2)} g · C ${display(value.carbohydrate, 2)} g · F ${display(value.fat, 2)} g · Fiber ${display(value.fiber, 2)} g`; }
function remaining(balance: ReturnType<typeof batchBalance>) { return `${display(balance.servings.toFixed(), 6)} servings left${balance.grams ? ` · ${display(balance.grams.toFixed(), 2)} g` : ''}`; }

export function SplitIntoServings({ recipe, plan, onChange, onSave, onCancel }: { recipe: Recipe; plan: SplitPlan; onChange: (plan: SplitPlan) => void; onSave: (recipe: Recipe) => Promise<unknown>; onCancel: () => void }) {
  const app = useApp(), { width, fontScale } = useWindowDimensions(), compact = readableLayout(width, fontScale).compact;
  let prepared: Recipe | undefined, preview, error = '';
  try {
    const servings = parseAmount(plan.servingsText), weight = plan.cookedWeightText.trim() ? parseAmount(plan.cookedWeightText) : null;
    if (!servings || (plan.cookedWeightText.trim() && weight === null)) throw new Error('Check servings and weight');
    prepared = batchRecipe(recipe, plan.name.trim() || 'Meal prep', servings, weight); preview = recipePortion(prepared);
  } catch (reason) { error = reason instanceof Error ? reason.message : 'Check servings and weight.'; }
  return <View testID="split-panel" style={s.panel}>
    <View style={s.heading}><View style={{ flex: 1 }}><Text style={s.title}>Split into servings</Text><Text style={s.small}>Save portions for later. Nothing logged yet.</Text></View><TextButton label="Cancel split" disabled={app.busy} onPress={onCancel} /></View>
    <Field compact label="Batch name" value={plan.name} maxLength={300} onChangeText={name => onChange({ ...plan, name })} />
    <View style={{ flexDirection: compact ? 'column' : 'row', gap: 12, marginBottom: 6 }}>
      <View style={{ gap: 4 }}><Text style={s.label}>Servings</Text><AmountControl label="Servings" testID="batch-servings" value={plan.servingsText} maximum="10000" disabled={app.busy} onChange={servingsText => onChange({ ...plan, servingsText })} /></View>
      <View style={{ flex: 1 }}><Field compact label="Cooked weight · g (optional)" testID="batch-weight" value={plan.cookedWeightText} maxLength={100} onChangeText={cookedWeightText => onChange({ ...plan, cookedWeightText })} keyboardType="decimal-pad" selectTextOnFocus /></View>
    </View>
    {preview && <View testID="batch-preview" style={s.nutrition}><Text style={s.energy}>{display(preview.kcal, 2)} kcal per serving</Text><Text style={s.small}>{macros(preview)}</Text>{prepared?.cookedWeightGrams && <Text style={s.small}>{display(recipePortion(prepared, '1', 'g').kcal, 3)} kcal per gram</Text>}</View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Text style={[s.small, { marginBottom: 8 }]}>Use a measured cooked weight for gram portions.</Text>
    <Button label="Save batch" testID="save-batch" primary disabled={!prepared || app.busy} onPress={() => void app.run(() => onSave(prepared!), 'Batch saved · nothing logged', true)} />
  </View>;
}

export function SavedPortions({ batch }: { batch: PreparedBatch }) {
  const app = useApp(), quick = quickBatchPortion(batch, app.repo.logs);
  const [quantities, setQuantities] = useState<Record<PortionUnit, string>>(() => ({ servings: quick?.unit === 'servings' ? quick.quantity : '1', g: quick?.unit === 'g' ? quick.quantity : '' }));
  const [unit, setUnit] = useState<PortionUnit>(quick?.unit ?? 'servings'), quantity = quantities[unit];
  const [date, setDate] = useState<string>(), [showDate, setShowDate] = useState(false);
  const selectedDate = date ?? dayKey(new Date()), balance = batchBalance(batch, app.repo.logs), perServing = recipePortion(batch.recipe);
  const maximum = unit === 'g' ? balance.grams?.toFixed() : balance.servings.toFixed();
  const undoable = app.repo.logs.some(log => log.preparedBatchId === batch.id && app.repo.undo.includes(log.id));
  let amount: string | null = null, preview, error = '';
  try {
    amount = parseAmount(quantity); if (!amount) throw new Error('Enter a portion amount.');
    portionFits(batch, app.repo.logs, amount, unit); localDate(selectedDate); preview = recipePortion(batch.recipe, amount, unit);
  } catch (reason) { error = reason instanceof Error ? reason.message : 'Check portion'; }
  function changeUnit(next: PortionUnit) {
    if (next === unit) return;
    const converted = convertPortionAmount(batch.recipe, quantity, unit, next);
    if (quantity.trim()) setQuantities(previous => ({ ...previous, [next]: converted ?? '' }));
    setUnit(next);
  }
  const stock = Math.max(0, Math.min(100, balance.servings.div(balance.totalServings).times(100).toNumber()));
  return <View testID={`saved-batch-${batch.id}`} style={s.panel}>
    <View style={s.heading}><View style={{ flex: 1, gap: 3 }}><Text style={s.title}>{batch.recipe.name}</Text><Text testID="remaining-portions" style={s.small}>{remaining(balance)}</Text></View>{undoable && <TextButton label="Undo last portion" disabled={app.busy} onPress={() => void app.run(() => app.repo.undoLast(), 'Portion undone')} />}</View>
    <View accessible={false} style={{ height: 3, backgroundColor: colors.track, marginBottom: 10, borderRadius: 2, overflow: 'hidden' }}><View style={{ width: `${stock}%`, height: 3, backgroundColor: colors.forrest }} /></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 8 }}>
      <Text style={s.small}>{display(perServing.kcal, 2)} kcal / serving</Text><View style={{ flex: 1 }} />
      {batch.recipe.cookedWeightGrams !== null && <View style={s.segments}>{(['servings', 'g'] as const).map(value => <SegmentButton key={value} label={value === 'g' ? 'Grams' : 'Servings'} selected={unit === value} disabled={app.busy} onPress={() => changeUnit(value)} />)}</View>}
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
      <AmountControl label={unit === 'g' ? 'Grams to log' : 'Servings to log'} testID="portion-amount" value={quantity} maximum={maximum ?? '0'} disabled={app.busy} onChange={value => setQuantities(previous => ({ ...previous, [unit]: value }))} />
      <View style={{ flex: 1, minWidth: 132 }}><Button label={`Log ${quantity || '…'} ${unit === 'g' ? 'g' : amount === '1' ? 'serving' : 'servings'}`} testID="log-portion" primary disabled={app.busy || !preview} onPress={() => void app.run(() => {
        const key = date ?? dayKey(new Date()), at = key === dayKey(new Date()) ? new Date() : localDate(key); if (key !== dayKey(new Date())) at.setHours(12);
        return app.repo.logPreparedBatch(batch.id, amount!, unit, at);
      }, `Portion logged · ${selectedDate}`)} /></View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}><View style={{ flex: 1 }}><Text testID="portion-preview" style={s.small}>{preview ? `${display(preview.kcal, 2)} kcal · ${macros(preview)}` : unit === 'g' && !quantity ? 'Enter grams. No rounded conversion is applied.' : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={showDate ? 'Hide date' : 'Choose date'} accessibilityState={{ expanded: showDate, disabled: app.busy }} disabled={app.busy} onPress={() => setShowDate(!showDate)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: pressed ? colors.pressed : 'transparent' })}><Icon name="calendar" size={14} color={colors.action} /><Text style={{ fontSize: 12, color: colors.action }}>{loggingDayLabel(selectedDate)}</Text></Pressable></View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {showDate && <Reveal><View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 6 }}><View style={{ flexDirection: 'row', gap: 16 }}><TextButton label="Today" disabled={app.busy} onPress={() => setDate(undefined)} /><TextButton label="Tomorrow" disabled={app.busy} onPress={() => setDate(dayKey(addDays(new Date(), 1)))} /></View><Field compact label="Log date (YYYY-MM-DD)" testID="portion-date" value={selectedDate} onChangeText={setDate} maxLength={10} editable={!app.busy} /></View></Reveal>}
  </View>;
}

export function SavedPortionList({ query = '', batchId, requestId = 0, showEmpty = false }: { query?: string; batchId?: string; requestId?: number; showEmpty?: boolean }) {
  const app = useApp(), [opened, setOpened] = useState<string>();
  useEffect(() => { setOpened(batchId); }, [batchId, requestId]);
  const undoable = new Set(app.repo.logs.filter(log => app.repo.undo.includes(log.id)).map(log => log.preparedBatchId));
  const batches = [...app.repo.preparedBatches].filter(batch => batch.recipe.name.toLowerCase().includes(query.toLowerCase()) && (batchBalance(batch, app.repo.logs).numerator.gt(0) || undoable.has(batch.id))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!batches.length) return showEmpty ? <View style={s.panel}><Text style={s.title}>{query ? 'No portions found' : 'No saved portions'}</Text><Text style={[s.small, { marginVertical: 8 }]}>Split a meal or recipe to keep servings for later.</Text><Button label="Prepare a meal" icon="plus" onPress={() => router.push('/entry')} /></View> : null;
  const active = batches.find(batch => batch.id === opened)?.id ?? batches[0].id;
  return <View style={{ marginBottom: 18 }}><Text style={{ fontSize: 18, fontWeight: '600', marginTop: 10 }}>Saved portions</Text>{batches.map(batch => {
    if (batch.id === active) return <SavedPortions key={batch.id} batch={batch} />;
    const balance = batchBalance(batch, app.repo.logs), quick = quickBatchPortion(batch, app.repo.logs);
    return <View key={batch.id} style={s.closed}><Pressable accessibilityRole="button" accessibilityLabel={`Open saved batch ${batch.recipe.name}`} onPress={() => setOpened(batch.id)} style={({ pressed }) => ({ flex: 1, minHeight: 54, justifyContent: 'center', gap: 3, opacity: pressed ? .6 : 1 })}><Text style={{ fontSize: 16, fontWeight: '600' }}>{batch.recipe.name}</Text><Text testID={`remaining-${batch.id}`} style={s.small}>{remaining(balance)} · {display(recipePortion(batch.recipe).kcal, 0)} kcal / serving</Text></Pressable>{quick && <Button compact label={quick.unit === 'g' ? `Log ${quick.quantity} g` : `Log ${quick.quantity}`} accessibilityLabel={`Log ${quick.quantity} ${quick.unit} of ${batch.recipe.name}`} disabled={app.busy} onPress={() => void app.run(() => app.repo.logPreparedBatch(batch.id, quick.quantity, quick.unit), 'Saved portion logged')} />}<Icon name="next" size={13} color={colors.secondary} /></View>;
  })}</View>;
}
const s = StyleSheet.create({
  panel: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, gap: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '600' },
  label: { fontSize: 12, color: colors.secondary, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 18, color: colors.secondary },
  error: { fontSize: 12, lineHeight: 18, color: colors.error, marginVertical: 3 },
  energy: { fontSize: 19, fontWeight: '600', color: colors.ink },
  nutrition: { paddingVertical: 7, marginBottom: 2, gap: 2, borderTopWidth: 1, borderColor: colors.line },
  segments: { width: 167, flexDirection: 'row', backgroundColor: colors.surface, padding: 3, borderRadius: 10 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5, borderBottomWidth: 1, borderColor: colors.line },
});
