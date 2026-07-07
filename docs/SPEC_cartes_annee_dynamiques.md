# SPEC — Cartes d'année de construction configurables (CRUD)

> Spec EARS. **Livrable = cette spec, PAS du code.** RFC 2119. Produite via `/svav-specs`. **Chantier
> MOTEUR sensible** (touche `coucheDegagement.ts`/`familleCoeff`, le golden, `PROFIL_GOLDEN_REF`, nouvelle
> table). Golden **behavior-preserving par construction** (seed = 2 tranches actuelles).

## Besoin
Remplacer les **2 tranches d'année FIXES** (`ancien1900`/`ancien1935`, bornes en colonnes `config_scoring`)
par un **nombre VARIABLE de « cartes d'année »** entièrement configurables par un non-développeur (CRUD
créer/modifier/supprimer) : fourchette d'années + pondération de faisceau (`cone`, `flanc`, `distMax`) par
carte. Zéro code pour l'admin.

## Recon confirmée (`fichier:ligne`)
- **Classification actuelle** — `familleCoeff` (`coucheDegagement.ts:47-55`) : MH → Inventaire → `année ≤
  borneAnnee1900` → `année ≤ borneAnnee1935` → `null`. Cascade `≤` inclusive : `ancien1935` n'est atteint
  que si `année > borneAnnee1900`. Les 2 tranches sont donc **disjointes** : `(-∞, 1900]` et `(1900, 1935]`.
- **Coefficients** appliqués `:88` (cône/flanc) / `:94`,`:97` (cap `fam.distMaxM`).
- **Source année** : BDNB `bdnb_annee_batiment.annee_construction`, **1er obstacle par faisceau**
  (`obstacles.ts:780`, `faisceaux.ts:102,116`, `scoreDegagement.ts:80-81`).
- **Structure profil** : `FamilleCoeff { cone; flanc; distMaxM }` (`profilDegagement.ts:14`) ;
  `famillesPonderation { mondialFaisceauM; mh; inventaire; ancien1900; ancien1935 }` (`:26-34`) ;
  `borneAnnee1900/1935` (`:93,95`). Mapping `profilConfig.ts:103-104,118-119`.
- **GOLDEN exerce ce chemin** (mesuré) : ~**47 bâtis datés ≤ 1935** dans le secteur Est (azimut 90°) à
  ≤ 200 m d'Asnières → des faisceaux du golden sont très probablement classés `ancien1900`/`ancien1935`.
  ⚠️ **La bit-identité est donc STRICTE** (ce n'est pas un chemin inerte comme `mode_combinaison`).
- **Schéma DB** : `db/migrations/003_config_scoring_create.sql:25` fournit déjà `CREATE TABLE IF NOT EXISTS
  config_scoring` (dette résolue) ; dernière migration = **005** → nouvelle = **006**. Convention seed
  idempotent : cf. `003`.

## Périmètre
**DANS** : (1) **nouvelle table** de cartes d'année (migration 006, `CREATE TABLE IF NOT EXISTS` + seed
behavior-preserving) ; (2) **moteur** : `familleCoeff` lit les cartes depuis le profil ; (3) **profil +
loader** : `famillesAnnee` chargé depuis la table ; (4) **CRUD admin** (routes server-only + validation
non-chevauchement + journal) ; (5) **UI** cartes ; (6) fixture `PROFIL_GOLDEN_REF` + défaut migrés.
**HORS** : verdict, `ST_Force2D`, Gemini, **valeur** du golden, **exception mondiale**, **sélection
cône/flanc**, **chemin classique** (aucune carte → aucun bonus), **ordre de priorité** (mondial > MH > Inv >
cartes > null), `mode_combinaison`/`combinerP1P2`. **Purge** des colonnes neutralisées = chantier séparé.

