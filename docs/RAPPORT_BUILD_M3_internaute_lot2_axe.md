# RAPPORT DE BUILD — Module Internaute, LOT 2/5 : axe de finalité exposé (F2/F3 exportables)

> Run `/svav-build` autonome. Aucun commit (livraison à Arno). Golden `29.107259068449615` non concerné (module
> cloisonné, aucun fichier moteur touché). Objectif : rendre l'axe d'extraction (F1/F2/F3) choisissable côté admin,
> chaque axe borné STRICTEMENT à son consentement (jamais un OR, jamais un F1-only dans un export F2/F3).

## Fichiers touchés (6)
- `app/lib/internaute/extraction.ts` — `clauseFromInvariant` (opposition par-axe), `AXES_EXPORT`, `lireAxe` (pur).
- `app/lib/internaute/extractionRepo.ts` — `journaliserExtraction` trace l'axe (accountability).
- `app/(admin)/api/admin/internautes/route.ts` — liste : parse `axe`, le passe à `lireProfilsFiltres`.
- `app/(admin)/api/admin/internautes/export/route.ts` — export : parse `axe`, `lireProfilsExport(filtres, axe)` + journal.
- `app/(admin)/admin/(protected)/internautes/InternautesVue.tsx` — sélecteur d'axe, `hrefExport`, restricteurs, libellés.
- `app/lib/internaute/extraction.test.ts` — tests d'étanchéité par axe + `lireAxe`/`AXES_EXPORT` (mise à jour du test Lot 1).

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno en priorité)

**A1 — `opposition_recontact` déplacé dans `clauseFromInvariant` (extraction.ts), pas seulement le parsing.**
La contrainte du lot (« opposition_recontact ne s'applique qu'à l'axe F1 ») vit dans `clauseFromInvariant` (fichier
Lot 1), que le périmètre ne listait pas explicitement (il listait `lireFiltres`). Sans ce changement, un export
axe F2 exclurait à tort les personnes ayant refusé le recontact téléphonique mais consenti à l'email. Décision :
rendre l'opt-out conditionnel à l'axe F1 dans `clauseFromInvariant`. Alternative écartée : laisser opposition
partout (→ faux négatifs sur F2/F3). Impact : le test Lot 1 « axe F2 = F1.replace(finalité) » devient faux (F2
n'a plus la ligne opposition) → **test mis à jour** (le chemin F1 par défaut reste byte-identique, prouvé par un
test conservé). Non-régression F1 garantie (`opposition_recontact = false AND efface_a IS NULL` inchangé sur F1).

**A2 — `recents` / `verification.ts` DÉLIBÉRÉMENT NON modifiés (périmètre réduit).**
Le périmètre « autorisait » la route `recents`, mais : (a) elle appelle `verification.ts` (outil de CONTRÔLE
technique, `verification.ts:5-9` le sépare explicitement de l'export commercial), pas les fonctions du Lot 1 ;
(b) la rendre axis-aware imposerait de renommer le drapeau `f1_actif` (type `LigneRecent` + UI « Consentants F1 »,
« F1 ✓/✗ ») → cascade hors objectif ; (c) parser un `axe` que le panneau n'envoie pas = code mort. Décision :
livrer l'axe sur liste + export (l'OBJECTIF « F2/F3 exportables »), différer le panneau de vérification à un lot
ultérieur (plus pertinent quand des profils F2-only existeront, lots 3-4). Alternative écartée : forcer l'axe dans
`verification.ts` (risque + code mort, sans harnais d'intégration pour le vérifier). Impact : le panneau de
vérification reste identique (modes f1/tous), donc aucune régression ; capacité manquante = voir les non-F1 dans le
contrôle technique (non requis à ce stade).

**A3 — Accountability : l'axe est journalisé dans le blob jsonb `filtres` (pas de colonne dédiée).**
Le périmètre interdit toute migration ; or un export F1 et un export F3 étaient indistinguables au journal (même
`filtres`). Décision : `journaliserExtraction` fusionne `{ ...filtres, axe }` dans la colonne jsonb existante →
l'audit distingue les populations exportées sans migration. Alternative écartée : colonne `axe` dédiée (migration,
hors périmètre). Impact : `acces_profil` (qui ne passe pas d'axe) reste strictement inchangé (blob = filtres seuls
ou NULL).

