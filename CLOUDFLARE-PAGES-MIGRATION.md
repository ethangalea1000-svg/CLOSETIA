# Préparer CLOSETIA sur Cloudflare Pages

Cette branche est une branche de migration. Le site GitHub Pages de production n’est pas modifié par ces commits. Ne fusionne pas cette branche dans `main` avant d’avoir validé le déploiement Cloudflare Pages.

## 1. Créer le projet Pages

1. Ouvre https://dash.cloudflare.com/ et va dans **Workers & Pages**.
2. Choisis **Create application → Pages → Connect to Git**.
3. Autorise GitHub et sélectionne `ethangalea1000-svg/CLOSETIA`.
4. Choisis la branche de production `cloudflare-pages-migration`.
5. Pour le site HTML statique, configure la commande de build `exit 0` et le répertoire de sortie `.` (la racine du dépôt). Ne lance pas le déploiement public avant l’étape 2.
6. Lance le déploiement et vérifie le domaine `*.pages.dev` attribué.

Guide officiel : https://developers.cloudflare.com/pages/get-started/git-integration/

## 2. Configurer l’accès administrateur AVANT de partager l’URL

Dans le projet Pages : **Settings → Variables and Secrets** (ou **Environment variables**, selon l’interface), ajoute pour **Production** :

- `ADMIN_USER` : un identifiant administrateur unique.
- `ADMIN_PASSWORD` : un mot de passe long, unique et jamais réutilisé.

Marque le mot de passe comme secret si l’interface le permet. Ne le place jamais dans un fichier Git, dans `app.js`, ni dans un message public. Ajoute les mêmes variables au contexte Preview uniquement si tu veux que les déploiements de test permettent aussi l’accès admin. Redéploie ensuite.

La fonction `functions/_middleware.js` bloque `/admin.html` tant que les deux variables ne sont pas définies. Elle renvoie un défi HTTP Basic, refuse les identifiants incorrects et interdit la mise en cache de la page. Le lien Admin a été retiré de la navigation publique ; l’ancienne route `#/admin` redirige vers cette page protégée.

## 3. Vérifier avant de basculer

- Ouvre `https://<ton-projet>.pages.dev/admin.html` en navigation privée : sans identifiants, le navigateur doit demander l’authentification.
- Vérifie qu’un mauvais mot de passe est refusé et que le bon permet d’ouvrir le tableau de bord.
- Vérifie l’accueil, le dressing, les tenues, l’import/export et la synchronisation Cloudflare.
- Compare les données avec l’ancien site avant de changer de lien. La migration de l’hébergement ne doit pas supprimer la base D1 ; ne réinitialise pas D1 et ne supprime pas l’ancien site pendant la validation.

## Important

- GitHub Pages ne lance pas les fonctions serveur Cloudflare. C’est pourquoi cette branche reste séparée de `main` jusqu’au déploiement Pages.
- Le HTTP Basic est une barrière d’accès serveur, mais Cloudflare Access avec une règle d’accès nominative est préférable si tu veux une connexion liée à ton identité.
- L’authentification de cette page ne remplace pas les contrôles d’accès déjà requis par les routes API du Worker de synchronisation.
