# RAPPORT — build « Endpoint de rollback d'édition (curation) »

> `POST /entites/[id]/annuler-edition` : rejoue en sens inverse les mutations d'une carte depuis son
> ouverture (borne), en UNE transaction. **GOLDEN-SAFE** (journal + curation hors chemin de score). **Non committé.**

## Résumé
Nouvel endpoint qui, dans **une transaction** (`withTransaction` ajouté à `client.ts`), lit les lignes
`curation_patrimoine_log` de l'entité `id > borne` (DESC) et applique l'**inverse par action** en SQL direct,
puis émet **1 seule** ligne `annulation_edition` (si ≥1 inverse). Golden **15/15** (`29.107259068449615`).
Migration 012 (valeur `annulation_edition`) **vérifiée appliquée** en base.

## Fichiers (2 modifiés, 1 nouveau)
- `app/lib/db/client.ts` : + `withTransaction(fn)` (BEGIN/COMMIT, ROLLBACK si throw, `release()` en finally) + type `RequeteTx`.
- `entites/[id]/annuler-edition/route.ts` (**NEW**) : l'endpoint (POST, body `{borne}`).
- `curation.test.ts` : +10 tests (chaque action inversée + séquences mixtes + no-op + suppression ignorée) ; mock `withTransaction`.

## A. DÉCISIONS HORS-SPECS
- **A1 — `withTransaction` ajouté à `client.ts`** (le pool `query()` est auto-commit par appel → ne garantit
  pas l'atomicité multi-requêtes). Helper additif, réutilisable, testable. Alternative écartée : `pool.connect()`
  inline dans l'endpoint (couplage aux internals du pool, moins mockable).
- **A2 — Restauration du déplacement par `ST_DWithin(…, 0.01 m)`** (pas `ST_Equals`) : le `avant` stocke le
  point EFFECTIF reprojeté (2154→4326→JSON) ; le round-trip introduit une dérive flottante → `ST_Equals`
  échouerait à détecter « retour à l'original ». `ST_DWithin` 1 cm (bien sous tout déplacement réel) fiabilise
  la règle « ≈ original → `geom_point_corrige = NULL`, sinon = point avant ». `geom_point` **original jamais muté**.
- **A3 — Rattachement inverse AVANT-conscient** : `avant` null → `DELETE` la liaison créée ; `avant` non-null
  (upsert ayant réactivé un tombstone) → `UPDATE` vers l'état d'avant. (La spec ne citait que le DELETE ; le cas
  upsert est le comportement reverse-replay correct.)
- **A4 — Détachement inverse = `INSERT … ON CONFLICT DO UPDATE`** : couvre d'un seul geste le manuel (ligne
  supprimée → ré-insertion, `dist_m` NULL, `created` = now()) et l'auto (tombstone existant → mise à jour),
  sans brancher sur `avant.source`. `created`/`dist_m` non restaurés à l'identique (léger décalage possible de
  l'ordre « 1er polygone / étoile ») — acceptable, tracé.
- **A5 — `suppression_entite_manuelle` IGNORÉE** (valide par Arno) : une suppression ferme la carte → hors
  périmètre d'un « annuler depuis l'ouverture ». Les lignes `suppression`/`annulation_edition`/inconnues sont
  sautées (non comptées).
- **A6 — No-op si 0 inverse** : si aucune ligne à inverser (ou seulement des lignes hors périmètre) → **aucune**
  ligne `annulation_edition` émise, réponse `{ok:true, nbLignes:0}` (conforme préférence Arno).
- **A7 — Pas de verrou `FOR UPDATE`** sur la lecture du journal : outil admin mono-opérateur, la transaction
  suffit à la cohérence. Tracé.
- **A8 — `borne` validée entier** (`Number.isInteger`) ; `id` via `lireId` → interpolation paramétrée `$1/$2`, pas de concat.

## B. DOUTES
- **B1 (mineur, tracé A4)** : le `created` d'une liaison ré-insérée est reset (now()) → l'ordre « 1er polygone »
  (donc la position de l'étoile) peut changer après un rollback qui ré-insère une liaison détachée manuellement.
  Sans impact données/score ; corrigeable en enrichissant le `avant` du détachement (`created`/`dist_m`) si besoin.
- **B2 (mineur)** : l'atomicité (BEGIN/COMMIT/ROLLBACK) est une propriété **runtime** — non exercée par les tests
  (qui mockent `withTransaction`). Le code suit le pattern pg standard (client dédié, ROLLBACK on throw, release finally).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. Endpoint hors chemin de
    score/verdict ; `curation_patrimoine_log` jamais lu par le moteur.
  - **`geom_point` ORIGINAL jamais muté** : seul `geom_point_corrige` est écrit (vérifié par `muteGeomPointOriginal()`
    dans les tests déplacement + séquence mixte). **`ST_Force2D`** conservé sur toute opération géométrique.
  - **Transaction unique** : `withTransaction` (BEGIN→COMMIT ; ROLLBACK complet si un inverse throw ; erreur → 503).
  - **Ordre d'inversion** : `ORDER BY id DESC`, non réordonné. Séquences mixtes vérifiées (3 inverses + 1 journal).
  - **ISOLATION** : `faisceaux.ts`, `verdict.ts`, `config_scoring`, `coucheDegagement.ts`, `scoreDegagement.ts`,
    `pipeline.ts`, `obstacles.ts`, `analyse.ts`, `cartesAnnee.ts`, `PROFIL_GOLDEN_REF`, Gemini — **intouchés**.
    **Aucune migration exécutée** par le build (012 déjà appliquée par Arno).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **386** · curation **44** · `next build` **✓**.

## Tests (44 curation, dont 10 rollback)
- borne invalide → 422 ; no-op (0 ligne) → pas de journal ; renommage/rattachement(null→DELETE)/détachement(upsert)/
  vérification/déplacement(CASE ST_DWithin)/création(DELETE liaisons+entité) ; suppression seule → ignorée/no-op ;
  séquence mixte (3 inverses DESC + 1 seule ligne `annulation_edition`) ; `geom_point` original jamais muté.

## Verdict de conformité : livraison prête. Rollback atomique par inverses, `annulation_edition` unique, no-op
## propre, `geom_point` original préservé, isolation totale, golden bit-identique. Prochain lot = UI (boutons
## Valider/Sortir/Annuler + capture de `borne` à l'ouverture).
