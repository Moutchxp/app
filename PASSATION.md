> Passation générée le 04/09/2026 à 00h07 · actualisée LOT 68 (série 57 → 67)

# PASSATION — Application « Sans Vis-à-Vis® » (module Veille Permis)

## 1. Rôles & workflow
- **Arno** (a.jorel@sansvisavis.com) = fondateur **non-développeur** de **Sans Vis-à-Vis** (sansvisavis.com),
  agence/plateforme de certification immobilière « vue dégagée » (Paris + petite couronne). Décide seul,
  français, tutoiement, direct.
- **Claude** = architecte / relecteur / exécutant. Dans CETTE session, Claude Code travaille **directement
  dans le repo** (recon → implémente → lance les contrôles → **committe lui-même**, sans push). Pour la
  passation vers une conversation web, garder le format relais (cartouches, §7).
- **Repo** : github.com/Moutchxp/app · branche `main`. **Stack** : Next.js 16.2.9, React 19, TypeScript 5,
  Tailwind v4, **PostgreSQL 17 + PostGIS en LOCAL** (driver `pg` sur `DATABASE_URL`, pas de Supabase).
- **Base LOCALE** : `postgresql://localhost:5432/sansvisavis`. Les migrations vivent dans `db/migrations/NNN_*.sql`,
  **livrées NON APPLIQUÉES** puis appliquées à la main par Arno (`psql -v ON_ERROR_STOP=1 -f …`). Dernière = **192**
  (LOT 67), **APPLIQUÉE** en local. Le code reste RÉSILIENT si une migration manque (`42P01`/`42703` → comportement d'avant).

## 2. Règles de collaboration (impératives)
- **Un chantier = un prompt = un commit.** Recon **LECTURE SEULE** avant tout write sur fichier sensible.
- **CONTRÔLE DE FIN OBLIGATOIRE, dans l'ordre** : `npm test` COMPLET (= `vitest run`, **468 fichiers / 6084 tests**)
  · `npm run test:integration` (**29 fichiers**, vraie base) · `npx tsc --noEmit` · delta eslint · `npm run build`.
  Les suites filtrées par chemin sont des contrôles RAPIDES, **jamais** le contrôle de fin (précédent
  `curation.test.ts` rouge 14/07→03/08, invisible aux filtrés). **INTERDIT : `npm run veille:run`** (envoi réel).
- **`jsdom`** est en **devDependency**, utilisé par les SEULS tests qui exigent un montage React réel
  (cycle de vie / StrictMode), via l'en-tête `// @vitest-environment jsdom` en tête de fichier ; le RESTE de la
  suite reste en environnement **node** (tests purs / `renderToStaticMarkup`).
- **Tests** : ne jamais figer la FORME exacte d'un SQL émis (regex sur le WHERE) → asserter le COMPORTEMENT
  (réponse, **paramètres LIÉS**) + le SQL par **FRAGMENTS sémantiques** sur chaîne whitespace-normalisée
  (`sql.replace(/\s+/g,' ')` + `toContain`). Modèle : `curation.test.ts` (« entité supprimée »). Pour les tests de
  RENDU par onglet non montables unitairement, garde par **lecture de source** (`readFileSync` + assertions) —
  modèle `archivesGlobal.test.ts`. Un test qui vérifie un COMPORTEMENT réel (ex. « 0 candidat aux 3 systèmes ») est
  un **itest** (vraie base, fixtures + `afterAll` DELETE), patron `saisissableEnCours.itest.ts`.
- **KNN spatial** : un `<->` ne lit JAMAIS son point d'un CTE multi-référencé (matérialisé → perd l'index en
  silence) → inliner l'expression dans l'`ORDER BY`. Les JOIN `ST_Intersects`/`ST_DWithin` NE sont PAS concernés.
- **Flakes connus** : renvoyer au registre `docs/FLAKES_CONNUS.md` (une entrée / flake, preuve explicite) — ne
  jamais présenter une hypothèse comme cause. `certificatPdf.test.ts` : cause **NON ÉTABLIE**, l'ancien
  diagnostic « octets non déterministes / timestamp » est **RÉFUTÉ** (générateur prouvé déterministe). Observés :
  `gelRepo.test` (scan de fichiers en run parallèle) et un flake **transitoire de `test:integration`** (vu aux LOTs 40
  ET 53, vert au re-run, aucun code DB touché) — **re-lancer avant de diagnostiquer**.
- **Commits (cette session)** : `git add` des SEULS fichiers du lot · `git commit` · **PAS de push** · **AUCUNE
  ligne Co-Authored-By** · message via **fichier** (`git commit -F …`) car les backticks du message sont
  interprétés par zsh (bug rencontré au LOT 16).
- **2 fichiers Gemini HORS staging** : `app/lib/svv/adaptateurIaPhoto.ts` et `app/api/analyse-photo/route.ts`.
- **prefers-reduced-motion** respecté ; **exigence transverse mobile-first** (tout écran d'admin pleinement
  utilisable sur smartphone portrait). Un seul clic pour déplier ; **pas de `BlocRepliable` imbriqué**.
- Proposer les vrais choix (design/ressenti) AVANT d'implémenter ; sinon décider et le dire. Ne jamais conseiller
  de faire une pause. **Recon qui contredit une prémisse → la recon gagne** (précédents LOT 2 bigint, LOT 14 arrêt,
  LOT 40 prop `process`, LOT 52 pastille pré-cassée).
