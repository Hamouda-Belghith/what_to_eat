// Ce fichier est écrit à la main pour démarrer le projet.
// Une fois le projet Supabase créé et la migration appliquée, régénère-le
// automatiquement avec :
//   npx supabase gen types typescript --project-id <ton-project-id> > src/lib/supabase/database.types.ts
// pour rester parfaitement synchronisé avec la vraie base.

export type MealSlot = "breakfast" | "lunch" | "dinner";

export interface Database {
  public: {
    Tables: {
      ingredients: {
        Row: {
          id: string;
          name: string;
          default_unit: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          default_unit: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ingredients"]["Insert"]>;
      };
      dishes: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["dishes"]["Insert"]>;
      };
      dish_ingredients: {
        Row: {
          id: string;
          dish_id: string;
          ingredient_id: string;
          quantity: number;
          unit: string;
        };
        Insert: {
          id?: string;
          dish_id: string;
          ingredient_id: string;
          quantity: number;
          unit: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["dish_ingredients"]["Insert"]
        >;
      };
      meal_cycles: {
        Row: {
          id: string;
          name: string;
          duration_days: number;
          start_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          duration_days: number;
          start_date: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["meal_cycles"]["Insert"]>;
      };
      meal_cycle_entries: {
        Row: {
          id: string;
          meal_cycle_id: string;
          day_offset: number;
          meal_slot: MealSlot;
          dish_id: string;
        };
        Insert: {
          id?: string;
          meal_cycle_id: string;
          day_offset: number;
          meal_slot: MealSlot;
          dish_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["meal_cycle_entries"]["Insert"]
        >;
      };
      planned_meals: {
        Row: {
          id: string;
          date: string;
          meal_slot: MealSlot;
          dish_id: string;
          meal_cycle_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          meal_slot: MealSlot;
          dish_id: string;
          meal_cycle_id?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["planned_meals"]["Insert"]
        >;
      };
      shopping_list_items: {
        Row: {
          id: string;
          ingredient_id: string;
          period_start: string;
          period_end: string;
          quantity: number;
          unit: string;
          is_checked: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ingredient_id: string;
          period_start: string;
          period_end: string;
          quantity: number;
          unit: string;
          is_checked?: boolean;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["shopping_list_items"]["Insert"]
        >;
      };
    };
  };
}
