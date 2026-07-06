---
name: passation
description: Rédige un texte de passation complet pour transférer le contexte de la session courante vers une nouvelle conversation. À utiliser quand l'utilisateur tape /passation, veut clôturer une conversation devenue trop longue, ou doit repartir dans un chat neuf sans perdre le contexte du projet Sans Vis-à-Vis.
---

# Passation entre conversations

Quand ce skill est invoqué, rédige un DOCUMENT DE PASSATION complet, destiné à être copié-collé
tel quel au début d'une nouvelle conversation avec Claude (interface web/desktop). Le but : que le
nouveau Claude comprenne instantanément le projet, les rôles, l'objectif et tout l'historique, sans
que l'utilisateur ait à réexpliquer.

## Ton unique livrable
Écris la passation complète (toutes les sections ci-dessous) dans le fichier PASSATION.md à la
racine du repo, en ÉCRASANT son contenu précédent (overwrite, jamais d'ajout à la suite). La toute
première ligne du fichier doit être un horodatage obtenu via la commande système `date`, au format :
« > Passation générée le JJ/MM/AAAA à HHhMM ». Le reste de la passation suit en dessous.
Puis, dans ta réponse de chat, affiche UNIQUEMENT cette phrase et rien d'autre :
« Passation écrite dans PASSATION.md — ouvre le fichier dans l'éditeur (double-clic dans l'explorateur),
Cmd+A puis Cmd+C pour tout copier, puis colle-le au début de ta nouvelle conversation. »
NE recopie JAMAIS le contenu de la passation dans ta réponse de chat.

## Avant de rédiger — collecte le contexte réel
Inspecte la session courante pour remplir la passation avec des faits, pas des généralités :
- `git log --oneline -25` pour l'historique récent des commits.
- `git status` pour l'état du working tree (fichiers modifiés non committés).
- La conversation en cours (ce sur quoi on travaille, les décisions prises, le dernier chantier).
- Les fichiers docs/ pertinents s'ils existent (SPEC_ponderation_familles.md, etc.).
Ne recopie pas de code sensible inutilement ; résume.

## Structure OBLIGATOIRE de la passation

### 1. Rôles & workflow
Rappelle : Arno = fondateur non-développeur de Sans Vis-à-Vis (sansvisavis.com), plateforme de
certification immobilière (vue dégagée, Paris + petite couronne). Claude = architecte/relecteur.
Communication en français, tutoiement, direct. Workflow relais : Claude donne des cartouches
d'instructions (FR) → Arno les colle à l'agent Claude Code dans VS Code → l'agent produit des DIFFS
→ Arno commit et push à la main. Repo : github.com/Moutchxp/app. Stack : Next.js 16, React 19,
TypeScript, Tailwind v4, PostgreSQL 17 + PostGIS.

### 2. Règles de collaboration (impératives)
- Un chantier / un prompt à la fois ; après chaque diff on vérifie puis on commit.
- Recon LECTURE SEULE avant tout write sur fichiers sensibles.
- Une seule modif logique = un commit.
- TOUJOURS des blocs copiables, clairement labellisés (voir format ci-dessous).
- Ne jamais conseiller de faire une pause ou d'arrêter ; Arno décide seul.
- Proposer plusieurs options AVANT d'implémenter sur un choix de design/ressenti.
- Les 2 fichiers Gemini (adaptateurIaPhoto.ts, analyse-photo/route.ts) restent hors staging.

### 3. Objectif à atteindre
Décris l'objectif GLOBAL du projet ET l'objectif du chantier EN COURS au moment de la passation.

### 4. Invariants verrouillés (garde-fous permanents)
Liste les constantes inviolables, notamment :
- Golden Asnières = 29.107259068449615 (scellé, hand-verified, BITIDENT=true). Tout ce qui touche
  le score /100 change le golden → recalcul + validation main + rescellage en commit SÉPARÉ.
