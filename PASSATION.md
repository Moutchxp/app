> Passation générée le 02/09/2026 à 22h01

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
  **livrées NON APPLIQUÉES** puis appliquées à la main par Arno (`psql -v ON_ERROR_STOP=1 -f …`). Dernière = **187**
  (LOT 34), **appliquée** en local ; **185, 186 ET 187 APPLIQUÉES** : 185 (LOT 31) plafond anti-cumul d'envoi auto,
  186 (LOT 29) table `mairie_contact_email` (ajouts manuels de destinataires), 187 (LOT 34) relève différée du dépôt.

## 2. Règles de collaboration (impératives)
- **Un chantier = un prompt = un commit.** Recon **LECTURE SEULE** avant tout write sur fichier sensible.
- **CONTRÔLE DE FIN OBLIGATOIRE, dans l'ordre** : `npm test` COMPLET (= `vitest run`, **463 fichiers / 6017 tests**)
  · `npm run test:integration` (23 fichiers / 110 tests, vraie base) · `npx tsc --noEmit` · delta eslint · `npm run build`.
  Les suites filtrées par chemin sont des contrôles RAPIDES, **jamais** le contrôle de fin (précédent
  `curation.test.ts` rouge 14/07→03/08, invisible aux filtrés). **INTERDIT : `npm run veille:run`** (envoi réel).
- **`jsdom`** est en **devDependency**, utilisé par les SEULS tests qui exigent un montage React réel
  (cycle de vie / StrictMode), via l'en-tête `// @vitest-environment jsdom` en tête de fichier ; le RESTE de la
  suite reste en environnement **node** (tests purs / `renderToStaticMarkup`).
- **Tests** : ne jamais figer la FORME exacte d'un SQL émis (regex sur le WHERE) → asserter le COMPORTEMENT
  (réponse, **paramètres LIÉS**) + le SQL par **FRAGMENTS sémantiques** sur chaîne whitespace-normalisée
  (`sql.replace(/\s+/g,' ')` + `toContain`). Modèle : `curation.test.ts` (« entité supprimée »). Pour les tests de
  RENDU par onglet non montables unitairement, garde par **lecture de source** (`readFileSync` + assertions) —
  modèle `archivesGlobal.test.ts` (et `commutateurReponses.test.ts`, `themeSombreLot2/3.test.ts`).
- **KNN spatial** : un `<->` ne lit JAMAIS son point d'un CTE multi-référencé (matérialisé → perd l'index en
  silence) → inliner l'expression dans l'`ORDER BY`. Les JOIN `ST_Intersects`/`ST_DWithin` NE sont PAS concernés.
- **Flakes connus** : renvoyer au registre `docs/FLAKES_CONNUS.md` (une entrée / flake, preuve explicite) — ne
  jamais présenter une hypothèse comme cause. `certificatPdf.test.ts` : cause **NON ÉTABLIE**, l'ancien
  diagnostic « octets non déterministes / timestamp » est **RÉFUTÉ** (générateur prouvé déterministe). Observés :
  `gelRepo.test` (scan de fichiers en run parallèle) et un flake **transitoire de `test:integration`** (vu au LOT 40,
  vert au re-run, aucun code DB touché) — re-lancer avant de diagnostiquer.
- **Commits (cette session)** : `git add` des SEULS fichiers du lot · `git commit` · **PAS de push** · **AUCUNE
  ligne Co-Authored-By** · message via **fichier** (`git commit -F …`) car les backticks du message sont
  interprétés par zsh (bug rencontré au LOT 16).
- **2 fichiers Gemini HORS staging** : `app/lib/svv/adaptateurIaPhoto.ts` et `app/api/analyse-photo/route.ts`.
- **prefers-reduced-motion** respecté ; **exigence transverse mobile-first** (tout écran d'admin pleinement
  utilisable sur smartphone portrait). Un seul clic pour déplier ; **pas de `BlocRepliable` imbriqué**.
