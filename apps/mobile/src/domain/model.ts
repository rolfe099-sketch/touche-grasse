import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { ingredientText } from './naturalInput';

export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -50, toExpPos: 50 });
export const decimalSchema = z.string().max(100).regex(/^\d+(?:\.\d+)?$/);
export const nutrients = ['kcal', 'protein', 'carbohydrate', 'fat', 'fiber'] as const;
// Optional only for compatibility: old snapshots retain their exact stored shape.
// Missing fiber is unknown, never zero and never backfilled into eaten food.
export const nutritionSchema = z.object({ kcal: decimalSchema.nullable(), protein: decimalSchema.nullable(), carbohydrate: decimalSchema.nullable(), fat: decimalSchema.nullable(), fiber: decimalSchema.nullable().optional() });
export const unitSchema = z.enum(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece']);
export const meals = ['Frokost', 'Lunsj', 'Middag', 'Annet'] as const;
export const foodSchema = z.object({
  id: z.string().min(1).max(200), name: z.string().trim().min(1).max(300), aliases: z.array(z.string().max(200)).max(100),
  barcode: z.string().regex(/^\d{8,14}$/).nullable().optional(), referenceUnit: z.enum(['g', 'ml']), nutrition: nutritionSchema,
  gramsPerMilliliter: decimalSchema.nullable().optional(), gramsPerMeasure: z.record(z.string(), decimalSchema),
  provenance: z.object({ source: z.enum(['matvaretabellen', 'manual', 'confirmedOCR', 'openFoodFacts']), sourceID: z.string(),
    sourceURL: z.string().optional(), retrievedAt: z.string(), nutrientSources: z.record(z.string(), z.string()),
    labelScan: z.object({ engine: z.enum(['platform', 'tesseract']), scannedAt: z.iso.datetime(), confirmedAt: z.iso.datetime(), basis: z.string().max(300), originalNutrition: nutritionSchema }).optional(),
    license: z.literal('ODbL-1.0').optional(), labelReview: z.object({ confirmedAt: z.iso.datetime(), originalName: z.string().max(300), originalNutrition: nutritionSchema, originalReferenceUnit: z.enum(['g', 'ml']).nullable(), nutritionSource: z.string().max(200) }).optional() }),
});
export const ingredientSchema = z.object({ id: z.string(), food: foodSchema, quantity: decimalSchema, unit: unitSchema });
export const recipeSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(300), ingredients: z.array(ingredientSchema).min(1).max(200),
  steps: z.array(z.string().max(5000)).max(100), servings: decimalSchema, cookedWeightGrams: decimalSchema.nullable(), favorite: z.boolean(),
  photo: z.string().max(3000000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
});
export const lineSchema = z.object({ id: z.string(), query: z.string().max(500), quantityText: z.string().max(100), unit: unitSchema, food: foodSchema.nullable(), entrySource: z.enum(['barcode', 'product']).optional() });
export const splitPlanSchema = z.object({ name: z.string().max(300), servingsText: z.string().max(100), cookedWeightText: z.string().max(100) });
export type SplitPlan = z.infer<typeof splitPlanSchema>;
export const draftSchema = z.object({ id: z.string(), text: z.string().max(10000), lines: z.array(lineSchema).max(200), meal: z.enum(meals),
  textRows: z.array(lineSchema.omit({ food: true })).max(200).optional(), splitPlan: splitPlanSchema.optional(), recipeName: z.string().max(300).optional() });
