import { D, Food, Nutrition, parseAmount } from './model';
import { FoodIndex } from './search';

// Curated ingredient picks, not an inferred classification of all source foods.
// Searching still covers the entire index, including personal foods.
export const ingredientCategories = [
  { name: 'Ingredients', ids: ['03.205', '05.016', '04.220', '06.502', '08.019', '01.200'] },
  { name: 'Meat', ids: ['03.205', '03.126'] },
  { name: 'Fish', ids: ['04.220', '04.038', '04.108'] },
  { name: 'Pasta & grains', ids: ['05.016', '05.332', '05.003', '05.021', '05.233', '05.130'] },
  { name: 'Dairy & eggs', ids: ['01.334', '01.028', '01.036', '01.200', '02.001'] },
  { name: 'Vegetables', ids: ['06.747', '06.048', '06.036', '06.042', '06.038', '06.010', '06.004', '06.070', '06.211'] },
  { name: 'Fruit & berries', ids: ['06.502', '06.525', '06.529', '06.550'] },
  { name: 'Pulses & tofu', ids: ['06.184', '06.128', '06.133', '06.704'] },
  { name: 'Oils & nuts', ids: ['08.019', '06.560', '06.555'] },
] as const;
export type FoodSort = 'Relevant' | 'Protein' | 'Fiber' | 'Calories';
export type NutritionRule = { nutrient: keyof Nutrition; minimum: string; maximum: string; basis: 'g' | 'ml' };
export const emptyNutritionRule: NutritionRule = { nutrient: 'protein', minimum: '', maximum: '', basis: 'g' };
export function nutritionRuleError(rule: NutritionRule): string | null {
  const min = rule.minimum.trim() ? parseAmount(rule.minimum) : null, max = rule.maximum.trim() ? parseAmount(rule.maximum) : null;
  if (rule.minimum.trim() && min === null || rule.maximum.trim() && max === null) return 'Enter a complete number for each limit.';
  if (min !== null && max !== null && new D(min).gt(max)) return 'Minimum must be no greater than maximum.';
  return null;
}
export function discoverFoods(index: FoodIndex, query: string, category: string, sort: FoodSort, rule: NutritionRule): Food[] {
  if (nutritionRuleError(rule)) return [];
  const ids = category === 'Ingredients' ? [...new Set(ingredientCategories.flatMap(c => [...c.ids]))] : ingredientCategories.find(c => c.name === category)?.ids ?? [];
  let foods = query.trim() ? index.search(query, false, index.size) : ids.map(id => index.get(`mvt:${id}`)).filter((f): f is Food => !!f);
  const min = rule.minimum.trim() ? parseAmount(rule.minimum) : null, max = rule.maximum.trim() ? parseAmount(rule.maximum) : null;
  // A per-100-ml record is never silently ranked or filtered as per-100-g.
  if (min !== null || max !== null || sort !== 'Relevant') foods = foods.filter(f => f.referenceUnit === rule.basis);
  if (min !== null || max !== null) foods = foods.filter(f => {
    const value = f.nutrition[rule.nutrient];
    return value != null && (min === null || new D(value).gte(min)) && (max === null || new D(value).lte(max));
  });
  if (sort !== 'Relevant') {
    const nutrient = sort === 'Protein' ? 'protein' : sort === 'Fiber' ? 'fiber' : 'kcal';
    foods = [...foods].sort((a, b) => {
      const left = a.nutrition[nutrient], right = b.nutrition[nutrient];
      return left == null ? right == null ? 0 : 1 : right == null ? -1 : new D(left).cmp(right) * (sort === 'Calories' ? 1 : -1);
    });
  }
  return foods;
}