- Proposer les vrais choix (design/ressenti) AVANT d'implémenter ; sinon décider et le dire. Ne jamais conseiller
  de faire une pause. **Recon qui contredit une prémisse → la recon gagne** (précédents LOT 2 bigint, LOT 14 arrêt,
  LOT 40 : la prop `process` conditionnait le contenu de « Réponses », dit AVANT d'implémenter).
- **Une SPEC que J'ÉCRIS peut être le défaut** (leçon LOT 47-bis) : ma spec « la relance manuelle OU automatique
  acquitte le signal » ignorait que la relance sur réponse partielle (PART-E) est déclenchée PAR l'arrivée des pièces
  — donc TOUJOURS postérieure — → le signal s'auto-annulait avant lecture. La règle « **exercer chaque maillon EN
  RÉEL** » vaut AUSSI contre les spécifications, pas seulement contre le câblage : dérouler le scénario réel (qui
  écrit quoi, dans quel ordre temporel) AVANT de figer une règle. Le défaut peut être en amont du code.
- **Dette TRANSVERSE → découper les lots PAR MOTIF racine, jamais par écran.** Leçon des lots 41→45 (thème sombre) :
  attaquer par motif (toggle inactif, champ, surface, `ink`-comme-fond, bordure) + grep global + recon lecture seule
  fait remonter les occurrences qu'aucun balayage écran par écran ne verrait — p. ex. un toggle d'`InternautesVue`
  masqué par des commentaires inline (échappé au `replace_all`, L41) et **4 infobulles** dispersées (L45). Un écran
  « a l'air fini » cache toujours des jumeaux du même bug ailleurs ; le motif est le bon axe de coupe et de contrôle.

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
- Lire **`docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md`** AVANT tout chantier données/verdict/certificat/permis
  (résumé en §5).
- **IDEMPOTENCE StrictMode (leçon LOT 24)** : tout effet de la liseuse DOIT être idempotent sous le StrictMode de
  React (montage → démontage → REMONTAGE même-fibre, où les refs PERSISTENT mais les effets rejouent — ON par défaut
  en dev Next 16). **Ne JAMAIS s'appuyer sur un flag de cycle de vie mis à `false` au démontage sans être remis à
  `true` au remontage** (piège `monteRef` : reste `false` sur le montage réel → UI gelée). Dériver la « fraîcheur »
  d'une donnée live (ex. `pieceIdRef`), jamais d'un flag collant.
- **THÈME SOMBRE (chantiers 37-39 mécanisme+palette, 41-45 fonds — terminés)** : `data-theme` scopé à `.svv-adm-root`
  (jamais `:root` → public + PDF restent clairs), tokens de charte `--color-svv-*` avec **seconde palette sombre
  mesurée** (tous ratios ≥ 4,5:1). **Règle** : un fond et sa couleur de texte basculent TOUJOURS ENSEMBLE. Deux
  corollaires : (1) **jamais de `#fff`/`bg-white` en dur** sous un texte en token (il ne bascule pas → texte pâle sur
  blanc en sombre ; corrigé L41-44 par `var(--color-svv-surface)`, = `#ffffff` exact en clair) ; (2) **jamais un token
  de TEXTE (`--color-svv-ink`) employé comme FOND avec un texte `#fff` en dur** (il s'inverse mal : `ink` devient clair
  en sombre → blanc sur clair ; corrigé L45). Bon patron d'inversion : fond `ink` + texte `--color-svv-surface`/`-bg`
  (toggles `ReglagesVue`/`PermisRattachementRendu`, figés par `themeSombreLot2.test`) ; infobulles → `--color-svv-tip-bg`
  (reste sombre dans les DEUX thèmes). **Zones qui restent CLAIRES par décision (liste stabilisée)** : canvas liseuse,
  tracé d'emprise, cartes de localisation + marqueurs Leaflet, data-viz catégorielle (dont trame « hors parcelle » du
  schéma des bâtiments), PDF du certificat.

## 5. Historique — ce que fait déjà la Veille Permis (synthèse)
Moteur pur + repos + écrans admin autour de l'entité **demande** (statuts `brouillon/prete/envoyee/close`) et de
ses **dossiers** (permis Sitadel). Points clés hérités :
- **Cascade ordinaire** (absence totale de réponse) : Rappel (J-10) → Avis (J-3) → Saisine annoncée (échéance) →
  dépôt CADA (échéance + 4 j). Réglages en `config_veille` (`relance_rappel/avis_jours_avant`, `relance_saisine_delai_jours`).
