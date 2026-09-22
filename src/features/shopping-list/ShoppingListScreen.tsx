"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { UNITS } from "@/lib/units";
import { fetchIngredients } from "@/features/dishes/api";
import { formatDateLong, formatQuantity, type DurationUnit } from "@/lib/date";
import {
  useShoppingList,
  toggleItemChecked,
  refreshShoppingList,
  removeItem,
} from "./useShoppingList";
import {
  addExtraItem,
  clearFinalList,
  exportSection,
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

type Tab = "week" | "extra";

/** Statut d'une action, rattaché à la zone de la page qui l'a déclenchée. */
type ActionStatus = {
  scope: "add" | "dishes" | "extra" | "final" | null;
  message: string | null;
  error: string | null;
};

const IDLE_STATUS: ActionStatus = { scope: null, message: null, error: null };

function StatusBanner({ status, scope }: { status: ActionStatus; scope: ActionStatus["scope"] }) {
  if (status.scope !== scope) return null;
  if (status.error) {
    return (
      <p style={{ color: "var(--danger)", fontWeight: 650, margin: "0.6rem 0 0" }}>
        {status.error}
      </p>
    );
  }
  if (status.message) {
    return (
      <p style={{ color: "var(--accent-dark)", fontWeight: 600, margin: "0.6rem 0 0" }}>
        {status.message}
      </p>
    );
  }
  return null;
}

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

/** Article d'une section d'origine, sans case à cocher : rien à acheter tant que ce n'est pas exporté vers « À acheter ». */
function StagingRow({
  item,
  onRemove,
}: {
  item: ShoppingListItem;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="shop-item">
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
 * Champ texte avec suggestions filtrées d'un catalogue existant
 * (ingrédients déjà utilisés, dans un plat ou ajoutés ici) : cliquer une
 * suggestion la retient telle quelle, sinon le texte saisi sert à créer
 * un nouvel article.
 */
function IngredientSearchField({
  id,
  label,
  value,
  onChange,
  suggestions,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const normalized = value.trim().toLowerCase();
  const matches =
    normalized === ""
      ? []
      : suggestions
          .filter((s) => s.toLowerCase().includes(normalized) && s.toLowerCase() !== normalized)
          .slice(0, 8);

  return (
    <div className="field autocomplete" style={{ marginBottom: 0, flex: 1, minWidth: "9rem" }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        autoComplete="off"
        placeholder="Ex : Sacs poubelle"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && matches.length > 0 ? (
        <ul className="autocomplete-list">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ShoppingListScreen() {
  const defaults = useMemo(() => getDefaultPeriod(), []);
  const [amount, setAmount] = useState(defaults.amount);
  const [unit, setUnit] = useState<DurationUnit>(defaults.unit);
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);

  const [activeTab, setActiveTab] = useState<Tab>("week");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ActionStatus>(IDLE_STATUS);

  const [addName, setAddName] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addUnit, setAddUnit] = useState<string>(UNITS[0]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<string[]>([]);

  const items = useShoppingList();
  const pendingCount = useLiveQuery(() => getDb().pendingMutations.count(), []);

  const dishesItems = useMemo(
    () =>
      items?.filter(
        (i) => i.section === "dishes" && i.periodStart === periodStart && i.periodEnd === periodEnd
      ) ?? [],
    [items, periodStart, periodEnd]
  );
  const extraItems = useMemo(() => items?.filter((i) => i.section === "extra") ?? [], [items]);
  const finalItems = useMemo(() => items?.filter((i) => i.section === "final") ?? [], [items]);

  const toBuy = useMemo(() => finalItems.filter((i) => !i.isChecked), [finalItems]);
  const alreadyHave = useMemo(() => finalItems.filter((i) => i.isChecked), [finalItems]);

  useEffect(() => {
    void fetchIngredients().then(setIngredientSuggestions);
  }, []);

  function applyDuration(nextAmount: number, nextUnit: DurationUnit) {
    const period = periodFromDuration(nextAmount, nextUnit);
    setAmount(period.amount);
    setUnit(period.unit);
    setPeriodStart(period.periodStart);
    setPeriodEnd(period.periodEnd);
  }

  useEffect(() => {
    setStatus(IDLE_STATUS);
    void (async () => {
      await refreshShoppingList(periodStart, periodEnd);
      await flushPendingMutations();
    })();
  }, [periodStart, periodEnd]);

  async function handleAddExtra(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addName.trim();
    if (!trimmed) return;
    setBusy(true);
    setStatus({ scope: "add", message: null, error: null });
    try {
      await addExtraItem(trimmed, addQuantity, addUnit);
      setStatus({ scope: "add", message: `« ${trimmed} » ajouté aux courses supplémentaires.`, error: null });
      setAddName("");
      setAddQuantity(1);
    } catch (err) {
      setStatus({
        scope: "add",
        message: null,
        error: err instanceof Error ? err.message : "Ajout impossible",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    setBusy(true);
    setStatus({ scope: "dishes", message: null, error: null });
    try {
      const { count } = await generateShoppingList(periodStart, periodEnd);
      setStatus({
        scope: "dishes",
        message: count > 0 ? `Liste générée : ${count} article${count > 1 ? "s" : ""}.` : "La liste est vide.",
        error: null,
      });
    } catch (err) {
      setStatus({
        scope: "dishes",
        message: null,
        error: err instanceof Error ? err.message : "Génération impossible",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(section: "dishes" | "extra") {
    setBusy(true);
    setStatus({ scope: section, message: null, error: null });
    try {
      const { count } = await exportSection(
        section,
        section === "dishes" ? { periodStart, periodEnd } : undefined
      );
      setStatus({
        scope: section,
        message: `${count} article${count > 1 ? "s" : ""} envoyé${count > 1 ? "s" : ""} vers « À acheter ».`,
        error: null,
      });
    } catch (err) {
      setStatus({
        scope: section,
        message: null,
        error: err instanceof Error ? err.message : "Export impossible",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleClearFinal() {
    if (!window.confirm("Vider entièrement la liste « À acheter » ?")) return;
    setBusy(true);
    setStatus({ scope: "final", message: null, error: null });
    try {
      await clearFinalList();
      setStatus({ scope: "final", message: "Liste vidée.", error: null });
    } catch (err) {
      setStatus({
        scope: "final",
        message: null,
        error: err instanceof Error ? err.message : "Impossible de vider la liste",
      });
    } finally {
      setBusy(false);
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
      <div className="screen-header">
        <div>
          <h1 style={{ margin: 0 }}>Liste de courses</h1>
        </div>
      </div>

      <div className="subtabs">
        <button
          type="button"
          className={`subtab ${activeTab === "week" ? "active" : ""}`}
          onClick={() => setActiveTab("week")}
        >
          Cette semaine
        </button>
        <button
          type="button"
          className={`subtab ${activeTab === "extra" ? "active" : ""}`}
          onClick={() => setActiveTab("extra")}
        >
          Courses supplémentaires
        </button>
      </div>

      {activeTab === "week" ? (
        <>
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
                  onChange={(e) => applyDuration(amount, e.target.value as DurationUnit)}
                >
                  {UNIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button disabled={busy} onClick={() => void handleGenerate()}>
                Générer depuis le planning
              </Button>
            </div>
            <p style={{ margin: "0.6rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
              Du {formatDateLong(periodStart)} au {formatDateLong(periodEnd)}.
            </p>
            <StatusBanner status={status} scope="dishes" />
          </div>

          {items === undefined ? (
            <Spinner />
          ) : (
            <div className="card stack" style={{ gap: "0.55rem" }}>
              <div className="row-spread">
                <p className="section-title">Articles ({dishesItems.length})</p>
                <Button
                  size="sm"
                  disabled={busy || dishesItems.length === 0}
                  onClick={() => void handleExport("dishes")}
                >
                  Exporter vers « À acheter »
                </Button>
              </div>
              {dishesItems.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)" }}>
                  Rien pour l&apos;instant. Planifie des repas puis clique sur « Générer depuis le
                  planning ».
                </p>
              ) : (
                dishesItems.map((item) => (
                  <StagingRow key={item.id} item={item} onRemove={handleRemove} />
                ))
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="card">
            <p className="section-title" style={{ marginBottom: "0.55rem" }}>
              Ajouter un article
            </p>
            <form
              className="row"
              style={{ alignItems: "flex-end", flexWrap: "wrap" }}
              onSubmit={(e) => void handleAddExtra(e)}
            >
              <IngredientSearchField
                id="extra-name"
                label="Article"
                value={addName}
                onChange={setAddName}
                suggestions={ingredientSuggestions}
              />
              <div className="field" style={{ marginBottom: 0, width: "5rem" }}>
                <label htmlFor="extra-quantity">Qté</label>
                <input
                  id="extra-quantity"
                  type="number"
                  className="input"
                  min="0"
                  step="any"
                  value={Number.isNaN(addQuantity) ? "" : String(addQuantity)}
                  onChange={(e) => setAddQuantity(e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ marginBottom: 0, width: "8rem" }}>
                <label htmlFor="extra-unit">Unité</label>
                <select
                  id="extra-unit"
                  className="select"
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value)}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={busy || !addName.trim()}>
                + Ajouter
              </Button>
            </form>
            <StatusBanner status={status} scope="add" />
          </div>

          {items === undefined ? (
            <Spinner />
          ) : (
            <div className="card stack" style={{ gap: "0.55rem" }}>
              <div className="row-spread">
                <p className="section-title">Articles ({extraItems.length})</p>
                <Button
                  size="sm"
                  disabled={busy || extraItems.length === 0}
                  onClick={() => void handleExport("extra")}
                >
                  Exporter vers « À acheter »
                </Button>
              </div>
              {extraItems.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)" }}>
                  Rien pour l&apos;instant. Ajoute un article avec le formulaire ci-dessus.
                </p>
              ) : (
                extraItems.map((item) => (
                  <StagingRow key={item.id} item={item} onRemove={handleRemove} />
                ))
              )}
              <StatusBanner status={status} scope="extra" />
            </div>
          )}
        </>
      )}

      {pendingCount && pendingCount > 0 ? (
        <p className="tag tag-warn" style={{ alignSelf: "flex-start" }}>
          {pendingCount} modification{pendingCount > 1 ? "s" : ""} en attente de synchro
        </p>
      ) : null}

      {items === undefined ? null : (
        <div className="card stack" style={{ gap: "0.55rem" }}>
          <div className="row-spread">
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>À acheter</h2>
            {finalItems.length > 0 ? (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => void handleClearFinal()}>
                Vider
              </Button>
            ) : null}
          </div>
          <StatusBanner status={status} scope="final" />
          {finalItems.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Vide pour l&apos;instant. Exporte « Cette semaine » et/ou « Courses supplémentaires »
              pour la remplir.
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
      )}
    </div>
  );
}
