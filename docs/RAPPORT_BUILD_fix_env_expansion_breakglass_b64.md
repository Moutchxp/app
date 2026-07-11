# RAPPORT BUILD — Fix « expansion @next/env » sur le hash break-glass (encodage base64)

> Généré le 11/07/2026 à 23h28 — run autonome `/svav-build`. **Aucun commit effectué.** Livraison remise à Arno.

## Résumé exécutif

La **voie de secours** (break-glass) du login admin échouait systématiquement en **401** dans Next, alors
que le secret et le hash étaient corrects (et que le même hash validait au terminal). Cause racine :
**`@next/env` (loader `.env` de Next) applique une EXPANSION de variables dotenv** qui interprète les
séquences `$argon2id`, `$v`, `$m`, `$sel`, `$hash` du hash argon2 comme des références `$VAR` → remplacées
par vide → au runtime Next le hash brut (97 car) devient un moignon (~27 car). `verifier` reçoit ce moignon
→ `false` → 401.

**Correctif :** stocker le hash **encodé en base64** dans `.env` (nouvelle var `ADMIN_PASSWORD_ARGON2_B64`)
— le base64 (`A-Za-z0-9+/=`) ne contient **aucun `$`** → rien à expanser → la valeur traverse le loader
intacte. La route **décode** le base64 juste avant `verifier`. Le CLI `admin:secours-hash` imprime désormais
la ligne déjà encodée.

**Un défaut supplémentaire a été trouvé par la revue adverse et corrigé** (canal temporel — voir Catégorie A
§ décision 1 et Catégorie C § CONSTAT 1).

- **Verdict recon indépendante : VALIDER** (8/8 invariants PASS).
- **Golden `29.107259068449615` : inchangé** (suite d'intégration rejouée, 8 fichiers / 54 tests, exit 0).
- **Byte-unchanged** (`password.ts`, `motDePasse.ts`, `garde.ts`, `proxy.ts`) : diff vide, prouvé.
- **Aucune dépendance npm ajoutée** (`Buffer` natif Node).

---

## Phase 0 — Confirmation du symptôme (lecture seule)

| Point | Attendu | Constaté |
|-------|---------|----------|
| (a) `route.ts` lit `process.env.ADMIN_PASSWORD_ARGON2` directement | oui | **Confirmé** (avant fix : branche secours lisait `process.env.ADMIN_PASSWORD_ARGON2 ?? ''`). |
| (b) CLI `admin:secours-hash` imprime `ADMIN_PASSWORD_ARGON2=<hash brut>` | oui | **Confirmé** (`admin.ts`, ancien `console.log(\`ADMIN_PASSWORD_ARGON2=${h}\`)`). |
| (c) Expansion reproduite (troncature runtime) | oui | **Confirmé empiriquement** : valeur RAW `.env` `startsWith($argon2id$)=true`, longueur **97** ; valeur au runtime `@next/env` `startsWith($argon2id$)=false`, longueur **27**, préfixe `"=19=65536,t="`. Le terminal (dotenv « plain », sans expansion) voit le vrai hash → d'où le décalage terminal ↔ Next. |

Aucune divergence avec la recon initiale → poursuite du run.

---

## Fichiers touchés

| Fichier | Nature | Modification |
|---------|--------|--------------|
| `app/(admin)/api/admin/session/route.ts` | route auth | Ajout `hashBreakGlass()` (décodage base64 + repli leurre) ; branche secours appelle `verifier(password, hashBreakGlass())` ; commentaires. |
| `app/scripts/admin.ts` | CLI | `secours-hash` : `hacher()` → `Buffer.from(h,'utf8').toString('base64')` → imprime `ADMIN_PASSWORD_ARGON2_B64=<base64>`. |
| `app/(admin)/api/admin/session/route.test.ts` | tests | Fixture env passée en base64 (décodée par la route) ; cas fail-closed (absent / décode-vide / corrompu) alignés sur le repli leurre. |
| `app/lib/admin/breakglassB64.test.ts` | **nouveau** test | Round-trip argon2 **RÉEL** (pas de mock) : `hacher → base64 → décodage → verifier === true` + preuve « base64 sans `$` ». |
| `app/lib/auth/antiBruteforce.ts` | commentaire seul | Doc-string : `ADMIN_PASSWORD_ARGON2` → `ADMIN_PASSWORD_ARGON2_B64` (décodé de base64). |

> **Fichiers GELÉS non touchés (prouvé, diff vide)** : `app/lib/admin/password.ts`, `app/lib/admin/motDePasse.ts`,
> `app/lib/admin/garde.ts`, `proxy.ts` (racine). **Fichiers Gemini non touchés** : `adaptateurIaPhoto.ts`,
> `analyse-photo/route.ts`. **Aucun fichier moteur touché.**

---

## Revue adverse (Phase 3) + correctifs

Reviewer adverse (sécurité) — verdict initial **CORRIGER** : cœur du fix solide, **un** défaut réel en-scope.

### CONSTAT 1 — [CORRIGÉ] Canal temporel « break-glass armé ? » (~1700×)

- **Symptôme :** avec un repli `hash = ''`, `verifier(password, '')` est rejeté **instantanément** par argon2
  (hash malformé, aucun calcul KDF — mesuré ~0,01 ms) ; un secret erroné contre un hash **armé** déclenche
  un argon2 complet (~23 ms). **Ratio ≈ 1700×**, trivialement mesurable sur le réseau.
- **Ce qui fuit :** en sondant `POST /api/admin/session` avec `{identifiant:'', password:'x'}`, un attaquant
  distingue « break-glass **non armé** » (rapide) de « break-glass **armé**, mauvais secret » (lent). Or la voie
  de secours est **délibérément NON throttlée** → savoir qu'elle est armée désigne une cible non throttlée.
- **Aggravant :** **régression** vs l'ancienne voie SHA-256 (`timingSafeEqual`, uniformément rapide, aucune
  distinction) ET **incohérence** interne — la voie **NOMMÉE** se défend déjà de ce canal en passant
  `HASH_LEURRE` à `verifier` pour un compte inconnu (`route.ts:103`), pas la voie de secours.
