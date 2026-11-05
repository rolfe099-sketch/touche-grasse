import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { dayKey, display, logName, logQuantity, total } from '../../src/domain/model';
import { historyIndex } from '../../src/domain/history';
import { batchBalance } from '../../src/domain/portions';
import { dateLabel, mealLabel, plural } from '../../src/i18n';
import { useApp } from '../../src/state/AppContext';
import { Button, IconButton, Screen, Section, styles, TextButton } from '../../src/ui/components';
import { Text } from '../../src/ui/Text';
import { Icon } from '../../src/ui/Icon';
import { DayStrip } from '../../src/ui/DayStrip';
import { colors, numeric } from '../../src/ui/theme';
import { DailyNutrition } from '../../src/ui/DailyNutrition';
import { Diary } from '../../src/ui/Diary';
import { CalendarPicker } from '../../src/ui/Calendar';
import { TargetEditor } from '../../src/ui/Targets';
import { targetOn } from '../../src/domain/targets';
import { RepeatMealReview } from '../../src/ui/RepeatMealReview';
import { MealCorrectionHistory } from '../../src/ui/MealEditor';
import { MealShortcuts } from '../../src/ui/MealShortcuts';
import { DayCompletion } from '../../src/ui/DayCompletion';
import { frequentMealBatches } from '../../src/domain/quickEntry';

