# RAPPORT DE BUILD — Durcissement break-glass argon2 (voie de secours du login admin)

> Chantier autonome `/svav-build`. Livraison remise à Arno **sans commit**. Se lit seul.
> ⚠️ **SÉQUENCE DE DÉPLOIEMENT OBLIGATOIRE** en fin de rapport : provisionner `ADMIN_PASSWORD_ARGON2`
> **AVANT** de committer/déployer, sinon la voie de secours devient indisponible.

---

## Phase 0 — confirmation (lecture seule)

Les 5 faits établis par la recon préalable sont **confirmés** :
1. **Branche secours** : `app/(admin)/api/admin/session/route.ts`, POST, `if (identifiant === '')` → comparaison du
   mot de passe partagé → `session {sub:null, role:'administrateur'}`.
2. **`motDePasseValide`** vivait dans `app/lib/admin/password.ts` (**BYTE-UNCHANGED**) : `timingSafeEqual(sha256(saisi),
   sha256(process.env.ADMIN_PASSWORD))` — SHA-256 rapide, secret en clair.
3. **argon2 dispo** : `app/lib/admin/motDePasse.ts` (**BYTE-UNCHANGED**) exporte `hacher(clair)` (argon2id) et
   `verifier(clair, hachage)` (ne throw JAMAIS, `false` si hash absent/malformé). `session/route.ts` **importait déjà
   `verifier`** (voie nommée). → **import-only**, aucun fichier gelé édité.
4. **CLI** `app/scripts/admin.ts` (**MODIFIABLE**) : sous-commandes `creer|reset|secours|lister`, saisie MASQUÉE
   (`lireMasque`/`saisirMotDePasse`), pas de commande « hash d'une chaîne ».
5. **`.env`** lu via `process.env` (`ADMIN_PASSWORD_ARGON2` s'ajoute à côté de `ADMIN_PASSWORD`/`ADMIN_SESSION_SECRET`).

`motDePasseValide` n'a qu'**un seul site d'appel** (`session/route.ts`) → sa suppression de l'import n'orpheline rien
d'autre. **Aucun fait ne diverge** → construction lancée.

---

## Fichiers touchés (4, minimal)

- `app/(admin)/api/admin/session/route.ts` — branche secours : `motDePasseValide(password)` → `await verifier(password,
  process.env.ADMIN_PASSWORD_ARGON2 ?? '')`. Import de `motDePasseValide`/`password.ts` **retiré** (plus utilisé ;
  `verifier` déjà importé). Exemption throttle du secours et forme de `echec()` **inchangées**. Commentaires mis à jour.
- `app/(admin)/api/admin/session/route.test.ts` — tests secours pilotés par `verifier` + `ADMIN_PASSWORD_ARGON2` ;
  ajout d'un test **FAIL-CLOSED** (var absente → `verifier(password,'')` → 401 propre). Mock `password.ts` retiré (mort).
- `app/scripts/admin.ts` — nouvelle sous-commande **`secours-hash`** : hache un secret saisi MASQUÉ via `hacher()`,
  imprime la ligne `ADMIN_PASSWORD_ARGON2=<hash>`, **n'écrit RIEN en base** (mais requiert `DATABASE_URL`, fourni par
  `.env` — le script importe statiquement la couche DB ; cf. §A3), **sans logger le clair**.
- `package.json` — script `admin:secours-hash` (aucune dépendance ajoutée).
- `app/lib/auth/antiBruteforce.ts` — **commentaire seul** (revue F2) : sa doc-string décrivait la voie de secours en
  SHA-256 (périmée après bascule) → corrigée en argon2. Aucun changement de code.

**Aucun** fichier moteur / Gemini / `password.ts` / `motDePasse.ts` / `proxy.ts` / `garde.ts` touché.

---

## A. DÉCISIONS HORS-SPECS

