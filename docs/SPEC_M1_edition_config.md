# SPEC — Étape 4 : M1 édition de `config_scoring` depuis l'admin

> Spec EARS. **Livrable = cette spec, PAS du code.** RFC 2119. Produite via `/svav-specs`. À valider par
> Arno avant `/svav-build`. Cœur du **pilotage sans code** : rendre éditables les variables du moteur de
> score, pour un non-développeur, sans deploy.

## Besoin
Aujourd'hui (Étape 2) la page Pilotage affiche `config_scoring` en **lecture seule**. Étape 4 : rendre les
variables **VIVE** **éditables** depuis l'admin, avec **écriture directe** (validation puis sauvegarde
immédiate, PAS de brouillon/publication), en respectant les **statuts** (VIVE / VESTIGIALE / DE GARDE /
MIROIR) et sans jamais casser le moteur ni le golden.

## Recon confirmée (lecture seule, `fichier:ligne`)
- Route lecture existante : `app/(admin)/api/admin/config/route.ts` (`GET`, `server-only`, `query()` de
  `client.ts`, `evaluerRepli`). Page : `app/(admin)/admin/(protected)/pilotage/page.tsx`.
- Métadonnées existantes : `mappingConfig.ts` — `interface ColonneMeta { colonne, libelle, unite, famille,
  statut, defaut }` (`:15-27`), `META` (39 entrées, `:45`), statuts `StatutColonne` (`:13`).
- **Conditions de repli à NE JAMAIS provoquer** (`profilConfig.ts`) : ligne absente (`:74`) ;
  `mode_combinaison ∉ {max, addition, sequentiel}` (`:75`, `MODES_VALIDES :50`) ; `distance_max_m >
  analysis_range_m` (`:78`) ; exception (`:120`).
- **Golden déjà découplé** : le test lit `PROFIL_GOLDEN_REF` (fixture gelée dans `pipeline.itest.ts`), PAS
  la ligne live → une écriture admin sur `config_scoring id=1` **ne peut plus faire rougir**
  `test:integration` (acquis, Étape « découplage »).

## Périmètre
**DANS** : route d'**écriture** dédiée (`PATCH`/`PUT /api/admin/config`, server-only, sous garde `proxy.ts`)
faisant un **`UPDATE` de la ligne singleton `id=1`** ; **validation server-side** par variable + garde
anti-repli ; **édition dans la page Pilotage** (VIVE éditables, VESTIGIALE grisées, DE GARDE en liste
fermée, MIROIR éditable + note) ; **avertissement golden** informatif ; **journal d'écriture minimal**
(horodatage / variable / avant→après).
**HORS** : brouillon/publication en 2 temps ; versioning/rollback lourd ; l'aperçu d'impact golden (Étape
3) ; toute modif de `app/lib/svv`, du verdict, de `PROFIL_GOLDEN_REF`, du chemin de **lecture** prod.

## Rattachement aux invariants SVAV (garde-fous durs)
- **GOLDEN découplé (acquis) préservé** : après une écriture admin sur `id=1`, `npm run test:integration`
  DOIT rester **vert** (le test lit `PROFIL_GOLDEN_REF`, pas la ligne live). À vérifier en conformité.
- **MUST NOT toucher** : verdict, moteur `app/lib/svv/**`, `ST_Force2D`, Gemini, la **valeur** du golden,
  `PROFIL_GOLDEN_REF`, et le **chemin de lecture prod** (`profilConfig.ts` inchangé côté lecture).
- **ÉCRITURE = `UPDATE` de `id=1` UNIQUEMENT** ; **jamais** de `DROP`/`ALTER`/`DELETE`/`TRUNCATE` (Règle
  dure anti-suppression) ; les **5 vestigiales restent en base** (colonnes conservées).
- **PILOTAGE SANS CODE** : aucune variable de score en dur ; l'admin édite `config_scoring` au runtime.
- **Responsive / mobile-first** (CLAUDE.md §15) : formulaires d'édition utilisables sur iPhone portrait.

---

## Décisions arrêtées (Arno — ne pas rouvrir)
- **DA1 — Écriture DIRECTE** : validation puis sauvegarde immédiate. Route server-only dédiée
  (`PATCH`/`PUT /api/admin/config`), sous la garde admin (`proxy.ts`).
- **DA2 — Statuts à l'édition** : VIVE éditables (validation type+plage) ; VESTIGIALE grisées, NON
  éditables, + légende (présence en base, non-incidence sur le score) ; DE GARDE (`mode_combinaison`) =
  menu déroulant liste fermée `{max, addition, sequentiel}` ; MIROIR (`analysis_range_m`) éditable +
  mention « garde-fou, n'agit pas sur la géométrie ».
