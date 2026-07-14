# RAPPORT DE BUILD — statut « certificat envoyé / non envoyé » PAR LIGNE D'ANALYSE

> Run `/svav-build` autonome. Zone sensible (tunnel + socle + admin + migration). **Aucun commit** (livraison à Arno).
> Golden `29.107259068449615` **NON concerné** (aucun fichier moteur/pipeline/config ; le projet est capturé en LECTURE
> SEULE, jamais recalculé). Le statut certificat est désormais **PAR ANALYSE** (`internaute_projet.certificat_envoye`),
> distinct du statut PAR PERSONNE (`internaute.parcours`, migration 028) et du verdict (bloc C).
>
> **Périmètre respecté : la logique de CONSENTEMENT (réconciliation F2, masquage) n'est PAS touchée** — Évolution 2 reportée.

## Fichiers touchés (9) — 1 migration additive
- **`db/migrations/029_internaute_projet_certificat.sql`** (NOUVEAU) — `ADD COLUMN certificat_envoye boolean NOT NULL
  DEFAULT false`. Additive/idempotente/non-destructive (appliquée : 10 projets → false).
- **`app/lib/internaute/socle.ts`** — `insererProjet` : colonne `certificat_envoye` + param `certificatEnvoye` + `return
  Number(id)` (bigserial→chaîne pg→number) ; `ingererProfil(corps, parcours, certificatEnvoye=false)`.
- **`app/api/internaute/route.ts`** — expose `projetId` dans la réponse de POST /api/internaute.
- **`app/lib/internaute/cycleVie.ts`** — `completerParcours(..., projetId, ...)` : `UPDATE internaute_projet SET
  certificat_envoye=true WHERE id=projetId AND internaute_id=id` (**garde IDOR**), dans la transaction.
- **`app/api/internaute/completion/route.ts`** — parse `projetId` (number|chaîne numérique) ; CAS 1 → passe `projetId` ;
  CAS 2 → `ingererProfil(corps, 'complet', true)` (projet né marqué).
- **`app/lib/internaute/cycleVie.test.ts`** (+2 tests) — marquage scopé + no-op si projetId null.
- **`app/lib/internaute/extractionRepo.ts`** — `certificat_envoye` ajouté au SELECT de `lireProfilComplet` (projets).
- **`app/(admin)/admin/(protected)/internautes/InternautesVue.tsx`** — « (Certificat envoyé) » VERT / « (Certificat non
  envoyé) » ROUGE sur CHAQUE ligne d'analyse (compact line, `detail.projets.map`).
- **`app/page.tsx`** — état `projetIdA` (capté de la réponse de A), porté jusqu'à la complétion (CAS 1) ; jamais dans l'URL.

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — `projetId` coercé en `number` (bigserial → int8 → chaîne pg).** `insererProjet` renvoyait `r.rows[0].id` typé
`number` mais **chaîne au runtime** (driver pg, int8) ; corrigé en `return Number(id)`. La route expose un number, le front
le porte (`typeof number`), la complétion accepte **number OU chaîne numérique** (`/^\d+$/`) → robuste bout-en-bout, tout
paramétré (aucune injection). **Hypothèse** : id de projet < 2^53 (précision exacte) — trivialement vrai pour cette base.

**A2 — Marquage FOLDÉ dans la transaction de `completerParcours` (CAS 1) ; CAS 2 = projet né marqué.** Le `UPDATE
internaute_projet` est dans la MÊME transaction que le passage `parcours='complet'` + réconciliation → atomique. En CAS 2
(création directe en B), le projet naît avec `certificat_envoye=true` (`ingererProfil(..., true)`) — pas de second UPDATE.
Alternative écartée : marquage hors transaction (2 opérations, moins atomique).

