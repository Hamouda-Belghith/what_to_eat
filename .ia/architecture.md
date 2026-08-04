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

Voir `supabase/migrations/0001_init.sql` pour le DDL complet.

Tables principales :

| Table                  | Rôle                                                             |
|------------------------|-------------------------------------------------------------------|
| `ingredients`          | Référentiel unique des ingrédients                                |
| `dishes`               | Plats                                                              |
| `dish_ingredients`     | Composition d'un plat (ingrédient + quantité + unité)              |
| `meal_cycles`          | Modèle de cycle répétitif (ex: "cycle 2 semaines")                 |
| `meal_cycle_entries`   | Position d'un plat dans un cycle (jour relatif + repas)            |
| `planned_meals`        | Planning réel, calendaire (permet override ponctuel sans casser le cycle) |
| `shopping_list_items`  | Liste de courses agrégée et persistée, cochable, source de l'offline |

Point clé : `meal_cycle_entries` (le **modèle**) est séparé de
`planned_meals` (la **réalité calendaire**) pour permettre de générer
automatiquement le planning depuis un cycle tout en autorisant une
modification ponctuelle un jour donné sans casser la répétition future.

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
    cycles/                → cycles de répétition
    planning/             → planning calendaire réel
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
