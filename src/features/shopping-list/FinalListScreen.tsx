"use client";

import { FinalListSection } from "./FinalListSection";

/**
 * Écran dédié à la liste « À acheter » (même contenu que la section du
 * bas de l'écran Courses), accessible directement depuis la navigation
 * pour la consulter/cocher sans passer par les onglets de génération.
 */
export function FinalListScreen() {
  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 style={{ margin: 0 }}>À acheter</h1>
        </div>
      </div>
      <FinalListSection />
    </div>
  );
}
