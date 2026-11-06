import catalog from '../data/catalog.json';
import { D, Food, Recipe, recipePortion, recipeTotal, structuredCopy } from './model';
import { normalize } from './search';
import { ingredientSearchQuery, vocabulary } from './foodLanguage';

// Original editorial recipes, versioned independently of personal recipes.
// Amounts identify a specific source record; matching/search must never substitute it.
type RecipeDefinition = {
  slug: string; name: string; description: string; minutes: number;
  occasion: 'Breakfast' | 'Lunch' | 'Dinner'; mealPrep: boolean;
  ingredients: [foodId: string, grams: string][]; servings: string; steps: string[];
};
export type RecipeIdea = RecipeDefinition & { recipe: Recipe };
const chicken = 'mvt:03.205', pasta = 'mvt:05.016', wholePasta = 'mvt:05.332';
const oil = 'mvt:08.019', broccoli = 'mvt:06.747', tomato = 'mvt:06.070';
const onion = 'mvt:06.042', garlic = 'mvt:06.038', pepper = 'mvt:06.048';
const lemon = 'mvt:06.550', lentils = 'mvt:06.184', oats = 'mvt:05.003';
const blueberries = 'mvt:06.502', cottage = 'mvt:01.028', yogurt = 'mvt:01.334';
const definitions: RecipeDefinition[] = [
  {
    slug: 'chicken-pesto-pasta', name: 'Chicken pesto pasta', description: 'A six-portion staple with broccoli, Parmesan and a measured pesto dressing.',
    minutes: 30, occasion: 'Dinner', mealPrep: true, servings: '6',
    ingredients: [[chicken, '900'], [pasta, '450'], ['mvt:06.144', '90'], [oil, '30'], ['mvt:01.200', '90'], [broccoli, '600']],
    steps: ['Weigh the chicken and broccoli raw, and the pasta dry. Cut the chicken into small, even pieces and the broccoli into florets.', 'Cook the pasta in water according to its package. Add the broccoli for the final few minutes, until tender. Drain.', 'Heat the measured olive oil in a large pan. Cook the chicken in batches, turning, until its centre reaches 74°C on a food thermometer.', 'Combine the chicken, pasta, broccoli and pesto. Grate and fold in the Parmesan. Divide into six equal portions.'],
  },
  {
    slug: 'lemon-chicken-rice', name: 'Lemon chicken & brown rice', description: 'Chicken breast, whole-grain rice and broccoli. A straightforward lunch to portion ahead.',
    minutes: 40, occasion: 'Lunch', mealPrep: true, servings: '4',
    ingredients: [[chicken, '600'], ['mvt:05.021', '240'], [broccoli, '600'], [oil, '20'], [lemon, '80'], [garlic, '10']],
    steps: ['Weigh chicken and broccoli raw, rice dry, and peeled lemon flesh without seeds. Mince the garlic.', 'Cook the rice in water following its package instructions. Steam the broccoli separately until tender.', 'Cut the chicken into even pieces. Cook in the measured oil with the garlic until the centre of the chicken reaches 74°C on a food thermometer.', 'Chop or crush the lemon flesh and fold it into the chicken. Divide the chicken, rice and broccoli into four equal portions.'],
  },
  {
    slug: 'salmon-bulgur', name: 'Salmon, bulgur & broccoli', description: 'An oven-and-stovetop dinner with lemon and whole-grain bulgur.',
    minutes: 30, occasion: 'Dinner', mealPrep: true, servings: '4',
    ingredients: [['mvt:04.220', '600'], ['mvt:05.233', '240'], [broccoli, '600'], [oil, '20'], [lemon, '80']],
    steps: ['Heat the oven to 200°C. Weigh the salmon and broccoli raw, bulgur dry, and peeled lemon flesh without seeds.', 'Place the salmon and broccoli on a lined tray. Distribute the measured oil and chopped lemon over them.', 'Roast until the salmon reaches 63°C in its thickest part on a food thermometer, and the broccoli is tender. Remove either component first if it is ready sooner.', 'Meanwhile, cook the bulgur in water following its package instructions. Divide everything into four equal portions.'],
  },
  {
    slug: 'cod-tomato-lentils', name: 'Cod & tomato lentil pot', description: 'White fish nestled into a garlic, tomato and red-lentil stew.',
    minutes: 35, occasion: 'Dinner', mealPrep: true, servings: '4',
    ingredients: [['mvt:04.038', '800'], [lentils, '200'], [tomato, '800'], [onion, '200'], [oil, '10'], [garlic, '10']],
    steps: ['Weigh boneless cod flesh raw, lentils dry, tomatoes as canned including their juice, and peeled onion and garlic raw. Chop the onion and garlic; rinse the lentils.', 'Soften the onion in the measured oil. Add garlic, tomatoes and lentils, with enough water to keep the lentils submerged.', 'Simmer, stirring and topping up water as needed, until the lentils are tender; follow the lentil package instructions.', 'Add the cod in even pieces. Cover and simmer gently until the fish reaches 63°C on a food thermometer. Divide into four equal portions.'],
  },
  {
    slug: 'beef-lentil-sauce', name: 'Beef & lentil pasta', description: 'Lean mince and lentils stretch a tomato sauce across four substantial portions.',
    minutes: 40, occasion: 'Dinner', mealPrep: true, servings: '4',
    ingredients: [['mvt:03.126', '400'], [lentils, '120'], [wholePasta, '240'], [tomato, '800'], [onion, '200'], [oil, '10'], [garlic, '10']],
    steps: ['Weigh mince and peeled vegetables raw, pasta and lentils dry, and tomatoes as canned including their juice. Chop onion and garlic; rinse lentils.', 'Soften the onion in the measured oil. Add mince and break it apart; cook until it reaches 71°C on a food thermometer. Add the garlic.', 'Stir in the tomatoes and lentils. Simmer with enough added water to keep the lentils submerged, until tender according to the lentil package.', 'Cook the pasta in water following its package. Drain and combine with the sauce, then divide into four equal portions.'],
  },
  {
    slug: 'tofu-lentil-pot', name: 'Tofu & red lentil pot', description: 'A plant-based tomato pot with sweet pepper and plenty of lentils.',
    minutes: 35, occasion: 'Dinner', mealPrep: true, servings: '4',
    ingredients: [['mvt:06.704', '600'], [lentils, '240'], [tomato, '800'], [pepper, '300'], [onion, '200'], [oil, '20'], [garlic, '10']],
    steps: ['Weigh lentils dry, tofu as sold, tomatoes as canned including their juice, and trimmed vegetables raw. Rinse lentils and chop the vegetables and tofu.', 'Soften the onion and pepper in the measured oil. Add garlic, tomatoes and lentils.', 'Simmer with enough added water to keep the lentils submerged, until tender according to their package. Stir regularly.', 'Add the tofu and heat thoroughly, following its package instructions. Divide into four equal portions.'],
  },
  {
    slug: 'yogurt-berry-oats', name: 'Greek yogurt & berry oats', description: 'Thick yogurt, rolled oats and blueberries. Mix ahead or eat straight away.',
    minutes: 5, occasion: 'Breakfast', mealPrep: true, servings: '2',
    ingredients: [[yogurt, '400'], [oats, '100'], [blueberries, '200']],
    steps: ['Weigh plain 2%-fat Greek yogurt, rolled oats and washed fresh blueberries. These amounts use the specific yogurt record shown below; check your own package if different.', 'Stir the oats into the yogurt. Divide between two clean containers and top with blueberries.', 'Eat now, or refrigerate promptly to soften the oats. Add a little drinking water if you prefer a looser texture.'],
  },
  {
    slug: 'cottage-banana-oats', name: 'Banana cottage-cheese oats', description: 'A no-cook breakfast with cottage cheese, banana and rolled oats.',
    minutes: 5, occasion: 'Breakfast', mealPrep: true, servings: '2',
    ingredients: [[cottage, '400'], [oats, '100'], ['mvt:06.525', '200']],
    steps: ['Weigh the banana after peeling. Mash it into the cottage cheese.', 'Fold in the rolled oats, adding a little drinking water if desired.', 'Divide between two clean containers. Eat now or refrigerate promptly.'],
  },
  {
    slug: 'egg-potato-bake', name: 'Spinach & potato egg bake', description: 'Eggs and cottage cheese set around tender potato and spinach.',
    minutes: 45, occasion: 'Lunch', mealPrep: true, servings: '4',
    ingredients: [['mvt:02.001', '400'], [cottage, '400'], ['mvt:06.004', '600'], ['mvt:06.211', '200'], [oil, '10']],
    steps: ['Heat the oven to 190°C. Weigh eggs without shells, potatoes raw after peeling, and washed spinach raw. Dice the potatoes.', 'Boil the potatoes in water until tender and drain well. Wilt the spinach in a covered pan with a splash of water, then drain.', 'Use the measured oil to coat a baking dish. Whisk eggs with cottage cheese; fold in the potatoes and spinach.', 'Bake until set and the centre reaches 74°C on a food thermometer. Divide into four equal portions.'],
  },
  {
    slug: 'tuna-pasta-salad', name: 'Tuna & whole-grain pasta salad', description: 'Drained tuna, crunchy vegetables and a lemon-yogurt dressing.',
    minutes: 25, occasion: 'Lunch', mealPrep: true, servings: '4',
    ingredients: [['mvt:04.108', '400'], [wholePasta, '280'], [pepper, '400'], ['mvt:06.010', '400'], [yogurt, '200'], [lemon, '80'], [oil, '20']],
    steps: ['Weigh pasta dry and tuna after draining its water. Weigh trimmed pepper and cucumber raw, and peeled lemon flesh without seeds.', 'Cook pasta in water following its package instructions. Drain. For a cold salad, cool it quickly under cold running water and drain thoroughly.', 'Chop the vegetables. Mash the lemon flesh and mix with yogurt and the measured oil.', 'Combine with the tuna and pasta, then divide into four equal portions. Eat promptly or refrigerate immediately.'],
  },
  {
    slug: 'quark-blueberry-bowl', name: 'Blueberry quark bowl', description: 'A quick protein-rich base of plain quark, berries and oats.',
    minutes: 5, occasion: 'Breakfast', mealPrep: false, servings: '2',
    ingredients: [['mvt:01.036', '500'], [oats, '80'], [blueberries, '200']],
    steps: ['Weigh plain 1%-fat quark, rolled oats and washed fresh blueberries.', 'Divide the quark between two bowls, then add the oats and blueberries. Stir in a little drinking water if needed.', 'Serve immediately. Refrigerate any uneaten portion promptly.'],
  },
  {
    slug: 'lentil-bulgur-pot', name: 'Lentil & bulgur vegetable pot', description: 'A simple plant-based batch with carrots, tomato and whole-grain bulgur.',
    minutes: 35, occasion: 'Dinner', mealPrep: true, servings: '4',
    ingredients: [[lentils, '280'], ['mvt:05.233', '160'], [tomato, '800'], ['mvt:06.036', '400'], [onion, '200'], [oil, '20'], [garlic, '10']],
    steps: ['Weigh lentils and bulgur dry, peeled carrots, onion and garlic raw, and tomatoes as canned including their juice. Rinse the lentils and finely dice the vegetables.', 'Soften onion and carrots in the measured oil. Add garlic, tomatoes and lentils, with enough water to keep the lentils submerged.', 'Simmer, stirring and adding water as needed, until the lentils are tender according to their package instructions.', 'Cook the bulgur separately in water following its package. Fold it into the vegetable pot and divide into four equal portions.'],
  },
];

