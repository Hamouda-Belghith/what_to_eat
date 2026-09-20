export interface DishIngredient {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
}

export interface Dish {
  id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  /** kcal pour une portion ; null = non renseigné. */
  calories: number | null;
  /** Grammes de protéines pour une portion ; null = non renseigné. */
  proteinG: number | null;
  ingredients: DishIngredient[];
}
