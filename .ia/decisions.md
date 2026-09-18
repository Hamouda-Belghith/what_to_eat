# Journal des décisions techniques

Format : chaque décision indique le contexte, le choix retenu, les
alternatives écartées et pourquoi. Ajouter les nouvelles décisions en
haut du fichier (ordre antéchronologique).

---

## 2026-09-18 — Boutons « Vider », navigation calendrier, et repas planifié "vide" (dish_id nullable)

**Contexte** : demande de deux fonctionnalités sur le Planning —
un bouton pour vider la semaine affichée ou tout le planning, et un
moyen plus rapide de naviguer entre les semaines qu'avec les flèches
prev/suivant.

**Bug découvert en implémentant "Vider cette semaine"** : retirer un
repas avec la portée « cette semaine seulement » pendant qu'un motif de
répétition est actif ne persistait pas. La ligne `planned_meals` était
supprimée, mais `ensurePatternApplied` (appelé à chaque chargement du
planning, y compris juste après l'action elle-même) considérait
l'emplacement comme "jamais rempli" et le regénérait aussitôt depuis le
motif. Le repas retiré réapparaissait donc au rechargement suivant.
C'était déjà vrai avant cette tâche (comportement du bouton « Retirer le
repas » existant), mais bloquant pour « Vider cette semaine », qui doit
justement fonctionner sur les cases issues du motif.

**Décision** :
- `planned_meals.dish_id` devient nullable (migration
  `0005_nullable_planned_meal_dish.sql`). Une ligne à `dish_id = null`
  représente une case **explicitement vidée** : elle occupe
  l'emplacement (date + repas) pour empêcher le motif de le remplir à
  nouveau, mais ne représente aucun repas réel.
- `fetchPlannedMeals` (et son équivalent démo) filtrent ces lignes
  avant de les renvoyer : le reste de l'app (UI, génération de liste de
  courses, snapshot d'un nouveau motif) ne les voit jamais, elles
  s'affichent comme une case vide normale.
- `applyCycleToRange`/`applyDemoCycleToRange` utilisent en interne une
  requête distincte (`fetchOccupiedSlots` / `fetchDemoOccupiedSlots`)
  qui, elle, voit ces lignes — pour savoir où ne pas réappliquer le
  motif.
- `setMealWithScope` (portée "cette semaine") pose une case vidée au
  lieu de supprimer la ligne **seulement si un motif est actif** ;
  sinon (pas de motif), suppression réelle comme avant — pas de ligne
  inutile à conserver.
- Nouvelles fonctions `clearWeek` (vide une semaine, y compris les
  cases du motif — équivaut à faire "cette semaine seulement" sur
  chaque case) et `clearAllWeeks` (supprime tous les repas planifiés,
  passés et futurs, et désactive le motif) dans
  `src/features/planning/repeat.ts`, exposées par deux boutons
  « Vider » (rouges, avec confirmation) dans le Planning.