- **DA3 — Avertissement golden** : éditer une variable susceptible de déplacer le golden affiche
  « cette valeur déplacera le golden → recalcul + rescellage requis (protocole 2 commits) ».
  **Informatif, ne bloque pas** l'écriture.

---

## Options à trancher (listées + recommandation)

### (a) Où vivent les métadonnées d'édition par variable (type, min/max, pas, unité, statut, libellé, aide)
- **A1 — ÉTENDRE `mappingConfig.ts` (RECOMMANDÉE)** : ajouter à `ColonneMeta` les champs d'édition
  (`type: 'nombre'|'entier'|'enum'|'liste'`, `min?`, `max?`, `pas?`, `editable: boolean`, `aide?`). ✅
  **Source unique** partagée par l'affichage (Étape 2), le **formulaire client** ET la **validation
  serveur** (le module est plain TS, importable des deux côtés). DRY, cohérent avec « pas de constante
  dispersée ». ⚠️ Les **bornes** sont des **garde-fous de dev** (elles ne nourrissent PAS le moteur) →
  les garder en code **ne viole pas** « pilotage sans code » (qui vise les variables de *score*, en base).
- **A2 — Table DB dédiée `config_scoring_meta`** (bornes éditables via une future méta-admin) : ✅ méta
  elle-même pilotable. ⚠️ Migration + 2ᵉ table + **bornes devenues éditables** (risque : desserrer une
  borne de sécurité) + complexité. → Écartée pour l'Étape 4.
- **A3 — Nouveau module TS dédié** (séparé de `mappingConfig`) : équivalent à A1 en plus dispersé.

**RETENU (OQ1 tranché) : A1** — étendre `mappingConfig.ts` (source unique client+serveur : type, min/max,
pas, unité, statut, libellé, aide). Bornes = garde-fous de dev, pas des variables de score.

### (b) Comportement sur valeur invalide + anti-repli
- **B1 — REJET explicite (RECOMMANDÉE)** : SI la valeur (ou la ligne résultante) est invalide, la route
  répond **`422` + message clair**, **n'écrit rien**, et la page affiche l'erreur au champ. ✅ Un
  non-dev **voit** le refus. Écartés : **clamp silencieux** aux bornes (masque l'erreur), **accepter +
  avertir** (laisse passer une valeur hors plage).
- **B2 — Garde ANTI-REPLI (non négociable, intégrée à la validation)** : une écriture NE DOIT JAMAIS
  laisser la ligne dans un état qui **forcerait le repli** vers `PROFIL_DEGAGEMENT_DEFAUT`. La route valide
  la **ligne RÉSULTANTE** contre les 3 conditions de `profilConfig.ts` : `mode_combinaison ∈ liste` ;
  `distance_max_m ≤ analysis_range_m` (**validation croisée**) ; aucun `NOT NULL` violé. Rejet sinon.

---

## User stories
- **US1** — En tant qu'**opérateur (Arno)**, je veux **modifier une variable de scoring et l'enregistrer**
  depuis l'admin, afin d'ajuster le moteur **sans coder ni déployer**.
- **US2** — En tant qu'opérateur, je veux être **empêché de saisir une valeur invalide** (hors type/plage,
  ou qui casserait la config), afin de ne jamais dégrader le moteur par erreur.
- **US3** — En tant qu'opérateur, je veux **voir un avertissement quand mon édition peut déplacer le
  golden**, afin de savoir qu'un recalcul + rescellage sera requis.

---

## Exigences EARS

### T1 — Route d'écriture `PATCH /api/admin/config`
- **EX-1** [Ubiquitaire] Le système DOIT exposer une route d'écriture (`PATCH` ou `PUT`) à
  `/api/admin/config`, `server-only`, gardée par `proxy.ts` (sans session → 401).
- **EX-2** [Ubiquitaire] L'écriture DOIT être un **`UPDATE` de `config_scoring WHERE id = 1`** portant sur
  les seules colonnes soumises ; elle NE DOIT comporter aucun `INSERT`, `DELETE`, `DROP`, `ALTER`,
  `TRUNCATE`.
- **EX-3** [Ubiquitaire] La route DOIT réutiliser le client générique `app/lib/db/client.ts` (`query()`) et
  NE DOIT importer aucun `app/lib/svv/**` ni la logique métier de lecture (`profilConfig.ts`).
- **EX-4** [Événementiel] QUAND une écriture réussit, le système DOIT renvoyer la **ligne mise à jour**
  (ou un `ok`) permettant à la page de rafraîchir l'affichage et le badge « profil actif / repli ».

### T2 — Validation server-side (type, plage, statut, anti-repli)
- **EX-5** [Ubiquitaire] La route DOIT **valider côté serveur** chaque valeur soumise contre sa métadonnée
  (type, min, max, liste fermée) — la validation client n'est jamais la seule barrière.
