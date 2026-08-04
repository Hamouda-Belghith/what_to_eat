import Dexie, { type EntityTable } from "dexie";

// Miroir local (offline) de shopping_list_items, voir supabase/migrations.
export interface LocalShoppingListItem {
  id: string; // même id que côté Supabase (uuid généré côté client à la création)
  userId: string;
  ingredientId: string;
  ingredientName: string; // dénormalisé pour affichage offline sans jointure
  periodStart: string; // ISO date (YYYY-MM-DD)
  periodEnd: string;
  quantity: number;
  unit: string;
  isChecked: boolean;
  updatedAt: string;
}

// File d'attente des modifications faites hors-ligne, rejouées vers
// Supabase dès que le réseau est disponible (voir syncQueue.ts).
export interface PendingMutation {
  id: string; // uuid de la mutation elle-même
  userId: string;
  itemId: string; // id du shopping_list_item concerné
  action: "toggle_checked";
  payload: { isChecked: boolean };
  createdAt: string;
}

class MealPlannerDB extends Dexie {
  shoppingListItems!: EntityTable<LocalShoppingListItem, "id">;
  pendingMutations!: EntityTable<PendingMutation, "id">;

  constructor() {
    super("meal-planner");
    this.version(1).stores({
      shoppingListItems: "id, userId, periodStart, periodEnd, ingredientId",
      pendingMutations: "id, userId, itemId, createdAt",
    });
  }
}

let cachedDb: MealPlannerDB | null = null;

// Instance unique partagée dans toute l'app.
// Créée paresseusement : IndexedDB n'existe pas côté serveur (SSR),
// donc getDb() n'est appelé que dans le navigateur (hooks, handlers
// d'événements), jamais au niveau module.
export function getDb(): MealPlannerDB {
  if (!cachedDb) {
    cachedDb = new MealPlannerDB();
  }
  return cachedDb;
}
