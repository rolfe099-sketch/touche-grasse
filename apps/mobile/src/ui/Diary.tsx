import { Pressable, View } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { display, logName, logQuantity, LogEntry, meals, total } from '../domain/model';
import { mealLabel, plural } from '../i18n';
import { useApp } from '../state/AppContext';
import { IconButton, styles } from './components';
import { Text } from './Text';
import { colors } from './theme';
import { Reveal } from './Motion';
import { foodLabel } from '../domain/foodLanguage';
import { Icon } from './Icon';

function CompactMeal({ items }: { items: LogEntry[] }) {
  const app = useApp(), [expanded, setExpanded] = useState(false);
  const many = items.length > 1, first = items[0];
  const names = items.map(log => log.snapshot.kind === 'food' ? foodLabel(log.snapshot.ingredient.food).split(' · ')[0] : logName(log));
  return <View style={{ borderBottomWidth: 1, borderColor: colors.line }}>
    {many && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable testID="meal-summary" accessibilityRole="button" accessibilityLabel={`View ${mealLabel(first.meal)} meal, ${items.length} foods`} accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpanded(!expanded)} style={({ pressed }) => ({ flex: 1, paddingVertical: 12, minHeight: 66, opacity: pressed ? .6 : 1 })}>
        <Text numberOfLines={1} style={styles.foodName}>{names.join(', ')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}><Text style={{ fontSize: 13, color: colors.secondary }}>{items.length} foods · {display(total(items.map(log => log.nutrition)).kcal, 0)} kcal</Text><Icon name={expanded ? 'back' : 'next'} size={12} color={colors.secondary} /></View>
      </Pressable>
      <IconButton name="repeat" label={`Repeat ${mealLabel(first.meal)} meal`} disabled={app.busy} onPress={() => void app.run(() => app.repo.repeatMeal(items.map(log => log.id)), 'Whole meal logged for today')} />
    </View>}
    {/* Keep entry components mounted while folding the journal; hidden rows are excluded from layout and accessibility. */}
    <View style={{ display: !many || expanded ? 'flex' : 'none' }}>{items.map(log => <View key={log.id} testID="log-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: many ? 10 : 0, paddingVertical: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${logName(log)} entry`} onPress={() => router.push({ pathname: '/log', params: { id: log.id } })} style={({ pressed }) => ({ flex: 1, minHeight: 48, justifyContent: 'center', gap: 3, opacity: pressed ? .6 : 1 })}>
        <Text numberOfLines={1} style={styles.foodName}>{log.snapshot.kind === 'food' ? foodLabel(log.snapshot.ingredient.food) : logName(log)}</Text>
        <Text style={{ fontSize: 13, color: colors.secondary }}>{logQuantity(log)} · {display(log.nutrition.kcal, 0)} kcal · {new Date(log.recordedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{log.corrections?.length ? ' · corrected' : ''}</Text>
      </Pressable>
      <IconButton name="repeat" label={`Log ${logName(log)} again`} disabled={app.busy} onPress={() => void app.run(() => app.repo.repeat(log), 'Logged for today')} />
    </View>)}</View>
  </View>;
}

export function Diary({ entries, compact = false }: { entries: LogEntry[]; compact?: boolean }) {
  const app = useApp();
  return <>{meals.map((meal, index) => {
    const items = entries.filter(log => log.meal === meal);
    if (!items.length) return null;
    if (compact) {
      const batches = new Map<string, LogEntry[]>();
      for (const log of items) batches.set(log.batchId, [...(batches.get(log.batchId) ?? []), log]);
      return <View key={meal} style={{ marginTop: 10 }}><Text style={{ color: colors.secondary, fontSize: 12, letterSpacing: .5 }}>{mealLabel(meal).toUpperCase()}</Text>{[...batches].map(([id, logs]) => <CompactMeal key={id} items={logs} />)}</View>;
    }
    return <View key={meal} style={{ marginTop: compact ? 6 : 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderColor: colors.line, paddingBottom: compact ? 0 : 10 }}>
        <Text style={{ width: 22, color: [colors.tangerine, colors.ocean, colors.forrest, colors.toffee][index], fontSize: 11, fontVariant: ['tabular-nums'] }}>{String(index + 1).padStart(2, '0')}</Text><Text accessibilityRole="header" style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>{mealLabel(meal)}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{display(total(items.map(l => l.nutrition)).kcal, 0)} kcal</Text>
        <IconButton name="repeat" label={`Repeat all ${mealLabel(meal)} entries`} disabled={app.busy} onPress={() => void app.run(() => app.repo.repeatMeal(items.map(log => log.id)), 'Whole meal logged for today')} />
      </View>
      {items.map(log => <Reveal key={log.id}><View style={[styles.row, compact && { paddingVertical: 5, paddingLeft: 9, marginLeft: 9, borderLeftWidth: 1, borderLeftColor: colors.line }]} testID="log-row">
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${logName(log)} entry`} onPress={() => router.push({ pathname: '/log', params: { id: log.id } })} style={({ pressed }) => ({ flex: 1, minHeight: 44, gap: 4, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          <Text style={styles.foodName}>{log.snapshot.kind === 'food' ? foodLabel(log.snapshot.ingredient.food) : logName(log)}</Text><Text style={{ fontSize: 12, color: colors.secondary }}>{logQuantity(log)} · {new Date(log.recordedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{log.corrections?.length ? ' · corrected' : ''}</Text>
          {!compact && log.snapshot.kind === 'recipe' && <Text style={{ fontSize: 12, color: colors.secondary }}>{plural(log.snapshot.recipe.ingredients.length, 'ingredient')}</Text>}
        </Pressable><Text style={{ fontSize: 15, fontWeight: '600' }}>{display(log.nutrition.kcal, 0)}<Text style={{ fontSize: 11, color: colors.secondary }}> kcal</Text></Text>
        <IconButton name="repeat" label={`Log ${logName(log)} again`} disabled={app.busy} onPress={() => void app.run(() => app.repo.repeat(log), 'Logged for today')} />
      </View></Reveal>)}
    </View>;
  })}</>;
}