export const snapshotSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('food'), ingredient: ingredientSchema }),
  z.object({ kind: z.literal('recipe'), recipe: recipeSchema, quantity: decimalSchema, unit: z.enum(['servings', 'g']) }),
]);
export const logValueSchema = z.object({ recordedAt: z.iso.datetime(), meal: z.enum(meals), snapshot: snapshotSchema, nutrition: nutritionSchema });
export const logSchema = logValueSchema.extend({ id: z.string(), batchId: z.string(), preparedBatchId: z.string().min(1).optional(), corrections: z.array(z.object({ correctedAt: z.iso.datetime(), previous: logValueSchema })).max(200).optional() });
export const profileSchema = z.object({ firstUsedAt: z.iso.datetime() });
export const recipeDraftSchema = z.object({ recipe: recipeSchema.extend({ name: z.string().max(300), ingredients: z.array(ingredientSchema.extend({ quantity: z.string().max(100) })).max(200), servings: z.string().max(100), cookedWeightGrams: z.string().max(100).nullable() }), instructions: z.string().max(500000), splitPlan: splitPlanSchema.optional() });
export const preparedBatchSchema = z.object({ id: z.string().min(1), createdAt: z.iso.datetime(), recipe: recipeSchema, meal: z.enum(meals) });
export type PreparedBatch = z.infer<typeof preparedBatchSchema>;
export type Nutrition = z.infer<typeof nutritionSchema>;
export type Food = z.infer<typeof foodSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Line = z.infer<typeof lineSchema>;
export type LogEntry = z.infer<typeof logSchema>;
export type Meal = typeof meals[number];
export type IdFactory = () => string;

