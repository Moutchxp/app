# RAPPORT FINAL — build « Affichage seuil 40 m » (distance-verdict)

> Run `/svav-build` sur `docs/SPEC_affichage_seuil_40m.md`. Correctif **PUR AFFICHAGE**. **Non committé**.
> Catégories : A décisions hors-specs · B doutes · C écarts de conformité.

## Résumé
La distance-verdict de l'écran Résultat est désormais formatée par **une fonction partagée unique**
appliquant la règle : `Math.round` **partout**, **sauf `[39 ; 40[` → 39**. Les 2 sites d'affichage
(`page.tsx:451` « X m », `page.tsx:646` « X mètres ») utilisent cette fonction ; **aucun
`Math.round(distanceM)` inline** ne subsiste. Verdict/moteur/golden **intouchés**.

## Fichiers produits
- `app/lib/formatDistance.ts` (NOUVEAU, **hors `app/lib/svv`**) : `metresVerdictAffiches(distanceM): number|null`
  (`(d>=39 && d<40) ? 39 : Math.round(d)` ; `null`/non fini → `null`) + `formaterDistanceVerdict(distanceM): string`
  (« X m » / « Aucun (≥ 200 m) »).
- `app/lib/formatDistance.test.ts` (NOUVEAU) : 16 cas (tranche seuil [39;40[→39, arrondis, golden, null, Infinity).
- `app/page.tsx` (MODIFIÉ, 3 points) : import du helper ; Site 1 → `formaterDistanceVerdict(distanceM)` ;
  Site 2 → `metresVerdictAffiches(distanceM) ?? "—"`.

## A. DÉCISIONS HORS-SPECS
- **A1 — Emplacement/API** : `app/lib/formatDistance.ts` avec les 2 exports proposés en OQ1 (Option A) de
  la spec — suivi à la lettre, aucune invention.
- **A2 — Consolidation du test de finitude** : au Site 1, l'ancien `Number.isFinite(distanceM) ? … : "Aucun
  (≥ 200 m)"` est remplacé par `formaterDistanceVerdict(distanceM)`, qui **encapsule** la gestion
  `null`/non-fini → « Aucun (≥ 200 m) ». Comportement **équivalent** (branche « Aucun » préservée), logique
  centralisée dans la fonction partagée. Alternative écartée : garder le `Number.isFinite` inline au Site 1
  (aurait dupliqué une logique désormais dans le helper).
- *Aucune autre décision hors-specs : la spec figée (règle + OQ1) couvrait le chantier.*

## B. DOUTES
- *Aucun.* Cas limites vérifiés et conformes à la règle (ex. `38,6 → Math.round → 39`, toujours < 40 donc
  cohérent avec un vis-à-vis ; `39,99 → 39` par l'exception, jamais 40). `tabular-nums`/taille adaptative
  du bloc distance (`tailleDistance`) continuent de dériver de la chaîne affichée — inchangés.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.** Batterie SVAV verte :
  - **GOLDEN** : `test:integration` **14/14**, `29.107259068449615` **inchangé** (la distance-verdict brute
    du golden ≈ 42,10 s'affiche « 42 m » via `Math.round`, hors tranche seuil ; le test n'assère aucune
    chaîne d'affichage).
  - **EX-9** : aucun `Math.round(distanceM)` inline (grep vide).
  - **EX-10** : littéral « 40 m » du seuil intact (`page.tsx:603`) ; **aucun** fichier `app/lib/svv`,
    `config_scoring`, migration, golden ou Gemini touché ; `distanceM` brut et le verdict inchangés.
  - **VERDICT DÉCOUPLÉ** : le verdict reste décidé en amont sur `distanceM` brut (`verdict.ts`) ; le
    correctif est purement présentationnel.
  - Non-régression : `npm test` 263 passés / 21 skipped ; `tsc` 0 erreur.

---

## Verdict de conformité : livraison prête. Aucun mouvement du golden, aucun blocage, aucune suppression
## de données (Règle dure non sollicitée).