## Invariants SVAV (garde-fous durs)
- **GOLDEN bit-identique** : `test:integration` **14/14 à `29.107259068449615`** après build. Le seed
  reproduit EXACTEMENT les 2 tranches actuelles ; la fixture migre. **Instrumenter Asnières** au build
  (compter les faisceaux classés en carte d'année) pour confirmer bit-à-bit. Golden bouge → **STOP, ne rien
  resceller, signaler (Phase 7)**.
- **Migration ADDITIVE** : `CREATE TABLE IF NOT EXISTS` + seed idempotent ; **jamais** `DROP`/`ALTER`
  destructif. Les colonnes `a1900_*`/`a1935_*`/`borne_annee_1900/1935` sont **conservées en base**
  (neutralisées, plus lues), retirées de l'admin (purge = chantier séparé, Règle dure).
- **CRUD server-side** sous garde `proxy.ts`, validé (fourchette, opérateurs, **non-chevauchement → 422**),
  journalisé (`config_edit_log`). **Aucune écriture autonome de l'agent** ; le seed via migration est OK ;
  le `DELETE` d'une carte est une action **de l'internaute admin** (jamais de l'agent).
- **PILOTAGE SANS CODE** : cartes 100 % éditables au runtime, aucune constante d'année en dur.
- **Responsive / mobile-first** (CLAUDE.md §15). Info-bulles cohérentes avec l'existant.

---

## Décisions arrêtées (Arno — ne pas rouvrir)
- **DA1 — Modèle de carte** : fourchette par **opérateur unaire** (`≥ A`, `> A`, `≤ B`, `< B`) OU **intervalle**
  (borne basse `≥`/`>` + borne haute `≤`/`<`) ; coefficients `cone`, `flanc`, `distMax` (mêmes rôles
  qu'`ancien1900`/`1935`).
- **DA2 — Non-chevauchement STRICT** : le système calcule l'**intervalle réel** de chaque carte (opérateurs
  stricts/inclusifs) et **refuse (422)** si deux cartes partagent une seule année. **Trou autorisé** (année
  hors carte → aucun bonus → chemin classique). **Aucun ordre** (non-chevauchement ⇒ au plus une carte
  matche).
- **DA3 — REMPLACER, pas bricoler** : table dédiée + seed behavior-preserving ; colonnes fixes neutralisées
  mais conservées.

---

## Arbitrages (OQ1–OQ7 — TRANCHÉS)

### (a) Table + colonnes — TRANCHÉ (OQ1 : `config_famille_annee`)
Table **`config_famille_annee`**, colonnes **explicites** : `id serial PK`, `borne_min int NULL`, `op_min
text NULL CHECK (op_min IN ('>=','>'))`, `borne_max int NULL`, `op_max text NULL CHECK (op_max IN
('<=','<'))`, `cone double precision NOT NULL`, `flanc double precision NOT NULL`, `distmax_m double
precision NOT NULL`. Contrainte : **au moins une borne non nulle**. *(JSONB écarté.)*

### (b) Opérateurs — TRANCHÉ (OQ2 : `{≥,>}` / `{≤,<}`, intervalle entier)
`op_min ∈ {'>=','>'}`, `op_max ∈ {'<=','<'}` (liste fermée, CHECK DB). Carte = **opérateur unaire** (un seul
champ borné, l'autre `NULL`) OU **intervalle** (deux champs). **Résolution en intervalle réel entier**
`[lo, hi]` : `lo = borne_min NULL ? −∞ : (op_min='>=' ? borne_min : borne_min+1)` ; `hi = borne_max NULL ?
+∞ : (op_max='<=' ? borne_max : borne_max−1)`. Carte **valide** si `lo ≤ hi`.

### (c) Non-chevauchement — TRANCHÉ (OQ3 : fonction pure partagée)
`intervalleReelCarte(carte): [lo, hi]` + `validerCartesAnnee(cartes[]): { ok } | { erreurs }` dans **un
module pur `app/lib/svv/cartesAnnee.ts`** (importable client + serveur, **sans accès DB**) : le matching
moteur ET la validation CRUD utilisent la **même** source de vérité. *(Duplication écartée.)*

### (d) UI CRUD — TRANCHÉ (OQ4 : écran/section dédié)
Écran/section admin dédié « Cartes d'année » : **liste** des cartes (chacune = fourchette + `cone`/`flanc`/
`distMax` éditables), boutons **Ajouter** et **Supprimer** (confirmation), erreur de chevauchement affichée,
**avertissement golden** (les cartes agissent sur le score), responsive 375 px. Séparé du tableau Pilotage.

### (e) Colonnes neutralisées — TRANCHÉ (OQ5 : VESTIGIALE grisées)
`a1900_*`/`a1935_*`/`borne_annee_1900/1935` reclassées **VESTIGIALE** (grisées, non éditables) avec
info-bulle « neutralisée — remplacée par les cartes d'année dynamiques ». Conservées en base, inertes.
`config_scoring` reste à **47 colonnes** ; recap statuts à recalculer (les 4 bornes/6 coeffs passent
VESTIGIALE). *(Masquage total écarté.)*

### (f) Journal — TRANCHÉ (OQ6 : `config_edit_log` existant)
Réutilise `config_edit_log` avec la convention `colonne = "famille_annee:#id"` (ou `#new` à la création) et
`avant/apres` = carte sérialisée. Pas de table de journal dédiée.

### (g) DELETE d'une carte — TRANCHÉ (OQ7 : action internaute, conforme Règle dure)
Le `DELETE` d'une carte est une **fonctionnalité CRUD pilotée par l'internaute admin**, journalisée. La
**Règle dure vise l'agent autonome**, pas cette fonctionnalité : **l'agent ne supprime jamais de carte
lui-même** (ni au build, ni en test — tests sur `query` mockée).

---

## Modèle moteur cible
- **Profil** : `famillesPonderation` conserve `{ mondialFaisceauM, mh, inventaire }` ; **retirer**
  `ancien1900`/`ancien1935` ; **retirer** `borneAnnee1900/1935` ; **ajouter** `famillesAnnee: CarteAnnee[]`
  (`CarteAnnee = { borneMin, opMin, borneMax, opMax, cone, flanc, distMaxM }`).
- **`familleCoeff`** (refactor) : `if impactMH → mh ; if impactInventaire → inventaire ; if
  typeof année==='number' → première carte dont l'intervalle réel contient l'année (unique par
  non-chevauchement) → { cone, flanc, distMaxM } ; sinon null`. Ordre de priorité inchangé.
- **Loader** `chargerProfilDegagement` : après `config_scoring`, `SELECT … FROM config_famille_annee`
  → `famillesAnnee`. **Distinguer** : table vide (0 ligne) = état **valide** (aucune carte → aucun bonus,
  liste vide) ; erreur DB = repli sur `PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee` (2 cartes seed).

---

## User stories
- **US1** — En tant qu'**opérateur (Arno)**, je veux **créer/éditer/supprimer des cartes d'année** avec
  fourchette + pondération, afin d'ajuster le barème patrimonial sans coder.
- **US2** — En tant qu'opérateur, je veux être **empêché de créer des cartes qui se chevauchent**, afin de
  garantir qu'au plus une carte s'applique à une année.

## Exigences EARS

### Table + seed
- **EX-1** [Ubiquitaire] La migration 006 DOIT créer la table des cartes via `CREATE TABLE IF NOT EXISTS`
  (idempotent), sans `DROP`/`ALTER` destructif.
- **EX-2** [Ubiquitaire] La migration DOIT **seeder** la table **uniquement si elle est vide**, avec les 2
  cartes reproduisant EXACTEMENT les tranches actuelles : carte A « année ≤ 1900 » → `{1.5, 1.2, 300}` ;
  carte B « > 1900 et ≤ 1935 » → `{1.2, 1.1, 200}`.
- **EX-3** [Ubiquitaire] Les 2 cartes seed DOIVENT être **disjointes** (intervalles réels `(-∞,1900]` et
  `[1901,1935]`) — non-chevauchement vérifié.

### Moteur
- **EX-4** [Ubiquitaire] `familleCoeff` DOIT retourner les coefficients de la **carte dont l'intervalle réel
  contient** l'année du bâti, APRÈS MH et Inventaire (priorité inchangée).
- **EX-5** [Indésirable] SI aucune carte ne contient l'année (trou), OU si l'année est inconnue/nulle, ALORS
  `familleCoeff` DOIT retourner `null` (chemin classique, aucun bonus).
- **EX-6** [Ubiquitaire] L'exception mondiale (`coucheDegagement.ts:82`), la sélection cône/flanc (`:88`) et
  le chemin classique DOIVENT rester inchangés.
- **EX-7** [Ubiquitaire] Le matching moteur DOIT utiliser la **même** fonction pure d'intervalle réel que la
  validation CRUD (source unique).

### Loader / profil
- **EX-8** [Ubiquitaire] `chargerProfilDegagement` DOIT charger `famillesAnnee` depuis la table à chaque
  analyse (comme le reste du profil).
- **EX-9** [Indésirable] SI la lecture de la table échoue, ALORS le loader DOIT retomber sur
  `PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee` (2 cartes seed) — **une table vide (0 carte) n'est PAS une
  erreur** (liste vide = aucun bonus).

### CRUD + validation
- **EX-10** [Ubiquitaire] Les opérations créer/modifier/supprimer DOIVENT passer par des routes
  **server-only** sous la garde `proxy.ts` (sans session → 401).
- **EX-11** [Ubiquitaire] QUAND une carte est créée ou modifiée, le système DOIT valider server-side :
  bornes numériques, opérateurs dans les listes fermées, **intervalle réel non vide** (`lo ≤ hi`), au moins
  une borne, coefficients dans leurs plages.
- **EX-12** [Indésirable] SI l'ensemble résultant des cartes contient **un chevauchement** (deux cartes
  partageant ≥ 1 année), ALORS le système DOIT **rejeter (422)** l'écriture, sans rien persister.
- **EX-13** [Ubiquitaire] Chaque écriture CRUD réussie DOIT être **journalisée** (`config_edit_log` :
  quelle carte, avant → après).
- **EX-14** [MUST NOT] Le build/l'agent NE DOIT JAMAIS supprimer ni modifier de façon autonome une carte en
  base ; seule l'action admin de l'internaute déclenche un `DELETE`/`UPDATE`.

### UI
- **EX-15** [Ubiquitaire] L'admin DOIT afficher la liste des cartes, chacune éditable (bornes + opérateurs +
  `cone`/`flanc`/`distMax`), avec **Ajouter** et **Supprimer** (confirmation).
