# SPEC — Correctif « affichage seuil 40 m » (distance-verdict, page résultat)

> Spec EARS pour un **correctif d'AFFICHAGE PUBLIC**. **Livrable = cette spec, PAS du code.** RFC 2119.
> Produite via `/svav-specs`. À valider par Arno avant `/svav-build`.

## Besoin
Sur l'écran Résultat, la distance du 1er obstacle est affichée à l'internaute via `Math.round` (arrondi
au plus proche). Un obstacle réellement à **39,8 m** (verdict `VIS_A_VIS`, correct) s'affiche alors
**« 40 m »**, en contradiction avec la ligne « distance minimale requise 40 m » → **incohérence perçue**.
Corriger : la distance-verdict affichée DOIT rester **arrondie au plus proche** (`Math.round`) **PARTOUT**,
**SAUF** la tranche **[39,00 ; 39,99]** qui est **forcée à 39** (jamais 40) — de sorte qu'un obstacle
réellement **sous le seuil** (verdict vis-à-vis) ne s'affiche jamais « 40 m ».

## Recon confirmée (lecture seule)
- **2 sites d'affichage** de la distance-verdict (`resultat.verdict.distanceM`), tous deux via `Math.round` :
  - `app/page.tsx:451` — bloc « Premier obstacle face » : `` `${Math.round(distanceM)} m` `` (sinon
    « Aucun (≥ 200 m) » si `distanceM` null).
  - `app/page.tsx:646` — bloc « Obstacle détecté » (branche vis-à-vis) :
    « Bâtiment à {Math.round(distanceM)} mètres dans l'axe de vision » (fallback « — » si non fini).
- **Aucun helper** de formatage de distance n'existe (formatage inline).

## Périmètre STRICT
**DANS** : la seule **distance-du-verdict** `resultat.verdict.distanceM`, aux 2 sites ci-dessus.
**HORS** (ne pas toucher) : le **littéral « 40 m »** (seuil de référence, `page.tsx:604`) ; le cas
**`distanceM === null`** → « Aucun (≥ 200 m) » (inchangé) ; les **distances d'adresses BAN** (`page.tsx:811`)
; toute autre distance/score.

## Décisions verrouillées (Arno)
- **D1 — Arrondi au plus proche AVEC exception seuil** : la distance-verdict affichée = `Math.round(distanceM)`
  **PARTOUT**, **SAUF** si `distanceM >= 39 ET distanceM < 40` → **forcée à 39** (jamais 40). Formulation
  exacte : **`(d >= 39 && d < 40) ? 39 : Math.round(d)`**. Raison : la tranche `[39 ; 40[` = obstacles
  réellement sous le seuil (verdict vis-à-vis) ; leur affichage ne doit jamais montrer « 40 ». Partout
  ailleurs, arrondi au plus proche.
- **D2 — Fonction partagée unique** : la règle D1 vit dans **UNE** fonction (seule source de vérité)
  réutilisée aux 2 sites, pour garantir la cohérence (pas de `Math.round` dupliqué inline).

## Rattachement aux invariants SVAV (garde-fous durs)
- **AFFICHAGE PUBLIC UNIQUEMENT** : ne touche NI le moteur (`app/lib/svv/**`), NI le verdict, NI aucun
  calcul. Le **verdict reste décidé sur `distanceM` BRUT** (`verdict.ts`, seuil `THRESHOLD_M=40`).
