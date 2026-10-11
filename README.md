# Stephony

Photographiez une partition et écoutez-la en son MIDI. 
Tout se passe **sur le téléphone** : la reconnaissance de la partition, le synthétiseur et l’enregistrement de vos partitions. Pas de serveur, pas de compte, et l’app fonctionne hors connexion une fois installée.

## Installer sur Android (une seule fois)

**Sur le téléphone**, ouvrez cette adresse **https://zorenlo-code.github.io/stephony/** dans **Chrome**, puis touchez le bouton « Installer » de l’app ou passez par le menu ⋮ → « Installer l’application ».

L’icône Stephony apparaît alors sur l’écran d’accueil. L’app s’ouvre en plein écran et fonctionne en mode avion.

## Utilisation

- **Prendre une photo** ou **Importer une image** : posez la partition bien à plat, sous une bonne lumière, sans ombre.
- La lecture prend quelques secondes. Chaque note reconnue est encadrée sur la photo.
- **Le titre est lu automatiquement** quand il figure sur la partition (« DE L’ARTICULATION » devient « De l’articulation »). Le **tempo** écrit (Allegro, M.M. 108…) règle le curseur de tempo.
- **▶** lance la lecture : la note jouée s’allume sur la photo et dans la bande de notes.
- **Touchez une note** pour la corriger. L’éditeur a trois onglets :
  - **Note** : ½ ton, octave, durée, point, silence, liaison de prolongation, insertion, suppression ;
  - **Jeu** : nuance (pp à ff, sf, fp), accent, staccato, tenuto, marcato, piqué, point d’orgue, respiration, texte d’expression, note liée, début et fin de crescendo ou de diminuendo ;
  - **Structure** : triolet, reprises, 1re / 2e fin, changement d’armure, tempo, insertion avant.
- **Ajouter** (au-dessus de la photo) : choisissez Note, Silence, Armure ou Texte, puis touchez la partition à l’endroit de l’élément oublié. La hauteur de la note est déduite de sa position sur la portée.
- **Renommer** : crayon à côté du titre, ou bouton ⋯ d’une partition dans « Mes partitions ».
- **Réglages** (icône en haut à droite) : clé, armure, transposition, interprétation (nuances et articulations jouées ou lecture neutre), métronome, reprises, lecture en boucle, sortie MIDI, export `.mid` et suppression.
- **Partager une image** depuis la galerie vers Stephony fonctionne aussi une fois l’app installée.
- **Sortie MIDI** : branchez un clavier ou un expandeur MIDI (USB-OTG ou Bluetooth), puis choisissez « Rechercher un appareil MIDI… ».

Les noms de notes suivent la convention francophone : do3 est le do central.

## Ce que Stephony lit et joue

| Signe | Effet en MIDI |
|---|---|
| Notes, silences, points, ligatures, crochets, triolets | hauteurs et durées |
| Clés de sol, fa, ut ; armures, **changements d’armure en cours de morceau** ; altérations accidentelles | hauteurs |
| Chiffrages, y compris **6/8, 9/8, 12/8** et C barré | métronome ; en mesure composée le tempo vaut pour la noire pointée |
| Reprises, 1re / 2e fins | ordre de lecture |
| **Nuances** pp, p, mp, mf, f, ff, sf, fp | vélocité (pp 42, p 55, mp 67, mf 80, f 96, ff 110) |
| **Soufflets** et textes *cresc.*, *dim.*, *poco a poco crescendo* | vélocité progressive jusqu’à la nuance suivante |
| **Accent, marcato** | note plus forte |
| **Staccato, piqué, tenuto, liaisons d’expression** | durée jouée (50 %, 30 %, 98 %, notes liées) |
| **Point d’orgue, respiration** | note allongée ; courte coupure avant la note suivante |
| **Tempo écrit** (Allegro, M.M. 108), *rit.*, *poco rit.*, *en élargissant*, *a tempo*, *I° Tempo* | tempo de départ, ralentis et retours au tempo |
| **Titre** | nom de la partition |

Pas encore gérés : partitions manuscrites, piano à deux mains liées par une accolade, plusieurs voix sur une même portée, ornements (trilles, mordants), D.C. / D.S. / Coda, quintolets et autres n-olets.

Résultats mesurés sur des partitions de test générées (5 polices musicales) :

- partition scannée : environ **97,6 %** des notes justes, **96 %** avec la bonne durée ;
- photo simulée (flou, inclinaison, perspective, éclairage inégal) : environ **89 %** ;
- partitions avec reprises et triolets : **99,7 %** des hauteurs ;
- signes d’expression (partitions scannées) : accents 99 %, staccatos 87 %, tenutos 90 %, nuances 87 % (mot exact dans 100 % des cas), soufflets 89 %, liaisons 84 %, changements d’armure 15 sur 15.

Sur l’étude n° 1 de Théo Charlier (*De l’articulation*), Stephony retrouve le titre, le tempo, le 6/8, les changements d’armure, les 17 nuances et les indications écrites.

En cas d’erreur, quelques touches dans l’éditeur suffisent. Le bouton « Ajouter » place une note ou un signe oublié.

## Structure

```
index.html              interface
css/app.css             thème (couleurs du logo)
js/app.js               logique de l’app, éditeur, bibliothèque (IndexedDB)
js/omr.js               moteur de reconnaissance de partition (OMR)
js/omr-worker.js        exécution de l’OMR en arrière-plan
js/symbols-model.js     modèle de reconnaissance des symboles (clés, altérations, silences…)
js/synth.js             synthétiseur Web Audio, lecteur, sortie Web MIDI
js/midi.js              export de fichier MIDI (vélocités, carte de tempo)
js/expr.js              interprétation : nuances, articulations, textes de tempo et d'expression
js/ocr.js               lecture du texte de la partition (titre, tempo, indications)
vendor/tesseract/       moteur de lecture de texte Tesseract.js et données de langue française (local, hors-ligne)
sw.js                   service worker (hors-ligne)
manifest.webmanifest    installation PWA
tools/                  outils de développement (évaluation, entraînement du modèle) : facultatifs
```

## Nouveautés de la version 1.2

- Lecture des **nuances, articulations, soufflets, liaisons, points d’orgue et respirations**, rendus en MIDI expressif.
- **Changements d’armure** en cours de morceau et mesures composées (6/8…).
- **Lecture du texte** de la partition, sans connexion : titre, tempo, *rit.*, *a tempo*, *cresc.*…
- **Renommer** une partition et **ajouter** un élément oublié en touchant la photo.
- L’app pèse environ 10 Mo (dont 8 Mo pour la lecture du texte), mis en cache à l’installation.

## Licences

Tesseract.js et tesseract.js-core sont distribués sous licence Apache 2.0 (voir `vendor/tesseract/`).
