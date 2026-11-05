import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { D, dayKey, display } from '../domain/model';
import { addDays, daysInPeriod, localDate, periodSummary, HistoryIndex, Scope } from '../domain/history';
import { WeighIn, WeightUnit, weightKg, weightTrend, weightValue } from '../domain/weight';
import { useApp } from '../state/AppContext';
import { Button, Field, IconButton, Section, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';
import { dateLabel } from '../i18n';

function WeightChart({ values, unit, start, end }: { values: WeighIn[]; unit: WeightUnit; start?: string; end?: string }) {
  const points = values.slice(-90), numbers = points.map(value => Number(weightValue(value.kg, unit)));
  if (!points.length) return null;
  const min = Math.min(...numbers), max = Math.max(...numbers), span = max - min, y = (value: number) => span ? 110 - ((value - min) / span) * 85 : 65;
  const first = start ?? points[0].id, last = end ?? points[points.length - 1].id;
  const calendarDay = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86400000;
  const x = (key: string) => first === last ? 170 : 12 + (calendarDay(key) - calendarDay(first)) / (calendarDay(last) - calendarDay(first)) * 316;
  return <View testID="weight-chart" accessibilityLabel="Recorded weight chart. Individual dates and values are listed below." style={{ marginTop: 12 }}>
    <Svg width="100%" height={140} viewBox="0 0 340 140" accessible={false}>
      <Line x1={10} x2={330} y1={120} y2={120} stroke={colors.line} />
      {points.map((point, index) => <Circle key={point.id} cx={x(point.id)} cy={y(numbers[index])} r={4} fill={colors.action} />)}
      {points.slice(1).map((point, index) => dayKey(addDays(localDate(points[index].id), 1)) === point.id ? <Line key={point.id} x1={x(points[index].id)} y1={y(numbers[index])} x2={x(point.id)} y2={y(numbers[index + 1])} stroke={colors.action} strokeWidth={1.5} /> : null)}
    </Svg>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 11, color: colors.secondary }}>{first}</Text><Text style={{ fontSize: 11, color: colors.secondary }}>{display(String(min), 2)}{min !== max ? `–${display(String(max), 2)}` : ''} {unit}</Text><Text style={{ fontSize: 11, color: colors.secondary }}>{first === last ? '' : last}</Text></View>
    <Text style={{ fontSize: 12, color: colors.secondary, marginTop: 7 }}>Dots are recorded weigh-ins. Gaps are not filled.{values.length > 90 ? ' Chart shows the latest 90 readings in this period.' : ''}</Text>
  </View>;
}

