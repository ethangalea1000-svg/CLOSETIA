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


## Connexion obligatoire et protection des comptes (Preview)

- La page de connexion/création de compte s’affiche avant toute route de l’application. Une session serveur valide est requise pour afficher les pages.
- L’API des comptes applique une limitation de débit de secours par adresse IP et type de route, rejette les requêtes POST cross-origin et refuse les corps JSON annoncés au-delà de 8 Ko.
- La limitation en mémoire est **best-effort** : elle peut être réinitialisée lors d’un redémarrage d’instance et ne remplace pas la protection DDoS au niveau Cloudflare.
- Dans Cloudflare, activer les protections DDoS gérées, les règles WAF gérées et une règle de limitation de débit ciblant `/api/accounts/*`. Pour commencer, limiter les rafales par IP sur l’API, puis appliquer des limites plus strictes à `/register` et `/login`. Ajuster après observation pour ne pas bloquer les utilisateurs légitimes.
- Le verrouillage d’interface n’est pas un chiffrement du stockage local : les données déjà enregistrées dans `localStorage` restent accessibles depuis le même navigateur/appareil. La synchronisation et les opérations serveur doivent également vérifier la session.
- La protection Cloudflare réseau/WAF ne peut pas être activée par un changement du dépôt seul ; elle nécessite une configuration dans le tableau de bord Cloudflare.

## Annuaire de comptes (Preview)

L'annuaire utilise la fonction Pages `functions/api/accounts/[[path]].js` et D1. Pour l'activer dans l'environnement **Preview uniquement** :

1. Créer une **base D1 séparée pour les tests**, par exemple `closetia-preview`. Ne lie pas la base D1 de production à la Preview. Dans Cloudflare Pages > CLOSETIA > Settings > Functions, lier cette base de test sous le nom de binding `CLOSETIA_DB` pour l’environnement Preview uniquement.
2. Dans les variables/secrets de l'environnement Preview, ajouter `AUTH_SECRET` avec une valeur aléatoire d'au moins 32 caractères. Ne jamais la placer dans le code ou le navigateur.
3. Redéployer la Preview, puis tester la création d'un compte, la connexion, la recherche et l'acceptation d'une demande.
4. Ne pas activer en production avant les tests de sécurité et de fonctionnement.

La fonction crée ses trois tables dédiées `closetia_accounts`, `closetia_friend_requests` et `closetia_friendships` dans la base D1 liée à cet environnement. **Ne pas utiliser la base de production** : l’initialisation crée des tables et écrit les comptes dans la base liée. Les mots de passe sont hachés avec PBKDF2; la session est un cookie signé, HttpOnly, Secure et SameSite=Lax. Le répertoire n'est pas opérationnel tant que le binding et le secret ne sont pas configurés.


## Authentification par e-mail — Preview uniquement

La branche Preview inclut désormais des routes pour la création de compte avec pseudo + e-mail + mot de passe, la connexion par e-mail et le lien magique à usage unique (15 minutes). Les anciens comptes pseudo/mot de passe restent compatibles. La migration D1 ajoute les colonnes e-mail et une table de jetons lors de l’accès à l’API.

Pour activer l’envoi des liens magiques, ajouter dans les secrets/variables **de l’environnement Preview uniquement** :

- `RESEND_API_KEY` : clé API Resend.
- `EMAIL_FROM` : expéditeur autorisé par le compte Resend, par exemple l’adresse de test autorisée tant qu’aucun domaine n’est vérifié.

Ne jamais committer ces valeurs. Les offres gratuites et les restrictions d’expédition des fournisseurs peuvent évoluer; vérifie les limites actuelles du fournisseur. Tant que ces deux valeurs ne sont pas configurées, la connexion e-mail avec mot de passe ne dépend pas du fournisseur, mais le lien magique ne peut pas être envoyé.

Les connexions Google et Apple, ainsi que les clés API des assistants IA, restent non configurées. Ne pas fusionner en production avant tests manuels, revue de sécurité et configuration séparée.


## Méthodes de connexion supplémentaires — Preview

Le formulaire de lien magique demande maintenant le pseudo et l’e-mail, qui doivent correspondre au même compte. L’envoi exige toujours les secrets `RESEND_API_KEY` et `EMAIL_FROM`.

Les choix Facebook, X, Apple, Google et LinkedIn sont affichés comme indisponibles tant que chaque fournisseur OAuth n’a pas ses identifiants, URL de rappel et route serveur validés. Ils ne déclenchent aucune fausse connexion. Le QR de connexion exige un protocole d’appairage avec jeton temporaire à usage unique et confirmation sur l’appareil déjà connecté; la biométrie exige WebAuthn/passkeys côté serveur. Ces deux mécanismes sont indiqués comme à développer et ne sont pas activés par cette modification.

**Important :** l’interface seule ne suffit pas à activer ces méthodes. Ne pas considérer Facebook/X/Apple/Google/LinkedIn, QR ou biométrie comme opérationnels avant implémentation backend, configuration des fournisseurs et tests de sécurité dans la Preview. La production et sa base D1 ne doivent pas être modifiées pour ces essais.
