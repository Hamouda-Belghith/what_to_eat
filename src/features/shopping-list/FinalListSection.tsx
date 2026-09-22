"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatQuantity } from "@/lib/date";
import { useShoppingList, toggleItemChecked, removeItem } from "./useShoppingList";
import { clearFinalList } from "./generate";
import type { ShoppingListItem } from "./types";

function ItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingListItem;
  onToggle: (id: string, checked: boolean) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={`shop-item ${item.isChecked ? "checked" : ""}`}>
      <input
        type="checkbox"
        className="shop-checkbox"
        checked={item.isChecked}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        aria-label={
          item.isChecked
            ? `${item.ingredientName} — déjà chez nous`
            : `${item.ingredientName} — à acheter`
        }
      />
      <span className="shop-name">{item.ingredientName}</span>
      <span className="shop-qty">
        {formatQuantity(item.quantity)} {item.unit}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={`Retirer ${item.ingredientName}`}
        onClick={() => onRemove(item.id)}
      >
        ✕
      </button>
    </div>
  );
}

/**
 * La liste « À acheter » : cochable, alimentée par les boutons
 * « Ajouter à la liste d'achat » des deux onglets de l'écran Courses,
 * vidée par le bouton « Vider ». Composant autonome (charge ses propres
 * données) pour pouvoir être affiché à la fois en bas de l'écran
 * Courses et sur son propre onglet de navigation.
 */
export function FinalListSection() {
  const items = useShoppingList();
  const pendingCount = useLiveQuery(() => getDb().pendingMutations.count(), []);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finalItems = useMemo(() => items?.filter((i) => i.section === "final") ?? [], [items]);
  const toBuy = useMemo(() => finalItems.filter((i) => !i.isChecked), [finalItems]);
  const alreadyHave = useMemo(() => finalItems.filter((i) => i.isChecked), [finalItems]);

  async function handleToggle(itemId: string, isChecked: boolean) {
    await toggleItemChecked(itemId, isChecked);
  }

  async function handleRemove(itemId: string) {
    if (!window.confirm("Retirer cet article ?")) return;
    await removeItem(itemId);
  }

  async function handleClearFinal() {
    if (!window.confirm("Vider entièrement la liste « À acheter » ?")) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await clearFinalList();
      setMessage("Liste vidée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de vider la liste");
    } finally {
      setBusy(false);
    }
  }

  if (items === undefined) return <Spinner />;

  return (
    <>
      {pendingCount && pendingCount > 0 ? (
        <p className="tag tag-warn" style={{ alignSelf: "flex-start" }}>
          {pendingCount} modification{pendingCount > 1 ? "s" : ""} en attente de synchro
        </p>
      ) : null}

      <div className="card stack" style={{ gap: "0.55rem" }}>
        {finalItems.length > 0 ? (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void handleClearFinal()}>
              Vider
            </Button>
          </div>
        ) : null}
        {error ? (
          <p style={{ color: "var(--danger)", fontWeight: 650, margin: 0 }}>{error}</p>
        ) : null}
        {message && !error ? (
          <p style={{ color: "var(--accent-dark)", fontWeight: 600, margin: 0 }}>{message}</p>
        ) : null}
        {finalItems.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Vide pour l&apos;instant. Ajoute des articles à la liste d&apos;achat depuis les deux
            onglets de l&apos;écran Courses.
          </p>
        ) : (
          <div className="stack">
            <div className="stack" style={{ gap: "0.45rem" }}>
              <div className="row-spread">
                <p className="section-title">À acheter ({toBuy.length})</p>
                {toBuy.length === 0 ? <span className="tag">Rien à acheter</span> : null}
              </div>
              {toBuy.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)" }}>
                  Tout est déjà marqué comme chez vous.
                </p>
              ) : (
                toBuy.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={handleToggle} onRemove={handleRemove} />
                ))
              )}
            </div>

            {alreadyHave.length > 0 ? (
              <div className="stack" style={{ gap: "0.45rem", marginTop: "0.5rem" }}>
                <p className="section-title">Déjà chez nous ({alreadyHave.length})</p>
                {alreadyHave.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={handleToggle} onRemove={handleRemove} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
