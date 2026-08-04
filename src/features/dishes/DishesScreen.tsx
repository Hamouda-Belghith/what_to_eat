"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, TextareaField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { formatQuantity } from "@/lib/date";
import { deleteDish, fetchDishes, fetchIngredients, saveDish } from "./api";
import type { Dish, DishIngredient } from "./types";

const UNITS = [
  "g",
  "kg",
  "ml",
  "cl",
  "l",
  "pièce",
  "pincée",
  "c. à soupe",
  "c. à café",
  "boîte",
];

function EmptyIngredientRow(): DishIngredient {
  return { ingredientId: "", ingredientName: "", quantity: 1, unit: "pièce" };
}

export function DishesScreen() {
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Dish | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<DishIngredient[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [dishesResult, suggestionsResult] = await Promise.all([
      fetchDishes(),
      fetchIngredients(),
    ]);
    setDishes(dishesResult);
    setIngredientSuggestions(suggestionsResult);
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setIngredients([EmptyIngredientRow()]);
    setCreating(true);
  }

  function openEdit(dish: Dish) {
    setEditing(dish);
    setName(dish.name);
    setDescription(dish.description ?? "");
    setIngredients(
      dish.ingredients.length > 0 ? dish.ingredients : [EmptyIngredientRow()]
    );
    setCreating(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveDish({
        id: editing?.id,
        name,
        description,
        ingredients: ingredients.filter((i) => i.ingredientName.trim() !== ""),
      });
      if (!saved) {
        setError("Impossible d'enregistrer le plat. Réessaie.");
      }
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dish: Dish) {
    if (!window.confirm(`Supprimer le plat « ${dish.name} » ?`)) return;
    try {
      await deleteDish(dish.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
    }
  }

  function updateIngredient(idx: number, patch: Partial<DishIngredient>) {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing))
    );
  }

  return (
    <div className="screen">
      <div className="row-spread" style={{ marginBottom: "0.25rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Plats</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Tes recettes avec leurs ingrédients.
          </p>
        </div>
        <Button onClick={openCreate}>+ Nouveau plat</Button>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", fontWeight: 700 }}>{error}</p>
      ) : null}

      {dishes === null ? (
        <Spinner />
      ) : dishes.length === 0 ? (
        <div className="card empty">
          Aucun plat pour l'instant. Crée ton premier plat avec le bouton
          « + Nouveau plat ».
        </div>
      ) : (
        <div className="grid">
          {dishes.map((dish) => (
            <div key={dish.id} className="card">
              <div className="row-spread">
                <div>
                  <h2 style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>
                    {dish.name}
                  </h2>
                  {dish.description ? (
                    <p
                      style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem" }}
                    >
                      {dish.description}
                    </p>
                  ) : null}
                </div>
                <div className="row" style={{ gap: "0.3rem" }}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(dish)}>
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(dish)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
              {dish.ingredients.length > 0 ? (
                <div className="stack" style={{ gap: "0.3rem", marginTop: "0.6rem" }}>
                  {dish.ingredients.map((ing, idx) => (
                    <div
                      key={`${ing.ingredientId}-${idx}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                        borderBottom: "2px solid var(--ink)",
                        paddingBottom: "0.25rem",
                        fontSize: "0.92rem",
                      }}
                    >
                      <span>{ing.ingredientName}</span>
                      <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatQuantity(ing.quantity)} {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  style={{ margin: "0.6rem 0 0", color: "var(--muted)", fontStyle: "italic" }}
                >
                  Aucun ingrédient.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <Modal
          title={editing ? "Modifier le plat" : "Nouveau plat"}
          onClose={() => setCreating(false)}
          wide
        >
          <form onSubmit={handleSave} className="stack">
            <Field
              label="Nom du plat"
              name="dish-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Pâtes bolognaise"
            />
            <TextareaField
              label="Description (optionnel)"
              name="dish-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex : la recette de grand-mère, 20 min de cuisson…"
            />

            <div className="row-spread">
              <h3 style={{ fontSize: "1rem", margin: 0 }}>Ingrédients</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setIngredients((prev) => [...prev, EmptyIngredientRow()])
                }
              >
                + Ajouter un ingrédient
              </Button>
            </div>

            {ingredients.map((ing, idx) => (
              <div
                key={idx}
                className="row"
                style={{
                  border: "2px dashed var(--ink)",
                  borderRadius: "var(--radius)",
                  padding: "0.5rem",
                }}
              >
                <input
                  list="ingredient-names"
                  className="input"
                  style={{ flex: 1, minWidth: "8rem" }}
                  placeholder="Nom de l'ingrédient"
                  value={ing.ingredientName}
                  onChange={(e) => updateIngredient(idx, { ingredientName: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  style={{ width: "5rem" }}
                  placeholder="Qté"
                  value={Number.isNaN(ing.quantity) ? "" : String(ing.quantity)}
                  onChange={(e) =>
                    updateIngredient(idx, {
                      quantity: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                />
                <select
                  className="select"
                  style={{ width: "8rem" }}
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, { unit: e.target.value })}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label="Retirer l'ingrédient"
                  onClick={() =>
                    setIngredients((prev) => prev.filter((_, i) => i !== idx))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <datalist id="ingredient-names">
              {ingredientSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>

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
