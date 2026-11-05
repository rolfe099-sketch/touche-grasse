import { Food } from './model';
// Search vocabulary is an index overlay. Source aliases, provenance and nutrients
// remain untouched. Variants are suggestions, never implied portion conversions.
const groups = [
  ['chicken', 'kylling'], ['spaghetti', 'spagetti'], ['rice', 'ris'],
  ['cheese', 'ost'], ['milk', 'melk'], ['egg', 'eggs'], ['salmon', 'laks'],
  ['beef', 'storfe'], ['pork', 'svin'], ['potato', 'potatoes', 'potet', 'poteter'],
  ['tomato', 'tomatoes', 'tomat', 'tomater'], ['cooked', 'kokt', 'boiled', 'simmered'],
  ['raw', 'ra', 'uncooked'], ['dry', 'torr'], ['fillet', 'filet'],
  ['wholemeal', 'wholegrain', 'fullkorn'], ['homemade', 'hjemmelaget'],
  ['cod', 'torsk'], ['haddock', 'hyse'], ['tuna', 'tunfisk'], ['mackerel', 'makrell'],
  ['oat', 'oats', 'havre'], ['oatmeal', 'havregryn'], ['lentil', 'lentils', 'linse', 'linser'],
  ['chickpea', 'chickpeas', 'kikert', 'kikerter'], ['bean', 'beans', 'bonne', 'bonner'],
  ['carrot', 'carrots', 'gulrot', 'gulrotter'], ['onion', 'onions', 'lok'],
  ['garlic', 'hvitlok'], ['mushroom', 'mushrooms', 'sopp', 'sjampinjong'],
  ['blueberry', 'blueberries', 'blabaer'], ['raspberry', 'raspberries', 'bringebaer'],
  ['strawberry', 'strawberries', 'jordbaer'], ['yoghurt', 'yogurt'],
  ['breast', 'bryst'], ['thigh', 'overlar'], ['skinless', 'skinnfri'],
];
export function vocabulary(words: string[]): string[] {
  const result = new Set(words);
  if (['fried', 'roasted', 'baked', 'grilled'].some(word => result.has(word))) result.add('cooked');
  for (const group of groups) if (group.some(word => result.has(word))) group.forEach(word => result.add(word));
  if (result.has('chicken') && result.has('fillet')) result.add('breast');
  if (result.has('pasta') && result.has('uncooked') && !result.has('fresh') && !result.has('fersk')) { result.add('dry'); result.add('torr'); }
  if (result.has('pasta') && (result.has('dry') || result.has('torr'))) { result.add('uncooked'); result.add('raw'); }
  return [...result];
}
export function ingredientAliases(normalizedNames: string[]): string[] {
  if (normalizedNames.some(name => /\bparmigiano reggiano\b/.test(name))) return ['parmesan', 'parmigiano reggiano', 'parmesan cheese'];
  return normalizedNames.some(name => /^havregryn( |$)/.test(name)) ? ['rolled oats', 'oat flakes'] : [];
}
function words(text: string) { return text.toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
export function cookingRecordAllowed(query: string, food: Food): boolean {
  const source = words(`${food.name} ${food.aliases[0] ?? ''}`), input = words(query);
  const withoutNegations = input.replace(/\b(without|uten)( added| tilsatt)? (fat|oil|butter|fett|olje|smor)\b/g, '');
  const addedFats = [
    [/\b(fried in fat|stekt i fett|with added fat)\b/, /\b(fat|oil|butter|margarine|fett|olje|smor|margarin)\b/],
    [/\b(in oil|i olje|with oil|with added oil)\b/, /\b(oil|olje)\b/],
    [/\b(in butter|i smor|with butter|with added butter)\b/, /\b(butter|smor)\b/],
    [/\b(in margarine|i margarin|with margarine)\b/, /\b(margarine|margarin)\b/],
  ];
  if (addedFats.some(([description, explicit]) => description.test(source) && !explicit.test(withoutNegations))) return false;
  // Whole products such as pesto are explicitly listed ingredients. Do not
  // replace a basic meat/grain query with a prepared dish or coated product.
  if (/\b(chicken|kylling|pasta|salmon|laks|cod|torsk|beef|storfe|pork|svin|rice|ris|egg|eggs|potato|potatoes|potet|poteter)\b/.test(input)) {
    const extras = /\b(pate|paste|postei|breaded|breadcrumbs|battered|panert|nuggets|sausage|polse|sauce|saus|soup|salad|pizza|baguette|butter chicken)\b/;
    if (extras.test(source) && !extras.test(input)) return false;
  }
  return true;
}
export function preparationNeedsChoice(query: string, food: Food): boolean {
  const normalizeWords = (text: string) => text.toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ');
  const source = normalizeWords(`${food.name} ${food.aliases[0] ?? ''}`), input = normalizeWords(query);
  if (input.trim() === 'oatmeal') return true; // May mean dry flakes, flour or prepared porridge.
  const raw = /\b(raw|ra|uncooked|dry|torr)\b/, cooked = /\b(cooked|kokt|boiled|simmered|fried|roasted|grilled|baked|stekt|ovnsstekt)\b/;
  return (raw.test(source) && !raw.test(input)) || (cooked.test(source) && !cooked.test(input));
}
// Basic-ingredient relevance is independent of energy values and uses the source
// description, not catalog IDs. Personal confirmations/favorites rank above it.
export function ingredientRelevance(query: string, names: string[]): number {
  const all = names.join(' ');
  if (query === 'oatmeal') return /\bhavregryn\b|oat flakes|rolled oats/.test(all) ? 400 : /porridge|grot/.test(all) ? 100 : 0;
  const chicken = /\b(chicken|kylling)\b|kyllingfilet/.test(query), pasta = /\b(pasta|spaghetti|spagetti)\b/.test(query);
  if (chicken) {
    if (/\b(pate|paste|postei|liver|lever|skin|heart|stock|soup|sausage)\b/.test(query)) {
      const processed = /\b(pate|paste|postei|sausage|soup|stock)\b/;
      return processed.test(all) && !processed.test(query) ? 0 : 450;
    }
    const head = names.some(name => /^(chicken|kylling)( |$)/.test(name));
    const transformed = /\b(pate|postei|liver|lever|heart|hjerte|skin|skinn|sausage|polse|rissoles|balls|boller|sandwich|salad|soup|sauce|gryte|baby|baguette|butter chicken)\b/.test(all);
    // Skin descriptors on an actual cut do not make it an offal/skin product.
    const cut = /\b(fillet|filet|breast|thigh|leg|drumstick|wing|overlar|larklubbe|vinge)\b/.test(all);
    const offalOrDish = /\b(pate|postei|liver|lever|heart|hjerte|sausage|polse|rissoles|balls|boller|sandwich|salad|soup|sauce|gryte|baby|baguette|butter chicken)\b/.test(all);
    if (head && cut && !offalOrDish) return (/\b(fillet|filet|breast)\b/.test(all) ? (/\b(raw|ra|simmered|kokt)\b/.test(all) ? 440 : 410) : 350) + (/\b(raw|ra)\b/.test(all) ? 80 : 0);
    if (head && !transformed) return 300;
    return 0;
  }
  if (pasta) {
    if (names.some(name => /^pasta plain( |$)/.test(name))) return /\b(fresh|fersk)\b/.test(all) ? 410 : /\b(uncooked|torr)\b/.test(all) ? 540 : 460;
    if (names.some(name => /^pasta (whole|fullkorn)/.test(name))) return 380;
    if (names.some(name => /^pasta (gluten|spaghetti)/.test(name))) return 340;
    return 0;
  }
  const terms = query.split(' ').filter(Boolean);
  const rawPreference = /\b(raw|ra|uncooked|dry|torr)\b/.test(all) && !/\b(cooked|kokt|boiled|simmered|fried|roasted|grilled|baked|stekt|ovnsstekt)\b/.test(query) ? 80 : 0;
  if (terms.length && names.some(name => terms.every(term => name.split(' ').includes(term)) && terms[0] === name.split(' ')[0])) {
    const processed = /\b(soup|salad|sandwich|baguette|sausage|pate|paste|spread|pudding|porridge|sauce|dish|baby|casserole|pizza|burger|nuggets)\b/;
    return processed.test(all) && !processed.test(query) ? 0 : 100 + rawPreference;
  }
  return rawPreference;
}
export function foodLabel(food: Food): string {
  const source = food.provenance.source === 'matvaretabellen' ? (food.aliases[0] ?? food.name).trim() : food.name;
  if (/^Oil, olive, Extra Virgin$/i.test(source)) return 'Extra virgin olive oil';
  if (/^Oil, olive$/i.test(source)) return 'Olive oil';
  if (/^Pasta, plain, uncooked$/i.test(source)) return 'Plain pasta · dry';
  if (/^Pasta, plain, cooked$/i.test(source)) return 'Plain pasta · cooked';
  if (/^Pesto, (green|red), (industrially made|home-made)$/i.test(source)) return source.replace(/^Pesto, (green|red), (industrially made|home-made)$/i, (_, color: string, made: string) => `${color[0].toUpperCase() + color.slice(1)} pesto · ${made === 'home-made' ? 'homemade' : 'store-bought'}`);
  if (/Parmigiano Reggiano/i.test(source)) return 'Parmesan · Parmigiano Reggiano';
  return source.replace(/, without skin/gi, ', skinless').replace(/industrially made/gi, 'store-bought').replace(/home-made/gi, 'homemade').replace(/, (raw|cooked|uncooked|simmered|roasted|fried in fat|fried without fat)$/i, ' · $1').replace(/^Chicken, /, 'Chicken ').replace(/, fillet/, ' fillet');
}
