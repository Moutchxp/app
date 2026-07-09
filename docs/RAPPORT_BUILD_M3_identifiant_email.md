# Rapport de build — Identifiant d'un compte administrateur = adresse e-mail

> Run `/svav-build` autonome. **Aucun commit, migration 015 NON appliquée** : livraison remise à Arno.
> Ce rapport ne s'est jamais interrompu ; il se lit APRÈS livraison, à la seule discrétion d'Arno.

---

## 0. Synthèse exécutive

Pose de la contrainte « l'identifiant d'un compte administrateur DOIT être une adresse e-mail », à **trois
niveaux** (base, script CLI, formulaire), **sans renommer** la colonne `identifiant` ni aucun champ du JWS, et
**sans construire** la procédure « mot de passe oublié » (chantier ultérieur). La **voie de secours** (identifiant
vide + ancien mot de passe partagé) reste intacte et **hors** de toute validation e-mail.

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ bit-identique (23/23, assertion interne) |
| `test:integration` | ✅ **23/23** |
| `tsc --noEmit` | ✅ 0 erreur |
| `eslint` (fichiers touchés) | ✅ 0 erreur, 0 warning |
| `npm test` | ✅ **514 passed / 21 skipped**, 41 fichiers |
| `next build` | ✅ succès |
| Parcours public inchangé | ✅ `app/page.tsx` & moteur non modifiés |
| `password.ts` byte-unchanged | ✅ `git diff` vide (idem `motDePasse.ts`) |
| Tests (a)–(f) | ✅ tous couverts (cf. §3) |

---

## 1. Fichiers touchés

**Créés**
- `db/migrations/015_identifiant_email.sql` — CHECK e-mail additive (NON appliquée par ce run).
- `app/lib/admin/email.ts` — `estEmailValide(valeur)` (validation minimale, partagée CLI/formulaire).
- `app/lib/admin/email.test.ts` — cas valides/invalides + bornes de longueur 254/255.

**Modifiés**
- `app/scripts/admin.ts` — `creer` et `secours` exigent un identifiant e-mail **avant** la saisie du mot de passe
  (`exigerIdentifiantEmail`). `reset`/`lister` inchangés (recherche insensible à la casse).
- `app/(admin)/admin/login/page.tsx` — libellé « Adresse e-mail », `type="email"`/`inputMode="email"`,
  placeholder, texte d'aide « Laisser vide pour l'accès de secours. » ; champ resté **facultatif** (pas de `required`).
- `app/(admin)/api/admin/session/route.test.ts` — cas (f) mal formé + (d) casse mixte.
- `app/lib/admin/comptes.test.ts` — assertion SQL `lower(identifiant)=lower($1)` pour `trouverCompte`.

**NON touchés** (interdictions & invariant sécurité) : `app/lib/admin/password.ts`, `app/lib/admin/motDePasse.ts`,
`app/(admin)/api/admin/session/route.ts` (voir A1), `session.ts`/JWS, moteur, `config_scoring`, `pipeline.itest.ts`,
`app/page.tsx`, routes de curation, fichiers Gemini. **Aucune dépendance nouvelle.**

---

## 2. La contrainte, aux trois niveaux

1. **Base** (`015`) : `CHECK (identifiant ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')` — permissif (une arobase, un point
   après, aucun blanc), validée immédiatement (pas de `NOT VALID`). La table étant vide, aucune donnée touchée ;
   si elle ne l'était pas et contenait un non-conforme, l'ALTER échouerait (garde-fou voulu).
2. **Script CLI** : `creer`/`secours` refusent tôt, message clair, **sans** infliger la double saisie masquée.
3. **Formulaire** : `type="email"` + validation applicative côté serveur (via la base) ; champ vide = voie de secours.

Unicité et comparaison **insensibles à la casse** : assurées par l'index `lower(identifiant)` de 014 et le
`WHERE lower(identifiant) = lower($1)` de `trouverCompte`. L'adresse est **stockée telle que saisie** (aucune
normalisation en minuscules à l'insertion).

---

## 3. Tests exigés (a)–(f) — où ils sont prouvés