export function WeightPanel({ date, scope, onDateSaved, autoEntry = false, onEntryConsumed }: { date: Date; scope: Scope; onDateSaved: (date: Date) => void; autoEntry?: boolean; onEntryConsumed?: () => void }) {
  const app = useApp(), end = dayKey(scope === 'all' ? new Date() : date), [unit, setUnit] = useState<WeightUnit>(app.repo.quickEntry.weightDraft?.unit ?? app.repo.quickEntry.weightUnit ?? 'kg');
  const [editing, setEditing] = useState(!!app.repo.quickEntry.weightDraft), [entryDate, setEntryDate] = useState(app.repo.quickEntry.weightDraft?.date ?? end), [amount, setAmount] = useState(app.repo.quickEntry.weightDraft?.amount ?? ''), [deleted, setDeleted] = useState(false), [limit, setLimit] = useState(10);
  const values = app.repo.weighIns, trend = useMemo(() => weightTrend(values, end), [values, end]);
  const dates = scope === 'all' ? null : new Set(daysInPeriod(date, scope).map(dayKey));
  const period = values.filter(value => dates ? dates.has(value.id) : value.id <= end).sort((a, b) => b.id.localeCompare(a.id));
  const rows = period.filter(value => deleted ? !!value.deletedAt : !value.deletedAt);
  const latest = values.filter(value => !value.deletedAt && value.id <= end).sort((a, b) => b.id.localeCompare(a.id))[0];
  const [error, setError] = useState(''), [focusEntry, setFocusEntry] = useState(false), entryStarted = useRef(false);
  const retainedDraft = app.repo.quickEntry.weightDraft;
  useEffect(() => {
    if (!editing && retainedDraft) { setEntryDate(retainedDraft.date); setAmount(retainedDraft.amount); setUnit(retainedDraft.unit); setEditing(true); }
  }, [retainedDraft, editing]);
  useEffect(() => {
    if (!autoEntry) { entryStarted.current = false; return; }
    if (entryStarted.current) return;
    entryStarted.current = true;
    const current = app.repo.weighIns.find(value => value.id === end && !value.deletedAt);
    const input = app.repo.quickEntry.weightDraft ?? { date: end, amount: current ? new D(weightValue(current.kg, unit)).toDecimalPlaces(6).toFixed() : '', unit };
    setEntryDate(input.date); setAmount(input.amount); setUnit(input.unit); setEditing(true); setFocusEntry(true); setError('');
    void app.saveWeightDraft(input).catch(() => setError('Could not save this weight draft. Save will retry.'));
    onEntryConsumed?.();
  }, [autoEntry, end, unit, onEntryConsumed, app]);
  function draft(nextDate: string, nextAmount: string, nextUnit = unit) { setEntryDate(nextDate); setAmount(nextAmount); setUnit(nextUnit); setError(''); void app.saveWeightDraft({ date: nextDate, amount: nextAmount, unit: nextUnit }).catch(() => setError('Could not save this weight draft. Save will retry.')); }
  function switchUnit(next: WeightUnit) { if (next === unit) return; if (!editing) { setUnit(next); return; } try { draft(entryDate, amount.trim() ? new D(weightValue(weightKg(amount, unit), next)).toDecimalPlaces(6).toFixed() : '', next); } catch { setError('Finish the weight value before changing units.'); } }
  function edit(value?: WeighIn) { draft(value?.id ?? end, value ? new D(weightValue(value.kg, unit)).toDecimalPlaces(6).toFixed() : ''); setEditing(true); setFocusEntry(true); }
  return <View testID="weight-panel">
    <Section title="Weight"><View style={{ flexDirection: 'row', gap: 14 }}><TextButton label="kg" accessibilityLabel="Display weight in kilograms" disabled={app.busy} onPress={() => switchUnit('kg')} /><TextButton label="lb" accessibilityLabel="Display weight in pounds" disabled={app.busy} onPress={() => switchUnit('lb')} /></View></Section>
    <View style={{ flexDirection: 'row', gap: 15, paddingVertical: 10 }}><View style={{ flex: 1 }}><Text style={{ fontSize: 12, color: colors.secondary }}>Latest recorded</Text><Text testID="weight-latest" style={{ fontSize: 28, fontWeight: '600' }}>{latest ? display(weightValue(latest.kg, unit), 2) : '–'} <Text style={{ fontSize: 13 }}>{unit}</Text></Text><Text style={{ fontSize: 11, color: colors.secondary }}>{latest?.id ?? 'No weigh-ins yet'}</Text></View><View style={{ flex: 1 }}><Text style={{ fontSize: 12, color: colors.secondary }}>7-day mean</Text><Text testID="weight-mean" style={{ fontSize: 28, fontWeight: '600' }}>{trend.current.mean ? display(weightValue(trend.current.mean, unit), 2) : '–'} <Text style={{ fontSize: 13 }}>{unit}</Text></Text><Text style={{ fontSize: 11, color: colors.secondary }}>{trend.current.count} readings · to {dateLabel(localDate(end), { day: 'numeric', month: 'short' })}</Text></View></View>
    <Text testID="weight-change" style={{ color: colors.secondary, fontSize: 12 }}>{trend.change !== null ? `${new D(trend.change).gte(0) ? '+' : ''}${display(weightValue(trend.change, unit), 2)} ${unit} between adjacent 7-day means (${trend.previous.count} vs ${trend.current.count} readings).` : 'A mean needs at least two weigh-ins in its seven-day window. Missing days are excluded; no weight is estimated.'}</Text>
    {!editing && <TextButton label="Log weight" disabled={app.busy} onPress={() => edit(values.find(value => value.id === end && !value.deletedAt))} />}
    {editing && <View testID="weight-editor" style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field compact editable={!app.busy} label="Weigh-in date (YYYY-MM-DD)" value={entryDate} onChangeText={value => draft(value, amount)} maxLength={10} /></View><View style={{ flex: 1 }}><Field compact autoFocus={focusEntry} editable={!app.busy} label={`Weight · ${unit}`} value={amount} onChangeText={value => draft(entryDate, value)} maxLength={20} keyboardType="decimal-pad" selectTextOnFocus /></View></View><View style={{ flexDirection: 'row', gap: 16 }}><Button compact primary label="Save weigh-in" disabled={app.busy || !amount.trim()} onPress={() => void app.run(() => app.repo.saveWeighIn(entryDate, amount, unit), 'Weigh-in saved').then(ok => { if (ok) { setEditing(false); setError(''); onDateSaved(localDate(entryDate)); } })} /><TextButton label="Cancel weigh-in" disabled={app.busy} onPress={() => void app.run(() => app.repo.saveWeightDraft(null)).then(ok => { if (ok) { setEditing(false); setError(''); } })} /></View></View>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 12 }}>{error}</Text>}
    <WeightChart start={dates ? [...dates][0] : undefined} end={dates ? [...dates][dates.size - 1] : undefined} values={[...period].filter(value => !value.deletedAt).reverse()} unit={unit} />
    <Section title={deleted ? 'Deleted weigh-ins' : 'Recorded weigh-ins'}><TextButton label={deleted ? 'Show recorded' : 'Deleted'} accessibilityLabel="Toggle deleted weigh-ins" onPress={() => { setDeleted(!deleted); setLimit(10); }} /></Section>
    {!rows.length && <Text style={{ fontSize: 13, color: colors.secondary }}>No {deleted ? 'deleted' : 'recorded'} weigh-ins in this period.</Text>}
    {rows.slice(0, limit).map(value => <View key={value.id} testID="weigh-in-row" style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, minHeight: 48, gap: 8 }}><Text style={{ flex: 1, fontSize: 13 }}>{value.id}</Text><Text style={{ fontWeight: '600' }}>{display(weightValue(value.kg, unit), 2)} {unit}</Text>{value.deletedAt ? <TextButton label="Restore" accessibilityLabel={`Restore weigh-in ${value.id}`} disabled={app.busy} onPress={() => void app.run(() => app.repo.deleteWeighIn(value.id, false), 'Weigh-in restored')} /> : <><TextButton label="Edit" accessibilityLabel={`Edit weigh-in ${value.id}`} disabled={app.busy} onPress={() => edit(value)} /><IconButton name="trash" label={`Delete weigh-in ${value.id}`} destructive disabled={app.busy} onPress={() => void app.run(() => app.repo.deleteWeighIn(value.id), 'Weigh-in deleted · restore it under Deleted')} /></>}</View>)}
    {rows.length > limit && <TextButton label="Show more weigh-ins" onPress={() => setLimit(limit + 20)} />}
  </View>;
}

