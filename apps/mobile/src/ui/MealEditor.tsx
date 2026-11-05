import { useState } from 'react';
import { View } from 'react-native';
import { dayKey, display, Food, foodNutrition, logName, logQuantity, total, Unit } from '../domain/model';
import { EditRow, editRow, MealEdit, replaceEditFood, reviewMealEdit } from '../domain/mealEditor';
import { useApp } from '../state/AppContext';
import { Button, Field, IconButton, TextButton, styles } from './components';
import { Text, TextInput } from './Text';
import { colors } from './theme';
import { foodLabel } from '../domain/foodLanguage';

type Picker = { rowId?: string; ingredientId?: string; addIngredient?: boolean };
export function MealEditor({ onSaved }: { onSaved: () => void }) {
  const app = useApp(), initial = app.repo.quickEntry.mealEdit!;
  const [edit, setEdit] = useState(initial), [picker, setPicker] = useState<Picker>(), [query, setQuery] = useState(''), [units, setUnits] = useState<string>(), [error, setError] = useState('');
  const progress = reviewMealEdit(edit);
  const title = edit.target === 'shortcut' ? app.repo.shortcuts.find(item => item.id === edit.shortcutId)?.name ?? 'Shortcut' : 'Logged meal';
  const candidates = picker ? app.repo.index.search(query).slice(0, 5) : [];
  function change(next: MealEdit) {
    setEdit(next); setError('');
    void app.saveMealEditDraft(next).catch(() => setError('Could not save the edit draft. Keep this view open; Save will retry.'));
  }
  function rowChange(id: string, transform: (row: EditRow) => EditRow) { change({ ...edit, rows: edit.rows.map(row => row.entry.id === id ? transform(row) : row) }); }
  function choose(food: Food) {
    if (!picker) return;
    if (!picker.rowId) {
      const source = edit.original[0], snapshot = { kind: 'food' as const, ingredient: { id: app.repo.id(), food, quantity: '100', unit: food.referenceUnit } };
      const entry = { id: app.repo.id(), batchId: source.batchId, meal: source.meal, recordedAt: source.recordedAt, snapshot, nutrition: foodNutrition(food, '100', food.referenceUnit) };
      change({ ...edit, rows: [...edit.rows, editRow(entry)] });
    } else rowChange(picker.rowId, row => {
      if (!picker.addIngredient) return replaceEditFood(row, food, picker.ingredientId);
      if (row.entry.snapshot.kind !== 'recipe') return row;
      return { ...row, entry: { ...row.entry, snapshot: { ...row.entry.snapshot, recipe: { ...row.entry.snapshot.recipe, ingredients: [...row.entry.snapshot.recipe.ingredients, { id: app.repo.id(), food, quantity: '100', unit: food.referenceUnit }] } } } };
    });
    setPicker(undefined); setQuery('');
  }
  function pick(value: Picker) { setPicker(value); setQuery(''); setUnits(undefined); }
  const search = <View testID="edit-food-picker" style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }}>
    <Field compact label="Find a food" value={query} onChangeText={setQuery} placeholder="Chicken, pasta, apple…" autoFocus autoCapitalize="none" />
    {candidates.map(food => <View key={food.id} style={{ borderTopWidth: 1, borderColor: colors.line }}><TextButton label={foodLabel(food)} accessibilityLabel={`Choose replacement ${food.name}`} disabled={app.busy} onPress={() => choose(food)} /><Text style={{ color: colors.secondary, fontSize: 12 }}>{display(food.nutrition.kcal, 0)} kcal / 100 {food.referenceUnit}</Text></View>)}
    {!candidates.length && <Text style={{ color: colors.secondary, fontSize: 13 }}>No matching foods. Try another name.</Text>}
    <TextButton label="Cancel food search" onPress={() => setPicker(undefined)} />
  </View>;
  return <View testID="meal-editor">
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontSize: 19, fontWeight: '600', flex: 1 }}>{title}</Text><TextButton label="Discard edit" disabled={app.busy} onPress={() => void app.run(() => app.repo.cancelMealEdit(edit.id)).then(ok => { if (ok) onSaved(); })} /></View>
    <Text style={{ color: colors.secondary, fontSize: 12, marginBottom: 8 }}>{edit.target === 'shortcut' ? 'Changes apply to future logs. Past meals stay as recorded.' : 'Correct this meal. Previous values stay in its history.'}</Text>
    {progress.rows.map(({ row, nutrition, error: rowError }, index) => {
      const snapshot = row.entry.snapshot, id = row.entry.id, parentUnit = snapshot.kind === 'food' ? snapshot.ingredient.unit : snapshot.unit;
      return <View key={id} testID={`edit-row-${index}`} style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1 }}>{snapshot.kind === 'food' ? <TextButton label={foodLabel(snapshot.ingredient.food)} accessibilityLabel={`Change food ${index + 1}`} disabled={app.busy} onPress={() => pick({ rowId: id })} /> : <Text style={{ fontWeight: '600', fontSize: 16 }}>{snapshot.recipe.name}</Text>}</View>
          <TextInput accessibilityLabel={`Edit amount ${index + 1}`} value={row.amount} onChangeText={amount => rowChange(id, current => ({ ...current, amount }))} selectTextOnFocus keyboardType="decimal-pad" maxLength={100} editable={!app.busy} style={[styles.input, { width: 74, textAlign: 'right', minHeight: 44, paddingHorizontal: 8 }]} />
          <TextButton label={parentUnit} accessibilityLabel={`Change unit ${index + 1}`} onPress={() => setUnits(units === id ? undefined : id)} />
          <IconButton name="close" label={`Remove food ${index + 1}`} disabled={app.busy || edit.rows.length <= 1} onPress={() => change({ ...edit, rows: edit.rows.filter(item => item.entry.id !== id) })} />
        </View>
        {units === id && <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(snapshot.kind === 'food' ? ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece'] : ['servings', 'g']).map(unit => <TextButton key={unit} label={unit} disabled={app.busy} accessibilityLabel={`Use ${unit} for food ${index + 1}`} onPress={() => { rowChange(id, current => ({ ...current, entry: { ...current.entry, snapshot: current.entry.snapshot.kind === 'food' ? { ...current.entry.snapshot, ingredient: { ...current.entry.snapshot.ingredient, unit: unit as Unit } } : { ...current.entry.snapshot, unit: unit as 'g' | 'servings' } } })); setUnits(undefined); }} />)}</View>}
        <Text style={{ fontSize: 12, color: rowError ? colors.error : colors.secondary }}>{rowError ?? `${display(nutrition!.kcal, 0)} kcal`}</Text>
        {snapshot.kind === 'recipe' && <>
          <Text style={{ color: colors.secondary, fontSize: 12, marginTop: 8 }}>Whole recipe · {display(snapshot.recipe.servings)} servings{snapshot.recipe.cookedWeightGrams ? ` · ${display(snapshot.recipe.cookedWeightGrams)} g final weight` : ''}. Portion nutrition scales from these ingredients.</Text>
          {!!row.entry.preparedBatchId && <Text style={{ color: colors.secondary, fontSize: 12 }}>Only this portion is corrected. The remaining batch keeps its original ingredients.</Text>}
          {snapshot.recipe.ingredients.map((ingredient, ingredientIndex) => <View key={ingredient.id}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 8 }}>
            <View style={{ flex: 1 }}><TextButton label={foodLabel(ingredient.food)} accessibilityLabel={`Change ingredient ${index + 1}.${ingredientIndex + 1}`} disabled={app.busy} onPress={() => pick({ rowId: id, ingredientId: ingredient.id })} /></View>
            <TextInput accessibilityLabel={`Ingredient amount ${index + 1}.${ingredientIndex + 1}`} value={row.ingredients[ingredient.id] ?? ingredient.quantity} onChangeText={value => rowChange(id, current => ({ ...current, ingredients: { ...current.ingredients, [ingredient.id]: value } }))} editable={!app.busy} selectTextOnFocus keyboardType="decimal-pad" maxLength={100} style={[styles.input, { width: 74, minHeight: 44, textAlign: 'right', paddingHorizontal: 8 }]} />
            <TextButton label={ingredient.unit} accessibilityLabel={`Change ingredient unit ${index + 1}.${ingredientIndex + 1}`} disabled={app.busy} onPress={() => setUnits(units === `${id}:${ingredient.id}` ? undefined : `${id}:${ingredient.id}`)} />
            <IconButton name="close" label={`Remove ingredient ${index + 1}.${ingredientIndex + 1}`} disabled={app.busy || snapshot.recipe.ingredients.length <= 1} onPress={() => rowChange(id, current => current.entry.snapshot.kind === 'recipe' ? { ...current, entry: { ...current.entry, snapshot: { ...current.entry.snapshot, recipe: { ...current.entry.snapshot.recipe, ingredients: current.entry.snapshot.recipe.ingredients.filter(item => item.id !== ingredient.id) } } } } : current)} />
          </View>{units === `${id}:${ingredient.id}` && <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece'] as const).map(unit => <TextButton key={unit} label={unit} accessibilityLabel={`Use ${unit} for ingredient ${index + 1}.${ingredientIndex + 1}`} disabled={app.busy} onPress={() => { rowChange(id, current => current.entry.snapshot.kind === 'recipe' ? { ...current, entry: { ...current.entry, snapshot: { ...current.entry.snapshot, recipe: { ...current.entry.snapshot.recipe, ingredients: current.entry.snapshot.recipe.ingredients.map(item => item.id === ingredient.id ? { ...item, unit } : item) } } } } : current); setUnits(undefined); }} />)}</View>}</View>)}
          <TextButton label="Add recipe ingredient" accessibilityLabel={`Add ingredient to recipe ${index + 1}`} disabled={app.busy || snapshot.recipe.ingredients.length >= 200} onPress={() => pick({ rowId: id, addIngredient: true })} />
        </>}
        {picker?.rowId === id && search}
      </View>;
    })}
    {picker && !picker.rowId && search}
    <TextButton label="Add food" accessibilityLabel="Add food to edited meal" disabled={app.busy || edit.rows.length >= 200} onPress={() => pick({})} />
    <View testID="edit-totals" style={{ paddingVertical: 10 }}><Text style={{ fontWeight: '600' }}>{progress.valid ? 'Meal total' : 'Resolved subtotal'} · {display(progress.nutrition.kcal, 0)} kcal</Text><Text style={{ fontSize: 12, color: colors.secondary }}>Protein {display(progress.nutrition.protein)} g · Carbs {display(progress.nutrition.carbohydrate)} g · Fat {display(progress.nutrition.fat)} g · Fiber {display(progress.nutrition.fiber)} g</Text></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text>}
    <Button primary label={edit.target === 'shortcut' ? 'Save shortcut changes' : 'Save meal correction'} disabled={app.busy || !progress.valid} onPress={() => void app.run(async () => { await app.repo.saveMealEditDraft(edit); await app.repo.commitMealEdit(edit.id); }, edit.target === 'shortcut' ? 'Shortcut updated' : 'Meal corrected').then(ok => { if (ok) onSaved(); })} />
  </View>;
}