- **Une SPEC que J'ÉCRIS peut être le défaut** (leçons LOT 47-bis ET 46) : (a) ma spec « la relance manuelle OU
  automatique acquitte le signal » ignorait que la relance sur réponse partielle (PART-E) est déclenchée PAR l'arrivée
  des pièces — donc TOUJOURS postérieure — → le signal s'auto-annulait avant lecture ; (b) au LOT 46, une bascule
  d'onglet que j'avais spécifiée a été REFUSÉE à l'examen (elle cassait l'exclusivité). La règle « **exercer chaque
  maillon EN RÉEL** » vaut AUSSI contre les spécifications, pas seulement contre le câblage : dérouler le scénario réel
  (qui écrit quoi, dans quel ordre temporel) AVANT de figer une règle. Le défaut peut être en amont du code. **Quand une
  recon CONTREDIT ma prémisse, la recon gagne** — arrivé plusieurs fois dans la série (47-bis, 48 doublon fil, 52
  pastille pré-cassée). Toujours établir le fait sur la base RÉELLE avant de proposer un correctif.
- **Dette TRANSVERSE / cohérence de libellé → inventaire par grep global, jamais écran par écran.** Leçon des lots
  41→45 (thème sombre) et 49/50/53 (libellés) : un `grep -rn` du libellé/motif fait remonter TOUTES ses surfaces
  (autre onglet, toast, sous-titre, aide, commentaire, test qui le fige) qu'aucun balayage écran par écran ne verrait.
  Rendre l'inventaire à Arno et tout mettre en cohérence d'un coup.

## 3. Objectif
- **Global** : transformer « sans vis-à-vis » en une norme mesurable/certifiable (verdict géométrique ≥ 40 m +
  score de qualité de vue /100), avec à terme une **interface d'administration pilotable sans code** par Arno.
- **Chantier en cours** : le **module admin « Veille Permis »** — suivi automatisé de la boucle CRPA (demandes de
  communication aux mairies → relances → saisine CADA), écrans **« À demander » / « En cours » / « Réponses » /
  « Analyse et projection » / « Archives » / « Saisines CADA »**, avec relance/saisine **automatiques par e-mail**
  (LaunchAgent /15 min). **Aucun chantier ouvert** au moment de la passation : Arno enchaîne des « LOT N » séquentiels.

## 4. Invariants verrouillés (garde-fous permanents — cf. `docs/INVARIANTS_SVAV.md`)
- **Golden Asnières = `29.107259068449615`** (note Couche 1 /80, scellé `pipeline.itest.ts:42`). Toute modif du
  score → recalcul + validation main + **rescellage en commit SÉPARÉ**.
- **Verdict binaire = 100 % géométrique** : 1er obstacle réel ≥ 40 m sur l'axe → SANS_VIS_A_VIS. Jamais couplé au
  score ni à la photo. Toits = MNS LiDAR direct (jamais sol+hauteur). `ST_Force2D` jamais retiré.
