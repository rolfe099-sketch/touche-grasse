// Deterministic language cleanup only. Nutrition and preparation are never inferred.
const digits: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
export function spokenNumbers(text: string): string {
  return text.replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[ -]+(?:and[ -]+)?(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand))*\b(?=\s*(?:grams?|g\b|kilograms?|kg\b|milliliters?|ml\b|liters?|l\b|servings?|portions?))/gi, value => {
    let sum = 0, group = 0;
    for (const word of value.toLowerCase().split(/[ -]+/)) { if (word === 'and') continue; if (word === 'hundred') group = (group || 1) * 100; else if (word === 'thousand') { sum += (group || 1) * 1000; group = 0; } else group += digits[word]; }
    return String(sum + group);
  });
}
export function ingredientText(input: string): string {
  const measured = String.raw`\d+(?:[.,]\d+)?\s*(?:kilograms?|kg|grams?|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|tbsp|tsp|pieces?)\b`;
  const verb = String.raw`(?:please\s+)?(?:add|include|log|legg\s+til)`;
  const connector = String.raw`(?:and(?:\s+(?:then|also))?|then|plus|also|as\s+well\s+as|og(?:\s+så)?|så|deretter|pluss)`;
  return spokenNumbers(input).trim().replace(new RegExp(String.raw`^(?:(?:${connector}\s+)?${verb}|i ate|i had|i have eaten)\s+`, 'i'), '').replace(/[.!?]+$/, '')
    .replace(/\b(grams?|kilograms?|millilit(?:er|re)s?|lit(?:er|re)s?|g|kg|ml|l)\s+of\s+/gi, '$1 ')
    // Only a new measured clause creates a boundary. Food names such as
    // "macaroni and cheese" and decimal commas must remain intact.
    .replace(new RegExp(String.raw`(?:\s*[,;.!?]\s*|\s+)${connector}\s+(?:${verb}\s+)?(?=${measured})`, 'gi'), ', ')
    .replace(new RegExp(String.raw`(?:\s*[,;.!?]\s*|\s+)${verb}\s+(?=${measured})`, 'gi'), ', ');
}