- **Correctif appliqué :** `hashBreakGlass()` renvoie **`HASH_LEURRE`** (un argon2id à préimage inconnue) —
  et non `''` — quand la var est absente/vide/se décode en chaîne vide. `verifier` exécute alors un argon2
  **complet** dans tous les cas → « non armé » indiscernable de « mauvais secret ». **Fail-closed préservé**
  (le leurre ne matche jamais). C'est le **miroir exact** de la défense de la voie nommée.
- **Résidu assumé (honnêteté) :** une valeur base64 **non vide mais corrompue** décode en octets non-argon2
  passés tels quels → rejet rapide → distinguable. C'est un état de **configuration transitoire** (Arno colle
  une ligne cassée), **pas** un état stable, et il **ne révèle pas** le secret ni « armé vs absent » (les deux
  états stables sont désormais lents). Sévérité résiduelle négligeable ; corriger la config résout tout.

### Autres vecteurs — neutralisés (rappel des preuves)

- **(a) var absente → 401, jamais 500** : `hashBreakGlass()` ne throw jamais (`process.env`/`Buffer`/`toString`
  ne throw pas + try/catch de garde) ; `verifier` enveloppe argon2 dans try/catch → false.
- **(b) valeur corrompue** : `Buffer.from(v,'base64')` est indulgent (ignore les caractères hors-alphabet, ne
  throw jamais) → valeur non-argon2 rejetée par `verifier`. Fail-closed.
- **(c) base64 sans `$`** : alphabet `A-Za-z0-9+/=` — prouvé par test (`breakglassB64.test.ts`, `not.toContain('$')`).
  `+`, `/`, `=` n'ont **aucun** effet sur l'expansion dotenv (seul `$`/`${}` déclenche) ni sur le parsing `.env`
  (coupe sur le premier `=`, valeur intacte).
- **(d) aucune voie SHA-256 résiduelle** : import `motDePasseValide` retiré de la route ; orphelins confirmés
  (`password.ts`/`ADMIN_PASSWORD` non appelés par la route — seules mentions = commentaires).
- **(e) anti-énumération** : message/statut identiques (401 `{erreur:'Identifiants invalides'}`) pour tous les
  cas d'échec ; **timing** désormais constant (CONSTAT 1 corrigé) ; throttle exempte `''` (break-glass jamais bloqué).
