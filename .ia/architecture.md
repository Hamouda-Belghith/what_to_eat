# Architecture technique

## Vue d'ensemble

```
Navigateur (PWA)
  ├─ Next.js (App Router, TypeScript)
  ├─ Dexie / IndexedDB          → cache local + offline liste de courses
  └─ Service Worker (Serwist)   → cache des assets, ouverture offline de l'app
        │
        ▼
Supabase (Postgres + Auth)
        │
Vercel (hébergement du frontend)

Note: pour le développement local, l'application propose un mode
"demo" qui remplace Supabase par une couche locale (stockée en
`localStorage` et Dexie pour la liste de courses). Voir `lib/localDemo.ts`
et `features/auth/localAuth.ts` pour les détails d'implémentation.
```

## Déploiement actuel (2026-08-04)

- Le frontend est déployé sur Vercel et accessible via une URL de
  production.
- La production attend un projet Supabase configuré avec deux variables
  d'environnement côté Vercel : `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Le schéma SQL de la base est défini dans `supabase/migrations/0001_init.sql`.
  Il doit être exécuté dans l'instance Supabase utilisée en production pour
  créer les tables, types et policies RLS.
- Le fichier `.env` du dépôt peut contenir des secrets de développement,
  mais les variables frontend doivent rester définies dans Vercel et non
  dans le code source du repo.

## Pourquoi ces choix (résumé — détails dans decisions.md)

- **Next.js + TypeScript** : base solide, statiquement typée, seule
  techno frontend nécessaire (pas de backend séparé à maintenir).
- **Supabase** : Postgres managé (modèle relationnel adapté aux
  relations plats/ingrédients/planning), Auth intégrée, tier gratuit
  largement suffisant pour 2 utilisateurs.
- **Vercel** : hébergement gratuit du frontend, déploiement continu
  depuis Git.
- **Dexie (IndexedDB)** : la seule partie de l'app qui a un vrai besoin
  offline est la liste de courses (consultée au supermarché). Le reste
  de l'app (création de plats, planning) suppose une connexion réseau.
  Concrètement, la logique permet aujourd'hui de travailler sans
  Supabase en activant automatiquement le mode demo lorsque les variables
  d'environnement Supabase sont absentes (utile pour tests locaux
  et démonstrations hors-ligne). Dexie continue d'être la source de
  vérité pour la liste de courses offline même en mode demo.
- **Serwist** : génère le service worker pour que l'app se lance même
  hors-ligne (cache des assets statiques), succession maintenue de
  next-pwa pour l'App Router.

## Schéma de base de données

Voir `supabase/migrations/0001_init.sql` pour le DDL complet. Les
fichiers de migration sont figés une fois créés : toute évolution de
schéma passe par un nouveau fichier, jamais une édition d'un fichier
existant (voir `.ia/agents.md`, section « Migrations SQL »).

Tables principales :

| Table                  | Rôle                                                             |
|------------------------|-------------------------------------------------------------------|
| `ingredients`          | Référentiel unique des ingrédients                                |
| `dishes`               | Plats (dont `photo_url`, voir plus bas)                           |
| `dish_ingredients`     | Composition d'un plat (ingrédient + quantité + unité)              |
| `meal_cycles`          | Motif unique de répétition (fréquence libre, en semaines), piloté depuis le Planning |
| `meal_cycle_entries`   | Créneaux du motif (jour relatif + repas + plat)                        |
| `planned_meals`        | Planning calendaire réel (override possible sans casser le motif)      |
| `shopping_list_items`  | Liste de courses agrégée et persistée, cochable, source de l'offline |

Point clé : un seul motif de répétition par utilisateur
(`meal_cycles`/`meal_cycle_entries`), avec une fréquence libre en
nombre de semaines (`meal_cycles.duration_days`, saisie via un champ
numérique « toutes les N semaines » — voir `.ia/decisions.md`
2026-09-18). `meal_cycle_entries` (le **modèle**) est séparé de
`planned_meals` (la **réalité calendaire**) pour remplir automatiquement
les semaines futures tout en autorisant un override ponctuel (« cette
semaine seulement ») sans casser la répétition.

