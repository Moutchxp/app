# RAPPORT — build « Cohérence + affichage de la carte de curation (M4) »

> Chantier de correction (3 corrections regroupées) sur la carte M4. **GOLDEN-SAFE** (le moteur lit
> `AND NOT peb.detache` mais JAMAIS `verifie_manuellement` ni `geom_point_corrige`). **Non committé.**

## Résumé
Trois corrections : (1) cohérence des badges au détachement ; (2) invalidation de la vérification quand
le point est déplacé loin de l'emprise (critère **distance > 15 m**, décidé par Arno) ; (3) polygones
rattachés peints en **vert persistant** (hors bbox). Golden **15/15** (`29.107259068449615` inchangé) ;
`verifie_manuellement` / `detache` / `geom_point_corrige` ne sont lus par **aucun** chemin de score.

## Fichiers (6 modifiés, 1 nouveau)
- `app/lib/admin/curation.ts` (M) : + `CURATION_TOLERANCE_RATTACHEMENT_M = 15`.
- `…/curation/partage.ts` (M) : ré-export de la constante.
- `…/entites/[id]/liaisons/route.ts` (M) : tombstone auto pose aussi `verifie_manuellement = false`.
- `…/entites/[id]/point/route.ts` (M) : CTE déplacement + **invalidation** (dist > 15 m) + journal des cleabs invalidés.
- `…/entites/[id]/emprises/route.ts` (NEW) : GET des emprises rattachées d'une entité (hors bbox).
- `…/curation/CurationCarte.tsx` (M) : badge « vérifié » masqué si détaché ; vert persistant depuis le nouvel endpoint.
- `…/curation/curation.test.ts` (M) : +1 test invalidation, +1 assertion reset au tombstone (21 tests).

## Correction 1 — cohérence des badges au détachement
- **Backend** (`liaisons/route.ts:157-159`) : le tombstone auto fait désormais `SET detache = true, source = 'manuel', verifie_manuellement = false` (une liaison détachée ne peut plus rester « vérifiée »). `apres` journalisé mis à jour. *(Le détach manuel reste un `DELETE` : la ligne disparaît, sans objet.)*
- **UI** (`CurationCarte.tsx`) : le badge « vérifié » est conditionné à `!l.detache` → une liaison détachée n'affiche que « détaché » (+ `source`).

## Correction 2 — invalidation de la vérification au déplacement (décision Arno)
- **Critère : distance > 15 m** (`CURATION_TOLERANCE_RATTACHEMENT_M`, miroir de la tolérance de rattachement AUTO), **PAS** containment strict. *(Recon : ~220/397 liaisons ont déjà leur point géocodé HORS de l'emprise à 1-11 m — un test `ST_Covers` strict aurait invalidé la quasi-totalité au 1ᵉʳ déplacement. Arbitrage validé par Arno.)*
- **Backend** (`point/route.ts`) : dans le **même** CTE atomique que le déplacement, un `UPDATE patrimoine_entite_batiment SET verifie_manuellement = false` cible les liaisons **vérifiées, non détachées** de l'entité dont l'emprise `bdtopo_batiment` est à `ST_Distance > 15 m` du nouveau point (2154, `ST_Force2D`). **Ne touche NI `detache` NI le nombre de liaisons.** Les cleabs invalidés sont tracés dans le journal (`apres.verifications_invalidees`) et renvoyés (`verificationsInvalidees`).
- Petit recentrage (< 15 m du bâti) → vérification **conservée** ; éloignement réel → **remise à `false`** (re-vérifiable). Sanity mesuré : la liaison vérifiée existante est à 8,52 m → non invalidée au repos.

## Correction 3 — polygones rattachés persistants (affichage)
- **Backend** : nouvel endpoint `GET /entites/[id]/emprises` renvoyant les emprises des liaisons **non détachées** de l'entité (`JOIN bdtopo_batiment`, 4326), indépendamment de la bbox.
- **UI** : à la sélection (et après chaque écriture, via `entites` en dépendance), la carte peint **toutes** ces emprises en **vert uniforme persistant** (quel que soit vérifié/manuel/auto). Les candidates de la bbox restent en bleu, **hors** des déjà rattachées. Objectif atteint : monument composé (Notre-Dame = N polygones) entièrement vert.

## A. DÉCISIONS HORS-SPECS
- **A1 — Journal de l'invalidation dans la ligne `deplacement`** : les cleabs invalidés sont mis dans `apres.verifications_invalidees` de l'action `'deplacement'` (pas de nouvelle `action` → pas de migration pour étendre le `CHECK`). Alternative écartée : action dédiée `'invalidation'` (nécessiterait une migration).
- **A2 — Critère distance > 15 m** au lieu du `ST_Covers` de la spec — imposé par la réalité des données (points géocodés hors emprise), **validé explicitement par Arno**.
- **A3 — Aucune migration** : les 3 corrections réutilisent les colonnes existantes (`verifie_manuellement`, `detache`, `geom_point_corrige`). Constante `= 15` centralisée dans `app/lib/admin/curation.ts` (isolée du moteur).
- **A4 — EXISTS(dist>15)** (et non NOT EXISTS(dist≤15)) : une liaison vérifiée dont le cleabs n'a **pas** d'emprise n'est **jamais** invalidée (conservateur sur données manquantes). Une des 2 liaisons vérifiées est dans ce cas.

## B. DOUTES
- **Aucun bloquant.** L'invalidation ne fait pas de recalcul auto de rattachement (seulement `verifie_manuellement`), conforme à la décision. Le badge « manuel » sur un tombstone reste (issu du flip `source='manuel'` de durabilité) — c'est voulu, non un bug ; seul « vérifié » était incohérent et est corrigé.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **15/15**, `29.107259068449615` inchangé (`verifie_manuellement`/`detache`/`geom_point_corrige` non lus par le moteur).
  - **ISOLATION** : `faisceaux.ts` / verdict / `config_scoring` / `PROFIL_GOLDEN_REF` / Gemini **intouchés** ; aucun import `app/lib/svv` (seuls des commentaires le mentionnent). `geom_point` **original jamais muté** (seul `geom_point_corrige` écrit — test transverse). Écritures **atomiques** (CTE), server-only sous `proxy.ts`, 422/404 jamais 500, `ST_Force2D` conservé, `ST_Transform(…,4326)` affichage seulement.
  - Non-régression : `tsc` 0 · `npm test` **363** · `eslint` 0 · curation **21/21**.

## Verdict de conformité : livraison prête. Les 3 incohérences (badge vérifié+détaché, vérif non invalidée
## au déplacement, vert non persistant) sont corrigées, golden-safe et prouvées. Aucune migration.
