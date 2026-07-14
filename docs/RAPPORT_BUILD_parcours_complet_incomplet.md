# RAPPORT DE BUILD — Parcours tunnel en 2 temps (statut incomplet/complet) + upsert Écran B + admin vert/rouge

> Run `/svav-build` autonome. ZONE LA PLUS SENSIBLE (socle + ingestion + tunnel + admin + RGPD + migration + bloc B
> append-only). **Aucun commit** (livraison à Arno). Golden `29.107259068449615` **NON concerné** (aucun fichier
> moteur/pipeline/config touché ; le projet est capturé en LECTURE SEULE, jamais recalculé).
>
> **Contradiction de spec levée par Arno EN COURS DE RUN** (AskUserQuestion) : la section D initiale (« retirer F2 de A »)
> contredisait la règle scellée (F2-seul ne doit jamais être perdu). Arno a tranché : **F2 reste à A ET apparaît aussi à B ;
> UPSERT à B** (complète si profil existe, crée sinon). C'est ce qui est livré.

## Fichiers touchés (8) — 1 migration additive
- **`db/migrations/028_internaute_parcours.sql`** (NOUVEAU) — `ADD COLUMN parcours text NOT NULL DEFAULT 'incomplet'
  CHECK IN ('incomplet','complet')`. Additive/idempotente/non-destructive. Distinct du verdict.
- **`app/lib/internaute/socle.ts`** — `getOrCreateInternaute` pose `parcours` à la CRÉATION (non écrasé à la réutilisation) ;
  `ingererProfil(corps, parcours='incomplet')` (param pour la création directe en B) ; export `assurerTexteConsentement` +
  `insererConsentement` (avec param `etat` 'accorde'|'retire').
- **`app/lib/internaute/cycleVie.ts`** — `completerParcours(id, coords, souhaites, auteur)` : UPDATE coords+parcours+maj_a
  (efface_a IS NULL) + **réconciliation F2 append-only** (accorde/retire/no-op) + journal.
- **`app/lib/internaute/cycleVie.test.ts`** (NOUVEAU, +5 tests) — preuve de la réconciliation.
- **`app/api/internaute/completion/route.ts`** (NOUVEAU) — endpoint UPSERT (jeton→compléter ; sans jeton+consentement→créer ;
  sans jeton+rien→pas de profil).
- **`app/lib/internaute/extractionRepo.ts`** — `parcours` ajouté au SELECT de `lireProfilComplet`.
- **`app/(admin)/admin/(protected)/internautes/InternautesVue.tsx`** — email+tél en VERT si `parcours='complet'`, ROUGE sinon.
- **`app/page.tsx`** — F2 en A (inchangé) ET section F2 en B ; `construireCorps` extrait ; `soumettre` (parcours incomplet +
  `posteEnA`) ; `recevoirCertificat` → endpoint completion ; retrait des états morts `emailInitial`/`telInitial`.

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — Contradiction B↔D levée par Arno (upsert en B).** La section D initiale (« retirer F2 de A ») rendait le F2-seul
impossible à créer (F2 déplacé en B, mais rien créé en A → F2 orphelin → trou RGPD). J'ai INTERROMPU pour clarifier
(AskUserQuestion) ; Arno a tranché : **F2 à A ET B ; UPSERT en B**. Livré conformément.

**A2 — Réconciliation F2 APPEND-ONLY (extension de « F2 append si coché »).** La table de vérité disait « F2 append si
coché » ; Arno a aussi dit « l'internaute peut décocher F2 en B ». Pour honorer les DEUX correctement en append-only :
coché & inactif → nouvelle ligne 'accorde' ; **décoché & actif → nouvelle ligne 'retire'** ; inchangé → **RIEN** (pas de
doublon). Jamais d'UPDATE d'une preuve. Alternative écartée : append aveugle (dupliquerait + ignorerait le décochage).

**A3 — Complétion journalisée en `action='rectification'` (avec `details.parcours='complet'`).** La colonne
`internaute_cycle_vie_log.action` a un CHECK `IN ('effacement','rectification','purge_auto')` (025:58). Ajouter 'completion'
aurait exigé de manipuler la contrainte (nom auto-généré, fragile). Choix : réutiliser 'rectification' (la complétion
rectifie bel et bien les coordonnées) + marqueur `parcours` dans `details`. Aucune migration de contrainte. Alternative
écartée : élargir le CHECK (fragile).

**A4 — Cas « email déjà existant » à l'Écran A → pas de complétion en B (pas de double projet).** Si l'email existe déjà,
`getOrCreateInternaute` réutilise (`cree:false`, PAS de jeton). Le front distingue via `posteEnA` : posté en A **sans** jeton
= email réutilisé → `recevoirCertificat` **N'APPELLE PAS** la complétion (sinon le cas-2 « créer » ré-ingérerait → DOUBLE
projet). Conséquence : les coordonnées d'un email réutilisé ne sont pas re-confirmées en B (pas de capacité sans jeton) ;
le certificat reste délivré. Voir doute B1.

