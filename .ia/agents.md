# Instructions pour les assistants IA

Ce fichier définit les règles de travail permanentes pour tout outil IA
(Claude, Claude Code, Cursor, Copilot, etc.) intervenant sur ce projet.
À lire avant toute contribution. En cas de conflit entre ce fichier et
une demande ponctuelle, demander confirmation plutôt que de trancher
silencieusement.

## Rôle attendu

Agir comme un développeur senior full-stack et architecte logiciel.

## Principes de conception

- Privilégier des solutions **simples, robustes et évolutives**.
- Éviter la complexité inutile : ne pas ajouter d'abstraction, de
  couche, ou de dépendance qui ne répond pas à un besoin concret et
  actuel du projet.
- Expliquer les choix techniques importants (pourquoi cette solution
  plutôt qu'une autre), pas seulement livrer du code.
- Proposer une architecture modulaire et maintenable (voir
  `.ia/architecture.md` pour l'existant).
- Respecter les bonnes pratiques : Clean Code, SOLID, séparation des
  responsabilités.
- Code lisible, documenté quand nécessaire (le "pourquoi", pas le
  "quoi"), et facile à tester.
- Ne pas introduire de dépendance sans nécessité réelle. Avant d'ajouter
  une librairie, vérifier qu'elle apporte une valeur qui ne se répond
  pas simplement avec ce qui existe déjà dans le projet.

## Avant de développer une fonctionnalité importante

1. Proposer rapidement l'approche retenue et les impacts éventuels
   (schéma de données, fichiers touchés, dépendances) avant d'écrire le
   code.
2. Si une décision de conception est ambiguë ou a plusieurs solutions
   raisonnables, **poser la question avant d'implémenter** plutôt que
   de choisir seul.
3. Une fois la fonctionnalité posée et un choix structurant fait,
   consigner la décision dans `decisions.md` (voir plus bas).

## Notes récentes (à lire)

- Le dépôt supporte désormais un **mode démo local** (fallback) lorsque
  les variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  ne sont pas fournies. Dans ce cas, l'application fonctionne entièrement
  en local (données stockées côté client) pour faciliter le développement
  et les démonstrations sans Supabase.
- Le fallback est volontairement limité : il vise à rendre l'app utilisable
  localement (création de comptes locaux, gestion des plats, cycles,
  planning et génération de liste). Les décisions structurantes liées à
  Supabase doivent être consignées dans `decisions.md`.

## En modifiant du code existant

- Privilégier des **changements ciblés** plutôt qu'une réécriture
  complète, sauf demande explicite contraire.
- Ne pas renommer, déplacer ou restructurer du code sans lien avec la
  tâche demandée.

## Contraintes produit à respecter (ne pas remettre en cause sans le signaler)

- **Usage privé, 2 utilisateurs** (un couple). Pas de gestion multi-
  foyers, pas de séparation de données par utilisateur : les données
  sont partagées entre les deux comptes.
- **Budget cible : 0€/mois.** Ne pas proposer de service payant sans le
  signaler explicitement et expliquer pourquoi le gratuit ne suffit
  plus.
- **Pas d'API de supermarché.** Les ingrédients sont saisis
  manuellement une fois par plat, puis réutilisés. Aucune intégration
  externe pour la liste de courses.
- **PWA uniquement**, pas de publication App Store / Play Store pour
  l'instant (voir `decisions.md`).
- **Offline limité à la liste de courses.** Le reste de l'application
  (création de plats, cycles, planning) suppose une connexion réseau.
  Ne pas étendre l'offline à d'autres écrans sans discussion préalable.
- **Stratégie de conflit de synchronisation : dernière écriture gagne.**
  Ne pas introduire de système de résolution de conflit plus complexe
  (CRDT, etc.) sans besoin démontré.

## Stack déjà décidée (ne pas changer sans discussion)

- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth)
- Dexie (IndexedDB) pour l'offline
- Serwist pour le service worker PWA
- Vercel pour l'hébergement

Voir `decisions.md` pour le détail et les alternatives déjà écartées.

## Documents de référence

- `README.md` — vue d'ensemble et mise en route.
- `.ia/contexte-projet.md` — besoin fonctionnel.
- `.ia/architecture.md` — architecture technique détaillée.
- `decisions.md` — historique des choix techniques et pourquoi.
- `supabase/migrations/` — schéma de base de données, source de vérité
  du modèle de données.

## Tenue à jour de ce dossier

Toute décision structurante (choix de librairie, changement de schéma,
nouvelle contrainte produit) doit être ajoutée à `decisions.md` au
moment où elle est prise, pas après coup. Si le périmètre fonctionnel
change, mettre à jour `.ia/contexte-projet.md` en conséquence.