- Navigation calendrier : `<input type="date">` natif dans l'en-tête du
  Planning (à côté de « Aujourd'hui »), qui saute à la semaine contenant
  la date choisie. Choix délibéré face à un composant calendrier
  personnalisé : aucune dépendance ajoutée, calendrier natif du
  navigateur, cohérent avec la contrainte de simplicité du projet.

**Pourquoi corriger le bug maintenant plutôt que le signaler seulement** :
la fonctionnalité demandée (« vider cette semaine, y compris les cases
du modèle ») ne pouvait pas être livrée correctement sans ce correctif
— sans lui, le bouton aurait semblé fonctionner puis silencieusement
« annulé » l'action au rechargement suivant.

**Réversibilité** : changement de schéma additif (colonne rendue
nullable, pas de perte de données). Un rollback nécessiterait de
vérifier qu'aucune ligne à `dish_id null` n'existe avant de remettre la
contrainte `not null`.

**Migration** : `supabase/migrations/0005_nullable_planned_meal_dish.sql`.

---

## 2026-09-18 — Fréquence libre du motif global + détection de chevauchement

**Contexte** : une première itération avait ajouté un second mécanisme
de répétition « par repas » (table `meal_repeats`, déclenché depuis une
case vide du planning). Retour utilisateur : ce n'est pas ce qui était
voulu — un seul mécanisme doit exister, celui du motif global, mais
avec une fréquence libre (« tous les combien de semaines », pas
seulement 1 ou 2) plutôt que deux boutons fixes. Le mécanisme
`meal_repeats` (table, colonne `planned_meals.meal_repeat_id`, étape de
choix de durée depuis une case vide) a donc été entièrement retiré au
profit de cette décision.

**Décision** :
- `meal_cycles.duration_days` acceptait déjà n'importe quel entier ; le
  code applicatif limitait artificiellement le choix à 1 ou 2 semaines
  (`RepeatInterval = 1 | 2`). Généralisé en `RepeatInterval = number`
  (entier positif, nombre de semaines). Aucune migration nécessaire.
- La barre « Répéter » du planning remplace les 3 boutons fixes par :
  bouton « Non », un champ numérique « Toutes les ⟨N⟩ semaine(s) », et
  un bouton « Activer »/« Mettre à jour ». Le motif est toujours
  snapshotté depuis la semaine visible (sur `N` semaines) puis répété
  indéfiniment, comme avant.
- Le badge « Modèle » (renommé depuis « répété » pour plus de clarté)
  et le rappel de la semaine de référence dans le panneau restent
  inchangés — ils s'appliquent à ce seul mécanisme désormais.
- **Détection de chevauchement** : avant d'activer/changer la
  fréquence, `findRepeatConflicts` (dans `repeat.ts`) scanne les
  semaines à venir (horizon de remplissage, 8 semaines) et repère les
  repas déjà planifiés à la main qui ne correspondent pas à ce que la
  nouvelle fréquence y placerait (même case, plat différent). S'il y en
  a, une confirmation liste les conflits (date, repas, plat) et demande
  à l'utilisateur de choisir une autre fréquence, ou de continuer pour
  les remplacer par le motif. `applyCycleToRange`/`applyDemoCycleToRange`
  reçoivent un paramètre `overwrite` pour ce cas précis (par défaut
  `false`, les cases déjà remplies ne sont jamais écrasées silencieusement).

**Pourquoi pas de mécanisme séparé par repas** : un seul système de
répétition est plus facile à expliquer et à maintenir en tête pour un
usage à 2 personnes ; la fréquence libre couvre le besoin exprimé
(« tous les combien de semaines ») sans dupliquer la logique de
motif/snapshot/propagation déjà en place pour `meal_cycles`.

**Migration** : aucune (le schéma supportait déjà une fréquence libre).
Le fichier `supabase/migrations/0004_dish_photos_and_meal_repeats.sql`
de la tentative précédente a été renommé
`supabase/migrations/0004_dish_photos.sql` et ne contient plus que
l'ajout de la photo de plat (voir décision suivante).

---

## 2026-09-18 — Photo de plat (Supabase Storage)

**Contexte** : demande d'afficher une photo par plat, visible aussi
sur les cases du planning.

**Décision** : bucket Supabase Storage dédié `dish-photos` (public en
lecture, écriture restreinte à l'utilisateur authentifié dans son
propre dossier), URL publique stockée dans `dishes.photo_url`. En mode
démo local (sans Supabase), la photo est encodée en base64 et stockée
directement dans le plat en `localStorage` (pas de vrai backend de
fichiers disponible en démo).

**Pourquoi Supabase Storage plutôt que base64 partout** : le tier
gratuit (1 Go) suffit largement pour quelques dizaines de plats, et
évite d'alourdir chaque lecture de la table `dishes` avec des blobs
base64 volumineux. Le mode démo garde une solution plus simple
(base64) car il n'a pas d'accès à un vrai stockage de fichiers.

**Impacts** :
- Nouvelle policy RLS sur `storage.objects` (lecture publique, écriture
  scoping par dossier = `user_id`).
- Suppression best-effort de l'ancien fichier quand une photo est
  remplacée ou retirée, pour ne pas accumuler des fichiers orphelins
  dans le bucket au fil du temps.

**Migration** : `supabase/migrations/0004_dish_photos.sql`.

---

## 2026-08-05 — Répétition depuis le Planning (plus d'onglet Cycles)

**Contexte** : l'onglet Cycles forçait à créer une ressource séparée
puis à l'appliquer au planning — incohérent avec l'intention « cette
semaine se répète ».

**Décision** :
- Supprimer l'onglet / UI Cycles.
- Un seul motif de répétition par utilisateur (`meal_cycles.user_id`
  unique), piloté depuis le Planning : Non / Chaque semaine / Toutes
  les 2 semaines.
- Activer = snapshot de la semaine visible (ou semaine + suivante si
  2 semaines) vers le motif, puis matérialisation des cases vides.
- À l'édition d'un créneau : demander « cette semaine seulement »
  (override, `meal_cycle_id` null) ou « toutes les semaines futures »
  (met à jour le motif + occurrences liées).

**Alternatives écartées** : garder plusieurs cycles nommés ; motifs
parallèles — trop complexes pour 2 utilisateurs.

**Migration** : `supabase/migrations/0003_single_repeat_pattern.sql`.

---

## 2026-08-02 — Distinction des repas de la journée

**Contexte** : fallait-il distinguer petit-déjeuner / déjeuner / dîner
dès le départ, ou traiter "un plat par jour" de façon générique.

**Décision** : ajout d'un champ `meal_slot` (enum Postgres
`breakfast` / `lunch` / `dinner`) sur `meal_cycle_entries` et
`planned_meals`.

