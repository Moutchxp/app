# RAPPORT DE BUILD — M2, Lot 7 : audit interne agrégé + détection brute-force (throttle progressif)

> Chantier autonome `/svav-build`. Livraison remise à Arno **sans commit**. La migration 021 est livrée mais
> **NON exécutée** (Arno l'applique à la main). Ce rapport se lit seul.

---

## Phase 0 — recon bloquante (synthèse, chemins + preuves)

**0.1 — Route de login + journalisation actuelle.** Route = `app/(admin)/api/admin/session/route.ts` (POST).
- **Deux voies** : compte nommé (identifiant + mot de passe → `admin_utilisateur`) et VOIE DE SECOURS
  (identifiant vide + mot de passe partagé, `sub=null`).
- **À l'ÉCHEC : rien n'est journalisé aujourd'hui** — la route renvoie un 401 générique (`echec()`), sans trace.
- **Au SUCCÈS** : `marquerConnexion(compte.id)` = `UPDATE admin_utilisateur SET derniere_connexion_a = now()`
  (`comptes.ts:77`) — une seule valeur ÉCRASÉE, pas une série. Le `jti` de session n'est tracé dans
  `curation_patrimoine_log` (colonnes de 013) que si une action de curation a lieu — ce n'est PAS un journal de
  connexions. ⇒ **Aucune série temporelle de connexions (succès NI échecs) n'existe aujourd'hui.**
- **Constat clé** : le Lot 7 CRÉE la source. Il branche les compteurs d'audit AGRÉGÉS `analytics_admin_jour`
  (événements `admin_connexion` / `admin_connexion_echec`) **provisionnés au Lot 1** (migration 018, catalogue)
  mais **jamais câblés** — et ajoute l'état de throttle `login_echec`.

**0.2 — Throttle existant ?** NON. Le commentaire de la route disait « Pas de rate-limit ici » ; aucun
throttle/rate-limit/compteur d'échecs nulle part (grep). Le Lot 7 l'ajoute — rien à dupliquer.

**0.3 — Byte-unchanged & branchement.** La route importe `motDePasseValide` (`password.ts`) et `verifier`
(`motDePasse.ts`) mais ne fait que les **appeler** ; elle n'importe ni `proxy.ts` (racine) ni `garde.ts`. Le
throttle se branche **DANS `session/route.ts`** (modifiable), EN AMONT de `verifier`, **sans éditer** les 4
fichiers byte-unchanged. ✅

**0.4 — Migrations.** Dernière = `020`. **Prochain numéro libre = `021`.** Livrée : `021_lot7_audit_bruteforce.sql`.

**0.5 — Cron de maintenance.** `maintenance.ts` (Lot 3) porte `purgerCompteur` + `lireEntier` (rétention lue de
`analytics_retention`). Le Lot 7 ajoute `purgerLoginEchec` (même moule, rétention config-driven, TOLÉRANT à
l'absence de table tant que 021 n'est pas appliquée).

**0.6 — Écran admin & permission.** Écrans sous `app/(admin)/admin/(protected)/<slug>/`. Nav = `menuAdmin.ts`.
Deux gardes serveur : `exigerCompteActif(request, perm)` (permission de module) et `exigerAdministrateur(request)`
(**rôle administrateur**, relit `role`+`actif` en base) — utilisé par la tuile « Administratif ». Il n'existe pas
de permission « audit » ; en créer une (`perm_audit`) rippleait dans tout le cœur auth (migration + `session.ts`
+ `comptes.ts` + JWS existants). **Décision : gardé sur le RÔLE administrateur** (§A1).

---

## Fichiers touchés

**Nouveau**
- `db/migrations/021_lot7_audit_bruteforce.sql` — table `login_echec` (SANS IP) + config throttle/pic + rétention.
- `app/lib/auth/antiBruteforce.ts` (+ `.test`) — throttle progressif, notes best-effort, compteurs d'audit agrégés.
- `app/lib/audit/lecture.ts` (+ `.test`) — audit AGRÉGÉ (READ ONLY) : série succès/échecs + détection de pics.
- `app/(admin)/api/admin/audit/route.ts` (+ `.test`) — `GET /api/admin/audit`, garde rôle administrateur.
- `app/(admin)/admin/(protected)/audit/{page.tsx, affichage.ts, affichage.test.ts}` — écran d'audit (client pur).

**Modifié**
- `app/(admin)/api/admin/session/route.ts` (+ `.test`) — branchement du throttle (429 + Retry-After ; note
  échec/succès), EN AMONT de la vérification. `password.ts`/`motDePasse.ts` seulement appelés, jamais édités.
- `app/lib/analytics/maintenance.ts` (+ `.test`) — `purgerLoginEchec` + appel dans le job.
- `app/(admin)/admin/(protected)/menuAdmin.ts` (+ `.test`) — tuile « Audit » (administrateur uniquement).

**Aucun** fichier moteur / Gemini / `password.ts` / `motDePasse.ts` / `proxy.ts` / `garde.ts` touché.

---

## A. DÉCISIONS HORS-SPECS *(à contrôler en priorité)*

### A1 — Audit gardé sur le RÔLE administrateur (pas une nouvelle permission)
- **Trou de spec :** « Nomme la perm à utiliser » (0.6).
- **Décision :** `exigerAdministrateur` (rôle administrateur, révocation-effective) — comme la tuile
  « Administratif ». Tuile de nav administrateur-only (`menuAdmin.ts`).
- **Alternative écartée :** créer `perm_audit` (colonne + migration + `session.ts`/`comptes.ts` + JWS existants) —
  trop de surface sur le cœur auth pour ce lot, et un audit de SÉCURITÉ est une fonction d'administration, pas
  une permission déléguable. **Impact :** cohérent avec l'existant ; barrière effective = le garde du handler.

### A2 — Source d'audit = `analytics_admin_jour` (agrégé, provisionné Lot 1), pas un journal par personne
- **Trou de spec :** 0.1 montre qu'aucune série n'existe. Le Lot 7 doit créer la source.
- **Décision :** incrémenter à l'écriture les compteurs AGRÉGÉS `admin_connexion` / `admin_connexion_echec`
  (`analytics_admin_jour` : jour × événement × module — module NULL ici). **Aucun identifiant, aucune IP.**
- **Alternative écartée :** un journal (identifiant, ts) des connexions → serait un timeline individuel (viole
  Q-C=1). **Impact :** l'audit est agrégé par construction ; reconstruire un timeline est impossible (la source
  ne porte pas d'identité).

### A3 — Config throttle/pic dans `analytics_config` + rétention dans `analytics_retention`
- **Trou de spec :** « table de config existante (ou analytics_config si c'est le bon foyer) ».
- **Décision :** paramètres throttle (`login_throttle_seuil/fenetre_s/base_s/max_s`) + détection de pic
  (`audit_pic_min/facteur`) dans `analytics_config` ; rétention (`login_echec_jours`) dans `analytics_retention`.
- **Alternative écartée :** une table `auth_config` dédiée — plus « propre » domaine, mais ajoute une table + un
  lecteur ; `analytics_config` est déjà le foyer runtime-éditable des réglages d'ops (héberge `bots_ua_motif`).
  **Impact :** pilotage sans code respecté ; le throttle lit au runtime avec repli codé sûr.

### A4 — Clé de throttle = chaîne identifiant NORMALISÉE (minuscules), `''` pour la voie de secours
- **Décision :** `identifiant.trim().toLowerCase()` → un attaquant ne contourne pas par la casse (cohérent avec
  la recherche de compte insensible à la casse). `''` throttle la voie de secours (mot de passe partagé).
- **Impact :** anti-énumération (keyé sur la chaîne, existante ou non) + anti-bypass.

### A5 — Seules les VÉRIFICATIONS échouées sont comptées à l'audit (pas les tentatives déjà throttlées)
- **Décision :** une requête throttlée (429) renvoie AVANT `noterEchec` → elle n'incrémente pas
  `admin_connexion_echec`. L'audit compte les échecs de vérification réels ; le début d'une attaque (avant que
  le throttle morde) apparaît en pic, le reste est déjà mitigé.
- **Impact :** l'audit reste honnête (pic au démarrage de l'attaque) ; documenté.

### A6 — Grain jour/semaine/mois, PAS « heure » (anti-timeline)
- **Décision :** `analytics_admin_jour` est au grain JOUR ; un grain sous-jour n'existe pas au repos et
  s'approcherait d'un timeline. `validerFenetre` rejette « heure ». **Impact :** cohérent SPEC_M2 §4.

### A7 — La voie de secours ('') est le BREAK-GLASS : EXEMPTÉE du throttle (correctif revue F1)
- **Décision (révisée après la red team) :** la voie de secours (identifiant vide) n'est **JAMAIS** throttlée —
  c'est la corde de rappel d'Arno ; la throttler créait un DoS-lockout du break-glass (un attaquant flood `''` →
  Arno bloqué). Elle reste protégée par `motDePasseValide` (**comparaison SHA-256 à temps constant** du secret
  partagé `ADMIN_PASSWORD`, INCHANGÉ vs baseline pré-Lot-7) + la CLI `admin:secours` (hors route).
- **Nuance sécurité (importante pour Arno) :** SHA-256 est RAPIDE (pas un KDF lent) et la voie de secours n'est pas
  throttlée → le secret partagé `ADMIN_PASSWORD` doit rester **à HAUTE ENTROPIE**. C'est l'état pré-Lot-7 (aucune
  régression), mais à garder en tête. **Impact :** il existe toujours une voie de connexion non throttlée (pas de
  DoS-lockout système). Le throttle ne s'applique qu'aux comptes NOMMÉS (argon2 = frein primaire côté nommé).

---

## B. DOUTES

### B1 — FAIL-SAFE : pendant une panne de la DB de détection, le throttle laisse tout passer
`verifierThrottle` retourne `{bloque:false}` sur erreur DB (jamais bloquer un login légitime). Conséquence : si
le pool analytique est indisponible, la protection brute-force est temporairement OFF (le login normal continue).
**Atténuation :** le hachage argon2 (temps constant) impose un délai naturel même sans throttle. Compromis
« ne jamais enfermer un admin dehors » > « bloquer en cas de panne ». À valider par Arno.

### B2 — Password-spraying (1 source, N comptes) HORS v1 — assumé
Le compteur est par identifiant. Une source qui tente 1 essai sur N comptes différents reste sous le seuil de
chaque identifiant → non throttlée. **C'est explicitement hors périmètre v1** (le couvrir exigerait une empreinte
réseau/IP → rouvrirait Q-C=1 → Lot 7bis). Documenté, à trancher par Arno si le besoin apparaît.

