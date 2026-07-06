# SPEC — Étape 1 : Coquille admin + authentification (interface interne)

> Spec d'exigences **EARS** (testables, non ambiguës) pour l'Étape 1 du `PLAN_INTERFACE_INTERNE.md`.
> **Livrable = cette spec, PAS du code.** Mots-clés MUST/MUST NOT/SHOULD/MAY au sens RFC 2119.
> Rédigée via `/svav-specs`. À valider par Arno avant tout build (`/svav-build`).

## Besoin (reformulé)
Poser le **socle** de l'interface d'administration interne : un **shell protégé par authentification**
qui affiche **une page vide (placeholder) par module** (M1..M5), avec navigation, déconnexion et bandeau
d'état. **Aucune logique métier, aucune écriture DB, aucun accès au moteur/golden.** C'est la fondation
sur laquelle les modules seront branchés ensuite.

## Périmètre
**DANS le périmètre** : groupe de routes `app/(admin)/`, `layout.tsx` (coquille responsive), pages
placeholder des 5 modules, `middleware.ts` (garde d'accès), authentification minimale (login/logout,
identifiant en env, cookie de session signé httpOnly), isolation du bundle.
**HORS périmètre** (autres étapes / prod) : toute logique de module (M1..M5), toute lecture/écriture
`config_scoring` ou DB, tout accès au moteur de score, la persistance internautes/RGPD, l'adresse dédiée
de production (`admin.sansvisavis.com` / VPN — infra, pas ce build ; en dev on reste sur `localhost`), et
la **limitation anti-force-brute au login** (reportée — dette connue, cf. D3).

## Rattachement aux invariants SVAV (cf. CLAUDE.md / INVARIANTS_SVAV.md)
- **Zéro impact golden / moteur / `config_scoring`** : chantier auto-contenu (aucun import moteur/DB).
- **Responsive / mobile-first** : CLAUDE.md **§15** (exigence transverse d'interface).
- **Design tokens SVAV** : réutiliser `app/globals.css` (§12), ne pas réinventer de charte.
- **Pas de secret en dur** : identifiants et clés de signature en **variables d'environnement** (§7 esprit).
- **RGPD** : sans objet à l'Étape 1 (aucune donnée personnelle manipulée ni stockée).

---

## User stories
- **US1** — En tant qu'**opérateur interne (Arno)**, je veux **accéder à une interface d'admin protégée**,
  afin de piloter le système sans que le public y accède.
- **US2** — En tant qu'opérateur, je veux **naviguer entre les 5 modules** depuis une coquille commune,
  afin de retrouver chaque fonction à un endroit stable.
- **US3** — En tant qu'opérateur, je veux **me connecter et me déconnecter**, afin de contrôler l'accès.
- **US4** — En tant qu'opérateur sur **smartphone**, je veux une interface **pleinement utilisable en
  portrait**, afin de l'utiliser sans grand écran.

---

## Exigences EARS

### T1 — Coquille / layout (`app/(admin)/layout.tsx`)
- **EX-1** [Ubiquitaire] Le système DOIT exposer les routes d'admin sous le groupe `app/(admin)/`, distinct
  des routes publiques.
- **EX-2** [Ubiquitaire] La coquille DOIT afficher une **barre latérale** listant les **5 modules** :
  Pilotage (M1), Statistiques (M2), Internautes (M3), Curation (M4), Banc de test (M5).
- **EX-3** [Ubiquitaire] La coquille DOIT afficher un **bouton/lien de déconnexion** visible depuis toute
  page d'admin.
- **EX-4** [Ubiquitaire] La coquille DOIT afficher un **bandeau d'état** (emplacement réservé, contenu
  neutre à l'Étape 1 — il portera plus tard « profil actif vs repli »).
- **EX-5** [Ubiquitaire] La coquille DOIT utiliser les **design tokens SVAV** de `app/globals.css`
  (couleurs/classes `--color-svv-*`, `.svv-*`), sans introduire de nouvelle palette.
- **EX-6** [Événementiel] QUAND l'opérateur sélectionne un module dans la barre latérale, le système DOIT
  naviguer vers la page de ce module et **indiquer l'entrée active**.

### T2 — Pages placeholder des modules
- **EX-7** [Ubiquitaire] Le système DOIT fournir **une page par module** aux routes `/admin/pilotage`,
  `/admin/statistiques`, `/admin/internautes`, `/admin/curation`, `/admin/banc-test`.
- **EX-8** [Ubiquitaire] Chaque page module DOIT afficher un **placeholder** identifiant le module (titre +
  mention « à venir »), **sans aucune logique métier**.
- **EX-9** [Ubiquitaire] Le système DOIT fournir une **page d'accueil admin** à `/admin` (tableau de bord
  vide / liens vers les modules).
