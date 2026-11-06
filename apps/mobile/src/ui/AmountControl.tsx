import { Pressable, StyleSheet, View } from 'react-native';
import { D, parseAmount } from '../domain/model';
import { Icon } from './Icon';
import { TextInput } from './Text';
import { colors } from './theme';

export function AmountControl({ value, label, testID, disabled = false, maximum = '1000000', onChange }: { value: string; label: string; testID?: string; disabled?: boolean; maximum?: string; onChange: (value: string) => void }) {
  const parsed = parseAmount(value), amount = parsed === null ? undefined : new D(parsed);
  const decrease = amount?.minus(1), increase = amount?.plus(1);
  function step(direction: 'decrease' | 'increase') {
    const next = direction === 'decrease' ? decrease : increase;
    if (next && next.gt(0) && next.lte(maximum)) onChange(next.toFixed());
  }
  function button(direction: 'decrease' | 'increase') {
    const next = direction === 'decrease' ? decrease : increase, unavailable = disabled || !next || next.lte(0) || next.gt(maximum);
    return <Pressable accessibilityRole="button" accessibilityLabel={`${direction === 'decrease' ? 'Decrease' : 'Increase'} ${label.toLowerCase()}`} accessibilityState={{ disabled: unavailable }} disabled={unavailable} onPress={() => step(direction)} style={({ pressed }) => [s.step, { backgroundColor: pressed ? colors.pressed : 'transparent', opacity: unavailable ? .3 : 1 }]}><Icon name={direction === 'decrease' ? 'minus' : 'plus'} size={16} color={colors.ink} /></Pressable>;
  }
  return <View style={s.control}>{button('decrease')}<TextInput accessibilityLabel={label} testID={testID} value={value} maxLength={100} onChangeText={onChange} keyboardType="decimal-pad" selectTextOnFocus editable={!disabled} style={[s.amount, { width: Math.max(52, Math.min(96, value.length * 11)) }]} />{button('increase')}</View>;
}
const s = StyleSheet.create({
  control: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, borderRadius: 10 },
  step: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  amount: { minHeight: 44, width: 52, paddingHorizontal: 2, textAlign: 'center', fontSize: 20, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line },
});
