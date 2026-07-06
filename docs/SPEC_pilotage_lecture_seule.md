# SPEC — Étape 2 : M1 Pilotage en LECTURE SEULE (affichage `config_scoring`)

> Spec EARS pour l'Étape 2 du `PLAN_INTERFACE_INTERNE.md` (module M1, volet lecture seule). **Livrable =
> cette spec, PAS du code.** RFC 2119. Produite via `/svav-specs`. À valider par Arno — en particulier
> le **mapping colonne → famille / label / unité** (§Mapping proposé) — avant tout `/svav-build`.

## Besoin
Afficher, dans la page Pilotage de l'admin (`app/(admin)/admin/(protected)/pilotage/page.tsx`,
aujourd'hui placeholder), les **46 colonnes du singleton `config_scoring` (id=1)**, **en LECTURE SEULE
stricte** : regroupées par famille, chaque variable avec un label + unité lisibles, son **nom de colonne
technique** visible, son statut, sa valeur actuelle et son défaut. Aucune édition.

## Périmètre
**DANS** : route API `GET /api/admin/config` (server-only, SELECT seul), affichage groupé/formaté dans la
page Pilotage, responsive.
**HORS** : toute écriture (`INSERT/UPDATE/DELETE`), tout champ éditable / bouton « enregistrer », l'aperçu
d'impact golden, le versioning/audit (= Étape 4). Aucun accès moteur.

## Rattachement aux invariants SVAV (garde-fous durs)
- **LECTURE SEULE ABSOLUE** : uniquement `SELECT`. Aucun `INSERT/UPDATE/DELETE`, aucun champ éditable,
  aucun bouton save.
- **ISOLATION** : aucun import de `app/lib/svv/**` (moteur) ni de la logique métier DB
  (`profilConfig.ts`, `pipeline.ts`, `obstacles.ts`, `faisceaux.ts`, `origine.ts`, `hauteurLidar.ts`).
  `server-only` sur la route et ses helpers.
- **GOLDEN INTOUCHABLE** : aucun fichier moteur / DB-écriture / migration / golden touché ; `test:integration`
  reste vert (`29.107259068449615`).
