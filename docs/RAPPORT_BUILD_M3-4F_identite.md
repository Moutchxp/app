# Rapport de build — M3-4 Lot F1 : action de journal `changement_identite` + libellé règle administrateur

> Run `/svav-build` autonome. **Lot F scindé en DEUX commits (décision Arno).** Ce rapport couvre **F1 uniquement,
> LIVRÉ ici**. F2 (édition prénom/nom) sera construit APRÈS qu'Arno a appliqué la migration 017. **Aucun commit.**

## 0. Contexte — pourquoi le run s'est d'abord ARRÊTÉ

Journaliser une future édition prénom/nom (F2) exige une action autorisée par le CHECK de
`admin_utilisateur_log` ; or les 7 actions de 016 (`creation`, `desactivation`, `reactivation`, `changement_role`,
`changement_permissions`, `reinitialisation_mot_de_passe`, `changement_mot_de_passe`) n'en couvrent **aucune** pour
« modification d'identité », et ce lot interdisait toute migration. J'ai donc **arrêté et remonté la question**
(comme au Lot A). **Décision Arno** : Option A — migration 017 ajoutant `changement_identite`, et **découpe en
F1 (migration + libellé) puis F2 (édition)**, F1 livré seul.

## 1. Synthèse F1

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc` / `eslint` | ✅ 0 / 0 |
| `npm test` | ✅ **601 passed / 21 skipped** (48 fichiers) |
| `next build` | ✅ (bundle client propre) |
| `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged | ✅ (diff vide) |
| Migration 017 **NON appliquée** (Arno l'applique) | ✅ (fichier seul) |
| Aucune route / SQL exécuté / Gemini | ✅ |
| Revues R1 / R2 / R3 | ✅ VALIDER / VALIDER / VALIDER |

**Fichiers F1** : `db/migrations/017_action_changement_identite.sql` (nouveau, non appliqué) ·
`app/(admin)/admin/(protected)/comptes/page.tsx` (libellé + CSS) · `…/comptes/page.parts.test.ts` (tests).

## 2. Action de journal retenue — citée depuis le SQL
Nouvelle action **`changement_identite`** ajoutée au CHECK de `admin_utilisateur_log.action` par la migration 017
(`db/migrations/017_action_changement_identite.sql:28-30`), qui reprend les **8** valeurs (les 7 de
`016_comptes_identite.sql:71-72` + la nouvelle), **aucune retirée**. Le CHECK est recréé par `DROP CONSTRAINT
IF EXISTS admin_utilisateur_log_action_check` puis `ADD CONSTRAINT` (nom déterministe hérité du CHECK de colonne
inline de `014:54-56`), dans un DO-block en transaction explicite — **rejouable/idempotente**, additive, non
destructive. F1 **n'écrit jamais** `changement_identite` (grep : la valeur n'apparaît que dans la migration et les
tests) — c'est F2 qui l'utilisera, après application de 017.

## 3. Séquence pour Arno (à jouer AVANT F2)
```
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/017_action_changement_identite.sql
```
Idempotente (rejouable), transactionnelle (échec au milieu → rollback), additive (une valeur de plus dans le `IN`).
Rollback non destructif : rien à défaire côté données ; revenir en arrière = redéployer l'ancien code (laisser la
valeur en plus est inoffensif tant qu'aucune ligne ne l'utilise — F1 n'en écrit aucune).

## 4. Libellé de la règle administrateur (F1)
- **Avant** : « Désactivation : CLI uniquement » DANS la rangée de boutons (décalait l'alignement ; « CLI »
  incompréhensible pour un non-développeur).
- **Après** : texte **exact** « Un administrateur ne peut pas être désactivé depuis l'interface. » placé **sous la
  ligne de rôle**, dans la colonne d'identité (`.cpt-regle` : petit, gris `--color-svv-muted`, ton sobre, pas une
  alerte). La rangée de boutons ne contient plus QUE des boutons → **alignement d'une carte à l'autre**.
