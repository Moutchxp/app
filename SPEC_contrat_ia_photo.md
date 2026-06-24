# Contrat IA photo — Famille 2

## Principe
Ce contrat décrit UNIQUEMENT ce que l'IA doit renvoyer après analyse d'une photo. Il est
INDÉPENDANT du fournisseur d'IA : n'importe quel modèle capable de lire une image et de
répondre en JSON peut le remplir. Le choix du modèle vit dans le code (l'« adaptateur »),
jamais ici. `scorePaysage.ts` consomme ce JSON sans savoir quelle IA l'a produit.

Rappel d'architecture : géo = présence + distance + azimut ; IA = occlusion + esthétique.
L'IA ne calcule aucune distance ni azimut. Elle ne renvoie jamais de score, seulement des
enums et des drapeaux.

## Entrée fournie à l'IA
- Une photo unique, prise dans l'axe principal (couvre le cône central ±60°).
- La liste des monuments candidats, calculée par la géométrie : uniquement ceux dont
  l'azimut tombe dans le cône ±60°. Chaque candidat est passé par son `Id` (voir table
  Strate 2 de SPEC_score_qualite_vue.md, ex. `EIFFEL`, `LOUVRE`).
- L'IA ne juge QUE ces ids. Elle ne cherche aucun autre monument, même si elle croit en voir un.

## Sortie attendue — un seul objet JSON, rien d'autre

```json
{
  "photo_exploitable": true,
  "monuments": [
    { "id": "EIFFEL", "fraction_visible": "PLUS_DES_TROIS_QUARTS" },
    { "id": "LOUVRE", "fraction_visible": "MOINS_DUN_QUART" }
  ],
  "nuisances_majeures": ["LIGNE_HAUTE_TENSION"],
  "nuisances_mineures": ["PANNEAU_PUBLICITAIRE", "GRAND_PARKING"]
}
```

### photo_exploitable (booléen, obligatoire)
`false` si la photo est inutilisable : floue, trop sombre, prise en intérieur, objectif
obstrué, ne montre pas une vue. Si `false`, le code ignore le reste et passe en score
partiel (label inchangé). Les autres champs peuvent alors être vides.

### monuments (liste)
Une entrée par monument candidat fourni en entrée — ni plus, ni moins.
- `id` : repris à l'identique de l'entrée.
- `fraction_visible` : fraction de la HAUTEUR visible du monument, un palier parmi exactement
  quatre valeurs :
  - `PLUS_DES_TROIS_QUARTS`  → critère A = 5
  - `AU_MOINS_LA_MOITIE`     → 4
  - `AU_MOINS_UN_QUART`      → 2
  - `MOINS_DUN_QUART`        → 0 (inclut « pas visible / masqué par un immeuble »)
- Règle du doute : si un candidat est fourni mais que l'IA ne le repère pas, elle renvoie
  `MOINS_DUN_QUART`, jamais une absence.

### nuisances_majeures (liste de drapeaux, valeurs autorisées)
- `LIGNE_HAUTE_TENSION`
- `INDUSTRIEL_FRICHE`
- `SILO_CHATEAU_EAU`

### nuisances_mineures (liste de drapeaux, valeurs autorisées)
- `ANTENNE_TELECOM`
- `PANNEAU_PUBLICITAIRE`
- `MUR_AVEUGLE`
- `GRAND_PARKING`

Drapeau présent une seule fois s'il y en a (booléen, pas de comptage ; malus −3/majeure,
−1/mineure, plafond −6). Biais prudent : un drapeau seulement si l'IA est sûre ; dans le
doute, on l'omet.

## Hors périmètre de l'IA
Le carrefour ≥ 4 voies et le cimetière sont GÉOMÉTRIQUES (BD TOPO). L'IA ne les renvoie jamais.

## Robustesse (à appliquer dans scorePaysage.ts)
- JSON malformé, valeur d'enum inconnue, ou id renvoyé hors liste des candidats → traité
  comme photo inexploitable (score partiel). Le code n'invente rien.
- Tout id candidat absent de la réponse → traité comme `MOINS_DUN_QUART`.

## Ce que ce contrat ne contient PAS
Aucun barème de distance (critère B), aucune courbe, aucun score : ils restent dans
SPEC_score_qualite_vue.md. Une seule source de vérité par sujet.
