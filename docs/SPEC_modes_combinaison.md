# SPEC — Activation réelle des 3 modes de combinaison nature (P1) + bâti (P2)

> Spec EARS. **Livrable = cette spec, PAS du code.** RFC 2119. Produite via `/svav-specs`. **Chantier
> MOTEUR** (touche `coucheDegagement.ts`, le golden, `PROFIL_GOLDEN_REF`, une nouvelle colonne de config) →
> vigilance maximale, golden **behavior-preserving par construction**.

## Besoin
Rendre `mode_combinaison` **effectif** au point de branchement `coucheDegagement.ts:94` (aujourd'hui
`p1 + p2` en dur, mode **ignoré**). Trois modes `{sequentiel, addition, max}`, **gating par seuil de
nature**, **repli configurable** sous le seuil, sans jamais bouger le golden `29.107259068449615`.

## Recon confirmée (état actuel, `fichier:ligne`)
- Combinaison actuelle (`coucheDegagement.ts:90-95`) : `if (natureM > 0) { p1 = min(valeurClassique,
  capP1M); p2 = (dist × coeff) / diviseur; return min(p1 + p2, fam.distMaxM); }`. **`mode_combinaison`
  n'est jamais lu** (aucune branche `if (mode…)`).
- Diviseur (`coucheDegagement.ts:35-38`) : `natureM < seuilMinM → 1.0` ; sinon `min(plafond, 1 + increment
  × floor((natureM − baseM)/pasM))`.
- **Incohérence à corriger** : le comportement en dur est `p1 + p2÷diviseur` (= **séquentiel**), mais le
  défaut codé `PROFIL_DEGAGEMENT_DEFAUT.modeCombinaison` et la fixture `PROFIL_GOLDEN_REF` valent **`'max'`**
  — sans effet aujourd'hui (mode ignoré). Activer les modes **sans migrer ces défauts** ferait basculer le
  calcul sur `max(p1,p2)` → **golden cassé**. D'où la migration `max` → `sequentiel` (ci-dessous).
- Inchangés par ce chantier : exception mondiale (`coucheDegagement.ts:82`, court-circuit
  `mondialFaisceauM`), sélection cône/flanc (`:88`), chemin classique `natureM=0` (`:86`, `:96-97`), lecture
  runtime des coefficients (`profilConfig.ts:96-107`).

## Périmètre
**DANS** : (1) rendre `mode_combinaison` effectif à `coucheDegagement.ts:90-95` via **une fonction pure**
`combinerP1P2` ; (2) **nouvelle colonne** de repli sous-seuil (config) ; (3) migration `max`→`sequentiel`
des **défauts codés** (`PROFIL_DEGAGEMENT_DEFAUT` + `PROFIL_GOLDEN_REF`) ; (4) câblage (mapping,
profilConfig, migration additive, M1, info-bulles).
**HORS** : le verdict, `ST_Force2D`, Gemini, la **valeur** du golden, l'**exception mondiale**, la
**sélection cône/flanc**, le **chemin classique** (`natureM=0`), la lecture runtime des coefficients, et
**toute écriture de `config_scoring id=1`** (Règle dure — voir §Transition prod).

## Définitions ARRÊTÉES (Arno — ne pas rouvrir)
Pour un faisceau touchant un bâti pondéré avec `natureM > 0` (bâti = famille MH/Inventaire/≤1900/1901-1935
retenue par priorité ; mondial exclu car court-circuité en amont) :
- **P1** = valeur classique (`base + boostF4 × natureM`) **plafonnée à `cumul_cap_p1_m`**.
- **P2** = `dist × coeff` (coeff = `mh_cone/flanc` ou équivalent famille, sélectionné axial/latéral —
  **INCHANGÉ**). **P2 est la valeur NON divisée.**
- Résultat **toujours capé** à `fam.distMaxM` (plafond de famille), **en dehors** de la fonction de mode.
- **SI `natureM ≥ cumul_seuil_min_m`** → applique `mode_combinaison` :
  - `sequentiel` : **`P1 + P2 ÷ diviseur`** (diviseur = paliers cumul, **comportement ACTUEL**),
  - `addition` : **`P1 + P2`** (sans diviseur),
  - `max` : **`max(P1, P2)`**.
- **SI `natureM < cumul_seuil_min_m`** → applique un **mode de REPLI configurable** `{max, addition}`
  (diviseur = 1) ; **défaut du repli = `addition`** (reproduit le comportement actuel sous le seuil, où
  `diviseur = 1.0` donne déjà `p1 + p2`).
- **Défaut de `mode_combinaison` = `sequentiel`.**