| # | Exigence | Preuve |
|---|---|---|
| a | `estEmailValide` sur les cas listés | `email.test.ts` (valides + invalides + bornes 254/255) |
| b | `admin:creer` refuse « arno » | `email.test.ts` (`'arno'` → false) + câblage `exigerIdentifiantEmail` dans `creer` |
| c | `admin:creer` accepte « a.jorel@sansvisavis.com » | `email.test.ts` (adresse dans la liste valide) |
| d | Connexion insensible à la casse | `comptes.test.ts` (SQL `lower()=lower()`) + `route.test.ts` (casse mixte → 200) |
| e | Voie de secours (identifiant vide) opérante | `route.test.ts` (test « voie de secours » toujours vert, route inchangée) |
| f | Identifiant mal formé → message générique identique | `route.test.ts` (`'pas-un-email'` → 401 `Identifiants invalides`, leurre exécuté) |

> Note (b)/(c) : la CLI exécute `main()` au chargement du module (`main().catch().finally()`), donc non importable
> proprement en test sans effets de bord DB/readline. La preuve passe par le **validateur partagé** (`estEmailValide`,
> testé exhaustivement) + le câblage visible dans `admin.ts`. Décision tracée en B1.

---

## A. DÉCISIONS HORS-SPECS (point d'attention prioritaire)

**A1. Route de connexion NON modifiée (choix de sécurité).** Les trois exigences du Lot 2 pour la route étaient
**déjà satisfaites** par l'implémentation existante : (1) comparaison en minuscules → `trouverCompte` fait
`lower(identifiant)=lower($1)` ; (2) identifiant mal formé rejeté comme échec ordinaire → un mal-formé ne matche
aucun compte (la CHECK e-mail interdit tout compte non conforme) donc `trouverCompte` renvoie `null`, le verify de
**leurre** s'exécute et le message générique unique est renvoyé ; (3) voie de secours intacte. **Ajouter un
`estEmailValide` dans la route aurait NUI** : un court-circuit « format invalide » rejetterait vite le mal-formé
alors qu'un identifiant bien formé mais inconnu subit ~26 ms d'argon2 → **fuite de timing** distinguant les deux.
*Décision* : ne pas toucher la route ; prouver le comportement par test (f). *Alternative écartée* : valider dans la
route puis exécuter quand même le leurre (code redondant, aucun gain fonctionnel, la CHECK base garantit déjà qu'un
compte stocké est un e-mail). *Impact* : nul sur le comportement ; renforce la cohérence anti-timing.

**A2. `reset` n'impose PAS le format e-mail.** Seuls `creer`/`secours` l'exigent (conforme à la spec). `reset` cible
un compte **existant**, donc nécessairement conforme (CHECK base) ; la recherche reste insensible à la casse.
*Impact* : `reset` reste utilisable même si un identifiant historique bordait la règle.

**A3. Garde de longueur `estEmailValide` à 254.** RFC 5321 (longueur max d'un chemin d'adresse) plutôt que 320
(local 64 + @ + domaine 255). La spec dit « ≤ 254 » : appliqué tel quel. *Impact* : quelques adresses extrêmes
théoriques (255–320) refusées ; sans portée pratique.

**A4. Rejet des domaines à point en tête/fin** (`@.fr`, `exemple.`) ajouté au-delà de la lettre de la spec
(« domaine avec au moins un point »). Bonne pratique évitant `a@.` trivialement absurde. *Alternative écartée* :
s'en tenir à `includes('.')` (laisserait passer `a@.fr`). *Impact* : validation légèrement plus stricte, cohérente
avec l'intention.

**A5. Placeholder `prenom@exemple.fr` et aide « Laisser vide pour l'accès de secours. »** Formulations choisies
(spec donnait « ex. »). Le texte d'aide est marqué à retirer au lot de bascule M3-5 (commentaire dans le JSX).

**A6. `type="email"` bloque côté navigateur une saisie non-e-mail NON vide.** Conséquence voulue de la spec
(elle demande `type="email"`). Cela n'entrave PAS la voie de secours (champ **vide** = valide pour la validation
native) ni la soumission vide. Le rejet « échec ordinaire, message générique » reste garanti **côté serveur** (test f),
seule barrière qui compte pour la non-divulgation. *Impact* : meilleure UX, aucun conflit avec l'anti-fuite serveur.

