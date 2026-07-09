# Rapport de build — M3-4 Lot F1 : action de journal `changement_identite` + libellé règle administrateur

> Run `/svav-build` autonome. **Lot F scindé en DEUX commits (décision Arno).** Ce rapport couvre **F1 uniquement,
> LIVRÉ ici**. F2 (édition prénom/nom) sera construit APRÈS qu'Arno a appliqué la migration 017. **Aucun commit.**

## 0. Contexte — pourquoi le run s'est d'abord ARRÊTÉ

Journaliser une future édition prénom/nom (F2) exige une action autorisée par le CHECK de
`admin_utilisateur_log` ; or les 7 actions de 016 (`creation`, `desactivation`, `reactivation`, `changement_role`,
`changement_permissions`, `reinitialisation_mot_de_passe`, `changement_mot_de_passe`) n'en couvrent **aucune** pour
« modification d'identité », et ce lot interdisait toute migration. J'ai donc **arrêté et remonté la question**
(comme au Lot A). **Décision Arno** : Option A — migration 017 ajoutant `changement_identite`, et **découpe en
F1 (migration + libellé) puis F2 (édition)**, F1 livré seul.

## 1. Synthèse F1

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc` / `eslint` | ✅ 0 / 0 |
| `npm test` | ✅ **601 passed / 21 skipped** (48 fichiers) |
| `next build` | ✅ (bundle client propre) |
| `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged | ✅ (diff vide) |
| Migration 017 **NON appliquée** (Arno l'applique) | ✅ (fichier seul) |
| Aucune route / SQL exécuté / Gemini | ✅ |
| Revues R1 / R2 / R3 | ✅ VALIDER / VALIDER / VALIDER |

**Fichiers F1** : `db/migrations/017_action_changement_identite.sql` (nouveau, non appliqué) ·
`app/(admin)/admin/(protected)/comptes/page.tsx` (libellé + CSS) · `…/comptes/page.parts.test.ts` (tests).

## 2. Action de journal retenue — citée depuis le SQL
Nouvelle action **`changement_identite`** ajoutée au CHECK de `admin_utilisateur_log.action` par la migration 017
(`db/migrations/017_action_changement_identite.sql:28-30`), qui reprend les **8** valeurs (les 7 de
`016_comptes_identite.sql:71-72` + la nouvelle), **aucune retirée**. Le CHECK est recréé par `DROP CONSTRAINT
IF EXISTS admin_utilisateur_log_action_check` puis `ADD CONSTRAINT` (nom déterministe hérité du CHECK de colonne
inline de `014:54-56`), dans un DO-block en transaction explicite — **rejouable/idempotente**, additive, non
destructive. F1 **n'écrit jamais** `changement_identite` (grep : la valeur n'apparaît que dans la migration et les
tests) — c'est F2 qui l'utilisera, après application de 017.

## 3. Séquence pour Arno (à jouer AVANT F2)
```
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/017_action_changement_identite.sql
```
Idempotente (rejouable), transactionnelle (échec au milieu → rollback), additive (une valeur de plus dans le `IN`).
Rollback non destructif : rien à défaire côté données ; revenir en arrière = redéployer l'ancien code (laisser la
valeur en plus est inoffensif tant qu'aucune ligne ne l'utilise — F1 n'en écrit aucune).

## 4. Libellé de la règle administrateur (F1)
- **Avant** : « Désactivation : CLI uniquement » DANS la rangée de boutons (décalait l'alignement ; « CLI »
  incompréhensible pour un non-développeur).
- **Après** : texte **exact** « Un administrateur ne peut pas être désactivé depuis l'interface. » placé **sous la
  ligne de rôle**, dans la colonne d'identité (`.cpt-regle` : petit, gris `--color-svv-muted`, ton sobre, pas une
  alerte). La rangée de boutons ne contient plus QUE des boutons → **alignement d'une carte à l'autre**.
- Carte d'un administrateur **désactivé** (section désactivés) : variante « …ne peut pas être **réactivé**
  depuis l'interface. » (décision A2).
- **Cohérence du vocabulaire** : le toast d'erreur de `definirActif` (appel forgé) disait encore « passe par la
  CLI » → aligné en « Un administrateur ne peut pas être activé ou désactivé depuis l'interface. ». Plus **aucun
  « CLI »** dans l'UI (grep : 0). Le **code d'erreur serveur `ADMIN_CLI_UNIQUEMENT` reste INCHANGÉ** (seul
  l'affichage change ; la route `actif/route.ts:47` n'est pas touchée).

