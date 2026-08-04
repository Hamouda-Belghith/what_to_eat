import type { MealSlot } from "@/lib/supabase/database.types";
import type { Dish, DishIngredient } from "@/features/dishes/types";
import type { MealCycle, MealCycleEntry } from "@/features/cycles/types";
import type { PlannedMeal } from "@/features/planning/types";
import { getDb } from "./db/dexie";
import { getSupabase } from "./supabase/client";
import { addDays, toISODate } from "./date";

const STORAGE_KEY = "meal-planner-demo-state";

interface DemoIngredient {
  id: string;
  name: string;
  defaultUnit: string;
  createdAt: string;
}

interface DemoDish {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface DemoDishIngredient {
  id: string;
  dishId: string;
  ingredientId: string;
  quantity: number;
  unit: string;
}

interface DemoMealCycle {
  id: string;
  name: string;
  durationDays: number;
  startDate: string;
  createdAt: string;
}

interface DemoMealCycleEntry {
  id: string;
  mealCycleId: string;
  dayOffset: number;
  mealSlot: MealSlot;
  dishId: string;
}

interface DemoPlannedMeal {
  id: string;
  date: string;
  mealSlot: MealSlot;
  dishId: string;
  mealCycleId: string | null;
  createdAt: string;
}

interface DemoState {
  ingredients: DemoIngredient[];
  dishes: DemoDish[];
  dishIngredients: DemoDishIngredient[];
  mealCycles: DemoMealCycle[];
  mealCycleEntries: DemoMealCycleEntry[];
  plannedMeals: DemoPlannedMeal[];
}

function createState(): DemoState {
  return {
    ingredients: [],
    dishes: [],
    dishIngredients: [],
    mealCycles: [],
    mealCycleEntries: [],
    plannedMeals: [],
  };
}

function now(): string {
  return new Date().toISOString();
}

function loadState(): DemoState {
  if (typeof window === "undefined") return createState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DemoState) : createState();
  } catch {
    return createState();
  }
}

function saveState(state: DemoState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function ensureIngredientId(name: string, state: DemoState): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const normalized = normalizeName(trimmed);
  const existing = state.ingredients.find(
    (ingredient) => normalizeName(ingredient.name) === normalized
  );
  if (existing) return existing.id;

  const ingredientId = crypto.randomUUID();
  state.ingredients.push({
    id: ingredientId,
    name: trimmed,
    defaultUnit: "pièce",
    createdAt: now(),
  });
  return ingredientId;
}

export async function fetchDemoIngredients(): Promise<string[]> {
  const state = loadState();
  return state.ingredients
    .map((ingredient) => ingredient.name)
    .sort((a, b) => a.localeCompare(b, "fr"));
}

