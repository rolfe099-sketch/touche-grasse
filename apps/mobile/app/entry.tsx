import { Text, TextInput } from '../src/ui/Text';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput as NativeInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { display, Food, lineIngredient, meals, Recipe, Unit } from '../src/domain/model';
import { editLiveLine, liveTextIsCurrent, matchIngredient, mealProgress, recentMealBatches, updateLiveText } from '../src/domain/quickEntry';
import { applyCommand, yesterdayMealEntries } from '../src/domain/commands';
import { foodLabel } from '../src/domain/foodLanguage';
import { normalize } from '../src/domain/search';
import { useApp } from '../src/state/AppContext';
import { Button, SegmentButton, IconButton, Field, FoodRow, Screen, TextButton } from '../src/ui/components';
import { colors, numeric } from '../src/ui/theme';
import { SavedPortions, SplitIntoServings } from '../src/ui/Portions';
import { mealLabel } from '../src/i18n';
import { Icon } from '../src/ui/Icon';
import { EntryMethod, VoiceEntry } from '../src/ui/VoiceEntry';
import { Scanner } from '../src/ui/Scanner';
import { EntryFrame } from '../src/ui/EntryFrame';
import { RepeatMealReview } from '../src/ui/RepeatMealReview';
import { Reveal } from '../src/ui/Motion';
import { labelReviewTargets } from '../src/domain/labelDrafts';
import { LabelDraftResume } from '../src/ui/LabelDraftResume';