Avant d'activer ou de changer la fréquence, `findRepeatConflicts`
(`src/features/planning/repeat.ts`) détecte les repas déjà planifiés à
la main dans les semaines à venir qui entreraient en conflit avec la
nouvelle fréquence, et demande confirmation avant de les remplacer
(`applyCycleToRange`/`applyDemoCycleToRange` acceptent un paramètre
`overwrite` pour ce cas précis).

Un seul mécanisme de répétition existe (pas de répétition par repas
séparée — une tentative en ce sens a été retirée, voir
`.ia/decisions.md` 2026-09-18).

**`planned_meals.dish_id` est nullable.** Une ligne à `dish_id = null`
représente une case **explicitement vidée** par l'utilisateur (via les
boutons « Vider » ou un retrait « cette semaine seulement » pendant
qu'un motif est actif) : elle occupe l'emplacement (date + repas) pour
empêcher le motif de le remplir à nouveau, mais ne représente aucun
repas réel. `fetchPlannedMeals`/`fetchDemoPlannedMeals` filtrent ces
lignes avant de les renvoyer — tout le reste de l'app (UI, snapshot
d'un nouveau motif, génération de la liste de courses) les traite comme
une case vide normale. Seul `applyCycleToRange`/`applyDemoCycleToRange`
en a besoin (via `fetchOccupiedSlots`/`fetchDemoOccupiedSlots`), pour
savoir où ne pas réappliquer le motif. Voir `.ia/decisions.md`
2026-09-18 pour le bug que ce mécanisme corrige.

Le Planning propose aussi : « Vider cette semaine » / « Vider toutes
les semaines » (`clearWeek`/`clearAllWeeks` dans `repeat.ts`), et une
navigation par calendrier (`<input type="date">`) en plus des flèches
précédent/suivant.

**Photo de plat** : `dishes.photo_url` stocke l'URL publique d'un
fichier dans le bucket Supabase Storage `dish-photos` (policies RLS :
lecture publique, écriture scoping par dossier `user_id/...`). En mode
démo local, la photo est encodée en base64 directement dans
`localStorage` (pas de vrai stockage de fichiers disponible hors
Supabase). Affichée sur la fiche plat, le sélecteur du planning et les
cases du planning.

## Stratégie offline (liste de courses uniquement)

1. Lecture : `shopping_list_items` est répliqué dans Dexie
   (`src/lib/db/dexie.ts`), qui sert de source de vérité pour l'UI —
   affichage instantané, fonctionne sans réseau.
2. Écriture : une action (ex: cocher un article) est appliquée
   immédiatement en local, puis empilée dans une file d'attente
   (`src/features/shopping-list/syncQueue.ts`).
3. Synchronisation : dès que le réseau revient (`online` event), la
   file est rejouée vers Supabase, dans l'ordre, en s'arrêtant à la
   première erreur pour réessayer plus tard.
4. Stratégie de conflit : "dernière écriture gagne" (last write wins).
   Suffisant vu qu'il n'y a que 2 utilisateurs et un risque de
   collision quasi nul.

## Arborescence du code

```
src/
  app/                    → routes Next.js (App Router) + service worker (sw.ts)
  features/
    dishes/               → plats et leurs ingrédients
    cycles/               → constantes repas + types du motif (plus d'UI dédiée)
    planning/             → planning + répétition (repeat.ts)
    shopping-list/        → génération + offline de la liste de courses
  lib/
    supabase/             → client Supabase + types générés du schéma
    localDemo.ts          → backend demo local (fallback sans Supabase)
    db/                   → configuration Dexie (IndexedDB)
supabase/
  migrations/             → schéma SQL versionné
.ia/                      → documents de contexte pour les assistants IA
```

Chaque `feature` est autonome (types, hooks, logique) pour rester
testable et remplaçable indépendamment des autres.
