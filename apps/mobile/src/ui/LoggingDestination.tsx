import { useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { dayKey, meals, Meal } from '../domain/model';
import { calendarDate, loggingDayLabel, loggingTime, yesterdayKey } from '../domain/calendarDay';
import { historyIndex, shiftMonth } from '../domain/history';
import { useApp } from '../state/AppContext';
import { dateLabel, mealLabel } from '../i18n';
import { CalendarGrid } from './Calendar';
import { Button, Field, IconButton } from './components';
import { Icon } from './Icon';
import { Reveal, useReducedMotion } from './Motion';
import { Text } from './Text';
import { colors, serif } from './theme';

export function LoggingDestination({ date, meal, disabled, onChange }: { date?: string; meal: Meal; disabled?: boolean; onChange: (change: { loggingDate?: string; meal?: Meal }) => void }) {
  const { repo, revision } = useApp(), reduced = useReducedMotion(), { width, fontScale } = useWindowDimensions();
  const today = dayKey(new Date()), selected = date ?? today, custom = selected !== today && selected !== yesterdayKey();
  const [calendar, setCalendar] = useState(false), [mealPicker, setMealPicker] = useState(false);
  const [month, setMonth] = useState(() => calendarDate(selected)), [jump, setJump] = useState(selected), [error, setError] = useState('');
  const index = useMemo(() => { void revision; return historyIndex(repo.logs, repo.dayReviews); }, [repo, revision]);
  const largeText = fontScale > 1.35, stacked = largeText || width < 350;
  function pick(key: string) {
    try { loggingTime(key); onChange({ loggingDate: key }); setError(''); setCalendar(false); }
    catch (reason) { setError((reason as Error).message); }
  }
  function dayButton(label: string | undefined, active: boolean, action: () => void, isCalendar = false) {
    return <Pressable accessibilityRole="button" accessibilityLabel={isCalendar ? 'Choose logging date' : label} accessibilityState={{ selected: active, disabled: !!disabled, ...(isCalendar ? { expanded: calendar } : {}) }} aria-pressed={active} aria-expanded={isCalendar ? calendar : undefined} accessibilityValue={isCalendar ? { text: dateLabel(calendarDate(selected)) } : undefined} disabled={disabled} onPress={action} style={({ pressed }) => [s.day, largeText && { flexBasis: '43%' }, { backgroundColor: pressed ? colors.pressed : active ? colors.raised : 'transparent', borderColor: active ? colors.edge : 'transparent', opacity: disabled ? .45 : 1, transform: [{ scale: pressed && !reduced ? .98 : 1 }] }]}>
      {isCalendar && <Icon name="calendar" size={17} color={active || calendar ? colors.action : colors.secondary} />}
      {!!label && <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: active ? '600' : '500', color: active ? colors.ink : colors.secondary, flexShrink: 1, textAlign: 'center' }}>{label}</Text>}
    </Pressable>;
  }
  return <View testID="logging-destination" style={s.destination}>
    <View style={[s.rail, stacked && { flexWrap: 'wrap' }]}>
      <View style={[s.dates, stacked && { flexBasis: '100%' }, largeText && { flexWrap: 'wrap' }]}>
        {dayButton('Today', selected === today, () => pick(today))}
        {dayButton('Yesterday', selected === yesterdayKey(), () => pick(yesterdayKey()))}
        {dayButton(custom ? dateLabel(calendarDate(selected), { day: 'numeric', month: 'short', ...(selected.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }) : undefined, custom, () => { Keyboard.dismiss(); setMonth(calendarDate(selected)); setJump(selected); setError(''); setCalendar(!calendar); setMealPicker(false); }, true)}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Change meal type, ${mealLabel(meal)}`} accessibilityState={{ expanded: mealPicker, disabled: !!disabled }} aria-expanded={mealPicker} disabled={disabled} onPress={() => { Keyboard.dismiss(); setMealPicker(!mealPicker); setCalendar(false); }} style={({ pressed }) => [s.meal, { backgroundColor: pressed ? colors.pressed : colors.surface, borderColor: mealPicker ? colors.action : colors.line, opacity: disabled ? .45 : 1, transform: [{ scale: pressed && !reduced ? .98 : 1 }] }]}>
        <Icon name="bowl" size={16} color={colors.action} /><Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink, flexShrink: 1 }}>{mealLabel(meal)}</Text><View style={{ transform: [{ rotate: mealPicker ? '-90deg' : '90deg' }] }}><Icon name="next" size={10} color={colors.secondary} /></View>
      </Pressable>
    </View>
    {mealPicker && <Reveal><View testID="logging-meal-choices" style={[s.choices, largeText && { flexWrap: 'wrap' }]}>{meals.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={mealLabel(value)} accessibilityState={{ selected: meal === value, disabled: !!disabled }} aria-pressed={meal === value} disabled={disabled} onPress={() => { onChange({ meal: value }); setMealPicker(false); }} style={({ pressed }) => [s.choice, largeText && { flexBasis: '45%' }, { backgroundColor: pressed ? colors.pressed : meal === value ? colors.selection : 'transparent', borderColor: meal === value ? colors.copper : 'transparent' }]}><Text style={{ color: meal === value ? colors.ink : colors.secondary, fontSize: 13, fontWeight: meal === value ? '600' : '400', textAlign: 'center' }}>{mealLabel(value)}</Text></Pressable>)}</View></Reveal>}
    {calendar && <Reveal><View testID="logging-calendar" style={s.calendar}>
      <View style={s.month}><IconButton name="back" label="Previous logging month" disabled={disabled} onPress={() => setMonth(shiftMonth(month, -1))} /><Text accessibilityRole="header" style={{ fontFamily: serif, fontSize: 22, fontWeight: '600', color: colors.ink, flex: 1, textAlign: 'center' }}>{dateLabel(month, { month: 'long', year: 'numeric' })}</Text><IconButton name="next" label="Next logging month" disabled={disabled || dayKey(month).slice(0, 7) >= today.slice(0, 7)} onPress={() => setMonth(shiftMonth(month, 1))} /></View>
      <CalendarGrid appearance="entry" month={month} selected={calendarDate(selected)} index={index} firstUsedAt={repo.profile.firstUsedAt} maxDate={today} disabled={disabled} onSelect={value => pick(dayKey(value))} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8, borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 }}><View style={{ flexGrow: 1, flexBasis: largeText ? '100%' : 170 }}><Field compact label="Logging date (YYYY-MM-DD)" value={jump} onChangeText={value => { setJump(value); setError(''); }} editable={!disabled} autoCorrect={false} autoCapitalize="none" maxLength={10} /></View><Button label="Use date" compact disabled={disabled} onPress={() => pick(jump)} /></View>
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, marginTop: 4 }}>{error}</Text>}
    </View></Reveal>}
  </View>;
}

export function DestinationSummary({ date, meal, testID }: { date?: string; meal: Meal; testID?: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}><Icon name="calendar" size={13} color={colors.secondary} /><Text testID={testID} style={{ color: colors.secondary, fontSize: 12 }}>{loggingDayLabel(date)}{' \u00b7 '}{mealLabel(meal)}</Text></View>;
}

const s = StyleSheet.create({
  destination: { paddingVertical: 5, borderBottomWidth: 1, borderColor: colors.line },
  rail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dates: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 2, padding: 3, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.night },
  day: { flex: 1, flexShrink: 1, minWidth: 44, minHeight: 44, paddingHorizontal: 4, borderRadius: 7, borderWidth: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', alignItems: 'center' },
  meal: { minHeight: 48, maxWidth: '100%', flexShrink: 1, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  choices: { flexDirection: 'row', gap: 3, marginTop: 6, padding: 3, backgroundColor: colors.night, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  choice: { flex: 1, flexShrink: 1, minHeight: 44, paddingHorizontal: 3, paddingVertical: 7, borderRadius: 7, borderWidth: 1, justifyContent: 'center' },
  calendar: { marginTop: 8, padding: 9, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  month: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
});