- **EX-10** [MUST NOT] Aucune page de l'Étape 1 NE DOIT lire ni écrire de données applicatives (DB,
  `config_scoring`), ni importer le moteur de score.

### T3 — Garde d'accès (`middleware.ts`)
- **EX-11** [Ubiquitaire] Le `middleware` DOIT s'appliquer (matcher) à `/admin` **et** à `/admin/**` **et**
  à `/api/admin/**`.
- **EX-12** [Indésirable] SI une requête vers une **page** `/admin/**` arrive **sans session valide**,
  ALORS le système DOIT **rediriger (HTTP 3xx) vers `/admin/login`**.
- **EX-13** [Indésirable] SI une requête vers une **route API** `/api/admin/**` arrive **sans session
  valide**, ALORS le système DOIT répondre **HTTP 401** (sans redirection).
- **EX-14** [Ubiquitaire] La page `/admin/login` DOIT rester **accessible sans session** (non gardée).
- **EX-15** [Indésirable] SI le cookie de session est présent mais **invalide** (signature incorrecte ou
  expiré), ALORS le système DOIT le traiter comme **absent** (EX-12 / EX-13 s'appliquent).

### T4 — Authentification (mot de passe seul · `jose` · session 8 h)
- **EX-16** [Ubiquitaire] L'authentification DOIT se faire par **mot de passe SEUL** (aucun nom
  d'utilisateur), à partir du secret **`ADMIN_PASSWORD`** (variable d'environnement) ; la clé de signature
  de session DOIT provenir de **`ADMIN_SESSION_SECRET`** ; aucun secret NE DOIT figurer en dur dans le code
  ni être exposé côté client.
- **EX-17** [Événementiel] QUAND le mot de passe soumis est **correct**, le système DOIT ouvrir une session
  matérialisée par un **jeton signé JWT/JWS via la librairie `jose`** (clé `ADMIN_SESSION_SECRET`), posé en
  cookie et **vérifié côté serveur** — **sans cryptographie « maison »**.
- **EX-18** [Ubiquitaire] Le cookie de session DOIT porter **`HttpOnly`**, **`SameSite=Strict`** et
  **`Secure` en production**, avec une **expiration de 8 heures** (TTL, sans option « rester connecté ») ;
  la date d'expiration (`exp`) du jeton `jose` DOIT être cohérente avec cette durée.
- **EX-19** [Ubiquitaire] La vérification du mot de passe DOIT utiliser une **comparaison à temps constant**
  (aucun court-circuit révélant longueur ou préfixe).
- **EX-20** [Indésirable] SI le mot de passe soumis est **incorrect**, ALORS le système DOIT **refuser** la
  connexion et afficher un message d'erreur **générique**.
- **EX-21** [Événementiel] QUAND l'opérateur déclenche la déconnexion, le système DOIT **invalider la
  session** (cookie effacé/expiré) et rediriger vers `/admin/login`.
- **EX-22** [Indésirable] SI le cookie de session est **forgé** (signature `jose` invalide) **ou expiré
  (> 8 h)**, ALORS le système DOIT le **rejeter** (accès refusé, cf. EX-15).

### T5 — Isolation du bundle
- **EX-23** [Ubiquitaire] Le code serveur d'admin (auth, handlers) DOIT être **`server-only`** (jamais
  embarqué dans le bundle client public).
- **EX-24** [MUST NOT] Le **bundle public** (routes hors `app/(admin)`) NE DOIT importer **aucun** module
  d'admin.
- **EX-25** [MUST NOT] Le code de l'Étape 1 NE DOIT importer **aucun** fichier de `app/lib/svv/**` ni
  `app/lib/db/**` (moteur / accès DB).

### T6 — Responsive / mobile-first (transverse, CLAUDE.md §15)
- **EX-26** [Ubiquitaire] Toute page d'admin DOIT être **pleinement utilisable en portrait smartphone**
  (référence **375 px de large**) : **aucun débordement horizontal** du contenu principal.
- **EX-27** [Conditionnel] TANT QUE la largeur d'écran est **< 768 px**, la barre latérale DOIT se replier
  en un menu accessible (bouton/hamburger), sans masquer la navigation.
