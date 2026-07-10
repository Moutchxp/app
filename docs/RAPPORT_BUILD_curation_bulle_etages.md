# Rapport de build — Nombre d'étages dans la bulle de curation

> Run `/svav-build` autonome. Suite directe du commit `701f938` (bulle « année »). **UN SEUL LOT, UN SEUL
> COMMIT** (fait par Arno). LECTURE SEULE : aucune écriture, aucune migration, aucun DDL. Aucun fichier
> moteur, aucun fichier Gemini. **Aucun commit.**

## 1. Synthèse

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ **23/23** (aucun fichier moteur touché) |
| `tsc` | ✅ 0 · `eslint` ✅ 0 |
| `npm test` (unitaires) | ✅ **644 passed / 21 skipped** (+9 vs base 635) |
| `next build` | ✅ Compiled successfully |
| `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` | ✅ BYTE-UNCHANGED |
| `obstacles.ts`/`verdict.ts`/`scoreTotal.ts`/`faisceaux.ts`/`config.ts`/`pipeline` | ✅ intouchés |
| Migration / DDL / écriture SQL / Gemini | ✅ aucune |
| Bleu sur nouveaux éléments | ✅ aucun |
| Revues R1 / R2 / R3 | ✅ **VALIDER / VALIDER / VALIDER** |

**Fichiers (8 : 4 modifiés, 2 renommés, dont contenu réécrit)** :
- `emprises/route.ts` — ajout `b.nombre_d_etages AS etages` (aucun join nouveau).
- `partage.ts` — `LigneEmpriseDB.etages?` + mapping `versEmprise` (`?? null`).
- `bulleAnnee.ts` → **`bulleBatiment.ts`** (git mv + réécriture : helper à deux données).
- `bulleAnnee.test.ts` → **`bulleBatiment.test.ts`** (git mv + réécriture).
- `CurationCarte.tsx` — import, `Emprise.etages`, appel `contenuBulleBatiment`, bouton renommé, aide, CSS.
- `curation.test.ts` — assertions route `etages` (dont 0) + `versEmprise`.

## 2. Aucune jointure ajoutée — payload mesuré — plan inchangé

- **Zéro LEFT JOIN nouveau.** `nombre_d_etages` est une colonne de `bdtopo_batiment` (= vue de `batiment`),
  déjà lue avec `geom`. La requête ne contient **qu'un seul** `LEFT JOIN` (celui de l'année, sur
  `bdnb_annee_batiment`). Scellé par test : `curation.test.ts` assère `(sql.match(/LEFT JOIN/g)).length === 1`
  et la présence de `b.nombre_d_etages AS etages`.
- **Payload mesuré** (bbox Asnières, `LIMIT 500`, même chemin de projection) :
  `{cleabs,geom,annee}` = **234 253 o** → `{+etages}` = **242 219 o** → **+7 966 o = +15,9 o/emprise = +3,40 %**
  (178/500 étages non-null dans cette bbox).
- **EXPLAIN ANALYZE avant/après = plan IDENTIQUE** : mêmes coûts (`354.50..8813.79`), mêmes nœuds
  (`Limit → Nested Loop Left Join → Bitmap Heap Scan on batiment + Index Scan bdnb_pkey`), **aucun nœud de
  join ajouté**, seule différence `width 60 → 64` (les 4 octets de l'`int`). `nombre_d_etages` est déjà
  ramené dans le heap scan de `batiment` : l'ajouter au SELECT ne coûte que sa sérialisation.

## 3. Le `0` survit à tous les chemins d'affichage (décision Arno)

`0` étage est une VRAIE valeur (« 0 étage »), jamais « non renseigné ». Prouvé à chaque étage du chemin :
- **SQL** : `b.nombre_d_etages AS etages`, aucune transformation (`COALESCE`/`NULLIF`/`CASE` absents).
- **Mapping** : `partage.ts` `etages: r.etages ?? null` — opérateur **`??`** (nullish), pas `||` :
  `0 ?? null === 0`. Scellé `curation.test.ts` (`{etages:0}` → `toBe(0)`).
- **Libellé** : `bulleBatiment.ts` `libelleEtages` — garde `typeof etages === 'number' && Number.isFinite(etages)`
  (PAS un test falsy) → `0` entre dans la branche valeur → « 0 étage » (singulier, `Math.abs(n) < 2`).
- **Bulle** : `contenuBulleBatiment` produit deux lignes **indépendantes** → `0` étage s'affiche MÊME quand
  l'année manque (aucun court-circuit global). Scellé `bulleBatiment.test.ts` (`contenuBulleBatiment(null, 0)`
  contient « 0 étage » et **ne** contient **pas** « non renseigné »).
