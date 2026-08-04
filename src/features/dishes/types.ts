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
  ingredients: DishIngredient[];
}
