import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { addDays } from '../domain/history';
import { dayKey } from '../domain/model';
import { dateLabel } from '../i18n';
import { Text } from './Text';
import { colors, numeric } from './theme';

export function DayStrip({ date, loggedDays, onSelect }: { date: Date; loggedDays: ReadonlySet<string>; onSelect: (date: Date) => void }) {
  const { fontScale } = useWindowDimensions();
  const monday = addDays(date, -((date.getDay() + 6) % 7)), today = dayKey(new Date());
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="today-day-strip" contentContainerStyle={{ minWidth: '100%', flexDirection: 'row', marginBottom: 8, borderTopWidth: 0, borderBottomWidth: 0, borderColor: colors.line, paddingVertical: 3 }}>
    {Array.from({ length: 7 }, (_, i) => {
      const at = addDays(monday, i), key = dayKey(at), selected = key === dayKey(date), future = key > today;
      return <Pressable key={key} testID={`today-day-${key}`} accessibilityRole="button" aria-pressed={selected} accessibilityLabel={`Show ${dateLabel(at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} accessibilityState={{ selected, disabled: future }} disabled={future} onPress={() => onSelect(at)} style={({ pressed }) => ({ flex: 1, minWidth: Math.max(44, 35 * fontScale), minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: future ? .35 : pressed ? .6 : 1 })}>
        <Text style={{ fontFamily: numeric, fontSize: 11, letterSpacing: .5, color: colors.secondary }}>{dateLabel(at, { weekday: 'short' }).toUpperCase()}</Text>
        <View style={{ minWidth: 29, minHeight: 25, paddingHorizontal: 4, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.primary : 'transparent' }}><Text style={{ fontFamily: numeric, fontSize: 15, color: selected ? colors.onPrimary : colors.ink }}>{at.getDate()}</Text></View>
        <View style={{ height: 3, width: 3, borderRadius: 1, backgroundColor: loggedDays.has(key) ? colors.action : 'transparent' }} />
      </Pressable>;
    })}
  </ScrollView>;
}
