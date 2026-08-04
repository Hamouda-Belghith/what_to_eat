import type { PostgrestError } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import { queueMutation } from "./syncQueue";
import type { ShoppingListItem } from "./types";
import { isDemoMode } from "@/lib/localDemo";

/**
 * Récupère la liste de courses pour une période donnée.
 * Source de vérité = Dexie (local) pour un affichage instantané et
 * offline. Dexie est lui-même rafraîchi depuis Supabase via
 * `refreshShoppingList` (à appeler quand le réseau est là).
 */
export function useShoppingList(
  periodStart: string,
  periodEnd: string
): ShoppingListItem[] | undefined {
  return useLiveQuery(async () => {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const items = await getDb()
      .shoppingListItems.where("userId")
      .equals(userId)
      .and((item) => item.periodStart === periodStart && item.periodEnd === periodEnd)
      .toArray();

    return items.map(
      (item): ShoppingListItem => ({
        id: item.id,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        unit: item.unit,
        isChecked: item.isChecked,
      })
    );
  }, [periodStart, periodEnd]);
}

/** Coche/décoche un article : écriture locale immédiate + file de synchro. */
export async function toggleItemChecked(
  itemId: string,
  isChecked: boolean
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  await getDb().shoppingListItems.update(itemId, {
    isChecked,
    updatedAt: new Date().toISOString(),
  });
  await queueMutation(itemId, "toggle_checked", { isChecked });
}

/**
 * Supprime un article : local d'abord (offline), puis Supabase.
 * En cas d'échec réseau, la suppression locale sera perdue au prochain
 * rafraîchissement complet — on ignore silencieusement (cas rare).
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
 * Recharge la liste de courses depuis Supabase vers Dexie pour une période.
 * À appeler quand le réseau est disponible ; ne bloque pas l'affichage
 * si l'appel échoue (l'utilisateur garde les données locales existantes).
 */
export async function refreshShoppingList(
  periodStart: string,
  periodEnd: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  const { data, error } = (await supabase
    .from("shopping_list_items")
    .select("id, ingredient_id, quantity, unit, is_checked, updated_at, ingredients(name)")
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

  await getDb().shoppingListItems.bulkPut(
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
