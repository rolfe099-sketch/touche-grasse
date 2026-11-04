import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View, ViewStyle } from 'react-native';
import { colors } from './theme';

const MotionContext = createContext(true);
export function MotionProvider({ children }: PropsWithChildren) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true; void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  return <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>;
}
export function useReducedMotion() { return useContext(MotionContext); }
// A listening-state indicator, not a visualization of measured microphone volume.
export function ListeningActivity({ active }: { active: boolean }) {
  const reduced = useReducedMotion(), phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduced) { phase.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([Animated.timing(phase, { toValue: 1, duration: 650, useNativeDriver: true }), Animated.timing(phase, { toValue: 0, duration: 650, useNativeDriver: true })]));
    animation.start(); return () => animation.stop();
  }, [active, reduced, phase]);
  if (!active) return null;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ flexDirection: 'row', alignItems: 'center', gap: 3, width: 40, height: 25 }}>{[9, 17, 23, 16, 10].map((height, i) => <Animated.View key={i} style={{ width: 3, height, borderRadius: 2, backgroundColor: i < 3 ? colors.forrest : colors.action, transform: [{ scaleY: phase.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [0.55, 1] : [1, 0.55] }) }] }} />)}</View>;
}
export function Reveal({ children, style, trigger }: PropsWithChildren<{ style?: ViewStyle; trigger?: string | number }>) {
  const reduced = useReducedMotion(), opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) { opacity.setValue(1); return; }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: true }); animation.start();
    return () => animation.stop();
  }, [reduced, opacity, trigger]);
  return <Animated.View style={[style, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }]}>{children}</Animated.View>;
}
