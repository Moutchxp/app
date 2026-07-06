# SPEC — Découplage du test golden de la config live éditable

> Spec EARS. **Livrable = cette spec, PAS du code.** RFC 2119. Produite via `/svav-specs`. À valider par
> Arno avant `/svav-build`. Prérequis de l'**Étape 4 (M1 édition)** : rendre l'alarme golden fiable malgré
> l'édition admin de `config_scoring`.

## Besoin
Le test d'intégration du golden rejoue Asnières via `analyserAdresse`, qui **lit la ligne live
`config_scoring id=1`** — la même que l'admin éditera (Étape 4). Conséquence : éditer une variable VIVE
utilisée par Asnières **ferait rougir le golden** (fausse alarme). But : le golden doit lire une **config
gelée de référence**, séparée de la ligne éditable, pour rester une alarme fiable de **régression de code**
sans être perturbé par le **pilotage sans code**.

## Recon confirmée (lecture seule, `fichier:ligne`)
- Le golden appelle `analyserAdresse({...})` **sans profil** — `pipeline.itest.ts:20` — et assère
  `score.total` `toBeCloseTo(29.107259068449615, 3)` — `pipeline.itest.ts:42`.
- `analyserAdresse` charge le profil **lui-même** : `const profil = await chargerProfilDegagement();` —
  `pipeline.ts:174` — puis `analyser(entree, profil)` — `pipeline.ts:175`.
- `chargerProfilDegagement` fait `SELECT … FROM config_scoring WHERE id = 1` — `profilConfig.ts:71` ;
  repli `PROFIL_DEGAGEMENT_DEFAUT` si ligne absente / `mode_combinaison` invalide / `distance_max_m >
  analysis_range_m` / exception — `profilConfig.ts:74,75,78,118-121`.
- `ParametresAnalyse` a déjà des champs **optionnels** (`paysage?`, `mode?`, `hauteurSousPlafondM?`) —
  `pipeline.ts:67-75` — point d'injection naturel.
- Le **seed** de `db/migrations/003_config_scoring_create.sql` = valeurs de `PROFIL_DEGAGEMENT_DEFAUT`
  (`profilDegagement.ts:96-132`) = **ligne live actuelle** → aujourd'hui, live == défaut == config qui
  scelle le golden.

## Périmètre
**DANS** : (1) une **config gelée de référence** ; (2) l'**injection** de ce profil dans le test golden ;
(3) l'ajout d'un **point d'injection optionnel** dans `analyserAdresse` (défaut = comportement actuel).
**HORS** : le verdict, le moteur géométrique (`app/lib/svv/**`), la construction de `EntreeComplete`, le
loader `chargerProfilDegagement` (inchangé), Gemini, `ST_Force2D`, le chemin de prod.

## Invariants SVAV (garde-fous durs)
- **VALEUR DU GOLDEN INVIOLABLE** : reste `29.107259068449615`, **vert**, **AUCUN rescellage**. La config
  gelée = **snapshot EXACT** des valeurs qui scellent le golden aujourd'hui. Mêmes inputs (géométrie
  Asnières, inchangée) + mêmes valeurs → même nombre. SI l'injection de la référence gelée ne reproduit
  PAS `29.107259068449615` → **STOP, ne rien resceller, signaler** (le snapshot ne correspond pas).
