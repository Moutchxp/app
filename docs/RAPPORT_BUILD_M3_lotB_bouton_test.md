# RAPPORT DE BUILD — Module Internaute, LOT B : bouton « Test » → rejeu au Banc de test M5

> Run `/svav-build` autonome. **Aucun commit** (livraison à Arno). Golden `29.107259068449615` **NON concerné**
> (aucun fichier moteur/score/pipeline/migration/ingestion/tunnel touché) — re-joué et **bit-identique** malgré tout.
> Le bouton transporte les grandeurs géométriques d'un dossier `internaute_projet` vers le banc M5, sans ressaisie,
> via sessionStorage (jamais l'URL). Pré-requis d'exécution réelle : migration 026 appliquée (colonnes de visée).

## Fichiers touchés (4)
- **`app/lib/internaute/pontProjetBanc.ts`** (NOUVEAU, pur & client-safe) — POINT DE CORRESPONDANCE UNIQUE
  `internaute_projet → SaisieBanc` : `projetVersSaisieBanc` (coercition `Number` finie de `azimut_deg`/`hauteur_sous_plafond_m`,
  garde azimut NULL → `null`, mode forcé `semi_auto`) ; `parseHandoff` défensif ; I/O sessionStorage gardées `typeof window`
  (`ecrireHandoffBanc`/`lireHandoffBanc`/`viderHandoffBanc`) ; clé versionnée `svv.banc.rejeu.v1` ; point d'extension photo DOCUMENTÉ.
- **`app/lib/internaute/pontProjetBanc.test.ts`** (NOUVEAU, +14 tests) — voir Preuves.
- **`app/(admin)/admin/(protected)/internautes/InternautesVue.tsx`** — composant `BoutonTestProjet` (useRouter, désactivé
  si non rejouable, écrit le handoff + `router.push('/admin/banc-test')`) ; prop `actionsProjet?(projet)→ReactNode` rendue
  DANS `detail.projets.map` ; branchée aux **2** appels de `FicheDetail` (commercial `:506` + Vérification `:1169`).
- **`app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx`** — effet de montage qui lit le handoff, pré-remplit les 6 setters,
  vide la clé (import `lireHandoffBanc`/`viderHandoffBanc`).

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — Lecture du handoff dans `BancSaisie`, PAS dans `page.tsx`.** La spec listait `banc-test/page.tsx` pour « lecture
sessionStorage au montage ». Or `page.tsx` est un **Server Component** (aucun `"use client"`) : `sessionStorage` (API navigateur)
y est indisponible. Choix : faire la lecture dans `BancSaisie` (déjà client, détient les ~15 `useState` et leurs setters) ;
`page.tsx` reste **inchangé**. Alternative écartée : convertir `page.tsx` en client + passer un prop → convertit un Server en
Client Component et ajoute une 2ᵉ couche d'effet pour la même robustesse. Impact : la logique de handoff est colocalisée avec
l'état qu'elle amorce ; la spec autorisait explicitement `BancSaisie` « si nécessaire » — c'était nécessaire.

**A2 — Pré-remplissage SEUL, PAS de lancement automatique du test.** La spec dit « pré-remplir et lancer le Banc de test M5 »
et « le banc rejoue l'analyse ». Interprétation : « lancer le Banc de test » = **ouvrir la page du banc pré-remplie** ;
l'opérateur clique lui-même « Lancer le test ». Raisons : (1) l'intrant `parametres` du banc reste `null` tant que la
validation asynchrone `/api/origine` (débounce 300 ms + réseau) n'a pas abouti → un run auto au montage **courserait** cette
validation et échouerait ; (2) le texte du mécanisme de handoff s'arrête à « pré-remplit sa saisie, PUIS vide la clé » — pas
de run auto ; (3) « l'utilisateur ne saisit rien » = aucune **saisie** (atteint), pas « aucun clic ». Alternative écartée :
run auto dès la validation OK (état + drapeau supplémentaires, course, risque dans un composant dense). Impact : un clic de
plus (« Lancer le test »), pour un rejeu robuste. Si Arno veut un vrai run auto, c'est un lot de suivi.

**A3 — Libellé du bouton « Tester dans le banc » (la spec écrivait « Test »).** Choisi plus explicite pour un opérateur
non-développeur. Alternative écartée : « Test » littéral (cryptique). Impact : cosmétique.

**A4 — `hauteur_sous_plafond_m` et `etage` NULL → repli (pas de blocage), garde limitée à `azimut_deg`.** La spec ne pose la
garde de désactivation que sur `azimut_deg` NULL. Pour les deux autres colonnes nullable : `etage` NULL → `0` (RDC) ;
`hauteur_sous_plafond_m` NULL/≤0 → défaut **2,50 m** (même repli que `config.hauteurVision`, jamais 0 m). Alternative écartée :
bloquer aussi sur ces NULL. Impact : un dossier post-026 auquel il manquerait seulement la hauteur reste rejouable avec le
défaut standard — exactement ce que ferait le tunnel. `azimut_deg` reste le SEUL discriminant de rejouabilité (un axe manquant
n'a pas de valeur de repli acceptable).

**A5 — Le handoff transporte le GÉOMÉTRIQUE seul ; l'adresse est re-dérivée par géocodage inverse.** Les 5 grandeurs de calcul
sont géométriques ; le banc reverse-géocode déjà un libellé d'adresse depuis le point. Je n'ai donc PAS transporté
`adresse_normalisee`. Alternative écartée : passer aussi le libellé stocké. Impact : le banc affiche le libellé reverse
(peut différer légèrement de `adresse_normalisee`) ; **aucun effet sur le calcul** ; moins de donnée nominative en sessionStorage.

**A6 — Mécanique de l'effet : `setState` différés (`setTimeout 0`) + vidage de la clé DANS le callback différé.** Non spécifié.
Choix dicté par (a) la règle lint `react-hooks/set-state-in-effect` (le fichier proscrit déjà tout `setState` synchrone dans un
effet) et (b) la robustesse sous React **StrictMode** (double-invocation des effets en dev) : en vidant la clé APRÈS application
dans le callback, une passe annulée par le cleanup laisse la clé **intacte** pour la re-passe → pré-remplissage fiable.
Alternative écartée : `setState` synchrone + `eslint-disable` (fragile/StrictMode, ou disable non désiré). Impact : délai d'un
tick imperceptible avant remplissage ; aucun `eslint-disable`.

## B. DOUTES

**B1 — Fidélité du rejeu si l'analyse d'origine a été faite en mode `manuel`.** Le point stocké (`lat`/`lon`) est **BRUT**
(pré-snap) et le **mode d'origine n'est PAS persisté** (aucune colonne `mode` en 023/026). La prod analyse par **défaut** en
`semi_auto` (snap façade) : rejouer en `semi_auto` reproduit donc fidèlement le **cas par défaut**. MAIS si un internaute avait
été analysé en `manuel` (le point exact, sans snap), le rejeu `semi_auto` **snapperait** le point → géométrie différente →
le seuil 40 m pourrait basculer. Décision retenue (arbitrage explicite d'Arno dans la commande) : **`semi_auto` par défaut**,
fidèle au cas majoritaire. Reste à valider par Arno : le mode `manuel` est-il réellement atteignable dans le **tunnel public** ?
Si oui, faut-il persister le `mode` à l'ingestion (migration + ingestion = HORS périmètre de ce lot) pour un rejeu 100 % fidèle ?
Tant que non tranché, le rejeu est fidèle pour tout profil analysé en `semi_auto`, incertain pour un éventuel profil `manuel`.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Batterie de conformité (Phase 6) :
- **GOLDEN** : `test:integration` **8 fichiers / 54 tests PASS**, golden `29.107259068449615` **bit-identique** (aucun fichier du
  chemin de calcul touché — `git status` = 2 fichiers front admin + 1 lib pur + 1 test).
- **VERDICT DÉCOUPLÉ** : le lot ne touche NI le verdict NI le score ; il ne fait que **ré-alimenter** un intrant du banc, lequel
  réutilise le moteur pur inchangé. Aucune porte photo→verdict (le handoff est géométrique ; point d'extension photo documenté
  mais **non câblé**, avec rappel « photo = Famille 2 du score uniquement, jamais le verdict »).
- **CONFIG EXTERNALISÉE** : aucune nouvelle variable de moteur (aucune constante de score introduite ; le mode `semi_auto` est un
  intrant d'analyse, pas une pondération).
- **ST_Force2D / HAUTEUR DE VISION** : non concernés (aucune opération distance/raster, aucune formule de hauteur touchée ; la
  hauteur transite en intrant brut, coercée `Number`).
- **RGPD — ÉTANCHÉITÉ DU PANNEAU DE VÉRIFICATION** : le bouton Test passe par la prop **DISTINCTE** `actionsProjet`, fournie aux
  deux fiches ; `actions` (Rectifier/Effacer) reste EXCLUSIVEMENT sur la fiche commerciale (`:507`). Le panneau « Vérification »
  (`:1169`) reçoit `actionsProjet` mais **jamais** `actions` → aucune action destructive ne fuite dans le read-only. **Aucune
  suppression de données**, aucune persistance nouvelle (le transport est éphémère, en sessionStorage, consommé une fois).
- **AUCUNE POSITION DANS L'URL** : transport sessionStorage ; navigation `router.push('/admin/banc-test')` sans query. Aucune
  lat/lon/azimut en historique ni logs.
- **GEMINI** : `adaptateurIaPhoto.ts` / `analyse-photo/route.ts` non touchés.

## Preuves (tests purs — 14, tous PASS)
- **Coercition pg** : `azimut_deg:"90"` → `90` (number) ; `hauteur_sous_plafond_m:"2.8"` → `2.8` (number). Aucune chaîne ne fuit
  vers le banc.
- **Garde azimut NULL/undefined/""** → `projetVersSaisieBanc` renvoie **`null`** (bouton désactivé, 400 impossible). `azimut:"0"`
  reste **rejouable** (0 est un azimut valide, pas une absence).
- **Repli hauteur** : `null`/`"0"` → défaut **2,50 m** (jamais 0 m). **etage** `null` → `0`, reste rejouable.
- **Mode** : TOUJOURS `semi_auto`, même si le projet portait par erreur `mode:"manuel"`.
- **lat/lon** : pleine précision préservée (`48.90693182287072` / `2.269431435588249`), aucun arrondi.
- **Compat ascendante** : champ inconnu (`paysage`, `photo_url`, `champ_futur`) **ignoré** sans erreur ; la forme de sortie reste
  strictement géométrique (aucune clé parasite).
- **`parseHandoff`** : round-trip valide ; JSON corrompu / point absent / azimut non numérique → **`null`** (jamais d'intrant partiel).

## Self-review adversariale (invariants A→H — tous TENUS, prouvés fichier:ligne)
- **A. Étanchéité RGPD** : Vérification `:1169` = `actionsProjet` seul, jamais `actions` ; commercial `:506-507` = les deux. Les 2
  seuls appels de `FicheDetail`. **TENU.**
- **B. Coercition** : `pontProjetBanc.ts` `nombreFini` (`Number` + `Number.isFinite`) sur azimut/hauteur ; 14 tests. **TENU.**
- **C. Pas d'URL** : unique navigation `InternautesVue.tsx:928` `router.push('/admin/banc-test')`, sans query. **TENU.**
- **D. Garde azimut NULL** : `:917-918` `saisie=projetVersSaisieBanc(...); rejouable=saisie!==null` ; `:922 disabled` ; `:926 if(!saisie) return`. **TENU.**
- **E. Fidélité mode** : mapping impose `mode:"semi_auto"` (testé). **TENU.**
- **F. Moteur/golden** : `git status` = 4 fichiers (2 front admin, 1 lib pur, 1 test) ; 0 fichier moteur/migration/ingestion ; golden 54/54. **TENU.**
- **G. Montage** : effet lit au montage (client, post-hydratation → pas de SSR/mismatch), `setState` différés (`setTimeout 0`),
  vidage APRÈS application → StrictMode-safe (passe annulée = clé intacte pour la re-passe). **TENU.**
- **H. Robustesse** : `parseHandoff` try/catch (corrompu → null), champ inconnu ignoré, imports résolus (tsc 0), zéro dépendance ajoutée. **TENU.**

## Vérifications de sortie (les 4)
- `npx tsc --noEmit` : **PASS** (exit 0).
- `npx eslint` (4 fichiers) : **PASS** (0 problème ; règle `set-state-in-effect` respectée par différé, aucun disable).
- `npm test` : **PASS** — 83 fichiers, **1005 tests** (+14), 21 skipped.
- `npm run test:integration` : **PASS** — 8 fichiers, 54 tests, **golden bit-identique**.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Aucun écart de conformité, aucun doute **bloquant**. Un seul doute non-bloquant (B1, fidélité du mode `manuel`) déjà tranché par
Arno (`semi_auto` par défaut) et documenté ; sa régularisation éventuelle (persister le `mode`) relève d'un lot ingestion futur,
hors périmètre. Le golden est prouvé inchangé, l'étanchéité RGPD du panneau de contrôle est préservée, aucune position ne
transite par l'URL, et le bouton se désactive proprement sur les dossiers non rejouables.
