# État actuel du projet (résumé rapide)

Date: 2026-09-18

Résumé:
- L'application compile et le build Next.js fonctionne (`npm run build`).
- Le frontend a été **déployé sur Vercel** avec une URL de production.
- Un **mode démo local** reste disponible si les variables Supabase ne sont
  pas définies.
- **Plus d'onglet Cycles** : la répétition est un paramètre du Planning
  (chaque semaine / toutes les 2 semaines). Voir `decisions.md`.
- **Recherche de plats** : un champ de recherche filtre la liste des plats
  par nom/description côté client, sur l'écran Plats
  (`src/features/dishes/DishesScreen.tsx`). Filtrage simple en mémoire,
  pas de recherche côté serveur (nombre de plats attendu faible pour 2
  utilisateurs).
- **Alignement des libellés du Planning** : « Petit-déj / Déjeuner /
  Dîner » sont maintenant alignés avec leurs 3 lignes de cases (la
  colonne d'étiquettes mirrore la structure de l'en-tête des jours et
  a la même hauteur de ligne que `.meal-cell`). Voir
  `src/features/planning/PlanningScreen.tsx` et `src/app/globals.css`.
- **Photo de plat** : chaque plat peut avoir une photo (upload depuis
  l'écran Plats), affichée sur sa fiche, dans le sélecteur du planning
  et sur les cases du planning. Stockée dans Supabase Storage (bucket
  `dish-photos`) en prod, en base64 dans `localStorage` en mode démo.
  Voir `.ia/decisions.md` (2026-09-18) et la migration
  `supabase/migrations/0004_dish_photos_and_meal_repeats.sql` (à
  appliquer sur la base de production).
- **Répétition par repas** : en plus du motif global existant, un repas
  peut désormais se répéter chaque semaine pour une durée choisie (3
  semaines, 4 semaines, indéfiniment) directement depuis une case vide
  du planning. Modifier une occurrence ne change que cette date, sans
  question de portée. Voir `.ia/decisions.md` (2026-09-18),
  `src/features/planning/api.ts` (`createMealRepeat`,
  `ensureMealRepeatsApplied`) et la même migration `0004`.

État de la production :
- Le frontend Vercel est prêt, mais la version “réelle” n'est pas encore
  complètement fonctionnelle tant que les variables suivantes ne sont pas
  renseignées dans Vercel : `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Appliquer les migrations SQL (`0001_init.sql`, et le cas échéant
  `0002_user_scoping.sql`, `0003_single_repeat_pattern.sql`,
  `0004_dish_photos_and_meal_repeats.sql`) sur la base Supabase de
  production.
- L'authentification email Supabase doit être vérifiée si les utilisateurs
  doivent créer des comptes depuis la version déployée.

Problèmes connus:
- Icônes manquantes: `/icons/icon-192.png` peut renvoyer 404 si les
  ressources d'icônes ne sont pas présentes dans `public/icons`.
- Le mode demo stocke les données uniquement côté client ; ne pas
  compter sur ces données pour un usage multi-device.

Comment lancer localement:

1. Développement (Hot reload):

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

2. Build de production (test de compilation):

```bash
npm run build
```

Notes d'utilisation:
- Pour tester avec Supabase, créez un `.env.local` à la racine du projet et
  renseignez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- En l'absence de ces variables, l'application bascule automatiquement en
  mode demo.

Fichiers importants à consulter pour l'état actuel:
- `src/features/planning/repeat.ts` — répétition depuis le Planning
- `src/lib/localDemo.ts` — backend demo local et `isDemoMode()`
- `src/features/auth/localAuth.ts` — stockage local des comptes et session
- `src/features/shopping-list/syncQueue.ts` — file de synchronisation
- `supabase/migrations/` — schéma de données référentiel
