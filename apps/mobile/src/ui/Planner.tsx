import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { D, dayKey, display, Food, lineIngredient, LogEntry, meals, Nutrition, recipePortion, snapshotNutrition, structuredCopy, total } from '../domain/model';
import { addDays, localDate } from '../domain/history';
import { calendarDaySchema } from '../domain/calendarDay';
import { formItems, MealPlan, pendingPlans, planIsLogged, plannedNutrition, PlanReview } from '../domain/mealPlanning';
import { recipeIdeas } from '../domain/recipeIdeas';
import { batchBalance } from '../domain/portions';
import { foodLabel } from '../domain/foodLanguage';
import { dateLabel, mealLabel } from '../i18n';
import { useApp } from '../state/AppContext';
import { Button, Field, IconButton, Section, styles, TextButton } from './components';
import { Text } from './Text';
import { colors, serif } from './theme';

type Snapshot = LogEntry['snapshot'];
const amount = (s: Snapshot) => s.kind === 'food' ? s.ingredient.quantity : s.quantity;
const unit = (s: Snapshot) => s.kind === 'food' ? s.ingredient.unit : s.unit;
const name = (s: Snapshot) => s.kind === 'food' ? foodLabel(s.ingredient.food) : s.recipe.name;
function MacroLine({ value }: { value: Nutrition }) { return <Text style={{ fontSize: 12, lineHeight: 19, color: colors.secondary }}>P {display(value.protein)} · C {display(value.carbohydrate)} · F {display(value.fat)} · Fiber {display(value.fiber)} g</Text>; }

