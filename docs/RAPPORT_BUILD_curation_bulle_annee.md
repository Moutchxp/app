# Rapport de build — Bulle d'information « année de construction » (carte de curation)

> Run `/svav-build` autonome. **UN SEUL LOT, UN SEUL COMMIT** (fait par Arno). LECTURE SEULE côté données :
> aucune écriture, aucune migration, aucun DDL. Aucun fichier moteur, aucun fichier Gemini. **Aucun commit.**

## 1. Synthèse

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ **23/23** (aucun fichier moteur/pipeline/route-score touché) |
| `tsc` | ✅ 0 erreur |
| `eslint` | ✅ 0 |
| `npm test` (unitaires) | ✅ **635 passed / 21 skipped** (50 fichiers) — +15 vs base (620) |
| `next build` | ✅ Compiled successfully (bundle client propre) |
| `password.ts` / `motDePasse.ts` / `proxy.ts` / `garde.ts` | ✅ BYTE-UNCHANGED (diff vide) |
| Migration / DDL / écriture SQL | ✅ aucune |
| Fichiers Gemini | ✅ intouchés |
| Revues adverses R1 / R2 / R3 | R1 **CORRIGER** → corrigé · R2 **CORRIGER** → corrigé · R3 **VALIDER** |

**Fichiers (6)** :
- `app/(admin)/api/admin/curation/emprises/route.ts` — LEFT JOIN `bdnb_annee_batiment` + colonne `annee`.
- `app/(admin)/api/admin/curation/partage.ts` — `LigneEmpriseDB.annee?` + mapping `versEmprise`.
- `app/(admin)/admin/(protected)/curation/CurationCarte.tsx` — type `Emprise.annee`, état `modeBulle`, bouton
  bascule, bulle Leaflet (survol + tap), pane dédié, CSS.
- `app/(admin)/admin/(protected)/curation/bulleAnnee.ts` — **nouveau** helper pur (libellé + règle de conflit).
- `app/(admin)/admin/(protected)/curation/bulleAnnee.test.ts` — **nouveau** test unitaire (helper pur).
- `app/(admin)/api/admin/curation/curation.test.ts` — tests route emprises + mapping `versEmprise`.

## 2. Règle de résolution des conflits d'interaction (le cœur du lot)

Trois gestes se disputaient le même polygone. La règle retenue, encodée dans le helper pur
`doitCreerAuDoubleClic(modeBulle)` :

- **dblclick = créer un tag** (existant) : **suspendu** quand le mode bulle est ACTIF (`bulleAnnee.ts` →
  `doitCreerAuDoubleClic` renvoie `false`), intact sinon. Justification : en mode lecture, le geste sert la
  lecture, pas la création — un double-clic ne doit pas créer d'entité par surprise.
- **click sur la couche bleue = rattacher** (existant) : **priorité absolue**, indépendante de `modeBulle`.
- **tap/survol = afficher la bulle** (nouveau) : au survol (desktop) ET au clic/tap (mobile, via `bindPopup`)
  → la VALEUR n'est **jamais hover-only**.

**Garantie de priorité du rattachement — corrigée après revue R1 (voir §5).** La priorité n'est PAS assurée
par le simple ordre d'ajout des `L.layerGroup` (tous les paths GeoJSON partagent le SVG de l'`overlayPane` et
s'empilent par ordre d'insertion DOM ; un rebuild du fond après une bascule remonterait le fond au-dessus des
candidates). Elle est désormais garantie **structurellement** par un **pane Leaflet dédié** `svv-cur-fond`
(zIndex **350** < overlayPane **400**) : la couche de fond reste TOUJOURS sous les emprises bleu/vert, quel que
soit l'ordre de reconstruction. Sur une entité sélectionnée, le clic atteint donc la couche bleue avant le fond
→ rattachement/détachement prioritaires, aucune bulle sur les candidates (curation prioritaire), en toute
circonstance (y compris juste après une bascule du mode).

## 3. Preuve qu'aucun geste existant n'est cassé

- **dblclick création** : `doitCreerAuDoubleClic(false) === true` (scellé `bulleAnnee.test.ts`) ; câblé
  `CurationCarte.tsx` (handler dblclick de la couche de fond). Intact hors mode bulle.