- **EX-6** [Indésirable] SI une valeur soumise viole son type ou sa plage, ALORS le système DOIT **rejeter
  l'écriture** (`422` + message identifiant la variable et la contrainte), **sans rien écrire**.
- **EX-7** [MUST NOT] Le système NE DOIT PAS accepter d'écriture sur une colonne **VESTIGIALE**
  (`boost_f2`, `forfait_cone_central`, `forfait_extremites`, `cone_f3_demi_angle_deg`,
  `natures_remarquables`) ni sur `id` (technique).
- **EX-8** [Indésirable] SI `mode_combinaison` soumis n'est pas dans `{max, addition, sequentiel}`, ALORS
  le système DOIT **rejeter** l'écriture (`422`).
- **EX-9** [Indésirable] SI la ligne **résultante** violerait une condition de repli de `profilConfig.ts`
  (`mode_combinaison` hors liste ; `distance_max_m > analysis_range_m` ; un `NOT NULL` vidé), ALORS le
  système DOIT **rejeter** l'écriture (`422`) — **jamais** laisser la ligne dans un état de repli
  silencieux.
- **EX-10** [Ubiquitaire] La validation croisée `distance_max_m ≤ analysis_range_m` DOIT porter sur les
  **valeurs finales** (soumises + existantes) de la ligne.

### T3 — Édition dans la page Pilotage
- **EX-11** [Ubiquitaire] Pour chaque variable **VIVE**, la page DOIT offrir un champ éditable adapté au
  type (nombre/entier avec min/max/pas) et un moyen d'**enregistrer**.
- **EX-12** [Ubiquitaire] Les variables **VESTIGIALES** DOIVENT être affichées **grisées, non éditables**,
  avec une **légende** expliquant leur présence en base et leur **non-incidence** sur le score.
- **EX-13** [Ubiquitaire] `mode_combinaison` (DE GARDE) DOIT être édité via un **menu déroulant** à liste
  fermée `{max, addition, sequentiel}` (aucune saisie libre).
