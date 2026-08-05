"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateLong, formatQuantity, type DurationUnit } from "@/lib/date";
import {
  useShoppingList,
  toggleItemChecked,
  refreshShoppingList,
  removeItem,
} from "./useShoppingList";
import {
  generateShoppingList,
  getDefaultPeriod,
  periodFromDuration,
} from "./generate";
import { flushPendingMutations } from "./syncQueue";
import type { ShoppingListItem } from "./types";

const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "day", label: "jour(s)" },
  { value: "week", label: "semaine(s)" },
  { value: "month", label: "mois" },
];

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

export function ShoppingListScreen() {
  const defaults = useMemo(() => getDefaultPeriod(), []);
  const [amount, setAmount] = useState(defaults.amount);
  const [unit, setUnit] = useState<DurationUnit>(defaults.unit);
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);

  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useShoppingList(periodStart, periodEnd);
  const pendingCount = useLiveQuery(() => getDb().pendingMutations.count(), []);

  const toBuy = items?.filter((i) => !i.isChecked) ?? [];
  const alreadyHave = items?.filter((i) => i.isChecked) ?? [];
  const totalCount = items?.length ?? 0;

  function applyDuration(nextAmount: number, nextUnit: DurationUnit) {
    const period = periodFromDuration(nextAmount, nextUnit);
    setAmount(period.amount);
    setUnit(period.unit);
    setPeriodStart(period.periodStart);
    setPeriodEnd(period.periodEnd);
  }

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
        <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ marginBottom: 0, width: "5.5rem" }}>
            <label htmlFor="duration-amount">Pendant</label>
            <input
              id="duration-amount"
              type="number"
              className="input"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next) || next < 1) return;
                applyDuration(next, unit);
              }}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: "9rem", flex: 1 }}>
            <label htmlFor="duration-unit">Unité</label>
            <select
              id="duration-unit"
              className="select"
              value={unit}
              onChange={(e) =>
                applyDuration(amount, e.target.value as DurationUnit)
              }
            >
              {UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
      ) : totalCount === 0 ? (
        <div className="card empty">
          Aucun article sur cette période. Génère la liste pour la remplir.
        </div>
      ) : (
        <div className="stack">
          <div className="stack" style={{ gap: "0.4rem" }}>
            <div className="row-spread">
              <span style={{ fontWeight: 700 }}>
                À acheter ({toBuy.length})
              </span>
              {toBuy.length === 0 ? (
                <span className="tag">Rien à acheter</span>
              ) : null}
            </div>
            {toBuy.length === 0 ? (
              <p style={{ margin: 0, color: "var(--muted)" }}>
                Tout est déjà coché comme « chez nous ».
              </p>
            ) : (
              toBuy.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                />
              ))
            )}
          </div>

          {alreadyHave.length > 0 ? (
            <div className="stack" style={{ gap: "0.4rem", marginTop: "0.75rem" }}>
              <div className="row-spread">
                <span style={{ fontWeight: 700, color: "var(--muted)" }}>
                  Déjà chez nous ({alreadyHave.length})
                </span>
              </div>
              {alreadyHave.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