export async function fetchDemoDishes(): Promise<Dish[]> {
  const state = loadState();

  return state.dishes
    .map((dish) => ({
      id: dish.id,
      name: dish.name,
      description: dish.description,
      ingredients: state.dishIngredients
        .filter((entry) => entry.dishId === dish.id)
        .map((entry) => ({
          ingredientId: entry.ingredientId,
          ingredientName:
            state.ingredients.find((ingredient) => ingredient.id === entry.ingredientId)
              ?.name ?? "",
          quantity: entry.quantity,
          unit: entry.unit,
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function saveDemoDish(
  dish: Omit<Dish, "id"> & { id?: string }
): Promise<Dish | null> {
  const state = loadState();
  const dishId = dish.id ?? crypto.randomUUID();
  const existingIndex = state.dishes.findIndex((row) => row.id === dishId);

  const trimmedName = dish.name.trim();
  if (!trimmedName) return null;

  const dishRow: DemoDish = {
    id: dishId,
    name: trimmedName,
    description: dish.description?.trim() || null,
    createdAt: now(),
  };

  if (existingIndex >= 0) {
    state.dishes[existingIndex] = { ...state.dishes[existingIndex], ...dishRow };
  } else {
    state.dishes.push(dishRow);
  }

  state.dishIngredients = state.dishIngredients.filter(
    (entry) => entry.dishId !== dishId
  );

  for (const ingredient of dish.ingredients) {
    const ingredientId = ensureIngredientId(ingredient.ingredientName, state);
    if (!ingredientId) continue;

    state.dishIngredients.push({
      id: crypto.randomUUID(),
      dishId,
      ingredientId,
      quantity: ingredient.quantity,
      unit: ingredient.unit.trim() || "pièce",
    });
  }

  saveState(state);
  return fetchDemoDishes().then((dishes) => dishes.find((d) => d.id === dishId) ?? null);
}

export async function deleteDemoDish(id: string): Promise<void> {
  const state = loadState();
  state.dishes = state.dishes.filter((dish) => dish.id !== id);
  state.dishIngredients = state.dishIngredients.filter(
    (entry) => entry.dishId !== id
  );
  state.plannedMeals = state.plannedMeals.filter((meal) => meal.dishId !== id);
  saveState(state);
}

export async function fetchDemoDishesForCycles(): Promise<Dish[]> {
  const state = loadState();
  return state.dishes
    .map((dish) => ({
      id: dish.id,
      name: dish.name,
      description: null,
      ingredients: [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function fetchDemoMealCycles(): Promise<MealCycle[]> {
  const state = loadState();
  return state.mealCycles.map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    durationDays: cycle.durationDays,
    startDate: cycle.startDate,
    entries: state.mealCycleEntries
      .filter((entry) => entry.mealCycleId === cycle.id)
      .map((entry) => ({
        dayOffset: entry.dayOffset,
        mealSlot: entry.mealSlot,
        dishId: entry.dishId,
      })),
  }));
}

export async function deleteDemoMealCycle(id: string): Promise<void> {
  const state = loadState();
  state.mealCycles = state.mealCycles.filter((cycle) => cycle.id !== id);
  state.mealCycleEntries = state.mealCycleEntries.filter(
    (entry) => entry.mealCycleId !== id
  );
  saveState(state);
}

export async function saveDemoMealCycle(cycle: {
  id?: string;
  name: string;
  durationDays: number;
  entries: MealCycleEntry[];
}): Promise<MealCycle | null> {
  const state = loadState();
  const cycleId = cycle.id ?? crypto.randomUUID();
  const trimmedName = cycle.name.trim();
  if (!trimmedName) return null;

  const cycleRow: DemoMealCycle = {
    id: cycleId,
    name: trimmedName,
    durationDays: Math.max(1, Math.floor(cycle.durationDays)),
    startDate: cycle.id ? state.mealCycles.find((c) => c.id === cycleId)?.startDate ?? toISODate(new Date()) : toISODate(new Date()),
    createdAt: now(),
  };

  const existingIndex = state.mealCycles.findIndex((row) => row.id === cycleId);
  if (existingIndex >= 0) {
    state.mealCycles[existingIndex] = { ...state.mealCycles[existingIndex], ...cycleRow };
  } else {
    state.mealCycles.push(cycleRow);
  }

  state.mealCycleEntries = state.mealCycleEntries.filter(
    (entry) => entry.mealCycleId !== cycleId
  );

  for (const entry of cycle.entries) {
    if (entry.dayOffset < 0 || entry.dayOffset >= cycleRow.durationDays) continue;
    if (!entry.dishId) continue;
    state.mealCycleEntries.push({
      id: crypto.randomUUID(),
      mealCycleId: cycleId,
      dayOffset: entry.dayOffset,
      mealSlot: entry.mealSlot,
      dishId: entry.dishId,
    });
  }

  saveState(state);
  return fetchDemoMealCycles().then((cycles) => cycles.find((c) => c.id === cycleId) ?? null);
}

export async function fetchDemoPlannedMeals(
  periodStart: string,
  periodEnd: string
): Promise<PlannedMeal[]> {
  const state = loadState();
  return state.plannedMeals
    .filter((meal) => meal.date >= periodStart && meal.date <= periodEnd)
    .map((meal) => ({
      id: meal.id,
      date: meal.date,
      mealSlot: meal.mealSlot,
      dishId: meal.dishId,
      dishName:
        state.dishes.find((dish) => dish.id === meal.dishId)?.name ?? "",
      mealCycleId: meal.mealCycleId,
    }));
}

export async function setDemoPlannedMeal(
  date: string,
  mealSlot: MealSlot,
  dishId: string,
  mealCycleId: string | null = null
): Promise<void> {
  const state = loadState();
  const existingIndex = state.plannedMeals.findIndex(
    (meal) => meal.date === date && meal.mealSlot === mealSlot
  );

  if (existingIndex >= 0) {
    state.plannedMeals[existingIndex] = {
      ...state.plannedMeals[existingIndex],
      dishId,
      mealCycleId,
      createdAt: now(),
    };
  } else {
    state.plannedMeals.push({
      id: crypto.randomUUID(),
      date,
      mealSlot,
      dishId,
      mealCycleId,
      createdAt: now(),
    });
  }

  saveState(state);
}

export async function clearDemoPlannedMeal(
  date: string,
  mealSlot: MealSlot
): Promise<void> {
  const state = loadState();
  state.plannedMeals = state.plannedMeals.filter(
    (meal) => !(meal.date === date && meal.mealSlot === mealSlot)
  );
  saveState(state);
}

export async function applyDemoCycleToRange(
  cycleId: string,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  const state = loadState();
  const cycle = state.mealCycles.find((c) => c.id === cycleId);
  if (!cycle) throw new Error("Cycle introuvable");

  const existingKeys = new Set(
    state.plannedMeals
      .filter((meal) => meal.date >= periodStart && meal.date <= periodEnd)
      .map((meal) => `${meal.date}-${meal.mealSlot}`)
  );

  const cycleEntriesByOffset = new Map(
    state.mealCycleEntries
      .filter((entry) => entry.mealCycleId === cycleId)
      .map((entry) => [`${entry.dayOffset}-${entry.mealSlot}`, entry])
  );

  const cycleStart = new Date(`${cycle.startDate}T00:00:00`);
  const startDate = new Date(`${periodStart}T00:00:00`);
  const endDate = new Date(`${periodEnd}T00:00:00`);

  const msPerDay = 24 * 60 * 60 * 1000;
  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const diffDays = Math.round((cursor.getTime() - cycleStart.getTime()) / msPerDay);
    const cycleOffset = ((diffDays % cycle.durationDays) + cycle.durationDays) % cycle.durationDays;
    const dateStr = toISODate(cursor);

    for (const slot of ["breakfast", "lunch", "dinner"] as MealSlot[]) {
      const entry = cycleEntriesByOffset.get(`${cycleOffset}-${slot}`);
      if (!entry) continue;

      const key = `${dateStr}-${slot}`;
      if (!existingKeys.has(key)) {
        state.plannedMeals.push({
          id: crypto.randomUUID(),
          date: dateStr,
          mealSlot: slot,
          dishId: entry.dishId,
          mealCycleId: cycleId,
          createdAt: now(),
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  saveState(state);
}

export async function generateDemoShoppingList(
  periodStart: string,
  periodEnd: string
): Promise<{ count: number }> {
  const state = loadState();

  const planned = await fetchDemoPlannedMeals(periodStart, periodEnd);
  if (planned.length === 0) {
    throw new Error("Aucun repas planifié sur cette période");
  }

  const ingredientMap = new Map<string, string>();
  for (const ingredient of state.ingredients) {
    ingredientMap.set(ingredient.id, ingredient.name);
  }

  const dishIngredientRows = state.dishIngredients.filter((entry) =>
    planned.some((meal) => meal.dishId === entry.dishId)
  );

  const totals = new Map<string, Map<string, number>>();
  for (const row of dishIngredientRows) {
    const name = ingredientMap.get(row.ingredientId) ?? "";
    if (!name) continue;

    const unitTotals = totals.get(row.ingredientId) ?? new Map();
    unitTotals.set(row.unit, (unitTotals.get(row.unit) ?? 0) + row.quantity);
    totals.set(row.ingredientId, unitTotals);
  }

  if (totals.size === 0) {
    throw new Error("Les plats planifiés n'ont pas d'ingrédients");
  }

  const db = getDb();
  await db.shoppingListItems
    .where("periodStart")
    .equals(periodStart)
    .and((item) => item.periodEnd === periodEnd)
    .delete();

  const rows: Array<{
    id: string;
    ingredientId: string;
    ingredientName: string;
    periodStart: string;
    periodEnd: string;
    quantity: number;
    unit: string;
    isChecked: boolean;
    updatedAt: string;
  }> = [];

  for (const [ingredientId, unitTotals] of totals) {
    for (const [unit, quantity] of unitTotals) {
      rows.push({
        id: crypto.randomUUID(),
        ingredientId,
        ingredientName: ingredientMap.get(ingredientId) ?? "",
        periodStart,
        periodEnd,
        quantity,
        unit,
        isChecked: false,
        updatedAt: now(),
      });
    }
  }

  await db.shoppingListItems.bulkAdd(rows);
  return { count: rows.length };
}

export async function refreshDemoShoppingList(
  _periodStart: string,
  _periodEnd: string
): Promise<void> {
  return;
}

export function isDemoMode(): boolean {
  return getSupabase() === null;
}
