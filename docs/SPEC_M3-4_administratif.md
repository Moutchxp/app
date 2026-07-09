# SPEC M3-4 — Tuile « Administratif » et création de comptes admin (v2)

> Spécification issue d'un run `/svav-build` en MODE SPEC. **Aucun code, aucune migration appliquée, aucun commit.**
> v2 = v1 (brouillon) durcie après 4 revues adverses (R1 sécurité, R2 continuité, R3 données, R4 produit) — toutes
> ont rendu **CORRIGER**. Les arbitrages sont dans `docs` du chat de livraison ; les correctifs acceptés sont
> intégrés ci-dessous.

## 0. État recon (le code fait foi)

- JWS (`app/lib/admin/session.ts:66-73`) : `{ identifiant, role, perms, jti, iat, exp }` + `sub` si `≠ null`.
  **Ne porte pas** `prenom`/`nom`/`doit_changer_mot_de_passe`.
- `verifierJeton` (`session.ts:80-87`) : tolérant, payload ou `null`, ne throw jamais.
- `sessionDepuisPayload` (`session.ts:104-111`) : rôle ≠ 'collaborateur' → **administrateur + `permsToutes()`**
  (⚠️ fail-open structurel, cf. §1.4). Résout aussi le legacy `role:'admin'` → 'administrateur'.
- 6 perms (`session.ts:5`) : pilotage, cartes_annee, statistiques, internautes, curation, banc_test.
- `proxy.ts` : table préfixe→permission (`proxy.ts:21-35`) ; `permissionRequise` renvoie `null` pour tout chemin non
  listé (`:37-43`) ⇒ **fail-open** (autorisé à tout authentifié). Whitelist `/admin/login`, `/api/admin/session`.
- `Sidebar.tsx:8-15` : 6 liens EN DUR, aucun filtrage perm, pas de tuile Administratif. `layout.tsx` ne calcule
  pas `sessionDepuisPayload` (vérifie seulement la présence du payload).
- `comptes.ts` : `CompteDB` (`:11-25`) et `SELECT_COMPTE` (`:54-57`) **ne listent pas** prenom/nom/drapeau ;
  `creerCompte(identifiant, role, motDePasseClair)` (`:77`) force `permsInitiales` (`:73`) et écrit `auteur_id=NULL`
  (`:91`) ; `reinitialiserMotDePasse` écrit `auteur_id=NULL` (`:109`).
- `admin_utilisateur_log.action` CHECK (014:54-56) : `creation, desactivation, reactivation, changement_role,
  changement_permissions, reinitialisation_mot_de_passe` — **pas** `changement_mot_de_passe`.