---

## B. DOUTES

**B1. Couverture de test de la CLI.** `admin.ts` lance `main()` à l'import → non testable unitairement sans effets
de bord (DB, readline, `closePool`). Les critères (b)/(c) sont donc prouvés via `estEmailValide` (testé) + revue du
câblage, pas par exécution de la commande. *Risque* : un futur remaniement de `main()` pourrait déplacer la garde
sans qu'un test CLI l'attrape. *Atténuation* : la garde est un simple appel `exigerIdentifiantEmail()` en tête de
branche, trivial à relire ; un test d'intégration CLI (refactor de `main()` en fonction exportée) serait le vrai
correctif, hors périmètre de ce lot.

**B2. Regex SQL vs validateur applicatif — légère divergence assumée.** La CHECK base (`~*` permissif) et
`estEmailValide` ne sont pas strictement équivalents (le validateur applicatif est un peu plus strict : longueur
254, points de bord). C'est **voulu** (validation fine côté app). Conséquence : une valeur acceptée par la base
mais refusée par l'app ne peut pas être créée via la CLI (l'app filtre avant). Aucune incohérence exploitable.

---

## C. ÉCARTS DE CONFORMITÉ

**Aucun.** Golden `29.107259068449615` bit-identique (23/23) ; le chantier ne touche aucun fichier moteur ni
`config_scoring` (verdict/score inchangés, séparation verdict/photo non concernée) ; `ST_Force2D` hors sujet
(aucune opération distance/raster) ; RGPD : aucune donnée personnelle d'internaute manipulée (identifiant =
adresse d'un opérateur interne ; aucun envoi d'e-mail dans ce lot) ; Gemini hors périmètre ; `password.ts` et
`motDePasse.ts` byte-unchanged.

---

## Séquence pour Arno (dans le terminal de `app/`)

> Prérequis : `DATABASE_URL` exporté (présent dans `.env`, chargé par `client.ts`).

1. **Appliquer la migration 015** (la table `admin_utilisateur` doit être VIDE — sinon l'ALTER échoue, c'est le garde-fou) :
   ```
   psql "$DATABASE_URL" -f db/migrations/015_identifiant_email.sql
   ```
2. **Recréer ton compte avec ton adresse e-mail** (mot de passe demandé en saisie masquée, à confirmer) :
   ```
   npm run admin:creer -- --identifiant a.jorel@sansvisavis.com --role administrateur
   ```
   (Un `--identifiant arno` serait désormais refusé AVANT la saisie du mot de passe.)
3. **Vérifier en navigateur** : `/admin/login` → champ **Adresse e-mail** = `a.jorel@sansvisavis.com` (teste aussi
   une casse mixte, ex. `A.Jorel@SansVisAVis.com`, qui doit marcher) + ton mot de passe → accès admin. Puis la
   **voie de secours** : champ e-mail **vide** + ancien mot de passe partagé → accès admin complet.
4. **Corde de rappel** (idempotente, si tu te verrouilles dehors) :
   ```
   npm run admin:secours -- --identifiant a.jorel@sansvisavis.com
   ```
   Utile : `npm run admin:lister` (jamais le hash) · `npm run admin:reset -- --identifiant a.jorel@sansvisavis.com`.

---

## Verdict de recon-valid (Phase 8)

**VALIDER.** La contrainte e-mail est posée aux trois niveaux demandés, sans renommage de colonne ni de champ JWS,
sans dépendance nouvelle, sans procédure « mot de passe oublié ». La voie de secours et `password.ts`/`motDePasse.ts`
sont intacts (byte-unchanged prouvé). La migration 015 est écrite mais NON appliquée (Arno l'applique). Le choix de
ne pas modifier la route (A1) est le seul écart au découpage littéral de la spec, et il **renforce** la sécurité
anti-timing tout en satisfaisant les exigences fonctionnelles (prouvé par test f). Tous les critères de sortie sont
verts ; catégorie C vide. Point à suivre (non bloquant) : test d'intégration de la CLI (B1) dans un lot ultérieur.
