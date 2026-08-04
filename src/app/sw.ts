import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

// Ce fichier est compilé par @serwist/next en public/sw.js au build.
// Rôle : permettre à l'app de s'ouvrir hors-ligne (cache des assets),
// et servir les pages en "stale-while-revalidate" (affichage immédiat
// des dernières données connues, mise à jour en tâche de fond dès que
// le réseau est disponible).
//
// Les données métier (plats, planning, liste de courses) ne transitent
// PAS par ce service worker : elles sont gérées côté application via
// Dexie (IndexedDB), voir src/lib/db/dexie.ts. Le service worker se
// contente de rendre l'app elle-même disponible hors-ligne.

// Le type ServiceWorkerGlobalScope n'est pas exposé avec la config DOM
// par défaut du projet. Comme ce fichier ne lit que `__SW_MANIFEST`
// (injecté par Serwist au build), on type `self` structurellement.
interface SwSelf {
  __SW_MANIFEST?: Array<{ url: string; revision: string | null }>;
}

declare const self: SwSelf;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
