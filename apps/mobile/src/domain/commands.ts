import { D, dayKey, Draft, IdFactory, LogEntry, Meal, parseAmount } from './model';
import { commandCourtesy, commandRequest, ingredientText, spokenNumbers } from './naturalInput';
import { editLiveLine, QuickEntryPreferences, updateLiveText } from './quickEntry';
import { FoodIndex, normalize } from './search';

export type MealCommand = { kind: 'draft'; draft: Draft; message: string } | { kind: 'log' } | { kind: 'recipe' } | { kind: 'repeat'; yesterdayMeal?: Meal } | { kind: 'shortcut'; name: string } | { kind: 'portion'; name: string; quantity: string };
export function applyCommand(input: string, draft: Draft, index: FoodIndex, preferences: QuickEntryPreferences, id: IdFactory): MealCommand {
  const text = spokenNumbers(commandRequest(input)).trim().replace(/[.!?]+$/, '')
    .replace(/^(?:I'm|I am) making\s+/i, 'Start a recipe called ')
    .replace(/^jeg lager\s+/i, 'Start a recipe called ')
    .replace(/^endre (.+?) til /i, 'Change $1 to ').replace(/^fjern /i, 'Remove ')
    .replace(/^del (?:det |den )?(?:i |opp i )?/i, 'Split into ').replace(/\bporsjoner?\b/gi, 'servings');
  if (!text) throw new Error('Say or type a command first.');
  if (/^(?:(?:please\s+)?(?:can|could|would|will)\s+(?:you|I)|please\s+(?:do\s+)?not|(?:please\s+)?(?:do\s+not|don't))\b/i.test(text)) throw new Error('Use a direct food command, such as “Add 15g olive oil”. Nothing changed.');
  if (/^(log|save) (it|this|meal|this meal)( now| today)?$/i.test(text)) return { kind: 'log' };
  if (/^(repeat|log) (my |the )?last meal$/i.test(text)) return { kind: 'repeat' };
  const yesterday = /^(?:same|repeat|log)(?: my| the)? (breakfast|lunch|dinner|snack|snacks|frokost|lunsj|middag)(?: as| from)? yesterday$/i.exec(text);
  if (yesterday) return { kind: 'repeat', yesterdayMeal: ({ breakfast: 'Frokost', lunch: 'Lunsj', dinner: 'Middag', snack: 'Annet', snacks: 'Annet', frokost: 'Frokost', lunsj: 'Lunsj', middag: 'Middag' } as Record<string, Meal>)[yesterday[1].toLowerCase()] };
  if (/^(save|open|finish) (this |the )?recipe$/i.test(text)) return { kind: 'recipe' };
  const portion = /^log (\d+(?:[.,]\d+)?) (?:servings?|portions?) of (.+)$/i.exec(text);
  if (portion) { const quantity = parseAmount(portion[1]); if (!quantity || quantity === '0') throw new Error('Check the serving amount.'); return { kind: 'portion', quantity, name: portion[2].trim() }; }
  const named = /^(?:log|repeat) shortcut (.+)$/i.exec(text);
  if (named) return { kind: 'shortcut', name: named[1].trim() };
  const shortcut = /^(?:log|repeat) (my .+?)(?: today)?$/i.exec(text);
  if (shortcut) return { kind: 'shortcut', name: shortcut[1].trim() };
  const recipe = /^(?:start|create|make|name|call) (?:a |this |the )?recipe(?: called| named)?\s+(.+)$/i.exec(text);
  if (recipe) return { kind: 'draft', draft: { ...draft, recipeName: recipe[1].slice(0, 300) }, message: `Recipe: ${recipe[1]}` };
  const split = /^(?:(?:split|divide|make)(?: (?:it|this|the meal))?(?: into)? )?(\d+(?:[.,]\d+)?) (?:servings?|portions?)$/i.exec(text);
  if (split) {
    const servingsText = parseAmount(split[1]); if (!servingsText || servingsText === '0' || Number(servingsText) > 10000) throw new Error('Check the serving count.');
    return { kind: 'draft', draft: { ...draft, splitPlan: { name: draft.recipeName ?? draft.splitPlan?.name ?? 'Meal prep', cookedWeightText: draft.splitPlan?.cookedWeightText ?? '', servingsText } }, message: `Split into ${servingsText} servings · save when ready` };
  }
  const weight = /^(?:set )?(?:final |cooked |final cooked )?(?:batch )?weight(?: to| is)? (\d+(?:[.,]\d+)?)\s*(g|grams?|kg|kilograms?)$/i.exec(text);
  if (weight) {
    const parsed = parseAmount(weight[1]); if (!parsed || parsed === '0') throw new Error('Check the measured weight.');
    const cookedWeightText = /^(kg|kilogram)/i.test(weight[2]) ? new D(parsed).times(1000).toFixed() : parsed;
    return { kind: 'draft', draft: { ...draft, splitPlan: { name: draft.recipeName ?? draft.splitPlan?.name ?? 'Meal prep', servingsText: draft.splitPlan?.servingsText ?? '1', cookedWeightText } }, message: `Measured cooked weight: ${cookedWeightText} g` };
  }
  const change = /^(?:change|set|make) (.+?)(?: to| at| is) (\d+(?:[.,]\d+)?)\s*(g|grams?|kg|kilograms?|ml|milliliters?|l|liters?)$/i.exec(text);
  const remove = /^remove (.+)$/i.exec(text);
  if (change || remove) {
    const target = normalize((change ?? remove)![1]);
    const rows = draft.lines.filter(line => normalize(line.query) === target);
    const candidates = rows.length ? rows : draft.lines.filter(line => normalize(line.query).includes(target) || normalize(line.food?.name ?? '').includes(target));
    if (candidates.length !== 1) throw new Error(candidates.length ? 'More than one ingredient matches. Use the exact row name.' : 'That ingredient is not in this meal.');
    if (remove) return { kind: 'draft', draft: editLiveLine(draft, candidates[0].id, null), message: `${candidates[0].query} removed` };
    const quantityText = parseAmount(change![2]); if (!quantityText || quantityText === '0') throw new Error('Check the ingredient amount.');
    const unit = /^(kg|kilogram)/i.test(change![3]) ? 'kg' : /^(ml|milliliter)/i.test(change![3]) ? 'ml' : /^(l|liter)/i.test(change![3]) ? 'l' : 'g';
    return { kind: 'draft', draft: editLiveLine(draft, candidates[0].id, { quantityText, unit }), message: `${candidates[0].query}: ${quantityText} ${unit}` };
  }
  if (/^(?:change|set|make|remove|split|divide|start|create|save|repeat|finish|open|cancel)\b/i.test(text)) throw new Error('Try “Change chicken to 250g”, “Split into 6 servings” or “Save recipe”.');
  const added = ingredientText(text);
  // Build the next source from current rows, preserving manual additions and selections.
  const previous = draft.lines.map(line => `${line.quantityText}${line.unit} ${line.query.replace(/[,;\n]/g, ' ')}`).join(', ');
  const linked = { ...draft, text: previous, textRows: draft.lines.map(({ id, query, quantityText, unit }) => ({ id, query, quantityText, unit })) };
  const next = updateLiveText([previous, added].filter(Boolean).join(', '), linked, index, preferences, id);
  return { kind: 'draft', draft: next, message: 'Ingredients added · check product matches' };
}

// Only explicit command boundaries split an utterance. Ingredient conjunctions,
// decimal commas and food names remain the ingredient parser's responsibility.
// Nothing is persisted until every clause has validated successfully.
export function applyCommandSequence(input: string, original: Draft, index: FoodIndex, preferences: QuickEntryPreferences, id: IdFactory): { draft: Draft; command: MealCommand } {
  const verb = `(?:${commandCourtesy})?` + '(?:add|include|change|set|remove|split|divide|save|log|repeat|start|create|make|finish|open|final\\s+(?:cooked\\s+)?weight|cooked\\s+weight|legg\\s+til|endre|fjern|del)\\b';
  const numberedServings = '(?:(?:\\d+(?:[.,]\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:servings?|portions?))\\b';
  const boundary = new RegExp('(?:\\s+(?:and\\s+)?then\\s+|\\s+(?:and|og)\\s+|[.;!?]\\s*(?:(?:then|and|og)\\s+)?)(?=(?:' + verb + '|' + commandCourtesy + '|' + numberedServings + '))', 'i');
  const clauses = input.trim().split(boundary).map(clause => clause.trim()).filter(Boolean);
  if (clauses.length > 30) throw new Error('Use up to 30 commands at a time.');
  let draft = original, result: MealCommand | undefined;
  for (let i = 0; i < clauses.length; i++) {
    result = applyCommand(clauses[i], draft, index, preferences, id);
    if (result.kind === 'draft') draft = result.draft;
    else {
      if (i !== clauses.length - 1) throw new Error('Logging or opening a recipe must be the last command. Nothing changed.');
      if (draft !== original && !['log', 'recipe'].includes(result.kind)) throw new Error('Apply ingredient changes before repeating or logging another saved meal. Nothing changed.');
    }
  }
  if (!result) throw new Error('Say or type a command first.');
  return { draft, command: result };
}

export function yesterdayMealEntries(logs: LogEntry[], meal: Meal, now = new Date()): LogEntry[] {
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  return logs.filter(log => log.meal === meal && dayKey(new Date(log.recordedAt)) === dayKey(yesterday));
}