> **Preuve behavior-preserving** : aujourd'hui `natureM ≥ seuil` → `p1 + p2÷diviseur` (= `sequentiel`) ;
> `0 < natureM < seuil` → `diviseur=1.0` → `p1 + p2` (= repli `addition`). Donc **défaut `sequentiel` +
> repli `addition` reproduisent EXACTEMENT le calcul actuel, faisceau par faisceau**, quel que soit le
> profil de la scène. Le golden est préservé **par construction**, indépendamment de savoir si Asnières
> exerce ou non P1+P2.

## Invariants SVAV (garde-fous durs)
- **GOLDEN behavior-preserving** : après build, `npm run test:integration` DOIT rester **14/14 à
  `29.107259068449615`**. La migration `max`→`sequentiel` porte sur `PROFIL_DEGAGEMENT_DEFAUT` **ET**
  `PROFIL_GOLDEN_REF` (la fixture du test lit `sequentiel` → reproduit le calcul actuel). SI le golden
  bouge → **STOP, ne rien resceller, signaler (Phase 7)**.
- **NE PAS écrire `config_scoring id=1`** (Règle dure) : la mise à `sequentiel` de la valeur **LIVE** est
  faite **par Arno via l'admin** après le build. Voir §Transition prod (fenêtre à assumer).
- **Migration ADDITIVE** : `ALTER TABLE … ADD COLUMN` (idempotent), **jamais** `DROP`/`ALTER` destructif ni
  `UPDATE` de `mode_combinaison`. La nouvelle colonne = liste fermée `{max, addition}`, défaut `addition`.
- **MUST NOT toucher** : verdict, `ST_Force2D`, Gemini, la valeur du golden, l'exception mondiale, la
  sélection cône/flanc, le chemin classique (`natureM=0`), la lecture runtime des coefficients.

---

## Point de branchement — fonction pure — TRANCHÉ (OQ2 : dans `coucheDegagement.ts`)
Combinaison extraite en **une fonction pure testable `combinerP1P2`**, définie **dans
`coucheDegagement.ts`** (au-dessus de `distancePercueFaisceau`, pas de module dédié), appelée à `:94` :
```ts
// P2 = dist × coeff (NON divisé) ; diviseur = diviseurCumulNature(natureM, cumulNature)
function combinerP1P2(
  p1: number, p2: number, diviseur: number, natureM: number,
  seuilMinM: number, mode: ModeCombinaison, repli: ModeRepli
): number {
  if (natureM >= seuilMinM) {
    switch (mode) {
      case 'sequentiel': return p1 + p2 / diviseur;   // comportement actuel
      case 'addition':   return p1 + p2;
      case 'max':        return Math.max(p1, p2);
    }
  }
  // sous le seuil : diviseur = 1 (non appliqué), repli {addition | max}
  return repli === 'max' ? Math.max(p1, p2) : p1 + p2;
}
```
Et à `:90-94` : `p2 = dist × coeff` (**la division sort de `:93`** et passe dans `combinerP1P2` pour le seul
mode `sequentiel`) ; `return Math.min(combinerP1P2(...), fam.distMaxM)`. **Le cap `fam.distMaxM` reste à
`:94`, hors fonction.** ⚠️ Exactitude flottante : `sequentiel` DOIT calculer `p1 + (dist × coeff) / diviseur`
avec les **mêmes opérations** qu'aujourd'hui (mêmes valeurs → même bit) pour garantir le golden.

## Nouvelle colonne de repli — TRANCHÉ (OQ1 : `mode_combinaison_repli`)
- **Nom** : **`mode_combinaison_repli`**. Clé profil `modeCombinaisonRepli`.
- **Type** : `text NOT NULL DEFAULT 'addition'`, `CHECK (mode_combinaison_repli IN ('max','addition'))`.
- **Statut d'affichage (OQ4 tranché)** : **DE GARDE**, édité en M1 par un **select liste fermée**
  `{max, addition}`.

---

## User story
- **US1** — En tant qu'**opérateur (Arno)**, je veux **choisir comment nature et bâti se combinent** sur un
  faisceau (séquentiel/addition/max) et **comment ils se combinent sous le seuil de nature**, afin de
  piloter finement le score sans coder.

## Exigences EARS

### Moteur — combinaison
- **EX-1** [Ubiquitaire] Le moteur DOIT combiner P1 et P2 via **une fonction pure** `combinerP1P2`
  paramétrée par `mode_combinaison`, le mode de repli, et le seuil `cumul_seuil_min_m`.
- **EX-2** [Complexe] QUAND un faisceau touche un bâti pondéré avec `natureM ≥ cumul_seuil_min_m`, SI
  `mode_combinaison = sequentiel`, le moteur DOIT retourner `P1 + P2 ÷ diviseur` (diviseur = paliers cumul).
