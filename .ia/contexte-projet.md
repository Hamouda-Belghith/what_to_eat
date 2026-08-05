# Contexte projet

Ce projet consiste à développer une application web et mobile (PWA)
permettant aux utilisateurs de planifier leurs repas de manière simple
et flexible.

## Objectif

Aider les utilisateurs à mieux s'organiser, réduire le temps passé à
réfléchir aux repas et faciliter les courses.

## Usage cible

Application privée, à usage strictement personnel : 2 utilisateurs
(un couple). Pas de vocation à être publiée publiquement ni à
accueillir d'autres foyers pour l'instant.

## Fonctionnalités principales

- Créer un planning de repas pour chaque jour, avec distinction entre
  petit-déjeuner, déjeuner et dîner.
- Rendre une semaine (ou une quinzaine) répétitive depuis le Planning :
  « chaque semaine » ou « toutes les 2 semaines ». Pas d'onglet ni de
  ressource « Cycles » séparée — la répétition est un paramètre du
  planning. Lors d'une modification, choisir entre cette semaine
  seulement ou toutes les semaines futures.
- Associer une liste d'ingrédients à chaque plat. Les ingrédients sont
  saisis manuellement une fois par plat et réutilisés ensuite — pas
  d'intégration avec une API de supermarché.
- Générer automatiquement les ingrédients nécessaires pour les
  prochains jours ou les prochaines semaines (agrégation des
  ingrédients des plats planifiés sur une période).
- Permettre à l'utilisateur de vérifier ce qu'il lui manque avant de
  faire les courses (liste de courses cochable).
- La liste de courses doit être consultable et modifiable hors-ligne
  (usage typique : au supermarché, sans réseau).

## Contraintes

- Développement progressif, code propre, maintenable et facilement
  extensible.
- Budget cible : 0€/mois (voir `decisions.md` pour le raisonnement).
- Pas de présence sur l'App Store / Play Store dans un premier temps :
  la PWA installée sur l'écran d'accueil suffit à l'usage visé.

## Développement local et mode démo

- L'application peut désormais être lancée **sans configuration Supabase**
  : un backend local de démonstration est automatiquement utilisé lorsque
  `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont absents.
- Ce mode permet de créer des comptes locaux (stockés en `localStorage`),
  de gérer plats/planning (avec répétition) et de générer une liste de courses
  persistée localement. C'est un outil de développement et de démonstration
  — pour la production, Supabase reste le backend attendu.
- La version actuelle est également **déployée sur Vercel**. Pour passer
  d'un usage local à un usage réel, il faut renseigner les variables
  `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` dans
  Vercel, puis appliquer la migration SQL de `supabase/migrations/0001_init.sql`
  sur la base Supabase de production.

Ce document décrit le **besoin fonctionnel**. Les choix techniques et
leurs justifications sont dans `../decisions.md`. Les règles de travail
pour tout assistant IA intervenant sur ce projet sont dans `../agents.md`.
