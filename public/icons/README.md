Icônes PWA (écran d'accueil iOS/Android), déclarées dans
`public/manifest.json` :
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

Source actuelle : une illustration fournie par l'utilisateur (recadrée
en carré, redimensionnée à chaque taille), pas `icon.svg` (ancien
design, conservé ici pour référence mais plus utilisé). Mêmes fichiers
que `src/app/icon.png` et `src/app/apple-icon.png` — favicon et icône
Apple, servis par la convention de fichiers de Next.js App Router.

Pour changer l'icône : remplacer les quatre PNG (192, 512, 512, 180)
par la nouvelle image recadrée en carré à chaque taille.
