import { useLocalSearchParams } from 'expo-router';
import { MealPlanner } from '../src/ui/Planner';
import { Screen } from '../src/ui/components';
export default function Planner() { const params = useLocalSearchParams<{ recipe?: string }>(); return <Screen title="Meal planner" back><MealPlanner recipeId={params.recipe} /></Screen>; }
