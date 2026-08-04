"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
  addDays,
  startOfWeek,
  toISODate,
  formatDateShort,
  formatDateLong,
} from "@/lib/date";
import type { MealSlot } from "@/lib/supabase/database.types";
import type { Dish } from "@/features/dishes/types";
import type { MealCycle } from "@/features/cycles/types";
import {
  fetchDishesForCycles,
  fetchMealCycles,
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
} from "@/features/cycles/api";
import {
  applyCycleToRange,
  clearPlannedMeal,
  fetchPlannedMeals,
  setPlannedMeal,
} from "./api";
import type { PlannedMeal } from "./types";

const WEEK_DAYS = 7;
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function PlanningScreen() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date())
  );

  const [meals, setMeals] = useState<PlannedMeal[] | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [cycles, setCycles] = useState<MealCycle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Cellule de planning cliquée → modale de choix du plat
  const [editingCell, setEditingCell] = useState<{
    date: string;
    mealSlot: MealSlot;
  } | null>(null);

  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(addDays(weekStart, WEEK_DAYS - 1));

  async function loadMeals() {
    const [mealRows, dishRows, cycleRows] = await Promise.all([
      fetchPlannedMeals(weekStartISO, weekEndISO),
      fetchDishesForCycles(),
      fetchMealCycles(),
    ]);
    setMeals(mealRows);
    setDishes(dishRows);
    setCycles(cycleRows);
  }

  useEffect(() => {
    loadMeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO]);

  function previousWeek() {
    setWeekStart((prev) => addDays(prev, -7));
  }

  function nextWeek() {
    setWeekStart((prev) => addDays(prev, 7));
  }

  function currentWeek() {
    setWeekStart(startOfWeek(new Date()));
  }

  async function handleCellClick(date: string, mealSlot: MealSlot) {
    setEditingCell({ date, mealSlot });
  }

  async function handlePickDish(dishId: string | null) {
    if (!editingCell) return;
    const { date, mealSlot } = editingCell;
    setEditingCell(null);
    setBusy(true);
    try {
      if (dishId === null) {
        await clearPlannedMeal(date, mealSlot);
      } else {
        const existing = meals?.find(
          (m) => m.date === date && m.mealSlot === mealSlot
        );
        await setPlannedMeal(date, mealSlot, dishId, existing?.mealCycleId ?? null);
      }
      await loadMeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(cycleId: string) {
    setActionError(null);
    setBusy(true);
    try {
      await applyCycleToRange(cycleId, weekStartISO, weekEndISO);
      await loadMeals();
      setGenerating(false);
      setSelectedCycleId("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setBusy(false);
    }
  }

  const editingMeal = editingCell
    ? (meals ?? []).find(
        (m) => m.date === editingCell.date && m.mealSlot === editingCell.mealSlot
      )
    : undefined;

  return (
    <div className="screen">
      <div className="row-spread" style={{ marginBottom: "0.25rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Planning</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Semaine du {formatDateLong(weekStartISO)}
          </p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={previousWeek} aria-label="Semaine précédente">
            ←
          </Button>
          <Button variant="ghost" onClick={currentWeek}>
            Cette semaine
          </Button>
          <Button variant="ghost" onClick={nextWeek} aria-label="Semaine suivante">
            →
          </Button>
          <Button
            variant="primary"
            onClick={() => setGenerating(true)}
            disabled={cycles.length === 0}
            title={cycles.length === 0 ? "Crée d'abord un cycle" : undefined}
          >
            Générer un cycle
          </Button>
        </div>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", fontWeight: 700 }}>{error}</p>
      ) : null}

      {meals === null ? (
        <Spinner />
      ) : (
        <div className="week-grid">
          <div>
            <div style={{ height: "2rem" }} />
            {MEAL_SLOTS.map((slot) => (
              <div key={slot} className="week-slot-label">
                {MEAL_SLOT_LABELS[slot]}
              </div>
            ))}
          </div>

          {Array.from({ length: WEEK_DAYS }, (_, i) => {
            const date = addDays(weekStart, i);
            const dateISO = toISODate(date);
            const isToday = dateISO === toISODate(new Date());
            const bySlot = new Map(
              (meals ?? [])
                .filter((m) => m.date === dateISO)
                .map((m) => [m.mealSlot, m])
            );

            return (
              <div key={dateISO} className="week-day-col">
                <div className={`week-day-head ${isToday ? "today" : ""}`}>
                  {DAY_LABELS[i]}
                  <br />
                  <span style={{ fontSize: "0.8rem" }}>
                    {formatDateShort(dateISO).split(" ")[1] ?? ""}
                  </span>
                </div>
                {MEAL_SLOTS.map((slot) => {
                  const meal = bySlot.get(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`meal-cell ${meal ? "" : "meal-cell-empty"}`}
                      onClick={() => handleCellClick(dateISO, slot)}
                      style={{ textAlign: "left" }}
                    >
                      {meal ? (
                        <>
                          <span className="meal-cell-name">{meal.dishName}</span>
                          {meal.mealCycleId ? (
                            <span className="meal-cell-override">cycle</span>
                          ) : null}
                        </>
                      ) : (
                        <span>+</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {generating ? (
        <Modal
          title="Générer un cycle sur la semaine"
          onClose={() => setGenerating(false)}
        >
          <p style={{ marginTop: 0, color: "var(--muted)" }}>
            Les repas déjà planifiés ne seront pas écrasés.
          </p>
          <div className="field">
            <label htmlFor="cycle-select">Cycle</label>
            <select
              id="cycle-select"
              className="select"
              value={selectedCycleId}
              onChange={(e) => setSelectedCycleId(e.target.value)}
            >
              <option value="">— Choisir un cycle —</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
          </div>
          {actionError ? (
            <p style={{ color: "var(--danger)", fontWeight: 700 }}>{actionError}</p>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setGenerating(false)}>
              Annuler
            </Button>
            <Button
              disabled={!selectedCycleId || busy}
              onClick={() => handleGenerate(selectedCycleId)}
            >
              Générer
            </Button>
          </div>
        </Modal>
      ) : null}

      {editingCell ? (
        <Modal
          title={`${formatDateLong(editingCell.date)} — ${MEAL_SLOT_LABELS[editingCell.mealSlot]}`}
          onClose={() => setEditingCell(null)}
        >
          <div className="stack">
            <button
              type="button"
              className="btn btn-block"
              onClick={() => handlePickDish(null)}
              disabled={!editingMeal}
            >
              Retirer le repas
            </button>
            {dishes.map((dish) => (
              <button
                key={dish.id}
                type="button"
                className="btn btn-block"
                onClick={() => handlePickDish(dish.id)}
              >
                {dish.name}
              </button>
            ))}
            {dishes.length === 0 ? (
              <p className="empty" style={{ padding: "1rem" }}>
                Aucun plat. Crée d'abord des plats dans l'onglet « Plats ».
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
