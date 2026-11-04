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
export const TextInput = forwardRef<NativeInput, TextInputProps>(function TextInput({ style, onFocus, onBlur, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  return <NativeInput ref={ref} keyboardAppearance="dark" placeholderTextColor={colors.secondary} selectionColor={colors.action} {...props} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} style={[{ fontFamily: sans, fontSize: 16, fontVariant: ['tabular-nums'], color: colors.ink }, style, focused && { borderColor: colors.action }, Platform.OS === 'web' && { outlineStyle: 'solid', outlineWidth: focused ? 1 : 0, outlineColor: colors.action, outlineOffset: -1 }]} />;
});