**A4 — Modèle UI : axe = sélecteur de POPULATION séparé des filtres WHERE ; restricteur redondant masqué + nettoyé.**
La spec ne précisait pas l'ergonomie. Décisions (bonnes pratiques) : (1) l'axe est un état séparé appliqué
immédiatement (re-fetch), pas un filtre « Filtrer » ; (2) la case « aussi Fx » dont la finalité EST l'axe courant
est masquée (redondante avec le JOIN d'axe) ET son état est remis à false sur changement d'axe (`changerAxe`), pour
qu'aucun restricteur ne joue « en sourdine ». Alternative écartée : garder les 2 cases toujours visibles (redondance
inoffensive mais confuse). Impact : purement UI ; le serveur reste l'unique autorité d'étanchéité. Limite connue :
il n'existe pas de restricteur « aussi F1 » (pas de flag `aF1`), donc axe=F2 ne peut pas offrir « aussi F1 » — non
requis à ce stade (lot 3+).

**A5 — `AXES_EXPORT` porte les libellés `code` (F1/F2/F3) et `libelle` (« Recontact (F1) », etc.).**
Les clés d'axe dérivent de `FINALITES_SEED` (aucune clé re-hardcodée) ; les codes/libellés d'affichage sont définis
dans `AXES_EXPORT`. Duplication mineure des codes F1/F2/F3 (déjà présents dans `libelleFinalite.ts`) assumée pour
éviter un couplage inter-fichiers dans ce lot. Alternative écartée : exporter `codeFinalite` depuis
`libelleFinalite.ts` (touche un fichier de plus). Impact : nul (constantes d'affichage).

## B. DOUTES

**B1 — Preuve d'étanchéité au niveau CONSTRUCTION SQL, pas au niveau DB.**
Aucun harnais d'intégration internaute n'existe (les `*.itest.ts` couvrent svv/db/analytics, pas internaute). La
preuve « un export axe F2 ne contient QUE des consentants F2 » est donc apportée par tests PURS sur la chaîne SQL
générée : INNER JOIN sur `ca.finalite = '<axe>' AND ca.actif = true`, absence de `LEFT JOIN` sur cette finalité,
clauses additionnelles toutes en AND, zéro `OR`. C'est structurellement suffisant (un INNER JOIN sur la finalité de
l'axe écarte tout profil sans consentement actif à cet axe). Un test DE DONNÉES (semer un F1-only + un F1+F2,
exporter axe F2, vérifier que seul le second remonte) exigerait de CONSTRUIRE un harnais d'intégration internaute
→ recommandé pour un lot ultérieur, non bloquant ici. La revue adversariale a confirmé la propriété via la vue
`internaute_consentement_actif` (`023:126-134` : `DISTINCT ON (internaute, finalité)`, `actif = dernière décision
'accorde'`) → 1 ligne/personne/finalité, l'INNER JOIN écarte bien un F1-only face à F2, sans duplication.

