# RAPPORT DE BUILD — Module Internaute, LOT 2 (ingestion)

> Chantier `/svav-build`. **Non committé, AUCUNE migration** (le socle 023 du LOT 1 suffit).
> Réf. : `docs/PLAN_BUILD_module_internaute.md` (LOT 2), `docs/ETUDE_module_internaute_rgpd.md` §1-3.

## Fichiers
- **Neufs** : `app/lib/internaute/textesConsentement.ts` (catalogue serveur versionné), `app/lib/internaute/ingestion.ts`
  (validation pure + porte F1), `app/lib/internaute/socle.ts` (repository DB transactionnel), `app/api/internaute/route.ts`
  (route publique POST), `app/lib/internaute/ingestion.test.ts` (15 tests).
- **Modifié** : `app/page.tsx` (`EcranCertificat` : props moteur + cases de consentement + câblage « Valider »).

## Mapping des champs (saisie / moteur → tables du socle 023)
| Source (front) | Table.colonne | Bloc |
|---|---|---|
| prénom, nom, email, téléphone | `internaute.{prenom,nom,email,telephone}` (source_collecte='tunnel') | A |
| case(s) cochée(s) par finalité | `internaute_consentement` (etat='accorde', canal='tunnel', `texte_id`→`internaute_consentement_texte`) | B |
| verdict, score (moteur, lecture seule) | `internaute_projet.{verdict,score}` | C |
| étage, dernier étage, résidence principale, commune INSEE, lat/lon, adresses | `internaute_projet.{etage,dernier_etage,residence_principale,commune_insee,lat,lon,adresse_saisie,adresse_normalisee}` | C |
| type de bien, surface, pièces, époque, terrasse, balcon, jardin, adresse résidence alt. | `internaute_projet.payload` (jsonb, `version_tunnel=1`) | C |