- **Hauteur de vision = FORMULE À PARAMÈTRE VARIABLE** : `etage × (hauteur_sous_plafond + 0,30 dalle) + 1,65 yeux`.
  Sous-plafond CHOISI par l'internaute (défaut 2,50 m, [2,40 ; 4,50] pas 0,10). **« 2,80 »** = coefficient du seul
  cas par défaut, PAS une constante (l'ancien « ×2,90 » comme formule est PÉRIMÉ) ; **« 2,90 » =
  `FLOOR_HEIGHT_OBSTACLE_M`**, constante DISTINCTE (estimation immeuble voisin sans hauteur BD TOPO). Certificat :
  `SAVV-AAAA-NNNNNN` (cible, non implémenté). Tolérance rattachement patrimoine = 15 m ; origine hors emprise = 0,30 m.
- **PILOTAGE SANS CODE** : toute variable de moteur (score, cascade de relance, seuils, délais) DOIT être en table
  de config lue au runtime, éditable par un non-développeur, avec type + défaut + plage/validation. Distinguer
  VIVES / VESTIGIALES / GARDE (liste fermée). `config_scoring` (39 col.) et `config_veille` (relance/cascade)
  suivent ce principe. Toute colonne d'un `COLONNES_THEME_*` (reglagesVeille) DOIT avoir son `ParamVeille` +
  sa borne CHECK (garde-fou testé). **Aucune constante métier en dur dispersée.**
- **Trois altitudes de sommet NGF DISTINCTES — ne jamais confondre** (nette au LOT 51-C) : (1) **par CORPS de
  bâtiment** `permis_corps_batiment.altitude_sommet_ngf` (N par permis — « le bâtiment du permis ») ; (2) **niveau
  DOSSIER** `permis_caracteristique.altitude_sommet_ngf` (acrotère max, non rattaché à un corps) ; (3) **par POLYGONE
  BD TOPO** `permis_polygone_altitude` (clé `cleabs`, l'objet du monde réel, soumis à la préséance LiDAR).
- Lire **`docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md`** AVANT tout chantier données/verdict/certificat/permis
  (résumé en §5).
- **IDEMPOTENCE StrictMode (leçon LOT 24)** : tout effet de la liseuse DOIT être idempotent (montage → démontage →
  REMONTAGE même-fibre, refs PERSISTENT mais effets rejouent — ON en dev Next 16). Jamais s'appuyer sur un flag de
  cycle de vie mis à `false` au démontage sans remise à `true` au remontage. Dériver la « fraîcheur » d'une donnée live.
- **THÈME SOMBRE (37-39 mécanisme+palette, 41-45 fonds — terminés)** : `data-theme` scopé à `.svv-adm-root` (jamais
  `:root` → public + PDF restent clairs), tokens `--color-svv-*`, seconde palette sombre mesurée (ratios ≥ 4,5:1).
  **Règle** : un fond et son texte basculent TOUJOURS ENSEMBLE. Jamais `#fff`/`bg-white` en dur sous un texte token
  (→ `var(--color-svv-surface)`, = `#ffffff` exact en clair) ; jamais un token de TEXTE (`ink`) en FOND avec texte
  `#fff` en dur. **Zones qui restent CLAIRES par décision** : canvas liseuse, tracé d'emprise, cartes + marqueurs
  Leaflet, data-viz catégorielle, PDF du certificat.

## 5. Historique — ce que fait déjà la Veille Permis (synthèse)
Moteur pur + repos + écrans admin autour de l'entité **demande** (statuts `brouillon/prete/envoyee/close`) et de
ses **dossiers** (permis Sitadel). Points clés hérités :
- **Cascade ordinaire** (absence totale de réponse) : Rappel (J-10) → Avis (J-3) → Saisine annoncée → dépôt CADA
  (échéance + 4 j). Réglages `config_veille`. Candidats/envoi filtrent `demande.statut='envoyee'`.
- **Cascade partielle** (mairie a répondu, pièces manquantes → marqueur `demande.partiel_*`, CASC-1) : relances
  1..N, annonce CADA, saisine ≥ butoir CASC-2 (`partiel_le + 1 mois + 4 j`). Candidats filtrent `partiel_le
  actif AND statut IN ('envoyee','close')`. **Les DEUX cascades partent en AUTO** (défaut TRUE) ; manuel possible.
- **PART-E — relance sur RÉPONSE partielle** : 3ᵉ système, INDÉPENDANT des deux cascades (`candidatsRelanceReponseReels`,
  même filtre partiel que la cascade partielle). Déclenché PAR l'arrivée d'un message mairie récent + pièces encore
  manquantes. N'incrémente pas le compteur de cascade.
- **Rattachement des réponses** : 100 % par IDENTIFIANTS (In-Reply-To/References ∩ Message-ID émis, réf. SVAV, n°
  dossier, réf. mairie) — jamais par l'expéditeur. Relève IMAP par domaine.
- **Encart de familles** (`encartFamilles.ts`, socle UNIF-0, partagé En cours/Réponses/Analyse/Archives) : rendu
  paresseux (`BlocRepliable`, render-prop).
- **Deux process d'envoi** (D2) : e-mail (auto) et téléservice (dépôt manuel), commutateur en tête des onglets. Canal
  figé par demande (`dest_canal`).

### LOTS 13 → 45 (session précédente, tous poussés — résumé)
Complétude/historique des envois · liseuse de pièces (pdf.js, lecture seule) · frise de suivi + parcours projeté ·
perfs liseuse (cache LRU + cache de rendu peint) · StrictMode (24) · Contact mairie + téléphone signature (26/28) ·
destinataires de relance multi-adresse (27, mig. 183) · **cascade partielle rendue AUTO** (30bis, mig. 184) · sélecteur
de destinataire (29, mig. 186) · plafond anti-cumul d'envoi auto (31, mig. 185) · relève différée au clic « copier »
(34, mig. 187) · correctif référence mairie non écrite, prouvé en réel (35) · **thème sombre** mécanisme+palette (37-39)
et **fonds par motif** (41-45, hex en dur admin 235 → 107) · retrait du commutateur de process en « Réponses » (40).

### SÉRIE 46 → 53 (session courante) — « En cours » affiné · fil lisible · tester en analyse (tous committés)
- **46** (`d9e2bf0`) — « En cours » scindé en DEUX familles (`categorieEnCours` : *1re réponse* / *à relancer*) +
  pastilles de LIGNE et d'ONGLET pilotées par un **PRÉDICAT PUR PARTAGÉ serveur/client** (`demandeEnCoursIncomplete`,
  `demandesListe.ts`) → invariant **compteur d'onglet == somme des pastilles de ligne** FIGÉ par test.
- **47 + 47-bis** (`9c2ee84`, `111b054`) — signal « **nouvelles pièces reçues** » (`demandeADeNouvellesPieces`, badge
  BLEU + bouton « vu »), **migration 188** `dossier_pieces_acquittement`. LEÇON 47-bis : la relance PART-E est déclenchée
  PAR l'arrivée des pièces → toujours postérieure → le signal s'auto-annulait ; corrigé (`j.auteur IS DISTINCT FROM
  'auto'` + date déclarée prime).
- **48** (`41a8a14`) — la relance PART-E apparaît dans la FRISE. **Décision COEXISTENCE ASSUMÉE** : deux systèmes de
  relance indépendants, on ne réconcilie pas ; butoir CADA intact. Étape 0 a évité un doublon (déjà dans le fil via le
  sortant hors-outil capté dans `\Sent`, FIL-C → ajoutée à la frise seulement).
- **49** (`21328cf`) — horodatages en **Europe/Paris** (`horodatageParis.ts`), 5 surfaces. Discriminant = présence
  d'un `T` : instant UTC → converti ; date CIVILE (sans T, ancrée 12:00 Paris au LOT-1) → JAMAIS re-convertie.
- **50** (`3ae7ee9`) — libellés du fil : « **N e-mails échangés** » (mails réels) vs « **M affichés · dont K relance(s)
  déclarée(s) (hors e-mail)** » → lève la fausse contradiction « 9 » vs « 10 ».
- **51-A/B** (`51283cb`) — **TESTER un dossier incomplet EN ANALYSE**, **migration 189** `dossier_test_analyse`
  (marqueur RÉVERSIBLE par dossier, `testAnalyseRepo.ts`). Ouvre la porte FIX-2 (`OR s.id = ANY($1)`) SANS lever le
  partiel → les relances continuent. **Décision OPTION B** : pendant le test le dossier DISPARAÎT de « En cours »
  (exclu de `estEnCoursAffichee` + `ligneEnCoursASignaler` + affichage), exclusivité préservée. DEUX retours : (1)
  relance envoyée/déclarée depuis Analyse efface le marqueur ; (2) bouton manuel de retour (sans envoi).
- **52** (`ac9cfb4`) — 3 retours après essai réel. **(1) Pastille « Analyse » ramenée sous l'invariant du LOT 46** :
  elle valait `fileProjection + relancesReponseDue` → les relances PART-E dues en manuel n'ont PAS de ligne (partiel-
  actives, exclues par FIX-2). Défaut ANTÉRIEUR au LOT 51, rendu visible par un double-compte (4 vs 3). Corrigé :
  `projection = fileProjection`. `compterRelancesReponseDue` conservé mais DÉBRANCHÉ. **(2)** boutons pleine largeur,
  fond rouge tokenisé. **(3)** groupe dynamique en tête d'Analyse. Aucune migration.
