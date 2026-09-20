import type { PlannedMeal } from "./types";

export interface DayNutrition {
  calories: number;
  proteinG: number;
  /** Au moins un repas du jour n'a pas de calories renseignées. */
  caloriesIncomplete: boolean;
  /** Au moins un repas du jour n'a pas de protéines renseignées. */
  proteinIncomplete: boolean;
}

/**
 * Additionne les apports des repas donnés. Un plat sans valeur
 * renseignée (`null`) ne compte pas dans la somme mais la marque
 * comme incomplète, pour ne pas afficher un total trompeur.
 */
export function sumNutrition(meals: PlannedMeal[]): DayNutrition {
  const total: DayNutrition = {
    calories: 0,
    proteinG: 0,
    caloriesIncomplete: false,
    proteinIncomplete: false,
  };
  for (const meal of meals) {
    if (meal.dishCalories === null) total.caloriesIncomplete = true;
    else total.calories += meal.dishCalories;
    if (meal.dishProteinG === null) total.proteinIncomplete = true;
    else total.proteinG += meal.dishProteinG;
  }
  return total;
}