## Consentement AVANT persistance (invariant)
- **Front** : « Valider » n'envoie un POST **que si F1 (recontact) est cochée**. Sans F1 → **aucune donnée nominative
  n'est transmise** (minimisation), la confirmation s'affiche quand même (non-couplage : le certificat s'obtient sans
  consentement — `estValide` ne dépend d'aucune case).
- **Route** (défense en profondeur) : `consentementServicePresent()` exige F1 ; sans elle → 422, rien n'est persisté.
- **Repository** : `ingererProfil` lève `ErreurConsentementServiceManquant` si F1 absente → aucune écriture.
- Cases **granulaires** (une par finalité), **jamais pré-cochées**. Textes **versionnés** : la preuve pointe la
  version vue (`texte_id`), matérialisée depuis le **catalogue serveur** (non-forgeable).

## Idempotence / anti-doublon
- `getOrCreateInternaute` : `INSERT … ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING RETURNING id`
  puis `SELECT` de repli → **pas de doublon** de personne, **sans écraser** l'identité existante.
- Consentements **append-only** (une nouvelle soumission ajoute une preuve, n'écrase jamais ; la vue
  `internaute_consentement_actif` prend la plus récente). Chaque soumission crée un **nouveau `internaute_projet`**
  (une personne ↔ plusieurs analyses).
- Transaction unique (`withTransaction`) : A → B → C ; **ROLLBACK complet** si une étape échoue.

## Gestion d'erreur (non bloquante)
Échec réseau/ingestion → `erreurEnvoi` affiché discrètement, mais `setSoumis(true)` **dans tous les cas** : le flux
produit (confirmation) n'est **jamais** bloqué. Route : 422 (validation/F1), 503 (base indisponible), log serveur.

## A. DÉCISIONS HORS-SPECS
- **A-1 — Get-or-create, PAS d'UPDATE d'identité.** Le prompt disait « upsert par email ». Choisi get-or-create
  (réutilise la ligne existante sans écraser prénom/nom/téléphone) pour honorer la **règle dure « pas d'écrasement »** ;
  la rectification d'identité est un droit du LOT 3, pas un effet de bord d'ingestion. Alternative écartée : `ON CONFLICT
  DO UPDATE` (écraserait l'identité à chaque re-soumission).
- **A-2 — Texte v1 = constante serveur matérialisée, PAS de migration de seed.** Le prompt interdisait une nouvelle
  migration. Le catalogue (`textesConsentement.ts`) est la source ; la route matérialise idempotemment la ligne
  `internaute_consentement_texte` (INSERT … ON CONFLICT DO NOTHING) depuis le contenu SERVEUR (non-forgeable). Nouvelle
  version = ajout au catalogue, sans migration. Alternative écartée : migration 024 de seed (le prompt la proscrivait).
- **A-3 — Porte F1 côté client (minimisation).** Sans F1, le front n'envoie pas le POST → aucune PII ne quitte le
  navigateur. La route l'exige aussi (défense en profondeur).
- **A-4 — F2/F3 structurés mais non affichés** (`actifTunnel:false`) : activables sans refonte, en attendant la
  validation juriste de leur base légale / du transfert tiers.
- **A-5 — Chaque soumission = un nouveau projet + une nouvelle preuve** (append-only), pas de dédup de projet (une
  personne peut refaire des analyses). Choix conforme au modèle 1-N de l'étude §2.1.

## B. DOUTES
- **B-1 — Copie de la confirmation.** « ✓ Vos informations ont bien été enregistrées » s'affiche aussi quand F1 n'est
  pas cochée (rien n'est envoyé, par choix) ; sur échec réseau, une note rouge le corrige. Imprécision mineure de
  placeholder (l'écran est explicitement un placeholder, `page.tsx:849`), à raffiner quand le certificat réel arrivera.
- **B-2 — Chemin SQL non couvert par test automatisé.** `socle.ts` (INSERTs) n'est pas testé en intégration (exigerait
  d'écrire des données nominatives de test en base ; évité). La logique PURE (validation, porte F1, catalogue) est
  couverte (15 tests). Un `socle.itest.ts` (create + assert + cleanup encadré) est recommandé une fois le flux validé.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.**
| Vérification | Résultat |
|---|---|
| Golden `29.107259068449615` | ✅ **54/54** (`test:integration`) — intact |
| Suite unitaire | ✅ **936 passed** / 0 failed (921 + 15) |
| `tsc --noEmit` | ✅ 0 erreur |
| `eslint` | ✅ fichiers neufs 0 erreur ; `page.tsx` **22 erreurs avant = 22 après** (baseline pré-existant, 0 ajoutée) |
| Cloisonnement M2 | ✅ imports = `next/server` + `../db/client` + modules internaute ; aucun `analytics/*`, aucun `incrementerCompteur` ; **aucune donnée nominative vers M2** |
| Moteur / golden | ✅ aucun fichier `svv/*`/`pipeline` touché ; verdict/score **capturés** depuis `analyse` déjà calculé (lecture seule) |
| Fichiers gelés / Gemini | ✅ intouchés |
| Migration | ✅ **ZÉRO** (socle 023 suffit) |

## Verdict recon de validation (Phase 8, indépendante, lecture seule)
**VALIDER.** Triple garde F1 avant persistance (chemin d'écriture unique `socle.ts`, seul appelant `route.ts:36`) ;
non-couplage certificat/consentement (`estValide` sans aucune case) ; transaction atomique A→B→C non destructive,
**mapping colonnes 023 intégral** (13/13 pour `internaute_projet`, `ON CONFLICT` cohérent avec l'index partiel) ;
anti-forge (catalogue serveur + `texteExiste`) ; cloisonnement M2 total (aucun import/PII vers l'anonyme) ; capture
moteur en lecture seule (golden intact) ; route paramétrée, sans fuite, non bloquante ; charte case conforme.

**3 observations non bloquantes** — sort :
- **Runtime Node explicite** → **APPLIQUÉ** (`route.ts` `export const runtime = 'nodejs'`).
- **Validation stricte `etage` (entier) + `commune_insee` (regex INSEE)** → **APPLIQUÉ** (entrée forgée = 422 propre au
  lieu de 503) + 2 tests (total 17).
- **Téléphone requis par `estValide` (`page.tsx:787`)** → **NON MODIFIÉ** : code **pré-existant** du formulaire (hors
  périmètre LOT 2) et **décision juriste** (§7 : le téléphone est-il nécessaire au service ?). ⚠️ **Atténué** : rien
  n'étant persisté sans F1, aucun numéro n'est jamais stocké sans consentement — l'invariant *storage* tient. À
  trancher avant mise en ligne (loi démarchage). Signalé, non corrigé.

## Prochaine étape
**LOT 3 — Exploitation** : moteur de requête filtré par consentement (JOIN `internaute_consentement_actif`), export CSV,
écran admin « Internautes », journalisation des extractions. Recommandé : ajouter aussi un `socle.itest.ts` (cf. B-2).
