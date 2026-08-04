# État actuel du projet (résumé rapide)

Date: 2026-08-03

Résumé:
- L'application compile et le build Next.js fonctionne (`npm run build`).
- Le serveur de développement démarre et sert l'app sur `http://localhost:3000`.
- Un **mode démo local** a été ajouté pour permettre l'exécution sans
  configuration Supabase. Dans ce mode:
  - Les comptes locaux sont gérés via `src/features/auth/localAuth.ts` (localStorage).
  - Les données de démonstration et les helpers se trouvent dans `src/lib/localDemo.ts`.
  - La liste de courses continue d'utiliser Dexie (`src/lib/db/dexie.ts`) comme source locale.

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
- Si vous voulez tester avec Supabase, créez un `.env.local` à la racine
  du projet et renseignez `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` puis relancez le serveur.
- En l'absence de ces variables, l'application bascule automatiquement en
  mode demo.

Fichiers importants à consulter pour l'état actuel:
- `src/lib/localDemo.ts` — backend demo local et `isDemoMode()`
- `src/features/auth/localAuth.ts` — stockage local des comptes et session
- `src/features/shopping-list/syncQueue.ts` — file de synchronisation
- `supabase/migrations/0001_init.sql` — schéma de données référentiel
