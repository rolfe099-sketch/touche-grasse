import { useState } from 'react';

import { Pressable, View } from 'react-native';

import { D, dayKey, display, parseAmount, PreparedBatch, Recipe, recipePortion, SplitPlan } from '../domain/model';

import { batchBalance, batchRecipe, portionFits } from '../domain/portions';

import { localDate } from '../domain/history';

import { useApp } from '../state/AppContext';

import { Button, Field, TextButton } from './components';

import { Text, TextInput } from './Text';

import { colors } from './theme';

import { Icon } from './Icon';



function PortionAmount({ value, unit, disabled, onChange }: { value: string; unit: 'servings' | 'g'; disabled: boolean; onChange: (value: string) => void }) {

  const amount = parseAmount(value), canDecrease = amount !== null && new D(amount).gt(1);

  return <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden' }}>

    <Pressable accessibilityRole="button" accessibilityLabel="Decrease portion amount" disabled={disabled || !canDecrease} onPress={() => onChange(new D(amount!).minus(1).toFixed())} accessibilityState={{ disabled: disabled || !canDecrease }} style={({ pressed }) => ({ minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.pressed : colors.raised, opacity: disabled || !canDecrease ? 0.35 : 1 })}><Icon name="minus" size={15} color={colors.ink} /></Pressable>

    <TextInput accessibilityLabel={unit === 'g' ? 'Grams to log' : 'Servings to log'} testID="portion-amount" value={value} maxLength={100} onChangeText={onChange} keyboardType="decimal-pad" selectTextOnFocus editable={!disabled} style={{ minHeight: 44, width: 48, textAlign: 'center', fontSize: 23, fontVariant: ['tabular-nums'] }} />

    <Pressable accessibilityRole="button" accessibilityLabel="Increase portion amount" disabled={disabled || amount === null} onPress={() => onChange(new D(amount!).plus(1).toFixed())} accessibilityState={{ disabled: disabled || amount === null }} style={({ pressed }) => ({ minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.pressed : colors.raised, opacity: disabled || amount === null ? 0.35 : 1 })}><Icon name="plus" size={15} color={colors.ink} /></Pressable>

  </View>;

}



export function SplitIntoServings({ recipe, plan, onChange, onSave, onCancel }: { recipe: Recipe; plan: SplitPlan; onChange: (plan: SplitPlan) => void; onSave: (recipe: Recipe) => Promise<unknown>; onCancel: () => void }) {

  const app = useApp();

  let prepared: Recipe | undefined, preview, error = '';

  try {

    const servings = parseAmount(plan.servingsText), weight = plan.cookedWeightText.trim() ? parseAmount(plan.cookedWeightText) : null;

    if (!servings || (plan.cookedWeightText.trim() && weight === null)) throw new Error('Check servings and weight');

    prepared = batchRecipe(recipe, plan.name.trim() || 'Meal prep', servings, weight); preview = recipePortion(prepared);

  } catch (reason) { error = reason instanceof Error ? reason.message : 'Check servings and weight.'; }

  return <View testID="split-panel" style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line, gap: 4 }}>

    <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 6 }}>Split into servings</Text>

    <Field label="Batch name" value={plan.name} maxLength={300} onChangeText={name => onChange({ ...plan, name })} style={{ borderRadius: 6 }} />

    <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ width: 82 }}><Field label="Servings" testID="batch-servings" value={plan.servingsText} maxLength={100} onChangeText={servingsText => onChange({ ...plan, servingsText })} keyboardType="decimal-pad" selectTextOnFocus style={{ borderRadius: 6 }} /></View><View style={{ flex: 1 }}><Field label="Final cooked weight · g (optional)" testID="batch-weight" value={plan.cookedWeightText} maxLength={100} onChangeText={cookedWeightText => onChange({ ...plan, cookedWeightText })} keyboardType="decimal-pad" style={{ borderRadius: 6 }} /></View></View>

    {preview && <Text testID="batch-preview" style={{ fontSize: 12, lineHeight: 18, color: colors.secondary }}>{display(preview.kcal, 2)} kcal per serving · P {display(preview.protein, 2)} g · C {display(preview.carbohydrate, 2)} g · F {display(preview.fat, 2)} g · Fiber {display(preview.fiber, 2)} g{prepared?.cookedWeightGrams ? `\n${display(recipePortion(prepared, '1', 'g').kcal, 3)} kcal per gram` : ''}</Text>}

    {!!error && <Text style={{ fontSize: 12, color: colors.error }}>{error}</Text>}

    <Text style={{ fontSize: 12, lineHeight: 17, color: colors.secondary, marginVertical: 4 }}>Measured cooked weight only. No yield or oil absorption is assumed. Saving a batch does not log it as eaten.</Text>

    <Button label="Save batch" testID="save-batch" primary disabled={!prepared || app.busy} onPress={() => void app.run(() => onSave(prepared!), 'Batch saved · nothing logged', true)} />

    <TextButton label="Cancel split" disabled={app.busy} onPress={onCancel} />

  </View>;

}

