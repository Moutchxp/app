---
name: svav-specs
description: Capture et formalise les exigences d'une fonctionnalité en notation EARS (exigences testables et non ambiguës) avant d'écrire du code. À utiliser quand Arno tape /svav-specs, veut cadrer précisément le résultat attendu d'un module ou d'une fonctionnalité, ou dit qu'il veut travailler sur les specs avant d'implémenter. Ne PAS déclencher automatiquement ; uniquement sur invocation explicite ou demande claire de cadrage.
---

Les mots-clés MUST, MUST NOT, SHOULD, SHOULD NOT, MAY sont à interpréter selon la RFC 2119.

## Objectif

Transformer un besoin flou (« je veux une carte de curation », « un banc de test ») en un jeu
d'exigences PRÉCISES, TESTABLES et NON AMBIGUËS, avant d'écrire la moindre ligne de code. Une bonne
spec évite les allers-retours d'implémentation : on sait exactement quel résultat on attend, et on
peut vérifier si le code le produit.

## Quand l'utiliser

- Avant de construire un module ou une fonctionnalité d'ampleur (les 5 modules de l'interface, une
  nouvelle mécanique de scoring, un parcours utilisateur).
- Quand Arno veut « travailler précisément sur le résultat à obtenir » avant l'implémentation.
- Pas pour une correction ponctuelle : une spec formelle serait disproportionnée.

## La notation EARS

Chaque exigence suit l'un de ces patrons (Easy Approach to Requirements Syntax). Le verbe central est
toujours « DOIT » (SHALL). Formuler en français, patron entre crochets :

- **Ubiquitaire** (toujours vrai) : « Le système DOIT <comportement>. »
  Ex : « Le système DOIT afficher le score sur 100. »
- **Événementiel** (déclenché par un événement) : « QUAND <événement>, le système DOIT <comportement>. »
  Ex : « QUAND l'internaute valide le point d'origine, le système DOIT calculer le verdict. »
- **Conditionnel d'état** (tant qu'un état dure) : « TANT QUE <état>, le système DOIT <comportement>. »
  Ex : « TANT QUE l'analyse photo est en cours, le système DOIT afficher la légende d'attente. »
- **Optionnel** (dépend d'une fonctionnalité présente) : « LÀ OÙ <fonctionnalité>, le système DOIT
  <comportement>. »
- **Indésirable / gestion d'erreur** : « SI <condition indésirable>, ALORS le système DOIT
  <réponse>. » Ex : « SI le point d'origine est hors de toute emprise bâtie, ALORS le système DOIT
  bloquer la validation et afficher INDÉTERMINÉ. »
- **Complexe** : combinaison, ex : « QUAND <événement>, SI <condition>, le système DOIT <comportement>. »

Règles : une seule exigence par phrase ; pas de « et/ou » qui cache deux exigences ; chaque exigence
DOIT être vérifiable (on peut écrire un test qui répond oui/non).

## Procédure

### 1. Recueillir le besoin
Reformuler le besoin d'Arno avec ses mots, puis poser les questions qui lèvent les ambiguïtés
(valeurs limites, cas d'erreur, comportement par défaut). Ne pas supposer en silence : si un point
est flou, demander.

### 2. Structurer en user stories (optionnel mais utile)
Pour chaque grande capacité : « En tant que <rôle>, je veux <but>, afin de <bénéfice>. »
Rôles SVAV typiques : internaute (parcours public), opérateur interne (Arno, interface d'admin).

### 3. Décomposer chaque story en exigences EARS
Sous chaque story, lister les exigences numérotées en notation EARS. Couvrir : le chemin nominal, les
cas limites, les cas d'erreur, les valeurs par défaut, les contraintes (performance, sécurité, RGPD).

### 4. Rattacher aux invariants SVAV
Vérifier que les exigences respectent les invariants (cf. CLAUDE.md / INVARIANTS_SVAV.md) : verdict
géométrique découplé du score, golden protégé, hauteur de vision paramétrable, pilotage sans code
(toute nouvelle variable de moteur externalisée en config), RGPD (consentement avant persistance de
données personnelles). Signaler tout conflit entre le besoin et un invariant.

### 5. Livrer
Écrire les specs dans un fichier docs/ dédié (ex. docs/SPEC_<module>.md), pour qu'elles soient
copiables et versionnées. Chaque exigence numérotée et testable. Terminer par une courte liste des
questions ouvertes restantes, s'il y en a. NE PAS enchaîner sur l'implémentation : la spec est le
livrable ; le code viendra dans un chantier séparé, une fois la spec validée par Arno.

## Garde-fous

- MUST formuler des exigences testables (rejeter les « le système doit être rapide/intuitif » non
  mesurables ; les remplacer par un critère vérifiable).
- MUST une seule exigence par phrase, sans ambiguïté.
- MUST rattacher les exigences aux invariants SVAV et signaler tout conflit.
- MUST NOT commencer à coder : ce skill produit une spec, pas une implémentation.
- SHOULD lister les questions ouvertes plutôt que de trancher à la place d'Arno sur un point métier.