- **(f) lecture dynamique** : `process.env.ADMIN_PASSWORD_ARGON2_B64` lu **dans le corps** de `hashBreakGlass()`
  (appelée à chaque POST) — pas un `const` au niveau module → une valeur ajoutée après le boot est vue.
- **(g) voie nommée inchangée** : le diff ne touche QUE la branche `if (identifiant === '')`, le CLI et un commentaire.

---

## Tests (Phase 4)

| Test | Résultat |
|------|----------|
| `session/route.test.ts` (17 cas : secours OK, fail-closed absent→leurre, décode-vide→leurre, corrompu, throttle F1…) | **PASS** |
| `breakglassB64.test.ts` (round-trip argon2 RÉEL, base64 sans `$`, décodage tolérant) | **PASS** |
| Suite complète `npm test` | **PASS** — 76 fichiers, **866 passés**, 21 skipped, 0 échec |
| `tsc --noEmit` sur fichiers touchés | **PASS** (aucune erreur) |

- **Round-trip prouvé avec le VRAI argon2** (sans mock) : `hacher('dev-admin-2026')` → base64 → décodage →
  `verifier('dev-admin-2026', hash) === true` ; `verifier('mauvais', hash) === false`.
- **Simulation runtime** : une valeur base64 passée telle quelle (sans expansion) est décodée puis validée.
- **Fail-closed** : absent / décode-vide → **leurre** (temps constant) → false ; corrompu non-vide → valeur
  décodée → false ; **jamais de throw**.

---

## Preuve golden (Phase 6 — conformité)

- **`npm run test:integration` rejoué** : **exit 0**, 8 fichiers / 54 tests PASS.
- Le golden **`29.107259068449615`** est asserté 11× dans `pipeline.itest.ts` (Asnières + cas dérivés) → tous
  verts. **Aucun fichier moteur touché** (obstacles/verdict/scoreTotal/faisceaux/coucheDegagement/config/
  profilConfig/pipeline) → le golden ne **peut pas** bouger. **Bit-identique confirmé.**

## Byte-unchanged (Phase 6 — conformité)

`git diff --stat` sur `proxy.ts`, `app/lib/admin/password.ts`, `app/lib/admin/motDePasse.ts`,
`app/lib/admin/garde.ts` → **sortie vide** (aucun des 4 fichiers gelés n'est modifié). **PASS.**

---

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno — prioritaire)

1. **Repli sur `HASH_LEURRE` au lieu de `''` (écart au libellé de la cartouche).** La cartouche disait
   littéralement « valeur non base64 valide, ou vide → hash effectif = `''` → verifier renvoie false ».
   **J'ai dévié** : `hashBreakGlass()` renvoie `HASH_LEURRE` (et non `''`) sur absent/vide.
   *Raison :* le `''` introduit le canal temporel du CONSTAT 1 (revue adverse, **explicitement mandatée par la
   cartouche : « corrige toute faille »**) et **régresse** l'anti-énumération vs l'ancienne voie SHA-256.
   *Alternative écartée :* garder `''` (laisserait une fuite de timing « armé vs non armé » sur une voie non
   throttlée). *Impact :* comportement fail-closed **inchangé** (le leurre ne matche jamais) ; seule différence
   observable = le temps de réponse devient constant. **Si Arno préfère le `''` littéral**, revenir à
   `if (!b64) return ''` … `catch { return '' }` suffit (les tests fail-closed devront ré-asserter `''`).

2. **Nom de la nouvelle variable = `ADMIN_PASSWORD_ARGON2_B64`** (suffixe `_B64`). *Raison :* lever toute
   ambiguïté avec l'ancienne `ADMIN_PASSWORD_ARGON2` (non-b64) et rendre l'erreur de configuration détectable
   (poser l'ancienne var n'arme plus rien). *Alternative écartée :* réutiliser le même nom en changeant
   seulement le contenu (source d'erreurs silencieuses au déploiement). *Impact :* l'ancienne var devient
   **obsolète** (voir séquence de déploiement).

3. **`.env` / `.env.example` NON modifiés par l'agent.** *Raison :* la valeur `_B64` doit être générée depuis
   le **vrai secret** via le CLI à saisie masquée (modèle de sécurité) ; écrire un secret en `.env` de façon
   autonome sortirait du cadre. *Impact :* en l'état du dépôt, `ADMIN_PASSWORD_ARGON2_B64` est **absente** →
   la voie de secours est **fail-closed (401)** tant qu'Arno n'a pas exécuté l'étape de déploiement ci-dessous.
   `.env.example` documente encore l'ancienne var → **à mettre à jour par Arno** vers `_B64`.

## B. DOUTES

- **Aucun doute bloquant.** Point d'attention mineur : le résidu de timing du CONSTAT 1 (config corrompue
  non-vide → rejet rapide) est **assumé** comme état transitoire de déploiement, non comme fuite stable. Si
  Arno veut le fermer aussi, on peut router toute valeur décodée ne commençant pas par `$argon2` vers le leurre
  (guard `startsWith('$argon2')`) — non fait ici pour rester au plus près de la recommandation de la revue et
  du principe « code minimal ».