- Verdict binaire = 100% géométrique (1er obstacle ≥40m sur l'axe), jamais couplé au score ni à la photo.
- Hauteur de vision : (étage × 2.90m) + 1.65m. Certificat : SAVV-AAAA-NNNNNN.
- Tolérance 15m verrouillée. ST_Force2D jamais retiré des opérations distance/raster.
- prefers-reduced-motion respecté pour toute animation.
- EXIGENCE ARCHITECTURE — PILOTAGE SANS CODE : toute variable de tout moteur de calcul de score
  (Couche 1 dégagement, Couche 2 photo, barème familles, cumul, couloir, orientation, bornes
  années, etc.) DOIT être externalisée et éditable au runtime, jamais codée en dur. L'objectif
  final est une INTERFACE D'ADMINISTRATION native, pensée pour être utilisée par une personne qui
  NE SAIT PAS CODER (Arno lui-même), lui permettant de faire varier à sa guise l'intégralité des
  variables des moteurs sans jamais toucher au code ni à la base de données à la main.
  Conséquences à respecter dans CHAQUE nouveau chantier :
  * Aucune constante de score en dur dans le code (tout va en table de config lue au runtime).
    Les seules exceptions déjà actées sont les libellés d'affichage (SCORE_LABEL 75/60), à ne pas
    étendre sans raison.
  * Toute nouvelle variable de moteur ajoutée doit être créée en table de config dès sa naissance,
    avec un type, une valeur par défaut, et une plage/validation exploitable par une future
    interface (ex. min/max, liste fermée pour les enums comme mode_combinaison).
  * La distinction est à maintenir : variables VIVES (éditables et agissant sur le score) vs
    variables VESTIGIALES (à masquer/griser en lecture seule dans l'interface) vs variables de
    GARDE (comme mode_combinaison : éditable mais contrainte à une liste fermée, car une valeur
    invalide casse tout le profil). Documenter le statut de chaque variable.
  * Toute décision technique (schéma de table, nommage, structure du loader) doit anticiper cette
    interface d'admin future : privilégier ce qui sera lisible et éditable par un non-développeur.
(Complète avec les invariants réellement en vigueur trouvés dans docs/ et la conversation.)

### 5. Résumé de l'historique
Un récapitulatif structuré de TOUT ce qui a été fait : chantiers terminés (moteur de scoring, barème
familles, couches de données patrimoine, UI, perf, etc.), état des données, specs committées.
Sois complet mais synthétique — c'est la mémoire du projet.

### 6. État courant & prochaine action
- État du working tree (git status résumé).
- Le dernier chantier en cours et où il en est.
- LA prochaine action immédiate, sans ambiguïté.

### 7. Format des livrables (à rappeler au nouveau Claude)
Explique-lui qu'il DOIT, pour chaque instruction technique, produire un bloc copiable précédé d'un
titre sans équivoque avec une pastille emoji de repère visuel :

- 🔵 PROMPT — prompt de travail en relais manuel (« vibe coding ») : l'agent Claude Code produit un DIFF, l'utilisateur vérifie puis commit à la main. TOUJOURS préciser DANS QUEL TERMINAL l'envoyer.
- 🔴 PROMPT AUTO — prompt qui DÉCLENCHE L'AUTOMATISATION (lancement de /svav-build ou de tout run autonome multi-subagents). La pastille rouge signale un run en autonomie : vigilance accrue, contrôle a posteriori via le rapport final (Phase 7), commit toujours manuel par l'utilisateur.
- 🟢 COMMIT — message de commit à coller dans la boîte de commit de VS Code (Source Control).

Règle : tout prompt lançant un run autonome (/svav-build, etc.) DOIT porter la pastille 🔴 PROMPT AUTO, jamais 🔵. Ne JAMAIS mélanger un prompt et un commit dans le même bloc.

## Ton final
Après le bloc de passation, une seule phrase : rappeler à Arno de coller ce bloc au début de sa
nouvelle conversation. Rien de plus.