export function PlanRow({ plan, onEdit }: { plan: MealPlan; onEdit?: () => void }) {
  const app = useApp(), logged = planIsLogged(plan, app.repo.logs), editing = app.repo.quickEntry.planDraft?.value?.editingId === plan.id, today = dayKey(new Date()), future = plan.date > today;
  return <View testID={`plan-${plan.id}`} style={{ paddingVertical: 12, gap: 5, borderBottomWidth: 1, borderColor: colors.line, opacity: plan.cancelledAt ? .6 : 1 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><View style={{ flex: 1 }}><Text style={styles.foodName}>{plan.name}</Text><Text style={styles.subtitle}>{mealLabel(plan.meal)}{logged ? ' · Logged' : plan.cancelledAt ? ' · Cancelled' : ' · Planned'}</Text></View><Text style={{ fontSize: 20, fontWeight: '600' }}>{display(plan.nutrition.kcal, 0)}<Text style={{ fontSize: 11 }}> kcal</Text></Text></View>
    <MacroLine value={plan.nutrition} />
    <Text numberOfLines={2} style={{ fontSize: 12, color: colors.secondary }}>{plan.items.map(s => `${amount(s)} ${unit(s) === 'servings' ? new D(amount(s)).eq(1) ? 'serving' : 'servings' : unit(s)}${plan.items.length === 1 && name(s) === plan.name ? '' : ` ${name(s)}`}`).join(' · ')}</Text>
    {!logged && !plan.cancelledAt && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {editing ? <Button compact label="Continue plan edit" onPress={() => router.push('/planner')} /> : <Button compact primary label={future ? 'Eat today' : plan.date < today ? `Log to ${plan.date}` : 'Log as eaten'} accessibilityLabel={`Log plan ${plan.name}${future ? ' today' : ''}`} disabled={app.busy} onPress={() => void app.run(() => app.repo.logMealPlan(plan.id, future ? today : undefined), 'Planned meal logged')} />}
      {onEdit && !editing && <TextButton label="Edit plan" accessibilityLabel={`Edit plan ${plan.name}`} disabled={app.busy} onPress={onEdit} />}
      {onEdit && !editing && <TextButton label="Cancel plan" accessibilityLabel={`Cancel plan ${plan.name}`} disabled={app.busy} onPress={() => void app.run(() => app.repo.cancelMealPlan(plan.id), 'Plan cancelled')} />}
    </View>}
    {plan.cancelledAt && <TextButton label="Restore plan" disabled={app.busy} onPress={() => void app.run(() => app.repo.cancelMealPlan(plan.id, false), 'Plan restored')} />}
    {logged && <TextButton label="View eaten food" onPress={() => router.push({ pathname: '/history', params: { date: dayKey(new Date(app.repo.logs.find(l => plan.logIds.includes(l.id) || plan.receipts.some(r => r.ids.includes(l.id)))?.recordedAt ?? plan.date + 'T12:00:00')), scope: 'day' } })} />}
  </View>;
}
export function TodayPlans({ date }: { date: string }) {
  const app = useApp(), plans = pendingPlans(app.repo.mealPlans, date, app.repo.logs);
  if (!plans.length) return null;
  return <View testID="today-plans"><Section title="Planned meals"><TextButton label="Planner" onPress={() => router.push('/planner')} /></Section>{plans.map(p => <PlanRow key={p.id} plan={p} />)}</View>;
}
export function MealPlanner({ recipeId }: { recipeId?: string }) {
  const app = useApp(), { repo } = app, [date, setDate] = useState(() => dayKey(new Date())), [cancelled, setCancelled] = useState(false), [source, setSource] = useState<'recipes' | 'portions' | 'meals' | 'foods'>('recipes'), [query, setQuery] = useState('');
  const [review, setReview] = useState<PlanReview | undefined>(() => {
    if (repo.quickEntry.planDraft?.value) return structuredCopy(repo.quickEntry.planDraft);
    const recipe = repo.recipes.find(r => r.id === recipeId);
    if (!recipe) return undefined;
    return { id: repo.id(), baseId: repo.quickEntry.planDraft?.id, value: { name: recipe.name, dateText: dayKey(new Date()), meal: 'Middag', items: [{ kind: 'recipe', recipe: structuredCopy(recipe), quantity: '1', unit: 'servings' }], amounts: ['1'] } };
  });
  const [choosing, setChoosing] = useState(!review?.value?.items.length);
  const initialReview = useRef(review && recipeId && !repo.quickEntry.planDraft?.value ? review : undefined);
  useEffect(() => { const initial = initialReview.current; if (initial) { initialReview.current = undefined; void app.savePlanDraft(initial).catch(() => setSaveError('Draft could not be saved. Keep this page open and try again.')); } }, [app]);
  const [saving, setSaving] = useState(0), [saveError, setSaveError] = useState('');
  const persist = (next: PlanReview) => {
    setReview(next); setSaving(n => n + 1); setSaveError('');
    void app.savePlanDraft(next).then(ok => { if (!ok) setSaveError('This draft changed. Reopen the planner.'); }).catch(() => setSaveError('Draft could not be saved. Keep this page open and try again.')).finally(() => setSaving(n => n - 1));
  };
  const newReview = (): PlanReview => ({ id: repo.id(), baseId: repo.quickEntry.planDraft?.id, value: { name: '', dateText: date, meal: 'Middag', items: [], amounts: [] } });
  const patch = (changes: Partial<NonNullable<PlanReview['value']>>) => { const next = review ?? newReview(); persist({ ...next, value: { ...next.value!, ...changes } }); };
  const append = (items: Snapshot[], title: string, sourceBatchId?: string) => {
    const next = review ?? newReview(), f = next.value!;
    if (f.sourceBatchId || sourceBatchId && f.items.length) { setSaveError('Keep a saved-portion plan separate so its stock stays accurate. Save this plan first.'); return; }
    setChoosing(false);
    persist({ ...next, value: { ...f, name: f.name || title, items: [...f.items, ...structuredCopy(items)], amounts: [...f.amounts, ...items.map(amount)], sourceBatchId } });
  };
  const addFood = (food: Food) => append([{ kind: 'food', ingredient: { id: repo.id(), food, quantity: '100', unit: food.referenceUnit } }], foodLabel(food));
  const form = review?.value;
  let nutrition: Nutrition | undefined; try { if (form?.items.length) nutrition = plannedNutrition(formItems(form)); } catch { /* Partial input is retained. */ }
  const valid = !!form?.name.trim() && !!nutrition && calendarDaySchema.safeParse(form?.dateText).success;
  const dayPlans = repo.mealPlans.filter(p => p.date === date && (cancelled || !p.cancelledAt));
  const planned = total(pendingPlans(repo.mealPlans, date, repo.logs).map(p => p.nutrition)), eaten = total(repo.logs.filter(l => dayKey(new Date(l.recordedAt)) === date).map(l => l.nutrition)), projected = total([planned, eaten]);
  const monday = addDays(localDate(date), -((localDate(date).getDay() + 6) % 7));
  const matches = query.trim() ? repo.index.search(query, false, 8) : repo.foods.slice(0, 8);
  return <View style={{ gap: 8 }}>
    <Text style={styles.subtitle}>Plan first. Log only what you eat.</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><IconButton name="back" label="Previous planning week" onPress={() => setDate(dayKey(addDays(localDate(date), -7)))} /><Text style={{ fontSize: 21, fontFamily: serif }}>{dateLabel(localDate(date), { month: 'long', year: 'numeric' })}</Text><IconButton name="next" label="Next planning week" onPress={() => setDate(dayKey(addDays(localDate(date), 7)))} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>{Array.from({ length: 7 }, (_, i) => { const d = addDays(monday, i), key = dayKey(d); return <View key={key} style={{ flexGrow: 1, minWidth: 44 }}><Button compact label={`${['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]} ${d.getDate()}`} accessibilityLabel={`Plan ${key}`} selected={date === key} onPress={() => setDate(key)} /></View>; })}</View>
    <View testID="planner-totals" style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 13, gap: 7, marginTop: 4 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{[['Eaten', eaten], ['Planned', planned], ['Projected', projected]].map(([label, v]) => <View key={label as string}><Text style={styles.label}>{label as string}</Text><Text style={{ fontSize: 22, fontWeight: '600' }}>{display((v as Nutrition).kcal, 0)}</Text></View>)}</View><MacroLine value={projected} /><Text style={{ color: colors.secondary, fontSize: 12 }}>kcal · {repo.targetFor(date)?.values.kcal ? `Target ${display(repo.targetFor(date)!.values.kcal, 0)} kcal` : 'No energy target'} · Unknown values stay –</Text></View>
    {form ? <View testID="plan-editor" style={{ paddingVertical: 12, gap: 5, borderBottomWidth: 1, borderColor: colors.line }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>{form.editingId ? 'Edit planned meal' : 'Plan a meal'}</Text>
      <Field compact label="Plan name" value={form.name} onChangeText={name => patch({ name })} maxLength={300} />
      <Field compact label="Planned date · YYYY-MM-DD" value={form.dateText} onChangeText={dateText => patch({ dateText })} maxLength={100} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{meals.map(m => <Button key={m} compact label={mealLabel(m)} selected={form.meal === m} onPress={() => patch({ meal: m })} />)}</View>
      {form.items.map((s, i) => <View key={i} style={[styles.row, { paddingVertical: 5, gap: 8 }]}><View style={{ flex: 1 }}><Text style={{ fontSize: 14 }}>{name(s)}</Text><Text style={styles.subtitle}>{unit(s)}</Text></View><View style={{ width: 90 }}><Field compact label={unit(s) === 'servings' ? 'Servings' : `Amount · ${unit(s)}`} accessibilityLabel={`Planned amount ${i + 1} · ${unit(s)}`} value={form.amounts[i]} selectTextOnFocus keyboardType="decimal-pad" onChangeText={v => patch({ amounts: form.amounts.map((a, n) => n === i ? v : a) })} /></View><IconButton name="close" label={`Remove planned ingredient ${i + 1}`} onPress={() => patch({ items: form.items.filter((_, n) => n !== i), amounts: form.amounts.filter((_, n) => n !== i), sourceBatchId: undefined })} /></View>)}
      {nutrition && <View testID="plan-preview"><Text style={{ fontSize: 23 }}>{display(nutrition.kcal, 0)} kcal</Text><MacroLine value={nutrition} /></View>}
      {form.sourceBatchId && <Text style={styles.subtitle}>Stock is checked when eaten. Planning does not reserve portions.</Text>}
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: saveError ? colors.error : colors.secondary }}>{saveError || (saving ? 'Saving draft…' : repo.quickEntry.planDraft?.id === review?.id && repo.quickEntry.planDraft?.value ? 'Draft saved' : 'Unsaved plan')}</Text>
      <Button label="Save planned meal" primary disabled={!valid || app.busy || !!saving || !!saveError} onPress={() => void app.run(async () => { const p = await repo.saveMealPlan(review!); setDate(p.date); setReview(undefined); setChoosing(false); }, 'Meal planned · nothing logged')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}><TextButton label="Discard plan draft" disabled={app.busy || !!saving} onPress={() => void app.run(async () => { if (await repo.clearPlanDraft(review!)) { setReview(undefined); setSaveError(''); } }, 'Plan draft discarded')} />{!!saveError && <TextButton label="Retry draft save" onPress={() => persist(review!)} />}</View>
    </View> : <Button label="Plan a meal" icon="plus" onPress={() => { setChoosing(true); persist(newReview()); }} />}
    {!!saveError && !form && <Text accessibilityRole="alert" style={{ color: colors.error }}>{saveError}</Text>}
    {form && !choosing && !form.sourceBatchId && <TextButton label="Add more food" onPress={() => setChoosing(true)} />}
    {(choosing || !form && !dayPlans.length) && <>
      {!!form?.items.length && <TextButton label="Done choosing food" onPress={() => setChoosing(false)} />}
      <Section title={form?.items.length ? 'Add to this plan' : 'Choose food'} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{(['recipes', 'portions', 'meals', 'foods'] as const).map(s => <Button key={s} compact label={s === 'recipes' ? 'Recipes' : s === 'portions' ? 'Portions' : s === 'meals' ? 'Usual meals' : 'Foods'} selected={source === s} onPress={() => setSource(s)} />)}</View>
      {source === 'recipes' && <>
        {repo.recipes.filter(r => !repo.quickEntry.libraryHidden?.[`recipe:${r.id}`]).map(r => <SourceRow key={r.id} title={r.name} detail={`${display(recipePortion(r).kcal, 0)} kcal / serving · Your library`} onPress={() => append([{ kind: 'recipe', recipe: r, quantity: '1', unit: 'servings' }], r.name)} />)}
        <Text style={[styles.label, { marginTop: 12 }]}>Meal ideas</Text>{recipeIdeas.map(idea => <SourceRow key={idea.slug} title={idea.name} detail={`${display(recipePortion(idea.recipe).kcal, 0)} kcal / serving`} onPress={() => append([{ kind: 'recipe', recipe: idea.recipe, quantity: '1', unit: 'servings' }], idea.name)} />)}
      </>}
      {source === 'portions' && <>{repo.preparedBatches.filter(b => batchBalance(b, repo.logs).numerator.gt(0)).map(b => <SourceRow key={b.id} title={b.recipe.name} detail={`${display(batchBalance(b, repo.logs).servings.toFixed())} servings left`} onPress={() => append([{ kind: 'recipe', recipe: b.recipe, quantity: '1', unit: 'servings' }], b.recipe.name, b.id)} />)}{!repo.preparedBatches.length && <Text style={styles.subtitle}>No saved portions yet. Prepare a batch from Library or Quick Log.</Text>}</>}
      {source === 'meals' && <>{repo.shortcuts.filter(s => !s.deletedAt).map(s => <SourceRow key={s.id} title={s.name} detail={`${s.entries.length} foods · Saved shortcut`} onPress={() => { if (s.entries.some(e => e.preparedBatchId)) { setSaveError('Choose saved batches from Portions so stock stays accurate.'); return; } append(s.entries.map(e => e.snapshot), s.name); }} />)}{!!repo.draft.lines.length && <SourceRow title="Current Quick Log meal" detail="Use resolved ingredients; keep the original draft" onPress={() => { try { append(repo.draft.lines.map(l => ({ kind: 'food', ingredient: lineIngredient(l) })), 'Planned meal'); } catch { setSaveError('Resolve every Quick Log ingredient before planning it.'); } }} />}{!repo.shortcuts.some(s => !s.deletedAt) && !repo.draft.lines.length && <Text style={styles.subtitle}>Your saved meal shortcuts and current Quick Log meal appear here.</Text>}</>}
      {source === 'foods' && <><Field label="Find a food to plan" value={query} onChangeText={setQuery} placeholder="English or Norwegian" />{matches.map(f => <SourceRow key={f.id} title={foodLabel(f)} detail={`${display(snapshotNutrition({ kind: 'food', ingredient: { id: 'preview', food: f, quantity: '100', unit: f.referenceUnit } }).kcal, 0)} kcal / 100 ${f.referenceUnit}`} onPress={() => addFood(f)} />)}{!matches.length && <Text style={styles.subtitle}>Search for a food or choose a recipe.</Text>}</>}
    </>}
    <Section title={date === dayKey(new Date()) ? 'Today’s plan' : dateLabel(localDate(date), { weekday: 'long', day: 'numeric', month: 'short' })} />
    {!dayPlans.length && <Text style={styles.subtitle}>No meals planned for this day.</Text>}
    {dayPlans.map(p => <PlanRow key={p.id} plan={p} onEdit={() => { if (review?.value) { setSaveError('Save or discard the open draft before editing another plan.'); return; } persist({ id: repo.id(), baseId: repo.quickEntry.planDraft?.id, value: { editingId: p.id, name: p.name, dateText: p.date, meal: p.meal, items: structuredCopy(p.items), amounts: p.items.map(amount), sourceBatchId: p.sourceBatchId } }); }} />)}
    <TextButton label={cancelled ? 'Hide cancelled plans' : 'Show cancelled plans'} onPress={() => setCancelled(!cancelled)} />
  </View>;
}
function SourceRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={`Plan ${title}`} onPress={onPress} style={({ pressed }) => [styles.row, { paddingVertical: 10, backgroundColor: pressed ? colors.pressed : 'transparent' }]}><View style={{ flex: 1 }}><Text style={styles.foodName}>{title}</Text><Text style={styles.subtitle}>{detail}</Text></View><Text style={{ color: colors.action, fontSize: 24 }}>+</Text></Pressable>; }