export function SavedPortions({ batch }: { batch: PreparedBatch }) {

  const app = useApp();

  const [quantity, setQuantity] = useState('1'), [unit, setUnit] = useState<'servings' | 'g'>('servings');

  const [date, setDate] = useState(() => dayKey(new Date())), [showDate, setShowDate] = useState(false);

  const balance = batchBalance(batch, app.repo.logs);

  let amount: string | null = null, preview, error = '';

  try {

    amount = parseAmount(quantity); if (!amount) throw new Error('Enter a portion amount.');

    portionFits(batch, app.repo.logs, amount, unit); localDate(date); preview = recipePortion(batch.recipe, amount, unit);

  } catch (reason) { error = reason instanceof Error ? reason.message : 'Check portion'; }

  return <View testID={`saved-batch-${batch.id}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}>

    <Text style={{ fontSize: 16, fontWeight: '600' }}>{batch.recipe.name}</Text>

    <Text testID="remaining-portions" style={{ fontSize: 12, color: colors.secondary, marginVertical: 5 }}>{display(balance.servings.toFixed(), 6)} servings left{balance.grams ? ` · ${display(balance.grams.toFixed(), 2)} g` : ''}</Text>

    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9 }}><PortionAmount value={quantity} unit={unit} disabled={app.busy} onChange={setQuantity} />{(['servings', ...(batch.recipe.cookedWeightGrams !== null ? ['g'] : [])] as ('servings' | 'g')[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'g' ? 'Grams' : 'Servings'} accessibilityState={{ selected: unit === value }} disabled={app.busy} onPress={() => setUnit(value)} style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: unit === value ? 2 : 0, borderColor: colors.action }}><Text style={{ fontSize: 13, color: unit === value ? colors.action : colors.secondary }}>{value === 'g' ? 'Grams' : 'Servings'}</Text></Pressable>)}<View style={{ flex: 1 }} /><TextButton label={showDate ? 'Hide date' : 'Choose date'} onPress={() => setShowDate(!showDate)} disabled={app.busy} /></View>

    {showDate && <Field label="Log date (YYYY-MM-DD)" testID="portion-date" value={date} onChangeText={setDate} style={{ borderRadius: 6 }} />}

    {preview && <Text testID="portion-preview" style={{ fontSize: 12, color: colors.secondary, marginVertical: 6 }}>{display(preview.kcal, 2)} kcal · P {display(preview.protein, 2)} g · C {display(preview.carbohydrate, 2)} g · F {display(preview.fat, 2)} g · Fiber {display(preview.fiber, 2)} g · {unit === 'g' ? 'grams' : 'servings'} · {date}</Text>}

    {!!error && <Text style={{ fontSize: 12, color: colors.error, marginVertical: 6 }}>{error}</Text>}

    <Button label={`Log ${quantity || '…'} ${unit === 'g' ? 'g' : amount === '1' ? 'serving' : 'servings'}`} testID="log-portion" primary disabled={app.busy || !preview} onPress={() => void app.run(() => {

      const at = date === dayKey(new Date()) ? new Date() : localDate(date); if (date !== dayKey(new Date())) at.setHours(12);

      return app.repo.logPreparedBatch(batch.id, amount!, unit, at);

    }, `Portion logged · ${date}`)} />

    {app.repo.logs.some(log => log.preparedBatchId === batch.id && app.repo.undo.includes(log.id)) && <TextButton label="Undo last portion" disabled={app.busy} onPress={() => void app.run(() => app.repo.undoLast(), 'Portion undone')} />}

  </View>;

}

export function SavedPortionList({ query = '' }: { query?: string }) {

  const app = useApp(), [opened, setOpened] = useState<string>();

  const undoable = new Set(app.repo.logs.filter(log => app.repo.undo.includes(log.id)).map(log => log.preparedBatchId));

  const batches = [...app.repo.preparedBatches].filter(batch => batch.recipe.name.toLowerCase().includes(query.toLowerCase()) && (batchBalance(batch, app.repo.logs).numerator.gt(0) || undoable.has(batch.id))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!batches.length) return null;

  const active = batches.find(batch => batch.id === opened)?.id ?? batches[0].id;

  return <View style={{ marginBottom: 18 }}><Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4 }}>Saved portions</Text>{batches.map(batch => batch.id === active ? <SavedPortions key={batch.id} batch={batch} /> : <TextButton key={batch.id} label={`Open saved batch ${batch.recipe.name}`} onPress={() => setOpened(batch.id)} />)}</View>;

}

