"use client";

import { useEffect, useRef, useState } from "react";
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

/** Champ numérique optionnel : vide = non renseigné (`null`), jamais 0 par défaut. */
function parseOptionalAmount(value: string, decimals: number): number | null {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function formatNutrition(dish: Dish): string | null {
  const parts: string[] = [];
  if (dish.calories !== null) parts.push(`${formatQuantity(dish.calories)} kcal`);
  if (dish.proteinG !== null) parts.push(`${formatQuantity(dish.proteinG)} g de protéines`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function EmptyIngredientRow(): DishIngredient {
  return { ingredientId: "", ingredientName: "", quantity: 1, unit: "pièce" };
}

export function DishesScreen() {
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Dish | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [ingredients, setIngredients] = useState<DishIngredient[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<string[]>([]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  // Erreur affichée dans la modale : le formulaire reste ouvert pour ne
  // rien faire ressaisir.
  const [formError, setFormError] = useState<string | null>(null);
  // Identifiant d'un nouveau plat, fixé à l'ouverture du formulaire : si
  // l'enregistrement échoue à mi-chemin puis est retenté, on réécrit le
  // même plat au lieu d'en créer un second.
  const draftId = useRef<string>("");

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
    draftId.current = crypto.randomUUID();
    setFormError(null);
    setEditing(null);
    setName("");
    setDescription("");
    setCalories("");
    setProteinG("");
    setIngredients([EmptyIngredientRow()]);
    setPhotoPreview(null);
    setPhotoChanged(false);
    setCreating(true);
  }

  function openEdit(dish: Dish) {
    setFormError(null);
    setEditing(dish);
    setName(dish.name);
    setDescription(dish.description ?? "");
    setCalories(dish.calories === null ? "" : String(dish.calories));
    setProteinG(dish.proteinG === null ? "" : String(dish.proteinG));
    setIngredients(
      dish.ingredients.length > 0 ? dish.ingredients : [EmptyIngredientRow()]
    );
    setPhotoPreview(dish.photoUrl);
    setPhotoChanged(false);
    setCreating(true);
  }

  function handlePhotoSelect(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(typeof reader.result === "string" ? reader.result : null);
      setPhotoChanged(true);
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoRemove() {
    setPhotoPreview(null);
    setPhotoChanged(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setFormError(null);
    try {
      await saveDish({
        id: editing?.id ?? draftId.current,
        name,
        description,
        calories: parseOptionalAmount(calories, 0),
        proteinG: parseOptionalAmount(proteinG, 1),
        ingredients: ingredients.filter((i) => i.ingredientName.trim() !== ""),
        photoUrl: photoChanged ? photoPreview : undefined,
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Impossible d'enregistrer le plat. Réessaie."
      );
      setSaving(false);
      return;
    }
    setSaving(false);
    setCreating(false);
    await load();
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

  const normalizedSearch = search.trim().toLowerCase();
  const filteredDishes =
    dishes === null
      ? null
      : normalizedSearch === ""
      ? dishes
      : dishes.filter((dish) =>
          [dish.name, dish.description ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        );

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

      {dishes !== null && dishes.length > 0 ? (
        <input
          type="search"
          className="input"
          placeholder="Rechercher un plat…"
          aria-label="Rechercher un plat"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: "0.75rem" }}
        />
      ) : null}

      {filteredDishes === null ? (
        <Spinner />
      ) : dishes && dishes.length === 0 ? (
        <div className="card empty">
          Aucun plat pour l'instant. Crée ton premier plat avec le bouton
          « + Nouveau plat ».
        </div>
      ) : filteredDishes.length === 0 ? (
        <div className="card empty">
          Aucun plat ne correspond à « {search} ».
        </div>
      ) : (
        <div className="grid">
          {filteredDishes.map((dish) => (
            <div key={dish.id} className="card">
              {dish.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dish.photoUrl} alt="" className="dish-card-photo" />
              ) : null}
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
                  {formatNutrition(dish) ? (
                    <p
                      style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", fontWeight: 650 }}
                    >
                      {formatNutrition(dish)}
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

            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: "8rem" }}>
                <Field
                  label="Calories (kcal, optionnel)"
                  name="dish-calories"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="Ex : 650"
                  hint="Pour une portion."
                />
              </div>
              <div style={{ flex: 1, minWidth: "8rem" }}>
                <Field
                  label="Protéines (g, optionnel)"
                  name="dish-protein"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={proteinG}
                  onChange={(e) => setProteinG(e.target.value)}
                  placeholder="Ex : 35"
                  hint="Pour une portion."
                />
              </div>
            </div>

            <div>
              <span
                style={{
                  display: "block",
                  fontWeight: 650,
                  fontSize: "0.9rem",
                  marginBottom: "0.4rem",
                }}
              >
                Photo (optionnel)
              </span>
              <div className="dish-photo-field">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="" className="dish-photo-preview" />
                ) : (
                  <div className="dish-photo-placeholder" aria-hidden="true">
                    📷
                  </div>
                )}
                <div className="stack" style={{ gap: "0.4rem" }}>
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="Choisir une photo du plat"
                    onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
                  />
                  {photoPreview ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handlePhotoRemove}
                    >
                      Retirer la photo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

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

            {formError ? (
              <p role="alert" style={{ margin: 0, color: "var(--danger)", fontWeight: 650 }}>
                {formError}
              </p>
            ) : null}

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
