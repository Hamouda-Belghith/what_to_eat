/**
 * - `dishes` : générée automatiquement depuis les plats planifiés.
 * - `extra` : articles ajoutés à la main, hors plats.
 * - `final` : la liste réellement utilisée au supermarché (cochable),
 *   remplie par les boutons « Exporter » des deux sections précédentes.
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
  /** Pour un article de `final` : la section dont il a été exporté. */
  originSection: "dishes" | "extra" | null;
}