- **Cascade partielle** (mairie a répondu, pièces manquantes → marqueur `demande.partiel_*`, CASC-1) : relances
  1..N (J+10/J+20), annonce CADA (J+30), saisine ≥ butoir CASC-2 (`partiel_le + 1 mois + 4 j`). Réglages
  `cascade_partiel_*`. **Les DEUX cascades partent en AUTO** (ordinaire `relance_auto_active`, partielle
  `cascade_partiel_auto_active` ; tous deux défaut TRUE) ; l'envoi manuel reste possible (hors calendrier).
- **Rattachement des réponses** (`rattachementReponse.ts`) : 100 % par IDENTIFIANTS (In-Reply-To/References ∩
  Message-ID émis, réf. SVAV, n° dossier Sitadel, réf. mairie) — **jamais** par l'adresse d'expéditeur. Relève IMAP
  par domaine.
- **Sources d'adresse d'une commune** : `demande.dest_email` (figé), `mairie_contact.email` (canal='email',
  statut 'confirme' vs 'presume'), `mairie_prada.courriel`, `demande_reponse.de_adresse` (répondants),
  `mairie_contact_email` (ajouts manuels, LOT 29).
- **Encart de familles** (`encartFamilles.ts`, socle UNIF-0, partagé En cours/Réponses/Analyse/Archives) :
  `ORDRE_FAMILLES` + règle `familleAffichee(onglet, famille, nonVide)`. Rendu paresseux (`BlocRepliable`, render-prop).
- **Deux process d'envoi** (D2) : **e-mail (automatique)** et **téléservice (dépôt manuel)**, choisis par un
  **commutateur** en tête des onglets Demandes. Le canal est figé par demande (`dest_canal`).

### LOTS de CETTE session (13 → 45, tous committés et poussés au fil de l'eau, working tree propre)
- **13 → 25** — Complétude/historique des envois · **liseuse de pièces** (best-of + aperçu PDF pdf.js, lecture seule) ·
  frise chronologique du suivi · **parcours complet projeté** (pilotage sans code) · perfs liseuse (préchargement +
  cache LRU documents + **cache de rendu peint**) · correctif StrictMode (LOT 24). Tracé d'emprise bit-à-bit inchangé.
- **26** (`523f635`) — « Contact mairie » : gabarit uniforme des lignes · pli « Texte de la demande » remonté en 1re
  position (revirement assumé du LOT 22).
- **27** (`43901b8`) — Destinataires des relances, deux règles : **A** défaut = **dernier répondant** ; **B** les 2
  dernières relances de chaque cascade partent à **toutes les adresses ayant participé**. Multi-adresse = NORME
  (migration 183). `resoudreDestinatairesRelance` + module PUR `rangDernieres.ts`.
- **28** (`04028fb`) — « Contact mairie » : téléphone des interlocuteurs depuis leur signature de mail (module PUR
  `telephoneSignature.ts`), sans migration.
- **30bis** (`cdf8f80`) — **LA CASCADE PARTIELLE EST DEVENUE AUTOMATIQUE** (CASC-3 jamais câblé auparavant) ;
  interrupteur `cascade_partiel_auto_active` (défaut TRUE) ; anti-doublon par réservation de créneau
  (`cascade_partiel_creneau`, migration 184). Butoir CADA prouvé inchangé.
- **30** (`2fcaab9`) — Titre « Complétude des pièces & relance mail » + option « compte / ne compte pas » sur une
  relance manuelle + traçabilité dans la frise.
- **29** (`f32987a`) — **Sélecteur de destinataire** pour la relance manuelle : jeu large (`dest_email` ∪ contact
  confirmé ∪ prada ∪ répondants ∪ ajouts manuels), provenance affichée, présélection = dernier répondant, ajout
  manuel persisté en 'confirme' (**migration 186**, table `mairie_contact_email`). Composant partagé avec « Déclarer
  cette relance ». Rattachement prouvé insensible au destinataire.
