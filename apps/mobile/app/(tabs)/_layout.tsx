import { Tabs } from 'expo-router';
import { Navigation } from '../../src/ui/Navigation';
export default function TabsLayout() {
  return <Tabs tabBar={props => <Navigation {...props} />} screenOptions={{ headerShown: false, animation: 'none' }}>
    <Tabs.Screen name="index" options={{ title: 'Today' }} />
    <Tabs.Screen name="recipes" options={{ title: 'Library' }} />
    <Tabs.Screen name="search" options={{ title: 'Discover' }} />
    <Tabs.Screen name="history" options={{ title: 'History' }} />
  </Tabs>;
}
