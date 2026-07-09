# RAPPORT — build « Curation · 3e axe de filtre ORIGINE (auto / manuel) »

> Front-only, un seul fichier (`CurationCarte.tsx`). Route NON touchée. Golden bit-identique. **Non committé.**

## Vérification préalable (obligatoire) — CAS 1 : `origine` DÉJÀ dans le payload
`GET /api/admin/curation/entites` sélectionne déjà `e.meta->>'origine' AS origine` (`route.ts:25`) et le front
porte déjà `Entite.origine: string | null` (`CurationCarte.tsx:50`). → **La route n'est PAS modifiée.** Aucun
SELECT, aucun WHERE, aucune écriture DB. Diff strictement limité à `CurationCarte.tsx`.

## Implémentation (patron dupliqué à l'identique de `famillesVisibles`/`statutsVisibles`)
1. **Type + libellés + helper** : `type Origine = 'auto' | 'manuel'` ; `ORIGINES` (Automatique / Manuel) ;
   `origineDe(e) = e.origine === 'manuel' ? 'manuel' : 'auto'` (dérivé de `e.origine`, aucun recalcul, aucun SQL).
2. **État** : `originesVisibles: Record<Origine, boolean>` = `{ auto: true, manuel: true }` (les 2 cochés par défaut).
3. **Filtre CUMULATIF à 3 axes** : ajouté à `entitesFiltrees` (liste) ET `entitesAvecPoint` (marqueurs carte) —
   entité visible **ssi** `famille cochée ET statut GPS coché ET origine cochée`. Deps `useMemo` mises à jour.
4. **Encart « ORIGINE »** : `<fieldset>` sous « Statut du point », 2 cases à cocher (même markup `svv-cur-check`,
   accessibilité identique aux 2 encarts existants).
5. **Compteur** « N entité(s) · M à placer » (`entitesFiltrees.length` + `sansPoint`) reflète automatiquement le
   résultat filtré (aucune ligne à changer). Rendu des biens manuels (étoile jaune + polygone vert) inchangé.
   L'historique n'est pas touché (son filtre famille serveur mono-sélection reste inchangé).

## A. DÉCISIONS HORS-SPECS
- **A1 — « Automatique » = origine absente OU ≠ 'manuel'.** La spec définit auto = « meta->>'origine' absent ou
  ≠ 'manuel' ». `origineDe` implémente exactement ce complément (`e.origine === 'manuel' ? 'manuel' : 'auto'`, où
  `e.origine` est `null` pour l'automatique). Les 2 seaux sont exclusifs et couvrent 100 % des entités. Aucune
  autre interprétation possible.
- **A2 — Encart placé SOUS « Statut du point »** (ordre familles → statut → origine), conforme à la demande.

## B. DOUTES
- **Aucun.** Patron strictement dupliqué (familles/statut), champ `origine` déjà exposé, filtre client pur.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` **bit-identique** (composant client ; le moteur
    lit `patrimoine_entite`/`_batiment` par cleabs mais jamais ce composant).
  - **Route entites NON modifiée** (cas 1) : aucun WHERE/filtrage serveur ajouté.
  - **DIFF limité à `CurationCarte.tsx`** ; interdits non touchés (moteur, `config_scoring`, `pipeline.itest`,
    migrations, `curationEdition`, `journalRendu`, `page.tsx`, `BancSaisie`, `EventailFaisceaux`).
  - **PARCOURS PUBLIC INCHANGÉ** : `page.tsx` non modifié (0 occurrence).
  - **Aucune écriture DB, aucune migration, aucune dépendance** ; **Gemini** hors périmètre.
  - **A11y** : cases étiquetées (`<label>`/`<span>`), cohérentes avec les 2 encarts existants.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **461** · `next build` ✓.

## Recon de validation (Phase 8) → **VERDICT : VALIDER**
3e axe de filtre client pur, orthogonal à la famille (n'altère pas le rendu des familles), cumulatif, patron
existant dupliqué sans factorisation. Route intacte (champ déjà présent). Golden bit-identique. Aucun doute bloquant.

## Fichiers touchés
- `app/(admin)/admin/(protected)/curation/CurationCarte.tsx` — type/const/helper `Origine`, état `originesVisibles`,
  filtre 3e axe (liste + marqueurs), encart « ORIGINE ».
- `docs/RAPPORT_BUILD_curation_filtre_origine.md` — ce rapport.
