# RAPPORT DE BUILD — Tunnel : activation F2 (email marketing) + porte de création « au moins un consentement »

> Run `/svav-build` autonome. ZONE SENSIBLE (tunnel + ingestion + socle + RGPD). **Aucun commit** (livraison à Arno).
> Golden `29.107259068449615` **NON concerné** (aucun fichier moteur/pipeline/migration touché ; `config.ts` importé en
> LECTURE SEULE seulement). Chantier COUPLÉ : activer F2 **et** élargir la porte, livrés ensemble (sinon trou RGPD :
> un internaute F2-seul verrait son consentement recueilli mais jamais persisté).

## Fichiers touchés (6) — aucune migration
- **`app/lib/internaute/textesConsentement.ts`** — F2 `actifTunnel:true` ; `libelleCase` F2 (texte Arno exact) ; `contenu`
  F2 (mention définitive) ; nouveau champ optionnel `titre?` + `titre` F2 « Votre accord pour l'envoi de mails » ; retrait
  de la constante `AVERTISSEMENT` et de TOUTES les mentions « validation juriste »/« provisoire » (F1/F2/F3 + commentaires).
- **`app/lib/internaute/ingestion.ts`** — nouvelle fn pure `auMoinsUnConsentement(consentements) = length > 0` (PORTE) ;
  `consentementServicePresent` CONSERVÉE (désormais = recontactabilité F1, plus la porte), commentaire corrigé.
- **`app/lib/internaute/socle.ts`** — erreur renommée `ErreurConsentementServiceManquant → ErreurAucunConsentement` ;
  garde `ingererProfil` via `auMoinsUnConsentement`.
- **`app/api/internaute/route.ts`** — import + garde (`:32`) + message + `instanceof` + commentaire d'en-tête.
- **`app/page.tsx`** — garde front `soumettre` (`finalitesActivesTunnel().some(checked)`) ; retrait import `FINALITE_SERVICE` ;
  retrait bandeau « Texte provisoire — validation juriste requise » ; section consentement générique par-finalité (titre +
  mention pour F2) ; commentaires corrigés.
- **`app/lib/internaute/ingestion.test.ts`** — +7 tests (voir Preuves).

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — Le jeton de rectification reste lié à `creeInternaute` (nouveauté du dossier), PAS à F1 — un profil F2-seul en
obtient un.** La spec parlait du jeton comme « mécanique F1 ». En réalité (`socle.ts:getOrCreateInternaute`, `route.ts:45`),
le jeton est frappé si un NOUVEAU dossier est inséré (`creeInternaute`), jamais couplé à F1. Je n'y ai PAS touché : un
profil F2-seul nouvellement créé obtient donc un jeton lui permettant de rectifier SES PROPRES coordonnées — cohérent (il a
bien créé un dossier). Alternative écartée : restreindre le jeton à F1 (aurait empêché un créateur F2-seul de corriger son
email → régression). Impact : le jeton s'applique correctement à tout nouveau profil, sans « généraliser » une mécanique F1
(elle n'était pas F1-liée). `opposition_recontact` (opt-out téléphonique) reste F1-scopé (non touché, exploité F1 en extraction).

**A2 — Section consentement : rendu GÉNÉRIQUE par-finalité, F2 titrée, F1 inchangée, titre-ombrelle conservé.** La spec veut
un titre F2 « Votre accord pour l'envoi de mails » + mention, MAIS F1 est AUSSI active au tunnel → un titre F2 sur toute la
section aurait mal-étiqueté F1. Choix : ajouter un champ optionnel `titre?` au catalogue ; le rendu générique
(`finalitesActivesTunnel().map`) affiche, pour une finalité PORTANT un titre (F2), son `<h3>` + une mention encadrée (son
`contenu`) ; sinon (F1) la case seule (présentation INCHANGÉE). Le titre-ombrelle « Vos préférences de contact » est conservé.
Alternatives écartées : titre F2 sur toute la section (mal-étiquette F1) ; n'afficher que F2 (supprimerait la collecte F1).
Impact : F2 obtient son titre + mention ; F1 inchangée ; tout reste catalogue-driven (aucun texte en dur dans le JSX). Voir doute B2.

**A3 — Encadré de mention F2 en `bg-white border` (pas `bg-svv-field`).** L'encadré gris du certificat est `bg-svv-field` ;
or la SECTION consentement est déjà `bg-svv-field` → un encadré field-sur-field ne ressortirait pas. Inversé en blanc bordé
pour le contraste, en gardant le STYLE (rounded-xl, p-3, text-sm). Impact : cosmétique.

**A4 — Textes F2 `contenu` et nettoyage F1/F3 composés par l'agent.** Arno a fourni le `libelleCase` F2 EXACT ; le `contenu`
F2 (« Vous acceptez de recevoir les communications de l'application sansvisavis.com par email. Vous pouvez vous désinscrire à
tout moment. ») est une adaptation de la formule de l'encadré gris (version email). F1 `contenu` nettoyé (retrait `AVERTISSEMENT`
+ « (à confirmer selon la base légale retenue) ») ; F3 `contenu` nettoyé. Ces textes deviennent la PREUVE persistée (via
`assurerTexteConsentement`) → à valider par Arno. Alternative écartée : laisser les placeholders (Arno a demandé leur retrait).

