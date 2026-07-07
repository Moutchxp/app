# RAPPORT FINAL — build « Cartes d'année de construction configurables (CRUD) »

> Run `/svav-build` sur `docs/SPEC_cartes_annee_dynamiques.md` (OQ1–OQ7 tranchés). **Chantier MOTEUR le
> plus sensible, golden RÉELLEMENT exercé. Non committé.** Catégories : A hors-specs · B doutes · C écarts.

## Résumé
Les 2 tranches d'année FIXES (`ancien1900`/`ancien1935`) sont remplacées par un nombre **variable de cartes
d'année** (table `config_famille_annee`, CRUD admin). Le moteur `familleCoeff` lit ses tranches depuis
`profil.famillesAnnee` (priorité **mondial > MH > Inv > cartes > null** inchangée). **Golden bit-identique**
(`29.107259068449615`, 14/14) via le **seed 2 cartes** reproduisant les tranches actuelles + fixture
`PROFIL_GOLDEN_REF` migrée. **Instrumentation Asnières confirmée** (≥1 faisceau classé en carte, classification
identique à l'ancienne cascade). Le seed par migration rend la **prod behavior-preserving immédiatement**.

## Fichiers
- **Moteur (pas 1)** : `cartesAnnee.ts` (NEW, module pur : `intervalleReelCarte`/`carteMatche`/`validerCartesAnnee`,
  ordre champs `{cone,flanc,distMaxM}` verrouillé) ; `coucheDegagement.ts` (`familleCoeff` via cartes) ;
  `profilDegagement.ts` (type `famillesAnnee`, DEFAUT 2 cartes seed) ; `pipeline.itest.ts` (fixture migrée) ;
  `profilConfig.ts` (loader try/catch **local**). + `cartesAnnee.test.ts` (T1 + **T6a équivalence exhaustive**),
  `profilConfig.cartes.test.ts`.
- **Migration** : `db/migrations/006_config_famille_annee.sql` (NEW, additive, seed idempotent, **appliquée**).
- **CRUD (pas 2)** : `app/(admin)/api/admin/cartes-annee/{route.ts,[id]/route.ts,partage.ts}` (server-only,
  GET/POST/PATCH/DELETE, validation `validerCartesAnnee` sur l'ensemble résultant, journal atomique CTE) +
  `route.cartes.test.ts`.
- **Admin/UI** : `mappingConfig.ts` (8 colonnes → VESTIGIALE) + `.test.ts` ; `route.patch.test.ts`
  (`borne_annee_1900`→422) ; `cartes-annee/page.tsx` (UI CRUD) ; `Sidebar.tsx` (nav).

## A. DÉCISIONS HORS-SPECS
- **A1 — Bornes garde-fous CRUD** : `cone/flanc ∈ [0,10]`, `0 < distMaxM ≤ 2000` (garde-fous de dev, non
  spécifiés) → 422 si hors plage. Évite un coefficient aberrant cassant le score.
- **A2 — Instrumentation via `.itest.ts` temporaire** (option plan-audit) : un test jetable a rejoué
  `validerOrigine`+`faisceauxAmplitude` pour Asnières, prouvé `enCarte ≥ 1` **et** `divergences vs cascade = 0`,
  puis **supprimé** (non committé). `ResultatComplet`/`analyse.ts` NON modifiés (les faisceaux n'y sont pas
  exposés).
- **A3 — `familleCoeff` reste privée** : la bit-identité est prouvée par T6a (équivalence exhaustive 1799–2101
  + null, objet `{cone,flanc,distMaxM}` complet) + le golden, sans exporter la fonction moteur.
- **A4 — Journal cartes** : convention `config_edit_log.colonne = "famille_annee:#<id>"` (`#new` à la création),
  `avant/apres` = carte JSON.
- **A5 — Colonnes neutralisées** : reclassées VESTIGIALE + libellés préfixés « Ex- … sans effet » + infobulle
  « neutralisée — pilotée par les cartes d'année ». Conservées en base, `config_scoring` reste 47 colonnes.

## B. DOUTES
- **B1 — TOCTOU sur écritures concurrentes (à arbitrer)** : la lecture des cartes existantes et l'écriture
  sont deux `query()` distincts, et **aucune contrainte DB** n'interdit le chevauchement (migration 006 = CHECK
  opérateurs + « ≥1 borne » seulement). Deux écritures concurrentes se recouvrant pourraient toutes deux passer
  la validation. **Impact réel faible** (outil mono-opérateur ; le moteur `.find` prend la 1re carte →
  dégradation gracieuse, pas de crash). **Durcissement futur possible** : `EXCLUDE USING gist` sur l'intervalle
  (int4range) OU `pg_advisory_xact_lock`. À décider par Arno.
- **B2 — Priorité MH/mondial > carte non testée en unitaire dédié** (`familleCoeff` privée) : couverte par le
  golden 14/14 + T6a. Un test isolé serait plus robuste face à un futur refactor.
- **B3 — Edge année fractionnaire** (documenté) : le modèle d'intervalle est **entier** ; `impactAnnee =
  Number(annee_construction)` est toujours entier (BDNB) → l'edge `1900.5` (cascade→B vs carte→null) est
  **non atteignable**. Ne pas introduire d'arrondi sur `impactAnnee`.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.** Batterie SVAV :
  - **GOLDEN** : `test:integration` **14/14**, `29.107259068449615` **bit-identique** (seed 2 cartes disjointes
    `(-∞,1900]` / `[1901,1935]`, coeffs `{1.5,1.2,300}`/`{1.2,1.1,200}` repris à l'identique ; fixture migrée ;
    **aucun rescellage**).
  - **INSTRUMENTATION Asnières** : ≥1 faisceau classé en carte **ET** classification identique à l'ancienne
    cascade (divergences = 0) — chemin réellement exercé et préservé.
  - **ISOLATION** : `familleCoeff` — MH/Inv au-dessus, mondial (`:110`)/cône-flanc (`:116`)/classique
    (`:114,129`) intacts ; loader try/catch local (table vide→[] valide, erreur→repli champ) ; `config_famille_annee`
    hors gardes de repli-profil-entier ; verdict/`ST_Force2D`/Gemini/`mode_combinaison` **intouchés** ;
    routes CRUD n'importent que `client.ts` + `cartesAnnee.ts`.
  - **ÉCRITURE bornée** : CRUD = `INSERT/UPDATE/DELETE config_famille_annee` + `INSERT config_edit_log` **seuls**,
    atomiques (CTE mono-`query`), paramétrés (anti-injection, noms de colonnes fixes) ; **aucun** write
    `config_scoring` ; **aucun** `DROP/ALTER/TRUNCATE`. Migration 006 additive + idempotente (re-run NO-OP).
  - **RÈGLE DURE** : la ligne live `config_famille_annee` conserve ses **2 cartes seed** (agent n'a rien écrit) ;
    le `DELETE` est une action internaute (jamais l'agent) ; tests CRUD sur `query` mockée.
  - **ENUM fermé** : validation opérateurs `{>=,>}`/`{<=,<}` (CHECK DB + validation) ; PATCH M1 sur
    `borne_annee_1900` → **422 « non éditable »** (testé).
  - Non-régression : `tsc` 0 · `npm test` **340 passés / 21 skipped** (baseline 295, +45, zéro régression).

---

## Verdict de conformité : livraison prête. Golden bit-identique et réellement exercé (instrumentation),
## isolation totale, migration additive, écritures CRUD bornées, ligne live non écrite par l'agent (Règle dure).
## Aucune action post-livraison requise (le seed rend la prod behavior-preserving). À arbitrer : B1 (garde
## anti-chevauchement au niveau DB, optionnel pour un usage mono-opérateur).
