# RAPPORT FINAL — build « Coquille admin + auth » (Étape 1)

> Run `/svav-build` autonome sur `docs/SPEC_coquille_admin_auth.md`. **Non committé** (Arno valide et
> commit). Trois catégories : A décisions hors-specs · B doutes · C écarts de conformité.

## Résumé
Livraison **complète et verte**. Coquille admin protégée (login mot de passe seul, session `jose` 8 h,
5 pages placeholder + accueil, sidebar responsive) en **Next.js 16.2.9**. `tsc`/`eslint` 0 erreur ;
**vitest admin 13/13**, suite complète 235 passés ; `npm run build` OK ; **golden inchangé** ; serveur
de dev `localhost:3000` garde active (307/401/200). Aucun impact moteur/DB/`config_scoring`.

## Fichiers produits
- `proxy.ts` (racine — garde d'accès, ex-`middleware.ts`).
- `app/lib/admin/session.ts` (jose HS256, cookie) + `session.test.ts`.
- `app/lib/admin/password.ts` (temps constant) + `password.test.ts`.
- `app/(admin)/layout.tsx` (wrapper noindex).
- `app/(admin)/admin/login/page.tsx` (login public client).
- `app/(admin)/admin/(protected)/layout.tsx` + `Sidebar.tsx` (coquille) + `page.tsx` + 5 placeholders
  (`pilotage/statistiques/internautes/curation/banc-test`).
- `app/(admin)/api/admin/session/route.ts` (POST/DELETE) + `ping/route.ts` (GET gardé).
- Modifiés : `package.json`/`package-lock.json` (+`jose`, +`server-only`), `.env.example` (2 clés vides),
  `.env` (valeurs de DEV, git-ignoré), `vitest.config.ts` (alias `server-only` pour les tests).

---

## A. DÉCISIONS HORS-SPECS (le plus important — à contrôler par Arno)

- **A1 — `middleware.ts` → `proxy.ts` (imposé par Next 16).** La spec (EX-11..15, D-HS4) disait
  « middleware.ts » ; en Next 16 il est **déprécié et renommé `proxy.ts`** (racine, runtime Node). Le
  **comportement est identique**. Alternative écartée : garder `middleware.ts` (déprécié, warning au build).
- **A2 — Emplacement de la coquille.** Spec (tableau T1) : `app/(admin)/layout.tsx`. Implémenté :
  `app/(admin)/admin/(protected)/layout.tsx` (la coquille), `app/(admin)/layout.tsx` restant un simple
  wrapper `noindex`. Raison : mettre la sidebar dans `(admin)/layout.tsx` l'appliquerait aussi à
  `/admin/login`, ce qui contredit EX-14 (login shell-free). Même URLs, même comportement.
- **A3 — Nom du cookie** : `svv_admin_session` (spec silencieuse).
- **A4 — Whitelist proxy** : `/admin/login` ET `/api/admin/session` exemptés de garde (sinon le login
  lui-même exigerait une session). Égalité stricte (`===`), pas de préfixe laxiste.
- **A5 — Comparaison mot de passe** : `timingSafeEqual(sha256(saisi), sha256(ADMIN_PASSWORD))` — le
  « comment » du « temps constant » d'EX-19 (SHA-256 → 32 o fixes, aucune fuite longueur/préfixe).
- **A6 — `vitest.config.ts` : alias `server-only` → fichier vide du paquet.** Nécessaire car `server-only`
  throw en env node de test. Standard pour tester du code `server-only` ; **le marqueur reste actif au
  build Next** (isolation client intacte, prouvée par build OK). *Seul fichier hors périmètre admin touché.*
- **A7 — Responsive sidebar** : media queries injectées via `<style>` dans le composant client (préfixe
  `svv-adm-`) plutôt que dans `globals.css`, pour rester chirurgical et ne pas polluer la charte globale.
- **A8 — Valeurs `.env` de dev** ajoutées (`ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`) pour tester ;
  fichier **git-ignoré**, secrets réels jamais versionnés (`.env.example` = clés vides).

## B. DOUTES (à trancher par Arno, pas des bugs)

- **B1 — `proxy.ts` non testé unitairement** : c'est le fichier le plus critique pour la sécurité
  (whitelist, 401 vs redirect). Acceptable à l'Étape 1 (vérifié par smoke-test + code-review), mais à
  **couvrir par des tests avant** de mettre des données réelles derrière l'admin.
- **B2 — Pas de rate-limiting sur `POST /api/admin/session`** : = **dette D3 déjà actée** (anti-force-brute
  reporté, l'admin étant derrière la barrière réseau). Rappel pour mémoire.
- **B3 — `ADMIN_PASSWORD` comparé en clair** (via SHA-256) : conforme EX-16 pour la phase dev ; pour la
  prod, envisager un hash lent (bcrypt/argon2) et/ou multi-utilisateur.
- **B4 — `SameSite=Strict`** : un lien externe (email) vers `/admin` renverra une fois sur le login même
  authentifié (cookie Strict non envoyé sur la navigation cross-site initiale). Comportement **voulu**
  pour un outil interne — à confirmer.
- **B5 — MINEURS de couverture** : pas de test défensif `alg=none` (déjà rejeté par l'allowlist jose) ;
  login-déjà-connecté non redirigé vers `/admin` (UX, sans impact sécu).

## C. ÉCARTS DE CONFORMITÉ

**Aucun.** Batterie SVAV (Phase 6) intégralement verte :
- **GOLDEN** : `test:integration` 14/14, **`29.107259068449615` inchangé** (aucun mouvement).
- **ISOLATION** : aucun import `app/lib/svv`/`app/lib/db` (proxy + admin) ; `server-only` sur helpers/handlers.
- **MOTEUR / config_scoring / migrations** : aucun fichier touché (git status).
- **GEMINI** : `adaptateurIaPhoto.ts` / `analyse-photo/route.ts` intacts (hors staging).
- **Secrets** : aucun en dur, aucun `NEXT_PUBLIC_` ; tout via `process.env`.

---

## Verdict de conformité : livraison prête pour validation d'Arno. Aucun blocage. Aucune suppression de
données (Règle dure non sollicitée).