- Tests dédiés au 0 à chaque étage : `bulleBatiment.test.ts` (libellé + bulle), `curation.test.ts` (route JSON +
  versEmprise). Tous **peuvent échouer** (assertions opposées à la valeur d'absence). Vérifié vert.

## 4. La règle de conflit d'interaction (acquise) est intacte

Le lot n'a touché aucun des trois mécanismes acquis au lot « année », prouvé par R1 (fichier:ligne) :
- **pane dédié `svv-cur-fond` (zIndex 350 < overlayPane 400)** : `createPane` + `pane:'svv-cur-fond'` inchangés
  → rattachement (couche bleue) prioritaire même après un rebuild dû à la bascule du mode.
- **dblclick de création suspendu en mode bulle** via `doitCreerAuDoubleClic(modeBulle)` — inchangé.
- **filet `map.closePopup()` au basculement** — inchangé.
- Le test qui **prouve** la survie de la règle (`doitCreerAuDoubleClic`, deux cas) est conservé dans
  `bulleBatiment.test.ts`. Le renommage n'a laissé **aucune** référence morte à `bulleAnnee`/`contenuBulleAnnee`
  (grep : 0, hors le commentaire qui documente volontairement le renommage).

## 5. Renommages, avec justification

- **Helper `bulleAnnee.ts` → `bulleBatiment.ts`** (+ test) : le nom « année » mentait dès l'ajout des étages.
  « bâtiment » couvre les deux données (et une éventuelle 3ᵉ). Renommage propre via `git mv` (historique
  préservé), imports mis à jour (`CurationCarte.tsx`), aucun fichier fantôme.
- **Bouton « Années de construction » → « Infos bâtiment »** (option retenue). Alternative écartée :
  « Année et étages » (transparent mais plus long à 375px et à re-renommer si un 3ᵉ champ arrive un jour).
  « Infos bâtiment » est concis, tient sur le bouton pleine largeur mobile, et l'**aide contextuelle** détaille
  précisément les champs affichés + la note sémantique.

## 6. Aide contextuelle du bouton (pour Arno-dans-six-mois)

Texte retenu (hors bulle, sans jargon de table) : *« Survolez (ou touchez) un bâtiment pour voir son année de
construction et son nombre d'étages. Source : données publiques IGN / BDNB — couverture partielle (l'année manque
souvent dans Paris, les étages y sont mieux couverts). Le nombre d'étages sert aussi, en secours, à estimer la
hauteur des bâtiments voisins pour le score — jamais pour le verdict. »* — La bulle elle-même reste sans jargon
(ni BDNB, ni DGFiP, ni BD TOPO).

## 7. Revues adverses — verdicts & arbitrages

| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Régression de la règle acquise + renommage | **VALIDER** | Aucune réf morte ; pane/dblclick/closePopup intacts ; test de survie présent ; aucun sélecteur cassé. |
| R2 | Chasse au bug du `0` avalé | **VALIDER** | `??` (pas `||`), garde `typeof number` (pas falsy), lignes indépendantes ; 0 prouvé à 4 étages. |
| R3 | Donnée / perf / a11y / conformité | **VALIDER** | 1 seul join, `ST_Force2D` présent, moteur non touché, aria/44px/focus rouge OK, aucun bleu, aucune variable en dur. |

