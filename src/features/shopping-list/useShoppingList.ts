import type { PostgrestError } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type LocalShoppingListItem } from "@/lib/db/dexie";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import { queueMutation } from "./syncQueue";
import type { ShoppingListItem } from "./types";
import { isDemoMode } from "@/lib/localDemo";

function mapItem(item: LocalShoppingListItem): ShoppingListItem {
  return {
    id: item.id,
    ingredientId: item.ingredientId,
    ingredientName: item.ingredientName,
    quantity: item.quantity,
    unit: item.unit,
    isChecked: item.isChecked,
    section: item.section,
  };
}

export interface ShoppingListItemWithPeriod extends ShoppingListItem {
  /** Uniquement pour la section « dishes » ; `null` pour « extra »/« final ». */
  periodStart: string | null;
  periodEnd: string | null;
}

/**
 * Source de vérité = Dexie. On lit toujours la table entière pour que
 * useLiveQuery s'abonne correctement (un early-return avant la lecture
 * Dexie empêchait les mises à jour après génération / cochage).
 *
 * Renvoie TOUS les articles de l'utilisateur (les trois sections) — à
 * l'appelant de filtrer par section, et par période pour « dishes »
 * (seule section liée à une période).
 */
export function useShoppingList(): ShoppingListItemWithPeriod[] | undefined {
  return useLiveQuery(async () => {
    // Toujours observer la table, même avant d'avoir l'userId.
    const all = await getDb().shoppingListItems.toArray();
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return all
      .filter((item) => item.userId === userId)
      .map((item) => ({
        ...mapItem(item),
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
      }))
      .sort((a, b) =>
        a.ingredientName.localeCompare(b.ingredientName, "fr", {
          sensitivity: "base",
        })
      );
  }, []);
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

interface RemoteRow {
  id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  is_checked: boolean;
  section: "dishes" | "extra" | "final";
  period_start: string | null;
  period_end: string | null;
  updated_at: string;
  ingredients: { name: string } | null;
}

function toLocalRow(row: RemoteRow, userId: string): LocalShoppingListItem {
  return {
    id: row.id,
    userId,
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredients?.name ?? "",
    periodStart: row.period_start,
    periodEnd: row.period_end,
    quantity: row.quantity,
    unit: row.unit,
    isChecked: row.is_checked,
    section: row.section,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  "id, ingredient_id, quantity, unit, is_checked, section, period_start, period_end, updated_at, ingredients(name)";

/**
 * Recharge le cache Dexie depuis Supabase : les sections « extra » et
 * « final » en entier (listes continues, pas de période), plus la
 * section « dishes » pour `periodStart`/`periodEnd` si fournis (omis
 * quand on n'a pas encore de période à afficher, ex. avant que l'onglet
 * « Cette semaine » ait choisi sa durée).
 */
export async function refreshShoppingList(
  periodStart?: string,
  periodEnd?: string
): Promise<void> {
  if (isDemoMode()) return;

  const supabase = getSupabase();
  if (!supabase) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  const ongoingQuery = supabase
    .from("shopping_list_items")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .in("section", ["extra", "final"]) as unknown as {
    data: RemoteRow[] | null;
    error: PostgrestError | null;
  };
  const { data: ongoing, error: ongoingError } = await ongoingQuery;

  if (ongoingError || !ongoing) {
    console.warn("Impossible de rafraîchir la liste de courses", ongoingError);
    return;
  }

  let dishesRows: RemoteRow[] = [];
  if (periodStart && periodEnd) {
    const { data, error } = (await supabase
      .from("shopping_list_items")
      .select(SELECT_COLUMNS)
      .eq("user_id", userId)
      .eq("section", "dishes")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)) as { data: RemoteRow[] | null; error: PostgrestError | null };
    if (error) {
      console.warn("Impossible de rafraîchir la section « Cette semaine »", error);
    } else {
      dishesRows = data ?? [];
    }
  }

  const db = getDb();

  await db.shoppingListItems
    .where("userId")
    .equals(userId)
    .filter((item) => item.section === "extra" || item.section === "final")
    .delete();

  if (periodStart && periodEnd) {
    await db.shoppingListItems
      .where("userId")
      .equals(userId)
      .filter(
        (item) =>
          item.section === "dishes" &&
          item.periodStart === periodStart &&
          item.periodEnd === periodEnd
      )
      .delete();
  }

  const rows = [...ongoing, ...dishesRows].map((row) => toLocalRow(row, userId));
  if (rows.length > 0) {
    await db.shoppingListItems.bulkPut(rows);
  }
}

/**
 * Vide le cache Dexie pour une période, limité à une section si fournie
 * (sinon toutes les sections) — sert avant de régénérer la section
 * « dishes ».
 */
export async function clearLocalShoppingListPeriod(
  periodStart: string,
  periodEnd: string,
  section?: LocalShoppingListItem["section"]
): Promise<void> {
  const matches = (item: LocalShoppingListItem) =>
    item.periodStart === periodStart &&
    item.periodEnd === periodEnd &&
    (section === undefined || item.section === section);

  const userId = await getCurrentUserId();
  if (!userId) {
    await getDb().shoppingListItems.filter(matches).delete();
    return;
  }

  await getDb()
    .shoppingListItems.where("userId")
    .equals(userId)
    .filter(matches)
    .delete();
}