export default function Today() {
  const app = useApp(), { repo, draft, busy, run } = app;
  const [editingTargets, setEditingTargets] = useState(false);
  const [date, setDate] = useState(() => new Date()), [picker, setPicker] = useState(false);
  const index = useMemo(() => historyIndex(repo.logs, repo.dayReviews), [repo.logs, repo.dayReviews]);
  const day = index.byDay.get(dayKey(date)), logs = day?.entries ?? [];
  const isToday = dayKey(date) === dayKey(new Date()), nutrition = total(logs.map(log => log.nutrition));
  const recent = [...new Map(repo.logs.map(log => [(log.snapshot.kind === 'food' ? log.snapshot.ingredient.food.id : log.snapshot.recipe.id) + logQuantity(log), log])).values()].slice(0, 3);
  const usual = useMemo(() => frequentMealBatches(repo.logs), [repo.logs]);
  const portions = repo.preparedBatches.filter(batch => batchBalance(batch, repo.logs).numerator.gt(0)).slice(-2).reverse();
  const loggedDays = useMemo(() => new Set(index.byDay.keys()), [index]);
  const openLog = (mode?: 'voice' | 'scan') => router.push({ pathname: '/entry', params: { date: dayKey(date), ...(mode ? { mode } : {}) } });
  return <Screen support title="Today" header={<>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose date" onPress={() => setPicker(true)} style={({ pressed }) => ({ flex: 1, minHeight: 54, opacity: pressed ? .6 : 1 })}>
      <Text accessibilityRole="header" style={styles.title}>{isToday ? 'Today' : dateLabel(date, { weekday: 'long' })}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={{ fontSize: 14, color: colors.secondary }}>{dateLabel(date, { weekday: 'short', day: 'numeric', month: 'long' })}</Text><Icon name="calendar" size={12} color={colors.secondary} /></View>
    </Pressable>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}><IconButton name="settings" label="Your data and settings" onPress={() => router.push('/settings')} /></View>
  </>}>
    <DayStrip date={date} loggedDays={loggedDays} onSelect={setDate} />
    <DailyNutrition complete={day?.complete} targets={targetOn(repo.targets, dayKey(date))?.values} onTargets={isToday ? () => setEditingTargets(!editingTargets) : undefined} value={nutrition} entries={logs.length} meals={day?.meals ?? 0} onTrend={() => router.push({ pathname: '/history', params: { date: dayKey(date), scope: 'week' } })} />
    <MealShortcuts onLogged={() => setDate(new Date())} />
    {editingTargets && isToday && <TargetEditor onClose={() => setEditingTargets(false)} />}
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 4, paddingLeft: 12, gap: 3, borderRadius: 9, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={repo.quickEntry.mealEdit ? 'Continue meal edit' : repo.quickEntry.repeatReview ? 'Continue adjusted repeat' : draft.lines.length || draft.text ? 'Continue your meal' : 'Log food'} testID="today-add" onPress={() => openLog()} style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', opacity: pressed ? .6 : 1 })}><Text style={{ fontSize: 16 }}>{repo.quickEntry.mealEdit ? 'Continue meal edit' : repo.quickEntry.repeatReview ? 'Continue adjusted repeat…' : draft.lines.length || draft.text ? 'Continue your meal…' : 'What did you eat?'}</Text><Text style={{ color: colors.secondary, fontSize: 13 }}>{repo.quickEntry.mealEdit ? 'Ingredient changes saved in your draft' : repo.quickEntry.repeatReview ? `${repo.quickEntry.repeatReview.entries.length} saved amounts to review` : draft.lines.length ? `${draft.lines.length} ingredients in your draft` : 'Type a meal or use your voice'}</Text></Pressable>
      <IconButton name="mic" label="Log with voice" disabled={!!repo.quickEntry.repeatReview} filled onPress={() => openLog('voice')} /><IconButton name="camera" label="Scan food" disabled={!!repo.quickEntry.repeatReview} onPress={() => openLog('scan')} />
    </View>
    <RepeatMealReview onLogged={() => setDate(new Date())} />
    {!!portions.length && <View testID="today-portions"><Section title="Ready to eat"><TextButton label="All portions" onPress={() => router.push('/recipes')} /></Section><View style={{ borderRadius: 10, borderWidth: 0, borderColor: colors.line, overflow: 'hidden', backgroundColor: colors.surface }}>{portions.map((batch, i) => <View key={batch.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 9, gap: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
      <View style={{ width: 43, height: 48, borderRadius: 3, backgroundColor: colors.orangeWash, borderWidth: 1, borderColor: colors.edge, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.action, fontSize: 21, fontFamily: numeric, fontVariant: ['tabular-nums'] }}>{display(batchBalance(batch, repo.logs).servings.toFixed(), 1)}</Text><Text style={{ color: colors.secondary, fontSize: 11, fontFamily: numeric, marginTop: -1 }}>LEFT</Text></View>
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600' }}>{batch.recipe.name}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{display(batchBalance(batch, repo.logs).servings.toFixed(), 2)} servings left</Text></View>
      <Button label="Log 1" icon="plus" compact primary accessibilityLabel={`Log one saved serving of ${batch.recipe.name}`} disabled={busy || batchBalance(batch, repo.logs).servings.lt(1)} onPress={() => void run(() => repo.logPreparedBatch(batch.id), 'One saved serving logged').then(ok => { if (ok) setDate(new Date()); })} />
    </View>)}</View></View>}
    {!!usual.length && <View testID="frequent-meals" style={{ marginTop: 15 }}><Text style={[styles.label, { marginBottom: 7 }]}>Your usual meals</Text><View style={{ flexDirection: 'row', gap: 8 }}>{usual.map((batch, i) => <View key={batch[0].batchId} style={{ flex: 1 }}><Pressable testID="repeat-meal" accessibilityRole="button" accessibilityLabel={`Repeat ${mealLabel(batch[0].meal)} meal`} disabled={busy} onPress={() => void run(() => repo.repeatMeal(batch.map(log => log.id)), 'Whole meal logged for today').then(ok => { if (ok) setDate(new Date()); })} style={({ pressed }) => ({ minHeight: 66, borderWidth: 1, borderRadius: 6, borderColor: colors.line, padding: 11, backgroundColor: pressed ? colors.pressed : colors.surface, opacity: busy ? 0.4 : 1 })}><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600' }}>↻ {mealLabel(batch[0].meal)} · {plural(batch.length, 'food')}</Text><Text numberOfLines={1} style={{ fontSize: 11, color: colors.secondary }}>{batch.map(logName).join(', ')}</Text><Text style={{ fontSize: 11, color: colors.secondary }}>{display(total(batch.map(log => log.nutrition)).kcal, 0)} kcal</Text></Pressable><TextButton label="Adjust" accessibilityLabel={`Adjust usual meal ${i + 1}`} disabled={busy || !!repo.quickEntry.repeatReview} onPress={() => void run(() => repo.startRepeatReview(batch.map(log => log.id)))} /></View>)}</View></View>}
    <Section title="Meal journal">{(!app.notice || !app.noticeUndo) && !!repo.undo.length ? <TextButton label={repo.undoLabel} disabled={busy} onPress={() => void run(() => repo.undoLast(), repo.undoNotice)} /> : <Text style={{ color: colors.secondary, fontSize: 12 }}>{dateLabel(date, { weekday: 'short' })}</Text>}</Section>
    {!logs.length && <View style={{ paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}><Text style={{ fontSize: 16, fontWeight: '600' }}>No meals logged</Text><Text style={{ fontSize: 13, color: colors.secondary, marginTop: 4 }}>Add food with the Log button below.</Text></View>}
    <Diary entries={logs} compact />
    <DayCompletion date={dayKey(date)} />
    <MealCorrectionHistory date={dayKey(date)} />
    <TextButton label="Log weight" onPress={() => router.push({ pathname: '/history', params: { view: 'weight', editWeight: '1', date: dayKey(date), scope: 'week' } })} />
    {!!recent.length && !logs.length && <><Section title="Recent food"><TextButton label="History →" onPress={() => router.push('/history')} /></Section>{recent.map(log => <View key={log.id} testID="recent-row" style={[styles.row, { paddingVertical: 8 }]}><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.foodName, { fontSize: 14 }]}>{logName(log)}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{logQuantity(log)} · {display(log.nutrition.kcal, 0)} kcal</Text></View><IconButton name="repeat" label={`Log ${logName(log)} again`} disabled={busy} onPress={() => void run(() => repo.repeat(log), 'Logged for today')} /></View>)}</>}
    {!isToday && <TextButton label="Today" onPress={() => setDate(new Date())} />}
    <CalendarPicker visible={picker} selected={date} index={index} firstUsedAt={repo.profile.firstUsedAt} onSelect={setDate} onClose={() => setPicker(false)} />
  </Screen>;
}
