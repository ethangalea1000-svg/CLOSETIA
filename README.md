# CLOSETIA

Dressing intelligent, local-first et portable.

## Version Preview

- Dressing photo avec catégories, couleurs, favoris, recherche et filtres.
- Générateur de tenues, calendrier, météo, statistiques et profil de style.
- Colorimétrie exploratoire et harmonies de couleurs, sans diagnostic corporel.
- Liste d'envies locale avec prix, notes et liens de boutiques.
- Export JSON/CSV et import JSON.
- Synchronisation Cloudflare via Pages Functions et Worker.
- Protection des pages d'administration côté serveur et en-têtes de sécurité.
- Compression des photos et gestion plus prudente des erreurs de stockage.
- Fusion prudente des données locales et Cloud avec sauvegarde avant fusion.
- PWA installable avec cache hors ligne versionné.

## Sécurité et données

- Les données de dressing contiennent des informations personnelles : ne partage pas les exports JSON publiquement.
- Les fonctions de partage entre amis restent à développer côté serveur.
- La synchronisation utilise encore un snapshot JSON complet ; une architecture de stockage d'images séparé sera nécessaire pour les dressings très volumineux.
- Les changements sont développés sur la branche `cloudflare-pages-ready`. Ne pas fusionner vers la production avant des tests fonctionnels et de sécurité.

## Tests effectués

- Vérification de syntaxe JavaScript sur `app.js` et `functions/_middleware.js`.
- Tests logiques de fusion : conservation des pièces locales et distantes, priorité aux versions locales en cas de même identifiant, fusion des calendriers et de la liste d'envies.

## Prochaines étapes

- Test navigateur de chaque parcours sur Preview.
- Audit séparé du Worker et de toutes les autorisations API.
- Tests de charge avec beaucoup de photos.
- Planificateur de voyages et recommandations météo plus intelligentes.
