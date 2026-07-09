# Rapport de build — M3-4 Lot B : enforcement de la première connexion

> Run `/svav-build` autonome. **Aucun commit, aucune migration** (016 suffit, déjà appliquée). Livraison à Arno.
> Deuxième des 3 lots de M3-4 (A données ✅ → **B enforcement** → C UI). Aucune anticipation du Lot C.

## 0. Synthèse

Le drapeau `doit_changer_mot_de_passe` entre dans le JWS (`doitChanger`) ; `proxy.ts` redirige/refuse tout l'admin
tant qu'il est vrai, sauf la page + la route self-service de changement de mot de passe. La route change le mot de
passe, journalise, et réémet un jeton frais. La voie de secours navigateur (`sub=null`) est neutralisée des DEUX
côtés (signature ET relecture) → jamais piégée.

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc` / `eslint` | ✅ 0 / 0 |
| `npm test` | ✅ **547 passed / 21 skipped** (44 fichiers) |
| `next build` | ✅ (bundle client propre, aucun `server-only`) |
| `password.ts` / `motDePasse.ts` byte-unchanged | ✅ (diff vide) |
| `garde.ts` (M3-0) | ✅ NON modifié (test `sub=null → aucune requête` vert) |
| Migration / Gemini | ✅ aucune / non touché |
| Anticipation Lot C | ✅ aucune (pas de tuile, pas de `/comptes`, pas de menu) |
| Revues R1 / R2 / R3 | ✅ VALIDER / CORRIGER (corrigé) / VALIDER |

## 1. Fichiers touchés
**Modifiés** : `app/lib/admin/session.ts` (SessionAdmin.`doitChanger` requis ; `signerJeton` le signe, FORCÉ false si
`sub=null` ; `sessionDepuisPayload` le résout, false si sub null ou absent) · `app/(admin)/api/admin/session/route.ts`
(les 2 voies alimentent `doitChanger`) · `proxy.ts` (bloc enforcement + whitelist) · `app/lib/admin/comptes.ts`
(`trouverCompteParId`, `changerMotDePasseSelf`) · 4 fichiers de test (littéraux `SessionAdmin` + nouveaux cas).
**Créés** : `app/(admin)/api/admin/compte/mot-de-passe/route.ts` (POST self-service) · `app/(admin)/admin/compte/mot-de-passe/page.tsx`
(écran, hors layout `(protected)`) · `app/lib/admin/politiqueMdp.ts` (constante partagée) · 1 test de route.

**`garde.ts` non modifié** (contrainte respectée) : l'enforcement `doitChanger` vit dans `proxy.ts` (choke point) ;
la route self-service fait son propre re-check `actif` (cf. A1). Le test M3-0 `sub=null → aucune requête` reste vert.

## 2. Liste blanche exacte (chemins NON gardés par `doitChanger`) + justification
`CHEMINS_CHANGEMENT_MDP = { '/admin/compte/mot-de-passe', '/api/admin/compte/mot-de-passe' }` — **match EXACT**
(`Set.has`, jamais `startsWith`). Plus, whitelistés PLUS HAUT dans le proxy (avant tout contrôle, donc aussi
exemptés) : `/admin/login` et `/api/admin/session` (déconnexion). Justification minimale :
- la **page** de changement doit se rendre (sinon l'utilisateur ne peut rien faire) ;
- la **route** de changement doit être appelable (sinon il ne peut pas sortir du drapeau) ;
- la **déconnexion** doit rester possible dans tout état (issue de secours) ;
- les **assets** (`/_next/...`) ne sont pas dans le `matcher` du proxy → pas besoin de les whitelister.
Namespace **SINGULIER** `/compte/` — disjoint du futur `/comptes` (pluriel, Lot C) : `startsWith('/api/admin/comptes/')`
est faux pour `/api/admin/compte/mot-de-passe` (au 14ᵉ caractère `compte/` vs `comptes/`). Aucune collision (testé).

## 3. Preuves
- **`sub=null` jamais redirigé ni bloqué** : `signerJeton` force `doitChanger=false` quand `sub===null`
  (`session.ts`), ET `sessionDepuisPayload` re-force false → le bloc `if (session.doitChanger && …)` de `proxy.ts`
  est structurellement inatteignable pour la voie de secours. Test `proxy.test.ts` : `secours(true)` (drapeau passé à
  true en entrée) → non redirigé ; `session.test.ts` : payload signé porte `doitChanger=false`. Et la route
  self-service refuse `sub=null` en **400 propre** (jamais 500), testé.
- **Un jeton `doitChanger=true` ne peut RIEN écrire** : le bloc est placé EN AMONT de `permissionRequise` (dont le
  fail-open autoriserait un chemin non listé) → tout chemin admin hors whitelist est intercepté. Test
  `proxy.test.ts` : `/api/admin/curation/entites/5` (route d'écriture) avec un collaborateur `doitChanger=true` →
  **403 CHANGEMENT_REQUIS** avant même le handler.
- **Aucune fuite du mot de passe** : `changerMotDePasseSelf` journalise `changement_mot_de_passe` avec
  `avant/apres = NULL` ; la route ne logge rien, ne renvoie que `{ ok: true }`, et le clair ne quitte pas la fonction
  (grep : aucun `console.*` dans la route). Test : la réponse ne contient pas le clair.

## 4. Politique de mot de passe
Sobre : **longueur ≥ 12**, sans règle de composition (la longueur prime, cf. NIST 800-63B), + **refus si identique à
l'ancien** + confirmation. Vérification de l'ancien mot de passe (argon2) exigée. Le seuil vit dans **une seule
constante** `LONGUEUR_MIN_MOT_DE_PASSE` (`app/lib/admin/politiqueMdp.ts`) — CONSTANTE DE SÉCURITÉ, **pas** une
variable du moteur de score → hors `config_scoring`, non éditable au runtime (l'invariant « pilotage sans code » vise
le scoring). Importée par la route (autoritative) ET l'écran (validation native + prose) : aucun `12` dispersé
(correctif R3-2).

## 5. Revues adverses — verdicts & arbitrages
| Revue | Axe | Verdict | Notables |
|---|---|---|---|
| R1 | Contournement / sécurité | **VALIDER** | Gate en amont du fail-open ; whitelist exacte fail-closed (URL normalisée) ; pas de fuite ; ordre des checks correct ; forge impossible (HS256). |
| R2 | Lockout / boucles | **CORRIGER** | Aucune boucle, aucun lockout dur (voie de secours toujours ouverte). Défaut : l'écran de changement était un cul-de-sac (pas de sortie visible si changement impossible/abandon). |
| R3 | Namespaces / régression | **VALIDER** | Pas de collision singulier/pluriel ; chaîne DB→JWS→proxy intègre ; types exacts ; 3 tests métier cohérents. Recommandé : dé-dupliquer le seuil `12`. |

**Arbitrages :**
- **R2-3 (cul-de-sac UX)** — *accepté & corrigé* : ajout d'un bouton **« Se déconnecter »** sur l'écran (appelle
  `DELETE /api/admin/session` puis `/admin/login`). Ce n'est PAS un lien vers le reste de l'admin (issue vers le
  login) ; il réutilise un mécanisme déjà joignable. Sert au compte révoqué ET à qui veut abandonner.
- **R3-2 (seuil `12` dupliqué côté client)** — *accepté & corrigé* : `LONGUEUR_MIN_MOT_DE_PASSE` extrait dans
  `politiqueMdp.ts` (module partagé SANS `server-only`), importé par la route et la page ; plus aucun `12` en dur.
- **R1-5a (staleness ≤ 8 h)** — *accepté, documenté* : `proxy` lit le drapeau du JWS (≤ 8 h) ; remettre
  `doit_changer=true` en base n'affecte pas une session ouverte. Conforme à Q1=MVP ; commenté dans `session.ts`.
- **R1-5b (jeton legacy → false)** — *accepté, documenté* : fail-open assumé sur ce seul champ (un jeton antérieur
  appartient à un compte déjà établi).
- **R1 hors-périmètre (oracle du mot de passe actuel sans rate-limit)** — *hors correctif, tracé* : la route est,
  comme le login, un point de vérification argon2 sans rate-limit ; un cookie volé (≤ 8 h) pourrait brute-forcer
  l'ancien mot de passe. Même hypothèse déjà actée pour le login (rate-limit = chantier ultérieur). Argon2 renchérit
  fortement l'attaque. Recommandation : compteur d'échecs / verrouillage temporaire dans un lot dédié.
- **R2-6 réserve (`ADMIN_SESSION_SECRET`/`ADMIN_PASSWORD` absents → 500)** — *hors correctif* : mauvaise config de
  déploiement, pas un défaut de la logique. Un garde-fou de démarrage (fail-fast au boot) est une amélioration
  opérationnelle séparée. La voie de secours reste ouverte tant que ces secrets sont provisionnés.
- **Divergence SPEC↔code sur le chemin** — *tracé* : la spec (brouillon) nommait `/admin/mot-de-passe` ; le prompt du
  Lot B impose `/admin/compte/mot-de-passe` (singulier, namespace disjoint) → le code suit le prompt (qui supersède),
  et reste cohérent entre page/route/proxy. La spec mérite une mise à jour.

Aucun défaut de fond → pas d'arrêt.

## A. DÉCISIONS HORS-SPECS
- **A1 — Re-check `actif` dans la route self-service SANS `exigerCompteActif`.** La spec disait « exigerCompteActif ou
  équivalent ». `exigerCompteActif(module)` exige une PERMISSION de module ; or le changement de mot de passe doit
  marcher pour tout compte actif, y compris un collaborateur sans aucune permission. *Décision* : la route charge le
  compte par `sub` (`trouverCompteParId`) et vérifie `actif` directement (403 `ACCES_REVOQUE` sinon). *Impact* : même
  garantie « désactivé/supprimé ne peut pas changer », sans coupler à un module.
- **A2 — Statut de redirection 302 (pages).** Conforme au prompt ; l'ancienne redirection de perm de `proxy.ts`
  utilisait 307 (défaut) — j'ai gardé 307 là où elle existait et posé 302 pour le drapeau, comme demandé.
- **A3 — Bouton « Se déconnecter » sur l'écran** (issu de R2-3) : seule issue visible ; conforme à « pas de lien de
  fuite vers le reste de l'admin » (il sort vers le login, ne navigue pas dans l'admin).

## B. DOUTES
- **B1 — Absence de rate-limit sur la route de changement** (cf. R1 hors-périmètre). Assumé (aligné sur le login),
  à traiter dans un lot « rate-limit » dédié.
- **B2 — Staleness ≤ 8 h du drapeau** (cf. R1-5a). Accepté (Q1=MVP) ; un durcissement (relecture DB du drapeau côté
  écriture) est possible plus tard sans casser la voie de secours.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; `ST_Force2D` hors sujet ;
`password.ts`/`motDePasse.ts` byte-unchanged ; `garde.ts` intact ; aucune migration ; Gemini hors périmètre ;
responsive mobile-first + `prefers-reduced-motion` respectés (écran sobre, cibles ≥ 44 px, aucune animation).

## Séquence de TEST MANUEL pour Arno (navigateur)

Arno n'a aucun compte avec `doit_changer=true`. Pour en fabriquer un SANS casser son compte a.jorel :

1. **Créer un compte de test** (via CLI, Lot A) :
   `npm run admin:creer -- --identifiant test@sansvisavis.com --role collaborateur --prenom Test --nom Test`
   (mot de passe choisi ; il aura `doit_changer=false`).
2. **Le forcer en première connexion** (UPDATE ciblé) :
   `psql "$DATABASE_URL" -c "UPDATE admin_utilisateur SET doit_changer_mot_de_passe = true WHERE identifiant = 'test@sansvisavis.com';"`
3. **Se connecter** en navigateur avec `test@sansvisavis.com` + son mot de passe → doit être **redirigé** vers
   `/admin/compte/mot-de-passe` ; toute tentative d'aller ailleurs (ex. `/admin/curation`) re-redirige ; un appel API
   d'écriture renvoie 403 `CHANGEMENT_REQUIS`. Le bouton **« Se déconnecter »** doit fonctionner.
4. **Changer le mot de passe** (≥ 12 caractères, différent de l'actuel) → retour à `/admin`, navigation normale ;
   en base `doit_changer_mot_de_passe` est repassé à false ; `admin_utilisateur_log` porte `changement_mot_de_passe`.
5. **Vérifier la voie de secours** : se déconnecter, champ e-mail **vide** + mot de passe partagé → accès admin
   complet, **jamais** redirigé vers l'écran de changement.
6. **Retour arrière / nettoyage** du compte de test (désactivation, jamais de suppression) :
   `psql "$DATABASE_URL" -c "UPDATE admin_utilisateur SET actif = false WHERE identifiant = 'test@sansvisavis.com';"`
   (ou, pour rejouer l'étape 2 : `SET doit_changer_mot_de_passe = false`).

## Verdict de recon-valid (Phase 8)
**VALIDER.** L'enforcement est complet et sûr : gate en amont du fail-open, whitelist exacte, voie de secours doublement
neutralisée, route self-service qui vérifie l'ancien mot de passe + l'état actif et réémet un jeton frais, écran isolé
avec issue de déconnexion. `password.ts`/`motDePasse.ts`/`garde.ts` intacts, golden 23/23, aucune migration, aucune
anticipation du Lot C. Points non bloquants tracés : rate-limit (B1), staleness (B2), garde-fou de démarrage,
mise à jour de la spec sur le chemin. À toi de committer, fichier par fichier.