- **GOLDEN INTOUCHÉ** : `29.107259068449615` ; `test:integration` reste vert (le test n'assère pas de
  chaîne d'affichage, seulement `distanceM` brut ≈ 42,10 — inchangé).
- **GEMINI hors staging** : `adaptateurIaPhoto.ts`, `analyse-photo/route.ts` non touchés.
- **Responsive / `prefers-reduced-motion`** : inchangés (pas d'impact structurel ; la logique de taille
  `tailleDistance` continue de dériver de la chaîne affichée).
- Le helper NE DOIT PAS vivre sous `app/lib/svv/**` (couche affichage, pas moteur).

---

## User story
- **US1** — En tant qu'**internaute**, je veux que la distance affichée soit **cohérente avec le verdict**
  (une distance sous 40 m ne s'affiche jamais « 40 m »), afin de comprendre pourquoi mon logement est
  « vis-à-vis détecté ».

## Exigences EARS

### Helper (troncature partagée)
- **EX-1** [Ubiquitaire] Le système DOIT fournir **une fonction partagée unique** encapsulant la règle de
  formatage de la distance-verdict (arrondi au plus proche + exception `[39 ; 40[` → 39), réutilisée aux
  2 sites d'affichage.
- **EX-2** [Ubiquitaire] Le helper DOIT vivre dans la couche **affichage** (hors `app/lib/svv/**`) et être
  **testable unitairement** (fonction pure).
- **EX-3** [Ubiquitaire] Pour une distance finie hors tranche seuil, la fonction DOIT retourner
  `Math.round(distanceM)`.
- **EX-3b** [Indésirable] SI `distanceM >= 39 ET distanceM < 40`, ALORS la fonction DOIT retourner **39**
  (jamais 40, jamais l'arrondi normal).
- **EX-4** [Indésirable] SI `distanceM` est `null` (ou non fini), ALORS le helper DOIT signaler l'absence
  de nombre (le site appelant affiche « Aucun (≥ 200 m) » ou « — » selon son contexte, inchangé).

### Site 1 — « Premier obstacle face » (`page.tsx:451`)
- **EX-5** [Ubiquitaire] Le bloc « Premier obstacle face » DOIT afficher « {valeur} m » via la fonction
  partagée (valeur = règle EX-3/EX-3b), pour une distance finie.
- **EX-6** [Conditionnel] TANT QUE `distanceM` est `null`, ce bloc DOIT afficher **« Aucun (≥ 200 m) »**
  (comportement inchangé).

### Site 2 — « Obstacle détecté / Bâtiment à … mètres » (`page.tsx:646`)
- **EX-7** [Ubiquitaire] Le bloc « Obstacle détecté » DOIT afficher la distance via la **même fonction
  partagée** (« Bâtiment à {valeur} mètres dans l'axe de vision », valeur = règle EX-3/EX-3b).
- **EX-8** [Indésirable] SI `distanceM` n'est pas fini, ALORS ce bloc DOIT conserver son fallback **« — »**
  (inchangé).

### Non-régression / interdits
- **EX-9** [MUST NOT] Après correction, **aucun `Math.round(distanceM)` INLINE** NE DOIT subsister aux 2
  sites : tout passe par la fonction partagée (qui, elle, applique `Math.round` + l'exception `[39 ; 40[`).
- **EX-10** [MUST NOT] Le correctif NE DOIT modifier **ni** le verdict, **ni** le calcul, **ni** aucun
  fichier de `app/lib/svv/**`, **ni** le littéral « 40 m » du seuil de référence.

---

## Découpe + critères de conformité (vérifiables)
| Tâche | Contenu | Critère de conformité |
|---|---|---|
| **T1** | Fonction partagée (règle arrondi + exception `[39;40[`→39, hors `app/lib/svv`) + test unitaire | Tests (cf. tableau ci-dessous) : `39,80`→« 39 » ; `40,49`→« 40 » ; `40,51`→« 41 » ; `null`→absence. |
| **T2** | Branchement aux 2 sites (`page.tsx:451` et `:646`) | Les 2 sites appellent la fonction partagée ; **grep** : plus aucun `Math.round(distanceM)` INLINE ; « Aucun (≥ 200 m) » et « — » préservés ; littéral « 40 m » (`:604`) intact. |
| **Cohérence verdict** | 39,8 m | Verdict RESTE `VIS_A_VIS` (décidé sur `distanceM` brut < 40) **ET** affichage « 39 m » — les deux cohérents. |
| **Conformité SVAV** | Non-régression | `test:integration` **vert** (`29.107259068449615` inchangé) ; aucun fichier `app/lib/svv`/moteur/golden/migration touché ; Gemini intacts. |

## Cas de test explicites exigés (valeur affichée ; Site 1 suffixe « m », Site 2 « mètres »)
| Entrée `distanceM` | Verdict (brut, inchangé) | Valeur affichée | Règle appliquée |
|---|---|---|---|
| `39.00` | `VIS_A_VIS` (< 40) | **39** | exception `[39;40[` |
| `39.49` | `VIS_A_VIS` | **39** | exception `[39;40[` |
| `39.80` | `VIS_A_VIS` | **39** | exception `[39;40[` (+ cohérent avec vis-à-vis) |
| `39.99` | `VIS_A_VIS` | **39** | exception `[39;40[` |
| `40.00` | `SANS_VIS_A_VIS` (≥ 40) | **40** | `Math.round` |
| `40.30` | `SANS_VIS_A_VIS` | **40** | `Math.round` |
| `40.49` | `SANS_VIS_A_VIS` | **40** | `Math.round` |
| `40.51` | `SANS_VIS_A_VIS` | **41** | `Math.round` |
| `40.99` | `SANS_VIS_A_VIS` | **41** | `Math.round` |
| `42.10…` (golden Asnières) | `SANS_VIS_A_VIS` | **42** | `Math.round` |
| `null` (aucun obstacle) | `SANS_VIS_A_VIS` | **« Aucun (≥ 200 m) »** (inchangé) | absence de nombre |

---

## Arbitrages (TRANCHÉS)
- **RÈGLE — TRANCHÉE** : `Math.round` au plus proche PARTOUT, **exception `[39 ; 40[` → 39** (D1 / EX-3 /
  EX-3b). Plus de `Math.floor`.
- **OQ1 — TRANCHÉ (Option A)** : règle mutualisée dans **une fonction partagée unique** (seule source de
  vérité) ; les 2 sites l'utilisent. Proposition d'API : `metresVerdictAffiches(distanceM: number|null):
  number|null` (le calcul partagé : `null`/non fini → `null` ; `[39;40[` → `39` ; sinon `Math.round`) ;
  + `formaterDistanceVerdict(distanceM): string` (« X m » / « Aucun (≥ 200 m) ») pour le Site 1. **Site 1
  garde « X m », Site 2 garde « … mètres » — wording inchangé.**
- **OQ2 — `distanceM` négatif/0** : hors scénario réel ; la fonction reste sûre (`Math.round`/exception
  définis). Aucun traitement spécial.

*Spec **FIGÉE**. Rien n'est construit ni committé. Le `/svav-build` (🔴 PROMPT AUTO) viendra sur cette
base validée.*
