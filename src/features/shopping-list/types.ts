/**
 * - `dishes` : générée automatiquement depuis les plats planifiés sur
 *   une période choisie (onglet « Cette semaine »). Seule section liée
 *   à une période.
 * - `extra` : articles ajoutés à la main (onglet « Courses
 *   supplémentaires »), liste continue (pas de période).
 * - `final` : la liste « À acheter », réellement utilisée au
 *   supermarché (cochable), remplie par les boutons « Exporter » des
 *   deux sections précédentes et vidée manuellement (bouton « Vider »).
 *   Liste continue elle aussi.
 */
export type ShoppingSection = "dishes" | "extra" | "final";

export interface ShoppingListItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  isChecked: boolean;
  section: ShoppingSection;
}
