import { D, LogEntry, parseAmount, positive, PreparedBatch, preparedBatchSchema, Recipe, recipeTotal } from './model';

export function validateBatch(input: PreparedBatch): PreparedBatch {
  const batch = preparedBatchSchema.parse(input); recipeTotal(batch.recipe);
  if (parseAmount(batch.recipe.servings) === null || (batch.recipe.cookedWeightGrams !== null && parseAmount(batch.recipe.cookedWeightGrams) === null)) throw new Error('Use up to six decimal places for servings and cooked weight.');
  return batch;
}
export function batchBalance(batch: PreparedBatch, logs: LogEntry[]) {
  const recipe = batch.recipe, servings = positive(recipe.servings), weight = recipe.cookedWeightGrams === null ? null : positive(recipe.cookedWeightGrams);
  let usedServings = new D(0), usedGrams = new D(0);
  for (const log of logs) {
    if (log.preparedBatchId !== batch.id) continue;
    if (log.snapshot.kind !== 'recipe' || JSON.stringify(log.batchRecipe ?? log.snapshot.recipe) !== JSON.stringify(recipe)) throw new Error('A saved portion does not match its original batch.');
    if (log.snapshot.recipe.servings !== recipe.servings || log.snapshot.recipe.cookedWeightGrams !== recipe.cookedWeightGrams) throw new Error('A portion correction must keep its original serving and measured weight basis.');
    const amount = positive(log.snapshot.quantity);
    if (parseAmount(log.snapshot.quantity) === null) throw new Error('Use up to six decimal places for a batch portion.');
    if (log.snapshot.unit === 'servings') usedServings = usedServings.plus(amount);
    else { if (!weight) throw new Error('This batch has no measured cooked weight.'); usedGrams = usedGrams.plus(amount); }
  }
  // Compare products before division. Mixed gram/serving portions cannot leave
  // a rounded 1/6 residual that permits overdraw or loses the final portion.
  const numerator = weight ? servings.minus(usedServings).times(weight).minus(usedGrams.times(servings)) : servings.minus(usedServings);
  return { numerator, servings: weight ? numerator.div(weight) : numerator, grams: weight ? numerator.div(servings) : null, weight, totalServings: servings };
}
export function assertBatchCapacity(batches: PreparedBatch[], logs: LogEntry[]) {
  if (logs.some(log => log.batchRecipe && (!log.preparedBatchId || log.snapshot.kind !== 'recipe'))) throw new Error('A batch correction needs its original saved portion.');
  const ids = new Set(batches.map(batch => batch.id));
  if (logs.some(log => log.preparedBatchId && !ids.has(log.preparedBatchId))) throw new Error('The original saved batch is missing.');
  for (const batch of batches) if (batchBalance(batch, logs).numerator.lt(0)) throw new Error('This portion exceeds the amount remaining in the batch.');
}
export function portionFits(batch: PreparedBatch, logs: LogEntry[], quantity: string, unit: 'servings' | 'g') {
  const balance = batchBalance(batch, logs), amount = positive(quantity);
  if (parseAmount(quantity) === null) throw new Error('Use up to six decimal places for a batch portion.');
  if (unit === 'g' && !balance.weight) throw new Error('Add a measured final cooked weight when creating the batch to log grams.');
  const requested = unit === 'g' ? amount.times(balance.totalServings) : balance.weight ? amount.times(balance.weight) : amount;
  if (requested.gt(balance.numerator)) throw new Error('This portion exceeds the amount remaining in the batch.');
}
export function batchRecipe(recipe: Recipe, name: string, servings: string, cookedWeightGrams: string | null): Recipe {
  const copy = { ...recipe, name: name.trim() || recipe.name, servings, cookedWeightGrams, photo: undefined };
  recipeTotal(copy); return copy;
}
