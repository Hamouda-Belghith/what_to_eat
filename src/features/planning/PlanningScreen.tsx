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
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingCell, setEditingCell] = useState<{
    date: string;
    mealSlot: MealSlot;
  } | null>(null);

  const [pendingDishId, setPendingDishId] = useState<string | null | undefined>(
    undefined
  );

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

  async function applyRepeat(interval: RepeatInterval | null) {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const config = await setRepeatInterval(interval, weekStartISO);
      setRepeat(config);
      await loadMeals();
      if (interval === null) {
        setHint("Répétition désactivée.");
      } else {
        setHint(
          interval === 1
            ? "Cette semaine se répète chaque semaine."
            : "Cette semaine et la suivante se répètent toutes les 2 semaines."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Répétition impossible");
    } finally {
      setBusy(false);
    }
  }

  async function handleRepeatSelect(interval: RepeatInterval | null) {
    // Recliquer sur l'option déjà active = remplacer le motif par la semaine affichée.
    if (
      interval !== null &&
      repeat?.active &&
      repeat.intervalWeeks === interval
    ) {
      const ok = window.confirm(
        "Remplacer le modèle répété par la semaine affichée ?"
      );
      if (!ok) return;
    }
    await applyRepeat(interval);
  }

  function handleCellClick(date: string, mealSlot: MealSlot) {
    setPendingDishId(undefined);
    setEditingCell({ date, mealSlot });
  }

  function handlePickDish(dishId: string | null) {
    if (!editingCell) return;

    if (repeat?.active) {
      // Garde le plat choisi et demande la portée dans la même modale.
      setPendingDishId(dishId);
      return;
    }

    const { date, mealSlot } = editingCell;
    setEditingCell(null);
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
    if (!editingCell || pendingDishId === undefined) return;
    const { date, mealSlot } = editingCell;
    const dishId = pendingDishId;
    setEditingCell(null);
    setPendingDishId(undefined);
    await applyEdit(date, mealSlot, dishId, scope);
  }

  const editingMeal = editingCell
    ? (meals ?? []).find(
        (m) => m.date === editingCell.date && m.mealSlot === editingCell.mealSlot
      )
    : undefined;

  const choosingScope = editingCell !== null && pendingDishId !== undefined;

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 style={{ margin: 0 }}>Planning</h1>
          <p className="screen-kicker">
            Semaine du {formatDateLong(weekStartISO)}
          </p>
        </div>
        <div className="week-nav">
          <Button variant="ghost" onClick={previousWeek} aria-label="Semaine précédente">
            ←
          </Button>
          <Button variant="ghost" onClick={currentWeek}>
            Aujourd&apos;hui
          </Button>
          <Button variant="ghost" onClick={nextWeek} aria-label="Semaine suivante">
            →
          </Button>
        </div>
      </div>

      <div className="card planning-toolbar">
        <div className="repeat-panel">
          <span className="repeat-panel-label">Répéter</span>
          <div className="segmented" role="group" aria-label="Répétition de la semaine">
            <button
              type="button"
              className={!repeat?.active ? "active" : ""}
              disabled={busy || repeat === null}
              onClick={() => void handleRepeatSelect(null)}
            >
              Non
            </button>
            <button
              type="button"
              className={repeat?.intervalWeeks === 1 ? "active" : ""}
              disabled={busy || repeat === null}
              onClick={() => void handleRepeatSelect(1)}
            >
              Chaque semaine
            </button>
            <button
              type="button"
              className={repeat?.intervalWeeks === 2 ? "active" : ""}
              disabled={busy || repeat === null}
              onClick={() => void handleRepeatSelect(2)}
            >
              Toutes les 2 semaines
            </button>
          </div>
          {repeat?.active ? (
            <p className="repeat-hint">
              {repeat.intervalWeeks === 2
                ? "Le modèle couvre cette semaine et la suivante. Reclique sur la même option pour le remplacer."
                : "Reclique sur « Chaque semaine » pour remplacer le modèle par la semaine affichée."}
            </p>
          ) : (
            <p className="repeat-hint">
              Remplis la semaine, puis active la répétition pour la prolonger automatiquement.
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", fontWeight: 650 }}>{error}</p>
      ) : null}
      {hint && !error ? (
        <p style={{ color: "var(--accent-dark)", fontWeight: 600, margin: 0 }}>
          {hint}
        </p>
      ) : null}

      {meals === null ? (
        <Spinner />
      ) : (
        <div className="week-grid">
          <div>
            <div style={{ height: "2.4rem" }} />
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
                  <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>
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
          title={
            choosingScope
              ? "Appliquer ce changement"
              : `${formatDateLong(editingCell.date)} — ${MEAL_SLOT_LABELS[editingCell.mealSlot]}`
          }
          onClose={() => {
            setEditingCell(null);
            setPendingDishId(undefined);
          }}
        >
          {choosingScope ? (
            <div className="stack">
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Une répétition est active. Ce changement concerne…
              </p>
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
              <Button
                variant="ghost"
                onClick={() => setPendingDishId(undefined)}
              >
                Retour
              </Button>
            </div>
          ) : (
            <div className="dish-pick-list">
              <button
                type="button"
                className="dish-pick-item"
                onClick={() => handlePickDish(null)}
                disabled={!editingMeal}
                style={{ color: "var(--danger)" }}
              >
                Retirer le repas
              </button>
              {dishes.map((dish) => (
                <button
                  key={dish.id}
                  type="button"
                  className="dish-pick-item"
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
          )}
        </Modal>
      ) : null}
    </div>
  );
}
