# CLOSETIA

Dressing intelligent, local-first et portable.

## Version Preview

- Dressing photo avec catégories, couleurs, favoris, recherche et filtres.
- Générateur de tenues, calendrier, météo, statistiques et profil de style.
- Recommandations Outfit Star avec explications sur les raisons de chaque suggestion.
- Colorimétrie exploratoire et harmonies de couleurs, sans diagnostic corporel.
- Liste d'envies locale avec prix, notes et liens de boutiques.
- Export JSON/CSV et import JSON.
- Synchronisation Cloudflare via Pages Functions et Worker.
- Protection des pages d'administration côté serveur et en-têtes de sécurité.
- Compression des photos et gestion plus prudente des erreurs de stockage.
- Diagnostic de taille des photos, de la sauvegarde JSON et du quota estimé du navigateur.
- Fusion prudente des données locales et Cloud avec sauvegarde avant fusion.
- PWA installable avec cache hors ligne versionné.

## Sécurité et données

- Les données de dressing contiennent des informations personnelles : ne partage pas les exports JSON publiquement.
- Les fonctions de partage entre amis restent à développer côté serveur.
- La synchronisation utilise encore un snapshot JSON complet ; une architecture de stockage d'images séparé sera nécessaire pour les dressings très volumineux.
- Le stockage actuel utilise encore localStorage pour le snapshot local. Le diagnostic de quota aide à repérer les risques, mais ne remplace pas une migration vers IndexedDB.
- Les changements sont développés sur la branche `cloudflare-pages-ready`. Ne pas fusionner vers la production avant des tests fonctionnels et de sécurité.

## Tests effectués

- Vérification de syntaxe JavaScript sur `app.js` et `functions/_middleware.js`.
- Tests logiques de fusion : conservation des pièces locales et distantes, priorité aux versions locales en cas de même identifiant, fusion des calendriers et de la liste d'envies.
- La Preview doit encore être vérifiée dans un navigateur après chaque déploiement : import JSON, liste d'envies, connexion Cloud et ajout de photos.

## Prochaines étapes

- Déplacer les images et les données volumineuses de localStorage vers IndexedDB côté navigateur.
- Stocker les images côté serveur séparément du snapshot JSON (par exemple objet de stockage), après audit du Worker et définition des autorisations.
- Tests de charge avec beaucoup de photos.
- Planificateur de tenues amélioré et recommandations météo plus intelligentes.
- Audit séparé du Worker et de toutes les autorisations API.


## Annuaire de comptes (Preview)

L'annuaire utilise la fonction Pages `functions/api/accounts/[[path]].js` et D1. Pour l'activer dans l'environnement **Preview uniquement** :

1. Dans Cloudflare Pages > CLOSETIA > Settings > Functions, lier la base D1 existante sous le nom de binding `CLOSETIA_DB`.
2. Dans les variables/secrets de l'environnement Preview, ajouter `AUTH_SECRET` avec une valeur aléatoire d'au moins 32 caractères. Ne jamais la placer dans le code ou le navigateur.
3. Redéployer la Preview, puis tester la création d'un compte, la connexion, la recherche et l'acceptation d'une demande.
4. Ne pas activer en production avant les tests de sécurité et de fonctionnement.

La fonction crée ses trois tables dédiées `closetia_accounts`, `closetia_friend_requests` et `closetia_friendships` dans la base D1 liée à cet environnement. Les mots de passe sont hachés avec PBKDF2; la session est un cookie signé, HttpOnly, Secure et SameSite=Lax. Le répertoire n'est pas opérationnel tant que le binding et le secret ne sont pas configurés.