**A5 — Erreur renommée `ErreurAucunConsentement` (sémantique « aucun consentement », plus « F1 manquant »).** Message « au
moins un consentement requis pour créer un profil ». `consentementServicePresent` CONSERVÉE (testée + utile = recontactabilité
F1), mais n'est plus la porte. Impact : honnêteté de nommage ; touche socle.ts + route.ts (périmètre).

## B. DOUTES

**B1 — VERSIONNAGE DE PREUVE (RGPD) : changement de `contenu` F1 v1 EN PLACE.** `assurerTexteConsentement` (`socle.ts:33-37`)
fait `INSERT … ON CONFLICT (finalite, version) DO NOTHING`. Donc, sur une base où (recontact_interne, 1) EXISTE déjà (des
dossiers dev en ont), changer le `contenu` F1 v1 au catalogue **ne met PAS à jour** la ligne persistée → la preuve stockée
garde l'ancien texte (avec AVERTISSEMENT) tandis que l'affichage montre le nouveau → **divergence preuve/affichage**.
ACCEPTABLE ICI car le module est **PRE-LANCEMENT** : textes placeholder jamais juridiquement contraignants, tunnel non
déployé, aucune preuve d'un VRAI utilisateur. F2 n'a JAMAIS été ingérée (`actifTunnel` était false) → aucune ligne F2 v1
existante → son nouveau texte s'insère proprement, sans divergence. ⚠️ **POST-LANCEMENT : figer les textes v1 et versionner
(v2) TOUTE modification, jamais en place.** Nettoyer les lignes dev divergentes exigerait un `DELETE` (interdit en autonome ;
données dev jetables) → non fait. À valider par Arno avant mise en ligne.

**B2 — Interprétation de la mise en page.** F1 et F2 sont toutes deux actives ; le titre demandé est F2-spécifique. J'ai
retenu : F1 minimale sous l'ombrelle « Vos préférences de contact », F2 en sous-bloc titré. Si Arno voulait un autre
agencement (F1 masquée, ou section 100 % F2), ajustement d'affichage simple.

## C. ÉCARTS DE CONFORMITÉ
- **GOLDEN** : `test:integration` **8 fichiers / 54 tests PASS**, golden `29.107259068449615` **bit-identique** (aucun fichier
  moteur/pipeline/migration ; `git status` = 6 fichiers internaute/tunnel).
- **RGPD** : consentement AVANT persistance PRÉSERVÉ (porte = au moins un consentement) ; **trou F2-seul FERMÉ** ; anti-forge
  intact (`validerCorpsIngestion`/`texteExiste` inchangés, en amont de la porte) ; bloc B append-only intact
  (`insererConsentement` générique inchangé) ; opt-out F1 (`opposition_recontact`) NON généralisé.
