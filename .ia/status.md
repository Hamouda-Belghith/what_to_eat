# État actuel du projet (résumé rapide)

Date: 2026-09-20

Résumé:
- **Planning : affichage personnalisable, collation, apports** (2026-09-20) :
  la photo du plat n'apparaît plus dans le Planning (cases ni sélecteur),
  seulement sur l'écran Plats. Les cases issues du modèle de répétition
  sont **encadrées en vert** (plus de mot « Modèle »). Un nouveau créneau
  **Collation** (entre déjeuner et dîner) existe, et le panneau
  « Affichage » du Planning permet de cocher/décocher : Petit-déjeuner,
  Collation, Calories du jour, Protéines du jour (préférence mémorisée
  dans `localStorage`, par appareil ; défaut : petit-déj visible,
  collation et totaux masqués). Chaque plat a des champs optionnels
  **calories** et **protéines** (pour une portion), affichés sur sa
  fiche ; les totaux du jour n'additionnent que les créneaux affichés
  et sont suffixés « * » si un plat n'a pas la valeur renseignée. Voir
  `.ia/decisions.md` (2026-09-20). **Migrations à appliquer sur la base
  de production** : `0006_snack_meal_slot.sql` et
  `0007_dish_nutrition.sql`.
- L'application compile et le build Next.js fonctionne (`npm run build`).
- Le frontend a été **déployé sur Vercel** avec une URL de production.
- Un **mode démo local** reste disponible si les variables Supabase ne sont
  pas définies.
- **Plus d'onglet Cycles** : la répétition est un paramètre du Planning,
  avec une fréquence libre (« toutes les N semaines »). Voir `decisions.md`.
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
  l'écran Plats), affichée sur sa fiche uniquement (retirée du
  Planning le 2026-09-20). Stockée dans Supabase Storage (bucket
  `dish-photos`) en prod, en base64 dans `localStorage` en mode démo.
  Voir `.ia/decisions.md` (2026-09-18) et la migration
  `supabase/migrations/0004_dish_photos.sql` (à appliquer sur la base
  de production).
- **Fréquence de répétition libre + détection de chevauchement** : la
  barre « Répéter » du Planning accepte n'importe quel nombre de
  semaines (pas seulement 1 ou 2), via un champ numérique. Avant
  d'activer/changer la fréquence, l'app détecte les repas déjà
  planifiés à la main qui entrent en conflit avec la nouvelle fréquence
  et demande confirmation avant de les remplacer. Voir `.ia/decisions.md`
  (2026-09-18) et `src/features/planning/repeat.ts`
  (`findRepeatConflicts`). Pas de migration nécessaire.
  Note : une tentative précédente avait ajouté un mécanisme de
  répétition « par repas » séparé (table `meal_repeats`) — retiré à la
  demande de l'utilisateur, un seul mécanisme de répétition (le motif
  global) est conservé.
- **Vider la semaine / tout le planning** : deux boutons dans le
  Planning (« Vider » → « Cette semaine » / « Toutes les semaines »),
  avec confirmation. « Toutes les semaines » désactive aussi le motif de
  répétition. Nécessite `planned_meals.dish_id` nullable (voir migration
  ci-dessous) pour fonctionner correctement sur les cases issues du
  motif.
- **Navigation entre semaines, v2** : les flèches précédent/suivant sont
  collées aux extrémités gauche/droite du tableau du planning (plus
  grandes, 3.2rem, pour rester bien visibles) — elles font défiler *ce
  tableau*. Juste au-dessus du tableau, une barre calendrier
  (`<input type="date">`, icône 📅) au même style que les cases du
  tableau (bordure/radius/fond identiques) permet de sauter directement
  à une semaine éloignée. Le bouton « Aujourd'hui » a été retiré : le
  texte sous le titre (« Semaine du 14 au 20 septembre » — plage
  complète, via `formatWeekRange` dans `lib/date.ts`) fait maintenant
  aussi office de bouton « retour à aujourd'hui » au clic. Voir
  `src/features/planning/PlanningScreen.tsx` (`.week-calendar-bar`,
  `.week-grid-row`, `.week-edge-nav`, `.screen-kicker-button`) et
  `globals.css`.
- **Correctif important : repas planifié "vide" (`dish_id` nullable)** —
  `planned_meals.dish_id` peut désormais être `null`, ce qui représente
  une case explicitement vidée par l'utilisateur (empêche le motif de
  répétition de la remplir à nouveau au chargement suivant). Ce
  correctif était nécessaire au bon fonctionnement de « Vider cette
  semaine », mais corrige aussi un bug préexistant : retirer un repas
  avec « cette semaine seulement » pendant qu'un motif est actif ne
  persistait pas avant. Voir `.ia/decisions.md` (2026-09-18) et la
  migration `0005_nullable_planned_meal_dish.sql` (à appliquer sur la
  base de production).
- **La question de portée (« cette semaine / le modèle ») ne se pose
  plus que sur une case déjà remplie.** Choisir un plat pour une case
  vide l'ajoute directement pour cette semaine-là, sans interruption —
  même si un motif de répétition est actif. La question ne s'affiche
  que quand on modifie ou retire un repas déjà présent (voir
  `handlePickDish` dans `PlanningScreen.tsx`, condition
  `repeat?.active && editingMeal`).
- **Notification « semaine prochaine vide »** : si la semaine qui suit
  celle d'aujourd'hui (pas celle affichée) n'a aucun repas planifié, une
  bannière ambre s'affiche en haut du Planning, quelle que soit la
  semaine consultée (cliquer dessus y saute directement). Vérifié à
  chaque chargement du planning (`checkNextWeek` dans
  `PlanningScreen.tsx`).

État de la production :
- Le frontend Vercel est prêt, mais la version “réelle” n'est pas encore
  complètement fonctionnelle tant que les variables suivantes ne sont pas
  renseignées dans Vercel : `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Appliquer les migrations SQL (`0001_init.sql`, et le cas échéant
  `0002_user_scoping.sql`, `0003_single_repeat_pattern.sql`,
  `0004_dish_photos.sql`, `0005_nullable_planned_meal_dish.sql`) sur la
  base Supabase de production.
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
