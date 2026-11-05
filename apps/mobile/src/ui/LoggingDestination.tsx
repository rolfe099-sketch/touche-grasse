import { useMemo, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { dayKey, meals, Meal } from '../domain/model';
import { calendarDate, loggingDayLabel, loggingTime, yesterdayKey } from '../domain/calendarDay';
import { historyIndex, shiftMonth } from '../domain/history';
import { useApp } from '../state/AppContext';
import { dateLabel, mealLabel } from '../i18n';
import { CalendarGrid } from './Calendar';
import { Field, IconButton, SegmentButton, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

export function LoggingDestination({ date, meal, disabled, onChange }: { date?: string; meal: Meal; disabled?: boolean; onChange: (change: { loggingDate?: string; meal?: Meal }) => void }) {
  const { repo, revision } = useApp();
  const today = dayKey(new Date()), selected = date ?? today;
  const [calendar, setCalendar] = useState(false), [mealPicker, setMealPicker] = useState(false);
  const [month, setMonth] = useState(() => calendarDate(selected)), [jump, setJump] = useState(selected), [error, setError] = useState('');
  const index = useMemo(() => { void revision; return historyIndex(repo.logs, repo.dayReviews); }, [repo, revision]);
  function pick(key: string) {
    try { loggingTime(key); onChange({ loggingDate: key }); setError(''); setCalendar(false); }
    catch (reason) { setError((reason as Error).message); }
  }
  return <View testID="logging-destination" style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6 }}>
      <SegmentButton label="Today" selected={selected === today} disabled={disabled} onPress={() => pick(today)} />
      <SegmentButton label="Yesterday" selected={selected === yesterdayKey()} disabled={disabled} onPress={() => pick(yesterdayKey())} />
      <TextButton label={selected < yesterdayKey() ? loggingDayLabel(selected) : 'Choose date'} accessibilityLabel="Choose logging date" disabled={disabled} onPress={() => { Keyboard.dismiss(); setMonth(calendarDate(selected)); setJump(selected); setError(''); setCalendar(!calendar); setMealPicker(false); }} />
      <TextButton label={`${mealLabel(meal)} ›`} accessibilityLabel={`Change meal type, ${mealLabel(meal)}`} disabled={disabled} onPress={() => { Keyboard.dismiss(); setMealPicker(!mealPicker); setCalendar(false); }} />
    </View>
    {mealPicker && <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{meals.map(value => <SegmentButton key={value} label={mealLabel(value)} selected={meal === value} disabled={disabled} onPress={() => { onChange({ meal: value }); setMealPicker(false); }} />)}</View>}
    {calendar && <View testID="logging-calendar">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><IconButton name="back" label="Previous logging month" disabled={disabled} onPress={() => setMonth(shiftMonth(month, -1))} /><Text>{dateLabel(month, { month: 'long', year: 'numeric' })}</Text><IconButton name="next" label="Next logging month" disabled={disabled || dayKey(month).slice(0, 7) >= today.slice(0, 7)} onPress={() => setMonth(shiftMonth(month, 1))} /></View>
      <CalendarGrid month={month} selected={calendarDate(selected)} index={index} firstUsedAt={repo.profile.firstUsedAt} maxDate={today} disabled={disabled} onSelect={value => pick(dayKey(value))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Field label="Logging date (YYYY-MM-DD)" value={jump} onChangeText={setJump} editable={!disabled} maxLength={10} /></View><TextButton label="Use date" disabled={disabled} onPress={() => pick(jump)} /></View>
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, marginBottom: 8 }}>{error}</Text>}
    </View>}
  </View>;
}