### B3 — `proxy.ts` ne garde pas `/admin/audit` par le rôle (byte-unchanged)
`proxy.ts` (byte-unchanged) ne mappe ni `/admin/audit` ni `/api/admin/audit` → un utilisateur authentifié les
atteint au niveau proxy, mais le garde `exigerAdministrateur` du handler refuse les données (403). **Barrière
effective = le handler** (même schéma que `/api/admin/statistiques`, cf. Lot 5 B1). Ajouter ces chemins à
`estAdministratif` de `proxy.ts` (défense en profondeur) est un suivi hors périmètre (proxy.ts byte-unchanged).

### B4 — Résiduel F1 : un compte NOMMÉ ciblé peut rester throttlé pendant une attaque soutenue
Après le correctif break-glass (voie `''` exemptée), le SYSTÈME n'est jamais verrouillé (Arno passe toujours). Mais
un attaquant qui connaît l'e-mail d'un compte **nommé** (collaborateur) peut le maintenir en 429 tant que dure
l'attaque (le throttle est par identifiant, sans IP). **C'est une limite INHÉRENTE au throttle sans IP** : impossible
de distinguer l'attaquant du titulaire légitime quand ils partagent la clé (l'identifiant). **Options pour Arno :**
(a) accepter (standard ; argon2 est le vrai frein ; le throttle s'auto-guérit) ; (b) ajouter une voie de récupération
par compte (ex. réinitialisation hors-bande) ; (c) rouvrir une clé réseau (IP) → hors Q-C=1 (Lot 7bis). Recommandation :
(a) + documenter, argon2 borne le débit de devinettes.

### B5 — F2 : rafale concurrente sous le seuil (TOCTOU)
`verifierThrottle` lit `count(*)` puis décide ; `noterEchec` insère séparément. N requêtes SIMULTANÉES lisent le même
compte avant tout INSERT → une salve de `seuil` essais passe par cycle (chacun payant argon2). Le throttle s'arme au
cycle suivant. **Impact borné** par argon2 (chaque essai = un hachage lent). **Options :** (a) accepter (borné,
per-round) ; (b) rendre check+enregistrement atomiques (INSERT+count en une instruction) — mais risque de
sur-alimenter le compteur par les requêtes throttlées (aggrave B4) et complexité en chemin critique. **Non corrigé**
volontairement : l'atomicité naïve aggrave le DoS (B4) ; à trancher par Arno. Le compteur d'AUDIT, lui, est atomique
(`ON CONFLICT DO UPDATE`) — pas de double comptage.

### B6 — F6 : le reset au succès est un canal auxiliaire (faible bande passante)
`noterSucces` supprime les `login_echec` de l'identifiant au succès. Un attaquant qui maintient l'état de throttle
d'un identifiant ciblé et le sonde peut détecter un reset qu'il n'a pas causé → infère qu'un login a réussi (compte
réel + horodatage GROSSIER). **Canal bruité, faible bande passante, exige un ciblage actif soutenu** ; n'affecte PAS
la table d'audit (agrégée, propre). **Arbitrage UX/vie privée (à trancher par Arno) :** garder le reset au succès
(bonne UX : un admin qui se trompe puis réussit n'est plus throttlé) vs le retirer (laisser expirer par la fenêtre W
→ ferme le canal mais l'admin peut rester throttlé jusqu'à W après un succès). **Retenu : reset conservé** (UX), canal
documenté ; décision déférée à Arno (la revue elle-même la défère au porteur).

### B7 — F3 : latence de login couplée à la santé de la DB analytique
Un login admin exécute jusqu'à ~4 requêtes analytiques séquentielles (throttle + notes). Bornées par les timeouts
courts du pool isolé (connect 2 s, statement 3 s) → pire cas ~quelques secondes SI l'analytique est dégradée ; jamais
un hang. Le chemin admin est rare (non public). **Option :** enrober les appels d'un timeout JS court (comme
`avecTimeout` du writer) pour découpler davantage. **Non ajouté** (déjà borné par le pool ; éviter la sur-ingénierie
d'un chemin admin rare) — à durcir si besoin.

### B8 — F4 : divergence de casse Unicode (théorique)
La clé de throttle est minusculée en JS (`toLowerCase`), le compte résolu via `lower()` Postgres. Pour des caractères
Unicode exotiques, les deux peuvent diverger → une saisie homoglyphe résoudrait le même compte avec une clé de throttle
différente (bypass). **Très improbable** : les identifiants sont des e-mails (CHECK format en base → charset ASCII).
**Option :** normaliser identiquement / restreindre le charset. Priorité basse.

---

## C. ÉCARTS DE CONFORMITÉ (batterie Phase 6)

| Vérification | Résultat | Preuve |
|---|---|---|
| **Golden `29.107259068449615`** inchangé | ✅ PASS | Chantier hors moteur/writer. Intégration **8 fichiers / 54 tests** verts ; `pipeline.itest` **rejoué après le correctif F1** (11/11, 131,9 s) → bit-identique. |
| **Byte-unchanged** password/motDePasse/proxy/garde | ✅ PASS | `git status` : absents du diff. Le throttle est dans `session/route.ts`. |
| **Gemini / moteur** intacts | ✅ PASS | Absents du diff. |
| **Aucune IP nulle part** | ✅ PASS | `login_echec (identifiant, ts)` sans colonne IP ; audit lit `analytics_admin_jour` (sans IP) ; aucune lecture de `req.ip`/header IP. |
| **Audit AGRÉGÉ, sans identité** | ✅ PASS | `lecture.ts` : sortie = {bucket, succes, echecs, pics, seuilPic} ; test « aucun champ par-personne » (`lecture.test.ts`). |
| **Pilotage sans code** (throttle/pic/rétention en config) | ✅ PASS | migration 021 + `lireConfig`/`lireConfigPic` (repli sûr) ; rien en dur. |
| **THROTTLE, pas LOCKOUT** | ✅ PASS | `delaiPour` plafonné à `max_s`, borné (test « absurde → plafond ») ; succès → reset (`noterSucces`). |
| **Anti-énumération** | ✅ PASS | throttle keyé sur la chaîne AVANT `trouverCompte` (test : 429 sans `trouverCompte`) ; échec 401 générique. |
| **Fail-safe / best-effort** | ✅ PASS | `verifierThrottle`→`{bloque:false}` sur erreur (test) ; notes avalées ; pool analytique isolé. |
| **READ ONLY audit + garde rôle** | ✅ PASS | seule GET ; `exigerAdministrateur` (test 403). |
| **Aucune dépendance npm** | ✅ PASS | `package.json` inchangé. Graphiques audit = SVG maison. |
| **Migration NON exécutée** | ✅ PASS | livrée à Arno ; 021 libre ; additive/idempotente ; rollback documenté. |
| **Purge cron tolérante** | ✅ PASS | `purgerLoginEchec` : 42P01 → no-op (test) ; autre erreur propagée. |
| **UI 375px / aucun bleu** | ✅ PASS | écran audit : 1 colonne, ≥44px, reduced-motion, focus rouge, succès vert / échec rouge, copie « agrégé, aucune IP ». |
| **Unit / intégration** | ✅ PASS | unit **860 passés / 21 skipped** (dont test break-glass F1) ; intégration **54/54** + golden rejoué post-F1. |

---

## Migration à appliquer (Arno, à la main)

```zsh
# Depuis la racine du repo, DATABASE_URL exporté depuis .env :
export DATABASE_URL="…(copié depuis .env)…"
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/021_lot7_audit_bruteforce.sql
# Vérif : \d login_echec ; SELECT cle,valeur FROM analytics_config WHERE cle LIKE 'login_throttle%';
```
Tant que 021 n'est pas appliquée : le throttle est **fail-safe** (login normal, aucune détection) et la purge
cron **no-op** (42P01 toléré) — rien ne casse.

---

## Métriques & comportement

- **Throttle** : après `seuil` (5) échecs dans `fenetre` (15 min) sur un identifiant, délai = `base·2^(échecs−seuil)`
  plafonné à `max` (5 min). Succès → reset. 429 + Retry-After générique.
- **Audit** : `GET /api/admin/audit?debut&fin&grain` → série succès/échecs par bucket + totaux + pics
  (échecs ≥ max(`audit_pic_min`, médiane·`audit_pic_facteur`)). Rôle administrateur, READ ONLY.
- **Écran** : courbe SVG (succès vert / échecs rouge), carte d'alerte de pic (rouge contour), copie RGPD, états.

---

## Séquence de test manuel pour Arno

1. Appliquer 021 (ci-dessus). `npm run dev`.
2. Se tromper de mot de passe **5+ fois** rapidement sur un identifiant → au 6ᵉ, réponse **429 + Retry-After**
   (délai croissant). Attendre le délai → réessai possible. **Se connecter correctement** → le compteur est reset.
3. Vérifier que **la réponse est identique** pour un identifiant existant et un inexistant (aucune fuite).
4. Ouvrir `/admin/audit` (compte **administrateur**) → courbe succès/échecs, éventuelle alerte de pic, mention
   « vue agrégée — aucun suivi individuel, aucune IP ». Avec un compte **collaborateur** → accès refusé (403).
5. `npm run analytics:maintenance` → purge des vieux `login_echec` (selon la rétention).
6. **375px** : 1 colonne, cibles ≥ 44px, aucun bleu.

---

## Phase 5 — Revue adverse (red team) et arbitrage

Deux sous-agents adverses en LECTURE SEULE.

### Reviewer conformité/intégrité : **VALIDER** (0 bloquant)
10/10 points PASS (byte-unchanged, golden, pilotage sans code, 0 dépendance, garde rôle administrateur, migration
additive/non exécutée, purge tolérante, UI 375px sans bleu, tests honnêtes, fail-safe/isolation). 3 observations
info : coquille de page atteignable par tout authentifié (= B3, aucune donnée fuite) ; latence login si analytique
dégradée (= F3) ; spraying par identifiant seul (= B2/F5). Aucun correctif requis.

### Reviewer red team (attaques a–f) : **CORRIGER**
Attaques (a) timeline individuel, (b) énumération 401/429, (e) blocage d'un login légitime, (f) IP → **ÉCHOUENT**
(anonymat de l'audit tenu, aucune IP nulle part, fail-safe réel). Constats :

- **F1 — DoS d'un compte ciblé, break-glass throttlé (MAJEUR, invariant « pas de lockout ») → CORRIGÉ.** Le délai
  était mesuré depuis le DERNIER échec (rafraîchissable par l'attaquant) ET la voie de secours `''` était throttlée
  → aucune voie non bloquée. **Correctif appliqué :** la VOIE DE SECOURS (`''`) est désormais **EXEMPTÉE du throttle**
  (`session/route.ts`) → il existe toujours une voie non throttlée (break-glass Arno + CLI `admin:secours`) ; le
  commentaire trompeur d'`antiBruteforce.ts` est corrigé (honnête sur la limite). Test : `session/route.test.ts`
  (« BREAK-GLASS »). **Résiduel tracé → B4** (un compte NOMMÉ ciblé peut rester en 429 pendant l'attaque — limite
  inhérente au throttle SANS IP ; argon2 = frein primaire).

Constats **tracés en DOUTES** (arbitrages sécurité/UX que le porteur doit trancher — cf. §B) :
- **F2** (TOCTOU : rafale concurrente sous le seuil) → **B5**.
- **F6** (le reset au succès est un canal auxiliaire de faible bande passante) → **B6**.
- **F3** (fail-open sous charge + latence login couplée à la santé analytique) → **B1** (déjà) + **B7**.
- **F4** (divergence de casse Unicode JS/Postgres, théorique) → **B8**.
- **F5** (password-spraying hors v1) → **B2** (déjà tracé).

### Arbitrage
F1 (invariant dur) **corrigé et re-testé**. F2/F3/F4/F5/F6 relèvent d'arbitrages sécurité/UX que la revue elle-même
défère au porteur, et plusieurs découlent de la **tension inhérente** entre « throttle par compte », « pas de
lockout » et « aucune IP » (contrainte RGPD Q-C=1) — non résolvable parfaitement sans IP. Ils sont tracés en §B
avec analyse + options, pour décision d'Arno. Aucun n'est une fuite de données au repos ni un lockout permanent.

## Phase 8 — Recon de validation indépendante → **✅ VALIDER**

Une recon LECTURE SEULE indépendante a re-confronté la livraison, en ciblant le correctif F1 et les invariants durs.
Verdict : **VALIDER**, aucun défaut bloquant. Points confirmés `fichier:ligne` :
- **Break-glass réellement exempté** (`session/route.ts` : `cleThrottle === '' ? {bloque:false} : verifierThrottle(...)`)
  + test « BREAK-GLASS » (200, `verifierThrottle` jamais appelé) → il existe TOUJOURS une voie non throttlée.
- **Le correctif n'ouvre aucun trou** : exempter `''` restaure exactement la baseline pré-Lot-7 ; l'anti-énumération
  des comptes nommés tient (throttle keyé sur la chaîne AVANT `trouverCompte`) ; une requête throttlée (429) retourne
  AVANT `noterEchec` → l'attaquant ne rafraîchit pas le timer (mitige le vecteur de F1).
- **Invariants durs OK** : byte-unchanged (6 fichiers au diff, aucun protégé), golden hors de portée (re-prouvé),
  aucune IP, audit agrégé, pilotage sans code, 0 dépendance, migration 021 additive/non exécutée, fail-safe/isolation.
- **Rapport honnête** : B1–B8 tracent fidèlement F1-résiduel + F2–F6 ; la tension inhérente (throttle par compte +
  pas de lockout + sans IP) est exposée pour décision d'Arno, lisible par un non-technicien.

**Correctif post-recon appliqué :** la recon a relevé une IMPRÉCISION documentaire — les commentaires disaient
« argon2 » pour la voie de secours, alors que `motDePasseValide` est une **comparaison SHA-256 à temps constant**
(`password.ts`), pas argon2 (argon2 = voie NOMMÉE via `verifier`). Commentaires (`session/route.ts`,
`antiBruteforce.ts`) et §A7 **corrigés** ; la posture de sécurité (baseline pré-Lot-7 restaurée) est inchangée, seule
la formulation était imprécise. Ajout d'une **alerte** : le secret partagé `ADMIN_PASSWORD` doit rester à haute
entropie (SHA-256 rapide, voie non throttlée).

**Livraison prête pour Arno.** Aucun commit effectué. La migration 021 est livrée **non exécutée**.
