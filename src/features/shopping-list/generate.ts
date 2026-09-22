import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import { fetchPlannedMeals } from "@/features/planning/api";
import {
  addInclusiveDuration,
  endOfWeek,
  toISODate,
  type DurationUnit,
} from "@/lib/date";
import {
  clearLocalShoppingListPeriod,
  refreshShoppingList,
} from "./useShoppingList";
import {
  addDemoExtraItem,
  clearDemoFinalList,
  exportDemoSection,
  generateDemoShoppingList,
  isDemoMode,
} from "@/lib/localDemo";

type MutateResult = { error: PostgrestError | null };

interface PlannedDishRow {
  id: string;
  dish_ingredients?: {
    ingredient_id: string;
    quantity: number;
    unit: string;
    ingredients?: { name: string } | null;
  }[];
}

/**
 * Agrège les ingrédients des plats planifiés sur une période et écrase
 * la section « dishes » de la liste de courses de cette période (nouvelle
 * génération = nouvelle liste). Les sections « extra » et « final » ne
 * sont pas touchées. Même ingrédient + même unité : quantités
 * additionnées. Un plat planifié plusieurs fois multiplie ses quantités.
 * Un repas spécial (ex. « Manger dehors », voir `features/planning/types.ts`)
 * n'a pas d'ingrédients et n'est jamais compté.
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

  const planned = (await fetchPlannedMeals(periodStart, periodEnd)).filter(
    (meal): meal is typeof meal & { dishId: string } => meal.dishId !== null
  );
  if (planned.length === 0) {
    throw new Error("Aucun repas planifié sur cette période");
  }

  const dishOccurrences = new Map<string, number>();
  for (const meal of planned) {
    dishOccurrences.set(
      meal.dishId,
      (dishOccurrences.get(meal.dishId) ?? 0) + 1
    );
  }

  const dishIds = [...dishOccurrences.keys()];
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

  const totals = new Map<
    string,
    { name: string; quantities: Map<string, number> }
  >();

  for (const row of dishRows) {
    const occurrences = dishOccurrences.get(row.id) ?? 1;
    for (const ing of row.dish_ingredients ?? []) {
      const aggregate = totals.get(ing.ingredient_id) ?? {
        name: ing.ingredients?.name ?? "",
        quantities: new Map<string, number>(),
      };
      const unit = ing.unit || "pièce";
      aggregate.quantities.set(
        unit,
        (aggregate.quantities.get(unit) ?? 0) +
          Number(ing.quantity) * occurrences
      );
      totals.set(ing.ingredient_id, aggregate);
    }
  }

  if (totals.size === 0) {
    throw new Error("Les plats planifiés n'ont pas d'ingrédients");
  }

  const { error: delError } = (await supabase
    .from("shopping_list_items")
    .delete()
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .eq("section", "dishes")) as MutateResult;

  if (delError) {
    console.warn("Impossible de vider l'ancienne liste", delError);
    throw new Error("Impossible de régénérer la liste");
  }

  await clearLocalShoppingListPeriod(periodStart, periodEnd, "dishes");

  const rows: Array<{
    user_id: string;
    ingredient_id: string;
    period_start: string;
    period_end: string;
    quantity: number;
    unit: string;
    section: "dishes";
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
        section: "dishes",
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

  await refreshShoppingList(periodStart, periodEnd);

  return { count: rows.length };
}

/** Trouve ou crée l'ingrédient référentiel correspondant à ce nom. */
async function upsertShoppingIngredient(
  userId: string,
  name: string
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase n'est pas configuré");

  const { data, error } = (await supabase
    .from("ingredients")
    .upsert(
      { user_id: userId, name, default_unit: "" } as never,
      { onConflict: "user_id,name" } as never
    )
    .select("id")) as { data: { id: string }[] | null; error: PostgrestError | null };

  if (error || !data?.[0]) {
    console.warn("Impossible de créer l'ingrédient", name, error);
    throw new Error(`Impossible d'ajouter « ${name} »`);
  }
  return data[0].id;
}

/**
 * Ajoute un article à la section « extra » (courses supplémentaires,
 * liste continue — pas de période). Réutilise l'ingrédient référentiel
 * existant s'il porte déjà ce nom (voir `fetchIngredients`), sinon en
 * crée un nouveau. Fusionne avec un article déjà présent (même
 * ingrédient + unité) plutôt que de dupliquer une ligne.
 */
