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
