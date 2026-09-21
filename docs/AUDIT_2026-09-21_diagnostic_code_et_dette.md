# AUDIT & REGISTRE DE DETTE — Sans Vis-à-Vis®

> **Statut : DIAGNOSTIC À FROID — lecture seule, AUCUN code modifié par ce document.**
> Date du diagnostic : **2026-09-21**. Méthode : reconnaissance en lecture seule sur 4 axes
> (moteur de calcul, couche données/PostGIS, sécurité/auth/RGPD, tests & dette technique), chaque
> constat ancré `fichier:ligne`. Périmètre : code réel sous `app/app/` (≈ 116 000 lignes de code
> + 81 000 lignes de tests, mesuré).
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
autour : le filet de contrôle a des trous, et la connaissance repose sur une seule personne.**

### Tableau de bord

| Domaine | Niveau | Synthèse |
|---|---|---|
| Moteur de calcul (verdict/score) | 🟢 Solide | Calcul pur isolé, label découplé du score, aucun arrondi, invariants tenus |
| Sécurité & RGPD | 🟢 Solide | Auth sérieuse, anti-fraude, RGPD complet — **1 réserve de conception (fail-open admin)** |
| Base de données / spatial | 🟢 Solide | SQL 100 % paramétré, PostGIS discipliné — **robustesse des connexions à durcir** |
| Tests (volume & rigueur) | 🟢 Solide | 8 795 cas de test, garde-fous d'architecture exécutables |
| Dette technique « classique » | 🟢 Très bon | ~6 TODO / 0 FIXME sur 116 k lignes |
| **Filet de contrôle (le « gate »)** | 🔴 **Faible** | **`tsc` rouge + hors gate ; golden hors `npm test` — point noir technique** |
| **Pérennité / dépendance humaine** | 🔴 **Faible** | **Bus factor = 1 — point noir stratégique** |

---

## 2. Registre priorisé des actions

> Sévérité : 🔴 élevée · 🟠 moyenne · 🟡 faible. Effort indicatif. Statut : ⬜ à faire.

### Priorité 1 — Gains rapides / filet de contrôle (jours, fort impact)

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **G1** | 🔴 | S | ⬜ | Mettre `tsc --noEmit` **et** `eslint` dans le contrôle de fin ; corriger l'erreur de type en **production** + les ~42 erreurs lint | `ADemanderVue.tsx:273` (type prod) ; lint concentré `page.tsx` (22), `FaisceauMap.tsx` (11) |
| **G2** | 🔴 | S | ⬜ | **Sceller le golden dans `npm test`** : assertion pure `analyser(...) === 29.107259068449615` dans un vrai `.test.ts` (sans PostGIS) | golden uniquement dans `app/lib/db/pipeline.itest.ts:42` (suite d'intégration, **hors** `npm test`) |
| **G3** | 🟠 | S | ⬜ | Durcir les 3 pools : ajouter `pool.on('error', …)` (évite crash process) + timeouts/bornage du pool principal | `db/client.ts:8` (pool nu) ; gabarit déjà présent `analytics/pool.ts:33-41` |
| **G4** | 🟠 | S | ⬜ | Fermer/valider `/api/check-building` (public, non authentifié, lat/lon interpolés dans Overpass QL, log GPS) + throttle des routes publiques lourdes | `app/api/check-building/route.ts:24-38` ; `/api/analyse` sans throttle |
| **G5** | 🟡 | S | ⬜ | Supprimer le code d'auth mort + purger le secret en clair du `.env` ; dédupliquer `SMTP_PERSONNE_PASS` ; rafraîchir `.env.example` | `app/lib/admin/password.ts` (SHA-256 non salé, 0 importeur) ; `.env` (`ADMIN_PASSWORD` clair, `SMTP_PERSONNE_PASS` en double) |

### Priorité 2 — Moyen terme / conception

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **M1** | 🟠 | M | ⬜ | **Autorisation fail-closed** : un rôle inconnu/absent doit valoir « collaborateur sans droit », pas administrateur | `app/lib/admin/session.ts:116-118` (rôle ≠ 'collaborateur' → admin `permsToutes()`) |
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

---

## 6. Rappel de méthode pour agir

- **Aucun de ces items n'est un correctif appliqué** : ce document ne fait que diagnostiquer.
- Ordre conseillé : **G1 → G2 → G3 → G4 → G5**, puis M*, puis F*.
- G2, M1, M2, M4, F1 touchent des zones **sensibles** (golden, sécurité, score) → feu vert du porteur +
  relecture humaine + commit séparé.

---

## 7. Journal de révision

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-09-21 | Diagnostic initial (audit 4 axes, lecture seule) | Création du registre. Tous items ⬜. |
