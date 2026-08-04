# Journal des décisions techniques

Format : chaque décision indique le contexte, le choix retenu, les
alternatives écartées et pourquoi. Ajouter les nouvelles décisions en
haut du fichier (ordre antéchronologique).

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

