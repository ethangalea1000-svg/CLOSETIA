# Import Closetia - socle d'extension Chrome

ATTENTION : les anciens fichiers closetia-import.json (format CLOSETIA v2 avec un seul items)
peuvent REMPLACER tout le dressing dans l'ancienne application. Ne pas les importer dans la production actuelle.

Le nouveau fichier utilise {format:"CLOSETIA-ITEMS",version:1,entries:[...]}.
Une ancienne application rejette ce format car il n'a pas de champ items. L'application corrigee
propose uniquement l'ajout pour ce type de fichier. Tenues, calendrier, profil et autres reglages sont conserves.
Une sauvegarde complete CLOSETIA reste importable, avec choix explicite Ajouter ou Restaurer.
Restaurer telecharge d'abord une sauvegarde du dressing courant ; verifier ce fichier avant toute restauration importante.
Un echec quota local annule le changement memoire et ne lance pas de nouvelle synchronisation.
Un echec de synchronisation ne doit pas retirer l'ajout local : la synchronisation reste en attente.

## Chargement de l'extension

Charger UNIQUEMENT les fichiers sources de ce depot : Code -> Download ZIP (dossier extension/)
ou raw.githubusercontent.com. Ne pas charger les URL closetia.pages.dev/extension/... : le HTML
servi y est modifie par Cloudflare Web Analytics (balise script ajoutee), ce qui casse le chargement
en extension et ajouterait un script tiers.
Chargement non package : chrome://extensions -> Mode developpeur -> Charger l'extension non packagee.

## Limites

Ce socle ne garantit pas la compatibilite Alta Daily, ni l'existence d'un compte, ni l'exhaustivite/perennite des images distantes.
Il ne lit ni cookies ni vault et n'envoie rien lui-meme. Le JSON contient une URL d'image distante, pas une copie hors ligne de l'image.
Tests locaux automatises effectues (manifest, popup, extraction, payload CLOSETIA-ITEMS v1) ; jamais encore charge par un utilisateur reel.
