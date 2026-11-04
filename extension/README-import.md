# Import Closetia - branche de travail seulement

ATTENTION : les anciens fichiers closetia-import.json (format CLOSETIA v2 avec un seul items)
peuvent REMPLACER tout le dressing dans l'ancienne application. Ne pas les importer dans la production actuelle.

Le nouveau fichier utilise {format:"CLOSETIA-ITEMS",version:1,entries:[...]}.
Une ancienne application rejette ce format car il n'a pas de champ items. L'application corrigee
propose uniquement l'ajout pour ce type de fichier. Tenues, calendrier, profil et autres reglages sont conserves.
Une sauvegarde complete CLOSETIA reste importable, avec choix explicite Ajouter ou Restaurer.
Restaurer telecharge d'abord une sauvegarde du dressing courant ; verifier ce fichier avant toute restauration importante.
Un echec quota local annule le changement memoire et ne lance pas de nouvelle synchronisation.
Un echec de synchronisation ne doit pas retirer l'ajout local : la synchronisation reste en attente.

Ce socle ne garantit pas la compatibilite Alta Daily, ni l'existence d'un compte, ni l'exhaustivite/perennite des images distantes.
Il ne lit ni cookies ni vault et n'envoie rien lui-meme. Le JSON contient une URL d'image distante, pas une copie hors ligne de l'image.
Jamais charge comme extension Chrome a ce stade. Aucun merge/deploiement production fait.
