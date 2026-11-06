import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import { keyboardOverlap } from '../domain/reviewLayout';

export function useReviewViewport(active: boolean) {
  const dimensions = useWindowDimensions(), [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active) { setInset(0); return; }
    if (Platform.OS === 'web') {
      const viewport = window.visualViewport;
      const update = () => setInset(viewport ? Math.max(0, dimensions.height - viewport.height) : 0);
      update(); viewport?.addEventListener('resize', update);
      return () => viewport?.removeEventListener('resize', update);
    }
    setInset(keyboardOverlap(dimensions.height, Keyboard.metrics()));
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', event => setInset(keyboardOverlap(dimensions.height, event.endCoordinates)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setInset(0));
    return () => { show.remove(); hide.remove(); };
  }, [active, dimensions.height]);
  return { ...dimensions, keyboardInset: inset };
}
