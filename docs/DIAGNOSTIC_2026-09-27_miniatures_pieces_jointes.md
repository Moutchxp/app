# Diagnostic — les aperçus des pièces jointes (27/09/2026)

État relevé **avant** le lot MINIATURES-COMPLÈTES, sur la base locale. Tous les chiffres viennent de requêtes de
lecture seule sur `gestion_piece`, `gestion_piece_vidage` et `gestion_piece_drive`.

## 1. Le constat

**26 852 pièces jointes en base. 32 avaient un aperçu.** Aucune n'avait jamais échoué.

| Type  | Total  | Avec aperçu | Échec inscrit | Jamais tentée, contenu dans MinIO | Vidée vers le Drive | Jamais stockée |
|-------|-------:|------------:|--------------:|----------------------------------:|--------------------:|---------------:|
| image | 14 783 |          10 |             0 |                            12 650 |               2 073 |             50 |
| PDF   | 11 323 |          22 |             0 |                             9 373 |               1 927 |              1 |
| autre |    614 |           0 |             0 |                               285 |                  45 |            284 |
| Excel |     71 |           0 |             0 |                                 0 |                   0 |             71 |
| Word  |     61 |           0 |             0 |                                33 |                  13 |             15 |

Les 4 000 pièces « vidées vers le Drive » ont **toutes** une copie Drive vérifiée (`verifie_le` renseigné) : leur
contenu est lisible, il n'est simplement plus dans MinIO.

## 2. Les causes, par ordre d'importance

### ① Fabrication PARESSEUSE (26 023 pièces) — la cause de masse

La vignette n'était fabriquée qu'au **premier affichage** de la pièce (route `/pieces/[id]/miniature`). Une pièce
que personne n'a regardée n'en a donc jamais eu. Avec 26 852 pièces et une équipe qui n'ouvre que ce dont elle a
besoin, c'est l'écrasante majorité du stock.

### ② Le contenu était parti AVANT le premier affichage (4 060 pièces) — la cause des cas signalés

Le **vidage automatique du 27/09/2026** a effacé de MinIO 4 060 pièces dont la copie Drive avait été vérifiée la
veille (lot DRIVE-3). Pour celles-là, la fabrication paresseuse **ne peut plus rien** : elle arrive après le départ
des octets.

> 🔴 **Le piège technique, à retenir.** Le vidage **ne vide pas** `gestion_piece.cle_stockage` — la colonne garde sa
> valeur pour que la preuve d'effacement reste lisible. Lire « clé présente donc contenu présent » est donc **faux**
> pour ces 4 060 pièces. C'est exactement ce que faisait la route : elle appelait MinIO, recevait
> `The specified key does not exist`, rendait un **503**, et l'écran retombait sur le carré gris du type. Et comme
> rien n'était mémorisé, la tentative repartait **à chaque affichage**, indéfiniment.

### ③ Jamais stockée (421 pièces)

Pas de `cle_stockage` du tout : type refusé par la liste blanche, pièce trop lourde, ou stockage indisponible au
moment de la relève. Le motif est dans `motif_non_stocke`. Il n'y a aucun octet à lire nulle part.

### ④ Type sans aperçu possible (614 « autre » + 71 Excel + 61 Word)

XML, ZIP, calendriers… et la bureautique. **Aucun convertisseur n'est installé sur ce Mac** (ni `soffice`, ni
`libreoffice`, ni `unoconv`, ni `/Applications/LibreOffice.app`) : Word et Excel gardent donc leur icône, et la
commande le dit au démarrage plutôt que de le supposer. `textutil`, présent sur macOS, ne rend que du texte ou du
HTML — jamais l'image d'une page.

### ⑤ Échec de génération : **zéro**

Aucune pièce n'a jamais été inscrite en `miniature_etat = 'echec'`. Le décodeur n'est pas en cause.

## 3. Les pièces signalées par Arno — cause exacte

Les quatre PDF sans aperçu sont sur le message **668** du fil 354 (reçu le 19/09), et non sur le 56765 :

