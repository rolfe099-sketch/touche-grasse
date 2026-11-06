import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { display, Nutrition } from '../domain/model';
import { Text } from './Text';
import { colors } from './theme';
import { Reveal } from './Motion';

export type ChartPoint = { key: string; label: string; fullLabel: string; nutrition: Nutrition | null; detail: string };
export function IntakeChart({ points, onOpen, metric = 'kcal', onMetric, openLabel = 'Open day' }: { points: ChartPoint[]; onOpen?: (key: string) => void; metric?: keyof Nutrition; onMetric?: (metric: keyof Nutrition) => void; openLabel?: string }) {
  const [selected, setSelected] = useState([...points].reverse().find(point => point.nutrition)?.key ?? points[0]?.key);
  const period = points.map(p => p.key).join(',');
  useEffect(() => { setSelected([...points].reverse().find(point => point.nutrition)?.key ?? points[0]?.key); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps
  const point = points.find(p => p.key === selected);
  const ceiling = Math.max(1, ...points.map(p => Number(p.nutrition?.[metric] ?? 0)));
  const color = ({ kcal: colors.ocean, protein: colors.forrest, carbohydrate: colors.tangerine, fat: colors.toffee, fiber: colors.lavender })[metric];
  return <View>
    {onMetric && <View style={{ flexDirection: 'row', gap: 0, marginBottom: 12 }}>{(['kcal', 'protein', 'carbohydrate', 'fat', 'fiber'] as const).map(key => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: metric === key }} accessibilityLabel={`Chart ${key === 'carbohydrate' ? 'carbs' : key}`} onPress={() => onMetric(key)} style={{ flex: 1, minHeight: 44, alignItems: 'center', paddingHorizontal: 4, justifyContent: 'center', borderBottomWidth: metric === key ? 2 : 0, borderColor: color }}><Text style={{ fontSize: 13, fontWeight: metric === key ? '700' : '400', color: metric === key ? colors.ink : colors.secondary }}>{({ kcal: 'Energy', protein: 'Protein', carbohydrate: 'Carbs', fat: 'Fat', fiber: 'Fiber' })[key]}</Text></Pressable>)}</View>}
    {point && <Reveal trigger={`${selected}:${metric}`} style={{ minHeight: 66, flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: 10, borderLeftWidth: 3, borderColor: color }}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 }}><Text style={{ fontWeight: '600', fontSize: 14 }}>{point.fullLabel}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{point.detail}</Text></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={{ fontWeight: '700', fontSize: 19 }}>{point.nutrition ? display(point.nutrition[metric], metric === 'kcal' ? 0 : 1) : '–'}<Text style={{ fontSize: 11 }}> {metric === 'kcal' ? 'kcal' : 'g'}</Text></Text>
        {onOpen && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${point.fullLabel}`} accessibilityHint={openLabel} onPress={() => onOpen(point.key)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, color: colors.action }}>→</Text></Pressable>}
      </View>
    </Reveal>}
    <ScrollView horizontal showsHorizontalScrollIndicator={points.length > 7} contentContainerStyle={{ minWidth: '100%', paddingTop: 14, paddingBottom: 5 }}>
      {points.map(p => {
        const active = p.key === selected, value = p.nutrition?.[metric];
        return <Pressable key={p.key} accessibilityRole="button" aria-pressed={active} accessibilityLabel={`${p.fullLabel}: ${p.nutrition ? value == null ? 'unknown' : `${display(value!, 1)} ${metric === 'kcal' ? 'kcal' : 'g'}` : 'no recorded intake'}`} accessibilityState={{ selected: active }} testID={`chart-${p.key}`} onPress={() => setSelected(p.key)} style={({ pressed }) => ({ minWidth: 44, flex: points.length <= 7 ? 1 : undefined, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
          <View style={{ height: 105, justifyContent: 'flex-end', alignItems: 'center', width: '100%', borderBottomWidth: 1, borderColor: colors.line }}>
            {value !== null && value !== undefined ? <View style={{ width: 22, minHeight: 3, height: Math.max(3, Number(value) / ceiling * 94), borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: active ? colors.toffee : color }} /> : <View style={{ width: 5, height: 3, borderRadius: 2, marginBottom: 3, backgroundColor: colors.line }} />}
          </View><Text style={{ color: active ? colors.ink : colors.secondary, fontWeight: active ? '700' : '400', fontSize: 11, paddingTop: 7 }}>{p.label}</Text><View style={{ height: 4, width: 4, borderRadius: 2, marginTop: 4, backgroundColor: active ? colors.toffee : 'transparent' }} />
        </Pressable>;
      })}
    </ScrollView>
    <Text style={{ color: colors.secondary, fontSize: 12, marginTop: 7 }}>Tap a bar to explore. Gaps mean missing intake or nutrient data.</Text>
  </View>;
}