## 5. Tests modifiés / ajoutés — aucune logique déplacée
- **Ajouté** à `page.parts.test.ts` : texte exact présent + placement (`cpt-regle`) ; variante « réactivé » ;
  disparition de « CLI uniquement » / `cpt-cli` / de tout `\bCLI\b` de l'UI ; migration 017 (8 actions dont
  `changement_identite`, `DROP IF EXISTS` + `ADD`, transaction).
- **Aucun test existant modifié** : `edition.test.ts` (Lot D) continue d'attendre le **code** `ADMIN_CLI_UNIQUEMENT`
  (403) sur la route — inchangé. Aucun test des lots B/C/D/E ne dépendait de la chaîne UI ni de `cpt-cli`.

## 6. Revues adverses — verdicts & arbitrages
| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Migration 017 | **VALIDER** | Idempotente/rejouable (DROP IF EXISTS + ADD) ; nom de contrainte exact ; 8 actions, 0 retirée ; transaction saine ; additive. |
| R2 | Libellé / UI | **VALIDER** | Texte exact sous le rôle ; boutons alignés ; ton sobre ; contraste AA (muted 5.35:1) ; aucun bleu ; variante « réactivé » cohérente ; 375px OK. |
| R3 | Conformité / régression | **VALIDER** | Serveur intact (code d'erreur inchangé) ; défense en profondeur préservée ; F1 n'anticipe pas F2 ; aucun test cassé. |

**Arbitrages :**
- **Toast « CLI » → aligné** (R2/R3 obs) : *accepté* — le prompt bannit « CLI » de l'UI ; le toast est une surface
  utilisateur (appel forgé). Vocabulaire unifié.
- **Test variante « réactivé »** (R3 suggestion) : *accepté & ajouté*.
- **DO-block de 017 stylistiquement différent de 016** (R1, cosmétique) : *conservé* — Arno a explicitement demandé
  « DO-block gardé par NOM de contrainte, DROP IF EXISTS puis ADD ». Sans incidence fonctionnelle.
- **Redondance règle carte (`cpt-regle`) vs détail (`cpt-note`)** (R2 obs) : *tracé* — contextes distincts, sobre,
  harmonisation future éventuelle.

Aucun défaut de fond → run poursuivi jusqu'à la livraison F1.

## A. DÉCISIONS HORS-SPECS
- **A1 — Découpe F1/F2** : sur décision Arno (le run avait été arrêté sur l'action de journal). F1 = migration + libellé.
- **A2 — Variante « réactivé »** pour un administrateur désactivé : la spec ne donnait que le texte « désactivé » ;
  pour un admin de la section « désactivés » (mis là par la CLI), la RÉactivation est le fait bloqué en interface,
  d'où la variante. *Alternative écartée* : texte statique « désactivé » (faux dans ce contexte). *Impact* : purement
  cosmétique.

## B. DOUTES
- **B1 — F2 (édition prénom/nom) reste à construire** APRÈS application de 017. Il utilisera `changement_identite`,
  une écriture atomique conditionnelle (jamais l'identifiant, immuable — F-1), la double barrière `exigerAdministrateur`,
  et l'allowlist stricte des champs. Non commencé (conformément à « Livre F1 SEUL et arrête-toi »).

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; `password.ts`/
`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged ; **aucune migration appliquée** ; Gemini hors périmètre ;
aucun identifiant en dur (R-F) ; responsive/`prefers-reduced-motion` intacts (Lot E).

## Verdict de recon-valid (Phase 8)
**VALIDER (F1).** Migration 017 correcte et rejouable (à appliquer par Arno) ; libellé clair, sobre, bien placé,
boutons alignés, aucun « CLI » ni bleu dans l'UI ; code serveur d'erreur inchangé ; F1 n'anticipe pas F2. Golden
23/23, byte-unchanged, aucun commit.

**⏸ ARRÊT après F1**, comme demandé : j'attends qu'Arno **applique la migration 017** avant de construire **F2**
(édition prénom/nom, journalisée en `changement_identite`, identifiant immuable, allowlist stricte, double barrière).
À toi de committer F1 fichier par fichier, puis d'appliquer 017, puis de relancer pour F2.
