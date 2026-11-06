import { PropsWithChildren } from 'react';
import { Platform, View, ViewStyle } from 'react-native';

// One native reading stop, with a named web group for the same information.
// Children are visual duplicates; never place interactive controls inside it.
export function AccessibleSummary({ label, children, style, testID }: PropsWithChildren<{ label: string; style?: ViewStyle; testID?: string }>) {
  return <View accessible accessibilityRole="text" role={Platform.OS === 'web' ? 'group' : undefined} accessibilityLabel={label} testID={testID} style={style}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ gap: 3 }}>{children}</View>
  </View>;
}
