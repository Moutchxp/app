# RAPPORT DE BUILD — Module Internaute, LOT 1 (socle schéma)

> Chantier `/svav-build`. **Non committé, migration NON jouée** (Arno l'applique à la main après relecture).
> Réf. : `docs/PLAN_BUILD_module_internaute.md` (LOT 1), `docs/ETUDE_architecture_data_module_internaute.md` §1-4.

## Fichiers produits (tous NOUVEAUX)
- `db/migrations/023_internaute_socle.sql` — la migration du socle (3 blocs + vue).
- `app/lib/internaute/consentement.ts` — helper PUR « consentement actif » (miroir de la vue SQL) + types.
- `app/lib/internaute/consentement.test.ts` — 9 tests unitaires (invariant).

## Tables créées (rôles A/B/C)
| Table / vue | Bloc | Rôle |
|---|---|---|
| `internaute` | **A — Identité** | 1 ligne = 1 personne. Clé **UUID** (`gen_random_uuid()`), email (unicité applicative partielle, `lower(email)`), téléphone **nullable**, `opposition_recontact`, `cree_a`/`maj_a`. Minimisé (aucun comportemental/IP). |
| `internaute_finalite` | **B — Consentement** | Référentiel EXTENSIBLE des finalités (seed F1 `recontact_interne` / F2 `email_marketing` / F3 `retargeting_tiers`). |
| `internaute_consentement_texte` | **B** | Textes de consentement VERSIONNÉS (finalité, version, contenu), `UNIQUE(finalite, version)`. |
| `internaute_consentement` | **B** | Preuves **append-only** : (personne × finalité × `etat` accorde/refuse/retire × horodatage × `texte_id` × canal). Retrait = nouvelle ligne. |
| `internaute_consentement_actif` (VUE) | **B** | INVARIANT : dernière décision par (personne, finalité) + booléen `actif`. |
| `internaute_projet` | **C — Projet** | Hybride : `payload jsonb` + `version_tunnel` + colonnes stables promues (verdict, score, etage, dernier_etage, residence_principale, commune_insee, lat/lon, adresses). Réceptacle (nullable) — ingestion = LOT 2. |

## « Consentement actif » — comment ça se lit
- **SQL (autoritatif)** : `SELECT actif FROM internaute_consentement_actif WHERE internaute_id = $1 AND finalite = $2`
  → la vue prend, par `DISTINCT ON (internaute_id, finalite) ORDER BY horodatage DESC, id DESC`, la décision la plus
  récente ; `actif = (etat = 'accorde')`. Les LOTS 3+ y JOIGNENT pour ne jamais exploiter une donnée non consentie.
- **TS (miroir applicatif)** : `consentementActif(historique, finalite)` (`app/lib/internaute/consentement.ts`) —
  même règle, pur, testé (9 cas : refus/retrait/re-consentement/tie-break id/indépendance des finalités/absence→false).

## A. DÉCISIONS HORS-SPECS (à contrôler)
- **A-1 — UUID pour la PERSONNE seulement ; tables filles en `bigserial`.** Le plan disait « UUID » globalement.
  Raffiné : `internaute.id` = uuid (exigence RGPD : clé ≠ email). Les filles (`…_consentement`, `…_texte`, `…_projet`)
  gardent `bigserial` → convention repo (014) **et** tie-break monotone déterministe pour « dernière décision »
  (un uuid aléatoire aurait rendu l'ordre non déterministe à horodatage égal). Alternative écartée : uuid partout
  (ordre non déterministe + écart inutile au repo).
- **A-2 — Finalités = table de référence, pas un CHECK figé.** Le plan/étude évoquaient un enum/CHECK. Choisi
  `internaute_finalite` (patron `analytics_catalogue_evenement`, 018) pour l'**extensibilité demandée** : une
  nouvelle finalité = un INSERT, sans migration ni altération de contrainte. Alternative écartée : `CHECK (finalite IN …)`
  (simple mais toute nouvelle finalité = migration).
- **A-3 — `etat` à 3 valeurs (`accorde`/`refuse`/`retire`).** Suit ce prompt (plus riche que le booléen `accepte`
  du plan : distingue un refus initial d'un retrait postérieur).
- **A-4 — Accès data = helper PUR minimal (pas de repository d'écriture).** L'écriture réelle (transaction A+B+C)
  est le LOT 2 ; en LOT 1 on ne livre que l'invariant testable (non spéculatif, exécutable sans base).
- **A-5 — Chiffrement au repos (email/téléphone) différé.** Stockage texte en LOCAL ; méthode (pgcrypto vs applicatif)
  = point subordonné §7 (tracé en commentaire de migration), non bloquant pour le build local.
- **A-6 — `statut_commercial` et journal d'accès NON inclus.** Le plan les listait en LOT 1 ; ce prompt a restreint
  le périmètre aux **3 blocs A/B/C** (« juste la fondation »). Reportés à leurs lots d'exploitation (LOT 3/5).

## B. DOUTES
- **B-1 — Méthode de chiffrement au repos** (cf. A-5) : à trancher avec le DPO avant mise en ligne.
- **B-2 — Périmètre `statut_commercial`** : déféré par respect du périmètre du prompt (A-6) ; à confirmer qu'il
  arrive bien au LOT 3/5 et non au socle.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.**
| Vérification | Résultat |
|---|---|
| Golden `29.107259068449615` | ✅ **trivialement intact** — aucun fichier moteur touché (git status : seuls fichiers neufs `internaute`/`023`) |
| Suite de tests | ✅ **921 passed** / 0 failed (912 + 9 nouveaux) |
| `tsc --noEmit` | ✅ 0 erreur |
| `eslint` | ✅ 0 warning |
| Cloisonnement M2 | ✅ aucune FK/colonne vers `analytics_*`/`login_echec` ; module TS sans import `analytics/*` (imports = `vitest` + `./consentement`) |
| Fichiers gelés / Gemini | ✅ intouchés |
| Migration jouée ? | ✅ **NON** — livrée pour application manuelle par Arno |

## Verdict recon de validation (Phase 8, indépendante, lecture seule)
**VALIDER.** Schéma miroir fidèle de l'étude §1-4 (3 blocs séparés reliés par UUID) ; invariant « consentement
actif » correct et déterministe, miroir SQL↔TS fidèle (aucune divergence) ; migration strictement non destructive ;
cloisonnement M2 prouvé (aucun pont FK/colonne/import) ; golden hors de portée ; gabarit repo respecté (023 libre,
`gen_random_uuid` natif sur socle déjà PG15+). 2 points non bloquants relevés : (1) commentaire « 4 tables » →
**corrigé en « 5 tables »** ; (2) l'append-only reste une discipline d'écriture (pas de trigger/REVOKE dur) — à
honorer au LOT 2 ou via une migration de durcissement ultérieure.

## Prochaine étape
**LOT 2 — Ingestion** : câbler `EcranCertificat` (`app/page.tsx`) → route `POST /api/internaute` (transaction
atomique A+B+C, capture score/verdict/étage/commune, gestion `resultat===null`), cases de consentement non
pré-cochées/non couplées. Nécessite d'appliquer d'abord la migration 023.