- **EX-16** [Indésirable] SI une écriture est rejetée (chevauchement/invalide), ALORS l'UI DOIT afficher le
  message au niveau concerné, sans présenter la carte comme enregistrée.
- **EX-17** [Ubiquitaire] L'édition d'une carte DOIT afficher l'**avertissement golden** (les cartes
  agissent sur le score).
- **EX-18** [Ubiquitaire] L'UI DOIT rester utilisable en **portrait 375 px**.

### Colonnes neutralisées
- **EX-19** [Ubiquitaire] Les colonnes `a1900_*`/`a1935_*`/`borne_annee_1900/1935` DOIVENT rester en base,
  **ne plus être lues** par le moteur, et être **retirées de l'édition** admin (reclassées VESTIGIALE).

### Golden
- **EX-20** [Ubiquitaire] `PROFIL_DEGAGEMENT_DEFAUT` et `PROFIL_GOLDEN_REF` DOIVENT porter `famillesAnnee` =
  les 2 cartes seed (et non plus `ancien1900`/`ancien1935`).
- **EX-21** [Ubiquitaire] Après build, `test:integration` DOIT rester **14/14 à `29.107259068449615`**,
  **bit-identique**.
- **EX-22** [Indésirable] SI le golden bouge, ALORS le build DOIT **s'arrêter et signaler**, jamais
  resceller.
