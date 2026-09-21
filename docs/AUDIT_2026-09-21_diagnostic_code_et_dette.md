# AUDIT & REGISTRE DE DETTE — Sans Vis-à-Vis®

> **Statut : DIAGNOSTIC À FROID — lecture seule, AUCUN code modifié par ce document.**
> Date du diagnostic : **2026-09-21**. Méthode : reconnaissance en lecture seule sur 5 axes
> (moteur de calcul, couche données/PostGIS, sécurité/auth/RGPD, tests & dette technique, **performance
> & charge de calcul**), chaque constat ancré `fichier:ligne`. Périmètre : code réel sous `app/app/`
> (≈ 116 000 lignes de code + 81 000 lignes de tests, mesuré).
>
> **Comment utiliser ce document (c'est un REGISTRE, pas un rapport figé) :**
> - Le §2 « Registre priorisé » est la table de travail : chaque item a un **ID**, une **sévérité**,
>   un **effort** et un **statut** (⬜ à faire · 🔄 en cours · ✅ fait · ⏸️ écarté). On coche/met à jour
>   au fil des chantiers.
> - Un chantier qui résout un item = **un lot = un commit** (convention SVAV). Tout item touchant le
>   **golden**, `config_scoring`, un invariant ou la **sécurité** → relecture humaine + commit séparé
>   (règle `CLAUDE.md §14`).
> - Le §7 « Journal de révision » trace chaque passage (date / quoi). Un futur audit **met à jour les
>   statuts ici** plutôt que d'ouvrir un doc concurrent.
> - Aucun secret n'est recopié dans ce document (les problèmes de secrets sont décrits, jamais leur valeur).

---

## 1. Verdict global

**Actif objectivement solide, nettement au-dessus de la moyenne pour un projet de cette taille et de ce
mode de construction.** Ce n'est pas un prototype fragile : moteur de calcul, sécurité, RGPD, tests et
documentation sont pensés et cohérents. **Les vrais risques ne sont pas dans le code métier — ils sont
autour : le filet de contrôle a des trous, le temps de réaction est lourd, et la connaissance repose sur
une seule personne.**

### Tableau de bord

| Domaine | Niveau | Synthèse |
|---|---|---|
| Moteur de calcul (verdict/score) | 🟢 Solide | Calcul pur isolé, label découplé du score, aucun arrondi, invariants tenus |
| Sécurité & RGPD | 🟢 Solide | Auth sérieuse, anti-fraude, RGPD complet — **1 réserve de conception (fail-open admin)** |
| Base de données / spatial | 🟢 Solide | SQL 100 % paramétré, PostGIS discipliné — **robustesse des connexions à durcir** |
| **Efficacité (temps de réaction)** | 🔴 **Faible** | **~132 allers-retours base EN SÉRIE / certification (> 3 s probable)** — plus gros levier unique (P1) |
| Besoin en calculs | 🟢 Solide | Calcul délégué à PostGIS (set-based), non CPU-bound ; le goulot est dans les round-trips, pas le calcul |
| Tests (volume & rigueur) | 🟢 Solide | 8 795 cas de test, garde-fous d'architecture exécutables |
| Dette technique « classique » | 🟢 Très bon | ~6 TODO / 0 FIXME sur 116 k lignes |
| **Filet de contrôle (le « gate »)** | 🔴 **Faible** | **`tsc` rouge + hors gate ; golden hors `npm test` — point noir technique** |
| **Pérennité / dépendance humaine** | 🔴 **Faible** | **Bus factor = 1 — point noir stratégique** |

### Notation /20 (2026-09-21)

> Barème français : 16+ excellent · 14-15 très bon · 12-13 bon · 10-11 passable · < 10 insuffisant.
> Jugements calibrés sur les preuves des audits, pas des mesures live (l'efficacité est une estimation
> **structurelle**, pas chronométrée).

| Dimension | Note | En bref |
|---|:---:|---|
| Qualité de code | **15/20** | Propre, typé, peu de dette — mais `tsc`/lint rouges & hors gate, monolithe `page.tsx` |
| Architecture | **15/20** | Séparation nette + garde-fous d'imports exécutables — front monolithique, pipeline en série |
| Robustesse | **13/20** | Défensif & testé — mais pools non durcis (crash possible), requêtes non bornées, golden hors gate |
| Efficacité (temps de réaction) | **9/20** | ~132 round-trips sériels / certification (> 3 s probable) — corrigeable par **P1** |
| Besoin en calculs | **14/20** | Appétit élevé (raster LiDAR) mais bien géré (set-based PostGIS) ; goulot = round-trips, pas calcul |
| *(bonus)* Sécurité | **15/20** | Au-dessus de la moyenne ; réserve = fail-open vers admin (**M1**) |
| *(bonus)* Pérennité / bus factor | **8/20** | 1 auteur, ~19 commits/j — risque patrimonial n°1 (**F1**) |
| **GLOBAL** | **~13/20** | **Solide mais perfectible** |

> ⚡ Le levier **P1** (batcher les 61 faisceaux) remonterait à lui seul l'**efficacité de ~9 à ~14** et la
> **robustesse de +1 à +2** : c'est le meilleur rapport impact/effort du registre.

---

## 2. Registre priorisé des actions

> Sévérité : 🔴 élevée · 🟠 moyenne · 🟡 faible. Effort indicatif. Statut : ⬜ à faire.

### Priorité 1 — Gains rapides / filet de contrôle (jours, fort impact)

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **G1** | 🔴 | S | ✅ | Mettre `tsc --noEmit` **et** `eslint` dans le contrôle de fin ; corriger l'erreur de type en **production** + les ~42 erreurs lint | `ADemanderVue.tsx:273` (type prod) ; lint concentré `page.tsx` (22), `FaisceauMap.tsx` (11) |
| **G2** | 🔴 | S | ✅ | **Sceller le golden dans `npm test`** : assertion pure `analyser(...) === 29.107259068449615` dans un vrai `.test.ts` (sans PostGIS) | golden uniquement dans `app/lib/db/pipeline.itest.ts:42` (suite d'intégration, **hors** `npm test`) |
| **G3** | 🟠 | S | ✅ | Durcir les 3 pools : ajouter `pool.on('error', …)` (évite crash process) + timeouts/bornage du pool principal | `db/client.ts:8` (pool nu) ; gabarit déjà présent `analytics/pool.ts:33-41` |
| **G4** | 🟠 | S | ✅ | **`/api/check-building` supprimée** (route publique morte, aucun appelant ; accord Arno 2026-09-22 ; commit `bb8b6e8`). ⚠️ **Résidu NON traité** : throttle des routes publiques lourdes (`/api/analyse`) — à rouvrir. | `app/api/check-building/route.ts` supprimé ; `/api/analyse` sans throttle |
| **G5** | 🟡 | S | ⬜ | Supprimer le code d'auth mort + purger le secret en clair du `.env` ; dédupliquer `SMTP_PERSONNE_PASS` ; rafraîchir `.env.example` | `app/lib/admin/password.ts` (SHA-256 non salé, 0 importeur) ; `.env` (`ADMIN_PASSWORD` clair, `SMTP_PERSONNE_PASS` en double) |

### Performance / temps de réaction *(ajouté 2026-09-21 — recon dédiée du chemin chaud)*

> Constat : une certification (`/api/analyse` → `pipeline.ts`) enchaîne **~132 allers-retours PostGIS en
> SÉRIE**, dont **~122 (≈ 90 %) viennent de la boucle des 61 faisceaux** (61 × 2 requêtes séquentielles).
> Aucun cache sur le chemin chaud, aucun `statement_timeout` sur le pool de calcul. Estimation
> **structurelle** (non chronométrée) : **certification > 3 s probable** (plancher ~1,5-2 s, sans plafond).
> La cause n'est **pas** l'intensité de calcul (bien déléguée à PostGIS, set-based) ni le front — c'est le
> **nombre de round-trips sériels**. **P1 seul devrait ramener une certification en zone « correct » (1-3 s).**

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **P1** | 🟠 *(fort levier)* | M | ⬜ | **Batcher la détection d'obstacles des 61 faisceaux** (≈ 122 round-trips sériels → ≈ 2) via `unnest(...) WITH ORDINALITY` — **le motif existe déjà juste à côté**. ⚠️ touche le chemin du golden → rejeu Asnières + feu vert + commit séparé | boucle sérielle `faisceaux.ts:40` ; 2 req/faisceau `obstacles.ts:549,629` ; motif batch déjà présent `obstacles.ts:657,770,821` |
| **P2** | 🟠 | M | ⬜ | Paralléliser les étapes **indépendantes** de `construireEntree` (`Promise.all`) : obstacles principal, `faisceauxAmplitude`, immobilier, monuments, paysage. Seule `resoudreVueNature` reste après `faisceaux` | attentes sérielles indépendantes `pipeline.ts:118,128,146,151,161` ; dépendance réelle `pipeline.ts:140` |
| **P3** | 🟠 | S | ⬜ | Poser un `statement_timeout` sur le pool de **calcul** (aucun aujourd'hui — seulement sur analytics) + un **garde-fou de latence** (rejeu Asnières chronométré / EXPLAIN). Complète **G3** | `client.ts:8` (pool nu, non borné) vs motif existant `analytics/lecture/requete.ts:30` |
| **P4** | 🟡 | S | ⬜ | Mémoïser `chargerProfilDegagement` (config singleton `id=1` relue en base à **chaque** analyse) | `profilConfig.ts:58,83` (2 round-trips/analyse pour une config quasi constante) |

### Priorité 2 — Moyen terme / conception

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **M1** | 🟠 | M | ✅ | **Autorisation fail-closed** : un rôle inconnu/absent doit valoir « collaborateur sans droit », pas administrateur. **Committé le 2026-09-22 (`4e58530`)** après validation manuelle Arno + `npm test` complet vert (590 fichiers / 7755 tests). | `app/lib/admin/session.ts:116-118` (rôle ≠ 'collaborateur' → admin `permsToutes()`) + les 4 gardes (`garde.ts`, raccourci `sub===null`) |
| **M2** | 🟠 | M | ⬜ | Retirer ou borner la session « voie de secours » (`sub=null`) — non révocable hors rotation du secret | `garde.ts:150,88,115` ; émission `session/route.ts:93-108` |
| **M3** | 🟠 | M | ⬜ | Introduire un **registre de migrations** (table `schema_migrations` + mini-runner) → vérité unique sur le schéma déployé ; permet de retirer les ~57 sondes runtime | 226 migrations appliquées à la main, sans ledger ; sondes `information_schema`/`42P01` (169 occ.) |
| **M4** | 🟠 | M | ⬜ | Trancher les **deux moteurs de score** coexistants (~640 lignes calculées à chaque analyse mais absentes du total) ; réduire la signature `scoreTotal` | `analyse.ts:118,126` calculés ; `scoreTotal.ts:44` n'utilise que `noteDegagement` ; divergence `SPEC_score_qualite_vue.md` (/100) vs code (/80) |
| **M5** | 🟡 | M | ⬜ | Éliminer le pas de grille `0,5` dispersé (~12 littéraux) + les constantes **mortes** (0 usage) | `obstacles.ts:133,134,140,193,194,244,245,372,400,423,432,433` ; `BEAM_STEP_M`/`CORRIDOR_WIDTH_M`/`SPIKE_KERNEL_M`/`BEAM_RANGE_M` non consommées (`config.ts`) |

### Priorité 3 — De fond / structure & pérennité

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **F1** | 🔴 (stratégique) | L | ⬜ | **Réduire le bus factor** : outiller la relecture humaine déjà exigée sur golden/`config_scoring`/invariants/sécurité | 1 394 / 1 397 commits mono-auteur, ~19 commits/j ; politique écrite `CLAUDE.md §14` mais non outillée |
| **F2** | 🟠 | L | ⬜ | Découper le monolithe `app/page.tsx` (extraire `Home`, réduire l'état, traiter les `set-state-in-effect`) | `app/page.tsx` = 3 700 lignes, 92 `useState`, 17 `useEffect`, 2 `useMemo/useCallback` |
| **F3** | 🟠 | L | ⬜ | Migrer au fil de l'eau les ~37 tests « source-scan » (figent la **forme** du code) vers des assertions de **comportement** ; réconcilier migrations ↔ DB vivante | ~37 tests `readFileSync` d'un `.tsx` + `toContain`/regex (cf. `AGENTS.md`, section tests) |
| **F4** | 🟡 | S | ⬜ | Corriger la **doc périmée** (le compteur de certificat est décrit « non implémenté » alors qu'il est fait et atomique) | `CLAUDE.md §6` vs `db/certificatNumero.ts:37-58` |
| **F5** | 🟡 | M | ⬜ | (Sécurité) Encadrer les fetch serveur d'URL issues d'e-mails/GED de mairies derrière une allow-list d'hôtes (SSRF bornée) | `app/lib/veille/detectionRepo.ts:92-97`, `permis/drive.ts` |

---

## 3. Constat stratégique (hors action immédiate)

**Le « poids » réel du produit n'est pas où on l'imagine.** Le moteur « sans vis-à-vis » vendu au client
= **< 3 %** du code (`app/lib/svv` ≈ 3,2 k lignes). **~56 % du code est le back-office « permis de
construire »** (veille Sitadel, relève des mairies, GED, rattachement, projection… ≈ 64,5 k lignes).
Ce n'est pas un défaut, mais c'est là que se concentrent la complexité, le coût de maintenance et le bus
factor. À garder en tête pour toute décision de priorisation ou de recrutement.

---

## 4. Ce qui est déjà solide (à préserver)

- **Sécurité au-dessus de la moyenne** : argon2id + hash-leurre anti-énumération (`session/route.ts:8-134`),
  cookies `httpOnly`/`secure`/`SameSite=strict`, défense en profondeur (relecture `role/actif/perm` en base
  à chaque écriture, `garde.ts:143-168`), anti-IDOR systématique (404 indistinguable), secrets **serveur
  uniquement** (aucun `NEXT_PUBLIC_` secret, aucun `'use client'` ne lit `process.env`).
- **RGPD complet** : consentement historisé + effacement (anonymisation transactionnelle) + photos
  content-sniffées et **EXIF/GPS retirés** (`app/lib/internaute/photoDepot.ts:31-51`).
- **Moteur propre** : verdict = calcul pur sans I/O (`verdict.ts:103`), label **structurellement** découplé
  du score (`scoreTotal.ts:43-44`), invariant « aucun arrondi » tenu, `ST_Force2D` + EPSG:2154 partout.
- **Calcul lourd bien délégué** : balayage raster fait **en SQL** (`ST_Clip`/`ST_PixelAsCentroids` +
  `max FILTER GROUP BY`, `obstacles.ts:140-145`) ; le JS ne traite que ~400 cellules → pas CPU-bound.
- **Compteur de certificat vraiment atomique** (`db/certificatNumero.ts:37-58`, `INSERT … ON CONFLICT …
  RETURNING`, rollback → numéro libéré).
- **Migrations saines** (001→226 sans trou, idempotentes, auto-vérifiantes) et **garde-fous d'architecture
  exécutables** (le moteur ne PEUT pas importer l'analytics : ESLint `no-restricted-imports` + test de graphe
  d'imports).
- **Externalisation de la connaissance exceptionnelle** : 128 fichiers docs, invariants prouvés
  `fichier:ligne`, `FLAKES_CONNUS.md` avec niveaux de preuve — principal amortisseur du bus factor.

---

## 5. Détail par axe (résumé)

**Moteur** — forces : pureté, constantes dérivées verrouillées, golden découplé de la ligne live
(`profilConfig.ts:72-76`). Risques : golden hors gate quotidien (→ G2), pas de grille `0,5` dispersé et
constantes mortes (→ M5), deux modèles de score en quarantaine (→ M4).

**Données/PostGIS** — forces : zéro interpolation SQL sur le chemin certifiant (`obstacles.ts`), KNN `<->`
inliné (piège CTE évité), transactions correctes (`db/client.ts:32-46`). Risques : pools non durcis
(→ G3), pas de ledger de migrations (→ M3), SQL dynamique « sûr par convention » non contraint.

**Sécurité/RGPD** — forces : voir §4. Risques : fail-open vers admin (→ M1), break-glass non révocable
(→ M2), `/api/check-building` relique (→ G4), pas de throttle sur routes publiques lourdes (→ G4),
matériel d'auth mort + `.env` (→ G5), SSRF bornée GED (→ F5).

**Tests/dette** — forces : 8 795 cas, dette classique quasi nulle, échappatoires TS surtout dans les tests
(6 `as any` au total, tous dans `page.tsx`). Risques : `tsc` rouge + hors gate (→ G1), lint rouge (→ G1),
monolithe `page.tsx` (→ F2), tests source-scan fragiles (→ F3), bus factor (→ F1).

**Performance / temps de réaction** — forces : intensité de calcul bien gérée (set-based PostGIS, JS trivial
sur ~400 cellules) ; le chemin JS-lourd raster (`hauteurLidar.ts:154-165`) n'est **pas** sur le chemin de
certification (scripts seulement) ; requêtes individuelles déjà optimisées (KNN inliné, précédents
`validerOrigine` 1919→310 ms). Risques : **~132 round-trips sériels/certification, dont ~122 dans la boucle
des 61 faisceaux** (→ P1), étapes indépendantes non parallélisées (→ P2), pool de calcul non borné +
aucun garde-fou de latence (→ P3), config relue à chaque analyse (→ P4).

---

## 6. Rappel de méthode pour agir

- **Aucun de ces items n'est un correctif appliqué** : ce document ne fait que diagnostiquer.
- Ordre conseillé : **G1 → G2 → G3 → G4 → G5**, puis **P1 → P2 → P3 → P4** (fort levier perf), puis M*, puis F*.
- G2, M1, M2, M4, **P1**, F1 touchent des zones **sensibles** (golden, sécurité, score, chemin certifiant) →
  feu vert du porteur + relecture humaine + commit séparé. Pour P1 : le rejeu Asnières (`pipeline.itest.ts`)
  est le filet — le résultat par faisceau doit rester **bit-identique**.

---

## 7. Journal de révision

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-09-21 | Diagnostic initial (audit 4 axes, lecture seule) | Création du registre. Tous items ⬜. |
| 2026-09-21 | Recon performance + notation | Ajout de l'axe **Performance** (items P1-P4), de la **notation /20** (§1), et de la ligne Performance au §5. Verdict global mis à jour (temps de réaction lourd). |
| 2026-09-22 | Lot « gains rapides » | ✅ **G3** filet pg 3 pools (`4c193ca`) · ✅ **G1** `tsc --noEmit` dans le gate + 6 erreurs de type corrigées + `public/**` hors lint (`d74fe25`) · ✅ **G2** garde golden PUR sans base, égalité stricte (`137b5dc`). ✅ **M1** fail-closed (session.ts + 4 gardes) committé (`4e58530`) après validation manuelle Arno + `npm test` complet vert (590 fichiers / 7755 tests). ✅ **G4** `/api/check-building` supprimée (aucun appelant ; accord Arno ; commit `bb8b6e8`) ; 3 mentions « route supprimée » ajoutées aux docs ; `npm test` complet vert après purge du cache `.next` périmé. Résidu : throttle routes publiques (`/api/analyse`) NON traité. Les 42 erreurs lint pré-existantes (any/entités/hooks) restent hors périmètre. |
