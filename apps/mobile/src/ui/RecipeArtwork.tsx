import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { RecipeIdea } from '../domain/recipeIdeas';

// Original, code-drawn cookbook illustrations. These are not meal photographs.
export function recipePaper(idea: RecipeIdea) {
  const ids = idea.recipe.ingredients.map(i => i.food.id);
  return ids.includes('mvt:05.003') ? '#D8C8C3' : ids.some(id => id.startsWith('mvt:04.')) ? '#BCCAD0' : ids.includes('mvt:06.184') ? '#D5B59C' : '#BCC5A7';
}
export function RecipeArtwork({ idea, size = 170 }: { idea: RecipeIdea; size?: number }) {
  const ids = idea.recipe.ingredients.map(i => i.food.id);
  const oats = ids.includes('mvt:05.003'), pasta = ids.some(id => ['mvt:05.016', 'mvt:05.332'].includes(id));
  const salmon = ids.includes('mvt:04.220'), eggs = ids.includes('mvt:02.001'), tofu = ids.includes('mvt:06.704');
  const grains = ids.some(id => ['mvt:05.021', 'mvt:05.233'].includes(id)) && !ids.includes('mvt:06.184');
  return <Svg width={size} height={size} viewBox="0 0 220 220" accessibilityElementsHidden importantForAccessibility="no" aria-hidden>
    <Circle cx={110} cy={113} r={94} fill="#EEE6D4" stroke="#585B44" strokeWidth={1.4} />
    <Circle cx={110} cy={113} r={81} fill={oats ? '#DCCCAE' : '#D7D4AE'} stroke="#A49F82" strokeWidth={1} />
    <Circle cx={110} cy={113} r={89} fill="none" stroke="#A49F82" strokeWidth={.8} />
    {pasta ? <G fill="none" stroke="#B88C48" strokeWidth={9} strokeLinecap="round">
      {[[65, 66, -25], [102, 61, 16], [139, 73, -20], [56, 106, 12], [93, 100, -35], [130, 110, 25], [163, 110, -15], [71, 145, -20], [112, 143, 15], [148, 149, -30]].map(([x, y, angle], i) => <G key={i} transform={`rotate(${angle} ${x} ${y})`}><Path d={`M${x - 9} ${y}q9 -10 18 0q9 10 18 0`} stroke="#B18B46" /><Path d={`M${x - 8} ${y - 2}q8 -8 16 0q9 9 17 0`} stroke="#EBD091" strokeWidth={4} /></G>)}
    </G> : oats ? <G fill="none" stroke="#C6AF83" strokeWidth={3} strokeLinecap="round">
      {[55, 76, 96, 119, 142, 160].map((y, i) => <Path key={y} d={`M${64 + i % 2 * 8} ${y}q26 -14 63 0t28 0`} />)}
    </G> : salmon ? <G transform="rotate(-22 106 107)">
      <Rect x={65} y={57} width={74} height={115} rx={16} fill="#D38867" stroke="#986247" strokeWidth={2} />
      {[72, 90, 108, 126, 144].map(y => <Path key={y} d={`M70 ${y}q26 11 63 0`} stroke="#E9BA95" strokeWidth={4} fill="none" />)}
    </G> : eggs ? <G fill="#E3BE6C" stroke="#AE8D49" strokeWidth={1.5}>
      <Path d="M109 40a73 73 0 1 1-64 112L109 113Z" /><Path d="m109 40 0 73 66 32M109 113l-8 72M109 113l-64 39" fill="none" />
    </G> : grains ? <G fill="#F0DDB5" stroke="#B1A16E" strokeWidth={.8}>
      {Array.from({ length: 32 }, (_, i) => { const angle = i * 2.4, radius = 12 + i % 6 * 10, x = 110 + Math.cos(angle) * radius, y = 111 + Math.sin(angle) * radius; return <Ellipse key={i} cx={x} cy={y} rx={7} ry={2.5} transform={`rotate(${i * 31} ${x} ${y})`} />; })}
    </G> : <G>
      <Ellipse cx={110} cy={111} rx={72} ry={70} fill="#B57851" />
      {Array.from({ length: 35 }, (_, i) => { const angle = i * 2.4, radius = 12 + i % 6 * 10; return <Ellipse key={i} cx={110 + Math.cos(angle) * radius} cy={111 + Math.sin(angle) * radius} rx={5} ry={3.5} fill={i % 3 ? '#D8A466' : '#E9C68D'} transform={`rotate(${i * 17} 110 111)`} />; })}
    </G>}
    {oats ? ids.includes('mvt:06.525') ? <G fill="#E8D29D" stroke="#B5A270" strokeWidth={1}>{[[72, 76], [98, 65], [126, 75], [142, 99], [137, 136]].map(([x, y], i) => <G key={i}><Circle cx={x} cy={y} r={14} /><Path d={`m${x - 4} ${y - 2} 4 2 4-2-3 5h-2Z`} fill="#AF9366" stroke="none" /></G>)}</G> : <G fill="#596A8A" stroke="#424F69" strokeWidth={1}>{[[77, 75], [93, 66], [88, 88], [72, 96], [114, 79], [137, 136], [151, 146], [128, 153]].map(([x, y], i) => <G key={i}><Circle cx={x} cy={y} r={9} /><Path d={`m${x - 3} ${y - 2} 3 2 3-2-2 4h-3Z`} fill="#A8B1BD" stroke="none" /></G>)}</G> : <>
      {(tofu || ids.includes('mvt:03.205')) && <G fill={tofu ? '#E7D9B2' : '#C7A179'} stroke="#A1805D" strokeWidth={1.5}>{[[76, 82, -20], [136, 91, 12], [101, 143, 18]].map(([x, y, angle], i) => <G key={i} transform={`rotate(${angle} ${x} ${y})`}><Rect x={x - 13} y={y - 9} width={27} height={20} rx={tofu ? 3 : 8} /><Path d={`M${x - 6} ${y - 4}v10m7-10v10`} stroke="#E4CBA6" /></G>)}</G>}
      <G stroke="#4A6547" strokeWidth={2} fill="#6C8555"><Path d="m133 68 18-29m-12 18 19-4" /><Ellipse cx={140} cy={45} rx={7} ry={13} transform="rotate(-38 140 45)" /><Ellipse cx={155} cy={50} rx={7} ry={13} transform="rotate(57 155 50)" /><Ellipse cx={153} cy={33} rx={6} ry={12} transform="rotate(35 153 33)" /></G>
      {ids.includes('mvt:06.747') && <G fill="#56724C" stroke="#415A3C" strokeWidth={1}>{[[54, 125], [157, 143], [155, 79]].map(([x, y], i) => <G key={i}><Path d={`m${x} ${y + 15} 0-14`} strokeWidth={5} stroke="#9BA774" /><Circle cx={x - 8} cy={y} r={9} /><Circle cx={x + 7} cy={y - 2} r={10} /><Circle cx={x} cy={y - 8} r={10} /></G>)}</G>}
      {ids.includes('mvt:06.048') && <G fill="none" stroke="#BD7050" strokeWidth={6} strokeLinecap="round"><Path d="m63 69 16-8M149 126l15 7M77 156l12 8" /></G>}
      {ids.includes('mvt:01.200') && <G fill="#F7E6B8"><Path d="m99 64 10 8-16 2Zm50 61 8-5 2 12Zm-65 30 12 3-8 7Z" /></G>}
    </>}
  </Svg>;
}
