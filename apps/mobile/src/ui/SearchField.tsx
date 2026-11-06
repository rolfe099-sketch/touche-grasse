import { useRef, useState } from 'react';
import { Keyboard, TextInput as NativeInput, View } from 'react-native';
import { Icon } from './Icon';
import { IconButton } from './components';
import { TextInput } from './Text';
import { colors } from './theme';

export function SearchField({ label, placeholder, value, onChangeText, testID, clearLabel, hint }: { label: string; placeholder: string; value: string; onChangeText: (text: string) => void; testID?: string; clearLabel: string; hint: string }) {
  const input = useRef<NativeInput>(null), [focused, setFocused] = useState(false);
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: focused ? colors.action : colors.line, borderRadius: 10, paddingLeft: 12, paddingRight: value ? 2 : 12 }}>
    <Icon name="search" size={20} color={colors.secondary} />
    <TextInput ref={input} focusRing="container" accessibilityLabel={label} accessibilityHint={hint} testID={testID} placeholder={placeholder} value={value} onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={() => Keyboard.dismiss()} style={{ flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 8, fontSize: 15, color: colors.ink }} />
    {!!value && <IconButton name="close" label={clearLabel} onPress={() => { onChangeText(''); input.current?.focus(); }} />}
  </View>;
}
