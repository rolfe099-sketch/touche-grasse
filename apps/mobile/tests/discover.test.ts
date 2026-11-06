import { describe, expect, it } from 'vitest';
import catalog from '../src/data/catalog.json';
import { D, Food, foodNutrition, nutrients, recipePortion, recipeTotal, structuredCopy, total } from '../src/domain/model';
import { FoodIndex } from '../src/domain/search';
import { discoverFoods, emptyNutritionRule, ingredientCategories, nutritionRuleError } from '../src/domain/discoverFoods';
import { buildRecipeIdeas, findRecipeIdeas, recipeIdeas } from '../src/domain/recipeIdeas';
const foods = catalog as Food[];
const index = new FoodIndex(); foods.forEach(food => index.add(food));

describe('original recipe collection', () => {
  it('resolves every ingredient to its exact verified source and includes no assumed cooked weight', () => {
    expect(recipeIdeas).toHaveLength(12); expect(new Set(recipeIdeas.map(i => i.slug)).size).toBe(12);
    for (const idea of recipeIdeas) {
      expect(idea.recipe.cookedWeightGrams).toBeNull(); expect(idea.recipe.steps.length).toBeGreaterThanOrEqual(3);
      expect(idea.recipe.ingredients.map(i => i.food.id)).toEqual(idea.ingredients.map(i => i[0]));
      idea.recipe.ingredients.forEach(ingredient => {
        expect(ingredient.food).toEqual(index.get(ingredient.food.id));
        expect(ingredient.food.provenance.source).toBe('matvaretabellen');
        expect(ingredient.unit).toBe('g'); expect(new D(ingredient.quantity).gt(0)).toBe(true);
      });
      const all = recipeTotal(idea.recipe), portion = recipePortion(idea.recipe);
      for (const nutrient of nutrients) {
        expect(all[nutrient]).not.toBeNull();
        expect(portion[nutrient]).toBe(new D(all[nutrient]!).div(idea.servings).toFixed());
      }
      expect(() => recipePortion(idea.recipe, '1', 'g')).toThrow('cooked batch weight');
    }
  });
  it('calculates six chicken-pasta servings from raw chicken, dry pasta and only the stated oil', () => {
    const recipe = recipeIdeas[0].recipe;
    expect(recipe.ingredients.map(i => [i.food.id, i.quantity])).toEqual([['mvt:03.205', '900'], ['mvt:05.016', '450'], ['mvt:06.144', '90'], ['mvt:08.019', '30'], ['mvt:01.200', '90'], ['mvt:06.747', '600']]);
    expect(recipeTotal(recipe).kcal).toBe('3828');
    expect(recipeTotal(recipe)).toEqual(total(recipe.ingredients.map(i => foodNutrition(i.food, i.quantity, i.unit))));
    expect(recipe.ingredients[0].food.aliases[0]).toMatch(/raw/);
    expect(recipe.ingredients[1].food.aliases[0]).toMatch(/uncooked/);
    expect(recipePortion(recipe).protein).toBe('51.735');
  });
  it('fails a missing record instead of searching for a substitute or inventing nutrition', () => {
    expect(() => buildRecipeIdeas(foods.filter(f => f.id !== 'mvt:03.205'))).toThrow('Missing gram-based recipe record');
    const built = buildRecipeIdeas(foods); built[0].recipe.ingredients[0].food.nutrition.kcal = '1';
    expect(index.get('mvt:03.205')!.nutrition.kcal).toBe('111');
    expect(recipeIdeas[0].recipe.ingredients[0].food.nutrition.kcal).toBe('111');
  });
  it('finds ingredient names in English and Norwegian, and filters on per-serving rather than batch totals', () => {
    expect(findRecipeIdeas(recipeIdeas, 'kylling', 'All ideas').map(i => i.slug)).toEqual(['chicken-pesto-pasta', 'lemon-chicken-rice']);
    expect(findRecipeIdeas(recipeIdeas, 'chicken', 'All ideas').map(i => i.slug)).toEqual(['chicken-pesto-pasta', 'lemon-chicken-rice']);
    for (const query of ['chicken breast', 'kyllingbryst']) expect(findRecipeIdeas(recipeIdeas, query, 'All ideas').map(i => i.slug)).toEqual(['chicken-pesto-pasta', 'lemon-chicken-rice']);
    expect(findRecipeIdeas(recipeIdeas, 'ground beef', 'All ideas').map(i => i.slug)).toEqual(['beef-lentil-sauce']);
    expect(findRecipeIdeas(recipeIdeas, 'bell pepper', 'All ideas').map(i => i.slug)).toEqual(['tofu-lentil-pot', 'tuna-pasta-salad']);
    for (const idea of findRecipeIdeas(recipeIdeas, '', 'Protein ≥25 g')) expect(Number(recipePortion(idea.recipe).protein)).toBeGreaterThanOrEqual(25);
    for (const idea of findRecipeIdeas(recipeIdeas, '', 'Fiber ≥8 g')) expect(Number(recipePortion(idea.recipe).fiber)).toBeGreaterThanOrEqual(8);
    expect(findRecipeIdeas(recipeIdeas, '', 'Meal prep').every(i => i.mealPrep)).toBe(true);
    expect(findRecipeIdeas(recipeIdeas, '', '≤30 min').every(i => i.minutes <= 30)).toBe(true);
    expect(findRecipeIdeas(recipeIdeas, '', 'Breakfast')).toHaveLength(3);
    const small = structuredCopy(recipeIdeas[0]); small.recipe.servings = '100';
    expect(findRecipeIdeas([small], '', 'Protein ≥25 g')).toEqual([]);
    small.recipe.servings = '1'; small.recipe.ingredients = [small.recipe.ingredients[0]];
    small.recipe.ingredients[0].quantity = '100'; small.recipe.ingredients[0].food.nutrition.protein = '24.999999999999999999';
    expect(findRecipeIdeas([small], '', 'Protein ≥25 g')).toEqual([]);
    small.recipe.ingredients[0].food.nutrition.protein = null;
    expect(findRecipeIdeas([small], '', 'Protein ≥25 g')).toEqual([]);
    expect(findRecipeIdeas(recipeIdeas, 'imaginarything', 'All ideas')).toEqual([]);
  });
});