**A3 — Marquage best-effort et silencieux si non applicable.** Un `projetId` d'un tiers (ou inexistant) → `WHERE id AND
internaute_id` matche 0 ligne → **rien marqué, aucune erreur** (IDOR-safe). La complétion reste non-bloquante (le certificat
est délivré même si le marquage n'aboutit pas).

**A4 — Placement du libellé : sur la LIGNE d'analyse (après la date, avant les actions).** Distinct du vert/rouge des
COORDONNÉES (celui-là par personne, en en-tête de fiche). Deux codes couleur cohérents (green/red charte) mais sémantiques
distinctes (analyse vs personne). Libellés exacts d'Arno respectés.

**A5 — Email déjà existant à l'Écran B (posté en A sans jeton) → analyse NON marquée.** Le front n'appelle pas la complétion
dans ce cas (pas de jeton, cf. lot précédent B1) → le projet de A reste `certificat_envoye=false` → « (Certificat non
envoyé) ». Cohérent avec la limitation « email réutilisé non re-confirmé en B ». Documenté (B2).

## B. DOUTES
**B1 — Précision `Number(bigint)`** : au-delà de 2^53 la précision se perdrait ; négligeable ici (peu de projets). Si la base
grossissait énormément, porter `projetId` en chaîne de bout en bout (paramétrage pg déjà compatible).

**B2 — Analyse d'un email réutilisé non marquée** (cf. A5) : le projet de A d'un revenant sans jeton reste « non envoyé »
même s'il valide l'Écran B. Report de la limitation du lot précédent (pas de capacité de complétion sans jeton). À traiter
avec l'Évolution « identification du récurrent » si souhaité.

## C. ÉCARTS DE CONFORMITÉ
- **GOLDEN** : `test:integration` **8 fichiers / 54 tests PASS**, golden `29.107259068449615` **bit-identique** (aucun fichier
  moteur/pipeline/config ; projet capturé en lecture seule).
- **CONSENTEMENT (bloc B) INTACT** : la réconciliation F2 (`completerParcours`), `insererConsentement`, le catalogue et la vue
  `internaute_consentement_actif` sont INCHANGÉS en comportement (seul un `UPDATE internaute_projet` — bloc C — a été ajouté).
  Évolution 2 (masquage/anti-doublon) NON abordée.
- **`internaute.parcours` INTACT** : le vert/rouge des COORDONNÉES (par personne) est inchangé ; le nouveau statut est PAR
  ANALYSE, sur une colonne DISTINCTE (`internaute_projet.certificat_envoye`).
- **IDOR** : marquage `WHERE id=projetId AND internaute_id=<UUID du jeton>` — un internaute ne peut marquer QUE ses projets.
- **MIGRATION** : additive/idempotente (appliquée + ré-appliquée sans erreur).
- **VERDICT DÉCOUPLÉ / CONFIG / GEMINI** : non concernés.

## Preuves
- **Marquage scopé IDOR (tests)** : `projetId=77` → `UPDATE … WHERE id=77 AND internaute_id='uuid-1'` (capturé) ; `projetId=null`
  → **aucun** marquage. (+ les 6 tests de réconciliation append-only, inchangés.)
- **Bon projet (CAS 1)** : route A renvoie `projetId` → front `setProjetIdA` → body `{ jeton, projetId, ...corps }` →
  `completerParcours(..., projetId, ...)` → UPDATE ciblé sur CE projet.
- **CAS 2** : `ingererProfil(corps, 'complet', true)` → `insererProjet(..., true)` → projet né `certificat_envoye=true`.
- **Non validé → false** : défaut migration `false` ; une analyse jamais complétée en B reste false → rouge.
- **Admin** : compact line — `p.certificat_envoye === true ? vert '(Certificat envoyé)' : rouge '(Certificat non envoyé)'`,
  dans `FicheDetail` (composant unique → toutes fiches, y compris Vérification).

## Vérifications de sortie (les 4)
- `npx tsc --noEmit` : **PASS** (exit 0).
- `npx eslint` : backend/admin (7 fichiers) = **0** ; `page.tsx` = **23 pré-existants** (0 introduit). Aucun `disable`.
- `npm test` : **PASS** — 86 fichiers, **1036 tests** (+2 marquage), 21 skipped.
- `npm run test:integration` : **PASS** — 8 fichiers, 54 tests, **golden `29.107259068449615` bit-identique**.

## Recon de validation (Phase 8) — VERDICT reviewer : **VALIDER** (3 constats, 2 traités)
Revue adversariale indépendante (sous-agent, 34 outils, schéma DB vérifié, `projetId` tracé A→front→complétion→UPDATE) →
**VALIDER** : les **10 invariants A→J TENU** (bon projet marqué, IDOR fermé `internaute_id` du jeton, non-validé→false→rouge,
bloc B consentement + `internaute.parcours` INTACTS, migration additive/idempotente, moteur/golden intacts, affichage par
analyse dans le composant unique). 3 constats non bloquants :

1. **(Info) IDOR CAS 2 email pré-existant — AMPLIFICATION du MARQUAGE CORRIGÉE.** La surface « append-to-existing-email »
   préexiste (modèle de confiance de l'ingestion, Évolution 2 reportée), mais mon lot y ajoutait `certificat_envoye=true` →
   un tiers non authentifié aurait pu faire apparaître une ligne verte sur la fiche d'une victime. **CORRIGÉ** :
   `ingererProfil` ne marque le projet QUE si le profil est GENUINEMENT créé (`certificatEnvoye && creeInternaute`,
   `socle.ts`) → un email réutilisé → projet appendé **NON marqué**. Réponse serveur déjà honnête (`cree:false`).
2. **(Observation) Marquage DANS la transaction de complétion** — si la colonne 029 n'existe pas (migration non appliquée)
   mais code déployé → l'UPDATE lève → rollback de TOUTE la complétion (503). C'est de l'**atomicité voulue** (marquage +
   parcours + consentements = un tout), bénigne sous la discipline de migration MANUELLE du projet. **NON corrigé** (l'atomicité
   est correcte) → **DÉCISION : appliquer la migration 029 AVANT de déployer ce code** (comme toute migration SVAV). Un
   `projetId` forgé ne déclenche jamais ce chemin (0 ligne, pas d'erreur).
3. **(Cosmétique) Ligne blanche superflue** (`page.tsx`) — **CORRIGÉE**.

**VERDICT après corrections : VALIDER.** Corrections re-vérifiées : tsc 0, eslint 0 (page.tsx 23 pré-existants), `npm test`
**1036**, golden re-joué. Doutes non bloquants : B1 (précision bigint), B2 (email réutilisé non marqué — cohérent, cf. constat 1).

⚠️ **PRÉREQUIS DE DÉPLOIEMENT (constat 2)** : appliquer `db/migrations/029_internaute_projet_certificat.sql` AVANT de déployer
ce code (sinon la complétion Écran B lèverait). Migration manuelle standard SVAV.