**Pourquoi un ENUM plutôt qu'un TEXT libre** : garantit au niveau base
de données qu'aucune valeur invalide ne peut être insérée (évite les
bugs silencieux type faute de frappe créant un slot fantôme).

---

## 2026-08-02 — Pas d'intégration API supermarché

**Contexte** : la liste de courses pourrait potentiellement se
construire à partir d'une API de supermarché (prix, disponibilité,
etc.).

**Décision** : les ingrédients sont saisis manuellement une fois par
plat (comme le nom du plat), puis réutilisés et agrégés automatiquement
pour générer la liste de courses. Aucune intégration externe.

**Pourquoi** : usage à 2 personnes, complexité et coût d'une
intégration API totalement disproportionnés par rapport au besoin. Le
modèle de données (`dish_ingredients`) suffit largement.

---

## 2026-08-02 — Offline limité à la liste de courses

**Contexte** : fallait-il rendre toute l'application offline-first, ou
cibler uniquement les écrans qui en ont vraiment besoin.

**Décision** : seule la liste de courses est offline (lecture +
écriture via Dexie/IndexedDB avec file de synchronisation). Le reste de
l'app (plats, cycles, planning) suppose une connexion réseau.

**Alternative écartée** : offline-first généralisé sur toute l'app —
rejeté car complexité inutile pour un besoin qui ne concerne en
pratique que la liste de courses consultée au supermarché.

**Stratégie de conflit retenue** : dernière écriture gagne (last write
wins). Un mécanisme de résolution de conflit plus sophistiqué (CRDT,
etc.) serait disproportionné pour 2 utilisateurs.

---

## 2026-08-02 — PWA plutôt que publication App Store / Play Store

**Contexte** : l'app doit être installable sur mobile pour un usage
privé (2 personnes).

**Décision** : PWA installable sur l'écran d'accueil (iOS et Android),
pas de publication sur les stores.

**Pourquoi** :
- Apple Developer Program coûte 99$/an, Google Play 25$ (unique), avec
  un processus de review, pour un bénéfice nul en usage privé.
- Une PWA bien faite (manifest + service worker) s'installe en plein
  écran, avec icône, et fonctionne offline pour les parties qui en ont
  besoin — indiscernable d'une app native pour cet usage.

**Réversibilité** : si le besoin de présence sur les stores apparaît
plus tard, le code Next.js peut être empaqueté avec Capacitor sans
réécriture.

---

## 2026-08-02 — Supabase plutôt que Firebase

**Contexte** : besoin d'une base de données + authentification gérées,
sans avoir à opérer un serveur, pour un budget de 0€/mois.

**Décision** : Supabase (Postgres managé + Auth + API auto-générée).

**Pourquoi plutôt que Firebase** : le modèle de données du projet est
fortement relationnel (plats ↔ ingrédients ↔ cycles ↔ planning ↔ liste
de courses), avec des contraintes d'unicité et des jointures naturelles
— un vrai SQL (Postgres) est plus adapté et plus simple à faire évoluer
proprement qu'un modèle documents (Firestore).

**Tier gratuit suffisant** : 500 Mo de DB et 50k auth/mois, très
largement au-dessus du besoin pour 2 utilisateurs.

---

## 2026-08-02 — Pas de VM, pas d'infra cloud payante

**Contexte** : usage strictement privé (2 personnes), donc trafic quasi
nul.