export function buildRecipeIdeas(foods: Food[]): RecipeIdea[] {
  const index = new Map(foods.map(food => [food.id, food]));
  return definitions.map(definition => {
    const recipe: Recipe = {
      id: `idea:${definition.slug}:v1`, name: definition.name, servings: definition.servings,
      cookedWeightGrams: null, favorite: false, steps: [...definition.steps],
      ingredients: definition.ingredients.map(([foodId, quantity], i) => {
        const food = index.get(foodId);
        if (!food || food.referenceUnit !== 'g') throw new Error(`Missing gram-based recipe record: ${foodId}`);
        return { id: `${definition.slug}:${i}`, food: structuredCopy(food), quantity, unit: 'g' };
      }),
    };
    recipeTotal(recipe); // Invalid content must fail validation, never become a guessed substitution.
    return { ...definition, recipe };
  });
}
export const recipeIdeas = buildRecipeIdeas(catalog as Food[]);
export const recipeIdeaCopyId = (recipe: Recipe) => `discover:${recipe.id}`;
export type IdeaFilter = 'All ideas' | 'Meal prep' | 'Breakfast' | 'Protein ≥25 g' | 'Fiber ≥8 g' | '≤30 min';
export const ideaFilters: IdeaFilter[] = ['All ideas', 'Meal prep', 'Protein ≥25 g', 'Fiber ≥8 g', 'Breakfast', '≤30 min'];
export function findRecipeIdeas(ideas: RecipeIdea[], query: string, filter: IdeaFilter) {
  const words = ingredientSearchQuery(normalize(query)).split(' ').filter(Boolean);
  return ideas.filter(idea => {
    const nutrition = recipePortion(idea.recipe);
    const text = normalize([idea.name, idea.description, idea.occasion, ...idea.recipe.ingredients.flatMap(i => [i.food.name, ...i.food.aliases])].join(' '));
    const aliases = vocabulary(text.split(' '));
    return words.every(word => text.includes(word) || aliases.includes(word)) && (filter === 'All ideas' || filter === 'Meal prep' && idea.mealPrep || filter === 'Breakfast' && idea.occasion === 'Breakfast' || filter === 'Protein ≥25 g' && nutrition.protein != null && new D(nutrition.protein).gte(25) || filter === 'Fiber ≥8 g' && nutrition.fiber != null && new D(nutrition.fiber).gte(8) || filter === '≤30 min' && idea.minutes <= 30);
  });
}

export const recipeStorageNote = 'Cool cooked portions quickly in small, shallow containers, then refrigerate below 4°C. Freeze portions you will not use soon. Rice and pasta need prompt cooling; reheating cannot make poorly stored food safe. No shelf life is assumed.';
export const recipeSources = {
  dietary: 'https://www.helsenorge.no/kosthold-og-ernaring/kostradene',
  storage: 'https://www.mattilsynet.no/mat-og-drikke/forbrukere/rad-for-oppbevaring-av-mat',
  cooking: 'https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures',
};
