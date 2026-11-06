import { View } from 'react-native';
import { dayKey } from '../domain/model';
import { dayComplete } from '../domain/dailyWorkflows';
import { useApp } from '../state/AppContext';
import { TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

export function DayCompletion({ date }: { date: string }) {
  const { repo, busy, run } = useApp();
  if (date > dayKey(new Date())) return null;
  const complete = dayComplete(repo.dayReviews, repo.logs, date);
  const changed = !complete && repo.dayReviews.some(item => item.id === date && item.complete);
  return <View testID="day-completion" style={{ borderTopWidth: 1, borderColor: colors.line, paddingVertical: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><Text accessibilityLiveRegion="polite" style={{ fontSize: 13, color: complete ? colors.action : colors.secondary }}>{complete ? 'Day complete' : changed ? 'Changed since review · partial day' : 'Not marked complete'}</Text><TextButton label={complete ? 'Reopen day' : 'Mark complete'} disabled={busy} onPress={() => void run(() => repo.setDayComplete(date, !complete), complete ? 'Day reopened' : 'Day marked complete')} /></View>
    {!complete && <Text style={{ color: colors.secondary, fontSize: 12, paddingBottom: 4 }}>{repo.logs.some(log => dayKey(new Date(log.recordedAt)) === date) ? 'Mark complete when all food and drinks are recorded.' : 'No intake recorded. Mark complete only if there is no intake to add; this counts as zero.'} Only complete days count in complete-day averages.</Text>}
  </View>;
}
