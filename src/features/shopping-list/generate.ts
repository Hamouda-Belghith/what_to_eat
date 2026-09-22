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
 * Ajoute un article à la section « extra » (courses hors plats). Fusionne
 * avec un article existant de même ingrédient + unité sur la période
 * (quantités additionnées) plutôt que de dupliquer une ligne.
 */
export async function addExtraItem(
  periodStart: string,
  periodEnd: string,
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
    await addDemoExtraItem(periodStart, periodEnd, trimmedName, quantity, normalizedUnit);
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
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
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
      period_start: periodStart,
      period_end: periodEnd,
      quantity,
      unit: normalizedUnit,
      section: "extra",
    } as never)) as MutateResult;
    if (error) {
      console.warn("Impossible d'ajouter l'article", error);
      throw new Error("Impossible d'ajouter cet article");
    }
  }

  await refreshShoppingList(periodStart, periodEnd);
}

/**
 * Envoie le contenu actuel d'une section (« dishes » ou « extra ») vers
 * la liste finale. Remplace uniquement les articles de la liste finale
 * précédemment exportés depuis CETTE section (ceux de l'autre section
 * restent intacts) — un nouvel export après régénération/ajout resynchronise
 * donc la liste finale sans dupliquer. L'état coché est conservé pour un
 * article qui reste présent (même ingrédient + unité) d'un export à l'autre.
 */
export async function exportSection(
  periodStart: string,
  periodEnd: string,
  source: "dishes" | "extra"
): Promise<{ count: number }> {
  if (isDemoMode()) {
    const result = await exportDemoSection(periodStart, periodEnd, source);
    return result;
  }

  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase n'est pas configuré");

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Utilisateur non connecté");

  const { data: sourceItems, error: sourceError } = (await supabase
    .from("shopping_list_items")
    .select("ingredient_id, quantity, unit")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .eq("section", source)) as {
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
        ? "« Courses des plats » est vide : rien à exporter."
        : "« Courses supplémentaires » est vide : rien à exporter."
    );
  }

  const { data: previousFinal, error: previousError } = (await supabase
    .from("shopping_list_items")
    .select("id, ingredient_id, unit, is_checked")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .eq("section", "final")
    .eq("origin_section", source)) as {
    data: { id: string; ingredient_id: string; unit: string; is_checked: boolean }[] | null;
    error: PostgrestError | null;
  };

  if (previousError) {
    console.warn("Impossible de charger la liste finale existante", previousError);
    throw new Error("Impossible d'exporter cette section");
  }

  const checkedByKey = new Map(
    (previousFinal ?? []).map((row) => [`${row.ingredient_id}-${row.unit}`, row.is_checked])
  );

  if (previousFinal && previousFinal.length > 0) {
    const { error: delError } = (await supabase
      .from("shopping_list_items")
      .delete()
      .in(
        "id",
        previousFinal.map((row) => row.id)
      )) as MutateResult;
    if (delError) {
      console.warn("Impossible de remplacer les articles déjà exportés", delError);
      throw new Error("Impossible d'exporter cette section");
    }
  }

  const rows = sourceItems.map((item) => ({
    user_id: userId,
    ingredient_id: item.ingredient_id,
    period_start: periodStart,
    period_end: periodEnd,
    quantity: item.quantity,
    unit: item.unit,
    is_checked: checkedByKey.get(`${item.ingredient_id}-${item.unit}`) ?? false,
    section: "final" as const,
    origin_section: source,
  }));

  const { error: insertError } = (await supabase
    .from("shopping_list_items")
    .insert(rows as never)) as MutateResult;

  if (insertError) {
    console.warn("Impossible d'écrire la liste finale", insertError);
    throw new Error("Impossible d'exporter cette section");
  }

  await refreshShoppingList(periodStart, periodEnd);

  return { count: rows.length };
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
