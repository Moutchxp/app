# Rapport de build — Verrou lecture seule de `analysis_range_m` (M1)

> Run `/svav-build` autonome. UN SEUL LOT, UN SEUL COMMIT (fait par Arno). Aucune valeur en base modifiée,
> aucune migration, aucun fichier moteur, aucun fichier Gemini. **Aucun commit.**

## 1. Synthèse

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ **23/23** (aucun fichier moteur touché) |
| `tsc` 0 · `eslint` 0 | ✅ |
| `npm test` (unitaires) | ✅ **648 passed / 21 skipped** (+4 vs base 644) |
| `next build` | ✅ Compiled successfully |
| `profilConfig.ts:76` (règle croisée) | ✅ **littéralement inchangé** |
| `validation.ts` / `route.ts` | ✅ **inchangés** (le refus serveur était déjà générique) |
| `config.ts` (`ANALYSIS_RANGE_M = 200`) | ✅ inchangé (hors sujet, décidé) |
| `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` | ✅ BYTE-UNCHANGED |
| Migration / DDL / valeur en base | ✅ aucune |
| Revues R1 / R2 / R3 | ✅ **VALIDER / VALIDER / VALIDER** |

**Fichiers du lot (5)** : `pilotage/mappingConfig.ts` · `pilotage/page.tsx` · `pilotage/mappingConfig.test.ts` ·
`api/admin/config/validation.test.ts` · `api/admin/config/route.patch.test.ts` (+ ce rapport).

## 2. Le libellé retenu et sa justification

Deux formulations envisagées :
- **A (retenue)** : « Portée d'analyse — **borne maximale du plafond de distance perçue** (verrouillée) »
- B (écartée) : « Portée d'analyse — plafond de sécurité (verrouillé, lecture seule) »

**Choix A** : elle dit ce que la variable **FAIT** (elle borne la valeur max autorisée du plafond de distance
perçue par faisceau), là où l'ancien libellé décrivait ce qu'elle **NE fait pas** (« n'agit pas sur la
géométrie ») et où B reste vague (« sécurité »). L'infobulle complète : rôle réel (rejet de la config +
repli défaut si le plafond dépasse la borne) **et** rappel explicite « elle N'ÉTEND PAS le rayon de scan des
obstacles (fixé indépendamment) », pour ne pas perdre l'information utile. Aucun jargon de fichier ni de nom
de colonne (on parle du « plafond de distance perçue par faisceau », libellé humain de `distance_max_m`).
L'attribut `aide:` (redondant, et qui n'était affiché que par l'ex-carte paire) a été retiré.

## 3. Où le refus serveur est posé — et pourquoi il est GÉNÉRIQUE (pas spécifique)

**Le refus existait DÉJÀ et couvre toute colonne `editable:false`.** `validerPatch` résout chaque clé du patch
via l'allowlist `mappingConfig.META` (`metaParColonne`) puis rejette :
```
// validation.ts:57-61
if (!meta.editable) { erreurs.push({ colonne: cle, message: `colonne « ${cle} » non éditable` }); continue; }
```
La route `PATCH` renvoie **422** dès que la validation échoue, **AVANT** toute construction de SQL/UPDATE
(`route.ts:90-93`, l'UPDATE est en `:121`). **Aucune ligne spécifique à `analysis_range_m` n'a été ajoutée** :
il suffit que son flag passe `editable:false` (`mappingConfig.ts:143`) pour qu'il tombe sous le même refus que
`id` et les 5 VESTIGIALE. Preuve de généricité : le test `route.patch.test.ts` refuse `boost_f2` (VESTIGIALE)
**et** `analysis_range_m` (MIROIR) par le même chemin.

**Unicité de la surface d'écriture (R1)** : le seul `UPDATE config_scoring` applicatif de tout `app/` est
`route.ts:121`, derrière `validerPatch`. Pas d'autre route (le handler n'exporte que `GET`/`PATCH`), pas de
bulk, pas de route de publication versionnée, pas d'écriture via le banc (il édite un clone en mémoire). Le
verrou est donc étanche côté serveur, pas seulement dans le composant React.

**Journal d'audit d'une tentative refusée** : le journal `config_edit_log` n'est écrit que **sur succès**,
dans la CTE atomique (`route.ts:119-126`). Une tentative refusée (422) n'écrit **rien** — donc **rien n'est
journalisé**. Le mécanisme de journalisation des refus **n'existe pas** ; conformément à la consigne, je ne
l'ai **pas inventé** — je le signale (voir doute B1).

## 4. Preuve par test qu'un PATCH forgé est refusé et que la base ne bouge pas

