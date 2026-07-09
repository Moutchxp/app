# Rapport de build — M3 Lot 2/5 : authentification par compte nommé, avec voie de secours

> Run `/svav-build` autonome. **Aucun commit, aucune migration appliquée** : livraison remise à Arno.
> Ce rapport ne s'est jamais interrompu ; il se lit APRÈS livraison, à la seule discrétion d'Arno.

---

## 0. Synthèse exécutive

Introduction de vrais **comptes administrateurs nommés** (table `admin_utilisateur` de la migration 014
déjà appliquée par Arno) **sans retirer** la corde de rappel : le **mot de passe partagé**
(`app/lib/admin/password.ts`, NON TOUCHÉ) continue de donner un accès administrateur complet. La route
de connexion accepte deux voies ; les permissions sont désormais **appliquées côté serveur** dans
`proxy.ts`. Batterie de conformité : **tout au vert**, golden **bit-identique**.

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ bit-identique (assertion interne du test) |
| `test:integration` | ✅ **23/23** |
| `tsc --noEmit` | ✅ 0 erreur |
| `eslint` (fichiers touchés) | ✅ 0 erreur, 0 warning |
| `npm test` | ✅ **493 passed / 21 skipped**, 40 fichiers |
| `next build` | ✅ succès (Proxy middleware compilé) |
| Parcours public inchangé | ✅ `app/page.tsx` & moteur non modifiés (cf. §5) |
| Grep zéro mot de passe en clair | ✅ le clair ne va QUE dans `hacher()` (cf. §4) |
| Tests (a)–(f) | ✅ tous couverts (cf. §3) |

---

## 1. Code produit — fichiers touchés

**Créés**
- `app/lib/admin/motDePasse.ts` — `hacher(clair)` / `verifier(clair, hash)` en **argon2id**.
- `app/lib/admin/comptes.ts` — opérations DB des comptes (trouver, créer, reset, secours, lister, marquerConnexion).
- `app/lib/admin/garde.ts` — helper `aLaPermission(module)` (defense in depth côté route).
- `app/scripts/admin.ts` — CLI 4 sous-commandes (`creer`/`reset`/`secours`/`lister`), saisie masquée.
- Tests : `motDePasse.test.ts`, `comptes.test.ts`, `proxy.test.ts`, `api/admin/session/route.test.ts`.

**Modifiés**
- `app/lib/admin/session.ts` — types `Module`/`Perms`/`RoleAdmin`/`SessionAdmin`, `signerJeton(session)` enrichi
  (`sub`/`identifiant`/`role`/`perms`/`jti`), `sessionDepuisPayload()` tolérant, `permsToutes/permsAucune`.
- `app/(admin)/api/admin/session/route.ts` — deux voies d'authentification + message générique + anti-timing.
- `app/(admin)/admin/login/page.tsx` — champ **« Identifiant »** au-dessus du mot de passe.
- `proxy.ts` — table chemin → permission + application côté serveur.
- `app/(admin)/api/admin/banc-comparer/route.ts`, `banc-profil-actif/route.ts` — garde `banc_test` (defense in depth).
- `app/lib/admin/session.test.ts` — mis à jour pour la nouvelle signature + cas `sessionDepuisPayload`.
- `package.json` / `package-lock.json` — dépendance `argon2` + entrées `admin:*`.

**NON touchés (invariant de sécurité & interdictions)** : `app/lib/admin/password.ts` (voie de secours),
`app/page.tsx` (public), moteur (`coucheDegagement`/`distancePercueFaisceau`/`ventilerNote`), `config_scoring`,
`pipeline.itest.ts`, les 8 routes d'écriture de curation, les 2 fichiers Gemini.

---

## 2. Couverture des gardes serveur (Lot 2e) — liste exacte

**`proxy.ts`** (matcher `/admin`, `/admin/:path*`, `/api/admin/:path*`) — table `PERMISSIONS`, premier préfixe qui matche :

| Chemin (préfixe) | Permission requise |
|---|---|
| `/admin/pilotage` | `pilotage` |
| `/admin/cartes-annee` | `cartes_annee` |
| `/admin/statistiques` | `statistiques` |
| `/admin/internautes` | `internautes` |
| `/admin/curation` | `curation` |
| `/admin/banc-test` | `banc_test` |
| `/api/admin/config` | `pilotage` |
| `/api/admin/cartes-annee` | `cartes_annee` |
| `/api/admin/curation` | `curation` |
| `/api/admin/banc-comparer` | `banc_test` |
| `/api/admin/banc-profil-actif` | `banc_test` |

- **Administrateur** (et voie de secours) → toutes permissions, tout passe.
- **Collaborateur** sans la permission → **API : 403** ; **page : redirection `/admin`** (il est authentifié, pas vers `/login`).
- Sans permission requise (`/admin` accueil, `/api/admin/ping`) → authentification seule suffit.
- Whitelist publique : `/admin/login`, `/api/admin/session`.

**Defense in depth par route** : garde `aLaPermission('banc_test')` ajoutée dans `/api/admin/banc-comparer` et
`/api/admin/banc-profil-actif`. Voir catégorie A pour les routes NON dotées d'une garde par route et pourquoi.

