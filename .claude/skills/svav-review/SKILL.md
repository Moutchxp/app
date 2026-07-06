---
name: svav-review
description: Lance une revue adversariale (red-team) d'un plan, d'une conception, d'un diff ou d'un document, en utilisant des subagents en lecture seule pour vérifier les faits contre le code réel et attaquer les hypothèses. À utiliser quand Arno tape /svav-review, veut faire challenger un plan ou une décision avant implémentation, ou demande une revue critique. Ne PAS déclencher automatiquement sur une tâche de code ordinaire ; uniquement sur invocation explicite ou demande claire de revue.
---

Les mots-clés MUST, MUST NOT, SHOULD, SHOULD NOT, MAY sont à interpréter selon la RFC 2119.

## Objectif

Trouver les failles d'un artefact (plan, conception, diff, spec) AVANT qu'il coûte cher. La revue est
adversariale : elle cherche activement à réfuter les affirmations, pas à les confirmer. Elle est
LECTURE SEULE : aucun fichier n'est modifié pendant la revue.

## Quand l'utiliser

- Avant d'implémenter un plan ou une conception d'ampleur (nouveau module, migration, refonte).
- Avant de sceller un document de référence (spec, plan, invariants).
- Sur demande explicite d'Arno (« challenge ça », « revue critique », /svav-review).

Ne PAS l'utiliser pour une correction triviale ou un diff de quelques lignes : la lourdeur ne se
justifie pas.

## Procédure

### 1. Cadrer la cible
Identifier précisément l'artefact à revoir (fichier, section, diff) et les affirmations porteuses
qu'il contient. Une affirmation porteuse est une phrase dont dépend la suite (« la migration préserve
le golden », « cette variable n'agit plus sur le score », « ce champ est anonyme »).

### 2. Lancer deux subagents adversariaux EN LECTURE SEULE
Utiliser l'outil Task pour spawner deux subagents parallèles, chacun avec une consigne distincte.
Les subagents NE MODIFIENT AUCUN fichier ; ils lisent le code et rapportent.

**Subagent A — Vérificateur de faits.** Consigne : « Pour chaque affirmation porteuse de l'artefact,
vérifie-la contre le code réel (grep, lecture de fichier). Ne fais confiance à AUCUNE affirmation sans
preuve fichier:ligne. Classe chaque affirmation : CONFIRMÉE (avec preuve) / RÉFUTÉE (avec preuve
contraire) / NON VÉRIFIABLE. Sois impitoyable : une affirmation plausible mais non prouvée est NON
VÉRIFIABLE, pas CONFIRMÉE. »

**Subagent B — Attaquant de la conception.** Consigne : « Attaque la conception, sans faire confiance
à l'auteur. Cherche : les hypothèses cachées, les cas limites non traités, les risques de sécurité,
les risques RGPD/données personnelles, les dépendances non explicitées, les endroits où la solution
casse en production, les oracles de test faibles (un test qui ne prouve pas ce qu'il prétend). Pour
chaque objection, indique sa gravité : BLOQUANTE / MAJEURE / MINEURE, et la preuve ou le raisonnement. »

### 3. Intégrer les verdicts
Rassembler les deux rapports. Pour SVAV, porter une attention particulière à :
- Toute affirmation touchant le golden 29.107259068449615 (un « le golden ne bouge pas » DOIT être
  prouvé, jamais supposé ; rappeler qu'Asnières est un oracle faible pour le chemin patrimoine).
- Toute affirmation sur le découplage verdict/score (le verdict MUST rester géométrique).
- Toute donnée qualifiée d'« anonyme » (souvent pseudonyme au sens RGPD → à requalifier).
- Toute variable dite « morte »/« sans effet » (à prouver par grep, cf. colonnes vestigiales).

### 4. Restituer
Présenter à Arno : la liste des affirmations CONFIRMÉES / RÉFUTÉES, les objections classées par
gravité, et pour chaque point réfuté ou bloquant, la correction recommandée. NE PAS corriger
l'artefact soi-même sans validation : la revue PROPOSE, Arno décide. Si Arno valide des corrections,
les appliquer ensuite dans un chantier séparé (la revue reste distincte de la correction).

## Garde-fous

- MUST rester en lecture seule pendant toute la revue (recon, pas de write).
- MUST fonder chaque verdict de fait sur une preuve fichier:ligne, jamais sur une intuition.
- MUST NOT édulcorer : une revue complaisante ne sert à rien. Le rôle est de trouver ce qui cloche.
- SHOULD signaler explicitement quand un artefact est solide (ne pas inventer des problèmes pour
  justifier la revue) — mais seulement après avoir vraiment cherché.
