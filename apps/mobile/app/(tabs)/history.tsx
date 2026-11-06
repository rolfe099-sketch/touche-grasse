import { useEffect, useMemo, useState } from 'react';

import { Pressable, View } from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';

import { D, dayKey, display, Nutrition } from '../../src/domain/model';

import { addDays, daysInPeriod, historyIndex, localDate, monthlyTrend, periodSummary, Scope, shiftMonth } from '../../src/domain/history';

import { dateLabel, plural, t } from '../../src/i18n';

import { useApp } from '../../src/state/AppContext';

import { Button, SegmentButton, IconButton, NutritionView, Screen, Section, styles, TextButton } from '../../src/ui/components';

import { Text } from '../../src/ui/Text';

import { colors } from '../../src/ui/theme';

import { CalendarGrid, CalendarPicker } from '../../src/ui/Calendar';

import { Diary } from '../../src/ui/Diary';

import { ChartPoint, IntakeChart } from '../../src/ui/IntakeChart';

import { Reveal } from '../../src/ui/Motion';
import { WeightPanel, WeeklySummary } from '../../src/ui/WeightPanel';
import { MealCorrectionHistory } from '../../src/ui/MealEditor';
import { DayCompletion } from '../../src/ui/DayCompletion';
import { TargetSummary } from '../../src/ui/Targets';




const unknown: Nutrition = { kcal: null, protein: null, carbohydrate: null, fat: null };