- **51-C** (`00be4e2`) — **SORTIE DÉFINITIVE vers Rattachement + ARRÊT EXHAUSTIF des relances** (LE lot à risque).
  Double condition non négociable : **empreinte validée ET `nbCorpsSansAltitude === 0`** (par CORPS, distinct du
  polygone BD TOPO). L'altitude ne gate QUE la sortie du test (pas `peutValider` ni la validation normale). 🔴 **FAIT
  VÉRIFIÉ, à conserver** : il n'existe **AUCUN point unique d'extinction** — `statut='close'` coupe la cascade ORDINAIRE
  mais PAS ② partielle ni ③ PART-E (elles acceptent 'close') ; `partiel_leve_le` coupe ② et ③ mais RÉACTIVE ① (lève la
  suspension). ⇒ il faut les **DEUX gestes ENSEMBLE**, dans une transaction (`arretRelances.ts` :
  `arreterToutesRelances`). Piège : `cloturerDemande` ne pose QUE 'close'. Chaîne atomique : Rattachement
  (`ecrireProjectionValidee`) + arrêt + effacement du marqueur. **Itest de livraison** `sortieTestRelances.itest.ts`
  (vraie base) : « close+levé ⇒ 0 candidat aux 3 systèmes » avec les deux contre-preuves + non-régression (une demande
  non sortie ne perd rien) + sortie end-to-end. UI : bouton « Valider » normal MASQUÉ pour un dossier testé ; la sortie
  dit LAQUELLE des deux conditions manque (jamais un bouton grisé muet).
