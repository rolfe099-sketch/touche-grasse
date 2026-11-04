import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { colors } from './theme';
export type IconName = 'today' | 'search' | 'book' | 'plus' | 'close' | 'back' | 'next' | 'repeat' | 'bookmark' | 'check' | 'settings' | 'camera' | 'minus' | 'calendar' | 'history' | 'bowl' | 'leaf' | 'brand' | 'mic' | 'type' | 'discover' | 'wave' | 'trash';

// Compact, original pictograms on a shared 32-unit grid.
export function Icon({ name, color = colors.action, size = 24 }: { name: IconName; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 32 32" fill={color} accessibilityElementsHidden importantForAccessibility="no" aria-hidden>
    {name === 'brand' && <G fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"><Path d="M16 3v26M3 16h26M7 7l18 18M7 25 25 7" /></G>}
    {name === 'bowl' && <><Path d="M3 17h26c-1 8-5.4 12-13 12S4 25 3 17Z" /><Path d="M5 11h22v2H5z" fill={colors.toffee} /></>}
    {name === 'leaf' && <><Path d="M28 3C12 0 2 8 4 20c2 10 18 10 22-3 1-4 1-9 2-14Z" fill={colors.forrest} /><Path d="M7 27 23 9" stroke={colors.background} strokeWidth={2.5} /></>}
    {name === 'book' && <G fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round"><Rect x={6} y={4} width={22} height={24} rx={3} /><Path d="M11 4v24M16 10h7M16 15h7M3 9v19a3 3 0 0 0 3 3" /></G>}
    {name === 'calendar' && <G fill="none" stroke={color} strokeWidth={2.2}><Rect x={4} y={7} width={24} height={22} rx={4} /><Path d="M4 14h24M10 3v8M22 3v8" /><Circle cx={11} cy={21} r={2} fill={color} /></G>}
    {name === 'today' && <G fill="none" stroke={color} strokeWidth={2} strokeLinecap="round"><Path d="M4 23h24M8 18a8 8 0 0 1 16 0M16 3v4M5 8l3 3M27 8l-3 3M10 28h12" /></G>}
    {name === 'history' && <G fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round"><Path d="M7 27V17M16 27V5M25 27V11" /></G>}
    {name === 'mic' && <G fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round"><Rect x={12} y={3} width={8} height={17} rx={4} /><Path d="M7 14v2a9 9 0 0 0 18 0v-2M16 25v5M11 30h10" /></G>}
    {name === 'type' && <G fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round"><Path d="M4 8V5h24v3M16 5v24M11 29h10" /></G>}
    {name === 'wave' && <G fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round"><Path d="M4 14v4M10 8v16M16 3v26M22 10v12M28 14v4" /></G>}
    {name === 'discover' && <G fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round"><Circle cx={16} cy={16} r={13} /><Path d="m22 10-4 8-8 4 4-8Z" /><Circle cx={16} cy={16} r={1} fill={color} /></G>}
    {name === 'bookmark' && <Path d="M8 3h16v27l-8-5-8 5Z" />}
    {name === 'camera' && <><Path d="M3 10V3h7v3H6v4Zm19-7h7v7h-3V6h-4ZM3 22h3v4h4v3H3Zm23 0h3v7h-7v-3h4Z" /><Path d="M9 9h3v14H9zm5 0h2v14h-2zm4 0h5v14h-5z" /></>}
    {name === 'search' && <><Path fillRule="evenodd" d="M14 3a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm0 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z" /><Path d="m20 23 3-3 8 8-3 3Z" /></>}
    <G fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      {name === 'trash' && <><Path d="M6 9h20M12 9V5h8v4M9 9l1 18h12l1-18M14 14v8M18 14v8" strokeWidth={2} /></>}
      {name === 'plus' && <Path d="M16 6v20M6 16h20" strokeWidth={2.2} />}
      {name === 'minus' && <Path d="M7 16h18" />}
      {name === 'close' && <Path d="m8 8 16 16M24 8 8 24" />}
      {name === 'back' && <Path d="m20 6-10 10 10 10" />}
      {name === 'next' && <Path d="m12 6 10 10-10 10" />}
      {name === 'check' && <Path d="m6 16 7 7L27 7" />}
      {name === 'repeat' && <Path d="M26 13a11 11 0 1 0-1 11M26 5v8h-8" />}
      {name === 'settings' && <><Path d="M5 9h22M5 23h22" /><Circle cx={11} cy={9} r={4} fill={colors.background} /><Circle cx={22} cy={23} r={4} fill={colors.background} /></>}
    </G>
  </Svg>;
}