export function MealCorrectionHistory({ date }: { date: string }) {
  const { repo } = useApp(), [open, setOpen] = useState(false);
  const corrections = repo.mealCorrections.filter(item => [...item.previous, ...item.applied].some(entry => dayKey(new Date(entry.recordedAt)) === date));
  if (!corrections.length) return null;
  return <View testID="meal-correction-history"><TextButton label={`${open ? 'Hide' : 'View'} meal corrections (${corrections.length})`} onPress={() => setOpen(!open)} />{open && [...corrections].reverse().map(item => <View key={item.id} style={{ borderTopWidth: 1, borderColor: colors.line, paddingVertical: 8 }}><Text style={{ fontSize: 13, fontWeight: '600' }}>{new Date(item.correctedAt).toLocaleString('en-GB')}{item.revertedAt ? ' · undone' : ''}</Text>{[['Before', item.previous], ['After', item.applied]].map(([label, value]) => { const entries = value as typeof item.previous; return <View key={String(label)}><Text style={{ fontSize: 13 }}>{String(label)} · {display(total(entries.map(entry => entry.nutrition)).kcal, 0)} kcal</Text>{entries.map(entry => <Text key={entry.id} style={{ fontSize: 12, color: colors.secondary }}>{logName(entry)} · {logQuantity(entry)}</Text>)}</View>; })}</View>)}</View>;
}
