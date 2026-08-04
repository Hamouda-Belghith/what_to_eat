"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateLong, formatQuantity } from "@/lib/date";
import {
  useShoppingList,
  toggleItemChecked,
  refreshShoppingList,
  removeItem,
} from "./useShoppingList";
import { generateShoppingList, getDefaultPeriod } from "./generate";
import { flushPendingMutations } from "./syncQueue";

export function ShoppingListScreen() {
  const defaultPeriod = useMemo(() => getDefaultPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaultPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.periodEnd);

  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useShoppingList(periodStart, periodEnd);
  const pendingCount = useLiveQuery(() => getDb().pendingMutations.count(), []);

  const checkedCount = items?.filter((i) => i.isChecked).length ?? 0;
  const totalCount = items?.length ?? 0;

  // Rafraîchit depuis Supabase à l'ouverture (réseau présent) : on
  // récupère la liste la plus à jour, puis on rejoue les mutations
  // locales en attente si besoin.
  useEffect(() => {
    setMessage(null);
    setError(null);
    void (async () => {
      await refreshShoppingList(periodStart, periodEnd);
      await flushPendingMutations();
    })();
  }, [periodStart, periodEnd]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const { count } = await generateShoppingList(periodStart, periodEnd);
      setMessage(
        count > 0
          ? `Liste générée : ${count} article${count > 1 ? "s" : ""}.`
          : "La liste est vide."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible");
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggle(itemId: string, isChecked: boolean) {
    await toggleItemChecked(itemId, isChecked);
  }

  async function handleRemove(itemId: string) {
    if (!window.confirm("Retirer cet article ?")) return;
    await removeItem(itemId);
  }

  const allChecked = totalCount > 0 && checkedCount === totalCount;

  return (
    <div className="screen">
      <div className="row-spread" style={{ marginBottom: "0.25rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Liste de courses</h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Du {formatDateLong(periodStart)} au {formatDateLong(periodEnd)}.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: "8rem" }}>
            <label htmlFor="period-start">Du</label>
            <input
              id="period-start"
              type="date"
              className="input"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: "8rem" }}>
            <label htmlFor="period-end">Au</label>
            <input
              id="period-end"
              type="date"
              className="input"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating || !periodStart || !periodEnd}
          >
            {generating ? "…" : "Générer la liste"}
          </Button>
        </div>
        {error ? (
          <p style={{ color: "var(--danger)", fontWeight: 700, margin: "0.6rem 0 0" }}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p style={{ color: "var(--accent-dark)", fontWeight: 700, margin: "0.6rem 0 0" }}>
            {message}
          </p>
        ) : null}
      </div>

      {pendingCount && pendingCount > 0 ? (
        <p className="tag tag-warn" style={{ alignSelf: "flex-start" }}>
          {pendingCount} modification{pendingCount > 1 ? "s" : ""} en attente de
          synchro
        </p>
      ) : null}

      {items === undefined ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="card empty">
          Aucun article sur cette période. Génère la liste pour la remplir.
        </div>
      ) : (
        <div className="stack">
          <div className="row-spread">
            <span style={{ fontWeight: 700 }}>
              {checkedCount}/{totalCount} coché{totalCount > 1 ? "s" : ""}
            </span>
            {allChecked ? <span className="tag">🎉 Tout est coché !</span> : null}
          </div>
          <div className="stack" style={{ gap: "0.4rem" }}>
            {items.map((item) => (
              <div
                key={item.id}
                className={`shop-item ${item.isChecked ? "checked" : ""}`}
              >
                <input
                  type="checkbox"
                  className="shop-checkbox"
                  checked={item.isChecked}
                  onChange={(e) => handleToggle(item.id, e.target.checked)}
                  aria-label={`Cocher ${item.ingredientName}`}
                />
                <span className="shop-name">{item.ingredientName}</span>
                <span className="shop-qty">
                  {formatQuantity(item.quantity)} {item.unit}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Retirer ${item.ingredientName}`}
                  onClick={() => handleRemove(item.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
