# Rapport de build — M3-4 Lot D : détail, édition des droits, actifs/désactivés, grille filtrée

> Run `/svav-build` autonome. **Aucun commit, aucune migration** (016 suffit — actions déjà autorisées). Livraison à Arno.
> Rouvre Q3 (édition rôle/permissions), sur décision d'Arno après usage réel.

## 0. Synthèse

Trois chantiers : (1) **grille du dashboard filtrée** par la même source que le menu ; (2) **séparation nette
actifs / désactivés** ; (3) **vue détail + édition des droits** (perms d'un collaborateur, promotion en
administrateur), sous les règles R-A…R-G d'Arno. Double barrière administrateur, écritures atomiques journalisées.

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc` / `eslint` | ✅ 0 / 0 |
| `npm test` | ✅ **585 passed / 21 skipped** (47 fichiers) |
| `next build` | ✅ (bundle client propre — page = types seulement) |
| `password.ts` / `motDePasse.ts` byte-unchanged | ✅ (diff vide) |
| `garde.ts` | ✅ ADDITIF (`exigerAdministrateur` déjà livré Lot C ; `exigerCompteActif` intact, test `sub=null → aucune requête` vert) |
| Migration / Gemini / suppression / identifiant en dur (R-F/R-G) | ✅ aucune |
| Revues R1 / R2 / R3 | ✅ VALIDER / VALIDER / VALIDER |

## 1. Un administrateur ne peut être ni rétrogradé ni désactivé via l'UI
- **R-C (jamais rétrogradé)** : la route `POST /comptes/[id]/role` renvoie **403 `RETROGRADATION_INTERDITE`** quand
  la cible est `administrateur` et le rôle demandé `collaborateur`. Surtout, **AUCUNE fonction n'écrit
  `role='collaborateur'` sur un compte existant** (grep : les seules écritures de `role` valent `'administrateur'`
  ou sont à l'INSERT). La rétrogradation est **structurellement impossible**, pas seulement refusée par un garde.
- **R-D / R-E (jamais désactivé via l'UI, ni un autre ni soi-même)** : `desactiverCompte` porte
  `... AND role <> 'administrateur'` ; `reactiverCompte` idem. La route `/actif` diagnostique une cible
  administrateur en **403 `ADMIN_CLI_UNIQUEMENT`** (message explicite, pas un bouton grisé). Le cycle de vie
  activer/désactiver d'un administrateur passe **uniquement par la CLI** (accès serveur) — protection assumée.

## 2. Le système ne peut jamais se retrouver sans administrateur actif
Inventaire des écritures atteignables depuis l'UI et leur effet sur `count(actif AND role='administrateur')` :
`desactiverCompte` (WHERE role<>administrateur) → **0 impact** ; `reactiverCompte` (WHERE role<>administrateur) →
+1 collaborateur ; `promouvoirAdministrateur` → **+1** ; `modifierPermissions` (WHERE role='collaborateur') →
0 impact ; `creerCompteAdministration` → +1/0. **Le nombre d'administrateurs actifs est monotone non décroissant
côté UI** → aucun lockout possible. Le verrou « dernier admin actif » (Lot C, `pg_advisory_xact_lock`) est conservé
en défense en profondeur (redondant depuis R-D, coût nul).

## 3. Source UNIQUE menu + grille
`app/(admin)/admin/(protected)/menuAdmin.ts` → `liensVisibles(role, perms)` (rôle d'abord). Consommée par le **menu**
(`Sidebar.tsx` → `liensVisibles`) ET la **grille** du dashboard (`(protected)/page.tsx` → `liensVisibles`). Un seul
calcul, aucune divergence. Un administrateur ne perd jamais une tuile (`admin || perms[m.perm]`, court-circuit sur
`admin`). Correction de bug : l'ancienne grille avait 5 tuiles en dur (il manquait *cartes-annee*) — supprimée.
La grille reste un CONFORT ; `proxy.ts` est la seule autorité.

## 4. SQL exact des écritures de droits (atomiques)
```sql
-- Permissions d'un collaborateur (changement_permissions) :
WITH maj AS (
  UPDATE admin_utilisateur SET perm_pilotage=$2, perm_cartes_annee=$3, perm_statistiques=$4,
         perm_internautes=$5, perm_curation=$6, perm_banc_test=$7
   WHERE id=$1 AND role='collaborateur' RETURNING id
), jrnl AS (
  INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
  SELECT 'changement_permissions', maj.id, $8, NULL, $9::jsonb FROM maj
) SELECT id FROM maj;

