# RAPPORT DE BUILD — Module Internaute, LOT 4 (cycle de vie)

> Chantier `/svav-build`. **Non committé.** Migration **025 NON jouée** (Arno l'applique après relecture).
> Réf. : `docs/PLAN_BUILD_module_internaute.md` (LOT 4), `docs/ETUDE_architecture_data_module_internaute.md` §6-7.

## ⚠️ Note règle dure (suppression de données)
Ce lot **construit la MÉCANIQUE** d'effacement/purge — un **process explicitement demandé et prévalidé par Arno**
(le chantier). Aucune suppression n'a été **exécutée** par l'agent : aucune migration jouée, aucune route déclenchée,
aucune donnée réelle touchée. L'agent livre le code ; Arno déclenche.

## Fichiers
- **Neufs** : `db/migrations/025_internaute_cycle_vie.sql` ; `app/lib/internaute/rectification.ts` (validateur pur) +
  `.test.ts` (9 tests) ; `app/lib/internaute/cycleVie.ts` (effacement/rectification/purge, serveur) ; routes
  `app/(admin)/api/admin/internautes/{[id]/effacement,[id]/rectification,purge}/route.ts`.
- **Modifiés** : `app/lib/internaute/extractionRepo.ts` (exclut les effacés + `efface_a` au détail) ;
  `app/(admin)/admin/(protected)/internautes/InternautesVue.tsx` (actions rectifier/effacer dans le dossier).

## Stratégie d'effacement retenue : ANONYMISATION EN PLACE (règle asymétrique)
`cycleVie.ts:51-58` (`anonymiserEnPlace`) — au sein d'UNE transaction :
- **A (identité)** : `UPDATE internaute SET prenom=NULL, nom=NULL, email=NULL, telephone=NULL, efface_a=now()` (`:52-53`).
- **C (projet)** : `DELETE FROM internaute_projet WHERE internaute_id = ANY(...)` (`:57`).
- **B (preuve)** : **JAMAIS touchée** — grep prouvé : AUCUN `INSERT/UPDATE/DELETE` sur `internaute_consentement`
  dans tout le module (`:58` = commentaire). La ligne `internaute` est **conservée** (anonymisée) → **son UUID reste
  le pivot des preuves B** → intégrité référentielle **intacte** ET preuve conservée pour un contrôle. C'est pourquoi
  l'anonymisation-en-place est préférée à une suppression en dur (qui casserait la FK de B ou imposerait de toucher
  B, append-only).
- Après effacement, le profil **disparaît des extractions** : `extractionRepo.ts:31` ajoute `AND i.efface_a IS NULL`
  à la clause d'invariant partagée (comptage/liste/export). La preuve B reste interrogeable **anonymement**.

## Rectification (droit de rectification, bloc A)
`cycleVie.ts:rectifierInternaute` — `UPDATE internaute SET <champs whitelistés> WHERE id=$1 AND efface_a IS NULL`.
Colonnes via **whitelist stricte** (jamais dérivées de l'entrée) ; valeurs **paramétrées**. Refuse un profil effacé
(404). Conflit d'unicité email → `ErreurEmailDuplique` → **409**. Journalisé **sans PII** (trace les champs modifiés,
pas leurs valeurs). Ne touche NI B NI le moteur.

## Rétention / purge (durées paramétrables)
- **Durées** : table `internaute_retention` (migration 025) — `identite_projet_jours` (A+C) + `preuve_consentement_jours`
  (B), lues **au runtime** (`lireRetentionJours`, `cycleVie.ts`), jamais en dur → « pilotage sans code ». **Valeurs
  PROVISOIRES** (1095 / 1825 j) marquées « à fixer DPO ».
- **Purge** (`purgerEchus`, route `POST /purge` admin-only) : anonymise (MÊME règle asymétrique) les profils dont la
  rétention identité+projet est **dépassée** ET **sans finalité active** (`NOT EXISTS … internaute_consentement_actif
  … actif=true`). **Déclenchement MANUEL** (pas de cron — LOCAL). **Fail-safe** : si la durée n'est pas configurée,
  la purge est **annulée** (jamais de purge avec une durée par défaut hasardeuse). Chaque purge journalisée.

## Traçabilité
`internaute_cycle_vie_log` (migration 025, append-only) : action (`effacement`/`rectification`/`purge_auto`) + auteur
admin (`utilisateur_id`) + cible (`cible_internaute_id`) + `details` jsonb **sans PII** + `ts`.

## Écran admin
Dans le dossier d'un profil (LOT 3) : boutons **Rectifier** (formulaire A) et **Effacer (droit à l'effacement)** avec
**confirmation** explicite (« anonymiser l'identité et supprimer les analyses ? La preuve de consentement est
conservée. Irréversible. »). Un profil déjà effacé affiche « Profil effacé le X… preuve conservée » (actions masquées).
Charte respectée (rouge/gris, ≥44px, focus rouge).