describe('ingredient explorer', () => {
  it('uses real curated category records while keeping raw and cooked grain records separate', () => {
    for (const category of ingredientCategories) for (const id of category.ids) expect(index.get(`mvt:${id}`)).toBeDefined();
    const grains = discoverFoods(index, '', 'Pasta & grains', 'Relevant', emptyNutritionRule);
    expect(grains.map(f => f.id)).toContain('mvt:05.016'); expect(grains.map(f => f.id)).toContain('mvt:05.130');
    expect(discoverFoods(index, '', 'Meat', 'Relevant', emptyNutritionRule).map(f => f.id)).toEqual(['mvt:03.205', 'mvt:03.126']);
    expect(discoverFoods(index, 'kyllingbryst', 'Ingredients', 'Relevant', emptyNutritionRule)[0].id).toBe('mvt:03.205');
  });
  it('never compares grams with millilitres or treats unknown values as zero', () => {
    const fixture = new FoodIndex(), base = index.get('mvt:03.205')!;
    fixture.add({ ...base, id: 'grams', name: 'Fixture', aliases: [], nutrition: { ...base.nutrition, protein: '20', fiber: null } });
    fixture.add({ ...base, id: 'millilitres', name: 'Fixture', aliases: [], referenceUnit: 'ml', nutrition: { ...base.nutrition, protein: '99', fiber: '5' } });
    fixture.add({ ...base, id: 'unknown', name: 'Fixture', aliases: [], nutrition: { ...base.nutrition, protein: null, fiber: '2' } });
    expect(discoverFoods(fixture, 'fixture', 'Ingredients', 'Protein', emptyNutritionRule).map(f => f.id)).toEqual(['grams', 'unknown']);
    expect(discoverFoods(fixture, 'fixture', 'Ingredients', 'Protein', { ...emptyNutritionRule, basis: 'ml' }).map(f => f.id)).toEqual(['millilitres']);
    expect(discoverFoods(fixture, 'fixture', 'Ingredients', 'Relevant', { ...emptyNutritionRule, nutrient: 'fiber', maximum: '0' })).toEqual([]);
    expect(discoverFoods(fixture, 'fixture', 'Ingredients', 'Relevant', emptyNutritionRule)).toHaveLength(3);
  });
  it('applies limits before truncation and preserves the existing 50-result quick-search contract', () => {
    const fixture = new FoodIndex(), base = index.get('mvt:03.205')!;
    for (let i = 0; i < 65; i++) fixture.add({ ...base, id: `food-${i}`, name: 'Fixture ' + i, aliases: [], nutrition: { ...base.nutrition, protein: i === 64 ? '90' : '1' } });
    expect(fixture.search('fixture')).toHaveLength(50);
    expect(discoverFoods(fixture, 'fixture', 'Ingredients', 'Relevant', { ...emptyNutritionRule, minimum: '80' }).map(f => f.id)).toEqual(['food-64']);
    expect(fixture.search('fixture')).toHaveLength(50);
  });
  it('supports decimal limits for every nutrient and blocks incomplete or reversed limits', () => {
    for (const nutrient of nutrients) {
      const result = discoverFoods(index, '', 'Ingredients', 'Relevant', { ...emptyNutritionRule, nutrient, minimum: '1,5', maximum: '20' });
      for (const food of result) expect(new D(food.nutrition[nutrient]!).gte('1.5') && new D(food.nutrition[nutrient]!).lte(20)).toBe(true);
    }
    expect(nutritionRuleError({ ...emptyNutritionRule, minimum: '2,' })).toMatch(/complete/);
    expect(nutritionRuleError({ ...emptyNutritionRule, minimum: '3', maximum: '2' })).toMatch(/Minimum/);
    expect(discoverFoods(index, '', 'Ingredients', 'Relevant', { ...emptyNutritionRule, maximum: 'x' })).toEqual([]);
    expect(discoverFoods(index, '', 'Ingredients', 'Calories', emptyNutritionRule)[0].nutrition.kcal).toBe('9');
  });
});