-- Promotion collaborateur → administrateur (changement_role), perms forcées true :
WITH maj AS (
  UPDATE admin_utilisateur SET role='administrateur', perm_pilotage=true, perm_cartes_annee=true,
         perm_statistiques=true, perm_internautes=true, perm_curation=true, perm_banc_test=true
   WHERE id=$1 AND role='collaborateur' RETURNING id
), jrnl AS (
  INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres)
  SELECT 'changement_role', maj.id, $2, jsonb_build_object('role','collaborateur'),
         jsonb_build_object('role','administrateur') FROM maj
) SELECT id FROM maj;
```
**Atomicité** : UPDATE conditionnel + INSERT journal dans **une seule requête CTE** ; la garde `WHERE role=...` est
évaluée DANS l'écriture (pas un « lire puis écrire »). La route `/role` lit le compte avant, mais la seule écriture
(`promouvoirAdministrateur`, WHERE role='collaborateur') est conditionnelle → un TOCTOU ne peut pas corrompre
(promotion concurrente : 2ᵉ matche 0 ligne, l'état voulu — administrateur — est déjà atteint → 200 idempotent).

## 5. Actions journalisées × CHECK de 016
| Action écrite (Lot D) | Fonction | Dans le CHECK 016 ? |
|---|---|---|
| `changement_permissions` | `modifierPermissions` | ✅ oui |
| `changement_role` | `promouvoirAdministrateur` | ✅ oui |
(Les deux figuraient déjà au CHECK de 014, recréé à l'identique + `changement_mot_de_passe` par 016.) **Aucune
action nouvelle → aucune migration, aucun INSERT ne peut avorter au runtime.** (Vérifié par lecture du SQL de 016.)

## 6. Voie de secours (sub = null) sur chaque écran nouveau
Accès complet (role=administrateur), en-tête « Accès de secours » (`trouverCompteParId(null)` jamais appelé — ternaire
gardé), lien « changer mon mot de passe » masqué, `exigerAdministrateur` autorise **sans requête** (`auteurId=null` →
journal `auteur_id NULL`, colonne nullable). Le pseudo-compte de secours n'est aucune ligne DB → n'apparaît dans
aucune liste éditable. Jamais redirigée, jamais bloquée.

## 7. Décision — réactivation UI d'un administrateur désactivé par la CLI
**Décision : NON — l'UI ne réactive QUE des collaborateurs.** Justification : R-D fait de la *désactivation* d'un
administrateur un acte réservé au serveur (CLI). Par **symétrie**, sa *réactivation* doit l'être aussi — sinon un
administrateur UI pourrait défaire une désactivation CLI délibérée d'un pair. Un administrateur désactivé via la CLI
se réactive via la CLI (`admin:secours`). L'UI l'affiche dans la section « désactivés » avec le libellé
« Réactivation : CLI uniquement » (pas de bouton). `reactiverCompte` porte donc `... AND role <> 'administrateur'`,
et la route renvoie 403 `ADMIN_CLI_UNIQUEMENT` en défense en profondeur.

## 8. Revues adverses — verdicts & arbitrages
| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Escalade | **VALIDER** | Double barrière solide (jeton périmé refusé) ; R-C structurel ; R-D/R-E bloqués ; pas de fuite ; injection propre. |
| R2 | Intégrité / lockout | **VALIDER** | Nombre d'admins actifs monotone (lockout impossible) ; actions ⊆ CHECK 016 ; mutations atomiques ; secours OK. |
| R3 | Cohérence / régression | **VALIDER** | Source unique menu+grille ; partition actifs/désactivés étanche ; aucune variable en dur ; bundle propre ; non-régression. |

**Arbitrages :**
- **R2 O-1** — *accepté & corrigé* : `/role` renvoie un **200 idempotent** (au lieu d'un 409 trompeur) quand la
  promotion trouve la cible déjà administrateur (course ; aucune suppression possible, R-G).
- **R2 O-3** — *accepté & corrigé* : la page mappe aussi `ADMIN_CLI_UNIQUEMENT` (message clair) en plus de
  `DERNIER_ADMINISTRATEUR`.
- **R2 O-2** — *tracé* : le filet `409 DERNIER_ADMINISTRATEUR` est devenu inatteignable (R-D bloque avant) ; conservé
  comme défense en profondeur inoffensive.
- **R1 O1 (voie de secours = surface d'escalade)** — *hors périmètre* : secret partagé non individualisé, retrait
  prévu M3-5. Décision porteur.
- **R1 O2 (un admin peut régénérer le mot de passe temporaire d'un AUTRE admin → prise de contrôle)** — *tracé, hors
  correctif Lot D* : comportement de la route de régénération (Lot C), dans le périmètre de confiance « admin »
  (tous full-power), et **journalisé** (`auteur_id`). À arbitrer par Arno (restreindre la régénération aux
  non-admins/soi-même) dans un lot dédié si souhaité.
- **R1 O3 (R-C non contraint par le schéma)** — *hors périmètre* : rendre l'invariant dépendant du schéma
  (trigger/CHECK interdisant `administrateur→collaborateur`) nécessiterait une **migration** (interdite ici).
  Aujourd'hui R-C tient par l'absence prouvée (grep) de tout SQL de rétrogradation. Recommandé pour un lot schéma.
- **R3 hors-scope (3ᵉ liste `MODULES` locale dans la page pour les cases à cocher)** — *tracé* : clés typées
  `keyof Perms` (sûres), mais exhaustivité non garantie à la compilation. Recommandation future ; sans effet sur le
  menu/la grille (source unique préservée).

Aucun défaut de fond → pas d'arrêt (le point bloquant potentiel — action de journal manquante — a été écarté par
lecture du CHECK de 016 : `changement_role`/`changement_permissions` y sont déjà).

## A. DÉCISIONS HORS-SPECS
- **A1 — Réactivation UI réservée aux collaborateurs** (cf. §7) : symétrie avec R-D. Alternative écartée : autoriser
  la réactivation UI d'un admin (défait une décision CLdI). Impact : un admin désactivé se réactive via la CLI.
- **A2 — Route `/role` unique (promotion + refus de rétrogradation)** plutôt qu'une route `/promouvoir` : donne un
  **403 explicite** pour la rétrogradation (R-C), lisible et testable, sans jamais exposer de write de rétrogradation.
- **A3 — Grille dérivée de `liensVisibles`** (source unique) : corrige au passage l'omission de *cartes-annee* de
  l'ancienne grille en dur.
- **Aucune variable de comportement nouvelle en config** : le seul « nombre » est la clé de verrou consultatif
  (constante de sécurité nommée) ; aucune variable de moteur de score → rien en `config_scoring`.

## B. DOUTES
- **B1 — Régénération admin↔admin** (R1 O2) et **B2 — R-C non schématisé** (R1 O3) : voir arbitrages ; à trancher par
  Arno dans des lots dédiés (le second requiert une migration).

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; `password.ts`/
`motDePasse.ts` byte-unchanged ; `garde.ts` additif ; **aucune migration** ; **aucune suppression** (R-G) ; **aucun
identifiant/e-mail en dur** (R-F, prouvé par grep) ; Gemini hors périmètre ; responsive mobile-first +
`prefers-reduced-motion` respectés (cartes empilées < 768 px, section désactivés repliable, cibles ≥ 44 px).

## Séquence de TEST MANUEL pour Arno (navigateur)
1. Connecté administrateur → **Tableau de bord** : la grille montre toutes les tuiles (dont *Cartes d'année* et
   *Administratif*). Le menu et la grille montrent la même chose.
2. **Administratif** : « Comptes actifs (n) » ; « Comptes désactivés (m) » en section repliée séparée.
3. Ouvre le **détail** d'un collaborateur → coche/décoche des permissions → **Enregistrer** ; le message rappelle
   « immédiat sur les écritures, ≤ 8 h sur le menu/les pages ». Vérifie l'effet immédiat : ce collaborateur, à sa
   prochaine **écriture** du module retiré, est refusé aussitôt.
4. **Promouvoir** un collaborateur en administrateur → confirmation → son détail montre les 6 permissions cochées,
   non modifiables ; il ne peut plus être rétrogradé ni désactivé depuis l'UI (« CLI uniquement »).
5. Tente (bouton absent, ou via l'API) de désactiver / rétrograder un administrateur → refus (403).
6. **Désactive** un collaborateur → il quitte les actifs, apparaît dans « désactivés » ; **Réactive**-le.
7. **Nettoyage** (jamais de suppression) : désactive les comptes de test. Un compte administrateur de test se gère
   en base/CLI : `psql "$DATABASE_URL" -c "UPDATE admin_utilisateur SET actif=false WHERE identifiant='…';"` — jamais
   de DELETE.

## Verdict de recon-valid (Phase 8)
**VALIDER.** R-A…R-G respectées (édition admin-only ; promotion possible ; rétrogradation structurellement
impossible ; admin non désactivable via l'UI ; pas d'auto-désactivation ; aucun compte spécial ni identifiant en dur ;
aucune suppression). Menu et grille dérivent d'une source unique ; séparation actifs/désactivés étanche ; écritures
atomiques journalisées avec des actions déjà autorisées par 016 ; voie de secours intacte partout ; golden 23/23,
`password.ts`/`motDePasse.ts` byte-unchanged, aucune migration. À toi de committer, fichier par fichier — M3-4 est
désormais complet (A→B→C→D).
