# RAPPORT BUILD — proxy.ts : fail-open → fail-closed (Option C, defense-in-depth)

> Généré le 12/07/2026 — run autonome `/svav-build`. **Aucun commit effectué.** Livraison remise à Arno.

## Résumé exécutif

`proxy.ts` (garde de périmètre de l'admin Next 16) était **FAIL-OPEN** : `permissionRequise` renvoyait `null`
pour tout chemin non listé → le contrôle de permission était **sauté** → tout collaborateur authentifié passait
sur une route non déclarée. Gravité réelle faible (chaque route sensible a une garde interne en aval), mais
**foot-gun latent** : une future route ajoutée sans garde interne serait silencieusement ouverte.

**Durcissement livré (Option C)** : le défaut passe en **FAIL-CLOSED** — un chemin sous le matcher qui n'est ni
public, ni réservé au rôle administrateur, ni dans l'allow-list « authentifié-seul », ni déclaré dans
`PERMISSIONS` → **REFUSÉ** (403 API / redirect `/admin` page). Les **gardes internes** (`garde.ts`) sont
**conservées** : deux barrières indépendantes (périmètre fail-closed + révocation temps-réel en aval).

- **Revue adverse** (8 vecteurs) → **VALIDER**, aucune faille.
- **Recon indépendante** (8 invariants) → **VALIDER**, 8/8 PASS.
- **Golden `29.107259068449615`** : **intact**, prouvé par re-run isolé de `pipeline.itest.ts` (**11/11 PASS**).
- **Byte-unchanged** : `garde.ts`, `password.ts`, `motDePasse.ts` → diff **vide**.
- **Matcher inchangé** ; **aucune dépendance npm** ; tunnel public hors matcher.

> ⚠️ **`proxy.ts` était byte-unchanged (gelé).** Il a été débloqué **sur autorisation explicite d'Arno pour CE
> chantier uniquement**. À **re-geler** après commit (les 3 autres gelés — `garde.ts`/`password.ts`/`motDePasse.ts`
> — n'ont jamais été touchés).

---

## Phase 0 — Confirmation (lecture seule)

| Point | Constaté |
|-------|----------|
| (a) matcher exact | `['/admin', '/admin/:path*', '/api/admin/:path*']` (`proxy.ts:13`) — **conservé tel quel**. |
| (b) PERMISSIONS avant | 6 pages + 5 API (`config`, `cartes-annee`, `curation`, `banc-comparer`, `banc-profil-actif`). |
| (c) whitelist publique | `/admin/login`, `/api/admin/session` (`proxy.ts:105-110`). |
| (d) routes fail-open | `/api/admin/statistiques` (garde interne `exigerCompteActif('statistiques')`), `/api/admin/geo/communes` (idem), `/api/admin/audit` (`exigerAdministrateur`) — + `/api/admin/ping` (auth seule). |
| (e) authentifié-seul légitimes | `/admin`, `/api/admin/ping`, `/admin/compte/mot-de-passe` (+ route API). |

Aucune divergence avec la recon → poursuite.

---

## Phase 1 — Modifications (proxy.ts uniquement)

1. **`PERMISSIONS` complétée** (`proxy.ts:23-39`) : ajout `/api/admin/statistiques`→`statistiques`,
   `/api/admin/geo/communes`→`statistiques`.
2. **`estAudit()` ajouté** (`proxy.ts:78-83`) : `/admin/audit` + `/api/admin/audit` réservés au **RÔLE
   administrateur EN DUR** (comme `estAdministratif` pour `/comptes`). Fonction **séparée** d'`estAdministratif`
   pour ne pas brouiller le sens de cette dernière (référencée telle quelle par les handlers `comptes`).
3. **`CHEMINS_AUTHENTIFIE_SEUL` ajouté** (`proxy.ts:94-99`, `ReadonlySet`) : `/admin`, `/api/admin/ping`,
   `/admin/compte/mot-de-passe`, `/api/admin/compte/mot-de-passe` — passent SI authentifié, refusés sinon.
4. **Garde rôle-admin étendue à l'audit** (`proxy.ts:143`) : `(estAdministratif || estAudit) && role !== admin`.
5. **Défaut inversé en FAIL-CLOSED** (`proxy.ts:150-177`) : route de module déclarée → permission exigée ;
   sinon → autorisé UNIQUEMENT si rôle administrateur OU chemin authentifié-seul ; **tout le reste REFUSÉ**
   (403 API / redirect `/admin`). Remplace l'ancien `return null` fail-open.
6. Commentaires mis à jour (doc `PERMISSIONS`, bloc `doitChanger`, décision finale) pour décrire le fail-closed.

**Cartographie finale — 100 % des routes réelles couvertes** (28 routes API + 11 pages) :

| Surface | Couverture proxy | Garde interne (aval) |
|---|---|---|
| `session`, `login` | whitelist publique | (login) |
| `/admin`, `ping`, `compte/mot-de-passe` (×2) | `CHEMINS_AUTHENTIFIE_SEUL` | ping/compte : auto-gardés |
| `config` / page pilotage | perm `pilotage` | `exigerCompteActif('pilotage')` |
| `cartes-annee` (+`[id]`) / page | perm `cartes_annee` | `exigerCompteActif('cartes_annee')` |
| `statistiques` / page | perm `statistiques` **(ajout)** | `exigerCompteActif('statistiques')` |
| `geo/communes` | perm `statistiques` **(ajout)** | `exigerCompteActif('statistiques')` |
| `curation/**` (13) / page | perm `curation` (préfixe) | écritures : `exigerCompteActif('curation')` |
| `banc-comparer` / `banc-profil-actif` / page | perm `banc_test` | `aLaPermission('banc_test')` |
| page `internautes` | perm `internautes` | (pas d'API encore) |
| `comptes/**` (7) / page | `estAdministratif` (rôle) | `exigerAdministrateur` |
| `audit` (+ page) | `estAudit` (rôle) **(ajout)** | `exigerAdministrateur` |

---

## Phase 2 — Revue adverse → VALIDER (aucune faille)

Reviewer adverse, 8 vecteurs attaqués, tous neutralisés :
- **(a) Foot-gun fermé** : route fictive `/api/admin/route-fantome` + collaborateur `permsToutes` → **403** (chemin
  d'exécution tracé jusqu'à `proxy.ts:175`). L'ancien `return null` est mort.
- **(b) Tunnel public intact** : matcher strictement inchangé ; les 7 routes internaute (`/api/mesure`, `/api/origine`,
  `/api/analyse`, `/api/adresses-proches`, `/api/check-building`, `/api/sante`, `/api/analyse-photo`) sont hors
  matcher → `proxy()` jamais invoqué.
- **(c) Admin accès total** : rôle nommé ET voie de secours (`sub=null` → `role='administrateur'`) passent partout,
  routes inconnues incluses.
- **(d) Aucune régression** : matrice exhaustive — chaque route réelle tombe dans un bucket ; un collaborateur avec
  la bonne permission passe. Les sous-routes de lecture curation héritent bien du préfixe `curation`.
- **(e) 1re connexion non cassée** : `doitChanger` intercepte en amont (`proxy.ts:132`) ; `/admin/compte/mot-de-passe`
  atteignable ; déconnexion (`/api/admin/session`) en whitelist publique → toujours possible.
- **(f) Gardes internes conservées** : diff limité à `proxy.ts` + `proxy.test.ts` ; aucun handler ni `garde.ts` touché.
- **(g) Aucun trou de matching** : singulier/pluriel `compte`/`comptes` disjoints ; frontière de segment stricte ;
  query string exclue (`pathname`) ; trailing slash / casse → tombent au fail-closed (échec **sûr**, jamais bypass).
- **(h) Aucune boucle de redirection** : les refus de page pointent vers `/admin`, toujours autorisé
  (`CHEMINS_AUTHENTIFIE_SEUL`) ; non authentifié → `/admin/login` (public).

---

## Phase 3 — Tests

| Test | Résultat |
|------|----------|
| `app/lib/admin/proxy.test.ts` | **PASS** — 40 cas (24 existants **inchangés/verts** + 16 ajoutés : fail-closed, stats/geo/audit, allow-list) |
| Suite complète `npm test` | **PASS** — 76 fichiers, **884 passés**, 21 skipped, 0 échec |
| `tsc --noEmit` | **PASS** (les littéraux `Module` `'statistiques'` type-checkent) |
| **Golden `pipeline.itest.ts` (isolé)** | **PASS — 11/11**, golden `29.107259068449615` inchangé |

**Cas existants adaptés (documentés, non cassés)** : les deux tests `/admin` (accueil) et `/api/admin/ping` pour
un collaborateur reposaient implicitement sur le fail-open ; leurs titres/commentaires signalent désormais qu'ils
passent via l'**allow-list AUTHENTIFIÉ-SEUL** (un chemin non listé, lui, serait refusé — cf. bloc dédié). Aucune
assertion existante n'a dû être affaiblie.

---

## Phase 6 — Conformité SVAV

| Vérif | Résultat | Preuve |
|-------|----------|--------|
| **Golden `29.107259068449615`** | **PASS (inchangé)** | `pipeline.itest.ts` **isolé** : 11/11 PASS ; **+ re-run complet 54/54 vert**. Aucun fichier moteur touché. |
| **Byte-unchanged** (garde/password/motDePasse) | **PASS** | `git diff --stat` sur les 3 → **vide**. |
| **Matcher non élargi** | **PASS** | `proxy.ts:13` identique — tunnel public hors périmètre. |
| **Gardes internes conservées** | **PASS** | diff = `proxy.ts` + `proxy.test.ts` seulement. |
| **Aucune dépendance npm** | **PASS** | `package.json` hors diff. |
| **Gemini hors staging** | **PASS** | `adaptateurIaPhoto.ts`, `analyse-photo/route.ts` non touchés. |
| **Break-glass / throttle** | **PASS** | `session/route.ts`, `antiBruteforce.ts` non re-touchés par CE chantier. |
| **Verdict découplé** | **PASS** | modif 100 % dans l'auth de périmètre ; aucun lien verdict/score. |

> **Note golden (transparence)** : un PREMIER run d'intégration COMPLET (8 fichiers `.itest.ts`, ~150 s, base
> PostGIS partagée en parallèle) a rapporté **1 échec sur 54**. Ce n'était **PAS** le golden : rejoué **isolé**,
> `pipeline.itest.ts` passe **11/11** et le golden est bit-identique. Un **re-run complet** a ensuite été **tout
> vert : 8 fichiers / 54 tests / 0 échec** → l'échec initial était un **flake de contention DB** en parallèle
> (fichiers `.itest.ts` frappant la même base), **sans rapport** avec ce chantier : `proxy.ts` n'est inclus dans
> **aucun** `.itest.ts` (le set d'intégration = `app/**/*.itest.ts` uniquement, `proxy.test.ts` étant un test
> unitaire hors de ce set).

---

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

1. **`estAudit` séparé d'`estAdministratif`.** La cartouche disait de traiter `/audit` « comme estAdministratif ».
   *Décision* : j'ai créé une fonction **distincte** `estAudit` plutôt que d'ajouter les chemins audit dans
   `estAdministratif`. *Raison* : garder `estAdministratif` = « tuile /comptes uniquement » — nom et sens intacts,
   et surtout les commentaires des handlers `comptes/*.ts` qui référencent « proxy `estAdministratif` » restent
   **exacts** (pas de dérive documentaire dans des fichiers hors de ce chantier). *Alternative écartée* : élargir
   `estAdministratif` (aurait rendu son nom trompeur + créé des refs stale ailleurs). *Impact* : nul sur le
   comportement (les deux surfaces exigent le rôle administrateur).
2. **Portée de `geo` = `/api/admin/geo/communes` (exact), pas le préfixe `/api/admin/geo`.** *Raison* : rester
   fail-closed jusqu'au bout — une future route `/api/admin/geo/autre` non déclarée sera **refusée** plutôt
   qu'implicitement couverte. *Alternative écartée* : préfixe `/api/admin/geo` (plus permissif). *Impact* : toute
   nouvelle route `geo` devra être déclarée explicitement.
3. **`/admin/audit` (page) traitée en rôle-admin comme `/api/admin/audit`.** La cartouche listait les deux ; je
   confirme le choix (cohérent : l'API audit est déjà `exigerAdministrateur`). *Impact* : un collaborateur perd
   l'accès à la coquille de page `/admin/audit` (il n'y avait de toute façon aucune donnée, l'API étant admin-gated).

## B. DOUTES

- **Aucun doute bloquant.** Point d'attention : le fail-closed **exige désormais que toute nouvelle route de module
  soit déclarée dans `PERMISSIONS`** (sinon elle est refusée, même pour un collaborateur légitime). C'est
  l'effet **voulu** (fail-closed), mais c'est un changement de discipline à connaître pour les prochains chantiers
  (documenté dans la doc de la table `proxy.ts:16-22`).

## C. ÉCARTS DE CONFORMITÉ

- **Golden** : **inchangé** (isolé 11/11). Le flake du run complet (1/54) est tracé ci-dessus comme contention DB
  parallèle, hors périmètre — **pas** un mouvement du golden.
- Tous les autres invariants : **PASS**. Aucun écart.

---

## Recon de validation indépendante (Phase 8) → **VALIDER**

8/8 invariants PASS (byte-unchanged, matcher, gardes internes, moteur/golden, npm, Gemini, break-glass/throttle,
verdict découplé). Diff limité à `proxy.ts` (+66/-19) et `proxy.test.ts` (+104/-3). `tsc` exit 0, 40/40 tests proxy.
Observation mineure : le rapport docs/ (ce fichier) est produit — la recon en tenait lieu.

---

## Séquence de livraison (Arno)

1. Relire `proxy.ts` (défaut fail-closed + allow-lists) et le rapport (section A prioritaire).
2. Commit (format SVAV : un chantier = un commit) — diff = `proxy.ts` + `app/lib/admin/proxy.test.ts` + ce rapport.
3. **RE-GELER `proxy.ts`** (byte-unchanged) après commit : l'autorisation de déblocage était limitée à ce chantier.

## Confirmation finale

Aucun commit. Seul `proxy.ts` (débloqué sur autorisation) + son test modifiés. `garde.ts`/`password.ts`/`motDePasse.ts`
byte-identiques. Matcher inchangé, tunnel public intact. Golden `29.107259068449615` inchangé (isolé 11/11). Aucune
dépendance npm. Gardes internes conservées (défense en profondeur). Livraison prête.
