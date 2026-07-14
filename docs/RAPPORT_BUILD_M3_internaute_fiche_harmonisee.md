# RAPPORT DE BUILD — Module Internaute : harmonisation des 2 fiches détail (composant `FicheDetail` partagé)

> Run `/svav-build` autonome. Aucun commit (livraison à Arno). Purement AFFICHAGE admin. Golden `29.107259068449615`
> NON concerné (aucun fichier moteur/route/extraction/ingestion/migration touché). **Un seul fichier modifié :
> `app/(admin)/admin/(protected)/internautes/InternautesVue.tsx`** (net −8 lignes : la déduplication réduit le code).

## Ce qui a été fait
- **Extraction d'un composant partagé UNIQUE `FicheDetail({ detail, actions? })`** (remplace l'ancien `DetailComplet`),
  reprenant la FORME RICHE du bloc haut (analyses groupées « Le bien » / « Verdict et score », labels FR, valeurs
  formatées, azimut/hauteurs). Appelé aux **deux** endroits :
  - Bloc « moteur de recherche » (`detailPanel`) : `<FicheDetail detail={detail} actions={…Rectifier/Effacer…} />`.
  - Bloc « Vérification » (`PanneauVerification`) : `<FicheDetail detail={detail} />` — **prop `actions` OMISE**.
- **En-tête refondu** (aux 2 endroits) : « prénom (poids NORMAL) NOM (GRAS) » sur la même ligne ; **téléphone puis
  email sur DEUX lignes séparées** (fini « email · téléphone ») ; méta « Créé le {date+heure} · Source : {source} ».