- **EX-3** [Complexe] QUAND `natureM ≥ cumul_seuil_min_m`, SI `mode_combinaison = addition`, le moteur DOIT
  retourner `P1 + P2` (sans diviseur).
- **EX-4** [Complexe] QUAND `natureM ≥ cumul_seuil_min_m`, SI `mode_combinaison = max`, le moteur DOIT
  retourner `max(P1, P2)`.
- **EX-5** [Complexe] QUAND `0 < natureM < cumul_seuil_min_m`, le moteur DOIT appliquer le **mode de repli**
  (`addition` → `P1 + P2` ; `max` → `max(P1, P2)`), diviseur = 1.
- **EX-6** [Ubiquitaire] Le résultat de `combinerP1P2` DOIT être **capé à `fam.distMaxM`** en dehors de la
  fonction (à `:94`).
- **EX-7** [Ubiquitaire] `P2` fourni à `combinerP1P2` DOIT être `dist × coeff` **non divisé** ; la division
  n'intervient que dans le mode `sequentiel`.

### Moteur — invariants préservés
- **EX-8** [Indésirable] SI `f.impactEmblematique = true`, ALORS le moteur DOIT court-circuiter et retourner
  `mondialFaisceauM` **avant** toute combinaison (exception mondiale INCHANGÉE, `:82`).
- **EX-9** [Ubiquitaire] Le chemin classique (`natureM = 0`, ou bâti ordinaire/faisceau dégagé) DOIT rester
  **inchangé** (aucun passage par `combinerP1P2`).
- **EX-10** [Ubiquitaire] La sélection cône/flanc (`:88`) et les coefficients de famille (runtime) DOIVENT
  rester inchangés.

### Config — nouvelle colonne + migration
- **EX-11** [Ubiquitaire] La migration DOIT **ajouter** une colonne de repli (`ALTER TABLE ADD COLUMN`,
  idempotent), `text NOT NULL DEFAULT 'addition'`, `CHECK IN ('max','addition')` ; **aucun** `DROP`/`ALTER`
  destructif ni `UPDATE` de `mode_combinaison`.
- **EX-12** [Ubiquitaire] `profilConfig.ts` DOIT lire cette colonne au runtime, la mapper
  (`modeCombinaisonRepli`), et **retomber sur le défaut** si sa valeur est hors `{max, addition}`.
- **EX-13** [Ubiquitaire] `mode_combinaison` DOIT rester validée contre `{max, addition, sequentiel}`
  (repli DEFAUT si invalide, `profilConfig.ts:75` — inchangé).

### Défauts (golden behavior-preserving)
- **EX-14** [Ubiquitaire] `PROFIL_DEGAGEMENT_DEFAUT.modeCombinaison` DOIT passer de `'max'` à
  **`'sequentiel'`**, et recevoir `modeCombinaisonRepli: 'addition'`.
- **EX-15** [Ubiquitaire] La fixture `PROFIL_GOLDEN_REF` (`pipeline.itest.ts`) DOIT passer
  `modeCombinaison` à **`'sequentiel'`** et recevoir `modeCombinaisonRepli: 'addition'`.
- **EX-16** [Ubiquitaire] Après build, `test:integration` DOIT rester **14/14 à `29.107259068449615`**.
- **EX-17** [Indésirable] SI le golden bouge, ALORS le build DOIT **s'arrêter et le signaler**, **jamais**
  resceller.

### Admin / affichage
- **EX-18** [Ubiquitaire] `mode_combinaison` DOIT devenir de statut **VIVE** (agit désormais sur le score) ;
  son édition M1 DOIT rester un **select liste fermée** `{max, addition, sequentiel}` et déclencher
  l'avertissement golden (VIVE).
- **EX-19** [Ubiquitaire] La colonne de repli DOIT être éditable en M1 comme **select liste fermée**
  `{max, addition}` (statut DE GARDE).
- **EX-20** [Ubiquitaire] L'info-bulle de `mode_combinaison` DOIT être **réécrite** pour décrire honnêtement
  les 3 modes + le gating par `cumul_seuil_min_m` + le repli, texte **fondé sur le moteur** (recon), sans
  invention. La colonne de repli DOIT recevoir sa propre info-bulle.

---