- **GEMINI hors staging** : `adaptateurIaPhoto.ts`, `analyse-photo/route.ts` non touchés.
- **Responsive §15** : le tableau des 46 variables DOIT être lisible et utilisable sur iPhone portrait.
- **`prefers-reduced-motion`** respecté (pas d'animation superflue).

---

## Décisions verrouillées (Arno — ne pas re-questionner)
- **D1 — Route API dédiée** : `app/(admin)/api/admin/config/route.ts`, `server-only`, **`GET`** unique,
  **`SELECT` seul** sur `config_scoring WHERE id=1`. Pose la frontière réutilisable pour un futur
  M1-édition (Étape 4) — l'édition n'est PAS implémentée ici.
- **D2 — Regroupement PAR FAMILLE** à l'affichage, reflétant les familles réelles des 46 colonnes
  (voir §Mapping proposé — à valider).
- **D3 — Label + unité lisibles** pour chaque variable, **AVEC le nom de colonne technique conservé et
  visible à côté** (traçabilité : un label ne masque jamais la vraie variable).

---

## User stories
- **US1** — En tant qu'**opérateur (Arno)**, je veux **voir toutes les variables du moteur de score et
  leurs valeurs actuelles**, afin de comprendre la configuration en vigueur sans ouvrir la base.
- **US2** — En tant qu'opérateur, je veux les variables **regroupées par famille** avec un **libellé
  clair + l'unité**, afin de m'y retrouver sans connaître les noms techniques.
- **US3** — En tant qu'opérateur, je veux **voir le nom de colonne technique** à côté de chaque libellé,
  afin de garder la traçabilité exacte vers la base.
- **US4** — En tant qu'opérateur sur **smartphone**, je veux consulter cette configuration **en portrait**
  sans débordement, afin de la vérifier en mobilité.

---

## Exigences EARS

### T1 — Route API `GET /api/admin/config` (lecture seule)
- **EX-1** [Ubiquitaire] Le système DOIT exposer une route **`GET`** à `/api/admin/config` renvoyant les
  **46 colonnes** de `config_scoring` pour `id=1`.
- **EX-2** [Ubiquitaire] La route DOIT n'exécuter qu'un **`SELECT`** ; elle NE DOIT comporter aucun
  `INSERT`, `UPDATE`, `DELETE`, ni aucune autre méthode HTTP (`POST/PUT/PATCH/DELETE`).
- **EX-3** [Ubiquitaire] La route DOIT porter `import 'server-only'` et NE DOIT importer aucun fichier de
  `app/lib/svv/**` ni de logique métier DB (`profilConfig`, `pipeline`, `obstacles`, `faisceaux`,
  `origine`, `hauteurLidar`). Elle **PEUT** réutiliser le client pg générique `app/lib/db/client.ts`
  (`query()`) en **LECTURE SEULE** (OQ2 tranché : le pool générique n'est pas de la logique métier).
- **EX-4** [Ubiquitaire] La route DOIT être **gardée** (déjà couverte par `proxy.ts` sur `/api/admin/**` :
  sans session → 401).
- **EX-5** [Indésirable] SI la ligne `id=1` est **absente**, ALORS la route DOIT renvoyer un état explicite
  (`{ present: false }`, HTTP 200) plutôt qu'une erreur serveur.
- **EX-6** [Indésirable] SI l'accès à la base **échoue**, ALORS la route DOIT renvoyer une **erreur
  maîtrisée** (HTTP 503 + message court) sans faire planter la page.
- **EX-7** [Ubiquitaire] La réponse DOIT véhiculer, pour chaque colonne, sa **valeur actuelle** brute
  (sans arrondi), y compris `mode_combinaison` (texte) et `natures_remarquables` (liste).

### T2 — Affichage dans la page Pilotage
- **EX-8** [Ubiquitaire] La page Pilotage DOIT afficher les 46 variables **regroupées par famille** (D2),
  chaque famille sous un intitulé.
- **EX-9** [Ubiquitaire] Pour chaque variable, la page DOIT afficher : **libellé lisible**, **unité**,
  **nom de colonne technique**, **statut** (VIVE / VESTIGIALE / DE GARDE / MIROIR / technique), **valeur
  actuelle**, **valeur par défaut**.
- **EX-10** [Ubiquitaire] La page NE DOIT présenter **aucun champ éditable** ni **aucun bouton
  d'enregistrement** : tout est en lecture seule (EX-10 verrouille la LECTURE SEULE côté UI).
- **EX-11** [Ubiquitaire] Les variables **VESTIGIALES** DOIVENT être visuellement distinguées (grisées /
  mention « sans effet ») ; la variable **DE GARDE** (`mode_combinaison`) DOIT indiquer sa **liste fermée**
  `{max, addition, sequentiel}` ; la variable **MIROIR** (`analysis_range_m`) DOIT indiquer qu'elle est un
  **garde-fou** (ne re-cadre pas la géométrie).
- **EX-12** [Ubiquitaire] Le **nom de colonne technique** DOIT rester visible en toutes circonstances
  (jamais masqué par le libellé) — D3.
- **EX-13** [Indésirable] SI la route renvoie `{ present:false }` (EX-5) ou une erreur (EX-6), ALORS la
  page DOIT afficher un **message clair** (« profil non initialisé » / « configuration indisponible »),
  pas un tableau vide silencieux.
- **EX-14** [Ubiquitaire] La page DOIT réutiliser les **design tokens SVAV** (`.svv-*`, `--color-svv-*`),
  sans nouvelle palette.

### T3 — Responsive & accessibilité
- **EX-15** [Ubiquitaire] À **375 px** (iPhone portrait), le contenu DOIT rester lisible **sans débordement
  horizontal** ; les variables denses DOIVENT se replier (cartes/accordéons par famille ou tableau à
  défilement maîtrisé), jamais un tableau qui déborde illisiblement.
- **EX-16** [Conditionnel] TANT QUE l'utilisateur a activé `prefers-reduced-motion`, le système NE DOIT
  déclencher **aucune animation** non essentielle.

### T4 — Indicateur « profil actif vs repli » (RETENU — OQ3 tranché)
- **EX-17** [Ubiquitaire] La page DOIT signaler si la configuration en base est **réellement active** ou si
  le moteur **retomberait sur le défaut** (repli), en re-vérifiant en LECTURE SEULE les **3 conditions de
  repli** (`id=1` présent ; `mode_combinaison ∈ {max,addition,sequentiel}` ; `distance_max_m ≤
  analysis_range_m`) — **sans** importer `profilConfig.ts` (réplication locale des 3 checks, aucune
  logique métier importée).

### T2b — Rendu des cas particuliers
- **EX-18** [Ubiquitaire] Les 8 colonnes `orientation_n … orientation_no` DOIVENT être présentées **côte à
  côte** comme un **barème unique** (secteurs N, NE, E, SE, S, SO, O, NO), pas en 8 lignes isolées.
- **EX-19** [Ubiquitaire] La variable `couloir_malus_pct` DOIT afficher la **fraction brute ET** son
  équivalent lisible, au format « 0,01 (= 1 %/faisceau) » (unité : fraction 0–1).
- **EX-20** [Ubiquitaire] Les colonnes **non numériques** DOIVENT s'afficher sans casser le rendu :
  `mode_combinaison` (texte) et `natures_remarquables` (liste de textes) sont rendus tels quels ; la
  valeur brute est véhiculée **sans arrondi** (EX-7).
- **EX-21** [Ubiquitaire] La page DOIT signaler que `config_scoring` ne couvre que la **Couche 1
  (dégagement)** : les variables de **Couche 2 (photo/paysage) sont en dur dans `config.ts`** et **non
  pilotables** ici (OQ5 tranché — aucune famille « paysage »).

---

## Découpe en tâches + critères de conformité (vérifiables)
| Tâche | Contenu | Critère de conformité |
|---|---|---|
| **T1** | Route `GET /api/admin/config` server-only, SELECT id=1 | `curl` avec session → 200 + 46 champs ; sans session → 401 ; **grep** : aucun `INSERT/UPDATE/DELETE` dans la route, aucun import `app/lib/svv` ni métier DB ; méthode POST/PUT/PATCH/DELETE absente. |
| **T2** | Affichage groupé + formaté | Les 46 colonnes rendues, groupées par famille ; chaque ligne = libellé + unité + **nom technique** + statut + valeur + défaut ; **aucun** `<input>/<button save>` (grep DOM) ; tokens `svv-*` présents. |
| **T3** | Responsive + reduced-motion | À 375 px : pas de scroll horizontal ; repli cartes/accordéons ; `@media (prefers-reduced-motion)` neutralise les anims. |
| **T4** | (option) État profil | Si retenu : l'indicateur reflète les 3 conditions de repli, en lecture seule, sans import `profilConfig`. |
| **Conformité SVAV** | Zéro régression | **Golden vert** (`test:integration`, `29.107259068449615`) ; aucun fichier moteur/DB-écriture/migration touché ; Gemini intacts ; **aucune écriture** en base (la route est `SELECT`-only). |

---

## Mapping proposé (colonne → famille / libellé / unité / statut) — **À VALIDER PAR ARNO**
> Dérivé du schéma réel (recon) + `profilDegagement.ts` + arbre M1 du `PLAN §D.1`. **Hypothèse ouverte :
> valide/corrige avant build.** Statuts : 🟢 VIVE · ⚪ VESTIGIALE · 🔒 DE GARDE · ↔ MIROIR · 🔑 technique.

**Famille 0 — Technique**
| Colonne | Libellé | Unité | Statut |
|---|---|---|---|
| `id` | Identifiant du profil (singleton) | — (=1) | 🔑 |

**Famille 1 — Distance perçue : base & nature**
| `boost_f4` | Boost « nature traversée » (F4) | coefficient (m perçus / m de nature) | 🟢 |
| `distance_max_m` | Plafond de distance perçue par faisceau | mètres | 🟢 |

**Famille 2 — Barème par famille de bâtiment**
| `cone_famille_demi_angle_deg` | Demi-angle du cône (cône vs flanc) | degrés | 🟢 |
| `mondial_faisceau_m` | Faisceau fixe — Patrimoine mondial | mètres | 🟢 |
| `mh_cone` / `mh_flanc` | Coeff Monument Historique — cône / flanc | coefficient (×) | 🟢 |
| `mh_distmax_m` | Cap de distance — Monument Historique | mètres | 🟢 |
| `inv_cone` / `inv_flanc` / `inv_distmax_m` | Inventaire — cône / flanc / cap | × / × / mètres | 🟢 |
| `a1900_cone` / `a1900_flanc` / `a1900_distmax_m` | Bâti ≤ 1900 — cône / flanc / cap | × / × / mètres | 🟢 |
| `a1935_cone` / `a1935_flanc` / `a1935_distmax_m` | Bâti 1901–1935 — cône / flanc / cap | × / × / mètres | 🟢 |
| `borne_annee_1900` | Borne haute — famille « ≤ 1900 » | année | 🟢 |
| `borne_annee_1935` | Borne haute — famille « 1901–1935 » | année | 🟢 |

**Famille 3 — Cumul nature + bâti**
| `cumul_seuil_min_m` | Nature min. pour déclencher le diviseur | mètres | 🟢 |
| `cumul_base_m` | Base du palier de diviseur | mètres | 🟢 |
| `cumul_pas_m` | Pas d'un palier | mètres | 🟢 |
| `cumul_increment` | Incrément de diviseur par palier | sans unité | 🟢 |
| `cumul_plafond` | Diviseur maximal | sans unité | 🟢 |
| `cumul_cap_p1_m` | Cap de la Partie 1 (nature classique) | mètres | 🟢 |

**Famille 4 — Malus couloir**
| `couloir_seuil_lateral_m` | Seuil latéral « longe l'axe » | mètres | 🟢 |
| `couloir_fenetre_condition_n` | Fenêtre d'enclenchement | nb de faisceaux | 🟢 |
| `couloir_tolerance_bord_n` | Tolérance de bord | nb de faisceaux | 🟢 |
| `couloir_malus_pct` | Malus par faisceau de la chaîne — afficher « 0,01 (= 1 %/faisceau) » | **fraction (0–1)** | 🟢 |

**Famille 5 — Normalisation, orientation & plafonds**
| `plafond_degagement` | Coefficient d'échelle du dégagement (×80) — **jamais « plafond »** | points (échelle) | 🟢 |
| `orientation_n … orientation_no` (×8) | Barème d'orientation par secteur — **8 valeurs côte à côte** (N,NE,E,SE,S,SO,O,NO) | points (0–10) | 🟢 |
| `plafond_couche1` | **Plafond final de la note (clamp)** | points | 🟢 |

> **Note C1 — ne pas confondre** : `plafond_degagement` pilote l'**échelle ×80** (coefficient
> d'amplification), tandis que `plafond_couche1` est le **clamp final dur** de la note (≤ 90). Deux
> variables DISTINCTES ; le libellé de `plafond_degagement` ne doit jamais employer le mot « plafond ».

**Famille 6 — Portée & garde-fou**
| `analysis_range_m` | Portée d'analyse — **garde-fou seul** (`distance_max_m ≤ …`) ; n'agit PAS sur la géométrie | mètres | ↔ |

**Famille 7 — Mode de combinaison (de garde)**
| `mode_combinaison` | Mode de combinaison des familles | liste fermée `{max, addition, sequentiel}` | 🔒 |

**Famille 8 — Héritage (variables mortes depuis l'Étape 2 du scoring)**
| `boost_f2` | Ex-boost bâti < 1900 (F2) | coefficient — **sans effet** | ⚪ |
| `forfait_cone_central` | Ex-forfait remarquable — cône (F3) | mètres — **sans effet** | ⚪ |
| `forfait_extremites` | Ex-forfait remarquable — flancs (F3) | mètres — **sans effet** | ⚪ |
| `cone_f3_demi_angle_deg` | Ex-demi-angle cône F3 | degrés — **sans effet** | ⚪ |
| `natures_remarquables` | Ex-libellés natures remarquables (F3) | liste de textes — **sans effet** | ⚪ |

Récapitulatif : **~38 🟢 VIVES · 5 ⚪ VESTIGIALES · 1 🔒 DE GARDE · 1 ↔ MIROIR · 1 🔑 technique = 46.** ✅

---

## Arbitrages (OQ1–OQ5 — TRANCHÉS)
- **OQ1 — Mapping VALIDÉ** (corrections C1/C2/C3 appliquées ci-dessus) : familles, libellés, unités,
  statuts **figés**. Le mapping label/unité/famille vit dans une table de correspondance côté UI.
- **OQ2 — TRANCHÉ** : la route réutilise `app/lib/db/client.ts` (`query()`) en **LECTURE SEULE**.
  L'isolation ne vise que `app/lib/svv` + modules métier DB, pas le pool pg générique. (Le rôle DB dédié
  du PLAN §B = écritures, Étape 4.) → EX-3.
- **OQ3 — TRANCHÉ : indicateur « profil actif vs repli » RETENU** dès l'Étape 2 (3 conditions re-vérifiées
  en lecture seule, sans importer `profilConfig.ts`). → T4 / EX-17.
- **OQ4 — TRANCHÉ** (libellés corrigés dans le mapping) : `plafond_degagement` = « Coefficient d'échelle
  (×80) », jamais « plafond » (C1) ; `couloir_malus_pct` = fraction affichée « 0,01 (= 1 %/faisceau) »
  (C2) ; `analysis_range_m` = garde-fou seul, n'agit pas sur la géométrie. → mapping + EX-19.
- **OQ5 — TRANCHÉ : aucune famille « paysage »** ; l'UI signale que `config_scoring` = Couche 1 seule, la
  Couche 2 étant en dur dans `config.ts` (non pilotable ici). → EX-21.
- **C3 — orientation** : les 8 `orientation_*` affichées **côte à côte** (barème unique). → EX-18 + mapping.

*Spec **FIGÉE** (arbitrages intégrés). Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO)
viendra sur cette base validée.*
