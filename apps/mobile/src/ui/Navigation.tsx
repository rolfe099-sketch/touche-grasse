import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from './Text';
import { colors } from './theme';
import { Icon } from './Icon';
import { useReducedMotion } from './Motion';
import { useApp } from '../state/AppContext';

export function Navigation({ state, navigation, insets }: BottomTabBarProps) {
  const reducedMotion = useReducedMotion(), app = useApp();
  const tabs = [{ name: 'index', label: 'Today', icon: 'today' as const }, { name: 'recipes', label: 'Library', icon: 'book' as const }, null, { name: 'search', label: 'Discover', icon: 'discover' as const }, { name: 'history', label: 'History', icon: 'history' as const }];
  return <View style={{ backgroundColor: colors.background, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) }}>
    <View style={{ width: '100%', maxWidth: 676, alignSelf: 'center', backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, minHeight: 70 }}>
        {tabs.map((tab, i) => {
          if (!tab) return <View key="log" style={{ width: 70, alignItems: 'center', marginTop: -17, paddingBottom: 2 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Log food" testID="universal-log" onPress={() => { app.clearNotice(); const active = state.routes[state.index]; const date = active.name === 'history' ? (active.params as { date?: string } | undefined)?.date : undefined; router.push({ pathname: '/entry', params: date ? { date } : {} }); }} style={({ pressed }) => ({ width: 60, height: 60, backgroundColor: pressed ? colors.primaryPressed : colors.primary, borderRadius: 30, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed && !reducedMotion ? 0.96 : 1 }] })}><Icon name="plus" size={29} color={colors.onPrimary} /></Pressable>
            <Text accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: 12, marginTop: 3, color: colors.action, letterSpacing: .5 }}>Log</Text>
          </View>;
          const route = state.routes.find(route => route.name === tab.name)!;
          const active = state.routes[state.index].key === route.key;
          return <Pressable key={i} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: active }} aria-selected={active} testID={`tab-${tab.name}`} onPress={() => { app.clearNotice(); const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!active && !event.defaultPrevented) navigation.navigate(route.name, route.params); }} style={({ pressed }) => ({ flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? .55 : 1 })}>
            <View style={{ width: 42, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: 'transparent' }}><Icon name={tab.icon} size={22} color={active ? colors.ink : colors.secondary} /></View>
            <Text style={{ maxWidth: '100%', textAlign: 'center', flexShrink: 1, fontSize: 12, letterSpacing: -.3, color: active ? colors.ink : colors.secondary }}>{tab.label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </View>;
}