- **click rattacher / détacher** : couche `coucheEmprisesRef` (overlayPane 400) au-dessus du pane fond (350) →
  intercepte le clic en priorité (R1 confirmé après fix pane).
- **drag marqueur, sélection, dblclick étoile/marqueur** : marqueurs + étoiles vivent dans le `markerPane`
  (600), au-dessus de tout l'overlay → jamais affectés. `stopPropagation` de l'étoile intact.
- **bulle fantôme** : le rebuild (`clearLayers`) émet `remove` → popup lié fermé ; filet `map.closePopup()`
  à la désactivation du mode. Aucun résidu.
- **golden** : 23/23, la route de curation est isolée du moteur (aucun `app/lib/svv/**`, `pipeline`,
  `faisceaux`, `obstacles` touché).

## 4. Surcoût réel du payload (MESURÉ)

Requête réelle sur une bbox dense (Asnières/92), `LIMIT 500`, même chemin de projection que la route :

| | octets |
|---|---|
| Baseline `{cleabs, geom}` (500 emprises) | 226 253 |
| Avec `annee` (`{cleabs, geom, annee}`) | 234 253 |
| **Delta** | **+8 000 = +16 o/emprise · +3,54 %** |

371/500 emprises renseignées (74 %). **Zéro requête supplémentaire** : jointure sur PK `cleabs`
(`bdnb_annee_batiment`), relation 1:0/1 → aucune multiplication de lignes, la donnée voyage avec le GeoJSON
initial (patron autoritatif identique à `obstacles.ts:576`). Aucune requête par polygone (N+1).

## 5. Revues adverses — verdicts & arbitrages

| Revue | Axe | Verdict | Constat majeur |
|---|---|---|---|
| R1 | Régression d'interaction | **CORRIGER → corrigé** | z-order non garanti par l'ordre des `layerGroup` ; bascule du mode pendant une sélection → le fond remonte au-dessus des candidates et vole le clic de rattachement. |
| R2 | Accessibilité & mobile | **CORRIGER → corrigé** | cible tactile du bouton = ~36px (`.svv-cur-btn{min-height:36px}` écrasait `.svv-cur-bulle-toggle{44px}` à spécificité égale, déclaré plus tard). |
| R3 | Donnée & perf | **VALIDER** | RAS. LEFT JOIN sur PK (pas de fan-out), `ST_Force2D` conservé, `?? null` robuste au partage `versEmprise`, zéro écriture, golden hors chemin. |

**Arbitrages :**
- **R1 (accepté, corrigé)** : pane Leaflet dédié `svv-cur-fond` (zIndex 350). Rend la priorité du rattachement
  structurelle et indépendante de l'ordre de rebuild. Le commentaire du code a été rectifié (l'ancien
  « le clic atteint la couche bleue avant le fond » était faux sans le pane).
- **R2 Constat 1 (accepté, corrigé)** : sélecteur porté à `.svv-cur-btn.svv-cur-bulle-toggle` (spécificité 0,2,0)
  → le `min-height:44px` gagne. Cible tactile conforme.
- **R2 Constat 3 (accepté, durci)** : règle `prefers-reduced-motion` du popup portée à 3 classes
  (`.leaflet-fade-anim .svv-cur-bulle-popup.leaflet-popup`) → robuste à l'ordre d'import des CSS.
