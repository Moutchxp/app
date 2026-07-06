---
name: svav-commit
description: Rédige un message de commit conforme aux conventions Sans Vis-à-Vis (Conventional Commits + règles Chris Beams) avec scan anti-données-sensibles et vérification des garde-fous SVAV (golden, atomicité, fichiers Gemini hors staging). À utiliser quand Arno veut committer, écrire un message de commit, ou préparer un staging. Ne PAS utiliser pour brancher, merger ou rebaser.
---

Les mots-clés MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY et OPTIONAL sont à interpréter selon la [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) et la [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

## Contraintes critiques

- Le sujet MUST faire ≤ 50 caractères. MUST NOT dépasser 72 sous aucun prétexte.
- Le sujet MUST être à l'impératif — complète « Si appliqué, ce commit va ___ ».
- Le sujet MUST NOT finir par un point. Première lettre après `type(scope): ` en majuscule.
- Le corps MUST être en français, retour à la ligne à 72 caractères.
- Chaque commit MUST contenir exactement UNE modification logique.
- Le message (sujet, corps, pieds) MUST NOT contenir de donnée sensible.

## Garde-fous SVAV (spécifiques — vérifier AVANT de committer)

- MUST NOT stager `app/lib/svv/adaptateurIaPhoto.ts` ni `app/api/analyse-photo/route.ts` (fichiers
  Gemini hors staging), sauf demande explicite d'Arno.
- SI le diff touche le score /100 (fichiers moteur : `coucheDegagement.ts`, `scoreDegagement.ts`,
  `scoreTotal.ts`, `profilConfig.ts`, `profilDegagement.ts`, `faisceaux.ts`, `config.ts`, ou
  `config_scoring`), THEN MUST rappeler à Arno que le golden `29.107259068449615` doit être re-vérifié
  et signaler si le rescellage devrait être un commit séparé.
- SI plusieurs modifications logiques sont staged, THEN MUST proposer de les séparer en commits
  distincts (un chantier = un commit) — ne pas committer un lot mélangé.
- MUST NOT committer soi-même sans qu'Arno le demande : ce skill PRÉPARE le message ; Arno stage et
  commit à la main dans VS Code. Livrer le message dans un bloc 🟢 COMMIT copiable.

## Données sensibles dans le message

Le message MUST NE JAMAIS contenir : identifiants (clés API, tokens, mots de passe, clés privées) ;
données personnelles (emails, téléphones, noms de particuliers, coordonnées GPS d'un domicile réel) ;
identifiants réseau (adresses IP, hostnames internes) ; chemins absolus contenant un nom d'utilisateur.
Décrire par catégorie : « Met à jour la chaîne de connexion », pas la valeur.

## Scan des données sensibles dans les fichiers staged

Avant de proposer le message, MUST scanner la sortie de `git diff --cached` :

| Motif | Indice regex |
|-------|--------------|
| Email | `[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}` |
| Adresse IPv4 | `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` (hors `0.0.0.0`, `127.0.0.1`) |
| Coordonnées GPS d'un domicile réel | paires lat/lon en clair hors fixtures de test |
| Secret générique | `(?i)(secret\|password\|token\|api_key\|apikey)\s*[:=]\s*\S+` |
| Clé privée | `-----BEGIN (RSA\|EC\|OPENSSH) PRIVATE KEY-----` |
| Chaîne haute entropie (≥32) | `[A-Za-z0-9+/=]{32,}` ou `[0-9a-f]{32,}` en contexte d'affectation |

Procédure quand une donnée sensible est détectée dans les fichiers :

1. MUST lister chaque occurrence : fichier, ligne, catégorie, aperçu masqué.
2. MUST demander à Arno : « Donnée sensible détectée dans les fichiers staged. Committer quand même ? »
3. Si Arno confirme → OK (peut être intentionnel : fixture, exemple de doc). Si Arno refuse → conseiller
   `.gitignore` / variable d'env / secrets manager.
4. MUST NOT laisser committer en silence — un accord explicite est REQUIRED.

Exceptions à NE PAS signaler : fichiers `*test*`, `*mock*`, `*fixture*`, `*example*` avec fausses
données évidentes ; `.env.example` ; docs montrant des exemples masqués ; le golden Asnières et ses
coordonnées dans `pipeline.itest.ts` (fixture de test scellée, valeur attendue et connue).

## Format

```
<type>(<scope>): <sujet>

[corps]

[pied(s)]
```

## Types

`feat` (fonctionnalité), `fix` (bug), `docs` (doc seule), `style` (format, pas de logique),
`refactor` (restructuration), `perf` (perf), `test` (tests), `build` (deps/packaging),
`chore` (maintenance/outillage), `revert`.

Scope SVAV courants : `moteur`, `config`, `ui`, `data`, `carte`, `skills`, `docs`, `interface`.

## Procédure

1. MUST lancer `git diff --cached` pour revoir les changements staged.
2. MUST scanner le diff pour données sensibles ; si détecté, avertir et obtenir l'accord d'Arno.
3. MUST vérifier l'atomicité — si plusieurs changements non liés, proposer de séparer.
4. MUST vérifier les garde-fous SVAV (Gemini hors staging ; golden si score touché).
5. MUST choisir le type et le scope.
6. MUST rédiger le sujet à l'impératif, ≤ 50 car, sans point final, majuscule après le préfixe.
7. SHOULD rédiger un corps si non trivial : quoi et pourquoi (pas comment).
8. MUST livrer le message dans un bloc 🟢 COMMIT copiable, prêt pour la boîte VS Code.
9. Rappeler à Arno de stager les bons fichiers uniquement, puis de committer lui-même.

## Exemples

Correction simple :

```
fix(ui): Corrige le glissement horizontal du bloc score
```

Avec corps :

```
docs(interface): Ajoute le plan d'architecture de l'interface interne

Document de conception des 5 modules, ancré dans le code réel et durci
par une revue adversariale. Conception pure, golden inchangé.
```

## Anti-patterns

| Mauvais | Raison |
|---------|--------|
| `bug corrigé` | Pas de type, passé, vague |
| `feat: mise à jour de la page.` | Passé, point final |
| `WIP` | Ne pas committer du travail en cours |
| `divers` | Vide de sens, pas atomique |
| Sujet > 72 car | Tronqué |
| Changements non liés mélangés | Casse bisect/revert |
| Message contenant un email ou une IP | Fuite de donnée dans l'historique |