- **31** (`a150d40`) — **PLAFOND ANTI-CUMUL** : 1 envoi auto par demande et par run, tous émetteurs confondus
  (**migration 185**). Ferme un trou PROUVÉ (PART-E + cascade partielle → deux relances quasi identiques). Réordonnancement
  cascade→PART-E (la cascade gagne).
- **32** (`494e691`) — Sélecteur **MULTIPLE** : envoi manuel à plusieurs adresses, tous en To, ≥ 1 obligatoire.
- **33** (`35c9ebe`) — « Basculer une commune de rail » réservé à l'onglet « À demander ».
- **34** (`458a1af`) — le clic « copier » **DÉCLENCHE** une relève différée (~60 s, **migration 187**) ; il ne
  déclenchait rien auparavant (câblage jamais fait). Relève en lecture seule stricte.
- **35** (`c473941`) — **CORRECTIF PROUVÉ EN RÉEL** : la confirmation « Oui, déposée » passait `null` en 3e argument
  de `marquerDeposee` → la référence mairie n'était JAMAIS écrite. Corrigé : lit la référence du message déclencheur.
- **36** (`62dddbe`) — mention « N demande(s) en cours » en rouge + gras quand > 0, par bouton, indépendamment.
- **37/38/39** (`9d0df2a`, `a9422b9`, `f10b544`) — **CHANTIER THÈME SOMBRE terminé en 3 lots** : mécanisme `data-theme`
  (Clair/Sombre/Système, défaut système, persisté, anti-flash, bascule dans la sidebar sous « Déconnexion »),
  tokenisation, **seconde palette sombre mesurée** (le rouge `#a30402` tombait à 1,2:1 sur fond sombre), balayage des
  fonds, familles **ambre** et **bleu** nouvellement tokenisées. Tous ratios ≥ 4,5:1. **Hex en dur : 235 → 181**, les
  restants justifiés (blancs texte-sur-rouge, plan/tracé hors diff, marqueurs de carte, data-viz catégorielle).
- **40** (`080a067`) — **Retrait du commutateur de process de l'onglet « Réponses »**. Ses compteurs comptent la
  population « EN COURS » (réponses EXCLUES, cf. docstring `process-compteurs`) → ils contredisaient le contenu (« 0
  demande en cours » à côté de permis téléservice ayant répondu). `ONGLETS_DEMANDES` = `['a_demander','en_cours']`
  (plus 'reponses'). **Effet de bord traité** : la prop `process` filtrait le CONTENU de « Réponses »
  (`dansProcess` sur la liste + 2 sous-blocs rail-spécifiques) → `ReponsesVue` ne prend plus `process` : la liste
  affiche TOUS les rails, les 2 sous-blocs sont rendus inconditionnellement (états vides gérés).
