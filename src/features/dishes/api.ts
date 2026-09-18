import type { PostgrestError } from "@supabase/supabase-js";
import { getCurrentUserId, getSupabase } from "@/lib/supabase/client";
import {
  fetchDemoDishes,
  fetchDemoIngredients,
  saveDemoDish,
  deleteDemoDish,
  isDemoMode,
} from "@/lib/localDemo";
import type { Dish } from "./types";

// Les types du schéma sont écrits à la main (régénération prévue via
// `supabase gen types`). L'inférence de supabase-js produit des `never`
// sans ces casts localisés — on borne donc explicitement les formes.

type Result<T> = { data: T[] | null; error: PostgrestError | null };
type MutateResult = { error: PostgrestError | null };

interface IngredientRow {
  ingredient_id: string;
  quantity: number;
  unit: string;
  ingredients?: { name: string } | null;
}

interface DishRow {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
}

function mapDishRow(row: DishRow, ingRows: IngredientRow[]): Dish {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    photoUrl: row.photo_url,
    ingredients: ingRows.map((r) => ({
      ingredientId: r.ingredient_id,
      ingredientName: r.ingredients?.name ?? "",
      quantity: Number(r.quantity),
      unit: r.unit,
    })),
  };
}

export async function fetchDishes(): Promise<Dish[]> {
  if (isDemoMode()) {
    return fetchDemoDishes();
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = (await supabase
    .from("dishes")
    .select("id, name, description, photo_url")
    .eq("user_id", userId)
    .order("name")) as Result<DishRow>;

  if (error || !data) {
    console.warn("Impossible de charger les plats", error);
    return [];
  }

  const dishes: Dish[] = [];
  for (const row of data) {
    const ingResult = (await supabase
      .from("dish_ingredients")
      .select("ingredient_id, quantity, unit, ingredients(name)")
      .eq("dish_id", row.id)) as Result<IngredientRow>;

    if (ingResult.error || !ingResult.data) {
      console.warn("Impossible de charger les ingrédients du plat", row.id, ingResult.error);
      continue;
    }

    dishes.push(mapDishRow(row, ingResult.data));
  }

  return dishes.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function fetchIngredients(): Promise<string[]> {
  if (isDemoMode()) {
    return fetchDemoIngredients();
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = (await supabase
    .from("ingredients")
    .select("name")
    .eq("user_id", userId)
    .order("name")) as Result<{ name: string }>;

  if (error || !data) {
    console.warn("Impossible de charger les ingrédients", error);
    return [];
  }
  return data.map((row) => row.name);
}

async function upsertIngredient(name: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  // Upsert silencieux : même nom => même ligne (index unique sur user_id + name).
  const { data, error } = (await supabase
    .from("ingredients")
    .upsert(
      { user_id: userId, name, default_unit: "" } as never,
      { onConflict: "user_id,name" } as never
    )
    .select("id")) as Result<{ id: string }>;

  if (error || !data?.[0]) {
    console.warn("Impossible de créer l'ingrédient", name, error);
    return null;
  }
  return data[0].id;
}

const PHOTO_BUCKET = "dish-photos";

/** Extrait le chemin interne au bucket depuis une URL publique Supabase Storage. */
function photoPathFromPublicUrl(url: string): string | null {
  const marker = `/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function uploadDishPhoto(
  userId: string,
  dishId: string,
  dataUrl: string
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type.split("/")[1]?.split("+")[0] || "jpg";
  const path = `${userId}/${dishId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });

  if (error) {
    console.warn("Impossible d'envoyer la photo du plat", error);
    return null;
  }

  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function deleteDishPhoto(photoUrl: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const path = photoPathFromPublicUrl(photoUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.warn("Impossible de supprimer la photo du plat", error);
}

export async function saveDish(
  dish: Omit<Dish, "id" | "photoUrl"> & { id?: string; photoUrl?: string | null }
): Promise<Dish | null> {
  if (isDemoMode()) {
    return saveDemoDish(dish);
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const dishId = dish.id ?? crypto.randomUUID();

  // photoUrl undefined = ne touche pas à la photo existante ; null = la
  // retire ; une data URL (data:...) = nouvelle photo à envoyer.
  let photoUrl: string | null | undefined;
  if (dish.photoUrl === undefined) {
    photoUrl = undefined;
  } else if (dish.photoUrl === null) {
    photoUrl = null;
  } else if (dish.photoUrl.startsWith("data:")) {
    photoUrl = await uploadDishPhoto(userId, dishId, dish.photoUrl);
  } else {
    photoUrl = dish.photoUrl;
  }

  if (dish.photoUrl !== undefined && dish.id) {
    // La photo a changé (nouvelle ou retirée) : nettoie l'ancien fichier.
    const previous = (await supabase
      .from("dishes")
      .select("photo_url")
      .eq("id", dish.id)
      .limit(1)) as Result<{ photo_url: string | null }>;
    const previousUrl = previous.data?.[0]?.photo_url;
    if (previousUrl && previousUrl !== photoUrl) {
      await deleteDishPhoto(previousUrl);
    }
  }

  const payload: Record<string, unknown> = {
    id: dishId,
    user_id: userId,
    name: dish.name.trim(),
    description: dish.description?.trim() || null,
  };
  if (photoUrl !== undefined) payload.photo_url = photoUrl;

  const savedResult = (await supabase
    .from("dishes")
    .upsert(payload as never, { onConflict: "id" } as never)
    .select("id, name, description, photo_url")) as Result<DishRow>;

  if (savedResult.error || !savedResult.data?.[0]) {
    console.warn("Impossible d'enregistrer le plat", savedResult.error);
    return null;
  }

  const { error: delError } = (await supabase
    .from("dish_ingredients")
    .delete()
    .eq("dish_id", dishId)) as MutateResult;
  if (delError) {
    console.warn("Impossible de remplacer les ingrédients du plat", delError);
    return null;
  }

  for (const ing of dish.ingredients) {
    const name = ing.ingredientName.trim();
    if (!name) continue;

    const ingredientId = await upsertIngredient(name);
    if (!ingredientId) continue;

    const { error: insertError } = (await supabase
      .from("dish_ingredients")
      .insert({
        dish_id: dishId,
        ingredient_id: ingredientId,
        quantity: ing.quantity,
        unit: ing.unit.trim() || "pièce",
      } as never)) as MutateResult;
    if (insertError) {
      console.warn("Impossible d'ajouter un ingrédient au plat", insertError);
    }
  }

  return (await fetchDishes()).find((d) => d.id === dishId) ?? null;
}

export async function deleteDish(id: string): Promise<void> {
  if (isDemoMode()) {
    return deleteDemoDish(id);
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const existing = (await supabase
    .from("dishes")
    .select("photo_url")
    .eq("id", id)
    .limit(1)) as Result<{ photo_url: string | null }>;

  const { error } = (await supabase
    .from("dishes")
    .delete()
    .eq("id", id)) as MutateResult;

  if (error) {
    console.warn("Impossible de supprimer le plat", error);
    throw new Error("Suppression du plat impossible");
  }

  const photoUrl = existing.data?.[0]?.photo_url;
  if (photoUrl) await deleteDishPhoto(photoUrl);
}