**A5 — Migration : lignes existantes → 'incomplet'.** `DEFAULT 'incomplet'` marque les profils PRÉ-EXISTANTS (créés par
l'ancien tunnel mono-écran) comme incomplet (rouge en admin) — conservateur/honnête : ils n'ont jamais été confirmés via
le nouvel Écran B. Alternative écartée : 'complet' (présumerait une confirmation qui n'a pas eu lieu).

**A6 — Retrait des états morts `emailInitial`/`telInitial`.** L'ancienne détection de changement (ne PATCHer que si modifié)
disparaît : la complétion envoie TOUJOURS les coordonnées courantes (B fait foi). Ces états devenaient write-only → retirés
pour ne pas introduire de nouveau problème eslint. `construireCorps` extrait, partagé par A et B.

## B. DOUTES

**B1 — Email réutilisé : coordonnées non re-confirmées en B.** Sans jeton (email déjà en base), l'Écran B ne peut pas
adresser le profil (IDOR) → pas de MAJ coords ni de passage 'complet' pour ce cas. Si Arno veut que les revenants confirment
aussi leurs coordonnées, il faudrait un mécanisme dédié (re-délivrer un jeton pour un email connu, ou un lookup authentifié) —
HORS périmètre. Le certificat reste délivré ; aucun crash.

**B2 — La réconciliation en B suppose que le front porte l'état A de F1.** `completerParcours` réconcilie TOUTES les finalités
tunnel depuis `corps.consentements`. F1 (non affichée en B) est portée par l'état React depuis A → cochée si A l'avait cochée
→ no-op. Si un front futur envoyait un `corps` sans F1 alors que F1 est active, F1 serait retirée. Le front actuel porte
toujours l'état A → sûr. Hypothèse tracée.

**B3 (report du lot précédent) — Versionnage de preuve.** Le changement en place des textes v1 (retrait « juriste ») reste
acceptable pre-lancement ; à figer avant go-live (cf. `RAPPORT_BUILD_tunnel_F2_porte_creation.md` §B1).

## C. ÉCARTS DE CONFORMITÉ
- **GOLDEN** : `test:integration` **8 fichiers / 54 tests PASS**, golden `29.107259068449615` **bit-identique** (aucun fichier
  moteur/pipeline/config ; le projet est capturé en lecture seule, jamais recalculé).
- **RÈGLE SCELLÉE (au moins un consentement) NON RÉGRESSÉE** : F2-seul → profil créé (en A si F2 coché en A ; sinon en B par
  l'upsert) + F2 persisté. Aucun consentement → certificat, aucun profil (non-couplage). Porte cohérente front + ingestion +
  completion.
- **BLOC B APPEND-ONLY INTACT** : réconciliation = INSERT ('accorde'/'retire'), jamais d'UPDATE de preuve ; MAJ identité (A)
  indépendante ; consentement rattaché à l'UUID stable ; anti-forge `texteExiste` inchangé.
- **MÉCANIQUES F1 NON GÉNÉRALISÉES** : jeton = `creeInternaute` (pas F1) ; `opposition_recontact` F1-scopé, non touché.
- **PARCOURS ≠ VERDICT** : colonnes distinctes (`internaute.parcours` bloc A vs `internaute_projet.verdict` bloc C).
- ⚠️ **ESLINT `page.tsx` PRÉ-EXISTANT** : **23 problèmes (19 erreurs, 4 warnings)**, IDENTIQUE avant/après (prouvé). Mes
  changements en introduisent **ZÉRO** (aucun des 23 n'est dans mes régions). Fichier legacy hors périmètre de correction.
- **VERDICT DÉCOUPLÉ / CONFIG / ST_Force2D / HAUTEUR / GEMINI** : non concernés.

## Preuves
- **Réconciliation append-only (5 tests `cycleVie.test.ts`)** : F2 coché & inactif → append **'accorde'** ; F2 décoché & actif
  → append **'retire'** ; F2 inchangé → **AUCUN insert** (pas de doublon) ; UPDATE contient `parcours = 'complet'` **et**
  `efface_a IS NULL` ; profil introuvable/effacé (UPDATE 0 ligne) → `{complete:false}` + aucune réconciliation.
- **Trou RGPD fermé (F2-seul)** : front `recevoirCertificat` — `jetonRectif===null && !posteEnA` → POST completion SANS jeton
  → endpoint cas 2 : `auMoinsUnConsentement(corps.consentements)` → `ingererProfil(corps, 'complet')` (crée + F2). Profil créé
  + F2 persisté.
- **Non-couplage** : `soumettre` `some(checked)===false` → `setSoumis` sans POST ; endpoint cas 3 (sans jeton + rien) → pas de
  profil, `{ok:true, cree:false}`.
- **IDOR** : `completion/route.ts` — id du `sub` du jeton (`verifierJetonRectification`), jamais du corps ; jeton fourni mais
  invalide → **401** (pas de doublon silencieux).
- **Migration** : `ADD COLUMN IF NOT EXISTS ... DEFAULT 'incomplet' CHECK(...)` — appliquée en local (8 lignes → 'incomplet'),
  ré-appliquée sans erreur (idempotente).
- **Admin** : `FicheDetail` — `parcoursComplet = i.parcours === 'complet'` → email ET tél en `--color-svv-green` / `-red` ;
  `parcours` remonté par `lireProfilComplet`.

## Vérifications de sortie (les 4)
- `npx tsc --noEmit` : **PASS** (exit 0).
- `npx eslint` : backend/admin (5 fichiers) = **0** ; `page.tsx` = **23 pré-existants** (aucun introduit ; preuve HEAD). Aucun `disable`.
- `npm test` : **PASS** — 86 fichiers, **1034 tests** (+6 `cycleVie` : réconciliation append-only + F1 hors scope), 21 skipped.
- `npm run test:integration` : **PASS** — 8 fichiers, 54 tests, **golden `29.107259068449615` bit-identique** (re-joué après corrections).

## Recon de validation (Phase 8) — VERDICT initial reviewer : MODIFIER → corrigé → **VALIDER**
Revue adversariale indépendante (sous-agent, 23 outils, schéma DB 023/028 vérifié, flux tracé front→endpoint→SQL→admin) :
les **8 invariants scellés A→J TENU** (trou RGPD F2-seul fermé, non-couplage de la création, append-only, IDOR, migration
additive), mais **4 constats** → verdict **MODIFIER**. **Les 3 corrigeables (1,2,3) ont été CORRIGÉS avant livraison** ; le 4ᵉ
(faible) est documenté.

**Constats — traités :**
1. **(MOYEN) Certificat bloqué sur échec de complétion** — `recevoirCertificat` retournait AVANT `setConfirme` sur toute
   erreur (401/503/réseau), à l'inverse de l'Écran A non-bloquant. **CORRIGÉ** : `recevoirCertificat` rendu NON-BLOQUANT
   (best-effort ; le certificat est délivré quoi qu'il arrive, `finally { setEnvoiRectif(false) }` puis `setConfirme(true)`) ;
   états morts `erreurRectif` retirés. Non-couplage certificat/enregistrement rétabli.
2. **(MOYEN) CAS 2 email pré-existant : réponse mensongère + coords non appliquées** — `ingererProfil` réutilise
   (`ON CONFLICT DO NOTHING`) → la réponse disait `cree:true`. **CORRIGÉ** : l'endpoint renvoie les **flags HONNÊTES**
   (`cree/complete = creeInternaute`). Choix SÛR (divergent de la suggestion du reviewer) : on **n'écrase PAS** les
   coordonnées d'un email réutilisé sans jeton (ce serait un IDOR — écrasement d'un tiers sans preuve de propriété) ; le
   comportement « B font foi » ne s'applique qu'aux profils dont on prouve la propriété (jeton). Limitation documentée (B1).
3. **(FAIBLE latent) Réconciliation pilotée par la liste client → retrait F1 accidentel possible** — **CORRIGÉ** :
   `completerParcours` prend désormais un `scope` (finalités PRÉSENTÉES à l'Écran B = F2 uniquement, `completion/route.ts`
   `SCOPE_ECRAN_B`). F1 (Écran A) n'est JAMAIS réconcilié en B → aucun retrait accidentel même si un futur client omettait F1.
   Nouveau test le prouve (souhaits vides + F1 actif → F1 intouché).
4. **(FAIBLE) Création CAS 2 non idempotente au double-submit** — fenêtre de course étroite ; couverte en nominal par
   `disabled={envoiRectif}` + bascule `confirme`. Une idempotence serveur (dédup projet) serait lourde → **NON corrigé, DOCUMENTÉ**
   comme limitation connue (durcissement possible ultérieur). Voir doute B4.

**VERDICT après corrections : VALIDER.** Règle scellée tenue dans tous les cas, non-couplage rétabli (certificat toujours
délivré), bloc B append-only + scope F2 (F1 protégé), coords de B font foi pour les profils prouvés (IDOR-safe sinon),
mécaniques F1 non généralisées, parcours ≠ verdict, migration additive/idempotente, golden inchangé, **0 problème eslint
introduit** (page.tsx toujours 23). Corrections re-vérifiées : tsc 0, eslint 0, `npm test` **1034** (+6 `cycleVie`), golden re-joué.

**Doutes non bloquants restants :** B1 (email réutilisé non re-confirmé en B — IDOR-safe), B2 (hypothèse de portage F1 —
désormais neutralisée par le `scope`), B3 (versionnage de preuve pre-lancement), **B4** (idempotence double-submit CAS 2).
