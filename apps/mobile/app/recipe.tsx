import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { display, Food, foodNutrition, lineIngredient, parseAmount, Recipe, recipePortion, recipeTotal, SplitPlan, Unit } from '../src/domain/model';
import { useApp } from '../src/state/AppContext';
import { Button, Field, FoodRow, IconButton, NutritionView, Screen, Section, styles, TextButton } from '../src/ui/components';
import { Text, TextInput } from '../src/ui/Text';
import { Icon } from '../src/ui/Icon';
import { AmountControl } from '../src/ui/AmountControl';
import { convertPortionAmount } from '../src/domain/portions';
import { foodLabel } from '../src/domain/foodLanguage';
import { colors } from '../src/ui/theme';
import { SavedPortions, SplitIntoServings } from '../src/ui/Portions';
import { pickPhoto } from '../src/platform/photo';

export default function RecipeEditor() {
  const app = useApp(), params = useLocalSearchParams<{ id?: string; from?: string; name?: string }>();
  const existing = app.repo.recipes.find(r => r.id === params.id), key = params.id ?? 'new';
  const candidate = app.repo.recipeDrafts[key];
  const retained = candidate && (candidate.recipe.name.trim() || candidate.recipe.ingredients.length || candidate.instructions.trim()) ? candidate : undefined;
  const [recipe, setRecipe] = useState<Recipe>(() => retained?.recipe ?? (existing ? JSON.parse(JSON.stringify(existing)) as Recipe : { id: app.repo.id(), name: params.name ?? app.draft.recipeName ?? '', ingredients: params.from === 'draft' ? app.draft.lines.map(lineIngredient) : [], steps: [], servings: params.from === 'draft' ? app.draft.splitPlan?.servingsText ?? '1' : '1', cookedWeightGrams: params.from === 'draft' ? app.draft.splitPlan?.cookedWeightText || null : null, favorite: false }));
  const [instructions, setInstructions] = useState(retained?.instructions ?? recipe.steps.join('\n'));
  const [editingSteps, setEditingSteps] = useState(!existing), [query, setQuery] = useState('');
  const [showWeight, setShowWeight] = useState(recipe.cookedWeightGrams !== null);
  const [portion, setPortion] = useState('1'), [portionUnit, setPortionUnit] = useState<'g' | 'servings'>('servings');
  const [splitPlan, setSplitPlan] = useState<SplitPlan | undefined>(candidate?.splitPlan);
  const [createdBatch, setCreatedBatch] = useState<string>();
  const [draftError, setDraftError] = useState(''), [draftSaved, setDraftSaved] = useState(false);
  const saved = useRef(false), saving = useRef(false), latest = useRef({ recipe, instructions, splitPlan }); latest.current = { recipe, instructions, splitPlan };
  useEffect(() => {
    if (saved.current) return;
    let active = true; setDraftSaved(false);
    if (!saving.current) void app.repo.saveRecipeDraft(key, { recipe, instructions, splitPlan }).then(() => {
      if (active) { setDraftSaved(true); setDraftError(''); }
    }).catch(() => { if (active) setDraftError('Your changes could not be saved locally. Keep this screen open and try saving again.'); });
    return () => { active = false; };
  }, [recipe, instructions, splitPlan, key, app.repo]);
  useFocusEffect(useCallback(() => () => { if (!saved.current && !saving.current) void app.repo.saveRecipeDraft(key, latest.current).catch(() => undefined); }, [app.repo, key]));
  function current(): Recipe {
    const servings = parseAmount(recipe.servings), cookedWeight = recipe.cookedWeightGrams === null || recipe.cookedWeightGrams === '' ? null : parseAmount(recipe.cookedWeightGrams);
    if (servings === null || (recipe.cookedWeightGrams && cookedWeight === null)) throw new Error('Check the serving count and cooked weight.');
    const value = { ...recipe, servings, cookedWeightGrams: cookedWeight, steps: instructions.split('\n').map(s => s.trim()).filter(Boolean), ingredients: recipe.ingredients.map(i => { const quantity = parseAmount(i.quantity); if (quantity === null) throw new Error('Check each ingredient amount.'); return { ...i, quantity }; }) };
    recipeTotal(value); return value;
  }
  let preview; try { preview = recipePortion(current()); } catch { /* Keep incomplete edits visible. */ }
  function add(food: Food) { setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { id: app.repo.id(), food, quantity: '100', unit: food.referenceUnit }] }); setQuery(''); }
  async function save() {
    saving.current = true;
    const ok = await app.run(() => app.repo.saveRecipe(current(), key), 'Recipe saved');
    if (ok) { saved.current = true; router.dismissTo('/recipes'); }
    else void app.repo.saveRecipeDraft(key, latest.current).catch(() => undefined);
    saving.current = false;
  }
  function changePortionUnit(next: 'g' | 'servings') {
    if (next === portionUnit) return;
    setPortion(convertPortionAmount(existing ?? recipe, portion, portionUnit, next) ?? ''); setPortionUnit(next);
  }
  let savedPortion;
  try { const amount = parseAmount(portion); if (existing && amount) savedPortion = recipePortion(existing, amount, portionUnit); } catch { /* Invalid edits stay visible. */ }
  const steps = instructions.split('\n').map(s => s.trim()).filter(Boolean);
  const mealIngredients = params.from === 'draft' ? app.draft.lines.filter(line => !recipe.ingredients.some(i => i.id === line.id)) : [];
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen keyboardInsets={false} title={existing ? 'Edit recipe' : 'New recipe'} back trailing={<TextButton label="Save" disabled={app.busy} onPress={() => void save()} />}>
    {!!retained && !!mealIngredients.length && <View style={{ backgroundColor: colors.orangeWash, borderRadius: 6, padding: 14, marginBottom: 15 }}><Text style={{ fontSize: 14, lineHeight: 20 }}>Your unfinished recipe is open. You can keep it and add the ingredients from your meal.</Text><TextButton label="Add this meal's ingredients" onPress={() => setRecipe({ ...recipe, ingredients: [...recipe.ingredients, ...mealIngredients.map(lineIngredient)] })} /></View>}
    <View style={{ borderTopWidth: 3, borderColor: colors.forrest, paddingTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={[styles.label, { color: colors.forrest }]}>{existing ? 'Saved recipe' : 'Recipe details'}</Text><IconButton name={recipe.favorite ? 'check' : 'bookmark'} label={recipe.favorite ? 'Remove recipe favourite' : 'Favourite recipe'} onPress={() => setRecipe({ ...recipe, favorite: !recipe.favorite })} /></View>
      <TextInput accessibilityLabel="Recipe name" placeholder="Recipe name" placeholderTextColor={colors.secondary} value={recipe.name} onChangeText={name => setRecipe({ ...recipe, name })} multiline style={{ fontFamily: 'DMSansSemiBold', fontSize: 30, lineHeight: 35, paddingVertical: 3, minHeight: 46, color: colors.ink }} />
      <Text testID="recipe-save-status" style={{ color: colors.secondary, fontSize: 12, marginTop: 3 }}>{draftError ? 'Draft needs saving.' : draftSaved ? 'Draft saved on this device.' : 'Saving draft…'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 9 }}><AmountControl label="Number of servings" value={recipe.servings} maximum="10000" disabled={app.busy} onChange={servings => setRecipe({ ...recipe, servings })} /><Text style={styles.subtitle}>servings</Text><View style={{ flex: 1 }} /><TextButton label={recipe.photo ? 'Change photo' : 'Add your photo'} onPress={() => void app.run(async () => { const photo = await pickPhoto(); if (photo) setRecipe({ ...recipe, photo }); })} /></View>
      {recipe.photo && <View style={{ marginTop: 10 }}><Image source={{ uri: recipe.photo }} accessibilityLabel="Your recipe photo" style={{ height: 175, width: '100%', borderRadius: 14 }} /><TextButton label="Remove photo" onPress={() => setRecipe({ ...recipe, photo: undefined })} /></View>}
    </View>
    {!!draftError && <Text accessibilityRole="alert" style={{ color: colors.error, marginTop: 10 }}>{draftError}</Text>}
    <Section title="Ingredients"><Text style={{ fontSize: 12, color: colors.secondary }}>Tap an amount to edit</Text></Section>
    <View style={{ borderTopWidth: 1, borderColor: colors.line }}>
      {recipe.ingredients.map((ingredient, index) => {
        let kcal: string | null = null; try { const quantity = parseAmount(ingredient.quantity); if (quantity) kcal = foodNutrition(ingredient.food, quantity, ingredient.unit).kcal; } catch { /* Invalid units stay explicit. */ }
        return <View key={ingredient.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 60, paddingVertical: 7, borderBottomWidth: 1, borderColor: colors.line }}>
          <View style={{ flex: 1, gap: 3 }}><Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600' }}>{foodLabel(ingredient.food).split(' · ')[0]}</Text><Text style={{ fontSize: 11, color: colors.secondary }}>{[foodLabel(ingredient.food).split(' · ')[1], `${display(kcal, 0)} kcal`].filter(Boolean).join(' · ')} · {ingredient.food.provenance.source === 'matvaretabellen' ? 'Matvaretabellen' : 'Your food'}</Text></View>
          <TextInput accessibilityLabel={`Ingredient ${index + 1} amount`} testID={`recipe-quantity-${index}`} value={ingredient.quantity} keyboardType="decimal-pad" selectTextOnFocus onChangeText={quantity => setRecipe({ ...recipe, ingredients: recipe.ingredients.map(i => i.id === ingredient.id ? { ...i, quantity } : i) })} style={{ width: 58, minHeight: 44, textAlign: 'right', paddingHorizontal: 8, backgroundColor: colors.surface, borderRadius: 8, borderBottomWidth: 1, borderColor: colors.line, fontVariant: ['tabular-nums'], fontSize: 17 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Change ingredient ${index + 1} unit, currently ${ingredient.unit}`} onPress={() => { const units: Unit[] = ['g', 'kg', 'ml', 'l']; const unit = units[(units.indexOf(ingredient.unit) + 1) % units.length]; setRecipe({ ...recipe, ingredients: recipe.ingredients.map(i => i.id === ingredient.id ? { ...i, unit } : i) }); }} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 13, color: colors.action }}>{ingredient.unit}</Text></Pressable>
          <IconButton name="minus" label={`Remove ingredient ${index + 1}`} onPress={() => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== ingredient.id) })} />
        </View>;
      })}
    </View>
    {!recipe.ingredients.length && <Text style={[styles.subtitle, { paddingVertical: 16 }]}>No ingredients yet.</Text>}
    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line }}><Icon name="plus" size={18} /><TextInput accessibilityLabel="Add an ingredient" placeholder="Find an ingredient…" placeholderTextColor={colors.secondary} value={query} onChangeText={setQuery} style={{ flex: 1, minHeight: 46 }} /></View>
    {!!query.trim() && app.repo.index.search(query).slice(0, 6).map(food => <FoodRow key={food.id} food={food} onSelect={() => add(food)} />)}
    <Section title="In the kitchen"><TextButton label={editingSteps ? 'Preview steps' : 'Edit steps'} onPress={() => setEditingSteps(!editingSteps)} /></Section>
    {editingSteps ? <Field label="Preparation · one step per line" multiline value={instructions} onChangeText={setInstructions} placeholder="Add preparation steps…" style={{ minHeight: 115, textAlignVertical: 'top', lineHeight: 24 }} /> : steps.length ? steps.map((step, i) => <View key={i} style={{ flexDirection: 'row', gap: 13, paddingBottom: 17 }}><Text style={{ color: colors.toffee, fontWeight: '700', fontSize: 17, width: 21 }}>{String(i + 1).padStart(2, '0')}</Text><Text style={[styles.body, { flex: 1 }]}>{step}</Text></View>) : <Text style={styles.subtitle}>No preparation steps.</Text>}
    <TextButton label={showWeight ? 'Hide cooked weight' : 'Add cooked batch weight'} onPress={() => setShowWeight(!showWeight)} />
    {showWeight && <><Field label="Cooked batch weight · g (optional)" value={recipe.cookedWeightGrams ?? ''} keyboardType="decimal-pad" onChangeText={cookedWeightGrams => setRecipe({ ...recipe, cookedWeightGrams })} /><Text style={[styles.subtitle, { fontSize: 12 }]}>Needed only for gram portions. Water loss changes weight, not total energy.</Text></>}
    <TextButton label="Split into servings" disabled={app.busy || !preview} onPress={() => setSplitPlan(splitPlan ?? { name: recipe.name, servingsText: recipe.servings, cookedWeightText: recipe.cookedWeightGrams ?? '' })} />
    {splitPlan && preview && <SplitIntoServings recipe={current()} plan={splitPlan} onChange={setSplitPlan} onCancel={() => setSplitPlan(undefined)} onSave={async prepared => { const batch = await app.repo.createPreparedBatch(prepared); setCreatedBatch(batch.id); setSplitPlan(undefined); }} />}
    {createdBatch && app.repo.preparedBatches.find(batch => batch.id === createdBatch) && <SavedPortions batch={app.repo.preparedBatches.find(batch => batch.id === createdBatch)!} />}
    <Section title="Per serving"><Text style={{ fontSize: 12, color: colors.secondary }}>{display(parseAmount(recipe.servings))} in the whole recipe</Text></Section>
    {preview ? <NutritionView value={preview} /> : <Text style={[styles.subtitle, { marginBottom: 18 }]}>Choose the ingredients and check amounts to calculate nutrition.</Text>}
    <Button label="Save recipe" primary disabled={app.busy || !preview} onPress={() => void save()} />
    {existing && <View style={{ marginTop: 16, paddingTop: 4, borderTopWidth: 1, borderColor: colors.line }}><Section title="Log a portion" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12, alignItems: 'center' }}><AmountControl label="Portion amount" value={portion} onChange={setPortion} disabled={app.busy} /><Button label="Servings" selected={portionUnit === 'servings'} compact onPress={() => changePortionUnit('servings')} /><Button label="Grams" selected={portionUnit === 'g'} disabled={existing.cookedWeightGrams === null || app.busy} compact onPress={() => changePortionUnit('g')} /></View>
      {savedPortion && <Text testID="recipe-portion-preview" style={[styles.subtitle, { marginBottom: 8 }]}>{display(savedPortion.kcal, 2)} kcal · Protein {display(savedPortion.protein)} g · Carbs {display(savedPortion.carbohydrate)} g · Fat {display(savedPortion.fat)} g · Fiber {display(savedPortion.fiber)} g</Text>}
      <Button label="Log saved recipe" disabled={app.busy || !savedPortion} onPress={() => void app.run(() => { const quantity = parseAmount(portion); if (!quantity) throw new Error('Check the portion amount.'); return app.repo.logRecipe(existing, quantity, portionUnit); }, 'Recipe portion logged')} />
      <Text style={[styles.subtitle, { fontSize: 12, marginTop: 8 }]}>Uses the last saved recipe. Save your edits first.</Text>
      <TextButton label="Save a separate copy" disabled={app.busy} onPress={() => void app.run(() => app.repo.duplicate(current()), 'Recipe copy saved')} />
    </View>}
  </Screen></KeyboardAvoidingView>;
}