- `password.ts` (voie de secours) et `motDePasse.ts` : **byte-unchanged** (hors périmètre d'écriture).

## 1. Modèle de sécurité (fondations)

### 1.1 La tuile Administratif est liée au RÔLE, pas à une permission
- **Réservée à `role === 'administrateur'`, EN DUR.** Pas de colonne `perm_administratif`, pas de case cochable.
  Justification : la tuile qui *distribue* les droits ne doit pas être un droit *distribuable* — sinon un admin
  pourrait cocher `perm_administratif` à un collaborateur, qui s'octroierait ensuite toutes les permissions
  (escalade). Le pouvoir de gérer les comptes suit le rôle.
- `administrateur` ⇒ toutes permissions (déjà garanti par `permsDuCompte`, override au read). Les cases perm_* ne
  sont éditables que pour `collaborateur`.

### 1.2 Deux surfaces distinctes, deux politiques de message
- **Surface d'AUTHENTIFICATION** (`/api/admin/session`) : message d'échec **générique unique** « Identifiants
  invalides », verify de leurre à temps constant — INCHANGÉ.
- **Surface d'ADMINISTRATION** (routes `comptes`, authentifiées + rôle administrateur) : l'aveu « identifiant déjà
  pris » y est **acceptable** (l'admin a un besoin légitime), car cette surface n'est jamais atteignable sans
  authentification + rôle. (Confirmé sain par R4-7.)

### 1.3 Garde CÔTÉ SERVEUR à DOUBLE barrière (correctif R1-1, R4-2)
- `proxy.ts` garde le namespace (choke point), MAIS `permissionRequise` est **fail-open** par défaut : un chemin non
  listé est autorisé. Donc :
  1. `proxy.ts` DOIT ajouter une règle **rôle-administrateur EN DUR** pour `/admin/administratif` et
     `/api/admin/comptes` (frontière de segment, cf. 1.6).
  2. **Défense en profondeur OBLIGATOIRE** : chaque handler d'API sensible revérifie
     `sessionDepuisPayload(...).role === 'administrateur'` (rôle **résolu**, jamais le claim brut — correctif
     R2-3). Le proxy n'est PAS l'unique garde. (La formule « le menu est cosmétique, le proxy est la vraie garde »
     de v1 est remplacée : proxy + route = deux barrières.)

### 1.4 Fail-open de `sessionDepuisPayload` — dette assumée et compensée (R1-5, R4-5)
`sessionDepuisPayload` coerce tout rôle ≠ `'collaborateur'` → administrateur+toutes perms. Le changer casserait la
tolérance des sessions ouvertes (invariant M3-2). Donc **on ne le modifie pas** ; on documente le fail-open comme
dette et on le compense : (a) les jetons collaborateur portent TOUJOURS `role:'collaborateur'` explicite
(`session/route.ts`), (b) double garde §1.3, (c) le menu dérive du RÔLE d'abord (§4.3). La voie de secours
(`sub=null`) est un administrateur voulu.

### 1.5 Fenêtre de révocation ≤ 8 h — décision MVP (correctif R1-2 × R2-1, réconcilié)
Le JWS est **stateless** (`session.ts` « STATELESS ») et vit 8 h. `proxy.ts` ne relit jamais la base.
- **Proxy = stateless** : lit `role`/`perms`/`doit_changer_mot_de_passe` **exclusivement depuis le JWS** ; ne
  requête JAMAIS la DB (protège la voie de secours `sub=null` et la perf). (Correctif R2-1.)
- **Routes d'API MUTANTES** (`comptes*`, `/actif`, `/mot-de-passe-temporaire`, `compte/mot-de-passe`) : relisent
  `actif` (et le rôle) via `trouverCompte` à l'entrée du handler et refusent si `actif=false` — ferme le trou
  « compte désactivé qui continue de muter pendant 8 h » sur les opérations dangereuses. (Correctif R1-2.)
- **Accès en LECTURE de page** d'un compte désactivé : fenêtre résiduelle ≤ 8 h **ACCEPTÉE en MVP et documentée**.
  Durcissement optionnel (`session_epoch` / relecture par requête) = **question ouverte Q1** pour Arno.

### 1.6 Namespaces disjoints `comptes` (pluriel) vs `compte` (singulier) (correctif R1-3)
- `/api/admin/comptes…` = **administration** (rôle administrateur). Match par **frontière de segment**
  (`pathname === '/api/admin/comptes' || startsWith('/api/admin/comptes/')`), jamais un `startsWith('/api/admin/compte')` nu.
- `/api/admin/compte/mot-de-passe` = **self-service** (compte nommé authentifié, y compris collaborateur en 1ʳᵉ
  connexion). NE DOIT PAS être happé par la garde administrateur. Test obligatoire prouvant la séparation.

## 2. Ordre de déploiement & lots (correctifs R2-2, R2-5, R4-1)

**Réordonnancement adopté** : la MACHINERIE D'ENFORCEMENT est livrée AVANT la surface de création, pour qu'aucun
compte ne puisse jamais se connecter sans être forcé de changer son mot de passe temporaire (le défaut de v1
« Lot B seul rend le temporaire permanent » est supprimé).

- **Lot A — Données** : migration 016 + extensions `comptes.ts` (signatures/colonnes) + CLI (`--prenom/--nom`).
- **Lot B — Enforcement** : drapeau dans le JWS + gardes `proxy.ts` (rôle administratif, redirection 1ʳᵉ connexion)
  + écran/route de changement de mot de passe + filtrage du menu. **Aucun nouveau chemin de création** ici : l'app
  reste cohérente (les gardes existent, rien à garder encore côté création).
- **Lot C — Tuile Administratif (UI)** : écran de création, liste, actions — chaque compte créé rencontre
  l'enforcement déjà en place.

**Ordre d'APPLICATION (Arno)** : migration **016 d'abord**, puis déploiement code A→B→C. **Rollback = inverse**
(C→B→A→migration). ⚠️ Le rollback de continuité du Lot B (proxy) est un **revert/redeploy du proxy** : `admin:secours`
(CLI) ne répare PAS un proxy cassé (il ne touche que la DB). (Correctifs R2-2/R2-5.)

Chaque lot ci-dessous : EARS (BE-*), critères d'acceptation (CA-*), fichiers, risques, hors-périmètre.

---

## 3. Lot A — Schéma (migration 016) + accès données + CLI

### 3.1 Colonnes ajoutées à `admin_utilisateur`
`prenom text` (nullable), `nom text` (nullable), `doit_changer_mot_de_passe boolean NOT NULL DEFAULT false`.

### 3.2 Stratégie NOT NULL sur table NON VIDE (a.jorel existe) — comparaison

**Stratégie 1 (RETENUE) — nullable prenom/nom + drapeau NOT NULL DEFAULT false, avec réaffirmation d'état** :
```sql
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS prenom text;
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS nom text;
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS doit_changer_mot_de_passe boolean;
-- Réaffirmation (répare un état partiel qu'IF NOT EXISTS masquerait — correctif R3-1) :
ALTER TABLE admin_utilisateur ALTER COLUMN doit_changer_mot_de_passe SET DEFAULT false;
UPDATE admin_utilisateur SET doit_changer_mot_de_passe = false WHERE doit_changer_mot_de_passe IS NULL;
ALTER TABLE admin_utilisateur ALTER COLUMN doit_changer_mot_de_passe SET NOT NULL;
```
- `prenom`/`nom` nullable : la ligne a.jorel reste NULL (affichée « — »), aucune donnée inventée, aucun UPDATE
  destructif. La non-nullité est imposée au niveau APPLICATIF pour les nouveaux comptes.
- `UPDATE ... WHERE doit_changer_mot_de_passe IS NULL` : NON destructif (ne touche que des NULL issus d'un ADD
  nullable), rejouable (idempotent : plus aucun NULL au 2e passage). C'est un backfill de colonne neuve, pas un
  écrasement de donnée métier.

**CHECK défensifs (via DO-block — `ADD CONSTRAINT` n'accepte pas `IF NOT EXISTS`, correctif R3-3a)** :
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='admin_utilisateur_prenom_non_vide_check') THEN
    ALTER TABLE admin_utilisateur ADD CONSTRAINT admin_utilisateur_prenom_non_vide_check
      CHECK (prenom IS NULL OR btrim(prenom) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='admin_utilisateur_nom_non_vide_check') THEN
    ALTER TABLE admin_utilisateur ADD CONSTRAINT admin_utilisateur_nom_non_vide_check
      CHECK (nom IS NULL OR btrim(nom) <> '');
  END IF;
END $$;
```

**Journal — action `changement_mot_de_passe` (self-service) distincte de `reinitialisation_mot_de_passe` (reset
admin)** — question ouverte **Q2**. SI retenue, l'étendre en 016 via DO-block (drop + recreate du CHECK d'actions) :
```sql
DO $$ BEGIN
  ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
  ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check
    CHECK (action IN ('creation','desactivation','reactivation','changement_role',
                      'changement_permissions','reinitialisation_mot_de_passe','changement_mot_de_passe'));
END $$;
```

**Stratégie 2 (écartée)** — `ADD COLUMN prenom text NOT NULL DEFAULT ''` puis `DROP DEFAULT` : écrit `''` (donnée
bidon) dans a.jorel et exige quand même un garde applicatif anti-`''`. Coût sans bénéfice. **Stratégie 3 (écartée)**
— nullable → backfill → `SET NOT NULL` : exige d'inventer prenom/nom pour a.jorel, refusé. → Stratégie 1 retenue.

**Backfill a.jorel (optionnel, à la main d'Arno — question Q5)** : `UPDATE admin_utilisateur SET prenom='…',
nom='…' WHERE identifiant='a.jorel@sansvisavis.com';` (ligne commentée dans 016, Arno remplit s'il veut).

**Conduite en cas d'échec** : `psql -f` sans `-1` ⇒ chaque instruction est autonome. Relancer le fichier entier :
les `ADD COLUMN IF NOT EXISTS`, la réaffirmation d'état, et les DO-block gardés sur `pg_constraint` sont tous
idempotents ⇒ rejouable 2× sans erreur (CA-A).

### 3.3 Accès données `comptes.ts` (correctifs R3-4, R3-5, R1-4)
- `CompteDB` + `SELECT_COMPTE` DOIVENT lister `prenom, nom, doit_changer_mot_de_passe` (sinon le drapeau n'atteint
  jamais le JWS et BE-C1/BE-B* cassent).
- `creerCompte` DOIT être étendu : `creerCompte({ identifiant, role, motDePasseClair, prenom, nom, perms, auteurId,
  doitChanger })` — persiste prenom/nom, écrit **exactement** les 6 perms soumises pour un collaborateur (toutes true
  pour un administrateur), pose `doit_changer_mot_de_passe`, journalise `creation` avec `auteur_id = auteurId`.
- `reinitialiserMotDePasse` DOIT accepter `auteurId` (reset admin → auteur_id=admin ; conserver un chemin
  bootstrap/secours auteur_id=NULL). Aucun appel applicatif ne DOIT laisser `auteur_id=NULL` hors bootstrap/secours.
- Cohérence rôle↔perms **non contrainte en base** (acceptée, R3-4) : `permsDuCompte` override au read ; l'invariant
  vit dans le code, documenté.

### 3.4 CLI (`app/scripts/admin.ts`)
- `creer` gagne `--prenom`/`--nom` (obligatoires, non vides, validés AVANT saisie du mot de passe) et les **persiste**.
  `creerCompte` (CLI) pose `doit_changer_mot_de_passe=false` (mot de passe CHOISI par humain).
- `secours` : prenom/nom **optionnels** (corde de rappel). ⚠️ L'identifiant DOIT rester une adresse e-mail valide
  (CHECK 015 sinon INSERT en échec) — `secours` valide déjà via `exigerIdentifiantEmail` ; message clair. (R2-bonus.)
- **Invariant unifié CLI/UI** : mot de passe temporaire ⇒ drapeau=true (UI) ; mot de passe choisi ⇒ drapeau=false
  (CLI/secours). Même invariant, valeurs cohérentes avec l'origine du mot de passe.

### 3.5 EARS — Lot A
- **BE-A1** : LE SYSTÈME DOIT ajouter prenom, nom, doit_changer_mot_de_passe de façon additive et idempotente
  (rejouable 2×), avec réaffirmation d'état pour le drapeau.
- **BE-A2** : QUAND `admin:creer` est invoqué sans `--prenom`/`--nom` non vides, LE SYSTÈME DOIT refuser AVANT toute
  saisie de mot de passe.
- **BE-A3** : LE SYSTÈME DOIT persister prenom/nom fournis par le CLI (jamais les valider puis les jeter).
- **BE-A4** : QUAND un compte est créé par le CLI, LE SYSTÈME DOIT poser doit_changer_mot_de_passe=false.
- **BE-A5** : `SELECT_COMPTE`/`CompteDB` DOIVENT exposer les 3 nouvelles colonnes.
- **CA-A** : migration rejouable 2× sans erreur ; `test:integration` **23/23** ; golden `29.107259068449615`
  inchangé (aucune table de score touchée) ; un compte CLI créé avec --prenom/--nom a prenom/nom non NULL en base.

### 3.6 Hors-périmètre Lot A
Édition du rôle/permissions d'un compte existant ; envoi d'e-mail.

---

## 4. Lot B — Enforcement (JWS + proxy + changement de mot de passe + menu)

### 4.1 Drapeau dans le JWS (correctifs R2-1, R2-3)
- **BE-B1** : QUAND un compte nommé se connecte, LE SYSTÈME DOIT inclure `doit_changer_mot_de_passe` (booléen) dans
  le JWS. Absent (ancien jeton) ⇒ `false` (tolérance). Voie de secours (`sub=null`) ⇒ `false` **forcé en dur**.
- **BE-B2** : `proxy.ts` DOIT lire le drapeau et le rôle **exclusivement depuis le JWS** (rôle **résolu** par
  `sessionDepuisPayload`), sans jamais requêter la DB.

### 4.2 Redirection « première connexion » (correctifs R1-6, R2-1, R2-5)
- **BE-B3** : TANT QUE le jeton porte `doit_changer_mot_de_passe=true`, `proxy.ts` DOIT rediriger toute page admin
  vers `/admin/mot-de-passe` et refuser toute route d'API admin, SAUF la liste blanche à **match EXACT** :
  `/admin/mot-de-passe`, `/api/admin/compte/mot-de-passe`, `/api/admin/session` (déconnexion).
- **BE-B4** : **Précédence explicite** dans `proxy.ts` : (1) whitelist login/session existante ; (2) auth (payload
  présent) ; (3) **redirection drapeau** ; (4) garde rôle administratif (§4.4) ; (5) garde perm module. La
  redirection drapeau est évaluée AVANT les gardes rôle/perm.
- **BE-B5** : la voie de secours (`sub=null`) NE DOIT JAMAIS être piégée (drapeau forcé false, BE-B1). **Test
  bloquant** : jeton voie de secours → aucune redirection `/admin/mot-de-passe`.

### 4.3 Écran + route de changement de mot de passe (correctifs R1-3, R1-4)
- **BE-B6** : `POST /api/admin/compte/mot-de-passe` (compte nommé authentifié, self-service ; NON soumis à la garde
  administrateur — namespace singulier §1.6) DOIT exiger le mot de passe COURANT + le nouveau (deux fois), vérifier
  le courant via `verifier`, hacher le nouveau, poser `doit_changer_mot_de_passe=false`, journaliser
  (`changement_mot_de_passe` si Q2=OUI, sinon `reinitialisation_mot_de_passe` avec `auteur_id=cible_id`), et
  **réémettre le cookie** avec le drapeau à false.
- **BE-B7** : l'écran `/admin/mot-de-passe` DOIT être responsive (§4.6) ; `prefers-reduced-motion` respecté.

### 4.4 Garde rôle administratif (correctifs R1-1, R1-3, R2-3)
- **BE-B8** : `proxy.ts` DOIT exiger `role === 'administrateur'` (rôle **résolu**, EN DUR, pas une perm) pour
  `/admin/administratif` et `/api/admin/comptes` (frontière de segment). Collaborateur ⇒ 403 (API) / redirect
  `/admin` (page).
- **BE-B9** : défense en profondeur — CHAQUE handler `comptes*` revérifie `role === 'administrateur'` côté serveur,
  indépendamment du proxy.

### 4.5 Filtrage du menu latéral (correctifs R4-5, BE fail-open menu)
- **BE-B10** : `layout.tsx` (serveur) DOIT calculer `sessionDepuisPayload` et passer `role` + `perms` à `Sidebar`.
- **BE-B11** : `Sidebar` DOIT dériver l'affichage du **RÔLE d'abord** : administrateur ⇒ TOUS les liens + la tuile
  « Administratif » ; collaborateur ⇒ uniquement les modules dont `perms[module] === true`, **jamais** la tuile
  Administratif. L'accès `perms` DOIT être tolérant (perms manquantes ⇒ ne pas planter). **Le menu ne DOIT JAMAIS
  masquer un lien à un administrateur** (fail vers « admin voit tout »).
- **BE-B12** : le filtrage du menu est COSMÉTIQUE ; la garde réelle reste serveur (§4.4 + §1.3). Fail-**closed** côté
  serveur, fail vers « admin voit tout » côté menu.

### 4.6 Responsive / accessibilité (correctif R4-3)
- **BE-B13** : tous les écrans admin de ce chantier DOIVENT être mobile-first (smartphone portrait) : cibles
  tactiles ≥ 44 px, aucun scroll horizontal, pas d'interaction hover-only ; animations sous `prefers-reduced-motion`.

### 4.7 CA — Lot B
- **CA-B1** : compte UI en 1ʳᵉ connexion → redirigé vers `/admin/mot-de-passe` ; après changement (mot de passe
  courant requis) → accès normal, drapeau false, cookie réémis.
- **CA-B2** : jeton voie de secours (`sub=null`) → jamais redirigé (test bloquant).
- **CA-B3** : collaborateur → 403 sur `/api/admin/comptes`, redirect `/admin` sur la page ; `/api/admin/compte/mot-de-passe`
  reste accessible à un collaborateur en 1ʳᵉ connexion (test de non-collision §1.6).
- **CA-B4** : ancien jeton (sans drapeau/champs) → session non cassée, traité administrateur, non redirigé.
- **CA-B5** : administrateur → menu complet + tuile Administratif (aucun lien masqué).

### 4.8 Hors-périmètre Lot B
Création/liste de comptes (Lot C) ; édition rôle/permissions existants.

---

## 5. Lot C — Tuile « Administratif » (UI : création, liste, actions)

### 5.1 Génération du mot de passe temporaire (correctif R1-8)
- **BE-C1** : LE SYSTÈME DOIT générer le temporaire via **`crypto.randomInt`** (ou rejet-échantillonnage), ≥ 16
  caractères d'un alphabet sans ambiguïté (pas de O/0/l/1). **Interdits** : `Math.random`, `randomBytes(n)[i] % len`
  (biais modulo).
- **BE-C2** : LE SYSTÈME DOIT hacher via `motDePasse.hacher()` (argon2id) avant persistance ; le clair n'est JAMAIS
  stocké.
- **BE-C3** : LE SYSTÈME DOIT retourner le clair UNE SEULE FOIS dans le corps de la réponse HTTP ; JAMAIS dans
  `admin_utilisateur_log`, un log serveur, un message d'erreur, une URL ou un Referer. Non réaffichable.

### 5.2 Création (correctifs R1-4, R4-6)
- **BE-C4** : LÀ OÙ le demandeur est administrateur, `POST /api/admin/comptes` DOIT créer un compte (prénom, nom,
  identifiant e-mail validé par `estEmailValide`, rôle, permissions) via `creerCompte` étendu, avec
  `doit_changer_mot_de_passe=true`, `auteur_id = administrateur courant`, journal `creation`. SINON 403 (proxy +
  handler).
- **BE-C5** : SI l'identifiant est invalide OU déjà pris (insensible casse), ALORS refus avec message clair (surface
  d'administration, §1.2).
- **BE-C6** : QUAND le rôle est administrateur, LE SYSTÈME DOIT écrire toutes les perms à true (cases ignorées) ;
  QUAND collaborateur, écrire EXACTEMENT les 6 perm_* soumises.

### 5.3 Liste + actions (correctifs R1-7, R2-4, R1-10)
- **BE-C7** : `GET /api/admin/comptes` (administrateur) DOIT renvoyer prénom, nom, identifiant, rôle, actif,
  dernière connexion — **jamais le hash**.
- **BE-C8** : `POST /api/admin/comptes/[id]/actif` DOIT activer/désactiver (administrateur ; handler revérifie
  actif via DB, §1.5).
- **BE-C9** : SI la désactivation viserait le DERNIER administrateur actif, ALORS refus CÔTÉ SERVEUR par une
  **écriture atomique conditionnelle en une seule instruction** (ex. `UPDATE … SET actif=false WHERE id=$1 AND NOT
  (role='administrateur' AND (SELECT count(*) FROM admin_utilisateur WHERE actif AND role='administrateur') <= 1)`),
  refus si 0 ligne affectée. Interdit le TOCTOU du compte-puis-écrit. La **rétrogradation est HORS PÉRIMÈTRE**
  (édition de rôle non livrée) — BE ne couvre que la désactivation. La corde de rappel `admin:secours` outrepasse
  cette règle (réparation).
- **BE-C10** : `POST /api/admin/comptes/[id]/mot-de-passe-temporaire` (administrateur) DOIT regénérer un temporaire,
  reposer `doit_changer_mot_de_passe=true`, journaliser `reinitialisation_mot_de_passe` avec `auteur_id=admin`,
  renvoyer le clair une fois.

### 5.4 UX du mot de passe temporaire (correctif R4-4)
- **BE-C11** : à la création/regénération, LE SYSTÈME DOIT afficher le clair dans une **modale bloquante** avec
  bouton « copier » et **case « j'ai transmis ce mot de passe » requise pour fermer** ; texte de récupération
  explicite (« perdu → regénérer »). L'action de regénération DOIT être clairement libellée par ligne de compte.
- **BE-C12** : liste + formulaire DOIVENT être responsive (§4.6) : liste = **cartes empilées < 768 px** (pas de
  tableau en débordement horizontal), cibles ≥ 44 px, `prefers-reduced-motion` respecté (reveal / bouton copier).

### 5.5 CA — Lot C
- **CA-C1** : un collaborateur reçoit 403 sur toutes les routes `comptes*` (proxy ET handler).
- **CA-C2** : le hash n'apparaît dans aucune réponse ; le clair temporaire n'apparaît dans aucun log/journal/URL.
- **CA-C3** : le dernier administrateur actif ne peut être désactivé (test : 1 admin + N collaborateurs → refus) ;
  robustesse concurrente (écriture atomique).
- **CA-C4** : `admin_utilisateur_log.auteur_id` = id de l'admin appelant pour toute création/reset via l'UI.
- **CA-C5** : liste lisible sur smartphone portrait (cartes empilées, aucun scroll horizontal).

### 5.6 Hors-périmètre Lot C
Édition rôle/permissions d'un compte existant ; e-mail de secours ; envoi d'e-mail ; « mot de passe oublié » ;
retrait de la voie de secours (M3-5).

---

## 6. Pilotage sans code — variables (confirmé R4-8)
Aucune variable du **moteur de score** introduite ⇒ **rien à externaliser en `config_scoring`**. Les seuls réglages
techniques (longueur/alphabet du temporaire, TTL, listes blanches) sont des **constantes de sécurité** centralisées
dans un module de config admin (comme `session.ts` centralise TTL/cookie), NON éditables au runtime — ce ne sont pas
des variables de score. Aucune violation de l'invariant.

## 7. Invariants de conformité (rappel)
Golden `29.107259068449615` inchangé · `test:integration` 23/23 · aucun fichier moteur/`config_scoring`/`pipeline.itest.ts`/
public/curation/Gemini touché · `password.ts` **et** `motDePasse.ts` byte-unchanged · verdict découplé du score (non
concerné) · responsive mobile-first · `prefers-reduced-motion`.

## 8. Questions ouvertes (à trancher par Arno — fermées)
- **Q1 — Révocation** : accepter la fenêtre ≤ 8 h pour l'accès en LECTURE de page, en re-vérifiant `actif` uniquement
  sur les routes d'API mutantes (MVP recommandé) ? OU proxy relit la DB à chaque requête admin (fraîcheur immédiate,
  +1 requête/requête) ?
- **Q2 — Journal** : ajouter l'action `changement_mot_de_passe` au CHECK (016) pour distinguer le self-service du
  reset admin (recommandé, meilleure auditabilité) ? OUI / NON.
- **Q3 — Édition** : confirmer que l'édition du rôle/permissions d'un compte EXISTANT reste HORS périmètre M3-4
  (création + activer/désactiver + regénérer seulement) ? OUI / NON.
- **Q4 — Argon2** : planifier un micro-chantier séparé pour PINNER les paramètres argon2 dans `motDePasse.ts` (hors
  périmètre ici car byte-unchanged) afin que le hash de leurre partage exactement les mêmes paramètres et éviter tout
  futur oracle de timing ? OUI / NON. (Aujourd'hui les paramètres du leurre = défauts argon2, donc pas de fuite.)
- **Q5 — Backfill** : renseigner prenom/nom de la ligne a.jorel dans 016 (UPDATE ciblé qu'Arno remplit) ou laisser
  NULL/« — » ? BACKFILL / LAISSER.
