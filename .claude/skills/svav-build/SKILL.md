---
name: svav-build
description: Orchestre la construction autonome d'une fonctionnalité ou d'un module de bout en bout (planification, implémentation, tests, revue) via des subagents Claude Code, puis produit un rapport de doute et une recon de validation confrontant la livraison aux directives du projet. À utiliser quand Arno tape /svav-build, veut confier une implémentation d'ampleur en autonomie, ou dit « construis X en autonome ». Ne PAS déclencher automatiquement ; uniquement sur invocation explicite pour un chantier substantiel (pas une correction ponctuelle).
---

Les mots-clés MUST, MUST NOT, SHOULD, SHOULD NOT, MAY sont à interpréter selon la RFC 2119.

## Objectif

Construire une fonctionnalité ou un module de bout en bout **en autonomie**, puis en **garantir la
conformité** aux directives et invariants du projet Sans Vis-à-Vis avant livraison. L'autonomie de
construction est totale ; la certitude est apportée par (1) une batterie de tests de conformité SVAV
exécutés systématiquement, (2) un rapport de doute consignant les décisions incertaines identifiées
par l'agent, et (3) une recon de validation finale qui confronte la livraison aux obligations du
projet et prononce un verdict VALIDER / MODIFIER.

Ce skill est destiné aux chantiers substantiels (nouveau module, migration, mécanique complexe). Pour
une correction ponctuelle, ne pas l'employer : la lourdeur ne se justifie pas.

## Prérequis de lancement

Avant de démarrer, MUST disposer de :
- Une cible claire : quoi construire, et si possible une spec (idéalement produite par /svav-specs).
- L'accès au contexte du projet : CLAUDE.md et docs/INVARIANTS_SVAV.md doivent être lus en tout
  début de run (ils portent les directives et invariants à respecter).