## Exemple chiffré (MH, cône) — cas de test central
Entrées : `dist = 112,5 m`, `coeff = mh_cone = 2,0`, `natureM = 75 m`, `boostF4 = 2,5`,
`cumul_cap_p1_m = 200`, `cumul_seuil_min_m = 30`, `fam.distMaxM = 400`, `distanceMaxM = 200`.
Calcul des parts : `valeurClassique = min(112,5 + 2,5×75, 200) = min(300, 200) = 200` → **P1 = min(200,
200) = 200** ; **P2 = 112,5 × 2,0 = 225** ; diviseur(75) = `min(2,0, 1 + 0,1×floor((75−25)/5)) = min(2,0,
2,0) = 2,0`.
| Mode (`natureM ≥ seuil`) | Formule | Résultat (avant cap) | Après cap `fam.distMaxM=400` |
|---|---|---|---|
| **`sequentiel`** (défaut) | `P1 + P2÷diviseur` = `200 + 225/2` | **312,5** | **312,5** |
| **`addition`** | `P1 + P2` = `200 + 225` | 425 | **400** (capé) |
| **`max`** | `max(P1, P2)` = `max(200, 225)` | 225 | **225** |

Repli sous le seuil (`natureM = 20 < 30`) : recalcul `valeurClassique = min(112,5+2,5×20, 200) = min(162,5,
200) = 162,5` → P1 = 162,5 ; P2 = 225.
| Repli | Formule | Après cap |
|---|---|---|
| **`addition`** (défaut) | `P1 + P2` = `162,5 + 225` | **387,5** |
| **`max`** | `max(162,5, 225)` | **225** |

## Cas de test explicites exigés
| Scénario | Attendu |
|---|---|
| `sequentiel`, exemple MH ci-dessus | **312,5** (= comportement actuel) |
| `addition`, même entrées | P1+P2 sans diviseur → 425 capé **400** |
| `max`, même entrées | **225** |
| Repli sous seuil (`natureM<30`), défaut `addition` | `P1+P2`, diviseur=1 → **387,5** |
| Repli `max` sous seuil | **225** |
| **Défaut `sequentiel` + repli `addition`** → `test:integration` | **14/14, `29.107259068449615`** |
| Exception mondiale (`impactEmblematique`) | retourne `mondialFaisceauM`, **jamais** `combinerP1P2` |
| Chemin classique (`natureM=0`) | inchangé (pas de `combinerP1P2`) |
| Valeur repli invalide en config | repli DEFAUT (pas de crash) |

---

## ⚠️ Transition PROD (à assumer explicitement — Règle dure)
La valeur **LIVE** `config_scoring.mode_combinaison` vaut aujourd'hui **`'max'`** (seed). Ce build **ne
l'écrit PAS** (Règle dure). Or, une fois les modes actifs, le moteur **lira** cette valeur live :
- **Le golden reste vert** (la fixture `PROFIL_GOLDEN_REF` est migrée en `sequentiel` — découplage acquis).
- **MAIS la PROD live lira `'max'`** → pour les faisceaux exerçant P1+P2, la prod appliquerait `max(P1,P2)`
  **au lieu de** `P1 + P2÷diviseur` → **changement de comportement en production** tant qu'Arno n'a pas
  réglé la valeur. Le golden **ne peut pas** détecter ce décalage (il est découplé).
- **EX-21** [Événementiel] QUAND le build est livré, Arno DOIT, **immédiatement après**, régler via l'admin
  `mode_combinaison = 'sequentiel'` (et `mode_combinaison_repli = 'addition'`) sur la ligne live pour
  restaurer le comportement antérieur.
- La colonne de repli, elle, arrive à `'addition'` sur la ligne existante via le `DEFAULT` de la migration
  (non destructif) → conforme d'emblée.

---

## Arbitrages (OQ1–OQ4 — TRANCHÉS)
- **OQ1 — TRANCHÉ** : colonne repli nommée **`mode_combinaison_repli`** (clé `modeCombinaisonRepli`).
  → §Nouvelle colonne, EX-11/EX-12.
- **OQ2 — TRANCHÉ** : fonction pure **`combinerP1P2` dans `coucheDegagement.ts`** (pas de module dédié).
  → §Point de branchement, EX-1.
- **OQ3 — TRANCHÉ (option a)** : régularisation **MANUELLE par Arno via l'admin** juste après le build ; le
  build **N'ÉCRIT PAS** la ligne `config_scoring` live (Règle dure respectée). La fenêtre de transition et
  l'action requise sont documentées → §Transition prod + **EX-21**. *(Option b — `UPDATE` dans une migration
  pré-approuvée — écartée.)*
- **OQ4 — TRANCHÉ** : `mode_combinaison_repli` = statut **DE GARDE**, liste fermée `{max, addition}`.
  → EX-19, §Nouvelle colonne.

*Spec **FIGÉE**. Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO) viendra sur cette base
validée. Rappel : c'est le chantier le plus sensible (moteur + golden) — le défaut `sequentiel` + fixture
migrée le rendent behavior-preserving ; EX-21 (régularisation live par Arno) est l'action critique post-build.*
