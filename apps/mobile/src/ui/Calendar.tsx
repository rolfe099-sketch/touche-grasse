import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { dayKey } from '../domain/model';
import { addDays, daysInPeriod, HistoryIndex, localDate, shiftMonth, startOfWeek } from '../domain/history';
import { dateLabel } from '../i18n';
import { Button, Field, IconButton, styles } from './components';
import { Text } from './Text';
import { colors } from './theme';

export function CalendarGrid({ month, selected, index, firstUsedAt, onSelect, maxDate, disabled, appearance }: { month: Date; selected: Date; index: HistoryIndex; firstUsedAt: string; onSelect: (date: Date) => void; maxDate?: string; disabled?: boolean; appearance?: 'entry' }) {
  const monthDays = daysInPeriod(month, 'month'), start = startOfWeek(monthDays[0]);
  const count = Math.ceil((((monthDays[0].getDay() + 6) % 7) + monthDays.length) / 7) * 7;
  return <View>
    <View style={{ flexDirection: 'row', marginBottom: 5 }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((name, i) => <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.secondary, paddingVertical: 7 }}>{name}</Text>)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {Array.from({ length: count }, (_, i) => addDays(start, i)).map(date => {
        const key = dayKey(date), active = key === dayKey(selected), logged = index.byDay.get(key), outside = date.getMonth() !== month.getMonth();
        const before = key < dayKey(new Date(firstUsedAt));
        return <Pressable key={key} accessibilityRole="button" aria-pressed={active} accessibilityLabel={`${dateLabel(date)}, ${logged ? `${logged.entries.length} entries, ${logged.complete ? 'complete' : 'partial'}` : before ? 'before tracking began' : 'no entries'}`} disabled={disabled || !!(maxDate && key > maxDate)} accessibilityState={{ selected: active, disabled: disabled || !!(maxDate && key > maxDate) }} testID={`calendar-${key}`} onPress={() => onSelect(date)} style={({ pressed }) => ({ width: `${100 / 7}%`, minHeight: 45, alignItems: 'center', justifyContent: 'center', padding: 2, opacity: maxDate && key > maxDate ? .2 : pressed ? 0.6 : outside ? 0.35 : 1 })}>
          <View style={{ width: 36, height: 40, borderRadius: appearance === 'entry' ? 8 : 12, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: active ? appearance === 'entry' ? colors.primary : colors.ink : logged ? colors.selection : 'transparent', borderWidth: !active && key === dayKey(new Date()) ? 1 : 0, borderColor: colors.forrest }}>
            <Text style={{ fontSize: 15, fontWeight: logged || active ? '700' : '400', color: active ? appearance === 'entry' ? colors.onPrimary : colors.surface : before && !logged ? colors.secondary : colors.ink }}>{date.getDate()}</Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: logged ? active ? colors.tangerine : colors.ocean : 'transparent' }} />
          </View>
        </Pressable>;
      })}
    </View>
  </View>;
}
export function CalendarPicker({ visible, selected, index, firstUsedAt, onSelect, onClose }: { visible: boolean; selected: Date; index: HistoryIndex; firstUsedAt: string; onSelect: (date: Date) => void; onClose: () => void }) {
  const [month, setMonth] = useState(selected), [jump, setJump] = useState(dayKey(selected)), [error, setError] = useState('');
  function pick(date: Date) { onSelect(date); onClose(); }
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} onShow={() => { setMonth(selected); setJump(dayKey(selected)); setError(''); }}>
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000B8', padding: 18 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
      <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 410, padding: 18, backgroundColor: colors.raised, borderRadius: 14, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontSize: 22, fontWeight: '700' }}>Find a day</Text><IconButton name="close" label="Close calendar" onPress={onClose} /></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}><IconButton name="back" label="Previous calendar month" onPress={() => setMonth(shiftMonth(month, -1))} /><Text style={{ fontSize: 17, fontWeight: '600' }}>{dateLabel(month, { month: 'long', year: 'numeric' })}</Text><IconButton name="next" label="Next calendar month" onPress={() => setMonth(shiftMonth(month, 1))} /></View>
        <CalendarGrid month={month} selected={selected} index={index} firstUsedAt={firstUsedAt} onSelect={pick} />
        <Text style={[styles.subtitle, { fontSize: 12, marginTop: 8, marginBottom: 16 }]}>A dot marks a recorded or reviewed day. Blank days have no recorded intake.</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}><View style={{ flex: 1 }}><Field label="Jump to date (YYYY-MM-DD)" value={jump} onChangeText={setJump} style={{ marginBottom: -14 }} /></View><Button label="Go" onPress={() => { try { pick(localDate(jump)); } catch (reason) { setError((reason as Error).message); } }} /></View>
        {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13, marginTop: 12 }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}><Button label="Today" compact onPress={() => pick(new Date())} />{index.earliest && <Button label="First logged day" compact onPress={() => pick(index.earliest!)} />}</View>
      </View>
    </View>
  </Modal>;
}