- **41 → 45** (`c050206`, `fe77536`, `63e15cd`, `ccfcd12`, `8c2e9d8`) — **CHANTIER « THÈME SOMBRE — FONDS »**, découpé
  PAR MOTIF (pas par écran). **Motif racine** : collision fond-dur / texte-token — un fond blanc codé en dur (`#fff`,
  `bg-white`) qui NE bascule pas, sous un texte en token de charte qui bascule → texte pâle sur fond blanc en sombre.
  **Correctif uniforme** : blanc en dur → `var(--color-svv-surface)` (= `#ffffff` EXACT en clair → **zéro changement
  de rendu clair**, invariant vérifié lot par lot). Découpage : **L41** toggles inactifs + champs de saisie (+ 2 écrans
  pré-auth login/mot-de-passe) ; **L42** surfaces cartes/panneaux/modales + conteneurs clairs verrouillés (motif E →
  `var(--color-svv-field)`) ; **L43** canvas du graphique d'activité + schéma des bâtiments (2 tests-gardes figeant
  `fill="#fff"` sur l'empreinte → migrés vers `var(--color-svv-surface)`) ; **L44** 2 stragglers motif C de `tuiles.tsx`
  (note de compaction, panneau du sélecteur de communes) ; **L45** motif INVERSE — un token de TEXTE (`ink`) employé
  comme FOND s'inverse mal en sombre : info-btn survol/focus → texte `var(--color-svv-bg)` ; **4 infobulles** ink →
  `var(--color-svv-tip-bg)` (reste sombre dans les 2 thèmes) ; bordure `#d7dbe1` → `var(--color-svv-line-strong)`.
  **Non-bugs laissés** (ink-fond mais texte `surface` → s'inverse bien) : `ReglagesVue`, `PermisRattachementRendu`
  (figés par `themeSombreLot2.test`). **Convergences claires assumées** (tolérance ΔRGB ≤ 10 actée au L39) :
  `#f4f4f5`→field (Δ≤1), `#eceef1`→field (Δ≤7) ; `#d7dbe1`→line-strong (Δ=0). **NON-corrections décidées** : hachure
  `rgba(0,0,0,.05)` de `styleTrameDetail` (texture décorative, rien d'illisible) ; trame « hors parcelle » du schéma
  laissée CLAIRE (texture catégorielle ; l'intérieur de parcelle bascule comme un panneau) ; **pas de lot « bordures »**
  — les hex restants (marqueurs Leaflet, liserés décoratifs `#f3c9c9` du L39, badges data-viz, légende du tracé
  d'emprise) sont des faux positifs du §3 sans token équivalent. **Hex en dur non-test (admin)** : 235 (recon) → 181
  (L39) → 143 (L41) → 125 (L42) → 114 (L43) → 112 (L44) → **107** (L45). Golden Asnières hors diff sur tout le chantier.

### SÉRIE 46 → 51 (session courante) — « En cours » affiné · fil lisible · tester en analyse (tous committés)
- **46** — « En cours » scindé en DEUX familles (`categorieEnCours`, exhaustif/exclusif : *1re réponse* / *à relancer*)
  + pastilles de LIGNE (rouge « incomplet (N) ») et d'ONGLET, pilotées par un **PRÉDICAT PUR PARTAGÉ serveur/client**
  (`demandeEnCoursIncomplete`, `demandesListe.ts`) → invariant **compteur d'onglet == somme des pastilles de ligne**
  (une ligne = 1, jamais 2) FIGÉ par test.
- **47 + 47-bis** — signal « **nouvelles pièces reçues** » (ÉVÉNEMENT `demandeADeNouvellesPieces`, badge BLEU + bouton
  « vu »), **migration 188** `dossier_pieces_acquittement`. **LEÇON 47-bis** : ma spec « relance manuelle OU automatique
  acquitte » ignorait que la relance sur réponse partielle (PART-E) est déclenchée PAR l'arrivée des pièces → toujours
  postérieure → le signal s'**auto-annulait avant lecture** (vu en réel sur la 154). Corrigé : **seuls les gestes de
  l'utilisateur acquittent** (`j.auteur IS DISTINCT FROM 'auto'` + **date DÉCLARÉE prime** sur l'horodatage), figé par test.
- **48** — la relance sur réponse partielle (PART-E) apparaît dans la FRISE (`friseSuivi`/`historiqueEnvois`, categorie
  'reponse'). **Décision métier COEXISTENCE ASSUMÉE** : deux systèmes de relance INDÉPENDANTS (cascade partielle ≠
  PART-E), on NE réconcilie PAS ; échéances de cascade et **butoir CADA intacts** (PART-E n'incrémente pas le compteur
  de cascade — cf. §6 LOT 51-C).
- **49** — horodatages en **Europe/Paris** (`horodatageParis.ts` : `formaterHorodatageParis`/`jourParisISO`/`jourFrParis`),
  **5 surfaces** touchées. Discriminant = **présence d'un `T`** : instant UTC (« …T09:16Z ») → converti ; date CIVILE
  (sans T, ancrée **12:00 Europe/Paris** au LOT-1) → **JAMAIS re-convertie** (la convertir la décalerait d'un jour).
- **50** — libellés du fil (`BlocFilEchanges`/`MentionEchanges`) : « **N e-mails échangés** » (mails réels seuls) vs
  « **M affichés · dont K relance(s) déclarée(s) (hors e-mail)** » → lève la fausse contradiction « 9 » vs « 10 ».
- **51-A/B** (`51283cb`) — **TESTER un dossier incomplet EN ANALYSE**, **migration 189** `dossier_test_analyse` (marqueur
  RÉVERSIBLE par dossier, `testAnalyseRepo.ts`). Ouvre la porte FIX-2 (`OR s.id = ANY($1)`, `projectionFileRepo`) SANS
  lever le partiel → **les relances continuent**. **Décision (a) = OPTION B** : pendant le test le dossier **DISPARAÎT de
  « En cours »** (exclu de `estEnCoursAffichee` + `ligneEnCoursASignaler` + affichage `SuiviDemandes`), exclusivité
  préservée, compté une seule fois (invariant RE-figé par test). **DEUX retours** : (1) une relance **envoyée OU déclarée**
  depuis Analyse (`/demander-pieces`) efface le marqueur ; (2) bouton manuel « **Remettre dans En cours** »
  (`/projection {retour_en_cours}`, SANS envoi). Échéances/cascade JAMAIS touchées (le marqueur n'écrit QUE
  `dossier_test_analyse`, PROUVÉ par test). **Décision (2)** : l'altitude n'entre PAS dans `peutValider` normal. **Hors
  périmètre = 51-C** (voir §6).

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
  hauteur d'un immeuble sorti après le vol LiDAR — **le cas le plus dangereux** (c'est justement l'obstacle qui
  invalide un certificat). **Décision Régime 2** : ne PAS substituer une valeur plus faible ; **MARQUER le certificat
  « à revérifier »** (un polygone neuf plus proche que la distance certifiée est un signal suffisant, fonde une
  re-certification).
- **Prérequis techniques identifiés** : index sur `batiment.cleabs` (absent) ; historiser une 2ᵉ édition BD TOPO
  (table séparée ≈ +426 Mo, lecteurs inchangés) ; **capturer le `cleabs` de l'obstacle du verdict dans le snapshot**
  (absent : `obstaclesParBalayage` renvoie `{distanceM, altitudeSommetM, source}` sans `cleabs`) ; aucun seuil
  « vrai changement vs re-numérisation » calibrable avant une **2ᵉ édition réelle**.
- **Permis de construire** = recours d'arbitrage / borne réglementaire (PLU), **pas une source de mesure** ;
  chiffrage Sitadel documenté (ordre de grandeur du volume à traiter). Voir aussi `docs/SOURCES_DATA.md` (licences).

## 6. État courant & prochaine action
- **Working tree PROPRE** (rien de non committé). Dernier commit : **`51283cb` (LOT 51-A+B)** + ce présent commit docs
  §6. Le push est le geste d'Arno depuis VS Code, **au fil de l'eau** — ne pas raisonner en « compteur d'avance » (vrai
  une minute, faux la suivante). Chaîne de la session courante : LOTs **46 → 50** puis **`51283cb`** (LOT 51-A/B).
- **Migrations** : livrées jusqu'à **189** — **188** (LOT 47, `dossier_pieces_acquittement`) et **189** (LOT 51,
  `dossier_test_analyse`) ; Arno les applique au fil de l'eau. **Code RÉSILIENT** si une migration n'est pas encore
  passée (`42P01`/`42703` → comportement d'avant — vérifié : `test:integration` VERT avec 189 non appliquée). Contrôle de
  fin courant : `npm test` **463 fichiers / 6017 tests** · `test:integration` **23 / 110**. Les DEUX cascades —
  ordinaire ET partielle — partent en AUTO (LaunchAgent /15 min) ; l'envoi manuel = option hors calendrier.
- **Aucun chantier en cours** : Arno enchaîne des « LOT N » séquentiels ; attendre le prochain.
- **ÉVÉNEMENT MARQUANT DU 01/09/2026 — PREMIER DÉPÔT TÉLÉSERVICE PARIS RÉEL de bout en bout** (demande **161**) : la
  relève déclenchée (LOT 34) a marché, l'accusé a été détecté, la référence **`SLC260901542604` extraite** — mais
  l'écriture a échoué (défaut corrigé au **LOT 35**). **Leçon** : DEUX maillons marqués « ça devrait marcher » sans
  avoir jamais tourné en réel ont échoué au premier passage (câblage relève au clic, LOT 34 ; écriture référence,
  LOT 35). **Corollaire : exercer chaque maillon EN RÉEL avant de le déclarer acquis.**
- **3e MAILLON JAMAIS EXERCÉ, À OBSERVER** : la demande **154 (Aubervilliers, `partiel_le` au 28/08/2026)** est le
  SEUL dossier en régime partiel. Sa **première relance partielle AUTOMATIQUE** (cascade partielle auto, LOT 30bis)
  est attendue **vers le 7 septembre 2026** — premier tir réel de ce maillon, **à observer ce jour-là**.
- **Pistes ouvertes signalées à Arno** (à sa main) : (a) ~~harmoniser l'affichage horaire du fil~~ **RÉSOLU au LOT 49**
  (tout le fil est en Europe/Paris) ; (b) **réduire l'échelle de base du PREMIER rendu de la
  liseuse** (rendu à 1× + remontée au zoom) — le cache de rendu (LOT 25) rend le RETOUR instantané mais n'accélère PAS
  le premier rendu d'un plan jamais vu (plan A0 le plus dense d'Aubervilliers : ~3,5 s à froid, ~0,65 s à chaud) ;
  (c) **thème sombre — les FONDS sont traités** (chantier 41-45, grep par motif) ; ce qui RESTE = un parcours VISUEL
  écran par écran en sombre, pour ce qu'aucun grep ne voit (contrastes réels perçus, superpositions, survols) —
  Statistiques, Pilotage Moteur, Curation, Banc de test, Audit, Administratif.
- **PROCHAINE ACTION = LOT 51-C** (lot À RISQUE, isolé exprès par Arno) : **sortie DÉFINITIVE vers Rattachement** d'un
  dossier testé, conditionnée à **DOUBLE condition : empreinte validée ET `nbCorpsSansAltitude === 0`** (l'altitude ne
  doit PAS entrer dans le `peutValider` de la validation NORMALE — décision (2) : ne pas changer l'existant pour un cas
  nouveau ; la garder pour le SEUL geste de sortie du test), avec **arrêt EXHAUSTIF des relances**.
  ⚠️ **FAIT PROUVÉ EN RECON — à reporter TEL QUEL** : il n'existe **AUCUN point unique d'extinction**. `statut='close'`
  arrête la cascade ORDINAIRE (`relanceAuto`/`envoiRelance` filtrent `statut='envoyee'`) mais **PAS** la cascade PARTIELLE
  ni la relance sur réponse partielle (PART-E) — les deux filtrent `statut IN ('envoyee','close')`. `partiel_leve_le`
  arrête ces DEUX-là mais **RÉACTIVE** la cascade ordinaire (la suspension tombe). ⇒ il faut les **DEUX gestes ENSEMBLE**
  (`close` **+** `partiel_leve_le`). **PIÈGE AVÉRÉ** : `cloturerDemande` ne pose QUE `'close'` → une demande close mais
  restée partielle-active continue de recevoir ② et ③. Décision (3) validée par Arno : la sortie pose bien les DEUX.
  **TEST INDISPENSABLE** : « `close` + `partiel_leve_le` ⇒ **0 candidat aux TROIS systèmes** » (`relanceAuto`,
  `cascadePartielleAuto`, `relanceReponsePartielleAuto`). Réutilise le marqueur `dossier_test_analyse` (efface à la sortie)
  et la chaîne `validerProjection` existante (`permis_projection` + `permis_rattachement` en_attente_bati).
- **Boucle standard d'un LOT** : recon lecture seule → implémente → contrôles de fin dans l'ordre → commit (`-F`, sans
  Co-Authored-By, sans push).

## 7. Format des livrables (pour une conversation web en relais)
Pour chaque instruction technique, un **bloc copiable** précédé d'un titre à pastille :
- 🔵 **PROMPT** — travail en relais manuel (l'agent Claude Code produit un DIFF, Arno vérifie puis commit). TOUJOURS
  préciser DANS QUEL TERMINAL.
- 🔴 **PROMPT AUTO** — prompt qui déclenche un run autonome multi-subagents (`/svav-build`, etc.) : vigilance accrue,
  contrôle a posteriori, commit toujours manuel.
- 🟢 **COMMIT** — message à coller dans la boîte de commit de VS Code.
Ne JAMAIS mélanger prompt et commit dans le même bloc. Tout run autonome porte 🔴, jamais 🔵.