- **EX-28** [Ubiquitaire] Les cibles tactiles (liens de nav, boutons login/déconnexion) DOIVENT être
  **actionnables au doigt** (taille ≥ ~44 px) et **ne pas dépendre du survol (hover) seul**.

---

## Découpe en tâches + critères de conformité (vérifiables)

| Tâche | Contenu | Critère de conformité (vérifiable) |
|---|---|---|
| **T1** | Layout coquille (barre latérale 5 modules, déconnexion, bandeau état, tokens SVAV) | La coquille rend les 5 entrées + déconnexion + bandeau ; classes/couleurs `svv-*` présentes ; entrée active mise en évidence. |
| **T2** | 6 pages placeholder (accueil + 5 modules) | `GET /admin`, `/admin/{pilotage,statistiques,internautes,curation,banc-test}` répondent (avec session) et affichent le placeholder ; **aucun** import moteur/DB (grep). |
| **T3** | `middleware.ts` garde | Sans session : `GET /admin/pilotage` → **3xx vers /admin/login** ; `GET/POST /api/admin/x` → **401** ; `/admin/login` → **200**. |
| **T4** | Auth (mot de passe seul · `jose` · TTL 8 h) | Bon mot de passe → cookie session avec **`HttpOnly` + `SameSite=Strict` + `Secure`(prod) + expiration 8 h** ; jeton = **JWS `jose`** vérifié côté serveur ; mauvais mot de passe → refus + message **générique** ; **comparaison à temps constant** ; logout → cookie invalidé + redirection ; cookie **forgé (signature invalide)** ou **expiré (> 8 h)** → **rejeté**. |
| **T5** | Isolation bundle | `grep` : aucun import `app/lib/svv` / `app/lib/db` sous `app/(admin)` ni `middleware.ts` ; code serveur marqué `server-only` ; bundle public sans import admin. |
| **T6** | Responsive | À **375 px** : pas de scroll horizontal ; à **< 768 px** : nav repliée accessible ; cibles ≥ ~44 px ; pas d'action hover-only. |
| **Conformité SVAV** | Zéro régression | **Golden inchangé** (`test:integration` vert, `29.107259068449615`) — normalement non exécuté par ce chantier, mais rejoué pour preuve ; `config_scoring` non touchée (aucune migration, aucun `INSERT/UPDATE`). |

---

## Décisions actées (questions fermées)
- **D1 — Identifiant** : **mot de passe SEUL** (pas de nom d'utilisateur), un unique secret `ADMIN_PASSWORD`.
  → EX-16.
- **D2 — Durée de session** : TTL cookie/jeton = **8 heures**, **sans** option « rester connecté ». → EX-18.
- **D3 — Anti-force-brute** : **REPORTÉ** (hors Étape 1). L'admin est derrière la barrière réseau (§B du
  plan) ; le verrouillage de tentatives sera ajouté ultérieurement. **Dette connue** (voir ci-dessous).
- **D4 — Signature du cookie** : **librairie `jose`** (JWT/JWS signé), **PAS** de HMAC « maison » — on ne
  roule pas sa propre cryptographie sur un cookie de session ; lib auditée. Exigences : httpOnly, `Secure`
  (prod), `SameSite=Strict`, signature **vérifiée côté serveur**, expiration **8 h** respectée. → EX-17,
  EX-18, EX-22.
- **D5 — Variables d'environnement** : **`ADMIN_PASSWORD`** (secret de connexion) et
  **`ADMIN_SESSION_SECRET`** (clé de signature `jose`) ; jamais en dur ni exposées côté client. → EX-16.
- **D6 — Slugs/routes des modules** : `pilotage` / `statistiques` / `internautes` / `curation` /
  `banc-test` (repris de `PLAN_INTERFACE_INTERNE.md §D`), avec les libellés de menu correspondants.
  → EX-2, EX-7.

### Dette connue (hors Étape 1)
- **Anti-force-brute au login** (D3) : aucune limitation de tentatives / verrouillage à l'Étape 1. À
  ajouter quand l'admin sera exposé au-delà du réseau interne/VPN. Protection provisoire = barrière réseau
  (§B) + mot de passe fort + comparaison à temps constant (EX-19).

### Décision technique — nouvelle dépendance
- **`jose`** est ajoutée comme dépendance (signature/vérification JWT/JWS, légère et auditée). Écart assumé
  au « zéro dépendance » du plan, justifié par D4 (ne pas coder sa propre crypto de session).

*Rien n'est construit ni committé. La spec est le livrable ; le code viendra dans un chantier séparé
(`/svav-build`) une fois validée.*