export async function addExtraItem(
  name: string,
  quantity: number,
  unit: string
): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Le nom de l'article est obligatoire.");
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("La quantité doit être un nombre supérieur à 0.");
  }
  const normalizedUnit = unit.trim() || "pièce";

  if (isDemoMode()) {
    await addDemoExtraItem(trimmedName, quantity, normalizedUnit);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase n'est pas configuré");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Utilisateur non connecté");

  const ingredientId = await upsertShoppingIngredient(userId, trimmedName);

  const { data: existingRows, error: existingError } = (await supabase
    .from("shopping_list_items")
    .select("id, quantity")
    .eq("user_id", userId)
    .is("period_start", null)
    .eq("section", "extra")
    .eq("ingredient_id", ingredientId)
    .eq("unit", normalizedUnit)
    .limit(1)) as { data: { id: string; quantity: number }[] | null; error: PostgrestError | null };

  if (existingError) {
    console.warn("Impossible de vérifier les articles existants", existingError);
    throw new Error("Impossible d'ajouter cet article");
  }

  if (existingRows?.[0]) {
    const { error } = (await supabase
      .from("shopping_list_items")
      .update({
        quantity: Number(existingRows[0].quantity) + quantity,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", existingRows[0].id)) as MutateResult;
    if (error) {
      console.warn("Impossible de mettre à jour l'article", error);
      throw new Error("Impossible d'ajouter cet article");
    }
  } else {
    const { error } = (await supabase.from("shopping_list_items").insert({
      user_id: userId,
      ingredient_id: ingredientId,
      quantity,
      unit: normalizedUnit,
      section: "extra",
    } as never)) as MutateResult;
    if (error) {
      console.warn("Impossible d'ajouter l'article", error);
      throw new Error("Impossible d'ajouter cet article");
    }
  }

  await refreshShoppingList();
}

/**
 * Envoie le contenu actuel d'une section (« dishes » sur `periodStart`/
 * `periodEnd`, ou « extra ») vers la liste « À acheter ». Fusionne avec
 * un article déjà présent (même ingrédient + unité) en additionnant les
 * quantités, plutôt que de dupliquer une ligne — on peut donc exporter
 * plusieurs fois de suite (après avoir régénéré ou ajouté des articles)
 * sans perdre ce qui y était déjà. Un export répété du MÊME contenu
 * (sans rien changer entre les deux clics) additionne deux fois : la
 * liste « À acheter » se vide avec le bouton « Vider », pas en
 * réexportant.
 */
export async function exportSection(
  source: "dishes" | "extra",
  period?: { periodStart: string; periodEnd: string }
): Promise<{ count: number }> {
  if (isDemoMode()) {
    return exportDemoSection(source, period);
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase n'est pas configuré");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Utilisateur non connecté");

  let query = supabase
    .from("shopping_list_items")
    .select("ingredient_id, quantity, unit")
    .eq("user_id", userId)
    .eq("section", source);
  query = source === "dishes" && period
    ? query.eq("period_start", period.periodStart).eq("period_end", period.periodEnd)
    : query.is("period_start", null);

  const { data: sourceItems, error: sourceError } = (await query) as {
    data: { ingredient_id: string; quantity: number; unit: string }[] | null;
    error: PostgrestError | null;
  };

  if (sourceError) {
    console.warn("Impossible de charger la section à exporter", sourceError);
    throw new Error("Impossible d'exporter cette section");
  }
  if (!sourceItems || sourceItems.length === 0) {
    throw new Error(
      source === "dishes"
        ? "« Cette semaine » est vide : rien à exporter."
        : "« Courses supplémentaires » est vide : rien à exporter."
    );
  }

  const { data: existingFinal, error: finalError } = (await supabase
    .from("shopping_list_items")
    .select("id, ingredient_id, unit, quantity")
    .eq("user_id", userId)
    .eq("section", "final")
    .is("period_start", null)) as {
    data: { id: string; ingredient_id: string; unit: string; quantity: number }[] | null;
    error: PostgrestError | null;
  };

  if (finalError) {
    console.warn("Impossible de charger la liste « À acheter »", finalError);
    throw new Error("Impossible d'exporter cette section");
  }

  const existingByKey = new Map(
    (existingFinal ?? []).map((row) => [`${row.ingredient_id}-${row.unit}`, row])
  );

  for (const item of sourceItems) {
    const key = `${item.ingredient_id}-${item.unit}`;
    const existing = existingByKey.get(key);
    if (existing) {
      const { error } = (await supabase
        .from("shopping_list_items")
        .update({
          quantity: Number(existing.quantity) + Number(item.quantity),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existing.id)) as MutateResult;
      if (error) {
        console.warn("Impossible de mettre à jour la liste « À acheter »", error);
        throw new Error("Impossible d'exporter cette section");
      }
    } else {
      const { error } = (await supabase.from("shopping_list_items").insert({
        user_id: userId,
        ingredient_id: item.ingredient_id,
        quantity: item.quantity,
        unit: item.unit,
        section: "final",
      } as never)) as MutateResult;
      if (error) {
        console.warn("Impossible d'écrire la liste « À acheter »", error);
        throw new Error("Impossible d'exporter cette section");
      }
    }
  }

  await refreshShoppingList(period?.periodStart, period?.periodEnd);

  return { count: sourceItems.length };
}

/** Vide entièrement la liste « À acheter » (bouton « Vider »). */
export async function clearFinalList(): Promise<void> {
  if (isDemoMode()) {
    await clearDemoFinalList();
    return;
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase n'est pas configuré");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Utilisateur non connecté");

  const { error } = (await supabase
    .from("shopping_list_items")
    .delete()
    .eq("user_id", userId)
    .eq("section", "final")) as MutateResult;

  if (error) {
    console.warn("Impossible de vider la liste « À acheter »", error);
    throw new Error("Impossible de vider la liste");
  }

  await refreshShoppingList();
}

export interface ShoppingPeriod {
  periodStart: string;
  periodEnd: string;
  amount: number;
  unit: DurationUnit;
}

/** Période par défaut : aujourd'hui → dimanche de la semaine en cours. */
export function getDefaultPeriod(): ShoppingPeriod {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = endOfWeek(today);
  const msPerDay = 24 * 60 * 60 * 1000;
  const days =
    Math.round((sunday.getTime() - today.getTime()) / msPerDay) + 1;

  return {
    periodStart: toISODate(today),
    periodEnd: toISODate(sunday),
    amount: Math.max(1, days),
    unit: "day",
  };
}

/** Calcule la période à partir d'aujourd'hui + durée (nombre + unité). */
export function periodFromDuration(
  amount: number,
  unit: DurationUnit
): ShoppingPeriod {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const safeAmount = Math.max(1, Math.floor(amount));
  return {
    periodStart: toISODate(today),
    periodEnd: toISODate(addInclusiveDuration(today, safeAmount, unit)),
    amount: safeAmount,
    unit,
  };
}
