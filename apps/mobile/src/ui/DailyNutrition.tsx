import { nutrientDescription, readableLayout } from '../domain/accessibility';
import { AccessibleSummary } from './AccessibleSummary';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { D, display, Nutrition, nutrients } from '../domain/model';
import { hasTargets, TargetValues, targetProgress } from '../domain/targets';
import { Text } from './Text';
import { colors, numeric } from './theme';
import { Icon } from './Icon';

// Compare recorded intake only with explicitly entered targets, never inferred goals.
export function DailyNutrition({ value, entries, meals, onTrend, targets, onTargets, targetLabel, complete = false }: { targetLabel?: string; complete?: boolean; value: Nutrition; entries: number; meals: number; onTrend: () => void; targets?: TargetValues; onTargets?: () => void }) {
  const { width, fontScale } = useWindowDimensions(), layout = readableLayout(width, fontScale);
  const knownIntake = entries > 0 || complete;
  const keys = ['protein', 'carbohydrate', 'fat', 'fiber'] as const;
  const active = hasTargets(targets), energy = targets ? targetProgress(value, 'kcal', targets, (entries > 0 || complete)) : null;
  const remaining = (value: string | null, digits = 1) => value === null ? '– left' : new D(value).isNegative() ? `${display(new D(value).abs().toFixed(), digits)} over` : `${display(value, digits)} left`;
  return <View testID="today-overview" style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingTop: 5, paddingBottom: 15 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
      {onTargets ? <Pressable accessibilityRole="button" accessibilityLabel={active ? 'Edit daily targets' : 'Set daily targets'} onPress={onTargets} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? .6 : 1 })}><Text style={{ color: colors.action, fontSize: 12 }}>{active ? targetLabel ?? 'Daily targets' : 'Set targets'} <Text style={{ fontSize: 12 }}>›</Text></Text></Pressable> : <Text style={{ color: colors.secondary, fontSize: 12, letterSpacing: .7 }}>DAILY INTAKE</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel="Explore intake history" onPress={onTrend} style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? .6 : 1 })}>
        <Text style={{ fontSize: 13, color: colors.secondary }}>This week</Text><Icon name="next" size={13} color={colors.secondary} />
      </Pressable>
    </View>
    {energy && <Text testID="energy-target-progress" style={{ color: colors.secondary, fontSize: 12, marginTop: 2 }}>Target {display(energy.target, 0)} kcal · {entries || complete ? remaining(energy.remaining, 0) : 'no intake logged'}</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: -5 }}>
      <Text testID="nutrition-kcal" style={{ maxWidth: '100%', flexShrink: 1, fontFamily: numeric, fontSize: display(value.kcal, 0).length > 5 ? 43 : 56, lineHeight: 68, letterSpacing: -2 }}>{entries || complete ? display(value.kcal, 0) : '–'}</Text>
      <Text style={{ color: colors.secondary, fontSize: 14 }}>kcal</Text>
      <Text style={{ flex: 1, textAlign: 'right', color: colors.secondary, fontSize: 13 }}>{meals} {meals === 1 ? 'meal' : 'meals'}</Text>
    </View>
    <View testID="today-nutrients" style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, marginTop: 7, rowGap: 12 }}>{keys.map((key, i) => {
      const label = ['Protein', 'Carbs', 'Fat', 'Fiber'][i], progress = active ? targetProgress(value, key, targets!, knownIntake) : null;
      return <AccessibleSummary key={key} label={nutrientDescription(label, value[key], progress, knownIntake)} style={{ width: layout.nutrientColumns === 2 ? '50%' : '25%', paddingLeft: i % layout.nutrientColumns ? 8 : 0, paddingRight: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 4, height: 12, borderRadius: 1, backgroundColor: [colors.forrest, colors.ocean, colors.toffee, colors.lavender][i] }} /><Text style={{ color: colors.secondary, fontSize: 13, flexShrink: 1 }}>{label}</Text></View>
        <Text testID={`today-${key}`} style={{ fontFamily: numeric, fontSize: 20, letterSpacing: -.4 }}>{knownIntake ? display(value[key]) : '–'}<Text style={{ fontSize: 12, color: colors.secondary }}> g</Text></Text>
        {active && <View testID={`target-progress-${key}`} style={{ gap: 5 }}><View style={{ height: 3, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden' }}>{progress?.fraction != null && <View style={{ height: 3, width: `${progress.fraction * 100}%`, backgroundColor: [colors.forrest, colors.ocean, colors.toffee, colors.lavender][i] }} />}</View><Text style={{ fontSize: 11, color: colors.secondary }}>{progress ? remaining(progress.remaining) : 'No target'}</Text></View>}
      </AccessibleSummary>;
    })}</View>
    {(entries > 0 || complete) && nutrients.some(key => value[key] == null) && <Text style={{ fontSize: 12, color: colors.secondary, marginTop: 8 }}>– means a nutrient value is unknown.</Text>}
  </View>;
}
