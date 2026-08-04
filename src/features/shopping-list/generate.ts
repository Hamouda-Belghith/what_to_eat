import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import { fetchPlannedMeals } from "@/features/planning/api";
import { addDays, toISODate } from "@/lib/date";
import { refreshShoppingList } from "./useShoppingList";
import {
  generateDemoShoppingList,
  isDemoMode,
} from "@/lib/localDemo";

type MutateResult = { error: PostgrestError | null };

interface PlannedDishRow {
  id: string;
  ingredients?: {
    ingredient_id: string;
    quantity: number;
    unit: string;
    ingredients?: { name: string } | null;
  }[];
}

/**
 * Agrège les ingrédients des plats planifiés sur une période et écrase
 * la liste de courses correspondante (nouvelle période = nouvelle liste).
 * Même ingrédient + même unité : quantités additionnées.
 */
export async function generateShoppingList(
  periodStart: string,
  periodEnd: string
): Promise<{ count: number }> {
  if (isDemoMode()) {
    return generateDemoShoppingList(periodStart, periodEnd);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase n'est pas configuré");
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Utilisateur non connecté");

  const planned = await fetchPlannedMeals(periodStart, periodEnd);
  if (planned.length === 0) {
    throw new Error("Aucun repas planifié sur cette période");
  }

  // Charge les plats planifiés avec leurs ingrédients.
  const dishIds = [...new Set(planned.map((m) => m.dishId))];
  const { data: dishRows, error: dishError } = (await supabase
    .from("dishes")
    .select(
      "id, dish_ingredients(ingredient_id, quantity, unit, ingredients(name))"
    )
    .in("id", dishIds)) as {
    data: PlannedDishRow[] | null;
    error: PostgrestError | null;
  };

  if (dishError || !dishRows) {
    console.warn("Impossible de charger les plats pour la liste de courses", dishError);
    throw new Error("Impossible de générer la liste");
  }

  // Agrège par ingrédient, puis par unité.
  const totals = new Map<
    string,
    { name: string; quantities: Map<string, number> }
  >();

  for (const row of dishRows) {
    for (const ing of row.ingredients ?? []) {
      const aggregate = totals.get(ing.ingredient_id) ?? {
        name: ing.ingredients?.name ?? "",
        quantities: new Map<string, number>(),
      };
      const unit = ing.unit || "pièce";
      aggregate.quantities.set(
        unit,
        (aggregate.quantities.get(unit) ?? 0) + Number(ing.quantity)
      );
      totals.set(ing.ingredient_id, aggregate);
    }
  }

  if (totals.size === 0) {
    throw new Error("Les plats planifiés n'ont pas d'ingrédients");
  }

  // Remplacement complet de la liste de la période.
  const { error: delError } = (await supabase
    .from("shopping_list_items")
    .delete()
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)) as MutateResult;

  if (delError) {
    console.warn("Impossible de vider l'ancienne liste", delError);
    throw new Error("Impossible de régénérer la liste");
  }

  const rows: Array<{
    user_id: string;
    ingredient_id: string;
    period_start: string;
    period_end: string;
    quantity: number;
    unit: string;
  }> = [];

  for (const [ingredientId, agg] of totals) {
    for (const [unit, quantity] of agg.quantities) {
      rows.push({
        user_id: userId,
        ingredient_id: ingredientId,
        period_start: periodStart,
        period_end: periodEnd,
        quantity,
        unit,
      });
    }
  }

  const { error: insertError } = (await supabase
    .from("shopping_list_items")
    .insert(rows as never)) as MutateResult;

  if (insertError) {
    console.warn("Impossible d'insérer la liste de courses", insertError);
    throw new Error("Impossible d'enregistrer la liste");
  }

  // Rafraîchit le cache local (Dexie) pour l'affichage offline.
  await refreshShoppingList(periodStart, periodEnd);

  return { count: rows.length };
}

/** Période par défaut : les 7 prochains jours (aujourd'hui inclus). */
export function getDefaultPeriod(): { periodStart: string; periodEnd: string } {
  const today = new Date();
  return { periodStart: toISODate(today), periodEnd: toISODate(addDays(today, 6)) };
}