## C. ÉCARTS DE CONFORMITÉ

- **Golden** : PASS (inchangé, prouvé par re-run). **Aucun mouvement.**
- **Byte-unchanged** : PASS (4 fichiers gelés intacts).
- **Verdict découplé** : PASS (fix strictement dans l'auth admin ; aucun lien avec verdict géométrique/score photo).
- **Config externalisée / ST_Force2D / hauteur de vision / RGPD-données perso** : **non concernés** (ce chantier
  ne touche ni moteur, ni données personnelles, ni géométrie).
- **Dépendance npm** : PASS (aucune ajoutée ; `Buffer` natif).
- **CONSTAT 1** (revue adverse) : **détecté puis CORRIGÉ** dans ce même run (repli leurre). Reporté ici pour
  traçabilité même s'il est résolu.

---

## Séquence de déploiement OBLIGATOIRE (à exécuter par Arno)

> ⚠️ Cette séquence **remplace** celle du rapport précédent
> (`RAPPORT_BUILD_durcissement_breakglass_argon2.md`), qui provisionnait l'ancienne var brute
> `ADMIN_PASSWORD_ARGON2` — laquelle ne fonctionne **pas** sous Next (cause de ce chantier).

1. **Générer la ligne base64** (saisie masquée, rien en base, secret jamais affiché) :
   ```
   npm run admin:secours-hash
   # → colle le secret (masqué), confirme ; sortie : ADMIN_PASSWORD_ARGON2_B64=<base64>
   ```
2. **Dans `.env`**, **remplacer** l'ancienne ligne `ADMIN_PASSWORD_ARGON2=$argon2id$...` par la nouvelle
   `ADMIN_PASSWORD_ARGON2_B64=<base64>` (l'ancienne var devient **obsolète** — la retirer).
   Optionnel : mettre à jour `.env.example` pour pointer vers `ADMIN_PASSWORD_ARGON2_B64`.
3. **Redémarrer** le serveur Next (relecture de `.env`).
4. **Tester** la voie de secours : login admin avec identifiant vide + le secret → doit réussir (200).
5. **SEULEMENT ENSUITE**, committer.

> **Note commit :** ce fix est empilé sur le chantier « durcissement break-glass argon2 » **encore non
> committé** (working tree : `route.ts`, `admin.ts`, `antiBruteforce.ts`, `package.json`, +
> `RAPPORT_BUILD_durcissement_breakglass_argon2.md`). Comme ce fix **remplace** l'approche hash-brut de ce
> chantier, le plus propre est de **fondre les deux en un seul commit** (le durcissement argon2 livré
> directement dans sa forme base64 finale). À l'appréciation d'Arno.

---

## Recon de validation indépendante (Phase 8)

Sous-agent indépendant, lecture seule, confrontation aux 8 invariants → **VERDICT : VALIDER** (8/8 PASS).
Réserves non bloquantes signalées : (1) `proxy.ts` existe bien à la racine mais **n'est pas touché** (invariant
byte-unchanged tenu) ; (2) le rapport de build (ce document) s'ajoute aux fichiers ; (3) fail-closed en l'absence
de `_B64` est le comportement **attendu** jusqu'au déploiement.

---

## Confirmation finale

Aucun commit. Aucune migration. Aucun DDL. Aucun fichier moteur touché. Aucun fichier Gemini touché. Aucune
dépendance npm ajoutée. Les 4 fichiers gelés sont bit-identiques. Golden inchangé (rejoué). Livraison prête
pour Arno — **provisionner `ADMIN_PASSWORD_ARGON2_B64` avant de tester/committer.**