export default function History() {

  const app = useApp(), params = useLocalSearchParams<{ date?: string; scope?: Scope; view?: string; editWeight?: string }>();

  const validScope = (value?: string): value is Scope => ['day', 'week', 'month', 'all'].includes(value ?? '');

  const [scope, setScope] = useState<Scope>(validScope(params.scope) ? params.scope : params.date ? 'day' : 'week');

  const [date, setDate] = useState(() => { try { return params.date ? localDate(params.date) : new Date(); } catch { return new Date(); } });

  const [view, setView] = useState<'intake' | 'weight'>(params.view === 'weight' ? 'weight' : 'intake');
  useEffect(() => { if (params.view === 'weight') setView('weight'); }, [params.view]);
  const [completeOnly, setCompleteOnly] = useState(true);
  const [picker, setPicker] = useState(false), [metric, setMetric] = useState<keyof Nutrition>('kcal');

  useEffect(() => { if (params.date) { try { const next = localDate(params.date); setDate(current => dayKey(current) === dayKey(next) ? current : next); setScope(validScope(params.scope) ? params.scope : 'day'); } catch { /* Keep the selected period if a link is malformed. */ } } }, [params.date, params.scope]);

  useEffect(() => { if (params.date !== dayKey(date) || params.scope !== scope) router.setParams({ date: dayKey(date), scope }); }, [date, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const index = useMemo(() => historyIndex(app.repo.logs, app.repo.dayReviews), [app.repo.logs, app.repo.dayReviews]);

  const dates = scope === 'all' ? index.days.map(d => d.date) : daysInPeriod(date, scope);

  const summary = periodSummary(index, dates), day = index.byDay.get(dayKey(date));

  const previousMonth = periodSummary(index, daysInPeriod(shiftMonth(date, -1), 'month'));

  const average = completeOnly ? summary.completeAverage : summary.average;
  const previousAverage = completeOnly ? previousMonth.completeAverage : previousMonth.average;
  const count = completeOnly ? summary.completeDays : summary.loggedDays;
  const previousCount = completeOnly ? previousMonth.completeDays : previousMonth.loggedDays;
  const denominator = completeOnly ? 'complete day' : 'logged day';
  function selectDay(value: Date) { setDate(value); setScope('day'); }

  function move(delta: number) { setDate(scope === 'month' ? shiftMonth(date, delta) : addDays(date, delta * (scope === 'week' ? 7 : 1))); }

  const title = scope === 'day' ? dateLabel(date, { day: 'numeric', month: 'short', year: 'numeric' }) : scope === 'month' ? dateLabel(date, { month: 'long', year: 'numeric' }) : scope === 'week' ? `${dateLabel(dates[0], { day: 'numeric', month: 'short' })} – ${dateLabel(dates[6], { day: 'numeric', month: 'short', year: 'numeric' })}` : `Since ${dateLabel(new Date(app.repo.profile.firstUsedAt))}`;

  const points: ChartPoint[] = scope === 'all' ? monthlyTrend(index, completeOnly).map(point => ({ key: dayKey(point.date), label: dateLabel(point.date, { month: 'short' }), fullLabel: dateLabel(point.date, { month: 'long', year: 'numeric' }), nutrition: point.average, detail: `${plural(point.days, denominator)} · average per ${denominator}` })) : dates.map(d => {

    const record = index.byDay.get(dayKey(d));

    return { key: dayKey(d), label: scope === 'week' ? dateLabel(d, { weekday: 'short' }).slice(0, 1) : String(d.getDate()), fullLabel: dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short' }), nutrition: record?.nutrition ?? null, detail: record ? `${record.complete ? 'Complete' : 'Partial'} · ${plural(record.entries.length, 'entry', 'entries')}` : dayKey(d) < dayKey(new Date(app.repo.profile.firstUsedAt)) ? 'Before tracking began' : 'No entries · intake is unknown' };

  });

  return <Screen support testID="history-screen" title="History" trailing={<IconButton name="calendar" label="Choose history date" onPress={() => setPicker(true)} />}>

    <View style={{ flexDirection: 'row', marginBottom: 6 }}><SegmentButton label="Intake" selected={view === 'intake'} onPress={() => { setView('intake'); router.setParams({ view: undefined }); }} /><SegmentButton label="Weight" selected={view === 'weight'} onPress={() => { setView('weight'); router.setParams({ view: 'weight' }); }} /></View>
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4, marginBottom: 15 }}>

      {(['day', 'week', 'month', 'all'] as const).map(value => <SegmentButton key={value} label={t(value)} selected={scope === value} onPress={() => setScope(value)} />)}

    </View>

    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line, paddingBottom: 9 }}>

      {scope !== 'all' && <IconButton name="back" label={`Previous ${scope}`} onPress={() => move(-1)} />}

      <Pressable accessibilityRole="button" accessibilityLabel="Open history calendar" onPress={() => setPicker(true)} style={{ minHeight: 44, flex: 1, alignItems: scope === 'all' ? 'flex-start' : 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '600', fontSize: 16 }}>{title}</Text></Pressable>

      {scope !== 'all' && <IconButton name="next" label={`Next ${scope}`} onPress={() => move(1)} />}

    </View>

    {view === 'intake' && scope !== 'day' && <View style={{ flexDirection: 'row', marginTop: 8 }}><SegmentButton label="Complete days" selected={completeOnly} onPress={() => setCompleteOnly(true)} /><SegmentButton label="All recorded days" selected={!completeOnly} onPress={() => setCompleteOnly(false)} /></View>}
    {view === 'weight' && <WeightPanel key={`${scope}:${dayKey(date)}`} date={date} scope={scope} onDateSaved={setDate} autoEntry={params.editWeight === '1' && (!params.date || params.date === dayKey(date)) && (!params.scope || params.scope === scope)} onEntryConsumed={() => router.setParams({ editWeight: undefined })} />}
    {view === 'intake' && <Reveal trigger={`${scope}:${title}`}>

      {scope === 'day' && <>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 17 }}><Text style={styles.label}>{dateLabel(date, { weekday: 'long' })}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{day ? `${plural(day.meals, 'meal')} · ${plural(day.entries.length, 'entry', 'entries')}` : 'No entries'}</Text></View>

        <NutritionView value={day?.nutrition ?? unknown} large empty={!day} />
        <TextButton label="Log food for this day" disabled={dayKey(date) > dayKey(new Date()) || app.busy} onPress={() => router.push({ pathname: '/entry', params: { date: dayKey(date) } })} />
        <DayCompletion date={dayKey(date)} />
        <MealCorrectionHistory date={dayKey(date)} />
        <TargetSummary change={app.repo.targetFor(dayKey(date))} />

        {day ? <Diary entries={day.entries} /> : <View style={{ paddingVertical: 20, borderTopWidth: 1, borderColor: colors.line, gap: 10 }}><Text style={{ fontSize: 19, fontWeight: '600' }}>{dayKey(date) < dayKey(new Date(app.repo.profile.firstUsedAt)) ? 'Before your tracking began' : 'No food recorded on this day'}</Text><Text style={styles.subtitle}>An empty diary tells us nothing about what you ate. It is excluded from intake averages.</Text></View>}

      </>}

      {(scope === 'week' || scope === 'month') && <>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}><Text style={styles.label}>Average per {denominator}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{count} of {summary.possibleDays} days</Text></View>

        <NutritionView value={average ?? unknown} caption={`kcal / ${denominator}`} empty={!average} />

        <Text style={[styles.subtitle, { fontSize: 12, marginBottom: 15 }]}>{summary.completeDays} complete · {summary.partialDays} partial. {completeOnly ? 'Partial and unrecorded days are excluded. Mark a day complete in its diary.' : 'Partial days are included; these averages may understate intake.'}</Text>

        {scope === 'month' && <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingTop: 8, paddingBottom: 13 }}><CalendarGrid month={date} selected={date} index={index} firstUsedAt={app.repo.profile.firstUsedAt} onSelect={selectDay} /><Text style={{ fontSize: 12, color: colors.secondary, marginTop: 8 }}>Shaded days are recorded or reviewed. Tap a date to open its diary.</Text></View>}

        {scope === 'week' && <WeeklySummary index={index} date={date} />}
        <Section title="Daily intake" />

        <IntakeChart points={points} metric={metric} onMetric={setMetric} onOpen={key => selectDay(localDate(key))} />

        {scope === 'week' && <View style={{ marginTop: 16 }}>{dates.map(d => { const item = index.byDay.get(dayKey(d)); return <Pressable key={dayKey(d)} accessibilityRole="button" accessibilityLabel={`Open diary ${dayKey(d)}`} onPress={() => selectDay(d)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 50, borderBottomWidth: 1, borderColor: colors.line, opacity: pressed ? 0.5 : 1 })}><Text style={{ width: 40, fontWeight: '600' }}>{dateLabel(d, { weekday: 'short' })}</Text><Text style={{ flex: 1, color: colors.secondary, fontSize: 13 }}>{item ? `${item.complete ? 'Complete' : 'Partial'} · ${plural(item.entries.length, 'entry', 'entries')}` : 'No entries'}</Text><Text style={{ fontWeight: item ? '600' : '400', color: item ? colors.ink : colors.secondary }}>{item ? `${display(item.nutrition.kcal, 0)} kcal` : '–'}</Text></Pressable>; })}</View>}

        {scope === 'month' && <View style={{ marginTop: 22, paddingVertical: 15, borderTopWidth: 1, borderColor: colors.line }}><Text style={{ fontWeight: '600', marginBottom: 6 }}>Monthly comparison</Text>

          {count >= 3 && previousCount >= 3 && average?.kcal != null && previousAverage?.kcal != null ? <Text style={styles.subtitle}>{dateLabel(date, { month: 'short' })}: {display(average!.kcal, 0)} kcal vs {dateLabel(shiftMonth(date, -1), { month: 'short' })}: {display(previousAverage!.kcal, 0)} kcal per {denominator}. Difference: {new D(average!.kcal!).minus(previousAverage!.kcal!).gte(0) ? '+' : ''}{display(new D(average!.kcal!).minus(previousAverage!.kcal!).toFixed(), 0)} kcal ({count} vs {previousCount} {denominator}s).</Text> : <Text style={styles.subtitle}>A comparison appears when both months have known energy values and at least three {denominator}s each.</Text>}

        </View>}

      </>}

      {scope === 'all' && <>

        <View style={{ flexDirection: 'row', marginTop: 24, paddingBottom: 22, borderBottomWidth: 1, borderColor: colors.line }}>

          {[{ value: index.meals, label: 'meals recorded', color: colors.toffee }, { value: index.days.filter(day => day.entries.length).length, label: 'days with entries', color: colors.ocean }].map(item => <View key={item.label} style={{ flex: 1, borderLeftWidth: 3, borderColor: item.color, paddingLeft: 13 }}><Text style={{ fontSize: 40, fontWeight: '600', lineHeight: 45 }}>{item.value}</Text><Text style={styles.subtitle}>{item.label}</Text></View>)}

        </View>

        <View style={{ flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line }}>{[{ value: index.entries, label: 'entries' }, { value: app.repo.foods.length, label: 'saved foods' }, { value: app.repo.recipes.length, label: 'recipes' }].map(item => <View key={item.label} style={{ flex: 1 }}><Text style={{ fontSize: 24, fontWeight: '600' }}>{item.value}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{item.label}</Text></View>)}</View>

        <Section title="Your longer view" />

        {points.length ? <><IntakeChart points={points} metric={metric} onMetric={setMetric} openLabel="Open month" onOpen={key => { setDate(localDate(key)); setScope('month'); }} /><Text style={[styles.subtitle, { marginTop: 14, fontSize: 12 }]}>Each bar is an average per {denominator}. Missing months are gaps. {completeOnly ? 'Only days explicitly marked complete are included.' : 'Partial days are included and may understate intake.'}</Text></> : <Text style={styles.subtitle}>Your first recorded meal will start this view. There is no intake history yet.</Text>}

        <View style={{ marginTop: 16 }}><Button label="Go to first logged day" disabled={!index.earliest} onPress={() => selectDay(index.earliest!)} /></View>

        <Section title="What these numbers mean" /><Text style={[styles.subtitle, { fontSize: 12 }]}>An entry is one logged food or recipe portion. A meal is a meal label on a calendar day, regardless of how many entries it contains. A logged day has at least one entry. A complete day is explicitly reviewed; adding, changing or deleting intake reopens it. {display(index.recipeServings)} recipe servings were logged by serving count; gram portions are not guessed into servings. Tracking began {dateLabel(new Date(app.repo.profile.firstUsedAt))}; older backups can establish an earlier known date.</Text>

      </>}

    </Reveal>}

    <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' }}><TextButton label="Back to today" onPress={() => { setDate(new Date()); setScope('day'); }} /><Text style={{ alignSelf: 'center', color: colors.secondary, fontSize: 11 }}>Stored snapshots · local time</Text></View>

    <CalendarPicker visible={picker} selected={date} index={index} firstUsedAt={app.repo.profile.firstUsedAt} onSelect={selectDay} onClose={() => setPicker(false)} />

  </Screen>;

}

