# Rapport de build — M3-4 Lot C : tuile « Administratif » (création & gestion des comptes)

> Run `/svav-build` autonome. **Aucun commit, aucune migration** (016 suffit). Livraison à Arno.
> Dernier lot de M3-4 (A données ✅ → B enforcement ✅ → **C UI**). Aucune anticipation au-delà de M3-4.

## 0. Synthèse

Tuile « Administratif » (namespace PLURIEL `/comptes`) : création de comptes (mot de passe temporaire à usage
unique, `doit_changer=true`), liste, activer/désactiver, régénérer un mot de passe temporaire ; filtrage du menu
latéral ; en-tête de profil. **Réservée au rôle administrateur** par DOUBLE BARRIÈRE. Aucune suppression, aucune
édition de rôle/permissions d'un compte existant (Q3).

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc` / `eslint` | ✅ 0 / 0 |
| `npm test` | ✅ **572 passed / 21 skipped** (46 fichiers) |
| `next build` | ✅ (bundle client propre — la page n'importe que des TYPES de session.ts) |
| `password.ts` / `motDePasse.ts` byte-unchanged | ✅ (diff vide) |
| `garde.ts` | ✅ ADDITIF (`exigerAdministrateur` ajouté ; `exigerCompteActif` M3-0 INCHANGÉ ; test `sub=null → aucune requête` vert) |
| Migration / Gemini / suppression / édition rôle-perms (Q3) | ✅ aucune |
| Revues R1 / R2 / R3 | ✅ VALIDER / CORRIGER (corrigé) / VALIDER |

## 1. Fichiers touchés
**Créés** : `app/(admin)/api/admin/comptes/route.ts` (GET liste + POST création), `.../comptes/[id]/actif/route.ts`,
`.../comptes/[id]/mot-de-passe-temporaire/route.ts`, `app/(admin)/admin/(protected)/comptes/page.tsx` (écran),
`app/(admin)/admin/(protected)/menuAdmin.ts` (+ test), `app/lib/admin/motDePasseTemporaire.ts` (générateur CSPRNG
server-only), 2 tests (`comptes/route.test.ts`, `menuAdmin.test.ts`).
**Modifiés** : `app/lib/admin/garde.ts` (+`exigerAdministrateur`), `app/lib/admin/comptes.ts`
(`creerCompteAdministration`, `regenererMotDePasseTemporaire`, `reactiverCompte`, `desactiverCompte`, `id` dans
`CompteListe`), `proxy.ts` (garde rôle `/comptes`), `Sidebar.tsx` (filtrage), `layout.tsx` (session + en-tête profil),
`comptes.test.ts`, `proxy.test.ts`.

## 2. Tuile inaccessible à un collaborateur — les DEUX barrières
- **Barrière (a) — proxy, rôle du JWS** : `estAdministratif('/admin/comptes' | '/api/admin/comptes')` + `session.role
  !== 'administrateur'` → 403 (API) / redirection `/admin` (page). Placée EN AMONT de `permissionRequise` → immunisée
  contre son fail-open. Testé (proxy.test : collaborateur, même toutes perms, → 403/redirect).
- **Barrière (b) — handler, rôle EN BASE** : chaque route `comptes*` appelle `exigerAdministrateur(request)`
  (garde.ts) qui **relit** `SELECT actif, role WHERE id=sub` et refuse si absent/inactif/non-administrateur.
  Indispensable car le JWS vit ≤ 8 h : un rôle rétrogradé en base y resterait `administrateur`. **Testé** :
  jeton `role=administrateur` mais base `collaborateur` → 403 INTERDIT, aucune création (comptes/route.test).

## 3. Mot de passe temporaire — n'apparaît nulle part ailleurs
Généré par `crypto.randomInt` (CSPRNG, alphabet sans ambiguïté, 16 car., server-only → hors bundle client).
Renvoyé **une seule fois** dans le corps 201 (création) ou de la régénération. **Jamais** : dans
`admin_utilisateur_log` (le journal ne porte que identifiant/rôle ou rien), dans un `console.*` (aucun log), dans
une réponse d'erreur, dans une URL/Referer (tout en corps POST), ni ré-affichable (la liste exclut le hash ; la
récupération = régénérer un NOUVEAU temporaire). **Testé** : le clair n'est jamais un paramètre SQL (seul le hash
l'est) ; la liste ne contient pas `mot_de_passe`.

## 4. SQL exact — « dernier administrateur actif » (write-skew corrigé, R2-1)
```sql
-- Dans une transaction (withTransaction), APRÈS un verrou de sérialisation :
SELECT pg_advisory_xact_lock(71642342);
WITH maj AS (
  UPDATE admin_utilisateur SET actif = false
   WHERE id = $1 AND actif = true
     AND NOT (role = 'administrateur'
              AND (SELECT count(*) FROM admin_utilisateur WHERE actif AND role = 'administrateur') <= 1)
   RETURNING id
), jrnl AS (
  INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
  SELECT 'desactivation', maj.id, $2, jsonb_build_object('actif', true), jsonb_build_object('actif', false) FROM maj
)
SELECT id FROM maj;
```
Le `pg_advisory_xact_lock` **sérialise les désactivations** : sans lui, deux désactivations concurrentes de deux
admins distincts verraient chacune `count=2` (write-skew sous READ COMMITTED) → 0 admin. Avec le verrou, la 2ᵉ
recompte `count=1` et est bloquée. La réactivation n'a pas besoin du verrou (elle ne peut qu'augmenter le nombre
d'admins). AUCUNE suppression, AUCUN UPDATE de masse (toujours `WHERE id=$1`).

## 5. Voie de secours (sub=null) sur chaque écran nouveau
- **Menu** : `role='administrateur'` → voit tous les liens + « Administratif ».
- **Garde `exigerAdministrateur`** : `sub=null` → autorisé SANS requête, `auteurId=null` → journal `auteur_id NULL`
  (documenté).
- **En-tête profil** : « Accès de secours » + « Administrateur », `trouverCompteParId(null)` JAMAIS appelé (pas de
  crash), et le lien « Changer mon mot de passe » est MASQUÉ (elle n'a pas de compte à modifier).
- **Route self-service** (Lot B) : refuse proprement `sub=null` (déjà couvert).
La corde de rappel navigateur (`password.ts`) reste indépendante de la base → aucun enfermement possible.

## 6. Revues adverses — verdicts & arbitrages
| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Escalade de privilège | **VALIDER** | Double barrière solide (jeton rétrogradé refusé) ; temporaire ne fuit pas ; CSPRNG ; perms admin forcées true ; paramétré. |
| R2 | Lockout / continuité | **CORRIGER** | Write-skew RÉEL sur « dernier admin » (fausse atomicité). Voie de secours, mapping HTTP, anti-masse : solides. |
| R3 | Namespaces / menu / régression | **VALIDER** | Pas de collision `/comptes` vs `/compte` ; menu jamais autoritaire ni masquant pour un admin ; mocks garde inoffensifs ; bundle client propre. |

**Arbitrages :**
- **R2-1 (write-skew)** — *accepté & corrigé* : `desactiverCompte` passe en `withTransaction` + `pg_advisory_xact_lock`
  ; commentaire « atomique » remplacé par l'explication réelle (sérialisation). Test mis à jour (verrou puis UPDATE).
- **R1-3 (id non canonique `Number('5e2')`)** — *accepté & corrigé* : validation stricte `/^[1-9]\d*$/` sur l'`id`
  de route (rejette `5e2`, `0x10`, `007`, négatifs) dans les 2 routes `[id]`.
- **R2-2 (auto-désactivation d'un admin non-dernier)** — *tracé, non corrigé* : action légitime, récupérable (autre
  admin / secours) ; l'invariant système (≥ 1 admin) tient (le DERNIER est bloqué). Un garde « pas soi-même » serait
  un choix produit, hors périmètre.
- **R2-3 (auto-régénération de son propre temporaire)** — *tracé, non corrigé* : la session en cours n'est pas
  piégée (JWS `doitChanger=false` ≤ 8 h) ; récupérable. Foot-gun mineur.
- **R3-3 / R1-1 (requête DB par page pour le nom ; fenêtre page ≤ 8 h)** — *acceptés, documentés* : la page ne fait
  qu'afficher la coquille ; toute donnée/action passe par l'API (barrière b). Compromis Q1=MVP.

Aucun défaut de fond → pas d'arrêt (le write-skew est un bug de concurrence corrigeable en périmètre, pas une
décision métier).

## A. DÉCISIONS HORS-SPECS
- **A1 — `exigerAdministrateur` ajouté à garde.ts** (pas `exigerCompteActif`, qui est scopé par module) : la tuile a
  besoin d'une garde de RÔLE, pas de permission de module. Ajout additif ; `exigerCompteActif` intact.
- **A2 — En-tête profil : requête DB par rendu** (`trouverCompteParId(sub)`) pour afficher « Prénom Nom » (le JWS ne
  porte pas prenom/nom). *Alternative écartée* : mettre prenom/nom dans le JWS (imposerait une re-connexion et
  élargirait le Lot B). *Impact* : une lecture mono-ligne par page admin ; acceptable.
- **A3 — Générateur temporaire dans un module server-only dédié** (`motDePasseTemporaire.ts`) plutôt que dans
  `politiqueMdp.ts` (partagé client) : `node:crypto` ne doit pas entrer dans le bundle client.
- **A4 — Constantes de sécurité** : longueur/alphabet du temporaire (`motDePasseTemporaire.ts`) et clé de verrou
  (`comptes.ts`) sont des constantes de sécurité centralisées — **aucune variable de moteur de score n'est
  introduite**, donc rien à mettre en `config_scoring` (l'invariant « pilotage sans code » vise le scoring).

## B. DOUTES
- **B1 — Auto-désactivation / auto-régénération** (R2-2, R2-3) : récupérables, invariant système préservé ; à durcir
  seulement si Arno le souhaite (choix produit).
- **B2 — Fenêtre ≤ 8 h page-only** (rôle rétrogradé voit encore la coquille de page) : sans exposition de données
  (API = barrière b). Compromis Q1=MVP.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; `password.ts`/
`motDePasse.ts` byte-unchanged ; `garde.ts` additif ; aucune migration ; Gemini hors périmètre ; **aucune
suppression** (désactivation seule) ; **aucune édition rôle/permissions d'un compte existant** (Q3) ; responsive
mobile-first + `prefers-reduced-motion` respectés (cartes empilées < 768 px, cibles ≥ 44 px, aucune animation).

## Séquence de TEST MANUEL pour Arno (navigateur)
1. Connecte-toi (compte nommé administrateur, ou voie de secours). Le menu montre **« Administratif »** ; l'en-tête
   affiche ton identité (ou « Accès de secours »).
2. Va sur **Administratif** → **Créer un compte** : prénom, nom, e-mail, rôle *collaborateur*, coche p.ex. *Curation*.
   → une **modale** affiche le mot de passe temporaire (copie + case « j'ai transmis » avant fermeture).
3. Dans un onglet privé, connecte-toi avec ce compte + le temporaire → **redirigé** vers l'écran de changement
   (Lot B). Change-le → accès normal, limité au module *Curation*. Son menu ne montre **pas** « Administratif ».
4. De retour en admin : **Désactiver** ce compte, puis **Activer** ; **Régénérer** son mot de passe (nouvelle modale).
5. **Dernier administrateur** : tente de te désactiver toi-même en étant le seul admin actif → refus (409). Ajoute un
   2ᵉ administrateur d'abord si tu veux tester la désactivation d'un admin.
6. **Nettoyage** (désactivation, JAMAIS de suppression) : dans l'écran, **Désactiver** les comptes de test. (En base
   si besoin : `UPDATE admin_utilisateur SET actif = false WHERE identifiant = '…';` — jamais de DELETE.)

## Verdict de recon-valid (Phase 8)
**VALIDER.** Double barrière prouvée (proxy + relecture rôle en base), mot de passe temporaire à usage unique sans
fuite, règle « dernier admin » désormais **sérialisée** contre le write-skew, menu confort (proxy seule autorité),
voie de secours intacte partout, aucune suppression ni édition rôle/perms (Q3), golden 23/23, `password.ts`/
`motDePasse.ts` byte-unchanged, aucune migration. À toi de committer, fichier par fichier.