- `route.patch.test.ts` — « analysis_range_m (MIROIR verrouillé) forgé → 422 + AUCUNE écriture (base
  inchangée) » : PATCH `{analysis_range_m: 300}` → 422, erreur `colonne='analysis_range_m' / non éditable`,
  `ecritureEmise() === false` (aucun UPDATE émis → la valeur en base n'est jamais touchée). **C'est LE test du
  lot.** Test authentique (R3.5) : si le flag repassait `editable:true`, la valeur 300 passerait le typage et
  la réponse serait 200 → le test échouerait.
- « co-soumission {distance_max_m, analysis_range_m} → 422, aucune écriture » : le verrou bloque **tout le
  groupe** (pas d'écriture partielle de `distance_max_m`).
- `validation.test.ts` — « analysis_range_m → non éditable » (même une valeur valide 200 est refusée) et
  « groupe {…} → REFUSÉ ».

## 5. Statut MIROIR préservé + pas de migration en section VESTIGIALE

- `mappingConfig.ts:143` : `statut: 'MIROIR'`, `editable: false`. Test dédié
  (`mappingConfig.test.ts`) : assère **simultanément** `editable===false` ET `statut==='MIROIR'` ET
  `statut!=='VESTIGIALE'` — un futur refactor ne peut ni la rendre éditable ni la basculer vestigiale sans
  casser le test.
- Section repliée : `page.tsx` la filtre sur `statut === 'VESTIGIALE'` ; les blocs de familles excluent aussi
  uniquement les VESTIGIALE. `analysis_range_m` étant MIROIR **reste dans sa famille F_PORTEE**, visible, et ne
  descend PAS dans la section repliée. Le compteur « 5 VESTIGIALE » est inchangé (elle n'en fait pas partie).
- Rendu : `editable:false` → `CarteVariableLecture` (que des `<span>`, **aucun `<input>`**), grisée via
  `data-lecture="true"`. Le badge de statut « Miroir · garde-fou » s'affiche ; `goldenSensible` (VIVE||MIROIR)
  renvoie toujours vrai pour elle (flag intact). Le bandeau golden ne se déclenche qu'à l'édition — une carte
  verrouillée ne peut pas bouger via l'UI, donc ne le déclenche pas : cohérent (la vraie sensibilité golden est
  portée par `distance_max_m`, éditable, + l'infobulle qui explique l'impact indirect).

## 6. Règle croisée et variables VIVES intactes

- **Dissolution de l'ex-paire (EX-23)** : `analysis_range_m` étant figé, la co-soumission `distance_max_m ↔
  analysis_range_m` n'a plus de raison d'être et casserait `distance_max_m` (le groupe serait refusé).
  `distance_max_m` devient une **carte éditable standard** (`CarteVariableEditable`) qui envoie **seulement
  `distance_max_m`**. `CartePaireChamp`, l'état `paire*`, `enregistrerPaire`, `ctx.paire` et le CSS
  `data-paire` (seul bleu de la zone, `#2c4d84`) ont été retirés proprement (aucune référence pendante, tsc 0).
- **Garde-fou préservé** : avec un patch ne contenant que `distance_max_m`, `validerPatch` évalue la ligne
  résultante `{...ligneActuelle, distance_max_m}` → `analysis_range_m` vient de la BASE (200) → `distance_max_m
  = 300` est toujours refusé (422). Prouvé par `validation.test.ts` et `route.patch.test.ts` (« distance_max_m
  seul > portée → 422 »). La couverture de l'ancien test « paire dmax>portée » retiré est **reprise** par ces
  tests existants — aucun trou (R3.5).
- **Aucune VIVE gelée** : une seule ligne `editable` change (analysis_range_m true→false). Les 31 VIVE +
  `mode_combinaison` (VIVE) + `mode_combinaison_repli` (DE GARDE) restent éditables. Contrôle `VIVE &&
  editable:false` → aucune.

## 7. Revues adverses — verdicts & arbitrages

| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Contournement / porte dérobée | **VALIDER** | Refus générique posé serveur avant écriture ; unique `UPDATE config_scoring` (route.ts:121) derrière `validerPatch` ; co-soumission rejetée en bloc ; aucun cas spécial codé. |
| R2 | Statut & affichage | **VALIDER** | statut MIROIR conservé ; pas en section VESTIGIALE ; carte lecture seule sans input ; libellé décrit l'effet réel + no-scan ; ex-paire retirée proprement. |
| R3 | Régression | **VALIDER** | règle croisée intacte (résultante vs base 200) ; profilConfig.ts:76 inchangé ; aucune VIVE gelée ; golden hors périmètre ; tests authentiques ; ANALYSIS_RANGE_M intact. |

**Arbitrages** : aucun constat à corriger (3× VALIDER). Cleanup opportun accepté : suppression du CSS mort
`.svv-pil-carte[data-paire]` (dont la couleur `#2c4d84` était le seul bleu de la zone) puisque son élément
n'est plus rendu.

## 8. Séquence de test manuel pour Arno

Ouvrir `/admin/pilotage` (connecté `pilotage`).
1. **Desktop** : dans la famille « Portée & garde-fou », la carte « Portée d'analyse … (verrouillée) » est
   **grisée, en LECTURE SEULE** (valeur 200 affichée, **aucun champ de saisie**, aucun bouton Enregistrer),
   badge « Miroir · garde-fou », infobulle « i » expliquant qu'elle borne le plafond de distance perçue et
   n'étend pas le scan.
2. La carte **n'est PAS** dans la section repliée « vestigiales » du bas de page.
3. `distance_max_m` (« Plafond de distance perçue par faisceau ») reste **éditable** ; le tenter à 300 →
   erreur (doit rester ≤ 200) ; à 180 → « Enregistré ».
4. **375px** : même rendu lecture seule, lisible, cible tactile OK.
5. **PATCH forgé (curl)** — doit renvoyer **422** :
   ```
   curl -i -X PATCH .../api/admin/config -H 'content-type: application/json' -d '{"analysis_range_m":300}'
   ```
   → `422`, `{"erreurs":[{"colonne":"analysis_range_m","message":"colonne « analysis_range_m » non éditable"}]}`,
   et la valeur en base reste 200 (aucun UPDATE). (Requête authentifiée requise ; sinon 401/403 en amont.)

## 9. Rapport de doute — 3 catégories

**A. DÉCISIONS HORS-SPECS**
1. **Dissolution de l'ex-paire EX-23** (décision-conséquence). La spec du lot disait « seul `editable` passe à
   false » ; elle ne disait pas comment gérer la carte paire qui co-soumettait les deux champs. Laisser la paire
   aurait cassé `distance_max_m` (groupe refusé). Décision : dissoudre la paire — `distance_max_m` → carte
   éditable standard (envoi solo), `analysis_range_m` → carte lecture seule. Alternative écartée : neutraliser
   `analysis_range_m` DANS `CartePaireChamp` en gardant la structure de paire (laisse une « paire » à demi
   morte, moins cohérente). Impact : le garde-fou serveur est identique (résultante vs base) ; l'UX de
   `distance_max_m` passe de « enregistrer les deux » à « enregistrer » (solo).
2. **Libellé/infobulle** (§2) : formulation choisie par bonne pratique (dire ce que la variable fait). Trace ici
   pour contrôle.
3. **Suppression du CSS `data-paire` et de l'attribut `aide`** : code/données mortes après la dissolution ;
   retirés pour propreté (le `data-paire` portait le seul bleu de la zone).

**B. DOUTES**
1. **Pas de journalisation des tentatives refusées** : `config_edit_log` n'enregistre que les écritures
   RÉUSSIES (`route.ts:119-126`) ; un PATCH refusé (422) n'est pas tracé. Le mécanisme n'existe pas — non
   inventé (conforme à la consigne). Si Arno veut auditer les tentatives forgées, c'est un autre lot (ajout d'un
   log d'échec côté route, hors périmètre ici).

**C. ÉCARTS DE CONFORMITÉ**
- Aucun. Golden 23/23 inchangé ; aucun fichier moteur ; `profilConfig.ts:76`, `validation.ts`, `route.ts`,
  `config.ts` inchangés ; aucune valeur en base modifiée ; sensibles byte-unchanged ; Gemini intouchés.

## 10. Réserve documentée (NON corrigée — autre lot)

**Incohérence de statut `natures_remarquables`** : marquée **VESTIGIALE** (grisée) dans M1
(`mappingConfig.ts:154`) mais **`'vive'`** dans l'outil de diff du banc de test (`profilTest.ts:51`). Le moteur
ne la consomme pas (côté M1 cohérent), mais l'étiquette « vive » du banc contredit M1. Hors périmètre de ce
lot, à trancher séparément. Signalée, non touchée.

## 11. Note de livraison — deux lots non committés dans le working tree

⚠️ Le working tree contient AUSSI le lot précédent **non encore committé** (« bulle nombre d'étages » :
`curation/*` + `docs/RAPPORT_BUILD_curation_bulle_etages.md`). Les fichiers du présent lot sont **disjoints**
(tous sous `pilotage/` et `api/admin/config/` + ce rapport). Pour committer CE lot seul, stager exactement :
`app/(admin)/admin/(protected)/pilotage/{page.tsx,mappingConfig.ts,mappingConfig.test.ts}`,
`app/(admin)/api/admin/config/{validation.test.ts,route.patch.test.ts}`,
`docs/RAPPORT_BUILD_m1_verrou_analysis_range.md`.

## 12. Confirmations finales

Aucune valeur en base modifiée · aucune migration · aucun DDL · aucun fichier moteur · aucun fichier Gemini ·
aucun commit (Arno commit lui-même).
