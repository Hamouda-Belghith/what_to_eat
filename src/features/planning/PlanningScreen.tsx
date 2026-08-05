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
import {
  fetchDishesForCycles,
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
} from "@/features/cycles/api";
import { fetchPlannedMeals } from "./api";
import {
  ensurePatternApplied,
  getRepeatConfig,
  setMealWithScope,
  setRepeatInterval,
  type MealEditScope,
  type RepeatConfig,
  type RepeatInterval,
} from "./repeat";
import type { PlannedMeal } from "./types";

const WEEK_DAYS = 7;
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function PlanningScreen() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date())
  );

  const [meals, setMeals] = useState<PlannedMeal[] | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [repeat, setRepeat] = useState<RepeatConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingCell, setEditingCell] = useState<{
    date: string;
    mealSlot: MealSlot;
  } | null>(null);

  const [pendingEdit, setPendingEdit] = useState<{
    date: string;
    mealSlot: MealSlot;
    dishId: string | null;
  } | null>(null);

  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(addDays(weekStart, WEEK_DAYS - 1));

  async function loadMeals() {
    await ensurePatternApplied(weekStartISO, weekEndISO);
    const [mealRows, dishRows, repeatConfig] = await Promise.all([
      fetchPlannedMeals(weekStartISO, weekEndISO),
      fetchDishesForCycles(),
      getRepeatConfig(),
    ]);
    setMeals(mealRows);
    setDishes(dishRows);
    setRepeat(repeatConfig);
  }

  useEffect(() => {
    void loadMeals().catch((err) => {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    });
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

  async function handleRepeatChange(value: string) {
    setBusy(true);
    setError(null);
    try {
      const interval: RepeatInterval | null =
        value === "1" ? 1 : value === "2" ? 2 : null;
      const config = await setRepeatInterval(interval, weekStartISO);
      setRepeat(config);
      await loadMeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Répétition impossible");
    } finally {
      setBusy(false);
    }
  }

  async function handleResyncPattern() {
    if (!repeat?.intervalWeeks) return;
    setBusy(true);
    setError(null);
    try {
      const config = await setRepeatInterval(repeat.intervalWeeks, weekStartISO);
      setRepeat(config);
      await loadMeals();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Mise à jour du motif impossible"
      );
    } finally {
      setBusy(false);
    }
  }

  function handleCellClick(date: string, mealSlot: MealSlot) {
    setEditingCell({ date, mealSlot });
  }

  function handlePickDish(dishId: string | null) {
    if (!editingCell) return;
    const { date, mealSlot } = editingCell;
    setEditingCell(null);

    if (repeat?.active) {
      setPendingEdit({ date, mealSlot, dishId });
      return;
    }

    void applyEdit(date, mealSlot, dishId, null);
  }

  async function applyEdit(
    date: string,
    mealSlot: MealSlot,
    dishId: string | null,
    scope: MealEditScope | null
  ) {
    setBusy(true);
    setError(null);
    try {
      await setMealWithScope(date, mealSlot, dishId, scope);
      await loadMeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  async function handleScopeChoice(scope: MealEditScope) {
    if (!pendingEdit) return;
    const { date, mealSlot, dishId } = pendingEdit;
    setPendingEdit(null);
    await applyEdit(date, mealSlot, dishId, scope);
  }

  const editingMeal = editingCell
    ? (meals ?? []).find(
        (m) => m.date === editingCell.date && m.mealSlot === editingCell.mealSlot
      )
    : undefined;

  const repeatSelectValue = repeat?.intervalWeeks
    ? String(repeat.intervalWeeks)
    : "";

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
        </div>
      </div>

      <div className="card" style={{ marginBottom: "0.75rem" }}>
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, minWidth: "12rem" }}>
            <label htmlFor="repeat-select">Répéter cette semaine</label>
            <select
              id="repeat-select"
              className="select"
              value={repeatSelectValue}
              disabled={busy || repeat === null}
              onChange={(e) => void handleRepeatChange(e.target.value)}
            >
              <option value="">Non</option>
              <option value="1">Chaque semaine</option>
              <option value="2">Toutes les 2 semaines</option>
            </select>
          </div>
          {repeat?.active ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void handleResyncPattern()}
              title="Recopie la semaine affichée (et la suivante si 2 semaines) comme nouveau motif"
            >
              Mettre à jour le motif
            </Button>
          ) : null}
        </div>
        {repeat?.active && repeat.intervalWeeks === 2 ? (
          <p style={{ margin: "0.5rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
            Le motif couvre cette semaine et la suivante.
          </p>
        ) : null}
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
                      disabled={busy}
                    >
                      {meal ? (
                        <>
                          <span className="meal-cell-name">{meal.dishName}</span>
                          {meal.mealCycleId ? (
                            <span className="meal-cell-override">répété</span>
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
                Aucun plat. Crée d&apos;abord des plats dans l&apos;onglet « Plats ».
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {pendingEdit ? (
        <Modal
          title="Portée de la modification"
          onClose={() => setPendingEdit(null)}
        >
          <p style={{ marginTop: 0, color: "var(--muted)" }}>
            Un motif de répétition est actif. Appliquer ce changement à…
          </p>
          <div className="stack">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void handleScopeChoice("this_week")}
            >
              Cette semaine seulement
            </Button>
            <Button
              disabled={busy}
              onClick={() => void handleScopeChoice("all_future")}
            >
              Toutes les semaines futures
            </Button>
            <Button variant="ghost" onClick={() => setPendingEdit(null)}>
              Annuler
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
