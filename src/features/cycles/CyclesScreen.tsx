"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import type { Dish } from "@/features/dishes/types";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  deleteMealCycle,
  fetchDishesForCycles,
  fetchMealCycles,
  saveMealCycle,
} from "./api";
import type { MealCycle, MealCycleEntry } from "./types";

const DURATION_CHOICES = [7, 14, 21];

interface DraftEntry {
  key: string;
  dayOffset: number;
  mealSlot: "breakfast" | "lunch" | "dinner";
  dishId: string;
}

function buildDraftEntries(
  durationDays: number,
  existing: MealCycleEntry[]
): DraftEntry[] {
  const byKey = new Map(existing.map((e) => [`${e.dayOffset}-${e.mealSlot}`, e]));
  const entries: DraftEntry[] = [];
  for (let day = 0; day < durationDays; day++) {
    for (const slot of MEAL_SLOTS) {
      const existingEntry = byKey.get(`${day}-${slot}`);
      entries.push({
        key: `${day}-${slot}`,
        dayOffset: day,
        mealSlot: slot,
        dishId: existingEntry?.dishId ?? "",
      });
    }
  }
  return entries;
}

export function CyclesScreen() {
  const [cycles, setCycles] = useState<MealCycle[] | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MealCycle | null>(null);

  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [cyclesResult, dishesResult] = await Promise.all([
      fetchMealCycles(),
      fetchDishesForCycles(),
    ]);
    setCycles(cyclesResult);
    setDishes(dishesResult);
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setDurationDays(7);
    setEntries(buildDraftEntries(7, []));
    setCreating(true);
  }

  function openEdit(cycle: MealCycle) {
    setEditing(cycle);
    setName(cycle.name);
    setDurationDays(cycle.durationDays);
    setEntries(buildDraftEntries(cycle.durationDays, cycle.entries));
    setCreating(true);
  }

  function changeDuration(days: number) {
    setDurationDays(days);
    setEntries((prev) => {
      const existing = new Map(prev.map((e) => [`${e.dayOffset}-${e.mealSlot}`, e]));
      const next: DraftEntry[] = [];
      for (let day = 0; day < days; day++) {
        for (const slot of MEAL_SLOTS) {
          const prevEntry = existing.get(`${day}-${slot}`);
          next.push({
            key: `${day}-${slot}`,
            dayOffset: day,
            mealSlot: slot,
            dishId: prevEntry?.dishId ?? "",
          });
        }
      }
      return next;
    });
  }

  function setEntryDish(key: string, dishId: string) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, dishId } : e)));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMealCycle({
        id: editing?.id,
        name,
        durationDays,
        entries: entries
          .filter((e) => e.dishId !== "")
          .map((e) => ({
            dayOffset: e.dayOffset,
            mealSlot: e.mealSlot,
            dishId: e.dishId,
          })),
      });
      if (!saved) {
        setError("Impossible d'enregistrer le cycle. Réessaie.");
      }
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cycle: MealCycle) {
    if (!window.confirm(`Supprimer le cycle « ${cycle.name} » ?`)) return;
    try {
      await deleteMealCycle(cycle.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
    }
  }

  return (
    <div className="screen">
      <div className="row-spread" style={{ marginBottom: "0.25rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Cycles</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Des semaines types qui se répètent automatiquement.
          </p>
        </div>
        <Button onClick={openCreate}>+ Nouveau cycle</Button>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", fontWeight: 700 }}>{error}</p>
      ) : null}

      {cycles === null ? (
        <Spinner />
      ) : cycles.length === 0 ? (
        <div className="card empty">
          Aucun cycle pour l'instant. Crée un cycle de 1, 2 ou 3 semaines
          avec le bouton « + Nouveau cycle ».
        </div>
      ) : (
        <div className="grid">
          {cycles.map((cycle) => {
            const filled = cycle.entries.length;
            const total = cycle.durationDays * 3;
            return (
              <div key={cycle.id} className="card">
                <div className="row-spread">
                  <div>
                    <h2 style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>
                      {cycle.name}
                    </h2>
                    <div className="row" style={{ gap: "0.4rem" }}>
                      <span className="tag">{cycle.durationDays} jours</span>
                      <span className="tag tag-warn">
                        {filled}/{total} repas
                      </span>
                    </div>
                  </div>
                  <div className="row" style={{ gap: "0.3rem" }}>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(cycle)}>
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(cycle)}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating ? (
        <Modal
          title={editing ? "Modifier le cycle" : "Nouveau cycle"}
          onClose={() => setCreating(false)}
          wide
        >
          <form onSubmit={handleSave} className="stack">
            <Field
              label="Nom du cycle"
              name="cycle-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Cycle 2 semaines"
            />

            <div className="field">
              <label>Durée</label>
              <div className="row" style={{ gap: "0.4rem" }}>
                {DURATION_CHOICES.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={`pill-checkbox ${durationDays === days ? "active" : ""}`}
                    onClick={() => changeDuration(days)}
                  >
                    {days} jours
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  minWidth: "100%",
                  fontSize: "0.85rem",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.3rem" }}>Jour</th>
                    {MEAL_SLOTS.map((slot) => (
                      <th key={slot} style={{ padding: "0.3rem" }}>
                        {MEAL_SLOT_LABELS[slot]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: durationDays }, (_, day) => (
                    <tr key={day}>
                      <td style={{ padding: "0.3rem", fontWeight: 700 }}>
                        Jour {day + 1}
                      </td>
                      {MEAL_SLOTS.map((slot) => {
                        const entry = entries.find(
                          (e) => e.dayOffset === day && e.mealSlot === slot
                        );
                        return (
                          <td key={slot} style={{ padding: "0.2rem" }}>
                            <select
                              className="select"
                              value={entry?.dishId ?? ""}
                              onChange={(e) =>
                                entry
                                  ? setEntryDish(entry.key, e.target.value)
                                  : undefined
                              }
                            >
                              <option value="">—</option>
                              {dishes.map((dish) => (
                                <option key={dish.id} value={dish.id}>
                                  {dish.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "…" : "Enregistrer"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