**Décision** : pas de VM (EC2, Cloud Run, etc.) à opérer soi-même.
Stack 100% BaaS/PaaS gratuite : Vercel (frontend) + Supabase
(backend/DB).

**Pourquoi** : une VM impose une charge de maintenance (patchs de
sécurité, monitoring, scaling) disproportionnée par rapport au besoin
et au trafic réel. Les tiers gratuits de Vercel et Supabase couvrent
largement l'usage visé.

**Coût total** : 0€/mois (hors nom de domaine personnalisé optionnel,
~10€/an).

---

## 2026-08-02 — Next.js + TypeScript comme stack frontend

**Contexte** : choix du framework frontend pour une PWA évolutive.

**Décision** : Next.js (App Router) + TypeScript.

**Pourquoi** :
- TypeScript réduit les bugs et facilite la maintenance à long terme.
- Next.js permet de garder une seule base de code pour le web, tout en
  ouvrant la porte à un empaquetage natif (Capacitor) si besoin plus
  tard, sans réécriture.

---

## 2026-08-02 — Séparation modèle de cycle / planning réel

**Contexte** : comment représenter un cycle répétitif tout en
permettant de modifier ponctuellement un jour sans casser la
répétition future.

**Décision** : deux tables distinctes — `meal_cycle_entries` (le
modèle répétitif : jour relatif + repas + plat) et `planned_meals` (le
planning calendaire réel, avec référence optionnelle au cycle
d'origine).

**Pourquoi** : permet de générer automatiquement le planning depuis un
cycle, tout en autorisant un override ponctuel (ex: remplacer le plat
du jour 5) sans modifier le cycle pour les semaines suivantes.

---

## 2026-08-04 — Déploiement production Vercel + Supabase

**Contexte** : l'application avait atteint un état utilisable localement,
mais pour une vraie utilisation en production il fallait connecter le
frontend Vercel à un projet Supabase réel.

**Décision** : maintenir l'architecture actuelle avec un frontend Next.js
hébergé sur Vercel et un backend Supabase (Postgres + Auth) connecté via
les variables d'environnement `NEXT_PUBLIC_SUPABASE_URL` et
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Impacts** :
- Le frontend Vercel doit recevoir les valeurs Supabase via ses variables
  d'environnement de production.
- La migration SQL de `supabase/migrations/0001_init.sql` doit être
  appliquée sur la base Supabase utilisée par l'application.
- Le mot de passe de base de données présent dans `.env` est un secret de
  connexion DB, mais il n'est pas la clé publique attendue par le frontend.

**Pourquoi** : cette combinaison conserve un coût nul ou très faible,
permet un déploiement simple et reste compatible avec le mode démo
local en cas d'absence de configuration Supabase.

---

## 2026-08-03 — Mode démo local lorsque Supabase est absent

**Contexte** : en développement local il était gênant d'obliger la
présence d'un projet Supabase et de ses clés d'environnement pour
lancer l'application et la tester.

**Décision** : introduire un backend de démonstration local (`src/lib/localDemo.ts`)
et une gestion d'auth locale (`src/features/auth/localAuth.ts`) activés
automatiquement quand `getSupabase()` renvoie `null` (i.e. variables
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` non définies).

**Impacts** :
- Permet de lancer, tester et démo l'application sans accès à Supabase.
- Les comptes créés en mode démo sont stockés côté client (`localStorage`).
- La logique de synchronisation offline (Dexie + `syncQueue`) reste
  active pour la liste de courses ; en mode demo la génération de
  liste écrit aussi dans Dexie/local state.

**Alternatives écartées** : forcer la présence d'un fichier `.env.local`
ou fournir des valeurs par défaut stockées dans le repo (risque de fuite
de clés / mauvaise pratique).

**Réversibilité** : si des variables Supabase sont fournies, l'app bascule
automatiquement vers Supabase sans perte de code.

---

## 2026-08-03 — Gestion locale de la session et rafraîchissement UI

**Contexte** : après création d'un compte local, l'UI devait refléter la
nouvelle session immédiatement sans forcer un reload manuel.

**Décision** : exposer `onLocalAuthStateChange()` dans
`src/features/auth/localAuth.ts` et utiliser `router.replace('/')` depuis
le `LoginScreen` pour garantir que l'état d'auth est rechargé et
que la file de synchronisation (si nécessaire) est rejouée.