---

## 3. Tests exigés (a)–(f) — où ils sont prouvés

| # | Exigence | Fichier |
|---|---|---|
| a | Connexion par compte réussit | `api/admin/session/route.test.ts` |
| b | Compte désactivé refusé | `api/admin/session/route.test.ts` |
| c | Voie de secours (identifiant vide + ancien mdp) réussit | `api/admin/session/route.test.ts` |
| d | Ancien jeton sans sub/perms accepté comme administrateur | `session.test.ts` (`sessionDepuisPayload`) |
| e | Collaborateur sans permission refusé par `proxy.ts` sur le chemin | `proxy.test.ts` |
| f | `admin:secours` idempotent (deux exécutions → même état) | `comptes.test.ts` |

Complément : message d'erreur générique identique (mauvais mdp / identifiant inconnu / mdp partagé faux),
verify de leurre exécuté sur identifiant inconnu (anti-timing), roundtrip hachage argon2id.

---

## 4. Preuve « zéro mot de passe en clair »

- `grep` sur `console.*` des fichiers touchés → **aucun log** de `password`/`motDePasse`/`clair`.
- Dans `comptes.ts`, `motDePasseClair` n'apparaît qu'en **argument de `hacher()`** (lignes 81/102/125) : jamais
  en paramètre SQL, jamais dans un `RETURNING`, jamais journalisé. Les logs `admin_utilisateur_log` n'écrivent
  que `identifiant`/`role`/`actif` (jamais le hash ni le clair).
- Route de connexion : le clair transite en mémoire vers `verifier()`/`motDePasseValide()` ; l'échec renvoie la
  chaîne fixe `« Identifiants invalides »`. Le hash n'est jamais renvoyé au client.
