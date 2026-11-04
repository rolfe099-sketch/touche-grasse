import { forwardRef, useState } from 'react';
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeInput, TextInputProps, TextProps } from 'react-native';
import { colors, sans, serif } from './theme';

export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const weight = String(flat.fontWeight ?? '400');
  const heavy = ['500', '600', '700', '800', '900', 'bold'].includes(weight);
  const fontFamily = flat.fontFamily === serif ? heavy ? 'NewsreaderSemiBold' : serif : ['700', '800', '900', 'bold'].includes(weight) ? 'DMSansBold' : ['600'].includes(weight) ? 'DMSansSemiBold' : weight === '500' ? 'DMSansMedium' : sans;
  return <NativeText {...props} style={[{ fontFamily, color: colors.ink, fontSize: 16, fontVariant: ['tabular-nums'] }, style, { fontFamily, fontWeight: 'normal' }]} />;
}
export const TextInput = forwardRef<NativeInput, TextInputProps>(function TextInput({ style, onFocus, onBlur, selectTextOnFocus, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  // Select within the first trusted gesture, before WebKit's default caret
  // placement. No delayed timer may select text after typing has begun.
  function selectFirstGesture(event: { currentTarget: unknown; preventDefault: () => void }) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.ownerDocument.activeElement !== input) { event.preventDefault(); input.focus(); input.select(); }
  }
  const webSelection = Platform.OS === 'web' && selectTextOnFocus ? {
    onPointerDown: selectFirstGesture,
    onMouseDown: selectFirstGesture,
  } : {};
  // RN 0.81 supplies its native toolbar for number pads when Done is requested.
  const numericPad = !props.multiline && ['decimal-pad', 'number-pad', 'phone-pad', 'numeric'].includes(props.keyboardType ?? '');
  return <NativeInput ref={ref} returnKeyType={numericPad ? 'done' : undefined} inputAccessoryViewButtonLabel={Platform.OS === 'ios' && numericPad ? 'Done' : undefined} keyboardAppearance="dark" placeholderTextColor={colors.secondary} selectionColor={colors.action} {...props} {...webSelection} selectTextOnFocus={Platform.OS === 'web' ? false : selectTextOnFocus} onFocus={event => { setFocused(true); if (Platform.OS === 'web' && selectTextOnFocus) (event.target as unknown as HTMLInputElement).select(); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} style={[{ fontFamily: sans, fontSize: 16, fontVariant: ['tabular-nums'], color: colors.ink }, style, focused && { borderColor: colors.action }, Platform.OS === 'web' && { outlineStyle: 'solid', outlineWidth: focused ? 1 : 0, outlineColor: colors.action, outlineOffset: -1 }]} />;
});