export function WeeklySummary({ index, date }: { index: HistoryIndex; date: Date }) {
  const current = periodSummary(index, daysInPeriod(date, 'week')), previous = periodSummary(index, daysInPeriod(addDays(date, -7), 'week'));
  const comparable = current.completeDays >= 3 && previous.completeDays >= 3;
  return <View testID="weekly-summary" style={{ borderTopWidth: 1, borderColor: colors.line, paddingVertical: 10 }}><Text style={{ fontSize: 15, fontWeight: '600' }}>Weekly summary</Text><Text style={{ fontSize: 12, color: colors.secondary, marginTop: 4 }}>{current.completeDays} complete days this week · {previous.completeDays} last week. Partial days are excluded.</Text>{comparable ? <View>{(['kcal', 'protein', 'fiber'] as const).map(key => { const a = current.completeAverage?.[key], b = previous.completeAverage?.[key], delta = a != null && b != null ? new D(a).minus(b) : null; return <Text key={key} style={{ fontSize: 13, marginTop: 5 }}>{({ kcal: 'Energy', protein: 'Protein', fiber: 'Fiber' })[key]}: {a == null ? 'unknown' : `${display(a, key === 'kcal' ? 0 : 1)} ${key === 'kcal' ? 'kcal' : 'g'} / complete day`}{delta !== null ? ` (${delta.gte(0) ? '+' : ''}${display(delta.toFixed(), key === 'kcal' ? 0 : 1)} vs last week)` : ' · comparison unavailable'}</Text>; })}</View> : <Text style={{ fontSize: 12, color: colors.secondary, marginTop: 4 }}>A comparison appears after at least three complete days in each week.</Text>}</View>;
}