## A. DÉCISIONS HORS-SPECS
- **A-1 — Anonymisation en place** (vs suppression en dur) : seule stratégie qui préserve B + l'intégrité + l'append-only. Recommandée en Phase 1, retenue.
- **A-2 — Exclusion des effacés de l'extraction** via `efface_a IS NULL` dans la clause d'invariant partagée (1 ligne, `extractionRepo.ts:31`) — garantit « un effacé ne réapparaît jamais ».
- **A-3 — Rectification = bloc A uniquement.** La rectification de champs projet (C) n'est PAS construite : C est majoritairement dérivé du moteur (verdict/score) — hors édition manuelle. Alternative écartée : éditer le payload C (risque de corrompre des valeurs moteur). Différable si besoin métier.
- **A-4 — Pas de ligne de consentement 'retire' ajoutée à l'effacement** : l'effacement agit sur l'IDENTITÉ ; `efface_a` est le verrou opérationnel (exclusion d'extraction). B reste une preuve historique pure. (Ajouter un 'retire' serait append-only-compatible mais brouillerait le sens « effacer ≠ retirer un consentement ».)
- **A-5 — Journal dédié `internaute_cycle_vie_log`** (mutations) distinct de `internaute_extraction_log` (lectures, LOT 3) — séparation claire lecture/mutation, pas d'ALTER du CHECK existant.
- **A-6 — Durées PROVISOIRES en config** (pilotable) ; l'INTERFACE d'édition des durées est différée (le prompt la dit « future ») — la table + la lecture runtime suffisent au « pilotage sans code ».

## B. DOUTES
- **B-1 — Purge manuelle (pas de cron)** conforme au prompt (LOCAL). En production, un déclencheur planifié devra appeler `purgerEchus` (la fonction est prête).
- **B-2 — Chemin SQL non couvert en intégration** : les mutations DB (effacement/rectification/purge) ne sont pas testées en base (exigerait d'écrire/anonymiser des données nominatives de test). Logique PURE couverte (validateur, 9 tests). Un `cycleVie.itest.ts` (créer → effacer → asserter : PII NULL, projet supprimé, **preuve B toujours présente**) est recommandé.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.**
| Vérification | Résultat |
|---|---|
| Golden `29.107259068449615` | ✅ **54/54** — intact |
| Suite unitaire | ✅ **958 passed** / 0 failed (949 + 9) |
| `tsc` / `eslint` | ✅ propres |
| **Preuve B conservée** | ✅ **prouvé** — aucun `INSERT/UPDATE/DELETE` sur `internaute_consentement` dans tout le lot |
| Append-only de B | ✅ respecté (B jamais modifiée) |
| Cloisonnement M2 | ✅ aucun import/FK vers `analytics_*`/`login_echec` ; journal → `admin_utilisateur` |
| Moteur / gelés / proxy / tunnel | ✅ intouchés |
| Migration 025 | ✅ append-only (ADD COLUMN/CREATE IF NOT EXISTS), **NON jouée** |

## Verdict recon de validation (Phase 8, indépendante, lecture seule)
**VALIDER.** Invariant asymétrique **prouvé solide** : grep exhaustif sur tout le repo → la SEULE écriture sur
`internaute_consentement` est l'`INSERT` append-only de création de preuve (LOT 2, `socle.ts:65`) ; **aucune** écriture
sur B dans tout le LOT 4. Anonymisation en place (`UPDATE internaute` PII→NULL + `efface_a`, `DELETE internaute_projet`),
ligne `internaute` conservée (aucun `DELETE FROM internaute`, FK sans cascade → filet structurel), preuve B intacte.
Transactionnalité (`withTransaction`), fail-closed auth, cloisonnement M2, golden, exclusion des effacés en extraction
(`efface_a IS NULL`), whitelist paramétrée, purge fail-safe et non destructive de B, journal sans PII : tous respectés.

Observations MINEURES non bloquantes (n'affectent ni l'invariant ni la sécurité, verdict VALIDER) :
- UI rectification envoie les 4 champs même inchangés → journal `champs` légèrement sur-inclusif (accountability imprécise, sans impact).
- Blanchir l'email dans l'UI → 422 message générique (UX mineure).
- Double-effacement via API directe → 2ᵉ entrée de journal redondante mais bénigne (UPDATE ignoré par le garde `efface_a IS NULL`) ; l'UI l'empêche.
- Purge ancrée sur `cree_a` (création) — à trancher DPO (durées PROVISOIRES), pas un défaut de code.

## Prochaine étape
LOT 5 (API interne F1) / LOT 6 (email F2) / LOT 7 (tiers F3). Recommandé avant : un `cycleVie.itest.ts` prouvant en
base réelle que l'effacement conserve la preuve B (l'invariant central).
