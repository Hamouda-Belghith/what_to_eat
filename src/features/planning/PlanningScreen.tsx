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
import { createMealRepeat, ensureMealRepeatsApplied, fetchPlannedMeals } from "./api";
import {
  ensurePatternApplied,
  getRepeatConfig,
  setMealWithScope,
  setRepeatInterval,
  type MealEditScope,
  type RepeatConfig,
  type RepeatInterval,
} from "./repeat";
import type { MealRepeatDuration, PlannedMeal } from "./types";

const WEEK_DAYS = 7;
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type RepeatDurationChoice = "once" | MealRepeatDuration;

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
  const [choosingRepeatDuration, setChoosingRepeatDuration] = useState(false);

  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(addDays(weekStart, WEEK_DAYS - 1));

  async function loadMeals() {
    await ensurePatternApplied(weekStartISO, weekEndISO);
    await ensureMealRepeatsApplied(weekStartISO, weekEndISO);
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

    if (dishId !== null && !editingMeal) {
      // Case vide, pas de motif global actif : proposer une répétition
      // par repas (uniquement à la création, pas quand on remplace une
      // case déjà remplie — ça reste un simple changement pour cette
      // semaine-là).
      setPendingDishId(dishId);
      setChoosingRepeatDuration(true);
      return;
    }

    const { date, mealSlot } = editingCell;
    setEditingCell(null);
    void applyEdit(date, mealSlot, dishId, null);
  }

  async function handleRepeatDurationChoice(choice: RepeatDurationChoice) {
    if (!editingCell || pendingDishId === undefined || pendingDishId === null) return;
    const { date, mealSlot } = editingCell;
    const dishId = pendingDishId;
    setEditingCell(null);
    setPendingDishId(undefined);
    setChoosingRepeatDuration(false);

    if (choice === "once") {
      await applyEdit(date, mealSlot, dishId, null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createMealRepeat({ mealSlot, dishId, startDate: date, weeksTotal: choice });
      await loadMeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Répétition impossible");
    } finally {
      setBusy(false);
    }
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

  const choosingScope =
    editingCell !== null && pendingDishId !== undefined && !choosingRepeatDuration;
  const choosingDuration =
    editingCell !== null && pendingDishId !== undefined && choosingRepeatDuration;

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
              Modèle basé sur la semaine du {formatDateLong(repeat.startDate ?? weekStartISO)}
              {repeat.intervalWeeks === 2 ? " (et la suivante)" : ""}, visible sur les
              cases marquées « Modèle ».{" "}
              {repeat.intervalWeeks === 2
                ? "Reclique sur la même option pour le remplacer par la semaine affichée."
                : "Reclique sur « Chaque semaine » pour le remplacer par la semaine affichée."}
            </p>
          ) : (
            <p className="repeat-hint">
              Remplis la semaine, puis active la répétition pour la prolonger automatiquement.
              Pour répéter un seul repas (pas toute la semaine), clique directement sur sa
              case et choisis une durée.
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
          <div className="week-slot-col">
            <div className="week-day-head" aria-hidden="true">
              .
              <br />
              <span style={{ fontSize: "0.78rem", fontWeight: 500 }}>.</span>
            </div>
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
                          {meal.dishPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={meal.dishPhotoUrl}
                              alt=""
                              className="meal-cell-photo"
                            />
                          ) : null}
                          <span className="meal-cell-name">{meal.dishName}</span>
                          {meal.mealCycleId ? (
                            <span
                              className="meal-cell-override"
                              title="Fait partie du modèle de répétition hebdomadaire actif (barre « Répéter » en haut). Le modifier proposera de choisir : cette semaine seulement, ou toutes les semaines futures."
                            >
                              Modèle
                            </span>
                          ) : meal.mealRepeatId ? (
                            <span
                              className="meal-cell-override"
                              title="Ce repas se répète chaque semaine depuis cette case. Le modifier ne change que cette semaine-là."
                            >
                              Répété
                            </span>
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
              : choosingDuration
              ? "Répéter ce repas ?"
              : `${formatDateLong(editingCell.date)} — ${MEAL_SLOT_LABELS[editingCell.mealSlot]}`
          }
          onClose={() => {
            setEditingCell(null);
            setPendingDishId(undefined);
            setChoosingRepeatDuration(false);
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
          ) : choosingDuration ? (
            <div className="stack">
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Ce repas peut se répéter chaque semaine. Tu pourras toujours
                changer une semaine précise plus tard, sans impacter les autres.
              </p>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void handleRepeatDurationChoice("once")}
              >
                Une seule fois
              </Button>
              <Button disabled={busy} onClick={() => void handleRepeatDurationChoice(3)}>
                Toutes les semaines, pendant 3 semaines
              </Button>
              <Button disabled={busy} onClick={() => void handleRepeatDurationChoice(4)}>
                Toutes les semaines, pendant 4 semaines
              </Button>
              <Button disabled={busy} onClick={() => void handleRepeatDurationChoice(null)}>
                Toutes les semaines, indéfiniment
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setChoosingRepeatDuration(false);
                  setPendingDishId(undefined);
                }}
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
                  {dish.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dish.photoUrl} alt="" className="dish-pick-photo" />
                  ) : null}
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