- **VERDICT DÉCOUPLÉ / CONFIG / ST_Force2D / HAUTEUR / GEMINI** : non concernés (aucun calcul, aucune constante moteur).
- ⚠️ **ESLINT PRÉ-EXISTANT sur `app/page.tsx`** : `app/page.tsx` porte **23 problèmes eslint (19 erreurs, 4 warnings)
  PRÉ-EXISTANTS** — PROUVÉ en lintant la version HEAD (copie) : **compte identique** avant/après mes changements. AUCUN des
  23 signalements ne tombe dans mes régions modifiées (16, 798, 817-824, 1359-1385) → **mes changements n'introduisent ZÉRO
  problème eslint**. `page.tsx` est un fichier legacy connu (SPA tunnel, effets d'animation) ; corriger ses 19 erreurs
  pré-existantes est HORS PÉRIMÈTRE et risqué (zone tunnel sensible). Mes fichiers `lib/`/`api/` lintent à 0.

## Preuves
- **Porte élargie (tests, +7)** : `auMoinsUnConsentement` — F1 seul → true, **F2 SEUL → true** (trou fermé), F1+F2 → true,
  **AUCUN → false** ; `consentementServicePresent` reste « F1 présent » (recontactabilité) ; `finalitesActivesTunnel()` =
  `['recontact_interne', 'email_marketing']` ; F2 v1 `texteExiste` ; F2 porte un `titre` ; **aucun texte du catalogue ne
  contient « juriste » ni « provisoire »**.
- **Trou RGPD fermé (chemin F2-seul)** : front `finalitesActivesTunnel().some(checked)` (page.tsx `soumettre`) → true → POST ;
  route `auMoinsUnConsentement` (`:32`) → true ; socle `ingererProfil` `auMoinsUnConsentement` (`:111`) → `insererConsentement`
  **en boucle sur TOUS les consentements** (`socle.ts:114-117`) → F2 inséré (`etat='accorde'`, `canal='tunnel'`, `texte_id`
  matérialisé). Profil CRÉÉ + F2 PERSISTÉ.
- **Non-couplage** : aucun coché → `some(checked)` false → `setSoumis(true)` sans POST → certificat affiché, **aucun profil**.
- **Non-régression F1** : F1 seul → porte true → profil créé + jeton (`creeInternaute`).
- **F1-spécifiques non généralisées** : jeton = `creeInternaute` (inchangé) ; `opposition_recontact` non touché.
- **F2 actif, décoché par défaut** : `actifTunnel:true` (catalogue) ; état `consentements` init tout `false` (`page.tsx:776`) ;
  libellé = `t.libelleCase` (catalogue), jamais en dur.
- **Périmètre** : `git status` = 6 fichiers ; aucun moteur/migration.

## Vérifications de sortie (les 4)
- `npx tsc --noEmit` : **PASS** (exit 0).
- `npx eslint` : **mes 5 fichiers lib/api/test = 0 problème** ; `app/page.tsx` = **23 problèmes PRÉ-EXISTANTS** (identiques à
  HEAD, aucun dans mes régions — preuve ci-dessus). Aucun `eslint-disable` ajouté.
- `npm test` : **PASS** — 85 fichiers, **1028 tests** (+7), 21 skipped.
- `npm run test:integration` : **PASS** — 8 fichiers, 54 tests, **golden `29.107259068449615` bit-identique**.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Revue adversariale indépendante (sous-agent, 21 outils, périmètre + chemins DB re-tracés) → **VALIDER (réserve documentaire H)**.
Les 9 invariants A→I TENU, prouvés fichier:ligne :
- **A** porte cohérente aux 4 niveaux (front `page.tsx:823`, route `:32`, socle `:111`, fn `ingestion.ts:208`), aucune garde
  F1-only résiduelle ; **B** trou F2-seul FERMÉ du front à l'INSERT (`socle.ts:114` boucle générique, FK 023 accepte F2) ;
  **C** non-couplage (aucun coché → `setSoumis` sans POST) ; **D** jeton = `creeInternaute` (pas F1) + `opposition_recontact`
  F1-scopé intacts ; **E** anti-forge `texteExiste` en amont de la porte ; **F** F2 opt-in strict, libellé catalogue, rendu
  générique ; **G** zéro mention juriste (grep) ; **I** périmètre/golden/append-only intacts.

**3 constats du reviewer :**
1. **(Risque H) = doute B1** — édition en place du `contenu` F1 v1 vs `ON CONFLICT DO NOTHING` : divergence preuve possible si
   des lignes v1 étaient déjà matérialisées. **Acceptable pre-lancement** (placeholder non contraignant) ; **à figer avant
   go-live** (toute modif de texte déjà persistable = nouvelle version). Aucun correctif code (pre-lancement) ; point RGPD
   prioritaire pour Arno.
2. **(Cosmétique)** commentaire `route.ts:14` — le reviewer le juge CORRECT (parle de la persistance nominative, pas du
   certificat) ; **aucun changement requis**. Laissé tel quel.
3. **(Observation, non-bug)** un profil F2-seul obtient un jeton de rectification — COHÉRENT (capacité sur ses propres
   données, pas de fuite ; fermeture collision email intacte). Déjà tracé en décision A1.

Aucun bug ne nécessite de correctif. Écart C documenté : eslint `page.tsx` pré-existant (23 problèmes identiques à HEAD),
non introduit par ce lot.