export function parseAmount(text: string): string | null {
  const value = text.trim();
  if (!/^\d+(?:[.,]\d{1,6})?$/.test(value)) return null;
  const decimal = new D(value.replace(',', '.'));
  return decimal.isFinite() ? decimal.toFixed() : null;
}
export function positive(value: string, limit = '1000000'): Decimal {
  if (!decimalSchema.safeParse(value).success) throw new Error('Enter a valid amount.');
  const result = new D(value);
  if (!result.isFinite() || result.lte(0) || result.gt(limit)) throw new Error('The amount must be greater than zero and within the allowed range.');
  return result;
}
export function validateFood(input: Food): Food {
  const food = foodSchema.parse(input);
  for (const key of nutrients) {
    const value = food.nutrition[key];
    if (value != null && new D(value).gt(key === 'kcal' ? (food.referenceUnit === 'g' ? 1000 : 10000) : (food.referenceUnit === 'g' ? 100 : 10000))) {
      throw new Error('These nutrition values are not plausible. Check the reference amount.');
    }
  }
  const macroTotal = ['protein', 'carbohydrate', 'fat'].reduce((sum, key) => sum.plus(food.nutrition[key as keyof Nutrition] ?? '0'), new D(0));
  if (food.referenceUnit === 'g' && macroTotal.gt(101)) throw new Error('The macronutrients exceed 100 g. Check the values.');
  if (food.gramsPerMilliliter) positive(food.gramsPerMilliliter);
  Object.values(food.gramsPerMeasure).forEach(value => positive(value));
  return food;
}
export function scale(value: Nutrition, factor: Decimal.Value): Nutrition {
  return Object.fromEntries(nutrients.map(key => [key, value[key] == null ? null : new D(value[key]!).times(factor).toFixed()])) as Nutrition;
}
export function scaleRatio(value: Nutrition, numerator: Decimal.Value, denominator: Decimal.Value): Nutrition {
  // Multiply before dividing: a recurring 1/6 factor must not introduce an avoidable rounding residual.
  return Object.fromEntries(nutrients.map(key => [key, value[key] == null ? null : new D(value[key]!).times(numerator).div(denominator).toFixed()])) as Nutrition;
}
export function total(values: Nutrition[]): Nutrition {
  return Object.fromEntries(nutrients.map(key => [key, values.some(n => n[key] == null) ? null : values.reduce((sum, n) => sum.plus(n[key]!), new D(0)).toFixed()])) as Nutrition;
}
export function foodNutrition(food: Food, quantity: string, unit: Unit): Nutrition {
  validateFood(food);
  const amount = positive(quantity);
  let grams: Decimal | undefined;
  let ml: Decimal | undefined;
  if (unit === 'g' || unit === 'kg') grams = amount.times(unit === 'kg' ? 1000 : 1);
  else if (unit === 'ml' || unit === 'l') ml = amount.times(unit === 'l' ? 1000 : 1);
  else if (food.gramsPerMeasure[unit]) grams = amount.times(food.gramsPerMeasure[unit]);
  const density = food.gramsPerMilliliter ? positive(food.gramsPerMilliliter) : undefined;
  const reference = food.referenceUnit === 'g' ? grams ?? (ml && density ? ml.times(density) : undefined) : ml ?? (grams && density ? grams.div(density) : undefined);
  if (!reference) throw new Error('No confirmed conversion for this food. Use ' + food.referenceUnit + '.');
  return scale(food.nutrition, reference.div(100));
}
export function recipeTotal(input: Recipe): Nutrition {
  const recipe = recipeSchema.parse(input);
  positive(recipe.servings, '10000');
  if (recipe.cookedWeightGrams !== null) positive(recipe.cookedWeightGrams);
  if (new Set(recipe.ingredients.map(i => i.id)).size !== recipe.ingredients.length) throw new Error('Ingredients must have unique identities.');
  return total(recipe.ingredients.map(i => foodNutrition(i.food, i.quantity, i.unit)));
}
export function recipePortion(recipe: Recipe, quantity = '1', unit: 'servings' | 'g' = 'servings'): Nutrition {
  const all = recipeTotal(recipe);
  if (unit === 'g' && recipe.cookedWeightGrams === null) throw new Error('Add the cooked batch weight before logging a portion in grams.');
  return scaleRatio(all, positive(quantity), unit === 'g' ? positive(recipe.cookedWeightGrams!) : positive(recipe.servings));
}
export function snapshotNutrition(snapshot: LogEntry['snapshot']): Nutrition {
  return snapshot.kind === 'food' ? foodNutrition(snapshot.ingredient.food, snapshot.ingredient.quantity, snapshot.ingredient.unit) : recipePortion(snapshot.recipe, snapshot.quantity, snapshot.unit);
}
export function lineIngredient(line: Line): Ingredient {
  const quantity = parseAmount(line.quantityText);
  if (!line.food || quantity === null) throw new Error('Choose a food and check the amount on each row.');
  foodNutrition(line.food, quantity, line.unit);
  return { id: line.id, food: line.food, quantity, unit: line.unit };
}
export function emptyDraft(id: IdFactory): Draft { return { id: id(), text: '', lines: [], meal: 'Middag' }; }
export function parseEntry(text: string, id: IdFactory): Line[] {
  const parts = ingredientText(text).split(/(?<!\d),|,(?!\d)|[;\n]/).map(s => s.trim()).filter(Boolean);
  if (text.length > 10000 || parts.length > 200) throw new Error('Enter up to 200 ingredients and 10,000 characters.');
  const units = 'kilograms?|kg|grams?|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|tbsp|tsp|pieces?';
  return parts.map(value => {
    const leading = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${units})\\s+(.+)$`, 'i').exec(value);
    const trailing = leading ? null : new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${units})$`, 'i').exec(value);
    const rawUnit = (leading?.[2] ?? trailing?.[3] ?? 'g').toLowerCase();
    const unit: Unit = /^(kg|kilogram)/.test(rawUnit) ? 'kg' : /^(g|gram)/.test(rawUnit) ? 'g' : /^(ml|millilit)/.test(rawUnit) ? 'ml' : /^(l|lit)/.test(rawUnit) ? 'l' : rawUnit.startsWith('piece') ? 'piece' : rawUnit as Unit;
    return { id: id(), query: leading?.[3] ?? trailing?.[1] ?? value, quantityText: leading?.[1] ?? trailing?.[2] ?? '', unit, food: null };
  });
}
export function duplicateRecipe(recipe: Recipe, id: IdFactory): Recipe {
  return { ...structuredCopy(recipe), id: id(), name: recipe.name + ' (copy)', ingredients: recipe.ingredients.map(i => ({ ...structuredCopy(i), id: id() })) };
}
export function structuredCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function display(value: string | null | undefined, digits = 1): string {
  if (value == null) return '–';
  const rounded = new D(value).toDecimalPlaces(digits).toFixed();
  const [integer, fraction] = rounded.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
}
export function logName(log: LogEntry): string { return log.snapshot.kind === 'food' ? log.snapshot.ingredient.food.name : log.snapshot.recipe.name; }
export function logQuantity(log: LogEntry): string {
  return log.snapshot.kind === 'food' ? `${display(log.snapshot.ingredient.quantity)} ${log.snapshot.ingredient.unit}` : `${display(log.snapshot.quantity)} ${log.snapshot.unit === 'g' ? 'g' : new D(log.snapshot.quantity).eq(1) ? 'serving' : 'servings'}`;
}
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