| Pièce | Fichier                                   | Cause exacte |
|------:|-------------------------------------------|--------------|
|   351 | `Relevé de dépenses Année 2025.pdf`       | **Vidée de MinIO le 27/09/2026 à 02 h 23** (`vidage automatique`), copie Drive vérifiée le 26/09 |
|   352 | `Appel_Fonds_Q1_151864707_151865852.pdf`  | idem |
|   353 | `Appel_Fonds_Q2_151983343_151984487.pdf`  | idem |
|   354 | `Appel_Fonds_Q3_152120770_152123176.pdf`  | idem |
|   350 | `image001.jpg` (823 o, signature)         | idem |

Vérifié en lecture directe : MinIO répond `The specified key does not exist.` sur les cinq clés, et les cinq
fichiers sont lisibles dans le Drive sous « Base de données locative ». C'est donc la **cause ②**, pas un défaut du
décodeur ni un type non pris en charge.

À titre de comparaison, les trois pièces du message **56765** (non vidées) se lisent et se rasterisent sans
difficulté : 32 à 98 ms chacune.

## 4. Ce que le lot change

1. **À l'arrivée** (`deposerPiecesMessage`) : la vignette est fabriquée **immédiatement**, depuis les octets déjà en
   mémoire — aucune lecture supplémentaire, et plus jamais un vidage qui devance l'aperçu.
2. **Rétroactivement** (`npm run gestion:miniatures:completer`) : MinIO si le contenu y est, **sinon la copie Drive
   vérifiée**, en lecture seule et sous le garde-fou de racine. Seule la vignette est déposée ; aucun contenu complet
   n'est réécrit dans MinIO.
3. **Aucune migration** : les quatre colonnes (`miniature_cle`, `miniature_etat`, `miniature_motif`, `miniature_le`)
   existent depuis la migration 244, et la sonde `miniaturesDisponibles()` les protège déjà. Distinguer un échec
   *définitif* d'un échec *transitoire* est une décision de code, pas une colonne de plus.

## 5. La première passe réelle — Réception, 90 derniers jours (27/09/2026)

```
npm run gestion:miniatures:completer -- --reception --jours=90 --appliquer
```

| | |
|---|---:|
| Pièces examinées | **1 568** (1 560 + 8 à la seconde passe) |
| **Aperçus fabriqués** | **1 497** — 99 depuis MinIO, **1 398 depuis la copie Drive** |
| Sans aperçu possible (inscrit) | 58 |
| À reprendre plus tard | 0 |
| Sans contenu nulle part | 6 |
| Durée | **347 s** (≈ 0,22 s par pièce, 6 de front) |

Motifs des 64 pièces sans aperçu :

- **57 × « type sans miniature »** — `.docx`, `.ics`, `.liciweb`, pièces sans nom. Inscrit : la route cesse de
  redemander le fichier pour reconclure la même chose.
- **6 × « aucun contenu stocké »** — cinq `.HEIC` refusés à la relève (`type non autorisé pour la gestion :
  « image/heif »`) et une `Convocation AG 2026.pdf`. **Rien n'est inscrit** : les octets peuvent revenir, et une
  inscription interdirait de reprendre la pièce.
- **1 × en-tête HEIC abîmé** — `IMG20260901120024.heic` : `iloc box contains 50 items, which exceeds the security
  limit of 16 items`. La première passe l'a classé « à reprendre » ; le motif a été **ajouté aux cas définitifs**
  (`corrupt header`) et la seconde passe l'a inscrit. Sans cela, cette pièce aurait été relue depuis le Drive à
  chaque passe, pour toujours, sans jamais aboutir.

> ⚠️ **98 % des aperçus viennent du Drive**, pas de MinIO — ce qui mesure l'ampleur de la cause ② : sur ce périmètre,
> presque tout le contenu avait déjà été vidé vers le Drive avant qu'un aperçu ait pu être fabriqué.

### Le reste du stock

```
npm run gestion:miniatures:completer -- --appliquer
```

Environ **25 000 pièces** restaient à traiter après cette passe. Au rythme mesuré (0,22 s/pièce), compter **1 h 30 à
2 h**. La commande est reprenable : une coupure ne perd que le lot en cours. `--plafond=N` permet de la borner.