- CLI : saisie **masquée** (écho neutralisé), jamais en argument de ligne de commande (pas d'historique shell).
- Anti-timing vérifié : le hash de leurre est un encodage argon2id valide → `verify` réel ≈ 26 ms (identifiant
  inconnu) du même ordre qu'un compte réel → aucune fuite d'existence par le temps de réponse.

---

## 5. Preuve parcours public inchangé

`git status` ne liste AUCUN fichier du parcours public ni du moteur : `app/page.tsx`, `coucheDegagement.ts`,
`distancePercueFaisceau.ts`, `scoreTotal.ts`, `analyse.ts`, `pipeline.ts`, `config.ts`, `pipeline.itest.ts`,
`config_scoring`, les 2 fichiers Gemini, les 8 routes de curation : intacts. Le fichier de login modifié est
`app/(admin)/admin/login/page.tsx` (interface ADMIN), pas la page publique `app/page.tsx`. Golden 23/23 rejoué.

---

## A. DÉCISIONS HORS-SPECS (point d'attention prioritaire)

**A1. Hachage : argon2id retenu.** `argon2` s'est installé proprement (binaire prébuilt, aucune compilation).
Priorité de la spec respectée (argon2id sinon bcryptjs). Paramètres = défaut de la lib (`type: argon2id`).
*Alternative écartée* : `bcryptjs` (retenu seulement en cas d'échec d'install). *Impact* : nouvelle dépendance
native unique, comme autorisé.

**A2. `import 'server-only'` retiré du graphe runtime du CLI.** `motDePasse.ts` et `comptes.ts` sont importés par
`app/scripts/admin.ts` (exécuté sous `tsx`, Node pur), où `server-only` **lève**. Décision : ne pas mettre
`server-only` dans ces deux modules (commentaire d'en-tête explicatif) ; `comptes.ts` importe les types de
`session.ts` en **`import type`** (effacé à la compilation → aucun chargement runtime de `session.ts`, qui garde
son `server-only`). Sécurité réelle inchangée : argon2 est natif (jamais bundlable côté client) et aucun composant
client n'importe ces modules. *Alternative écartée* : dupliquer les types → divergence à terme.

**A3. `secours` implémenté en check-then-branch (pas `ON CONFLICT`).** `trouverCompte` puis, selon présence,
`UPDATE` (réactivation) ou `INSERT` (création). *Raison* : idempotence testable et distinction claire
création/réactivation, sans l'angle mort `xmax`/multi-index d'un `ON CONFLICT` sur `lower(identifiant)`.
*Impact* : deux requêtes au lieu d'une ; négligeable pour une commande d'admin manuelle.

**A4. Defense in depth par route limitée à 2 routes.** La garde `aLaPermission` par route n'a été posée que sur
`/api/admin/banc-comparer` et `/api/admin/banc-profil-actif`. **Les routes de curation (8 routes d'écriture) sont
sous interdiction de modification** → aucune garde par route ajoutée là ; elles restent couvertes par le point de
passage **`proxy.ts`** (garde serveur réelle, runtime Node, vérifie JWT + permission). `/api/admin/config` et
`/api/admin/cartes-annee` : garde par route NON ajoutée pour rester chirurgical et hors du périmètre
`config_scoring`. *Impact* : le proxy reste la garde primaire et complète ; la defense-in-depth par route est
partielle (démontrée sur le banc). À compléter au Lot 4/5 si Arno veut la seconde barrière partout.

**A5. Menu latéral (`Sidebar.tsx`) non modifié.** Masquer un lien n'étant PAS une sécurité (assuré par `proxy.ts`),
le filtrage cosmétique du menu selon les permissions est laissé au Lot 4 (UI de gestion). Un collaborateur peut voir
un lien mais sera refusé côté serveur s'il le suit. *Impact* : purement cosmétique.

**A6. Redirection page interdite → `/admin` (accueil), pas `/admin/login`.** Un collaborateur authentifié qui vise
une page sans permission est déjà connecté ; le renvoyer au login serait trompeur. *Alternative écartée* : page 403
dédiée (non demandée, reportée au Lot 4).

**A7. `derniere_connexion_a` mis à jour uniquement pour la voie NOMMÉE.** La voie de secours (`sub=null`, compte
anonyme) ne correspond à aucune ligne `admin_utilisateur` → rien à horodater. *Impact* : conforme à la nature
anonyme de la corde de rappel.

---

## B. DOUTES

**B1. Rate-limit non implémenté (conforme à la consigne).** La spec demande explicitement de NE PAS implémenter de
rate-limit ici et de le signaler. Le délai anti-force-brute est fourni **naturellement par argon2** (≈ 26 ms/essai)
et le verify de leurre le rend **constant** que le compte existe ou non. **Recommandation** : ajouter un
rate-limit/backoff au niveau connexion dans un lot ultérieur (verrou de compte après N échecs, ou throttling par IP).

**B2. Règle « dernier administrateur actif ».** Non appliquée ici (prévue Lot 4, UI de gestion), et `admin:secours`
doit pouvoir l'outrepasser — ce qu'il fait (il force `actif=true`+`administrateur`+toutes perms sans vérifier le
« dernier admin »). Tant que le Lot 4 n'est pas livré, aucune protection n'empêche de désactiver le dernier admin
via un futur écran ; la corde de rappel (`admin:secours`, mot de passe partagé) couvre le risque de verrouillage.

**B3. Tolérance du `sessionDepuisPayload`.** Volontairement permissive : tout jeton dont `role !== 'collaborateur'`
(y compris rôle absent, ancien `role:'admin'`) est traité comme **administrateur complet**. C'est requis (critère d)
pour ne pas casser les sessions ouvertes, mais cela signifie qu'un jeton mal formé côté claims custom retombe en
administrateur. Le garde-fou reste la **signature JWT** : `verifierJeton` rejette tout jeton non signé par
`ADMIN_SESSION_SECRET`. Un attaquant ne peut donc pas forger ce cas.

---

## C. ÉCARTS DE CONFORMITÉ

**Aucun.** Golden `29.107259068449615` bit-identique (23/23), `tsc`/`eslint`/`npm test`/`next build` au vert,
verdict/score non touchés (aucun fichier moteur modifié), `config_scoring` intacte, Gemini hors staging,
`ST_Force2D` non concerné (aucune opération distance/raster touchée), RGPD : aucune donnée personnelle d'internaute
manipulée (comptes = opérateurs internes ; le hash n'est jamais exposé).

---

## Séquence pour Arno (À LANCER APRÈS lecture, dans le terminal de `app/`)

> Prérequis : `DATABASE_URL` exporté (il est dans `.env`, chargé par `client.ts`). Migration 014 déjà appliquée.

1. **Créer ton compte nommé** (mot de passe demandé en saisie masquée, à confirmer) :
   ```
   npm run admin:creer -- --identifiant arno --role administrateur
   ```
2. **Vérifier en navigateur AVANT de committer** : va sur `/admin/login`, connecte-toi avec
   `identifiant = arno` + ton nouveau mot de passe → tu dois entrer dans l'admin. Puis reteste la **voie de secours** :
   déconnecte-toi, laisse le champ **Identifiant vide** et saisis l'**ancien mot de passe partagé** → tu dois aussi
   entrer (accès administrateur complet). Tant que ces deux voies marchent, tu peux committer.
3. **Corde de rappel à garder sous la main** (idempotente, rejouable ; te débloque si tu te verrouilles dehors) :
   ```
   npm run admin:secours -- --identifiant arno
   ```
   Utile aussi : `npm run admin:lister` (jamais le hash) et `npm run admin:reset -- --identifiant arno`.

---

## Verdict de recon-valid (Phase 8)

**VALIDER.** La livraison respecte l'invariant de sécurité non négociable (voie de secours intacte, `password.ts`
non touché, voie isolée et commentée « VOIE DE SECOURS — à retirer au lot M3-5 après bascule »), les interdictions
de périmètre (moteur/config_scoring/golden/curation/Gemini/public intacts), et tous les critères de sortie
(golden bit-identique, 23/23, tsc/eslint/test/build verts, zéro mot de passe en clair, tests a–f). Points non
bloquants à traiter dans un lot ultérieur : rate-limit (B1), règle « dernier admin » + filtrage du menu (B2/A5),
extension de la defense-in-depth par route (A4). Aucun écart de conformité (catégorie C vide).
