import { View, useWindowDimensions } from 'react-native';
import { inspectRecoveryJSON } from '../domain/recovery';
import { Text } from './Text';
import { colors } from './theme';

export function BackupSummary({ summary, filename }: { summary: ReturnType<typeof inspectRecoveryJSON>; filename?: string }) {
  const { width, fontScale } = useWindowDimensions();
  const count = (value: number, single: string, plural = `${single}s`) => `${value} ${value === 1 ? single : plural}`;
  const items = [count(summary.logs, 'diary entry', 'diary entries'), count(summary.foods, 'food'), count(summary.recipes, 'recipe'), count(summary.portions, 'saved batch', 'saved batches'), count(summary.shortcuts, 'shortcut'), count(summary.targets, 'target revision'), count(summary.reviewedDays, 'reviewed day'), count(summary.weighIns, 'weigh-in'), count(summary.mealCorrections, 'meal correction')];
  const drafts = [summary.drafts.meal && 'meal', summary.drafts.recipes && `${summary.drafts.recipes} recipe`, summary.drafts.labels && `${summary.drafts.labels} label`, summary.drafts.portions && `${summary.drafts.portions} portion`, summary.drafts.command && 'voice command', summary.drafts.weight && 'weigh-in', summary.drafts.adjustment && 'meal adjustment'].filter(Boolean);
  return <View testID="backup-summary" style={{ gap: 7 }}>
    {filename && <Text testID="backup-filename" selectable style={{ fontSize: 14, fontWeight: '600' }}>{filename}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{items.map(item => <Text key={item} style={{ width: width / Math.max(1, fontScale) < 340 ? '100%' : '48%', color: colors.secondary, fontSize: 13 }}>{item}</Text>)}</View>
    {!!drafts.length && <Text style={{ fontSize: 13, color: colors.secondary }}>Unfinished drafts: {drafts.join(' · ')}</Text>}
  </View>;
}
