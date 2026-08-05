// Utilitaires de dates. Toutes les dates ISO sont locales (pas UTC)
// pour éviter les décalages d'un jour sur le planning.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** Renvoie le lundi de la semaine du jour donné. */
export function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

/** Renvoie le dimanche de la semaine du jour donné. */
export function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
}

export type DurationUnit = "day" | "week" | "month";

/**
 * Fin de période inclusive à partir d'une date de début.
 * Ex. 1 jour → le même jour ; 1 semaine → début + 6 jours.
 */
export function addInclusiveDuration(
  start: Date,
  amount: number,
  unit: DurationUnit
): Date {
  const n = Math.max(1, Math.floor(amount));
  if (unit === "day") return addDays(start, n - 1);
  if (unit === "week") return addDays(start, n * 7 - 1);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  end.setMonth(end.getMonth() + n);
  return addDays(end, -1);
}

export function formatDateShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
  });
}

export function formatDateLong(iso: string): string {
  return parseISODate(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Formate un nombre de quantité en évitant les décimales inutiles (2.5, 200...). */
export function formatQuantity(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}