export default function Entry() {
  const { repo, draft, setDraft, revision, busy, run } = useApp();
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: EntryMethod = params.mode === 'voice' || params.mode === 'scan' ? params.mode : draft.text || draft.lines.length ? 'text' : repo.quickEntry.entryMethod ?? 'text';
  const [mode, setMode] = useState<EntryMethod>(initialMode), [commandNotice, setCommandNotice] = useState('');
  const [commandsOpen, setCommandsOpen] = useState(false), [mealPicker, setMealPicker] = useState(false), [sourceFocused, setSourceFocused] = useState(false);
  const source = useRef<NativeInput>(null);
  function selectMode(next: EntryMethod) { setMode(next); if (repo.quickEntry.entryMethod !== next) void repo.saveEntryMethod(next).catch(() => setParseError('Could not remember this entry method. Your meal is still available.')); }
  function focusSource() { requestAnimationFrame(() => source.current?.focus()); }

  const [editing, setEditing] = useState<string>();
  const [filter, setFilter] = useState<{ id: string; text: string }>();
  const [unitsFor, setUnitsFor] = useState<string>();
  const [parseError, setParseError] = useState<string>();
  const [adding, setAdding] = useState(false), [query, setQuery] = useState('');
  const [more, setMore] = useState(false);
  const [createdBatch, setCreatedBatch] = useState<string>();
  const progress = useMemo(() => mealProgress(draft), [draft]);
  const labelReviews = useMemo(() => { void revision; return labelReviewTargets(repo.quickEntry.labelDrafts, new Set(repo.foods.filter(food => food.provenance.source !== 'matvaretabellen').map(food => food.id))); }, [repo, revision]);
  const active = adding || unitsFor ? undefined : draft.lines.find(line => line.id === editing) ?? draft.lines.find(line => !line.food);
  const activeQuery = active ? filter?.id === active.id ? filter.text : active.query : '';
  const candidates = useMemo(() => {
    void revision;
    return active ? matchIngredient(activeQuery, repo.index, repo.quickEntry).candidates.slice(0, more ? 12 : 3) : [];
  }, [active, activeQuery, repo, revision, more]);
  const results = useMemo(() => { void revision; return query.trim() ? repo.index.search(query).slice(0, 6) : []; }, [repo, query, revision]);
  function openRecipe() { router.push({ pathname: '/recipe', params: { from: 'draft', name: draft.recipeName } }); }
  function command(text: string) {
    if (busy) return false;
    try {
      const result = applyCommand(text, draft, repo.index, repo.quickEntry, repo.id); setParseError(undefined);
      if (result.kind === 'draft') { setDraft(result.draft); setCommandNotice(result.message); setEditing(undefined); setFilter(undefined); }
      else if (result.kind === 'recipe') { if (!progress.valid) throw new Error('Resolve the ingredient rows before saving a recipe.'); openRecipe(); }
      else if (result.kind === 'log') { if (draft.splitPlan) throw new Error('Save this batch first, then log the servings you ate.'); void run(() => repo.logDraft(draft), 'Meal logged', true).then(ok => { if (ok) router.dismissTo('/'); }); }
      else if (result.kind === 'repeat') { const last = result.yesterdayMeal ? yesterdayMealEntries(repo.logs, result.yesterdayMeal) : recentMealBatches(repo.logs, 1)[0]; if (!last?.length) throw new Error(result.yesterdayMeal ? `No ${mealLabel(result.yesterdayMeal).toLowerCase()} was logged yesterday.` : 'There is no previous meal to repeat.'); void run(() => repo.repeatMeal(last.map(log => log.id)), 'Previous meal logged').then(ok => { if (ok) router.dismissTo('/'); }); }
      else { const exact = repo.preparedBatches.filter(batch => normalize(batch.recipe.name) === normalize(result.name)); const batches = exact.length ? exact : repo.preparedBatches.filter(batch => normalize(batch.recipe.name).includes(normalize(result.name))); if (batches.length !== 1) throw new Error('Use the exact name of one saved batch.'); void run(() => repo.logPreparedBatch(batches[0].id, result.quantity), 'Saved portion logged').then(ok => { if (ok) router.dismissTo('/'); }); }
      return true;
    } catch (error) { setParseError(error instanceof Error ? error.message : 'Check that command.'); return false; }
  }
  function focus(id: string) { setUnitsFor(undefined); setEditing(editing === id && draft.lines.find(line => line.id === id)?.food ? undefined : id); setFilter(undefined); setMore(false); setAdding(false); }
  function choose(food: Food, lineId?: string) {
    const next = lineId ? editLiveLine(draft, lineId, { food }) : { ...draft, lines: [...draft.lines, { id: repo.id(), query: food.name, quantityText: '100', unit: food.referenceUnit, food, ...(['openFoodFacts', 'confirmedOCR'].includes(food.provenance.source) ? { entrySource: 'product' as const } : {}) }] };
    Keyboard.dismiss(); setUnitsFor(undefined);
    setDraft(next); setEditing(next.lines.find(line => !line.food)?.id); setFilter(undefined); setMore(false); setQuery(''); setAdding(false);
  }
  function typeMeal(text: string) {
    try {
      const next = updateLiveText(text, draft, repo.index, repo.quickEntry, repo.id);
      setAdding(false); setUnitsFor(undefined);
      if (editing && !next.lines.some(line => line.id === editing && normalize(line.query) === normalize(active?.query ?? ''))) { setEditing(undefined); setFilter(undefined); }
      if (filter && !next.lines.some(line => line.id === filter.id && draft.lines.some(old => old.id === line.id && normalize(old.query) === normalize(line.query)))) setFilter(undefined);
      setDraft(next); setParseError(undefined);
    } catch (error) { setDraft({ ...draft, text }); setParseError(error instanceof Error ? error.message : 'Check meal text'); }
  }
  useEffect(() => {
    if (draft.text.trim() && !liveTextIsCurrent(draft)) {
      try { setDraft(updateLiveText(draft.text, draft, repo.index, repo.quickEntry, repo.id)); } catch { /* Keep source text for correction, including older parser drafts. */ }
    }
  }, [draft, repo, setDraft]);
  if (repo.quickEntry.repeatReview) return <EntryFrame><Screen keyboardInsets={false} support title="Quick Log" back><LabelDraftResume reviews={labelReviews} disabled={busy} /><RepeatMealReview onLogged={() => router.dismissTo('/')} /></Screen></EntryFrame>;
  const splitting = draft.splitPlan;
  const footer = !!draft.lines.length && !(splitting && progress.valid) && <>
    <View testID="meal-nutrition">
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
      <Text style={s.small}>{progress.valid ? 'Meal total' : `Resolved subtotal · ${progress.resolved}/${draft.lines.length}`}</Text><Text testID="meal-kcal" style={{ fontSize: 20, fontFamily: numeric, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{display(progress.nutrition.kcal, 0)} <Text style={s.small}>kcal</Text></Text>
    </View>
    <Text style={[s.small, { marginBottom: 8 }]}>Protein {display(progress.nutrition.protein)} g · Carbs {display(progress.nutrition.carbohydrate)} g · Fat {display(progress.nutrition.fat)} g · Fiber {display(progress.nutrition.fiber)} g</Text>
    </View>
    <Button label={`Log ${draft.lines.length === 1 ? 'food' : `${draft.lines.length} foods`} today`} testID="commit-food" icon="check" primary disabled={!progress.valid || busy} onPress={() => void run(() => repo.logDraft(draft), 'Meal logged', true).then(ok => { if (ok) router.dismissTo('/'); })} />
  </>;
  return <EntryFrame>
    <Screen keyboardInsets={false} support title={draft.recipeName ? 'Build a recipe' : 'Quick Log'} back footer={footer} trailing={<IconButton name="type" label="Type commands" onPress={() => { Keyboard.dismiss(); setMode('text'); setCommandsOpen(!commandsOpen); }} />}>
      <LabelDraftResume reviews={labelReviews} disabled={busy} />
      <VoiceEntry onCommand={command} disabled={busy} mode={mode} onMode={selectMode} onReview={() => setMode('text')} onType={focusSource} commandsOpen={commandsOpen} onCommands={setCommandsOpen} autoStart={params.mode === 'voice'}>
        <TextInput ref={source} autoFocus={initialMode === 'text' && !draft.lines.length && !labelReviews.length} onFocus={() => setSourceFocused(true)} onBlur={() => setSourceFocused(false)} accessibilityLabel="Meal" testID="quick-text" placeholder="200g chicken, 150g pasta…" placeholderTextColor={colors.secondary} style={{ paddingHorizontal: 13, paddingVertical: 10, minHeight: 50, maxHeight: sourceFocused ? 115 : 64, fontSize: 17, lineHeight: 22 }} value={draft.text} multiline maxLength={10000} onChangeText={typeMeal} editable={!busy} />
      </VoiceEntry>
      {mode === 'scan' && <Scanner onAdded={() => setMode('text')} />}
      {draft.recipeName && <Text style={{ fontSize: 13, fontWeight: '600', color: colors.action, marginBottom: 6 }}>{draft.recipeName}</Text>}
      {!!commandNotice && <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: colors.forrest, marginBottom: 5 }}>{commandNotice}</Text>}
      {parseError && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>{parseError}</Text>}
      {!draft.lines.length && !createdBatch && !!repo.logs.length && <View style={{ marginVertical: 12 }}><Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 4 }}>Log again</Text>{recentMealBatches(repo.logs, 3).map((batch, i) => <View key={batch[0].batchId} style={{ flexDirection: 'row', alignItems: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel={`Log recent meal ${batch[0].batchId}`} disabled={busy} onPress={() => void run(() => repo.repeatMeal(batch.map(log => log.id)), 'Previous meal logged').then(ok => { if (ok) router.dismissTo('/'); })} style={{ flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line }}><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600' }}>{batch.map(log => log.snapshot.kind === 'recipe' ? log.snapshot.recipe.name : foodLabel(log.snapshot.ingredient.food)).join(', ')}</Text><Text style={s.small}>{batch.length === 1 ? '1 entry' : `${batch.length} entries`}</Text></View><Text style={{ fontSize: 18, color: colors.action }}>↻</Text></Pressable><TextButton label="Adjust" accessibilityLabel={`Adjust recent meal ${i + 1}`} disabled={busy || !!repo.quickEntry.repeatReview} onPress={() => void run(() => repo.startRepeatReview(batch.map(log => log.id)))} /></View>)}</View>}
      {createdBatch && repo.preparedBatches.find(batch => batch.id === createdBatch) && <><SavedPortions batch={repo.preparedBatches.find(batch => batch.id === createdBatch)!} /><TextButton label="Save remaining for later" onPress={() => router.dismissTo('/recipes')} /></>}
      {splitting && progress.valid && <SplitIntoServings recipe={{ id: 'prepared:' + draft.id, name: splitting.name || 'Meal prep', servings: '1', cookedWeightGrams: null, ingredients: draft.lines.map(lineIngredient), steps: [], favorite: false }} plan={splitting} onChange={splitPlan => setDraft({ ...draft, splitPlan })} onCancel={() => setDraft({ ...draft, splitPlan: undefined })} onSave={async (recipe: Recipe) => { const batch = await repo.createBatchFromDraft(draft, recipe.name, recipe.servings, recipe.cookedWeightGrams); setCreatedBatch(batch.id); }} />}
      {progress.rows.map(({ line, nutrition, error }, index) => {
        const open = active?.id === line.id;
        const parts = line.food ? foodLabel(line.food).split(' · ') : [line.query];
        return <Reveal key={line.id}><View testID={`ingredient-${index}`} style={{ borderBottomWidth: 1, borderColor: colors.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 49 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Change food ${index + 1}`} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => focus(line.id)} disabled={busy} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600' }}>{parts[0]}</Text>
              <Text numberOfLines={1} style={[s.small, { color: error ? colors.error : colors.secondary }]}>{error ?? [parts.slice(1).join(' · '), `${display(nutrition!.kcal, 0)} kcal`, repo.quickEntry.matches[normalize(line.query)]?.foodId === line.food?.id ? 'Remembered' : ''].filter(Boolean).join(' · ')}</Text>
            </Pressable>
            <TextInput accessibilityLabel={`Amount ${index + 1}`} testID={`quantity-${index}`} maxLength={100} style={s.amount} value={line.quantityText} onChangeText={quantityText => setDraft(editLiveLine(draft, line.id, { quantityText }))} keyboardType="decimal-pad" selectTextOnFocus editable={!busy} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Change unit row ${index + 1}, ${line.unit}`} disabled={busy} onPress={() => { setUnitsFor(unitsFor === line.id ? undefined : line.id); setEditing(undefined); setFilter(undefined); }} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={s.small}>{line.unit}⌄</Text></Pressable>
            <IconButton name="close" label={`Remove ${line.query}`} disabled={busy} onPress={() => { setDraft(editLiveLine(draft, line.id, null)); if (editing === line.id) setEditing(undefined); if (unitsFor === line.id) setUnitsFor(undefined); }} />
          </View>
          {unitsFor === line.id && <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece'] as Unit[]).map(unit => <Pressable key={unit} accessibilityRole="button" accessibilityLabel={`Unit ${unit} row ${index + 1}`} disabled={busy} onPress={() => { setDraft(editLiveLine(draft, line.id, { unit })); setUnitsFor(undefined); }} style={s.unit}><Text>{unit}</Text></Pressable>)}</View>}
          {open && <View testID="ingredient-choices" style={{ paddingHorizontal: 10, borderWidth: 1, borderRadius: 6, borderColor: colors.edge, backgroundColor: colors.night, marginBottom: 7 }}>
            <TextInput testID="entry-search" accessibilityLabel={`Filter products for ingredient ${index + 1}`} placeholder="Filter products" value={activeQuery} onChangeText={text => setFilter({ id: line.id, text })} editable={!busy} autoCorrect={false} style={s.filter} />
            {candidates.map(food => <View key={food.id} testID={`choice-${index}-${food.id}`}><Pressable testID={`food-${food.id}`} accessibilityRole="button" accessibilityLabel={`Use ${foodLabel(food)} for ingredient ${index + 1}`} disabled={busy} onPress={() => choose(food, line.id)} style={({ pressed }) => ({ minHeight: 44, paddingVertical: 5, paddingHorizontal: 4, backgroundColor: pressed ? colors.selection : 'transparent', borderBottomWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 })}><View style={{ flex: 1 }}><Text style={{ fontSize: 14, color: colors.action }}>{foodLabel(food)}</Text><Text style={s.small}>{display(food.nutrition.kcal, 0)} kcal / 100 {food.referenceUnit}{repo.quickEntry.matches[normalize(line.query)]?.foodId === food.id ? ' · Previous choice' : ''}</Text></View><Icon name="plus" size={15} /></Pressable></View>)}
            {!candidates.length && <Text style={[s.small, { paddingVertical: 8 }]}>No products found</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}><TextButton label={more ? 'Fewer products' : 'More products'} disabled={busy} onPress={() => setMore(!more)} />{line.food && line.food.provenance.source !== 'matvaretabellen' && repo.foods.some(food => food.id === line.food!.id) && <TextButton label="Edit label" disabled={busy} onPress={() => router.push({ pathname: '/manual', params: { edit: line.food!.id, line: line.id } })} />}<TextButton label="Create a food" disabled={busy} onPress={() => router.push('/manual')} />{line.food && <Pressable accessibilityRole="button" accessibilityLabel={`${repo.quickEntry.favorites.includes(line.food.id) ? 'Unfavorite' : 'Favorite'} ${line.food.name}`} disabled={busy} onPress={() => void run(() => repo.toggleFavorite(line.food!))} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 13, color: colors.action }}>{repo.quickEntry.favorites.includes(line.food.id) ? 'Unfavorite' : 'Favorite'}</Text></Pressable>}</View>
          </View>}
        </View></Reveal>;
      })}
      {!!draft.lines.length && <><Pressable accessibilityRole="button" accessibilityLabel={`Change meal type, ${mealLabel(draft.meal)}`} accessibilityState={{ expanded: mealPicker }} aria-expanded={mealPicker} onPress={() => { Keyboard.dismiss(); setMealPicker(!mealPicker); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', marginTop: 4 }}><Text style={{ color: colors.secondary, fontSize: 13 }}>Log to</Text><Text style={{ fontSize: 14 }}>{mealLabel(draft.meal)}</Text><Icon name="next" size={12} color={colors.secondary} /></Pressable>{mealPicker && <View style={{ flexDirection: 'row' }}>{meals.map(meal => <SegmentButton key={meal} label={mealLabel(meal)} selected={draft.meal === meal} onPress={() => { setDraft({ ...draft, meal }); setMealPicker(false); }} disabled={busy} />)}</View>}<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><TextButton label="Add food" disabled={busy} onPress={() => { setAdding(!adding); setEditing(undefined); }} /><TextButton label="Split into servings" disabled={!progress.valid || busy} onPress={() => setDraft({ ...draft, splitPlan: draft.splitPlan ?? { name: draft.recipeName ?? 'Meal prep', servingsText: '6', cookedWeightText: '' } })} /><TextButton label="Make a recipe" disabled={!progress.valid || busy} onPress={openRecipe} /></View></>}
      {(!draft.lines.length || adding) && !createdBatch && <View style={{ marginTop: 8 }}>
        <Field label="Search the food library" placeholder="Search foods" testID="entry-search" value={query} onChangeText={setQuery} autoCorrect={false} editable={!busy} style={{ borderRadius: 6 }} />
        {results.map(food => <FoodRow key={food.id} food={food} saved={repo.index.isSaved(food.id)} onSelect={() => choose(food)} />)}
        <TextButton label="Create a food" disabled={busy} onPress={() => router.push('/manual')} />
      </View>}
    </Screen>
  </EntryFrame>;
}
const s = StyleSheet.create({
  small: { fontSize: 12, lineHeight: 16, color: colors.secondary },
  amount: { width: 56, minHeight: 44, paddingHorizontal: 7, paddingVertical: 7, textAlign: 'right', fontSize: 16, fontFamily: numeric, fontVariant: ['tabular-nums'], backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  filter: { minHeight: 36, fontSize: 14, paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: colors.line },
  unit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
