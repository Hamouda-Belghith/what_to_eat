Icônes PWA (écran d'accueil iOS/Android), générées depuis `icon.svg`
(même fichier source que `src/app/icon.png` et `src/app/apple-icon.png` —
favicon et icône Apple, servis par la convention de fichiers de Next.js
App Router).

- `icon-192.png` (192×192) et `icon-512.png` (512×512) : déclarées dans
  `public/manifest.json`.
- Pour régénérer après une modification de `icon.svg` : rendre le SVG à
  chaque taille (192, 512, 512, 180) et exporter en PNG — un navigateur
  headless (ex. Playwright) fonctionne bien pour ça, pas besoin d'outil
  dédié.
