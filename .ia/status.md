# État actuel du projet (résumé rapide)

Date: 2026-08-04

Résumé:
- L'application compile et le build Next.js fonctionne (`npm run build`).
- Le frontend a été **déployé sur Vercel** avec une URL de production.
- Un **mode démo local** reste disponible si les variables Supabase ne sont
  pas définies. Dans ce mode :
  - Les comptes locaux sont gérés via `src/features/auth/localAuth.ts` (localStorage).
  - Les données de démonstration et les helpers se trouvent dans `src/lib/localDemo.ts`.
  - La liste de courses continue d'utiliser Dexie (`src/lib/db/dexie.ts`) comme source locale.

État de la production :
- Le frontend Vercel est prêt, mais la version “réelle” n'est pas encore
  complètement fonctionnelle tant que les variables suivantes ne sont pas
  renseignées dans Vercel : `NEXT_PUBLIC_SUPABASE_URL` et
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- La migration SQL de `supabase/migrations/0001_init.sql` doit être exécutée
  dans la base Supabase de production pour créer les tables et policies RLS.
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
- `src/lib/localDemo.ts` — backend demo local et `isDemoMode()`
- `src/features/auth/localAuth.ts` — stockage local des comptes et session
- `src/features/shopping-list/syncQueue.ts` — file de synchronisation
- `supabase/migrations/0001_init.sql` — schéma de données référentiel
