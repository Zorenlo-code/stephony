# Stephony

Photographiez une partition et écoutez-la en son MIDI. Tout se passe **sur le téléphone** : la reconnaissance de la partition, le synthétiseur et l’enregistrement de vos partitions. Pas de serveur, pas de compte, et l’app fonctionne hors connexion une fois installée.

## Installer sur Android (une seule fois)

Une PWA doit être ouverte **une fois** depuis une adresse `https://` pour pouvoir s’installer. GitHub Pages fournit cette adresse gratuitement : c’est un simple dépôt de fichiers, sans serveur à gérer.

1. **Créez un compte** sur <https://github.com> (gratuit).
2. **Nouveau dépôt** : bouton « New repository », nom `stephony`, visibilité **Public** (Pages est gratuit pour les dépôts publics), puis « Create repository ».
3. **Envoyez les fichiers** : lien « uploading an existing file », puis glissez **le contenu** du dossier `stephony` (`index.html`, `sw.js`, `manifest.webmanifest` et les dossiers `css`, `js`, `icons` et `assets`). `index.html` doit se trouver à la racine du dépôt. Cliquez sur « Commit changes ».
4. **Activez Pages** : Settings → Pages → Source « Deploy from a branch », branche `main`, dossier `/ (root)`, puis « Save ». Une à deux minutes plus tard, l’adresse s’affiche : `https://VOTRE-NOM.github.io/stephony/`.
5. **Sur le téléphone**, ouvrez cette adresse dans **Chrome**, puis touchez le bouton « Installer » de l’app ou passez par le menu ⋮ → « Installer l’application ».

L’icône Stephony apparaît alors sur l’écran d’accueil. L’app s’ouvre en plein écran et fonctionne en mode avion.

> Gardez le dépôt en ligne : il ne sert qu’à installer l’app et à recevoir les mises à jour. Vos partitions restent sur votre téléphone, jamais sur GitHub.

## Utilisation

- **Prendre une photo** ou **Importer une image** : posez la partition bien à plat, sous une bonne lumière, sans ombre.
- La lecture prend quelques secondes. Chaque note reconnue est encadrée sur la photo.
- **▶** lance la lecture : la note jouée s’allume sur la photo et dans la bande de notes.
- **Touchez une note** pour la corriger : ½ ton, octave, durée, point, silence, liaison, triolet, insertion ou suppression. Les boutons « Reprise », « Fin » et « 1re/2e fin » ajoutent les signes de reprise autour de la note choisie.
- **Réglages** (icône en haut à droite) : clé, armure, transposition, métronome, jouer ou non les reprises, lecture en boucle, sortie MIDI, export `.mid` et suppression.
- **Partager une image** depuis la galerie vers Stephony fonctionne aussi une fois l’app installée.
- **Sortie MIDI** : branchez un clavier ou un expandeur MIDI (USB-OTG ou Bluetooth), puis choisissez « Rechercher un appareil MIDI… ».

Les noms de notes suivent la convention francophone : do3 est le do central.

## Ce que Stephony lit bien (et moins bien)

| Bien reconnu | Pas encore géré |
|---|---|
| Partitions imprimées, une voix par portée | Partitions manuscrites |
| Clés de sol, de fa et d’ut | Piano à deux mains liées par une accolade (chaque portée est lue l’une après l’autre) |
| Armures, dièses, bémols, bécarres | Quintolets, sextolets et autres n-olets ; ornements |
| Rondes à doubles croches, notes pointées, silences | D.C., D.S., Coda et Fine (texte) |
| Ligatures, crochets, liaisons de prolongation | Plusieurs voix sur une même portée |
| **Barres de reprise et 1re / 2e fins** (jouées dans l’ordre) | Paroles (ignorées) |
| **Triolets** (chiffre 3, avec ou sans crochet) | |

Résultats mesurés sur des partitions de test générées (5 polices musicales) :

- partition scannée : environ **97 %** des notes justes, **96 %** avec la bonne durée ;
- photo simulée (flou, inclinaison, perspective, éclairage inégal) : environ **89 %** ;
- partitions avec reprises et triolets : **99,7 %** des hauteurs, **95,6 %** des durées et la structure des reprises retrouvée dans 29 cas sur 30 en scan (22 sur 30 en photo très floue).

En cas d’erreur, quelques touches dans l’éditeur suffisent. Il permet aussi d’ajouter ou de corriger une reprise, une 1re/2e fin ou un triolet, et de jouer la partition sans les reprises (Réglages).

## Mettre à jour l’app

Remplacez les fichiers dans le dépôt GitHub, puis changez la ligne `const VERSION = 'stephony-v1.1.0'` de `sw.js` (par exemple `v1.1.1`). Les téléphones téléchargent la nouvelle version à la prochaine ouverture en ligne.

## Structure

```
index.html              interface
css/app.css             thème (couleurs du logo)
js/app.js               logique de l’app, éditeur, bibliothèque (IndexedDB)
js/omr.js               moteur de reconnaissance de partition (OMR)
js/omr-worker.js        exécution de l’OMR en arrière-plan
js/symbols-model.js     modèle de reconnaissance des symboles (clés, altérations, silences…)
js/synth.js             synthétiseur Web Audio, lecteur, sortie Web MIDI
js/midi.js              export de fichier MIDI
sw.js                   service worker (hors-ligne)
manifest.webmanifest    installation PWA
tools/                  outils de développement (évaluation, entraînement du modèle) : facultatifs
```