- **R2 Constat 2 (annonce lecteur d'écran de la bulle) — accepté comme limitation documentée, NON corrigé** :
  une live-region insérée déjà pleine n'est pas annoncée de façon fiable par tous les lecteurs d'écran, et les
  couches vectorielles Leaflet ne sont pas focusables au clavier. La VALEUR reste atteignable au doigt (tap) et
  au survol ; l'accès clavier/SR par polygone d'une carte est hors périmètre de cet outil interne (la carte de
  curation est pointer-driven de bout en bout). Construire une live-region persistante hors popup serait du
  scope-creep non demandé. Voir catégorie B.
- **R3 (LIMIT 500 sans ORDER BY)** : *préexistant*, hors périmètre du diff (n'affecte pas la bulle). Non traité.

## 6. Séquence de test manuel pour Arno

Prérequis : lancer l'app, ouvrir `/admin/curation` (connecté avec `perm_curation`).

**Desktop :**
1. Cliquer « **Années de construction** » (colonne de gauche) → le bouton passe à ● **Activé** (rouge plein).
2. **92 (année connue)** : recentrer sur Asnières/Clichy ; survoler un bâtiment → bulle « **Construit en 1954** »
   (ou autre année). Sortir le curseur → la bulle se ferme.
3. **Paris (année absente)** : recentrer sur Paris intra-muros ; survoler un bâtiment → bulle
   « **Année de construction non renseignée** » (jamais un vide).
4. **Non-régression création** : cliquer de nouveau le bouton (○ **Masqué**) → double-cliquer un bâtiment →
   le formulaire « Nouveau tag » s'ouvre. Réactiver le mode → double-cliquer → **aucune** création (bulle only).
5. **Non-régression rattachement (le cas R1)** : sélectionner une entité (emprises bleues) → **activer** le mode
   bulle → cliquer une emprise **bleue** → elle se **rattache** (vert), pas de bulle qui vole le clic.

**Mobile (iPhone portrait, ~375px) :**
6. Le bouton bascule est pleine largeur, cible ≥ 44px, l'état ●/○ + Activé/Masqué est lisible sans couleur.
7. **Tap** (pas survol) sur un bâtiment → la bulle s'affiche (valeur atteignable au doigt). Tap ailleurs → ferme.
8. Vérifier un bâtiment du **92 avec année** et un de **Paris sans année** : libellé correct dans les deux cas.

## 7. Rapport de doute (Phases 7) — 3 catégories

**A. DÉCISIONS HORS-SPECS**
1. **Mécanisme de la bulle = `bindPopup` (popup Leaflet)**, pas un tooltip. La spec disait « survol OU tap ».
   Choix : le popup s'ouvre au clic/tap nativement (mobile) et se ferme au clic ailleurs (`closeOnClick`), on
   ajoute `openPopup`/`closePopup` au survol (desktop). Alternative écartée : tooltip (n'a pas de fermeture au
   clic-ailleurs, s'ouvre mal au tap). Impact : nul sur les données ; sobre (`closeButton:false`,
   `autoPan:false`).
2. **Emplacement du bouton** : dans la colonne de gauche, après les 3 filtres, avant les compteurs. La spec
   disait « panneau latéral gauche » sans position précise. Choix cohérent avec les blocs de contrôle existants.
3. **Indicateur d'état sans couleur** : forme `●`/`○` + mot `Activé`/`Masqué` (+ rouge plein / gris contour).
   La spec exigeait « perceptible sans couleur » sans imposer le procédé.
4. **Libellé d'absence** : « Année de construction non renseignée » (formulation sobre, non-vide). Retenu tel
   quel ; la source (BDNB) est reléguée à l'aide contextuelle du bouton (hors bulle), conformément à la spec.
5. **Helper pur `bulleAnnee.ts`** : extraction de la logique testable (libellé + règle de conflit), sur le
   patron `curationEdition.ts`, faute de harnais de test Leaflet dans le repo. L'interaction Leaflet elle-même
   n'est pas testée unitairement (aucun test de composant Leaflet n'existe dans le projet) ; elle est couverte
   par la règle pure + la séquence manuelle §6.

**B. DOUTES**
1. **Annonce lecteur d'écran de la bulle** (R2 Constat 2) : `role="status"` posé sur une région insérée déjà
   pleine → annonce non garantie sur tous les lecteurs d'écran. Hypothèse retenue : acceptable pour un outil
   interne pointer-driven ; la valeur reste atteignable au pointeur (desktop + tactile). À rouvrir si un besoin
   d'accessibilité clavier/SR de la carte émerge (chantier transverse, non ce lot).

**C. ÉCARTS DE CONFORMITÉ**
- Aucun. Golden 23/23 (inchangé), verdict/score non touchés, `ST_Force2D` présent, aucune variable de moteur
  introduite (la bulle n'a **aucune** variable de comportement en dur → rien à externaliser en config),
  lecture seule stricte, fichiers sensibles byte-unchanged, Gemini intouchés.

## 8. Confirmations finales

Aucune écriture en base · aucune migration · aucun DDL · aucun fichier moteur · aucun fichier Gemini ·
aucun commit (Arno commit lui-même, fichier par fichier).