- **53** (`7cba186`) — deux libellés à l'écran : le groupe de tête d'Analyse « Dossiers en test » → **« Test Permis (N) »**
  (collision avec l'écran « Banc de test » et la notion de test-dev) ; le bouton de retour « Remettre dans En cours » →
  **« Renvoyer ce permis dans l'onglet « En cours » »**. Inventaire par grep : 2 rendus UI + 1 sous-titre + 1 toast + 5
  commentaires + 3 fichiers de test mis en cohérence. Aucune migration, aucune logique touchée.

### SÉRIE 54 → 56 (session courante, suite) — en-tête de colonne · colonnes alignées · recon renversante · bouton unique · RGPD Cerfa · diagnostic élargi
- **54** (`867038c`) — les dossiers en test se signalent par leur **EN-TÊTE DE COLONNE** « Test permis « En cours » », PLUS par un
  groupe de tête. **Correction d'une mauvaise interprétation de ma part au LOT 52** : Arno ne voulait pas un groupe (pli + titre +
  sous-titre au-dessus d'une seule ligne), seulement renommer l'en-tête « Permis » du tableau des testés. Partition testés-d'abord
  conservée, seul l'habillage disparaît. Prop `libellePermis` sur `TableProjection` (défaut « Permis »).
- **55** (`1c83eea`) — **colonnes ALIGNÉES** entre les deux tableaux d'Analyse (testés / file ordinaire) qui se suivaient avec des
  colonnes décalées (chaque table en `width:100%`, `table-layout:auto`). `LARGEURS_COLONNES` (30/19/21/12/18 %) + `MIN_WIDTH_TABLE`
  déclarés **une seule fois** dans `TableProjection` → `table-layout:fixed` + `<colgroup>` **identique** pour les deux instances.
  Test qui compare les `colgroup` **byte-à-byte** entre les deux rendus. Mobile : sous la min-width, le wrapper `overflowX:auto`
  existant défile (comportement responsive conservé).
- **56-A** — **RECON, aucun code.** 🔑 **ELLE A RENVERSÉ TROIS PRÉMISSES** : (1) le **« best-of » EXISTE déjà** sous ce nom littéral
  (liseuse « **Best-of des plans proposés** », `TraceEmpriseRendu.tsx:166`, montée `SuiviDemandes.tsx:928`) — sélection de **PAGES**,
  **recalculée à la volée** depuis la GED via `GET /api/admin/permis/emprise`, **JAMAIS persistée, AUCUNE IA** ; (2) **l'arrivée IMAP
  DÉCLENCHE déjà un diagnostic** (`executerDiagnosticsVague`, câblé aux DEUX relèves, délai de calme `vagueCalmeMinutes` défaut 10
  **déjà en Réglages**) ; (3) un **bouton de ré-analyse complète existait déjà** (« Relancer l'analyse » → `POST /extraire`).
  L'analyse coûteuse (vision Mistral) ne tourne QUE sur ce bouton manuel ; l'auto est déterministe/gratuit. **Décision produit
  d'Arno : (X) câbler l'existant**, best-of **NON persisté** (option (Y) écartée). 🔑 **N7-A `triagePieces` (CLI seul) et N10-J
  épinglage bleu ne sont PAS le best-of.**
  > 🔴 **RENVERSÉ à la SÉRIE 57 → 67 (voir ci-dessous)** : « best-of NON persisté » est désormais **CADUC**. Les **exclusions
  > de page** (LOT 61, migration 190) et les **verdicts de repérage par image** (LOT 62, migration 191) SONT persistés.
- **56-B** (`7e56bd8`) — bouton unique **« Diagnostic complet des documents »** : l'ancien « Relancer l'analyse » **RENOMMÉ ET
  DÉPLACÉ** en tête de `CorpsCompletude` (`BlocCompletude`), **pas dupliqué** (deux noms pour la même action = refusé). Rendu
  **opt-in** (`avecDiagnostic`) pour éviter un DOUBLE bouton dans `ArchivesVue` (qui monte AUSSI `BlocCompletude` + garde son bouton
  autonome). Sous-ligne sans jargon (relit tout, service payant, 20-30 s) ; **401 → « reconnectez-vous »** (proxy renvoie bien 401
  sur `/api/admin/*`, `proxy.ts:120`). Rafraîchissement : le bloc relit son diagnostic (`vLocal`) + `onAnalyseFinie` remonte les
  frères (caractéristiques/fil via `vAnalyse` ; best-of dans l'encart via `vApresAnalyse`). 🔴 **VÉRITÉ À CONSERVER** : `POST
  /extraire` **n'ajoute AUCUNE pièce en GED** → cliquer ce bouton **ne change PAS le best-of aujourd'hui** ; le remontage par clé de
  version est une **garantie de cohérence** pour quand des documents arriveront, **pas un effet visible**. Écrit tel quel dans le
  code plutôt que de laisser croire à un effet.
- **56-E** (`4d619c1`) — **RGPD.** 🔴 **FAIT MESURÉ** : jusqu'à ce commit, le **PDF Cerfa ENTIER** partait chez Mistral (OCR),
  **pages d'identité comprises** — sur le 13409*15 réel (dossier 11434) : **p.4 = nom/naissance + un vrai n° de téléphone**, **p.11 =
  co-demandeurs**, **p.12 = signature**. Principe retenu : **LISTE D'AUTORISATION, jamais exclusion** — on n'envoie QUE les pages
  utiles (`PAGES_UTILES_CERFA`, dérivée de `PAGES_CERFA` = {5,7,9,10}, mesurée) ; **pagination non reconnue → on n'envoie RIEN +
  abstention journalisée par champ** (N10-R). **Point de passage UNIQUE = `lireCerfaScan`**, en amont de `lecteur.ocr` ET
  `lecteur.rasteriser` ; ses **4 appelants** (web `executerExtraction`, 2 CLI, tests) y passent tous — `decouper` ajouté au lecteur
  injectable (réel : poppler `pdfinfo`+`pdfseparate`+`pdfunite`). **Preuve réelle poppler** : PDF réduit **4 pages, 0 marqueur
  d'identité** (vs 3 dans l'original). **Test qui intercepte ce qui est RÉELLEMENT transmis** (`recuParOcr === réduit`, `!== pdf
  entier`) → **échoue si quelqu'un rebranche le PDF entier**. La vision était DÉJÀ cadrée (rasterise page par page) ; seul l'OCR
  fuyait. ⚠️ **Deux faits mesurés à garder** : (a) **07512025V0037 N'EXISTE PAS dans la base locale** — seul **07512025V0035
  (dossier 11434)** a des pièces ; les mesures documentées sur 0037 ne sont **PAS rejouables ici**. (b) le détecteur ne reconnaît
  **QUE le Cerfa 13409** → le **13824 n'est JAMAIS lu par l'OCR** (le dossier 11434 contient les deux). Dette **préexistante**, pas
  introduite par ce lot.
  > 🔴 **NUANCÉ à la SÉRIE 57 → 67 (voir ci-dessous)** : le filtre RGPD n'est **plus uniforme**. Sur le **CERFA**, LISTE
  > D'AUTORISATION (56-E, pagination connue). Sur les **AUTRES pièces** (planches d'architecte, LOTs 62/63), LISTE
  > D'EXCLUSION — **aucune pagination stable** → **régime plus faible, ASSUMÉ**, compensé par l'**abstention en cas de doute**.
- **56-C** (`e5a53a7`) — **périmètre du diagnostic AUTO.** 🔴 **MESURE** : sur **6 dossiers** à documents GED réels, **1 seul** était
  candidat (7424, partiel) ; **5 non-partiels** (29/71/45/80/45 docs) **jamais de complétude calculée**. La condition de candidature
  (`candidatsVagueReels`) passe de « **partiel actif** » à « **la GED a changé depuis le dernier diagnostic** » (partiel ou non) :
  `WHERE EXISTS(≥1 doc GED réel) OR pc.dossier_id IS NOT NULL` + filtre « changée » inchangé. **Garde-fou prouvé DEUX FOIS** : (1)
  **structurellement** `evaluerLeveeAutoPartiel` (`dossierPartielRepo.ts:133`) `return` si la demande n'est pas suspendue → il ne
  peut que **LEVER** un partiel, **jamais en créer** ; (2) **`diagnosticVagueScope.itest.ts`** (vraie base, 3 cas) prouve qu'un
  non-partiel diagnostiqué reste candidat à **AUCUN** des 3 systèmes de relance (`lireCandidatsRelance`,
  `lireDemandesPartiellesActives`, `candidatsRelanceReponseReels`), **avant ET après**. Diagnostic auto **déterministe/gratuit**
  (jamais la vision). **Aucune migration, aucun paramètre nouveau** (règle de correction, pas une variable pilotable ; le calme
  reste piloté). **TROU 2 amont mesuré = 0 cas réel** (cf. §6). **56-F non fait.**

### SÉRIE 57 → 67 (session courante, suite) — best-of PERSISTÉ, RGPD deux régimes, parcelles & Cerfa lus en profondeur
> 🔴 **DEUX DÉCISIONS DES SÉRIES PRÉCÉDENTES SONT RENVERSÉES — à retenir avant de lire les lots :**
> ① **« le best-of n'est PAS persisté » (56-A) est CADUC** : les **exclusions de page** (LOT 61, migration 190) et les
>    **verdicts de repérage par image** (LOT 62, migration 191) sont désormais **persistés**.
> ② **le filtre RGPD n'est plus uniforme** : sur le **CERFA**, LISTE D'AUTORISATION (56-E, pagination connue) ; sur les
>    **AUTRES pièces**, LISTE D'EXCLUSION (LOTs 62/63, **aucune pagination stable**) — **régime plus faible, ASSUMÉ**,
>    compensé par l'**abstention en cas de doute**.
- **57** (`c85ce91`) — signal des **pièces reçues mais NON VERSÉES en GED**. Fait établi : le **cas A** (réponse non
  rattachée) s'auto-résout au tic de versement suivant ; les **cas B** (nature ≠ documents) et **C** (demande
  multi-dossiers) ne se résolvent **JAMAIS**. **0 cas réel** aujourd'hui. Faux positif écarté : la **signature/logo SVAV**
  citée dans les mails mairie, **exclue par empreinte** (même source que le versement).
- **58** (`33c6432`) — **verrou par dossier** (advisory lock PostgreSQL) autour de l'analyse. Pas de point d'entrée commun
  web/CLI → primitif partagé **`avecVerrouDossier`** appelé par les **3 entrées**. Libération garantie même processus tué.
  🔴 **SIGNALÉ NON TRAITÉ** : les writers ne sont **PAS dans une transaction commune** — un crash en cours de passe laisse
  un **état partiel** (sujet DISTINCT du verrou).
- **59** (`af07be1`) — bouton **« Lancer le diagnostic complet des documents »** + MESURE : **PC200 a une couche texte
  COMPLÈTE** (18/18 pages) ; ni scan, ni vocabulaire non reconnu, ni plafond → **115 images raster encastrées dans une
  notice en prose**, **structurellement invisibles au best-of textuel**.
- **60** (`4915a13`) — le message « contenu illisible » était **FAUX**. **3 états distincts** désormais (`hors_familles` /
  `illisible` / `indetermine`). Limite assumée : les **diagnostics ANTÉRIEURS** ne portent pas la présence de texte → ils
  affichent l'état vague **jusqu'au prochain diagnostic**.
- **61** (`d965684`, **migration 190**) — **retrait manuel d'une page du best-of, RÉVERSIBLE** (liste persistante +
  réintégration, **jamais un « annuler » éphémère**). Ne supprime **jamais** le document ni la page en GED. Cascade : la
  pièce quitte la GED → l'exclusion **disparaît**.
- **62-A** (mesure) — **vision Mistral** sur les pages encastrées : **10/10 discriminées, 0 faux positif, 0 faux négatif,
  stable ×3**, **~0,1 ¢/page**. Cas pièges (carte, carte réseau, axonométrie 3D) **non confondus**. Réserve : **UN
  document, 10 pages**.
- **62-B** (`d6f678b`, **migration 191**) — **repérage câblé, BOUTON MANUEL uniquement, sous le verrou du 58**. Sortie =
  **PRÉSENCE seulement** `{planche, categorie}`, **jamais de lecture de contenu** (doctrine P2/P4/P5). Badge « repérée par
  image », **non traçable pour l'emprise**. « incertain » **n'entre pas**.
- **63** (`e85ac9d`) — 🔴 le **pré-filtre RGPD bloquait le cas NOMINAL** : quasi toutes les planches d'architecte portent
  un cartouche avec téléphone. Arbitrage du 56-E appliqué (« **on bloque ce qui identifie une PERSONNE, pas ce qui
  localise le PROJET** ») : téléphone/e-mail/société/SIRET/entête seul **ne bloquent plus** ; **noms de personnes,
  signature, civilité+nom bloquent**. Mesure : **5/32 pages écartées → 2/32**. Non-régression prouvée sur la p1 de PC200.
  Essai réel : **8 planches** là où le textuel en voyait 0, **$0,017**.
- **64** (`a33b79d`) — 🔴 le sélecteur de pièces était un **`<select>` natif REPLIÉ** : les 8 pièces étaient là,
  **invisibles**. « **Vrai techniquement, faux à l'usage.** » Remplacé par une **liste explicite**, non analysées en tête,
  **état par ligne** (jamais la couleur seule).
- **65** (`e109fac`) — **ouvrir le document complet depuis la liseuse** ; lien signé **fabriqué AU CLIC** (jamais
  pré-généré : un lien posé d'avance expire).
- **66** (`d34dc8c`) — 🔴 **DÉFAUT DE JUSTESSE MAJEUR** : le Cerfa déclare **10 parcelles**, la base en avait **3** (venues
  de **Sitadel**, qui plafonne à `num_cadastre1..3`) ; la table « **Références cadastrales** » du récapitulatif, en
  **TEXTE**, n'avait **JAMAIS** été lue. Empreinte corrigée : **2164,3 m² (union de 3) → 5025,7 m² (union de 10)**. Piège
  neutralisé : préfixe `0` du récap **normalisé en `000`**, sinon 3 doublons. Catégorie « **Cerfa** » ajoutée à
  l'inventaire (**par contenu, jamais par nom de fichier**).
- **67** (`f27523d`, **migration 192**) — **lecture approfondie du Cerfa**. Écrits : date de dépôt, superficie terrain,
  logements, niveaux (**5 dessus / 1 dessous**), stationnement, emprise au sol, surface de plancher, description projet.
  🥇 **Le champ libre chiffre ce qu'aucun champ structuré ne porte** : **3 plots A–C, 40/18/9 logements**, 2 locaux
  commerciaux (**177 + 69 m²**), 1 sous-sol parking **49 places**. Extrait **VERBATIM**, coupures d'aplatissement pdfjs
  conservées, **aucune recomposition**. Laissés **vides avec motif** : surface habitable (le Cerfa porte du **PLANCHER**,
  non reportable), nombre et noms de bâtiments. « Nature du projet » signalée **ambiguë, non écrite**.

### Prochain GROS chantier + fraîcheur/contrôle mixte (résumé de `docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md`)
> **À LIRE avant tout chantier données/verdict/certificat/permis.** Corpus figé 25-26/07/2026.
- **Énoncé du porteur** : mettre à jour en continu la base des maps pour tenir compte des **nouveaux permis de
  construire**, et en déduire, polygone par polygone, si l'on **garde le LiDAR** ou si on le **remplace** le temps
  d'un nouveau vol.
- **Règle de contrôle mixte** : détecter tout polygone dont l'emprise et/ou la hauteur change entre deux éditions
  BD TOPO. Hauteur inchangée → **on conserve le LiDAR**. Hauteur changée → l'altitude maximale de toit BD TOPO
  devient la **valeur de contrôle** du verdict pour CE polygone → certificat marqué **CONTRÔLE MIXTE**. L'invariant
  « toit = MNS LiDAR direct » n'est PAS modifié : BD TOPO = **détecteur de changement**, jamais source de mesure.
- **Le fait dur — deux régimes** : brancher la règle sur la **PRÉSENCE DU CHAMP** (`altitude_maximale_toit IS NOT
  NULL`), **jamais sur un seuil de date** (remplissage non monotone). **Régime 1** (polygones modifiés récents) :
  `altitude_maximale_toit` bien remplie (≥ 86 % post-2023) → la règle marche. **Régime 2** (bâti réellement NEUF,
  `date_creation ≥ 2024`) : `altitude_maximale_toit` **7-8 %** seulement → BD TOPO ne connaît PAS structurellement la
  hauteur d'un immeuble sorti après le vol LiDAR — **le cas le plus dangereux**. **Décision Régime 2** : ne PAS
  substituer une valeur plus faible ; **MARQUER le certificat « à revérifier »**.
- **Prérequis techniques identifiés** : index sur `batiment.cleabs` (absent) ; historiser une 2ᵉ édition BD TOPO
  (table séparée ≈ +426 Mo) ; **capturer le `cleabs` de l'obstacle du verdict dans le snapshot** (absent :
  `obstaclesParBalayage` renvoie `{distanceM, altitudeSommetM, source}` sans `cleabs`) ; aucun seuil « vrai changement
  vs re-numérisation » calibrable avant une **2ᵉ édition réelle**.
- **Permis de construire** = recours d'arbitrage / borne réglementaire (PLU), **pas une source de mesure** ;
  chiffrage Sitadel documenté. Voir aussi `docs/SOURCES_DATA.md` (licences).

## 6. État courant & prochaine action
- **Working tree PROPRE** (hormis ce commit docs). Dernier commit de CODE : **`f27523d` (LOT 67)** + ce présent commit docs (68).
  Le push est le geste d'Arno depuis VS Code, **au fil de l'eau** — ne pas raisonner en « compteur d'avance ». Chaîne
  de la SÉRIE 57 → 67 : `c85ce91` (57), `33c6432` (58), `af07be1` (59), `4915a13` (60), `d965684` (61), 62-A (mesure,
  aucun commit), `d6f678b` (62-B), `e85ac9d` (63), `a33b79d` (64), `e109fac` (65), `d34dc8c` (66), `f27523d` (67).
- **Migrations : APPLIQUÉES jusqu'à 192** (188 = LOT 47 ; 189 = LOT 51 ; **190 = LOT 61** exclusions best-of ; **191 = LOT 62**
  repérage par image ; **192 = LOT 67** déclarations Cerfa). LOTS 57, 58, 59, 60, 63, 64, 65, 66 = **AUCUNE migration**.
  Contrôle de fin courant vert : `npm test` **468 / 6084** · `test:integration` **29** · tsc · eslint delta 0 · build.
- **AUCUN chantier ouvert.** La SÉRIE 57 → 67 (best-of persisté, RGPD deux régimes, parcelles & Cerfa lus en profondeur) est
  **CLOSE et livrée**. **Attendre le prochain prompt.** Les séries antérieures — « tester un dossier en analyse » (51 → 53) et
  la série 56 (diagnostic auto sur arrivée de documents) — restent CLOSES et fonctionnent en réel.
- **Régime partiel exercé en réel — demande 154 (Aubervilliers, `partiel_le` au 28/08/2026)**, seul dossier partiel.
  Au LOT 52 (base réelle, `relanceAutoActive=false` = mode MANUEL) elle portait une **relance PART-E due, rang 2**
  (dernier mail mairie `2026-09-03`, famille manquante `étage`). C'est le dossier-témoin naturel pour tout ce qui
  touche partiel / test / sortie 51-C.
- **Événement marquant du 01/09/2026** : PREMIER DÉPÔT TÉLÉSERVICE PARIS réel de bout en bout (demande 161) — relève
  déclenchée OK, accusé détecté, référence `SLC260901542604` extraite (écriture corrigée au LOT 35). Corollaire :
  **exercer chaque maillon EN RÉEL avant de le déclarer acquis.**
- **Pistes ouvertes signalées à Arno** (à sa main) : (a) **réduire l'échelle de base du PREMIER rendu de la liseuse**
  (le cache LOT 25 accélère le RETOUR, pas le premier rendu d'un plan jamais vu ; A0 dense d'Aubervilliers ~3,5 s à
  froid) ; (b) **thème sombre — parcours VISUEL écran par écran** en sombre (ce qu'aucun grep ne voit : contrastes
  perçus, superpositions, survols) sur Statistiques, Pilotage Moteur, Curation, Banc de test, Audit, Administratif ;
  (c) le signal « N relances PART-E à envoyer à la main » a été **retiré de la pastille Analyse** au LOT 52 (il y était
  au mauvais endroit) — si Arno le veut, le rouvrir comme sujet dédié (placement « En cours »).
- **Pistes ouvertes des SÉRIES 56 → 67** (non traitées, à la main d'Arno) :
  (d) **rapprochement DÉTERMINISTE du champ libre du Cerfa** (regex « N plots », « Bat. X », « N logements pour »)
  **corroboré par le total structuré** (40+18+9 = 67) → écrit **seulement si la somme concorde**. C'est la **voie vers le
  nombre de bâtiments, SANS modèle**. À chiffrer sur un échantillon de récaps.
  (e) **transaction commune des writers** : le **verrou par dossier est livré** (LOT 58, `avecVerrouDossier`) mais les
  writers ne partagent **PAS** de transaction → un **crash en cours de passe laisse un état partiel** (cf. 58, sujet distinct
  du verrou ; c'était l'ancien 56-F).
  (f) **TROU 2 du 56-C, LATENT** : le versement auto en GED (PART-1) exige **réponse rattachée + `nature='documents'` +
  mono-dossier** — **0 cas réel aujourd'hui**, mais **sans entrée en GED il n'y a PAS de diagnostic**, quel que soit
  l'élargissement du 56-C (trou EN AMONT, distinct).
  (g) **Cerfa 13824 jamais lu par l'OCR** (le détecteur ne reconnaît que le 13409, cf. 56-E/62) — dette **préexistante**.
- **⚠️ Faits d'environnement à garder** : (1) **`07512025V0037` N'EXISTE PAS dans la base locale** (mesuré au 56-E) → les
  mesures documentées sur ce dossier **ne sont PAS rejouables ici** ; seul **`07512025V0035` (dossier 11434)** a des pièces,
  plus le **dossier-témoin 7424**. (2) **DEUX sessions d'agent ont saturé leur contexte le 04/09** (recon LOT 66, LOT 67) →
  **ouvrir une session neuve dès qu'un lot approche 90 %**.
- **Boucle standard d'un LOT** : recon lecture seule → implémente → contrôles de fin dans l'ordre → commit (`-F`, sans
  Co-Authored-By, sans push).

## 7. Format des livrables (pour une conversation web en relais)
> **Cohérence avec §2** : dans la session courante, Claude Code travaille DIRECTEMENT dans le repo — il implémente, lance les
> contrôles de fin, puis **committe lui-même** (`-F`, sans Co-Authored-By, **sans push** ; le push reste le geste d'Arno). Le format
> relais ci-dessous ne vaut que pour une **passation vers une conversation web** (agent distant).

Pour chaque instruction technique, un **bloc copiable** précédé d'un titre à pastille :
- 🔵 **PROMPT** — travail en relais manuel (l'agent Claude Code implémente ET committe lui-même, comme en §2 ; en relais web pur,
  il peut produire un DIFF qu'Arno vérifie). TOUJOURS préciser DANS QUEL TERMINAL.
- 🔴 **PROMPT AUTO** — prompt qui déclenche un run autonome multi-subagents (`/svav-build`, etc.) : vigilance accrue,
  contrôle a posteriori, commit toujours manuel.
- 🟢 **COMMIT** — message à coller dans la boîte de commit de VS Code.
Ne JAMAIS mélanger prompt et commit dans le même bloc. Tout run autonome porte 🔴, jamais 🔵.
