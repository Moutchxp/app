# Rapport de build — M3-4 Lot A : schéma des comptes admin (prénom, nom, drapeau)

> Run `/svav-build` autonome. **Aucun commit, migration 016 NON appliquée.** Livraison remise à Arno.
> Ce lot A a débuté par un ARRÊT sanctionné (incompatibilité `secours` × NOT NULL) qu'Arno a tranché
> (Option 4 : `secours` perd sa branche création) avant la reprise. Ce rapport se lit APRÈS livraison.

## 0. Synthèse

Ajoute l'identité (`prenom`, `nom`) et le drapeau de première connexion (`doit_changer_mot_de_passe`) au schéma
des comptes admin, sans anticiper les Lots B/C. La donnée est rendue disponible et typée (le drapeau **n'entre pas**
encore dans le JWS — ce sera le Lot B). `admin:secours` est ramené à un contrat **réactivation seule**.

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc --noEmit` | ✅ 0 |
| `eslint` (fichiers touchés) | ✅ 0 |
| `npm test` | ✅ **527 passed / 21 skipped** (43 fichiers) |
| `next build` | ✅ |
| `password.ts` / `motDePasse.ts` / `proxy.ts` / `garde.ts` byte-unchanged | ✅ (diff vide) |
| Migration appliquée | ✅ NON (fichier seul) |
| Gemini | ✅ non touché |
| Revues adverses R1 / R2 / R3 | ✅ VALIDER / VALIDER / CORRIGER (corrigé) |

## 1. Fichiers touchés
- `db/migrations/016_comptes_identite.sql` (nouveau) — schéma, NON appliquée.
- `app/lib/admin/comptes.ts` — `CompteDB` + `SELECT_COMPTE` + `CompteListe`/`listerComptes` exposent les 3 colonnes ;
  `creerCompte(identifiant, role, motDePasseClair, prenom, nom)` (persiste prenom/nom, backstop non-vide) ;
  `secours` = **réactivation seule** (branche création retirée, refus si inconnu, ne touche jamais l'identité).
- `app/scripts/admin.ts` — `admin:creer` exige `--prenom`/`--nom` (validés AVANT le mot de passe) ; `admin:secours`
  nouveau contrat ; `admin:lister` affiche prénom/nom ; en-tête et messages mis à jour.
- `app/lib/admin/comptes.test.ts` — tests mis à jour (signature, secours réactivation-seule, validation, 3 colonnes).

**Byte-unchanged confirmé** : `password.ts`, `motDePasse.ts`, `proxy.ts`, `garde.ts` (diff vide). Le test M3-0
(voie de secours sub=null → aucune requête) reste vert.

## 2. Le SQL de 016 (résumé) et la séquence EXACTE pour Arno

**Contenu de 016** (transaction `BEGIN…COMMIT`, rejouable) :
1. `ADD COLUMN IF NOT EXISTS` : `prenom text`, `nom text`, `doit_changer_mot_de_passe boolean NOT NULL DEFAULT false`.
2. Backfill CIBLÉ : `UPDATE … SET prenom='Arnaud', nom='Jorel' WHERE identifiant='a.jorel@sansvisavis.com' AND (prenom IS NULL OR nom IS NULL)`.
3. `ALTER COLUMN prenom/nom SET NOT NULL` (idempotent ; échoue net si un autre compte a prenom/nom NULL → ROLLBACK).
4. CHECK non-vide (DO-block gardé par nom) : `prenom ~ '[^[:space:][:cntrl:]]'`, idem `nom`.
5. CHECK d'actions du journal recréé (DROP IF EXISTS + ADD) avec `'changement_mot_de_passe'` en plus (Q2).

**Séquence Arno (dans `app/`)** :
1. **Contrôle préalable** : `psql "$DATABASE_URL" -c "SELECT count(*) FROM admin_utilisateur WHERE prenom IS NULL OR nom IS NULL;"`
   → doit être **1** (a.jorel seul). Si > 1, un autre compte sans identité existe : le renseigner avant, sinon
   l'étape 3 (SET NOT NULL) fera échouer la migration (rollback propre).
2. **Appliquer** (arrêt au 1er échec) : `psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/016_comptes_identite.sql`.
3. **Déployer le code M3-4 Lot A APRÈS** la migration (le nouveau `SELECT_COMPTE` lit les 3 colonnes ; ordre inverse
   dégraderait la connexion NOMMÉE — la voie de secours navigateur, elle, reste toujours opérante).
4. **Vérifier** : `npm run admin:lister` (a.jorel doit afficher « Arnaud Jorel »).

**En cas d'échec** : la transaction ROLLBACK entièrement → aucun état partiel. Lire le message psql (grâce à
`ON_ERROR_STOP=1`), corriger la cause (souvent : une ligne prenom/nom NULL non backfillée), rejouer le fichier
(idempotent).

**Rollback** : ne PAS `DROP` les colonnes (destructif). Elles sont additives et ignorées par l'ancien code →
revenir en arrière = **redéployer l'ancien code**, en laissant les colonnes en place. (Ces notes sont aussi dans
l'en-tête de 016.)

## 3. Diff de contrat de `admin:secours`

| Avant (M3 Lot 2) | Après (M3-4 Lot A) |
|---|---|
| Compte existant → réactive | **Inchangé** : réactive (actif=true, administrateur, toutes perms, mot de passe réinitialisé), ne touche jamais prenom/nom |
| Identifiant absent → **CRÉE** un administrateur | **Refus** : `ErreurCompte('Aucun compte avec cet identifiant. Utilisez npm run admin:creer.')`, code de sortie ≠ 0, **aucun INSERT** |
| Retour `{…, action: 'creation' \| 'reactivation' }` | Retour `ResultatCompte` (plus de champ `action`) |

*Raison* (arbitrée par Arno) : `prenom/nom` étant NOT NULL, une création par `secours` exigerait une identité ;
une valeur sentinelle serait « un NULL déguisé, en pire, car le NOT NULL ment ». La vraie corde de rappel reste la
**voie de secours NAVIGATEUR** (identifiant vide + mot de passe partagé, `sub=null`, `password.ts`), indépendante
de toute ligne en base — prouvé intact par R2.

## 4. Revues adverses — verdicts & arbitrages

| Revue | Axe | Verdict | Notables |
|---|---|---|---|
| R1 | Migration | **VALIDER** | Idempotence OK ; nom de la CHECK d'actions correct (`admin_utilisateur_log_action_check`) ; transaction saine ; SET NOT NULL fail-net correct. Réserves faibles : commentaire NBSP surestimé, prescrire `ON_ERROR_STOP=1`. |
| R2 | Continuité / lockout | **VALIDER** | Voie de secours navigateur DB-indépendante → aucun lockout ; ordre 016-first sûr ; drapeau absent du JWS. À porter : note de rollback + rappel d'ordre dans l'en-tête ; divergence Stratégie 1/3 à confirmer. |
| R3 | Contrat & cohérence | **CORRIGER** | Aucun code mort, aucune aide mensongère, types exacts, drapeau hors JWS. Un vrai défaut : assertion de test tautologique `toContain('nom')`. |

**Arbitrages :**
- **R3-6 (tautologie `toContain('nom')`)** — *accepté & corrigé* : `'prenom'` contient `'nom'` → l'assertion ne
  pouvait pas échouer. Remplacée par `toContain(', nom,')` (token délimité).
- **R1-4 (NBSP)** — *accepté & corrigé* : le commentaire prétendait à tort couvrir U+00A0 (glibc ne le classe pas
  toujours comme space). Commentaire corrigé ; noté que la couche applicative (`trim()` JS, qui retire l'insécable)
  rejette déjà un prénom NBSP-only via `exigerTexte`/`creerCompte`. La CHECK reste un backstop ASCII.
- **R1/R2 (doc migration)** — *acceptés* : `ON_ERROR_STOP=1`, ordre de déploiement et note de rollback ajoutés à
  l'en-tête de 016.
- **R3-3 (test d'idempotence complaisant)** — *accepté* : le test rejoue deux fois et asserte désormais que la
  clause SET est **absolue** (`actif = true`, `role = 'administrateur'`, `perm_banc_test = true`), ce qui prouve
  réellement la convergence.
- **Divergence Stratégie 1 (spec) vs Stratégie 3 (implémentée)** — *rejeté comme correctif* : le brouillon de spec
  proposait des colonnes nullables (Stratégie 1), mais la **décision Q5 d'Arno supersède** explicitement (backfill
  'Arnaud'/'Jorel' PUIS `SET NOT NULL`, « pas de nullable permanent, pas de sentinelle »). L'implémentation suit Q5.
- **R2-3 (secours promeut un collaborateur en administrateur)** — *comportement assumé* de la corde de rappel
  (documenté), signalé pour information ; hors correctif.

Aucun défaut de fond → pas d'arrêt (l'unique blocage de fond, `secours` × NOT NULL, avait été remonté et tranché
AVANT la construction).

## A. DÉCISIONS HORS-SPECS
- **A1 — `secours` réactivation seule** : appliqué selon l'arbitrage Q-Option 4 d'Arno (pas une décision autonome ;
  tracé ici pour mémoire). Le type de retour perd `action` ; la CLI et les tests sont alignés.
- **A2 — CLI s'appuie sur le DEFAULT DB pour le drapeau** : `creerCompte` n'écrit pas `doit_changer_mot_de_passe`
  dans l'INSERT → il prend `false` (016). *Alternative écartée* : l'écrire `false` en dur (redondant). *Impact* :
  si le DEFAULT de 016 changeait un jour, le contrat CLI changerait ; documenté en commentaire.
- **A3 — Backstop applicatif non-vide dans `creerCompte`** (`prenom.trim()`/`nom.trim()`) en plus du CHECK SQL :
  donne une `ErreurCompte` propre côté CLI avant l'INSERT, et couvre l'espace insécable que la CHECK SQL peut laisser
  passer. *Impact* : double barrière, aucune régression.

## B. DOUTES
- **B1 — Nom de la CHECK d'actions** : la migration suppose `admin_utilisateur_log_action_check` (nom déterministe
  d'un CHECK de colonne inline en 014). R1 l'a confirmé théoriquement. Si le nom réel différait, le `DROP IF EXISTS`
  raterait et un 2e CHECK coexisterait, bloquant `'changement_mot_de_passe'` — mais cette action n'est utilisée qu'au
  Lot B/C. Mitigation : Arno peut confirmer via `\d admin_utilisateur_log` avant/après.
- **B2 — Application manuelle** : la rejouabilité est prouvée par lecture du SQL (aucun harnais de base jetable
  n'existe dans le repo ; je n'en ai pas créé). Le contrôle réel se fera à l'application par Arno.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; verdict/score non
concernés ; `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged ; migration non appliquée ; Gemini
hors périmètre. **RGPD** : `prenom`/`nom` sont des données personnelles d'opérateurs internes (pas d'internautes) —
minimales, pour usage interne et auditabilité ; pas de consentement requis pour des comptes de personnel ; la
suppression de compte reste interdite (désactivation seule), conforme à l'auditabilité.

## Verdict de recon-valid (Phase 8)
**VALIDER.** Le schéma est ajouté proprement (migration rejouable, transactionnelle, backfill ciblé, NOT NULL +
CHECK non-vide, journal étendu), la donnée est disponible/typée sans anticiper le JWS (Lot B), `secours` suit le
contrat arbitré, et la voie de secours navigateur est prouvée intacte. Les 3 correctifs de revue sont appliqués.
Migration NON appliquée : Arno l'applique à la main selon la séquence §2, puis commite fichier par fichier.
