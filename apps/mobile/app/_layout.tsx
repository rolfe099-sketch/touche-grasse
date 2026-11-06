import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/state/AppContext';
import { colors } from '../src/ui/theme';
import { useEffect } from 'react';
import { enableOfflinePreview } from '../src/platform/offline';
import { useFonts } from 'expo-font';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { ActivityIndicator, View } from 'react-native';
import { MotionProvider, useReducedMotion } from '../src/ui/Motion';
export default function Layout() {
  useEffect(enableOfflinePreview, []);
  const [fonts, error] = useFonts({ Newsreader: Newsreader_400Regular, NewsreaderSemiBold: Newsreader_600SemiBold, DMSans: DMSans_400Regular, DMSansMedium: DMSans_500Medium, DMSansSemiBold: DMSans_600SemiBold, DMSansBold: DMSans_700Bold });
  if (!fonts && !error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.action} /></View>;
  return <SafeAreaProvider><MotionProvider><AppProvider><StatusBar style="light" /><Routes /></AppProvider></MotionProvider></SafeAreaProvider>;
}
function Routes() {
  const reduced = useReducedMotion();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: reduced ? 'none' : 'slide_from_right' }}>
    <Stack.Screen name="(tabs)" /><Stack.Screen name="entry" options={{ presentation: 'modal', animation: reduced ? 'none' : 'slide_from_bottom' }} /><Stack.Screen name="manual" /><Stack.Screen name="recipe" /><Stack.Screen name="settings" /><Stack.Screen name="planner" /><Stack.Screen name="scan" /><Stack.Screen name="log" />
  </Stack>;
}