- Carte d'un administrateur **désactivé** (section désactivés) : variante « …ne peut pas être **réactivé**
  depuis l'interface. » (décision A2).
- **Cohérence du vocabulaire** : le toast d'erreur de `definirActif` (appel forgé) disait encore « passe par la
  CLI » → aligné en « Un administrateur ne peut pas être activé ou désactivé depuis l'interface. ». Plus **aucun
  « CLI »** dans l'UI (grep : 0). Le **code d'erreur serveur `ADMIN_CLI_UNIQUEMENT` reste INCHANGÉ** (seul
  l'affichage change ; la route `actif/route.ts:47` n'est pas touchée).

## 5. Tests modifiés / ajoutés — aucune logique déplacée
- **Ajouté** à `page.parts.test.ts` : texte exact présent + placement (`cpt-regle`) ; variante « réactivé » ;
  disparition de « CLI uniquement » / `cpt-cli` / de tout `\bCLI\b` de l'UI ; migration 017 (8 actions dont
  `changement_identite`, `DROP IF EXISTS` + `ADD`, transaction).
- **Aucun test existant modifié** : `edition.test.ts` (Lot D) continue d'attendre le **code** `ADMIN_CLI_UNIQUEMENT`
  (403) sur la route — inchangé. Aucun test des lots B/C/D/E ne dépendait de la chaîne UI ni de `cpt-cli`.