- **CHEMIN PROD INCHANGÉ** : `/api/analyse` et `/api/analyse-photo` continuent d'appeler `analyserAdresse`
  **sans** profil → lecture live `config_scoring id=1` via le chemin actuel. Zéro changement de
  comportement en prod (l'admin pilote toujours la prod en éditant `id=1`).
- **PILOTAGE SANS CODE préservé** : la référence gelée ne remplace PAS le loader live ; elle ne concerne
  QUE le test golden. L'édition admin agit toujours sur la prod (via `id=1`).
- **Séparation verdict/score** : le verdict reste décidé sur `distanceM` **brut** ; le découplage ne touche
  que la source du profil de score dans le test.
- Ne touche NI `app/lib/svv/**`, NI Gemini, NI `ST_Force2D`, NI la géométrie.

---

## User story
- **US1** — En tant que **mainteneur / Arno**, je veux que le **golden reste vert quand j'édite une
  variable de `config_scoring` depuis l'admin**, afin que `test:integration` reste une alarme fiable de
  régression de CODE (et non une fausse alarme déclenchée par mes réglages de pilotage sans code).

---

## Mécanisme — options à trancher

### (a) Emplacement de la config gelée de référence
- **A1 — Fixture codée immuable DÉDIÉE au golden (RECOMMANDÉE)** : une constante TS figée (ex.
  `PROFIL_GOLDEN_REF`) = snapshot des 46 valeurs actuelles, co-localisée avec le test (ou un module de
  fixtures de test). ✅ Immuable par construction · hors DB · non éditable par l'admin · reproductible ·
  **découplée de `PROFIL_DEGAGEMENT_DEFAUT`** (dont la vocation est le *repli*, susceptible d'évoluer).
  ⚠️ Duplique les valeurs — mais c'est **voulu** (un snapshot figé) ; à ne re-synchroniser QUE lors d'un
  rescellage **volontaire** du golden (commit séparé).
- **A1-bis — Réutiliser `PROFIL_DEGAGEMENT_DEFAUT`** (au lieu d'une constante dédiée) : ✅ DRY.
  ⚠️ **Couple le golden à l'évolution du profil de REPLI** : si on retune un jour le défaut de repli, le
  golden bougerait silencieusement. → **Déconseillé** ; garder une constante golden **séparée** (même si
  identique aujourd'hui).
- **A2 — Ligne DB dédiée non éditable** (ex. table `config_scoring_golden`, car `config_scoring` a un
  `CHECK (id = 1)` → pas de 2e ligne possible) : ✅ cohérent avec le mapping du loader. ⚠️ Migration +
  nouvelle table + garde que l'admin ne l'édite jamais + le test **dépend encore d'une DB éditable** (moins
  hermétique) + risque de repli si valeur invalide. → **Déconseillé** (plus lourd, moins sûr).

**RETENU (OQ1 tranché) : A1** — fixture codée dédiée immuable `PROFIL_GOLDEN_REF`, séparée de
`PROFIL_DEGAGEMENT_DEFAUT`.

### (b) Injection dans `analyserAdresse`
- **B1 — Champ optionnel `profil?: ProfilDegagement` dans `ParametresAnalyse` (RECOMMANDÉE)** : à
  `pipeline.ts:174`, `const profil = params.profil ?? await chargerProfilDegagement();`. Prod : **aucun**
  site ne passe `profil` → comportement identique (live). Golden : passe `PROFIL_GOLDEN_REF`. ✅
  Chirurgical (1 champ + 1 `??`), zéro changement prod, testable. ⚠️ Une voie d'injection existe désormais
  — à documenter et vérifier par grep qu'aucun appel prod ne l'utilise.
- **B2 — 2ᵉ paramètre `analyserAdresse(params, profilOverride?)`** : équivalent, choix cosmétique.
- **B3 — Extraire la construction de `EntreeComplete` + appeler `analyser(entree, PROFIL_GOLDEN_REF)`
  directement dans le test** : ✅ le plus hermétique, mais ⚠️ **refactor plus large** (exposer les étapes
  a-f de `analyserAdresse`). → Écarté pour ce chantier.

**RETENU (OQ2 tranché) : B1** — champ optionnel `profil?` dans `ParametresAnalyse` ;
`params.profil ?? await chargerProfilDegagement()` à `pipeline.ts:174`.

---

## Exigences EARS

### T1 — Config gelée de référence
- **EX-1** [Ubiquitaire] Le système DOIT fournir une **config de référence gelée** (`PROFIL_GOLDEN_REF`),
  immuable, contenant le snapshot EXACT des valeurs de scoring qui scellent le golden.
- **EX-2** [Ubiquitaire] `PROFIL_GOLDEN_REF` DOIT être **indépendante de la table `config_scoring`** (non
  lue depuis la DB, non éditable par l'admin).
- **EX-3** [Ubiquitaire] `PROFIL_GOLDEN_REF` DOIT être **distincte** de `PROFIL_DEGAGEMENT_DEFAUT` (même
  valeur aujourd'hui, mais découplée de l'évolution future du profil de repli).

### T2 — Point d'injection dans `analyserAdresse`
- **EX-4** [Ubiquitaire] `analyserAdresse` DOIT accepter un profil **optionnel** ; QUAND il est fourni, la
  fonction DOIT l'utiliser directement au lieu de `chargerProfilDegagement()`.
- **EX-5** [Indésirable] SI aucun profil n'est fourni, ALORS `analyserAdresse` DOIT lire la config **live**
  via `chargerProfilDegagement()` (`profilConfig.ts:57`) — comportement **strictement identique** à
  aujourd'hui.
- **EX-6** [Ubiquitaire] Le loader `chargerProfilDegagement` et le mapping `config_scoring` DOIVENT rester
  **inchangés**.

### T3 — Test golden branché sur la référence gelée
- **EX-7** [Ubiquitaire] Le test golden (`pipeline.itest.ts`) DOIT passer `PROFIL_GOLDEN_REF` à
  `analyserAdresse` pour le rejeu Asnières (au lieu de laisser lire la config live).
- **EX-8** [Ubiquitaire] Le test golden DOIT continuer d'asserter `score.total` `toBeCloseTo(29.107259068449615, 3)`
  (`pipeline.itest.ts:42`), **inchangé**.
- **EX-9** [Ubiquitaire] Les assertions de **verdict** (`SANS_VIS_A_VIS`, `distanceM` 42,10, source LiDAR,
  altitude) DOIVENT rester inchangées (elles dépendent de la géométrie DB, pas du profil).

### T4 — Garde d'égalité (anti-dérive du snapshot)
- **EX-10** [Ubiquitaire] Un test DOIT vérifier que l'injection de `PROFIL_GOLDEN_REF` **reproduit
  exactement** `29.107259068449615` sur Asnières.
- **EX-11** [Indésirable] SI `PROFIL_GOLDEN_REF` ne reproduit pas `29.107259068449615`, ALORS le chantier
  DOIT **s'arrêter et le signaler** (le snapshot ne correspond pas aux valeurs de scellement) — **jamais**
  ajuster la valeur du golden ni rescelller en autonomie.

### T5 — Prod inchangée
- **EX-12** [Ubiquitaire] Les routes `/api/analyse` et `/api/analyse-photo` DOIVENT continuer d'appeler
  `analyserAdresse` **sans** profil (→ lecture live).
- **EX-13** [MUST NOT] Aucun appel de **prod** NE DOIT passer `PROFIL_GOLDEN_REF` ni aucun profil injecté
  (grep : la référence gelée n'apparaît QUE dans les tests).

### Interdits
- **EX-14** [MUST NOT] Le chantier NE DOIT modifier ni la **valeur** du golden, ni le **verdict**, ni le
  **moteur** (`app/lib/svv/**`), ni `ST_Force2D`, ni Gemini.
- **EX-15** [MUST NOT] Le chantier NE DOIT PAS resceller le golden (aucune modif de `pipeline.itest.ts:42`).

---

## Découpe + conformité (vérifiable)
| Tâche | Contenu | Critère de conformité |
|---|---|---|
| **T1** | `PROFIL_GOLDEN_REF` (fixture immuable dédiée, hors DB) | Constante figée = 46 valeurs de scellement ; **grep** : non lue depuis `config_scoring`. |
| **T2** | `profil?` optionnel dans `ParametresAnalyse` + `params.profil ?? chargerProfilDegagement()` (`pipeline.ts:174`) | Signature étendue ; sans `profil` → live (comportement identique). |
| **T3** | Golden lit la référence gelée | `pipeline.itest.ts:20` passe `profil: PROFIL_GOLDEN_REF` ; `:42` inchangé ; **golden VERT**. |
| **T4** | Garde d'égalité | Test : injection `PROFIL_GOLDEN_REF` → `29.107259068449615` (sinon STOP). |
| **T5** | Prod inchangée | **grep** : `/api/analyse*`/`page.tsx` n'ajoutent aucun `profil` ; `PROFIL_GOLDEN_REF` absent du code prod. |
| **Conformité SVAV** | Non-régression | `npm run test:integration` **VERT** (`29.107259068449615`) ; aucun fichier `app/lib/svv`/verdict/Gemini modifié ; loader `profilConfig.ts` inchangé. |

## Cas de test explicites exigés
| Scénario | Attendu |
|---|---|
| Rejeu Asnières avec `profil: PROFIL_GOLDEN_REF` | `score.total = 29.107259068449615` → **golden VERT** |
| **Édition admin** d'une VIVE-Asnières dans `config_scoring id=1` (ex. `plafond_degagement` 80→90, `distance_max_m`, `boost_f4`) puis `npm run test:integration` | **golden RESTE VERT** (le test lit la référence gelée, plus la DB) — alors qu'AVANT le découplage il aurait rougi |
| Analyse **prod** Asnières SANS `profil` (avant/après le chantier) | `score.total` **identique** (lecture live inchangée) |
| `PROFIL_GOLDEN_REF` altéré (dérive) | Le test EX-10 échoue → signal, jamais de rescellage |

---

## Arbitrages (OQ1–OQ4 — TRANCHÉS)
- **OQ1 — TRANCHÉ : A1** — fixture codée immuable **`PROFIL_GOLDEN_REF`** (snapshot des 46 valeurs de
  scellement), **séparée** de `PROFIL_DEGAGEMENT_DEFAUT`. → EX-1 / EX-2 / EX-3.
- **OQ2 — TRANCHÉ : B1** — champ optionnel `profil?: ProfilDegagement` dans `ParametresAnalyse` ;
  `const profil = params.profil ?? await chargerProfilDegagement();` à `pipeline.ts:174`. **La prod ne
  passe JAMAIS `profil` → lecture live inchangée.** → EX-4 / EX-5 / EX-12.
- **OQ3 — TRANCHÉ** : `PROFIL_GOLDEN_REF` **co-localisé au test** (`app/lib/db/`, ex. fixture à côté de
  `pipeline.itest.ts`), **hors bundle prod** ; garde **EX-13** (grep : absent du code de prod).
- **OQ4 — TRANCHÉ** : preuve du découplage par **grep** (le golden n'appelle plus `chargerProfilDegagement`
  → structurellement indépendant de `config_scoring`). Le test **mutant la DB** (UPDATE config + revert) est
  **optionnel et NON bloquant**.

*Spec **FIGÉE** (arbitrages intégrés). Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO)
viendra sur cette base validée.*