**Arbitrages** : aucun constat à corriger (3× VALIDER). Nuance de formulation relevée par R3 : le `LEFT JOIN` année
n'est pas « préexistant d'un ancien commit » mais introduit au commit `701f938` (lot précédent, déjà committé) —
sans incidence sur le décompte (1 seul join dans la requête). Note hors-périmètre R2 : un `? :` sur `carteAnnee`
existe dans `EventailFaisceaux.tsx` (banc-test), sans rapport avec ce lot.

**Variable de comportement en dur : AUCUNE.** La bulle ne fait qu'afficher deux colonnes ; `libelleAnnee`/
`libelleEtages`/`contenuBulleBatiment` sont des fonctions pures sans seuil ni pondération ; `modeBulle` est un
état UI local. Rien qui relève de `config_scoring`.

## 8. Séquence de test manuel (desktop + mobile)

Ouvrir `/admin/curation` (connecté `perm_curation`), activer « **Infos bâtiment** » (le bouton passe à ● **Activé**).
`cleabs` réels vérifiés en base :

1. **92 — année ET étages** : `BATIMENT0000000240321334` (1900, **3 étages**), Asnières @ lat 48.906811, lon 2.282966.
   Recentrer là → survol/tap → bulle **« Construit en 1900 » / « 3 étages »**.
2. **Paris — SANS année MAIS avec étages** : `BATIMENT0000000245182218` (**6 étages**) @ lat 48.864841, lon 2.339691.
   → bulle **« Année de construction non renseignée » / « 6 étages »** (l'étage comble le trou parisien de l'année).
3. **0 étage** : `BATIMENT0000000000149824` (**0 étage**) @ lat 48.901541, lon 2.357699.
   → bulle **« … » / « 0 étage »** — jamais « non renseigné » (c'est LE cas à vérifier des yeux).

**Mobile (375px)** : bouton pleine largeur, cible ≥44px, état ●/○ + Activé/Masqué lisible sans couleur ; **tap**
(pas survol) sur un bâtiment → bulle à deux lignes ; tap ailleurs → ferme.
**Non-régression** : mode actif + entité sélectionnée → cliquer une emprise **bleue** → **rattache** (pas de bulle
qui vole le clic) ; mode inactif → double-clic bâtiment → formulaire « Nouveau tag ».

## 9. Rapport de doute — 3 catégories

**A. DÉCISIONS HORS-SPECS**
1. **Libellé du bouton = « Infos bâtiment »** (spec : « renomme, propose 2, choisis, justifie »). Alternative
   écartée « Année et étages ». Justification §5. Impact : cosmétique.
2. **Pluriel étages** : singulier pour `|n| < 2` → « 0 étage », « 1 étage », « 2 étages ». Conforme à la consigne
   Arno (« 0 étage / 1 étage / N étages »). Choix du seuil `< 2` (règle française standard).
3. **Aide bouton** : formulation de la note sémantique sans jargon de table (§6). La mention de source
   (IGN / BDNB) est conservée dans l'aide (autorisée hors bulle) ; retirable si tu préfères zéro nom de source.
4. **CSS bulle deux lignes** : `.svv-cur-bulle-l{display:block}`, 2ᵉ ligne en gris atténué (hiérarchie visuelle
   année > étages). Décoratif, aucune incidence.

**B. DOUTES**
1. **Annonce lecteur d'écran** (reporté du lot année) : `role="status"` sur une région insérée déjà pleine →
   annonce non garantie sur tous les lecteurs d'écran. La valeur reste atteignable au pointeur (desktop + tap).
   Hors périmètre (outil interne pointer-driven), non traité — inchangé par ce lot.

**C. ÉCARTS DE CONFORMITÉ**
- Aucun. Golden 23/23 inchangé ; verdict/score non touchés ; `ST_Force2D` présent ; aucune variable de moteur
  introduite ; lecture seule stricte ; fichiers sensibles byte-unchanged ; Gemini intouchés.

## 10. Confirmations finales

Aucune écriture · aucune migration · aucun DDL · aucun fichier moteur (`obstacles.ts`/`verdict.ts`/`scoreTotal.ts`/
`faisceaux.ts`/`config.ts`/`pipeline` intouchés) · aucun fichier Gemini · aucun commit (Arno commit lui-même).
