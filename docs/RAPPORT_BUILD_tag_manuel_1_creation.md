# RAPPORT — build « Tag manuel patrimonial 1/6 : création d'entité »

> Sous-étape 1/6. **Backend only, GOLDEN-SAFE** (aucune liaison créée → aucun chemin de score touché).
> **Non committé.** Catégories : A décisions hors-specs · B doutes · C écarts.

## Résumé
Nouvel endpoint **`POST /api/admin/curation/entites`** créant une entité patrimoniale **manuelle** :
`ref_code = MANUEL-<ts>` (généré serveur), `meta = {origine:'manuel'}`, `geom_point` NULL, `actif=true`,
`famille` validée contre l'enum, `nom` non vide. **INSERT SEUL** (aucune entité/liaison existante touchée).
Golden **15/15** (`29.107259068449615`), inchangé.

## Fichiers (2 modifiés, ce chantier)
- `app/(admin)/api/admin/curation/entites/route.ts` : **POST ajouté** (GET intact) + constante `FAMILLES_PATRIMOINE`.
- `app/(admin)/api/admin/curation/curation.test.ts` : +4 tests (201 / 422 famille / 422 nom / 409).

> ⚠️ Le working tree contient aussi `CurationCarte.tsx` (M) + `RAPPORT_BUILD_curation_scroll.md` (??) :
> ce sont les livrables de la **sous-étape « scroll » précédente, non encore committée**, **hors périmètre** de ce chantier.

## A. DÉCISIONS HORS-SPECS
- **A1 — Journalisation de la création DIFFÉRÉE** (spec step 8) : `curation_patrimoine_log.action` a un
  **`CHECK` fermé** (`deplacement|annulation_deplacement|rattachement|detachement|verification`) et le
  chantier **interdit toute migration**. Insérer `action='creation_entite_manuelle'` violerait le CHECK
  (`23514`) et **ferait échouer la création**. → **création NON journalisée** dans cette sous-étape.
  Traçabilité assurée autrement : `ref_code = MANUEL-<timestamp ms>` (encode l'instant) + `meta.origine='manuel'`.
  Alternative écartée : réutiliser une action existante (sémantiquement fausse). **Recommandation suite** :
  migration additive étendant le CHECK (`+'creation_entite_manuelle'`) si Arno veut la création journalée,
  ou journaliser au moment du **rattachement** (sous-étape 2, action `'rattachement'` valide).
- **A2 — `ref_code = MANUEL-${Date.now()}`** (conforme spec) : unique sans lecture DB ; `ref_code` fourni
  par le client **rejeté** (jamais lu du body). Collision seulement si 2 créations dans la même ms → **409** géré.
- **A3 — `statut` optionnel → `null`** si absent ou chaîne vide (colonne nullable). Aucune contrainte d'enum
  sur `statut` en base → pas de validation d'enum côté serveur (accepté tel quel, trimé).
- **A4 — Validateurs inline dans la route** (famille/nom) + réutilisation de `partage.lireCorps` : garde
  l'isolation à **un seul fichier route** (pas de modif de `partage.ts`). Constante `FAMILLES_PATRIMOINE`
  = miroir du `CHECK patrimoine_entite_famille_check`.

## B. DOUTES
- **B1 — non bloquant** : `MANUEL-<ms>` suffit à l'unicité en usage mono-opérateur ; le **409** (23505) couvre
  le cas limite (double clic < 1 ms). Aucune lecture de séquence en base (pas de course).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique. Ce chantier **ne crée
    aucune liaison** `patrimoine_entite_batiment` → le moteur (cleabs-only) ne voit pas la nouvelle entité → score inchangé.
  - **ISOLATION** : diff scopé = **`entites/route.ts` + `curation.test.ts`** (`git diff --name-only`). Aucun
    fichier interdit touché (`faisceaux.ts`, `verdict.ts`, `config_scoring`, `profilConfig`, `coucheDegagement.ts`,
    `cartesAnnee.ts`, Gemini, `CurationCarte.tsx`). **Aucune migration.**
  - **INSERT SEUL, non destructif** : `INSERT INTO patrimoine_entite (…)` (Règle dure respectée — aucun
    UPDATE/DELETE d'existant, aucune liaison). Le POST **ne mentionne pas `geom_point`** (défaut NULL) ni `_batiment`.
  - **Sécurité** : requête **paramétrée** (`$1..$5`, aucune concat) ; server-only (`import 'server-only'`) ;
    sous garde `proxy.ts` (401 sans session) ; validation stricte **422** (famille/nom) / **409** (unique) / **503** (indispo).
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **367** · curation **25/25**.

## Tests (curation.test.ts)
- (a) POST valide → **201**, entité `refCode` `^MANUEL-\d+$`, `nom` trimé, INSERT paramétré, `meta={origine:'manuel'}`, **aucun** `geom_point`, **aucun** `_batiment`.
- (b) `famille:'chateau'` (hors enum) → **422**, aucune requête émise.
- (c) `nom:'   '` (vide après trim) → **422**, aucune requête émise.
- (d) 23505 → **409**.
- (d-golden) `test:integration` **15/15** inchangé.

## Verdict de conformité : livraison prête. Endpoint de création manuelle golden-safe, isolé (2 fichiers),
## INSERT seul, sans migration. Journalisation de la création différée (CHECK fermé + no-migration) — tracé A1.
## Prochaine sous-étape (2/6) : rattachement de polygones à l'entité créée (déclenche le boost).
