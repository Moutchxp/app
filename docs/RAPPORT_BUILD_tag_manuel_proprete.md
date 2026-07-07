# RAPPORT — build « Tag manuel : lot propreté (5 corrections) »

> Édition anti-doublon, suppression, confirmation, retrait statut, étoile jaune. **Front + routes curation.**
> GOLDEN-ADJACENT (écrit du manuel) mais le build **n'écrit rien en base** → golden inchangé. **Non committé.**

## Résumé
- **(1) Édition** : double-clic/tag d'un cleabs déjà porté par un **tag manuel** → propose de l'**éditer** (pas de doublon) ; le **multi-entités NATIF reste permis**. Renommage d'un tag (PATCH).
- **(2) Suppression** : route **DELETE `/entites/[id]`** (CTE liaisons→entité, FK sans cascade), **gardée `origine='manuel'`** ; bouton « Supprimer ce tag » (détail, manuel seulement).
- **(3) Confirmation** inline (pattern `confirmDetach`) avant suppression.
- **(4) Statut** retiré du formulaire (nullable, aucune migration).
- **(5) Étoile jaune** ★ dans la liste pour `origine='manuel'` (`origine` désormais exposé par le GET).
- Golden **15/15** (`29.107259068449615`).

## Fichiers (4 modifiés, 1 nouveau)
- `entites/route.ts` : GET expose `e.meta->>'origine' AS origine`.
- `partage.ts` : `LigneEntiteDB.origine` + `versEntite` renvoie `origine`.
- `entites/[id]/route.ts` (**NEW**) : **DELETE** (suppression manuelle, CTE) + **PATCH** (renommage manuel).
- `CurationCarte.tsx` : type `Entite.origine`, `entitesRef`, détection édition, renommer/supprimer, confirmation, retrait statut, étoile, CSS.
- `curation.test.ts` : +7 tests (DELETE ×3, PATCH ×4).

## A. DÉCISIONS HORS-SPECS
- **A1 — Détection du doublon manuel CÔTÉ FRONT** (dans `ouvrirCreationCiblee`, via `entitesRef`) : le front
  a déjà toutes les entités + liaisons + `origine` → inutile d'ajouter un endpoint de lookup. Ne se déclenche
  que si le cleabs appartient à une entité `origine='manuel'` avec liaison **active** ; un cleabs **natif**
  n'y déclenche rien (multi-entités natif préservé). Alternative écartée : lookup serveur (round-trip inutile).
- **A2 — Journalisation DELETE/PATCH DIFFÉRÉE** : `curation_patrimoine_log.action` a un `CHECK` fermé sans
  valeur « suppression »/« renommage », et le chantier **interdit toute migration** → insérer une action
  inconnue **ferait échouer** l'opération. Non journalisé (traçabilité via `ref_code=MANUEL-<ts>` + effet).
  Recommandation suite : migration additive étendant le `CHECK` si Arno veut ces actions journalées.
- **A3 — Renommage : input NON contrôlé (`defaultValue` + `key={e.id}`)** : évite un état `nomEdition`
  synchronisé ; le `key` par entité réinitialise la valeur au changement de sélection. Nom vide → `nom=NULL`
  (tag sans légende), autorisé par la route PATCH (contrairement au POST création — cf. B1 2/6).
- **A4 — Anti-doublon = ÉDITION, pas blocage** (conforme spec) : jamais de refus dur ; on redirige vers
  l'entité existante. Le multi-entités **entre familles** (MH+Inventaire) n'est jamais entravé.
- **A5 — Pas de test UI automatisé** (idem 2/6 : `CurationCarte.tsx` non montable dans vitest/node). Routes
  DELETE/PATCH **testées** (query mockée). Vérif UI = `tsc`/`eslint`/`next build`.

## B. DOUTES
- **B1 (rappel 2/6, hors périmètre)** : `nom` reste **requis à la CRÉATION** (route 1/6 rejette le vide). Le
  **renommage** (PATCH) accepte, lui, le nom vide (`NULL`). Incohérence mineure à lisser si Arno relâche le POST 1/6.
- **B2 (mineur)** : la suppression retire liaisons + entité même si l'entité a des liaisons `source='manuel'`
  sur des cleabs partagés avec d'autres entités — c'est correct (la PK `(entite_id,cleabs)` isole ; les autres
  entités gardent LEURS liaisons). Aucune autre entité affectée.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` bit-identique.
  - **INSTRUMENTATION** : le build **n'écrit rien** (tests mockent `query`, UI hors CI). Les routes
    DELETE/PATCH sont **gardées `meta->>'origine'='manuel'`** (asserté par les tests : SQL contient
    `meta->>'origine' = 'manuel'`) → **une entité/liaison NATIVE n'est JAMAIS touchée**. Golden inchangé →
    **garde-fou Asnières respecté** (aucun cleabs natif d'Asnières modifié). **divergences=0** (aucune mutation DB par le build).
  - **RÈGLE DURE** : le `DELETE`/`DELETE`-de-liaisons est **déclenché par l'opérateur** (chantier approuvé),
    jamais par l'agent (tests mockés). Garde-fou `origine='manuel'` + 404 si natif.
  - **ISOLATION** : `faisceaux.ts`, `verdict.ts`, `config_scoring`, `coucheDegagement.ts`, `cartesAnnee.ts`,
    `PROFIL_GOLDEN_REF`, Gemini, **`liaisons/route.ts`** — **intouchés**. **Aucune migration.**
  - **Réutilisation** : `rattacher`/`detacher`/`recharger`/`selectionner`/`ecrire`/pattern `confirmDetach` — inchangés.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **374** · curation **32/32** · `next build` **✓**.

## Tests décrits
- (a) re-tag d'un cleabs déjà manuel → **propose l'édition**, pas de doublon (front, via `origine`+liaisons).
- (b) « Supprimer ce tag » → confirmation → DELETE (liaisons+entité) → disparaît de la liste (route testée).
- (c) suppression/renommage **refusés sur natif** → **404** (garde `origine='manuel'`, testé).
- (d) formulaire **sans champ statut**, création OK (statut nullable → NULL).
- (e) **étoile ★** visible sur les entités manuelles (`origine='manuel'`), absente sur les natives.
- (f) golden inchangé (15/15).

## Verdict de conformité : livraison prête. Anti-doublon = édition (multi-famille natif préservé), suppression/
## renommage GARDÉS manuel (natif intouchable, testé), statut retiré, étoile jaune. GOLDEN-SAFE (build sans
## écriture, golden 15/15, isolation). Journalisation DELETE/PATCH différée (CHECK fermé) — tracé A2.