- **EX-23** [MUST NOT] Le chantier NE DOIT toucher ni le verdict, ni `ST_Force2D`, ni Gemini, ni l'ordre de
  priorité des familles, ni `mode_combinaison`/`combinerP1P2`.

---

## Cas de test explicites exigés
| Scénario | Attendu |
|---|---|
| **Seed** (2 cartes) → `test:integration` | **14/14, `29.107259068449615` bit-identique** |
| Instrumentation Asnières (build) | ≥ 1 faisceau classé en carte d'année (chemin exercé, inchangé) |
| Ajout carte « ≥ 2020 » (`{c,f,d}`) puis analyse | bâti **2019** → score **inchangé** ; bâti **2021** → **bonus** de la nouvelle carte |
| Création d'une carte chevauchant une existante | **422**, aucune persistance |
| Suppression d'une carte | le bâti qu'elle couvrait repasse **« aucun bonus »** (chemin classique) |
| Année dans un **trou** (aucune carte) | `familleCoeff` → `null`, aucun bonus |
| Bâti **MH** ou **mondial** | priorité conservée : MH/mondial l'emportent, cartes non consultées |
| Table vide (toutes cartes supprimées) | aucun bonus année ; **pas** de repli DEFAUT (état valide) |
| Lecture table en échec | repli `PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee` (2 cartes) |
| Carte à intervalle vide (ex. `> 1935 et < 1930`) | **422** (`lo > hi`) |

---

## Statut : Spec **FIGÉE**
Les 7 arbitrages (OQ1–OQ7) sont **TRANCHÉS** ci-dessus (§Arbitrages). Aucune question ouverte restante.

*Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO) viendra sur cette base validée.
Rappel : chantier moteur + golden **réellement exercé** (~47 bâtis ≤1935 secteur Est d'Asnières) → la
bit-identité du seed (2 cartes) + la fixture `PROFIL_GOLDEN_REF` migrée sont ce qui garantit `test:integration`
14/14 à `29.107259068449615` ; instrumenter Asnières au build pour confirmer bit-à-bit.*