- **EX-14** [Ubiquitaire] `analysis_range_m` (MIROIR) DOIT être éditable **avec la mention** « garde-fou
  (n'agit pas sur la géométrie) ».
- **EX-15** [Indésirable] SI la route rejette l'écriture (EX-6/8/9), ALORS la page DOIT afficher le
  **message d'erreur** au champ concerné et **ne pas** présenter la valeur comme enregistrée.
- **EX-16** [Ubiquitaire] La page NE DOIT proposer **aucun** mécanisme de brouillon/publication (écriture
  directe, DA1).
- **EX-17** [Ubiquitaire] Les formulaires d'édition DOIVENT rester utilisables en **portrait smartphone**
  (375 px), sans débordement horizontal (CLAUDE.md §15).

### T4 — Avertissement golden (informatif)
- **EX-18** [Événementiel] QUAND l'opérateur édite **toute variable VIVE ou MIROIR**, le système DOIT
  afficher un **avertissement** « cette valeur déplacera le golden → recalcul + rescellage requis
  (protocole 2 commits) » (OQ4 : conservateur, sans dépendance à un aperçu d'impact).
- **EX-19** [Ubiquitaire] L'avertissement EX-18 DOIT être **purement informatif** : il NE DOIT PAS bloquer
  l'écriture.

### T5 — Découplage golden & prod (à préserver / vérifier)
- **EX-20** [Ubiquitaire] Après une écriture admin sur `config_scoring id=1`, `npm run test:integration`
  DOIT rester **vert** (`29.107259068449615`), le golden lisant `PROFIL_GOLDEN_REF` (fixture gelée).
- **EX-21** [Ubiquitaire] Le chemin de **lecture prod** (`chargerProfilDegagement`/`profilConfig.ts`) DOIT
  rester **inchangé** ; une analyse réelle postérieure DOIT lire la **nouvelle** valeur écrite.
- **EX-22** [MUST NOT] Le chantier NE DOIT modifier ni `app/lib/svv/**`, ni le verdict, ni `ST_Force2D`,
  ni Gemini, ni `PROFIL_GOLDEN_REF`, ni la valeur du golden.

### T3b — Enregistrement de la paire liée `distance_max_m ↔ analysis_range_m` (OQ3)
- **EX-23** [Complexe] QUAND l'opérateur édite `distance_max_m` OU `analysis_range_m`, le système DOIT les
  enregistrer **EN GROUPE** (les deux valeurs finales soumises ensemble) et valider `distance_max_m ≤
  analysis_range_m` sur l'**état RÉSULTANT**, jamais sur un état mi-chemin. Toute autre variable
  s'enregistre **par variable**.

### T6 — Journal d'écriture minimal (OQ5)
- **EX-24** [Événementiel] QUAND une écriture réussit, le système DOIT consigner une **entrée de journal**
  minimale : horodatage, colonne(s) modifiée(s), valeur **avant → après**.
- **EX-25** [Ubiquitaire] Le journal DOIT être **append-only** (aucun versioning/rollback, aucune donnée
  personnelle) ; sa table DOIT être créée par **migration `CREATE TABLE`** (jamais de `DROP/ALTER` d'une
  table existante).

---

## Découpe + conformité (vérifiable)
| Tâche | Contenu | Critère de conformité |
|---|---|---|
| **T1** | Métadonnées d'édition (A1 : étendre `mappingConfig.ts`) | `ColonneMeta` porte `type/min/max/pas/editable` pour les 39 colonnes ; VESTIGIALES/id → `editable:false`. |
| **T2** | Route `PATCH /api/admin/config` server-only | `curl` avec session : bonne valeur → `200` + ligne MAJ ; sans session → `401` ; **grep** : `UPDATE … id=1` seul, aucun `DELETE/DROP/ALTER/INSERT/TRUNCATE`, aucun import `app/lib/svv`/`profilConfig`. |
| **T2b** | Validation + anti-repli | Valeur hors plage → `422` + message ; VESTIGIALE → `422` ; `mode_combinaison='xyz'` → `422` ; `distance_max_m > analysis_range_m` (résultant) → `422` ; aucune écriture dans ces cas. |
| **T3** | UI édition | VIVE éditables ; VESTIGIALES grisées + légende ; `mode_combinaison` = select ; `analysis_range_m` note garde-fou ; erreur affichée au champ ; responsive 375 px ; aucun brouillon. |
| **T4** | Avertissement golden | Bandeau informatif à l'édition d'une variable golden-sensible ; n'empêche pas l'enregistrement. |
| **Conformité SVAV** | Non-régression | **`test:integration` VERT** (`29.107259068449615`) **après une écriture** ; `profilConfig.ts` inchangé (lecture prod) ; aucun fichier `app/lib/svv`/verdict/Gemini/`PROFIL_GOLDEN_REF` touché ; `UPDATE id=1` seul (jamais DROP/ALTER). |

## Cas de test explicites exigés
| Scénario | Attendu |
|---|---|
| Édition VIVE **valide** (ex. `plafond_degagement` 80→85, dans la plage) | `200`, ligne MAJ, `GET` reflète 85, badge repli reste « actif » |
| Édition VIVE **invalide** (hors plage, ou type non numérique) | `422` + message ; **aucune écriture** ; valeur en base inchangée |
| Écriture d'une **VESTIGIALE** (`boost_f2`) | `422` (non éditable) ; grisée côté UI |
| `mode_combinaison` = valeur **hors liste** | `422` (rejet) ; le select empêche la saisie côté UI |
| `distance_max_m` porté **> `analysis_range_m`** (résultant) | `422` (anti-repli) + message ; aucune écriture |
| **Après** une écriture VIVE, `npm run test:integration` | **golden VERT** (`29.107259068449615`) — découplage préservé |
| **Analyse prod** après écriture (sans `profil`) | lit la **nouvelle** valeur (lecture live inchangée) |
| `distance_max_m` + `analysis_range_m` édités **en groupe** (résultat `dmax ≤ portée`) | `200` (accepté) ; l'un sans l'autre menant à `dmax > portée` → `422` (jamais d'état mi-chemin) |
| Écriture VIVE **réussie** | une **entrée de journal** (horodatage, variable, avant→après) est créée |

---

## Arbitrages (OQ1–OQ5 — TRANCHÉS)
- **OQ1 — TRANCHÉ : A1** — métadonnées d'édition en **étendant `mappingConfig.ts`** (source unique
  client+serveur : type, min/max, pas, unité, statut, libellé, aide). Bornes = garde-fous de dev, pas des
  variables de score. → T1.
- **OQ2 — TRANCHÉ : B1** — valeur invalide → **rejet `422` + message explicite**, jamais de clamp
  silencieux. Garde anti-repli (B2) **non négociable**. → EX-6 / EX-9.
- **OQ3 — TRANCHÉ** : sauvegarde **PAR VARIABLE**, **SAUF** la paire `distance_max_m ↔ analysis_range_m`
  enregistrée **EN GROUPÉ** (validation croisée sur l'état résultant, jamais mi-chemin). → EX-23.
- **OQ4 — TRANCHÉ** : avertissement golden sur **TOUTE variable VIVE/MIROIR** (conservateur, sans
  dépendance à un aperçu d'impact). Informatif, ne bloque pas. → EX-18 / EX-19.
- **OQ5 — TRANCHÉ** : **journal d'écriture minimal** (horodatage, variable, avant→après), **append-only,
  pas de versioning**. → T6 (EX-24 / EX-25).

*Spec **FIGÉE**. Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO) viendra sur cette
base validée.*
