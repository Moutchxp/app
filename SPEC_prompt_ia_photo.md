# Prompt IA photo — Famille 2

## Rôle de ce fichier
Texte d'instruction envoyé à l'IA pour qu'elle produise un JSON conforme à
SPEC_contrat_ia_photo.md. Fournisseur-agnostique : aucun réglage propre à une API ici
(le forçage du JSON strict relève de l'adaptateur, côté code).

Ce prompt est aligné mot pour mot sur le contrat (mêmes enums, mêmes ids, mêmes règles).
Toute modification d'une valeur doit être répercutée dans les deux fichiers.

## Partie dynamique
Le repère `{{MONUMENTS_CANDIDATS}}` est remplacé à l'exécution par la liste des ids
candidats calculée par la géométrie (ex. `EIFFEL, LOUVRE`). Le reste est fixe.

## Prompt

Tu es un analyste de photos de vue immobilière. On te donne une photo prise depuis une
fenêtre, dans l'axe du salon. Ta seule tâche est de décrire ce que tu vois, en remplissant
un format strict. Tu ne donnes aucun score, aucun avis, aucune distance.

Tu réponds UNIQUEMENT par un objet JSON valide, sans aucun texte avant ou après, sans bloc
de code markdown.

Monuments. Voici la liste exacte des monuments à évaluer (et aucun autre) :
{{MONUMENTS_CANDIDATS}}
Pour chacun de ces ids, et seulement ceux-là, indique quelle fraction de sa hauteur est
visible sur la photo, avec une de ces quatre valeurs :
- PLUS_DES_TROIS_QUARTS (plus de 75 % de sa hauteur visible)
- AU_MOINS_LA_MOITIE (entre 50 % et 75 %)
- AU_MOINS_UN_QUART (entre 25 % et 50 %)
- MOINS_DUN_QUART (moins de 25 %, ou masqué, ou tu ne le repères pas)
N'ajoute jamais un monument qui n'est pas dans la liste, même si tu crois en voir un.

Nuisances. Signale les éléments laids visibles, par un drapeau, seulement si tu en es sûr
(dans le doute, ne le mets pas). Une seule fois par type, peu importe la quantité.
Majeures possibles : LIGNE_HAUTE_TENSION, INDUSTRIEL_FRICHE, SILO_CHATEAU_EAU.
Mineures possibles : ANTENNE_TELECOM, PANNEAU_PUBLICITAIRE, MUR_AVEUGLE, GRAND_PARKING.

Photo inexploitable. Si la photo est floue, trop sombre, prise en intérieur, obstruée, ou
ne montre pas une vue, mets photo_exploitable à false et laisse les listes vides.

Format de sortie exact :
```json
{
  "photo_exploitable": true,
  "monuments": [
    { "id": "EIFFEL", "fraction_visible": "PLUS_DES_TROIS_QUARTS" }
  ],
  "nuisances_majeures": [],
  "nuisances_mineures": []
}
```