- **Union du contenu** : « Source de collecte » (venait de la vérification) ET azimut/hauteur sous plafond/hauteur de
  vision (venaient du bloc haut) sont désormais présents PARTOUT ; catch-all `autres.map` conservé → aucune clé
  payload masquée. Forme FORMATÉE (FR) partout (fini les valeurs/clés brutes de l'ancien `DetailComplet`).
- **Note d'effacement** (« Profil effacé le … ») déplacée dans `FicheDetail` (INFORMATIVE, pas une action) → visible
  aux 2 endroits ; les **boutons** d'action restent exclusivement dans la prop `actions` (bloc haut).
- **Titre** renommé : « Vérification — derniers internautes » → **« Vérification — 10 derniers internautes en base »**.
- `DetailComplet` supprimé.

## A. DÉCISIONS HORS-SPECS
**A1 — Note « Profil effacé » portée par `FicheDetail` (pas par la prop `actions`).** La spec ne précisait pas où la
placer. Choix : c'est une info (pas une action) → dans le composant partagé, visible aux 2 endroits (améliore le
contexte côté Vérification, qui ne l'affichait pas). Les boutons d'action restent, eux, dans `actions` (bloc haut).
Alternative écartée : tout le bloc efface_a dans `actions` (la Vérification perdrait la note). Impact : la Vérification
affiche désormais la note d'effacement — cohérent avec « union du contenu ».

**A2 — Téléphone AVANT email dans l'en-tête.** La spec laissait le choix de l'ordre. Choix : téléphone puis email
(l'énoncé cite « téléphone et email »). Impact : cosmétique.

**A3 — « Source de collecte » affichée en ligne méta de l'en-tête** (`Créé le … · Source : …`), pas en `Champ`
labellisé d'une section « Identité ». Choix : l'en-tête porte l'identité (nom/tél/email/créé/source), le corps porte
consentements + analyses → pas de section « Identité (saisie) » redondante. Impact : « Source de collecte » n'est
plus masquée nulle part (présente aux 2 endroits) ; forme légèrement différente de l'ancien `Champ`.

**A4 — Adresse dédupliquée (pas perdue).** La forme riche affiche « Adresse du bien » (= normalisée) + « Adresse
saisie » UNIQUEMENT si différente (l'ancien `DetailComplet` affichait les deux systématiquement). Aucune donnée
perdue : l'adresse saisie apparaît quand elle diffère ; identique, elle est simplement non redondée.

**A5 — Composant gardé DANS `InternautesVue.tsx`** (pas de nouveau fichier). Choix : les helpers (`Champ`, `dateFr`,
`dateHeureFr`, `verdictFr`, `labelPayload`) sont module-level dans ce fichier ; extraire `FicheDetail` dans un fichier
séparé imposerait de déplacer/importer ces helpers (churn inutile). La spec autorisait un nouveau fichier mais ne
l'imposait pas.

## B. DOUTES
**B1 — La Vérification perd la vue « clés payload BRUTES ».** L'ancien `DetailComplet` (outil de contrôle technique)
affichait les clés payload telles quelles (`label={k}`). `FicheDetail` utilise `labelPayload(k)` (= libellé FR si
connu, SINON la clé brute `k`). Donc aucune clé n'est masquée — une clé inconnue s'affiche toujours avec son nom
brut. La spec demandait explicitement « forme FORMATÉE partout ». Impact jugé nul (complétude technique préservée).

## C. ÉCARTS DE CONFORMITÉ
Aucun.
- GOLDEN : `test:integration` 8/54 PASS, golden `29.107259068449615` inchangé (aucun fichier moteur touché).
- RGPD : **invariant read-only du panneau Vérification PRÉSERVÉ** — `FicheDetail` ne contient AUCUN bouton d'action
  en dur (seulement `{actions}`) ; la Vérification omet `actions` → zéro action possible. La porte de création
  (ingestion) et l'extraction (chantiers précédents) non touchées.
- CHARTE : aucun bleu (svv-red/ink/muted/green/line/field) ; cibles ≥44px (boutons via feuille `.svv-int`) ; pas
  d'animation ajoutée.

## AUTO-REVIEW (points a–d exigés)
- **(a) Un seul `FicheDetail`, appelé aux 2 endroits** : défini 1× ; appelé au bloc haut (avec `actions`) et à la
  Vérification (sans). `DetailComplet` supprimé (0 occurrence). ✓
- **(b) Aucune action dans la Vérification** : `FicheDetail` rend `{actions}` et RIEN d'autre comme bouton ; l'appel
  Vérification omet `actions` → `{undefined}` ne rend rien. Zéro fuite. ✓
- **(c) Aucun champ perdu** : union — « Source de collecte » + azimut/hauteurs présents partout ; catch-all payload
  conservé (aucune clé masquée) ; adresse dédupliquée (non perdue). ✓
- **(d) En-tête conforme** : `<span fontWeight:400>{prénom}</span> <span fontWeight:800>{nom}</span>` ; téléphone et
  email sur 2 `<div>` séparés. ✓

## Vérifications (les 4 exigées)
- `npx tsc --noEmit` : PASS (exit 0).
- `npx eslint` (InternautesVue.tsx) : PASS (0 problème).
- `npm test` : PASS — 82 fichiers, 983 tests, 21 skipped (inchangé — affichage sans tests unitaires).
- `npm run test:integration` : PASS — 54 tests, golden bit-identique.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Revue indépendante (sous-agent, analyse statique du fichier + grep). Les 5 points confirmés SÛRS :
- **(a)** `FicheDetail` défini 1× (L843), appelé au bloc haut avec `actions` (L473) et à la Vérification sans (L1059) ;
  `DetailComplet` = 0 occurrence.
- **(b) 🔴 RGPD** : `FicheDetail` ne contient AUCUN `<button>` en dur (en-tête/consentements/analyses via `Champ` =
  `<span>` seulement) ; unique slot `{actions}` (L952) omis côté Vérification → étanche ; `PanneauVerification` ne rend
  que des boutons de NAVIGATION (bascule mode, accordéon), aucune mutation. **Aucune fuite d'action.**
- **(c)** Aucun champ perdu : « Source de collecte » (L868), azimut/hauteurs (L936-938), catch-all payload conservé
  (clés inconnues affichées sous leur nom brut via `labelPayload`).
- **(d)** En-tête : prénom `fontWeight:400` + nom `fontWeight:800` même ligne ; téléphone (L865) et email (L866) sur
  2 `<div>` séparés.
- **(e)** Aucun bleu (audit couleurs exhaustif) ; titre « Vérification — 10 derniers internautes en base » (L1016) ;
  handlers (`edition`, `soumettreRectification`…) construits dans la portée d'`InternautesVue` et passés en `ReactNode`
  → aucune variable hors portée.

**2 observations non bloquantes** (aucune correction requise) : (1) « Source de collecte » et « Adresse normalisée »
RENOMMÉES en « Source » / « Adresse du bien » — valeurs conservées, seul le libellé change ; (2) la fusion
« email · téléphone » subsiste dans la **ligne de liste** compacte (résultat), pas dans l'en-tête de fiche — hors
périmètre de l'exigence (d). **Rien à corriger.**
