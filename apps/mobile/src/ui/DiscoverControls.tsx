import { Pressable, useWindowDimensions, View } from 'react-native';
import { Nutrition, display } from '../domain/model';
import { AccessibleSummary } from './AccessibleSummary';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from './theme';

export function DiscoverChip({ label, selected, onPress, accessibilityLabel, count }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string; count?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected }} aria-pressed={selected} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 23, backgroundColor: pressed ? colors.pressed : selected ? colors.citrus : 'transparent', borderWidth: 1, borderColor: selected ? colors.citrus : colors.line, flexDirection: 'row', gap: 7, alignItems: 'center' })}>
    <Text style={{ color: selected ? colors.onPrimary : colors.secondary, fontSize: 13, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    {count !== undefined && <Text style={{ fontSize: 11, color: selected ? colors.onPrimary : colors.secondary }}>{count}</Text>}
  </Pressable>;
}
export function DiscoverMode({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  const { width, fontScale } = useWindowDimensions(), compact = width / fontScale < 360;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} aria-pressed={selected} onPress={onPress} style={({ pressed }) => ({ minHeight: 47, flex: 1, justifyContent: 'center', borderBottomWidth: 2, borderColor: selected ? colors.citrus : colors.line, opacity: pressed ? .6 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{!compact && <Icon name={label === 'Meal ideas' || label === 'Recipe method' ? 'book' : 'leaf'} size={17} color={selected ? colors.citrus : colors.secondary} />}<Text style={{ flexShrink: 1, minWidth: 0, textAlign: 'center', fontSize: compact ? 13 : 15, fontWeight: selected ? '600' : '400', color: selected ? colors.ink : colors.secondary }}>{label === 'Recipe ingredients' ? 'Ingredients' : label === 'Recipe method' ? 'Method' : label}</Text>{!compact && <Text style={{ fontSize: 10, color: colors.secondary }}>{count.toLocaleString('en')}</Text>}</View>
  </Pressable>;
}
export function DiscoverNutrition({ value, caption }: { value: Nutrition; caption: string }) {
  return <View testID="idea-nutrition" style={{ paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, gap: 12 }}>
    <Text style={{ color: colors.secondary, fontSize: 11 }}>{caption}</Text>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <AccessibleSummary label={`${display(value.kcal)} kilocalories`} style={{ flex: 1 }}><Text style={{ color: colors.secondary, fontSize: 12 }}>Energy</Text><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}><Text testID="nutrition-kcal" style={{ fontSize: 30, fontWeight: '600', letterSpacing: -1 }}>{display(value.kcal, 0)}</Text><Text style={{ color: colors.secondary, fontSize: 13 }}>kcal</Text></View></AccessibleSummary>
      <AccessibleSummary label={`Protein ${display(value.protein)} grams`} style={{ flex: 1, borderLeftWidth: 1, borderColor: colors.line, paddingLeft: 15 }}><Text style={{ color: colors.secondary, fontSize: 12 }}>Protein</Text><Text style={{ fontSize: 30, fontWeight: '600', color: colors.citrus, letterSpacing: -1 }}>{display(value.protein)}<Text style={{ fontSize: 14 }}> g</Text></Text></AccessibleSummary>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{(['carbohydrate', 'fat', 'fiber'] as const).map((key, i) => <AccessibleSummary key={key} label={`${['Carbs', 'Fat', 'Fiber'][i]} ${display(value[key])} grams`} style={{ flex: 1, minWidth: 65 }}><Text style={{ color: colors.secondary, fontSize: 12 }}>{['Carbs', 'Fat', 'Fiber'][i]}</Text><Text style={{ fontSize: 18, fontWeight: '500' }}>{display(value[key])}<Text style={{ fontSize: 12, color: colors.secondary }}> g</Text></Text></AccessibleSummary>)}</View>
  </View>;
}