### A1 — CLI `secours-hash` : réutilise la saisie MASQUÉE existante + confirmation
- **Trou de spec :** « secret en argument OU prompt stdin masqué, au choix le plus sûr ».
- **Décision :** **prompt stdin MASQUÉ** (réutilise `saisirMotDePasse` du CLI : double saisie masquée, refuse vide/non
  concordant) — le plus sûr (le secret n'apparaît ni dans l'historique shell, ni dans `ps`, ni à l'écran). Sortie =
  la seule ligne `ADMIN_PASSWORD_ARGON2=<hash>` (le HASH est public/inoffensif — argon2id salé, ne révèle pas le secret).
- **Alternative écartée :** secret en argument `--secret` (resterait dans l'historique/`ps`). **Impact :** ergonomie
  identique aux autres commandes admin ; sécurité maximale.

### A2 — Script npm `admin:secours-hash` ajouté (cohérence, PAS une dépendance)
- `package.json` gagne un script (comme `admin:creer/reset/secours/lister`). **Ce n'est pas une dépendance npm**
  (`dependencies`/`devDependencies` inchangées — vérifié). Alternative : invocation directe `npx tsx …`. Retenu le
  script pour l'ergonomie.

### A3 — `secours-hash` n'ÉCRIT rien en base, mais requiert `DATABASE_URL` (via `.env`) — corrigé après revue F1
- **Correction (revue F1) :** `secours-hash` ne fait que hacher un secret (aucune écriture/lecture DB). J'avais
  d'abord court-circuité la garde `DATABASE_URL` pour cette sous-commande, mais c'était TROMPEUR : `admin.ts` importe
  STATIQUEMENT la couche DB (`comptes` → `db/client`), qui **lève au chargement du module** si la var manque — la
  garde était donc du code mort. **Corrigé :** garde `DATABASE_URL` rétablie pour toutes les sous-commandes +
  commentaire honnête. En pratique la var vient de `.env` (`dotenv/config`) → la commande fonctionne dans le repo.
- **Alternative écartée :** rendre `secours-hash` réellement DB-indépendant (imports dynamiques) — `ErreurCompte` est
  dans la chaîne DB → refactor hors périmètre pour ce petit chantier.

---

## B. DOUTES

### B1 — ORPHELINS assumés : `ADMIN_PASSWORD` + `password.ts` deviennent code mort
Après la bascule, `password.ts` (et donc `ADMIN_PASSWORD`) n'est plus appelé par aucune route (grep : seule mention
restante = un COMMENTAIRE dans `route.ts`). **Non supprimés ici** : `password.ts` est **byte-unchanged** (gelé) et leur
retrait relève d'un **chantier séparé** (avec `password.test.ts`). À nettoyer plus tard par Arno. Aucun risque
fonctionnel (code mort, jamais exécuté).

### B2 — Déploiement : la voie de secours est INDISPONIBLE tant que `ADMIN_PASSWORD_ARGON2` n'est pas posée
**Bascule nette + fail-closed** : si la var n'est pas provisionnée, `verifier(password, '')` renvoie `false` → la voie
de secours échoue (401) pour TOUT mot de passe. C'est voulu (fail-closed, pas de crash, pas de fuite), mais cela impose
une **séquence de déploiement stricte** (voir fin de rapport). Filet indépendant : la CLI `admin:secours` (réactivation
d'un compte nommé en base) reste disponible si le break-glass navigateur est momentanément indisponible.

### B3 — Sécurité du secret partagé (rappel)
argon2 (lent) freine désormais fortement le brute-force de la voie non throttlée (débit ~dizaines/s/cœur vs
~millions/s en SHA-256) — c'est le but. Le secret `ADMIN_PASSWORD_ARGON2` doit néanmoins rester **à haute entropie**
(voie non throttlée par conception break-glass). C'est un net progrès vs l'état pré-chantier.

### B4 — Micro-canal temporel « break-glass configuré ? » (revue F3, informatif)
Un échec de la voie de secours est RAPIDE si `ADMIN_PASSWORD_ARGON2` est absente (hash vide → argon2 throw → catch),
LENT si elle est configurée (argon2 complet). Un attaquant peut donc distinguer « le break-glass est-il provisionné ? »
(état de config BINAIRE) — jamais le secret lui-même, et sans avantage de brute-force (le cas configuré reste lent).
Acceptable pour un fail-closed ; mentionné par exhaustivité. Fermerait totalement en exécutant un argon2 « leurre » de
temps constant même quand la var manque — non fait (complexité disproportionnée pour un état de misconfig transitoire).

---

## C. ÉCARTS DE CONFORMITÉ (batterie Phase 6)

| Vérification | Résultat | Preuve |
|---|---|---|
| **BYTE-UNCHANGED** (password/motDePasse/proxy/garde) | ✅ PASS | `git diff` sur les 4 fichiers = **VIDE** (bit-identiques). `verifier` importé = **import-only** (déjà présent). |
| **Golden `29.107259068449615`** inchangé | ✅ PASS | Chantier route/CLI, hors moteur. `pipeline.itest` **rejoué 11/11** (134 s) → bit-identique. |
| **Bascule NETTE, aucun fallback SHA-256** | ✅ PASS | `motDePasseValide` n'est plus appelé (grep : 1 seule mention = commentaire) ; branche secours = **uniquement** `verifier(…, ADMIN_PASSWORD_ARGON2 ?? '')`. |
| **Pas de throttle réintroduit sur le secours** | ✅ PASS | `cleThrottle === '' ? {bloque:false} : …` intact ; test « BREAK-GLASS » (secours passe malgré throttle bloquant, `verifierThrottle` non appelé). |
| **FAIL-CLOSED propre (var absente → 401, pas de throw)** | ✅ PASS | `verifier(password,'')` → `false` (`motDePasse.test.ts` « hash malformé → false ») ; test dédié « FAIL-CLOSED » (401, message générique, `verifier` appelé avec `''`). |
| **Anti-énumération préservé** | ✅ PASS | même `echec()` (401 « Identifiants invalides ») que la var manque, soit vide, soit secret faux. |
| **Aucune dépendance npm** | ✅ PASS | `package.json` : seul un SCRIPT ajouté ; `dependencies`/`devDependencies` **inchangées**. |
| **CLI n'écrit rien en base + secret masqué** | ✅ PASS | `secours-hash` ne fait AUCUN appel `comptes`/`query` (n'écrit rien) ; il requiert `DATABASE_URL` (via `.env`, import statique de la couche DB — §A3/F1) ; saisie via `saisirMotDePasse` (masquée) ; imprime le hash, jamais le clair. |
| **Non-régression voie nommée** | ✅ PASS | tests (a)/(b)/(d)/leurre/throttle nommé inchangés et verts. |
| **tsc / eslint / next build** | ✅ PASS | tsc 0 erreur ; eslint 0 (fichiers touchés) ; `✓ Compiled successfully`. |
| **Unit / intégration** | ✅ PASS | unit **861 passés / 21 skipped** (dont FAIL-CLOSED) ; golden rejoué 11/11. |

---

## SÉQUENCE DE DÉPLOIEMENT OBLIGATOIRE (Arno)

⚠️ **Dans cet ordre — ne PAS committer/déployer avant l'étape 2**, sinon la voie de secours navigateur est indisponible.

1. **Générer le hash** du secret break-glass (saisie masquée, rien en base) :
   ```zsh
   npm run admin:secours-hash
   # → colle le secret (masqué), confirme ; sortie : ADMIN_PASSWORD_ARGON2=$argon2id$...
   ```
2. **Poser la variable** dans `.env` (et dans l'environnement de prod) :
   ```
   ADMIN_PASSWORD_ARGON2=$argon2id$v=19$m=...   (la ligne imprimée à l'étape 1)
   ```
   Redémarrer l'app pour qu'elle lise la nouvelle var.
3. **SEULEMENT ENSUITE** : committer ce chantier et déployer. Vérifier la connexion via la voie de secours
   (identifiant vide + le secret) avant de retirer l'ancien `ADMIN_PASSWORD` (chantier de nettoyage séparé, B1).

> Tant que l'étape 2 n'est pas faite : le login NOMMÉ fonctionne normalement ; seule la voie de secours navigateur
> échoue (401 fail-closed). Le filet `npm run admin:secours` (réactivation d'un compte nommé) reste utilisable.

---

## Phase 3 — Revue adverse et arbitrage → **VALIDER** (2 correctifs mineurs appliqués, 1 note)

Un sous-agent adverse a tenté les 8 axes (réintroduction SHA-256, DoS-lockout secours, énumération, crash fail-closed,
CLI, byte-unchanged, non-régression nommée, golden). **Verdict : VALIDER** — objectif atteint et complet ; les axes
CRITIQUES (a) réintroduction SHA-256 et (d) crash/fuite fail-closed sont **PROPRES** (prouvés code + test, dont le
câblage `?? ''` → `verifier(…, '')` → false sans throw). Constats et arbitrage :
- **F1 (accuracy, non-bloquant) → CORRIGÉ.** La garde « secours-hash sans DATABASE_URL » était INEFFECTIVE (le
  chargement statique de `db/client` lève avant `main()`). Prétention retirée (§A3).
- **F2 (dérive doc, non-bloquant) → CORRIGÉ.** Doc-string d'`antiBruteforce.ts` (voie de secours en SHA-256) périmée
  après bascule → mise à jour (argon2 sur les deux voies).
- **F3 (timing, informatif) → DOCUMENTÉ (B4).** Micro-canal distinguant « break-glass configuré ? » (binaire),
  jamais le secret, sans avantage brute-force. Tracé, non corrigé (misconfig transitoire).

Aucun constat bloquant ; les axes de sécurité durs sont propres.

## Phase 8 — Recon de validation indépendante → **VALIDER** (après correction doc)

Une recon LECTURE SEULE indépendante a confirmé que **le code est impeccable et déployable** (points 1–7 PASS) :
- **Bascule NETTE, zéro SHA-256** : branche secours = uniquement `verifier(password, ADMIN_PASSWORD_ARGON2 ?? '')` ;
  `motDePasseValide` supprimé de l'import ; grep → plus aucun appel dans le flux de login.
- **Exemption throttle intacte** (secours jamais throttlé), **FAIL-CLOSED propre** (var absente → `verifier(…,'')` →
  false sans throw → 401 générique, prouvé code + test), **4 fichiers gelés bit-identiques** (`git diff` vide),
  `package.json` script-only, **non-régression voie nommée + golden intacts**, F1/F2 bien corrigés.
- Les 3 déclencheurs durs de MODIFIER sont tous PROPRES (aucune voie SHA-256, aucun fichier gelé modifié, fail-closed
  sans crash/fuite).

La recon a rendu **MODIFIER pour une SEULE raison : une incohérence documentaire** — deux passages du rapport (liste
« Fichiers touchés » et table §C) conservaient la prétention pré-F1 « secours-hash sans exigence `DATABASE_URL` », en
contradiction avec §A3 et le code (garde rétablie). **Corrigé** : les deux passages disent désormais « n'écrit rien en
base mais requiert `DATABASE_URL` via `.env` ». (Note cosmétique de la recon sur `proxy.ts` « inexistant » = fausse
alerte : `proxy.ts` est à la RACINE du repo — `./proxy.ts`, 6147 o —, bien couvert par la preuve byte-unchanged.)

Après cette correction de 2 lignes (documentation seule, zéro code), le chantier est **VALIDER sans réserve**.

**Livraison prête pour Arno.** Aucun commit effectué. Provisionner `ADMIN_PASSWORD_ARGON2` AVANT de committer/déployer
(séquence obligatoire ci-dessus).
