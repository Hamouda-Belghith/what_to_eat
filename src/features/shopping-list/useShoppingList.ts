import type { PostgrestError } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import { queueMutation } from "./syncQueue";
import type { ShoppingListItem } from "./types";
import { isDemoMode } from "@/lib/localDemo";

function mapItem(item: {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  isChecked: boolean;
}): ShoppingListItem {
  return {
    id: item.id,
    ingredientId: item.ingredientId,
    ingredientName: item.ingredientName,
    quantity: item.quantity,
    unit: item.unit,
    isChecked: item.isChecked,
  };
}

/**
 * Source de vérité = Dexie. On lit toujours la table entière pour que
 * useLiveQuery s'abonne correctement (un early-return avant la lecture
 * Dexie empêchait les mises à jour après génération / cochage).
 */
export function useShoppingList(
  periodStart: string,
  periodEnd: string
): ShoppingListItem[] | undefined {
  return useLiveQuery(async () => {
    // Toujours observer la table, même avant d'avoir l'userId.
    const all = await getDb().shoppingListItems.toArray();
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return all
      .filter(
        (item) =>
          item.userId === userId &&
          item.periodStart === periodStart &&
          item.periodEnd === periodEnd
      )
      .map(mapItem)
      .sort((a, b) =>
        a.ingredientName.localeCompare(b.ingredientName, "fr", {
          sensitivity: "base",
        })
      );
  }, [periodStart, periodEnd]);
}

/** Coche/décoche un article : écriture locale immédiate + file de synchro. */
export async function toggleItemChecked(
  itemId: string,
  isChecked: boolean
): Promise<void> {
  await getDb().shoppingListItems.update(itemId, {
    isChecked,
    updatedAt: new Date().toISOString(),
  });

  if (isDemoMode()) return;

  await queueMutation(itemId, "toggle_checked", { isChecked });
}

/**
 * Supprime un article : local d'abord (offline), puis Supabase.
 */
export async function removeItem(itemId: string): Promise<void> {
  await getDb().shoppingListItems.delete(itemId);

  if (isDemoMode()) return;

  const supabase = getSupabase();
  if (!supabase || !navigator.onLine) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = (await supabase
    .from("shopping_list_items")
    .delete()
    .eq("user_id", userId)
    .eq("id", itemId)) as { error: PostgrestError | null };
  if (error) console.warn("Suppression Supabase échouée", error);
}

/**
 * Recharge la liste depuis Supabase vers Dexie pour une période.
 * Remplace entièrement le cache local de cette période.
 */
export async function refreshShoppingList(
  periodStart: string,
  periodEnd: string
): Promise<void> {
  if (isDemoMode()) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  const { data, error } = (await supabase
    .from("shopping_list_items")
    .select(
      "id, ingredient_id, quantity, unit, is_checked, updated_at, ingredients(name)"
    )
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)) as {
    data: Array<{
      id: string;
      ingredient_id: string;
      quantity: number;
      unit: string;
      is_checked: boolean;
      updated_at: string;
      ingredients: { name: string } | null;
    }> | null;
    error: PostgrestError | null;
  };

  if (error || !data) {
    console.warn("Impossible de rafraîchir la liste de courses", error);
    return;
  }

  const db = getDb();
  await db.shoppingListItems
    .where("userId")
    .equals(userId)
    .filter(
      (item) =>
        item.periodStart === periodStart && item.periodEnd === periodEnd
    )
    .delete();

  if (data.length === 0) return;

  await db.shoppingListItems.bulkPut(
    data.map((row) => ({
      id: row.id,
      userId,
      ingredientId: row.ingredient_id,
      ingredientName: row.ingredients?.name ?? "",
      periodStart,
      periodEnd,
      quantity: row.quantity,
      unit: row.unit,
      isChecked: row.is_checked,
      updatedAt: row.updated_at,
    }))
  );
}

/** Vide le cache Dexie pour une période (avant régénération). */
export async function clearLocalShoppingListPeriod(
  periodStart: string,
  periodEnd: string
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    await getDb()
      .shoppingListItems.filter(
        (item) =>
          item.periodStart === periodStart && item.periodEnd === periodEnd
      )
      .delete();
    return;
  }

  await getDb()
    .shoppingListItems.where("userId")
    .equals(userId)
    .filter(
      (item) =>
        item.periodStart === periodStart && item.periodEnd === periodEnd
    )
    .delete();
}