Si la cible est trop floue pour être découpée, MUST demander à Arno de préciser (ou lancer /svav-specs
d'abord) plutôt que de deviner.

## Vue d'ensemble du pipeline

Le run enchaîne des phases, chacune confiée à un ou plusieurs subagents Claude Code (outil Task). Un
fichier d'état (voir references/state-manager-prompt.md) suit l'avancement pour permettre reprise et
traçabilité. Les subagents reçoivent leurs consignes des fichiers de references/.

```
0. INIT        Lire CLAUDE.md + INVARIANTS_SVAV.md ; établir l'état initial.
1. PLAN        planner : découper la cible en tâches ordonnées, testables, atomiques.
2. PLAN-AUDIT  plan-auditor : challenger le plan (cohérence, dépendances, angles morts).
3. BUILD       Pour chaque tâche : implementer (code) → tester (tests) → boucle jusqu'au vert.
4. REVIEW      code-reviewer : revue du code produit (bugs, sécurité, style, conformité).
5. AUDIT       test-auditor + comment-auditor : les tests prouvent-ils vraiment ? commentaires justes ?
6. CONFORMITÉ  Exécuter la batterie de tests de conformité SVAV (voir plus bas).
7. RAPPORT     Compiler le rapport de doute (décisions incertaines identifiées par les subagents).
8. RECON-VALID Recon lecture seule confrontant la livraison aux directives → verdict VALIDER/MODIFIER.
9. LIVRAISON   Remettre à Arno : le code, le rapport de doute, le verdict de recon. Arno décide du go.
```

L'agent avance de façon autonome à travers les phases 1 à 8. Il NE COMMITTE PAS lui-même : la
livraison est remise à Arno, qui valide et commit (cf. workflow SVAV, CLAUDE.md).

## Détail des phases

### Phase 0 — INIT
MUST lire CLAUDE.md et docs/INVARIANTS_SVAV.md et en extraire la liste des directives et invariants
applicables au chantier (golden, verdict découplé, hauteur de vision paramétrable, ST_Force2D,
tolérances, config externalisée, Gemini hors staging, RGPD si données personnelles). Cette liste sert
de référentiel de conformité pour les phases 6 et 8.

### Phase 1 — PLAN
Spawner un subagent avec references/planner-prompt.md. Livrable : une liste de tâches ordonnées par
dépendances, chacune atomique (une modif logique), testable, avec ses critères de succès explicites.

### Phase 2 — PLAN-AUDIT
Spawner un subagent avec references/plan-auditor-prompt.md pour challenger le plan avant de coder :
dépendances manquantes, tâches trop grosses, angles morts, conflits avec les invariants. Corriger le
plan si l'audit le justifie.

### Phase 3 — BUILD (boucle par tâche)
Pour chaque tâche du plan, dans l'ordre :
- Spawner implementer (references/implementer-prompt.md) : écrire le minimum de code qui résout la
  tâche, changements chirurgicaux, style existant respecté.
- Spawner tester (references/tester-prompt.md) : écrire/mettre à jour les tests couvrant la tâche.
- Exécuter les tests. Si rouge, boucler (implementer corrige) jusqu'au vert ou jusqu'à un blocage.
- Si blocage réel (impossible de faire passer sans violer une directive), MUST inscrire un DOUTE au
  rapport et passer à la validation plutôt que de forcer.

### Phase 4 — REVIEW
Spawner code-reviewer (references/code-reviewer-prompt.md) sur l'ensemble du code produit : bugs,
sécurité, style, et respect des directives SVAV. Les problèmes remontés sont corrigés (retour build)
ou versés au rapport de doute si la décision est discutable.

### Phase 5 — AUDIT
- test-auditor (references/test-auditor-prompt.md) : les tests prouvent-ils réellement le comportement
  attendu, ou sont-ils vides/complaisants ? Un test qui ne peut pas échouer est un faux test.
- comment-auditor + comment-fixer (references/comment-auditor-prompt.md, comment-fixer-prompt.md) :
  les commentaires décrivent-ils le vrai comportement ? Corriger les commentaires trompeurs.

### Phase 6 — TESTS DE CONFORMITÉ SVAV (garantie que l'automatisation respecte le projet)
En plus des tests fonctionnels, MUST exécuter/établir une batterie vérifiant que la livraison respecte
les directives du projet. Cette batterie est le filet de sécurité automatique — elle attrape une
violation même si aucun subagent ne l'a signalée comme doute. Elle DOIT couvrir, selon ce que le
chantier touche :
- GOLDEN : rejouer le test golden (pipeline.itest.ts). Le golden 29.107259068449615 DOIT être
  inchangé. S'il bouge, c'est un ÉVÉNEMENT MAJEUR → rapport de doute obligatoire + recon, jamais un
  rescellage silencieux.
- VERDICT DÉCOUPLÉ : vérifier qu'aucun chemin ne fait entrer le verdict binaire dans le score, ni la
  photo/IA dans le verdict.
- CONFIG EXTERNALISÉE : toute nouvelle variable de moteur DOIT être en config_scoring (pas en dur).
- ST_Force2D : présent sur les opérations distance/raster touchées.
- HAUTEUR DE VISION : si touchée, reste une formule paramétrable (sous-plafond variable), pas figée.
- RGPD : si des données personnelles sont manipulées, vérifier consentement avant persistance,
  chiffrement, droit d'effacement (cf. CLAUDE.md et le plan interface).
- GEMINI : adaptateurIaPhoto.ts et analyse-photo/route.ts non inclus dans la livraison sauf demande.
Consigner le résultat de chaque vérification (PASS / FAIL + preuve).

### Phase 7 — RAPPORT DE DOUTE
Compiler docs/RAPPORT_BUILD_<chantier>.md avec, pour chaque doute identifié par un subagent au cours
du run : la décision prise, les options envisagées, la raison du choix, l'impact potentiel sur les
directives/invariants, et une recommandation. Le rapport se déclenche sur les doutes que les subagents
identifient eux-mêmes. (Les violations de conformité, elles, sont attrapées en phase 6 même sans
doute déclaré.) Si aucun doute : le noter explicitement.

### Phase 8 — RECON DE VALIDATION
Spawner une recon LECTURE SEULE qui, à partir du rapport de doute (phase 7) et des résultats de
conformité (phase 6), confronte la livraison complète aux directives et invariants du projet
(référentiel de la phase 0). Elle produit un VERDICT :
- VALIDER : la livraison respecte toutes les directives ; aucun doute bloquant.
- MODIFIER : lister précisément ce qui doit changer et pourquoi (directive concernée, fichier:ligne),
  puis retourner en phase 3 sur les points concernés, OU remettre à Arno pour arbitrage si le point
  relève d'une décision métier.

### Phase 9 — LIVRAISON
Remettre à Arno, sans committer : (a) le résumé du code produit et des fichiers touchés, (b) le
rapport de doute (docs/RAPPORT_BUILD_<chantier>.md), (c) le résultat des tests de conformité, (d) le
verdict de recon. Arno relit, valide, et commit lui-même (format SVAV : un chantier = un commit).

## Garde-fous

- MUST lire CLAUDE.md + INVARIANTS_SVAV.md en phase 0 et s'y référer tout au long.
- MUST exécuter la batterie de conformité (phase 6) à chaque run, quelles que soient les zones
  touchées — c'est le filet automatique indépendant des doutes déclarés.
- MUST NOT committer ni pousser : la livraison passe par la validation d'Arno.
- MUST NOT resceller le golden ni le déclarer « inchangé » sans preuve du re-run ; tout mouvement du
  golden est un événement majeur porté au rapport.
- SHOULD préférer arrêter et rapporter plutôt que forcer une solution qui violerait une directive.
- L'autonomie porte sur la CONSTRUCTION ; la décision finale de livraison reste à Arno.

## Fichiers de référence

Les consignes détaillées des subagents sont dans references/ :
planner-prompt, plan-auditor-prompt, implementer-prompt, tester-prompt, code-reviewer-prompt,
test-auditor-prompt, comment-auditor-prompt, comment-fixer-prompt, state-manager-prompt.
