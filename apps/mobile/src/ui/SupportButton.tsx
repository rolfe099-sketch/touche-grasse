import { Link } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { coffeeLogo } from './coffeeLogo';

export const supportURL = 'https://buymeacoffee.com/endoftheend';
export function SupportButton() {
  // React Native Web expects nested anchor attributes when Link uses asChild.
  const webAnchor = Platform.OS === 'web' ? { hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } } : {};
  return <Link href={supportURL} target="_blank" rel="noopener noreferrer" asChild style={{ width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
    <Pressable {...webAnchor} testID="support-link" accessibilityRole="link" accessibilityLabel="Support Touche Grasse on Buy Me a Coffee" accessibilityHint="Opens the optional support page in your browser">
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFDD00', alignItems: 'center', justifyContent: 'center' }}>
        <SvgXml xml={coffeeLogo} width={18} height={26} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
      </View>
    </Pressable>
  </Link>;
}


