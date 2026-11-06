import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { dayKey } from '../domain/model';

// Keep an automatic Today current across midnight and suspended timers. An
// explicit date remains part of the form and never follows this clock.
export function useCurrentDay() {
  const [day, setDay] = useState(() => dayKey(new Date()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      clearTimeout(timer); const now = new Date(); setDay(dayKey(now));
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, midnight.getTime() - now.getTime() + 20);
    }
    update();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    if (Platform.OS === 'web') window.addEventListener('focus', update);
    return () => { clearTimeout(timer); subscription.remove(); if (Platform.OS === 'web') window.removeEventListener('focus', update); };
  }, []);
  return day;
}
