import { View } from 'react-native';
import { Meal } from '../domain/model';
import { loggingDayLabel } from '../domain/calendarDay';
import { Button, TextButton } from './components';
import { DestinationSummary } from './LoggingDestination';
import { Text } from './Text';
import { colors } from './theme';

export function DestinationConflict({ date, meal, requestedDate, disabled, onUse, onKeep }: { date?: string; meal: Meal; requestedDate: string; disabled?: boolean; onUse: () => void; onKeep: () => void }) {
  return <View testID="destination-conflict" style={{ borderLeftWidth: 2, borderColor: colors.copper, paddingLeft: 12, paddingVertical: 5, marginVertical: 10 }}>
    <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 5 }}>Keep this meal where it was started?</Text>
    <DestinationSummary date={date} meal={meal} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}><Button compact label={`Use ${loggingDayLabel(requestedDate)}`} disabled={disabled} onPress={onUse} /><TextButton label="Keep draft date" disabled={disabled} onPress={onKeep} /></View>
  </View>;
}