**B2 — Picker géographique non filtré par axe (remarque du reviewer, non bloquant, DIFFÉRÉ).**
`lireCommunesPresentes` accepte l'axe (défaut F1) mais la route `communes/route.ts` l'appelle sans axe → le
sélecteur département→commune liste les communes présentes chez les consentants F1, même sous un axe F2/F3.
**Aucune fuite** (le filtre géo est un `AND … IN (...)` restrictif ; l'export reste borné par l'INNER JOIN d'axe) —
c'est une COMPLÉTUDE de picker, pas une étanchéité. Un fix correct exige DEUX changements coordonnés : (a)
`communes/route.ts` parse+passe l'axe, ET (b) le front re-fetch `communesRef` à chaque changement d'axe (aujourd'hui
fetché une seule fois au montage, avec l'axe F1 par défaut). Décision : DIFFÉRER — c'est **sans effet observable
aujourd'hui** (aucun profil F2-only n'existe → communes F2 ⊆ communes F1) et hors du périmètre listé (`communes`
n'y figurait pas) ; un demi-fix (route seule) serait inutile car le front n'enverrait jamais d'axe ≠ F1 au montage.
À traiter au lot 3-4, quand des profils propres à F2/F3 existeront.

## C. ÉCARTS DE CONFORMITÉ

Aucun. Batterie de conformité :
- GOLDEN : `npm run test:integration` → 8 fichiers / 54 tests PASS, golden `29.107259068449615` inchangé (module
  cloisonné, aucun fichier moteur touché — vérifié par `git diff --name-only`).
- VERDICT DÉCOUPLÉ : n/a (aucun chemin verdict/score/photo touché).
- CONFIG EXTERNALISÉE : n/a (aucune variable de moteur ajoutée ; l'axe est une dimension de lecture, pas une pondération).
- RGPD : consentement AVANT persistance INCHANGÉ (ingestion/socle non touchés → création reste F1-only) ; effacement
  asymétrique + purge non touchés (déjà agnostiques) ; étanchéité par axe renforcée (INNER JOIN) ; accountability de
  l'axe ajoutée au journal. Aucune donnée supprimée/écrasée.
- GEMINI : non touchés. Fichiers gelés (password/motDePasse/proxy/garde) : non touchés. Aucune migration.

## Preuve d'ÉTANCHÉITÉ par axe (résumé)
`clauseFromInvariant('email_marketing')` produit `FROM internaute i JOIN internaute_consentement_actif ca ON
ca.finalite = 'email_marketing' AND ca.actif = true …` — un **INNER JOIN** : un profil sans consentement actif
email_marketing (p. ex. un F1-only) est **écarté par la jointure**. `construireFiltres` n'ajoute que des clauses
`AND` (dont les `EXISTS(finalité)` restrictifs). Aucun `OR` n'est jamais produit (test `not.toMatch(/\bOR\b/)`).
`lireAxe` valide l'axe contre les 3 finalités connues → tout axe absent/inconnu/forgé retombe sur F1 ; combiné à la
garde `[a-z0-9_]+` de `clauseFromInvariant`, l'injection SQL est structurellement impossible.

## Vérifications (les 4 exigées)
- `npx tsc --noEmit` : PASS (exit 0).
- `npx eslint` (6 fichiers touchés) : PASS (0 problème).
- `npm test` : PASS — 81 fichiers, 976 tests (+7 vs Lot 1), 21 skipped.
- `npm run test:integration` : PASS — 54 tests, golden bit-identique.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Revue adversariale indépendante (sous-agent, analyse statique des 6 fichiers + vue SQL + tests + git HEAD), 6 axes
d'attaque : INJECTION, ÉTANCHÉITÉ/OR, opposition_recontact, RÉGRESSION F1, UI-vs-serveur, divers.
- **INJECTION — SÛR** : `axe` interpolé (jamais lié `$n` → placeholders des filtres non décalés) mais doublement
  gardé (ensemble fermé `AXES_VALIDES` dans `lireAxe`, + regex `[a-z0-9_]+` throw dans `clauseFromInvariant`).
- **ÉTANCHÉITÉ/OR — SÛR** : INNER JOIN sur la finalité de l'axe via la vue (1 ligne/personne/finalité) → un F1-only
  face à F2 est écarté ; restricteurs `aF2/aF3` exclusivement en `AND EXISTS(...)` ; aucun `OR`.
- **opposition_recontact — SÛR** : conditionnel `axe === AXE_DEFAUT` (F1 seul) ; `efface_a IS NULL` hors du
  conditionnel → présent sur TOUS les axes.
- **RÉGRESSION F1 — SÛR** : clause WHERE générée pour F1 **byte-à-byte identique** à HEAD (comparaison faite) ;
  signatures rétro-compatibles (`axe` optionnel en dernière position).
- **UI-vs-serveur — SÛR** : serveur autorité ; `changerAxe` nettoie le restricteur redondant (état appliqué +
  brouillon) ; même un `aF2/aF3` « en sourdine » ne peut que RESTREINDRE (AND EXISTS), jamais élargir.
- **Divers — SÛR** : `lireAxe` → F1 pour absent/vide/inconnu/forgé ; `journaliserExtraction('acces_profil')`
  inchangé (blob NULL).

Deux remarques non bloquantes du reviewer : (1) picker géo non filtré par axe → tracé en **B2** (différé, sans
fuite, sans effet aujourd'hui) ; (2) note de contexte : au HEAD, `opposition_recontact` était appliqué
inconditionnellement (latent car seul F1 était invoqué) — ce lot corrige ce défaut en ouvrant F2/F3. **Rien à
corriger.**