## 6. Revues adverses — verdicts & arbitrages
| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Migration 017 | **VALIDER** | Idempotente/rejouable (DROP IF EXISTS + ADD) ; nom de contrainte exact ; 8 actions, 0 retirée ; transaction saine ; additive. |
| R2 | Libellé / UI | **VALIDER** | Texte exact sous le rôle ; boutons alignés ; ton sobre ; contraste AA (muted 5.35:1) ; aucun bleu ; variante « réactivé » cohérente ; 375px OK. |
| R3 | Conformité / régression | **VALIDER** | Serveur intact (code d'erreur inchangé) ; défense en profondeur préservée ; F1 n'anticipe pas F2 ; aucun test cassé. |

**Arbitrages :**
- **Toast « CLI » → aligné** (R2/R3 obs) : *accepté* — le prompt bannit « CLI » de l'UI ; le toast est une surface
  utilisateur (appel forgé). Vocabulaire unifié.
- **Test variante « réactivé »** (R3 suggestion) : *accepté & ajouté*.
- **DO-block de 017 stylistiquement différent de 016** (R1, cosmétique) : *conservé* — Arno a explicitement demandé
  « DO-block gardé par NOM de contrainte, DROP IF EXISTS puis ADD ». Sans incidence fonctionnelle.
- **Redondance règle carte (`cpt-regle`) vs détail (`cpt-note`)** (R2 obs) : *tracé* — contextes distincts, sobre,
  harmonisation future éventuelle.

Aucun défaut de fond → run poursuivi jusqu'à la livraison F1.

## A. DÉCISIONS HORS-SPECS
- **A1 — Découpe F1/F2** : sur décision Arno (le run avait été arrêté sur l'action de journal). F1 = migration + libellé.
- **A2 — Variante « réactivé »** pour un administrateur désactivé : la spec ne donnait que le texte « désactivé » ;
  pour un admin de la section « désactivés » (mis là par la CLI), la RÉactivation est le fait bloqué en interface,
  d'où la variante. *Alternative écartée* : texte statique « désactivé » (faux dans ce contexte). *Impact* : purement
  cosmétique.

## B. DOUTES
- **B1 — F2 (édition prénom/nom) reste à construire** APRÈS application de 017. Il utilisera `changement_identite`,
  une écriture atomique conditionnelle (jamais l'identifiant, immuable — F-1), la double barrière `exigerAdministrateur`,
  et l'allowlist stricte des champs. Non commencé (conformément à « Livre F1 SEUL et arrête-toi »).

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; `password.ts`/
`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged ; **aucune migration appliquée** ; Gemini hors périmètre ;
aucun identifiant en dur (R-F) ; responsive/`prefers-reduced-motion` intacts (Lot E).

## Verdict de recon-valid (Phase 8)
**VALIDER (F1).** Migration 017 correcte et rejouable (à appliquer par Arno) ; libellé clair, sobre, bien placé,
boutons alignés, aucun « CLI » ni bleu dans l'UI ; code serveur d'erreur inchangé ; F1 n'anticipe pas F2. Golden
23/23, byte-unchanged, aucun commit.

**⏸ ARRÊT après F1**, comme demandé : j'attends qu'Arno **applique la migration 017** avant de construire **F2**
(édition prénom/nom, journalisée en `changement_identite`, identifiant immuable, allowlist stricte, double barrière).
À toi de committer F1 fichier par fichier, puis d'appliquer 017, puis de relancer pour F2.

---
---

# Rapport de build — M3-4 Lot F2 : édition prénom/nom (identifiant immuable, allowlist stricte)

> Run `/svav-build` autonome. **Migration 017 appliquée par Arno, F1 committé (HEAD).** Ce rapport couvre **F2**.
> **Aucun commit** : livraison remise à Arno.

## 1. Synthèse F2

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` (test:integration) | ✅ **23/23** (aucun fichier moteur touché) |
| `tsc --noEmit` / `eslint` | ✅ 0 / 0 |
| `npm test` | ✅ **620 passed / 21 skipped** (49 fichiers ; +19 tests F2 vs 601 à F1) |
| `next build` | ✅ route `/api/admin/comptes/[id]/identite` enregistrée, bundle client propre |
| `password.ts` / `motDePasse.ts` / `proxy.ts` / `garde.ts` byte-unchanged | ✅ (`git diff --stat` vide) |
| Aucune migration nouvelle / aucun DDL / aucun DELETE-TRUNCATE-DROP | ✅ |
| Fichiers Gemini intouchés | ✅ |
| Revues adverses R1 / R2 / R3 | ✅ **VALIDER / VALIDER / VALIDER** |

**Fichiers F2** :
- `app/lib/admin/comptes.ts` — **+`modifierIdentite(id, prenom, nom, auteurId)`** : UPDATE atomique (CTE) SET **prenom, nom uniquement** (jamais `identifiant` ni `role`), `WHERE id=$1` (aucun filtre de rôle → applicable à un administrateur, F-2), journal `changement_identite`, `auteur_id` propagé y compris NULL. `ErreurCompte` si prénom/nom vides après trim.
- `app/(admin)/api/admin/comptes/[id]/identite/route.ts` — **NOUVEAU** : POST, double barrière (`exigerAdministrateur`), **allowlist stricte** (lit UNIQUEMENT `b.prenom` / `b.nom`), id `/^[1-9]\d*$/`, 200 / 404 / 422 / 403.
- `app/(admin)/admin/(protected)/comptes/page.tsx` — DetailContenu : champs prénom/nom éditables (tout compte), **identifiant en TEXTE lecture seule** (`<span class="cpt-idval">`) + mention d'immuabilité ; Detail : état `idPrenom`/`idNom` + `enregistrerIdentite` (POST `{prenom, nom}` seuls). CSS `.cpt-identite/.cpt-libc/.cpt-idval`.
- `app/(admin)/api/admin/comptes/[id]/identite.test.ts` — **NOUVEAU** (12 tests) · `app/lib/admin/comptes.test.ts` (+4) · `…/comptes/page.parts.test.ts` (+4).

## 2. Immuabilité de l'identifiant — verrouillée à TROIS niveaux (F-1)
1. **Signature** : `modifierIdentite` n'a aucun paramètre `identifiant` — un appelant ne peut pas lui en passer.
2. **SQL** : `UPDATE … SET prenom=$2, nom=$3 WHERE id=$1` — colonnes littérales, valeurs liées ; aucune concaténation. Grep global : **aucun `SET identifiant`** sur un compte existant (les seules écritures de `identifiant` sont les INSERT de **création**, légitimes — « un compte mal saisi se désactive et se recrée »).
3. **Handler** : **allowlist stricte** (`route.ts:32-33`) — seuls `prenom`/`nom` sont lus ; `identifiant`, `role` et tout autre champ ignorés silencieusement (jamais une denylist ; pas de spread de body).

**Preuve d'anti-forgeage SUR LA BASE** (`identite.test.ts`) : un POST `{prenom, nom, identifiant:'pirate@evil.test', role:'administrateur'}` → 200, mais les params réellement envoyés au driver valent `[5,'Zoé','Bar',1]`, `JSON.stringify(params)` ne contient pas `pirate@evil.test`, et le SQL ne matche ni `/identifiant/i` ni `/\brole\b\s*=/i`. Assertion sur les params SQL, pas sur la réponse.

## 3. Double barrière & journal
- **Barrière 1** (JWS) : `proxy.ts` garde `/api/admin/comptes/` par `session.role === 'administrateur'` (rôle du jeton).
- **Barrière 2** (BASE) : `exigerAdministrateur` (`garde.ts`, **inchangé**) relit `role`+`actif` en base → 403 INTERDIT si absent/inactif/non-admin. Jeton au rôle **périmé** (JWS admin, base collaborateur) → **403** (testé).
- **Atomicité** : CTE `WITH maj AS (UPDATE … RETURNING) , jrnl AS (INSERT … SELECT … FROM maj) SELECT` — statement SQL unique ; l'INSERT journal est piloté par `FROM maj`, jamais orphelin ; 0 ligne UPDATE ⇒ 0 ligne journal ; échec du CHECK ⇒ tout avorte. UPDATE et journal ne peuvent pas diverger.
- **Voie de secours** (`sub=null`) : accès complet sans requête de garde, `auteur_id = NULL` au journal (testé).
- **Action `changement_identite`** : présente dans le CHECK recréé par 017 (assertion dans les tests, pas supposition) → l'INSERT ne plante pas au runtime.

## 4. UI / A11y (Lot E respecté)
Identité éditable pour **tout** compte (y compris administrateur, F-2). Identifiant en **texte** (jamais un input désactivé trompeur) + note « Non modifiable ». Validation client (bouton primaire désactivé si prénom/nom vides après trim → refus **avant** appel serveur) ET serveur (422). **Aucun bleu** ; focus rouge visible conservé ; cibles ≥ 44px ; `prefers-reduced-motion` respecté ; labels englobants, `role="group"`/`aria-labelledby`, `aria-invalid`. **Invariant Lot E préservé** : l'identifiant n'apparaît qu'**une** fois (retiré de `cpt-tete`, affiché seul dans `cpt-idval`) — test `.toBe(1)` vert. Pas de state stale entre deux détails (`key={c.id}` remonte `Detail` + `useEffect([id])` réhydrate).

## 5. Revues adverses — verdicts & arbitrages
| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Immuabilité / allowlist | **VALIDER** | Immuabilité à 3 niveaux ; vraie allowlist (pas de spread) ; SQL non injectable ; UI en texte ; tests d'anti-forgeage assertent sur les params SQL. Aucun autre chemin d'écriture de l'identifiant. |
| R2 | Escalade / journal | **VALIDER** | Double barrière étanche (proxy + relecture base) ; atomicité indivisible ; action `changement_identite` réellement dans le CHECK 017 ; `auteur_id` NULL propagé ; 404 sans fuite. |
| R3 | Cohérence / régression / UI-a11y | **VALIDER** | Pas de bleu ; identifiant en texte, une seule fois ; validation client+serveur ; pas de state stale ; cibles ≥44px ; non-régression B–E verte. |

**Arbitrages :**
- **OBS-1 (R2) — rejeu de la migration 016 régresserait le CHECK** (016 recrée `admin_utilisateur_log_action_check` avec la liste COURTE, même nom de contrainte que 017) : *tracé, hors périmètre F2*. 016 a été écrite dans un lot antérieur (F1/M3-4A) ; F2 ne la touche pas. Risque purement opérationnel (rejeu de 016 APRÈS 017). Ordre normal (016 puis 017, une fois) = OK. **Aucune modification F2.** → catégorie A/B ci-dessous.
- **OBS-2 (R2) — la voie de secours ne revérifie pas le rôle** : *choix assumé* (règle d'or « ne jamais s'enfermer dehors » de `garde.ts`, déjà en place, byte-unchanged). Non exploitable (un jeton `sub=null` est toujours administrateur ; le forger exige le secret HS256). Aucun changement.
- **R3 rem.1 — deux boutons primaires (rouge plein) dans le même détail** (« Enregistrer l'identité » + « Enregistrer les permissions ») : *conservé*. La charte Lot E mappe la couleur (rouge plein = primaire) sans imposer « un seul primaire par vue » ; chaque bouton est le primaire de sa **section** (groupes ARIA distincts) — et le prompt F2 exige explicitement « Enregistrer l'identité = primary ». Défendable.
- **R3 rem.2 — annonce a11y du message d'erreur** (`role="status"` monté avec son contenu, pas de `aria-describedby`) : *tracé, non bloquant*. Atténué par `aria-invalid` sur les champs + bouton désactivé + texte visible ; l'exigence « erreurs annoncées » est satisfaite. Amélioration future possible (région live persistante).

Aucun défaut de fond → run poursuivi jusqu'à la livraison F2.

## A. DÉCISIONS HORS-SPECS
- **A1 — Codes HTTP** : la spec ne fixait pas les statuts. Retenus : **200** `{ok:true}`, **404** compte introuvable (après double barrière — accessible seulement à un admin qui peut déjà lister tous les comptes, pas de fuite d'énumération), **422** validation (id non numérique, prénom/nom vides), **403** double barrière, **500** erreur inattendue. *Bonne pratique REST, cohérent avec `role`/`permissions`.*
- **A2 — Deux primaires par section** (voir arbitrage R3 rem.1). Alternative écartée : passer « Enregistrer les permissions » en secondaire (aurait dilué le primaire exigé de l'identité). Impact cosmétique.

## B. DOUTES
- **B1 — Rejeu de 016 (OBS-1 R2)** : hors périmètre F2 mais consigné pour Arno. Si un jour tu rejoues les migrations en masse, 016 (liste courte) écraserait le CHECK de 017 (liste longue) car elles partagent le nom de contrainte. Régularisation possible hors F2 : faire de 017 la seule source du CHECK, ou garde de version. **Aucune donnée en jeu, aucune suppression** ; le risque est un futur INSERT `changement_identite` refusé (capté en 500). À trancher par toi, sans urgence.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 bit-identique ; `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged (diff vide) ; aucune migration/DDL ; aucun DELETE/TRUNCATE/DROP/UPDATE de masse ; aucun identifiant en dur (R-F) ; Gemini hors périmètre ; responsive/`prefers-reduced-motion` intacts.

## Verdict de recon-valid (Phase 8) — F2
**VALIDER (F2).** Édition prénom/nom livrée, identifiant IMMUABLE verrouillé à 3 niveaux (signature + SQL + allowlist stricte), preuve d'anti-forgeage sur la base, double barrière + journal atomique `changement_identite`, voie de secours `auteur_id` NULL, UI accessible sans bleu conforme au Lot E, invariant « identifiant une seule fois » préservé. Golden 23/23, byte-unchanged, **aucun commit** — livraison remise à Arno.
