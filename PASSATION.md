> Passation générée le 31/08/2026 à 23h21

# PASSATION — Application « Sans Vis-à-Vis® » (module Veille Permis)

## 1. Rôles & workflow
- **Arno** (a.jorel@sansvisavis.com) = fondateur **non-développeur** de **Sans Vis-à-Vis** (sansvisavis.com),
  agence/plateforme de certification immobilière « vue dégagée » (Paris + petite couronne). Décide seul,
  français, tutoiement, direct.
- **Claude** = architecte / relecteur / exécutant. Dans CETTE session, Claude Code travaille **directement
  dans le repo** (recon → implémente → lance les contrôles → **committe lui-même**, sans push). Pour la
  passation vers une conversation web, garder le format relais (cartouches).
- **Repo** : github.com/Moutchxp/app · branche `main`. **Stack** : Next.js 16.2.9, React 19, TypeScript 5,
  Tailwind v4, **PostgreSQL 17 + PostGIS en LOCAL** (driver `pg` sur `DATABASE_URL`, pas de Supabase).
- **Base LOCALE** : `postgresql://localhost:5432/sansvisavis`. Les migrations vivent dans `db/migrations/NNN_*.sql`,
  **livrées NON APPLIQUÉES** puis appliquées à la main par Arno (`psql -v ON_ERROR_STOP=1 -f …`). Dernière = **184**
  (LOT 30bis), **appliquée** en local ; **183** (LOT 27) a fait passer `relance_multi_adresse_active` à **TRUE** (multi-adresse
  = norme), **184** a ajouté `cascade_partiel_auto_active` (défaut TRUE) + la table `cascade_partiel_creneau`.

## 2. Règles de collaboration (impératives)
- **Un chantier = un prompt = un commit.** Recon **LECTURE SEULE** avant tout write sur fichier sensible.
- **CONTRÔLE DE FIN OBLIGATOIRE, dans l'ordre** : `npm test` COMPLET (= `vitest run`, **447 fichiers / ~5867 tests**)
  · `npm run test:integration` (23 fichiers, vraie base) · `npx tsc --noEmit` · delta eslint · `npm run build`.
  Les suites filtrées par chemin sont des contrôles RAPIDES, **jamais** le contrôle de fin (précédent
  `curation.test.ts` rouge 14/07→03/08, invisible aux filtrés). **INTERDIT : `npm run veille:run`** (envoi réel).
- **`jsdom`** est désormais en **devDependency**, utilisé par les SEULS tests qui exigent un montage React réel
  (cycle de vie / StrictMode), via l'en-tête `// @vitest-environment jsdom` en tête de fichier ; le RESTE de la
  suite reste en environnement **node** (tests purs / `renderToStaticMarkup`).
- **Tests** : ne jamais figer la FORME exacte d'un SQL émis (regex sur le WHERE) → asserter le COMPORTEMENT
  (réponse, **paramètres LIÉS**) + le SQL par **FRAGMENTS sémantiques** sur chaîne whitespace-normalisée
  (`sql.replace(/\s+/g,' ')` + `toContain`). Modèle : `curation.test.ts` (« entité supprimée »).
- **KNN spatial** : un `<->` ne lit JAMAIS son point d'un CTE multi-référencé (matérialisé → perd l'index en
  silence) → inliner l'expression dans l'`ORDER BY`. Les JOIN `ST_Intersects`/`ST_DWithin` NE sont PAS concernés.
- **Flakes connus** : renvoyer au registre `docs/FLAKES_CONNUS.md` (une entrée / flake, preuve explicite) — ne
  jamais présenter une hypothèse comme cause. `certificatPdf.test.ts` : cause **NON ÉTABLIE**, l'ancien
  diagnostic « octets non déterministes / timestamp » est **RÉFUTÉ** (générateur prouvé déterministe). Observé
  cette session : `gelRepo.test` échoue parfois en run parallèle (scan de fichiers), passe en isolé + en run complet.
- **Commits (cette session)** : `git add` des SEULS fichiers du lot · `git commit` · **PAS de push** · **AUCUNE
  ligne Co-Authored-By** · message via **fichier** (`git commit -F …`) car les backticks du message sont
  interprétés par zsh (bug rencontré au LOT 16).
- **2 fichiers Gemini HORS staging** : `app/lib/svv/adaptateurIaPhoto.ts` et `app/api/analyse-photo/route.ts`.
- **prefers-reduced-motion** respecté ; **exigence transverse mobile-first** (tout écran d'admin pleinement
  utilisable sur smartphone portrait). Un seul clic pour déplier ; **pas de `BlocRepliable` imbriqué**.
- Proposer les vrais choix (design/ressenti) AVANT d'implémenter ; sinon décider et le dire. Ne jamais conseiller
  de faire une pause. **Recon qui contredit une prémisse → la recon gagne** (précédents LOT 2 bigint, LOT 14 arrêt).

## 3. Objectif
- **Global** : transformer « sans vis-à-vis » en une norme mesurable/certifiable (verdict géométrique ≥ 40 m +
  score de qualité de vue /100), avec à terme une **interface d'administration pilotable sans code** par Arno.
- **Chantier en cours** : le **module admin « Veille Permis »** — suivi automatisé de la boucle CRPA (demandes de
  communication aux mairies → relances → saisine CADA), écrans **« À demander » / « En cours » / « Réponses » /
  « Archives » / « Analyse »**, avec relance/saisine **automatiques par e-mail** (LaunchAgent /15 min).
  Les LOTS 13→22 de cette session ont porté sur l'encart de détail « En cours » (frise, familles) et l'envoi.

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
  (corpus figé 25-26/07/2026 : fraîcheur LiDAR/BD TOPO, contrôle mixte & ses 2 régimes, sources externes de
  hauteur du bâti neuf, cadre juridique des permis, chiffrage Sitadel, conformité/licences).
- **IDEMPOTENCE StrictMode (leçon LOT 24)** : tout effet de la liseuse DOIT être idempotent sous le StrictMode de
  React (montage → démontage → REMONTAGE même-fibre, où les refs PERSISTENT mais les effets rejouent — ON par défaut
  en dev Next 16). **Ne JAMAIS s'appuyer sur un flag de cycle de vie mis à `false` au démontage sans être remis à
  `true` au remontage** (piège `monteRef` : reste `false` sur le montage réel → UI gelée). Dériver la « fraîcheur »
  d'une donnée live (ex. `pieceIdRef`), jamais d'un flag collant.

## 5. Historique — ce que fait déjà la Veille Permis (synthèse)
Moteur pur + repos + écrans admin autour de l'entité **demande** (statuts `brouillon/prete/envoyee/close`) et de
ses **dossiers** (permis Sitadel). Points clés hérités :
- **Cascade ordinaire** (absence totale de réponse) : Rappel (J-10) → Avis (J-3) → Saisine annoncée (échéance) →
  dépôt CADA (échéance + 4 j). Réglages en `config_veille` (`relance_rappel/avis_jours_avant`, `relance_saisine_delai_jours`).
- **Cascade partielle** (mairie a répondu, pièces manquantes → marqueur `demande.partiel_*`, CASC-1) : relances
  1..N (J+10/J+20), annonce CADA (J+30), saisine ≥ butoir CASC-2 (`partiel_le + 1 mois + 4 j`). Réglages
  `cascade_partiel_*` (migration 179). **Les DEUX cascades partent en AUTO** (ordinaire `relance_auto_active`,
  partielle `cascade_partiel_auto_active` — voir LOT 30bis ; tous deux défaut TRUE) ; l'envoi manuel reste possible
  (relance hors calendrier). ⚠️ **L'ancienne mention « relance partielle = envoi MANUEL » est PÉRIMÉE.**
- **Rattachement des réponses** (`rattachementReponse.ts`) : 100 % par IDENTIFIANTS (In-Reply-To/References ∩
  Message-ID émis, réf. SVAV, n° dossier Sitadel, réf. mairie) — **jamais** par l'adresse d'expéditeur. Relève IMAP
  par domaine.
- **Sources d'adresse d'une commune** : `demande.dest_email` (figé), `mairie_contact.email` (canal='email',
  statut 'confirme' vs 'presume'), `mairie_prada.courriel`, `demande_reponse.de_adresse` (répondants).
- **Encart de familles** (`encartFamilles.ts`, socle UNIF-0, partagé En cours/Réponses/Analyse/Archives) :
  `ORDRE_FAMILLES` + règle `familleAffichee(onglet, famille, nonVide)`. Familles : contact, suivi_actions,
  completude, historique, caracteristiques, batiments, pieces. Rendu paresseux (`BlocRepliable`, render-prop).

### LOTS de CETTE session (13 → 30, tous committés, working tree propre)
- **13** — Compteur de familles manquantes (rouge) dans le titre « Complétude des pièces » + historique de nos
  envois. `historiqueEnvois.ts` (pur), `completudeRepo.manquantesParDossier`.
- **14b** — **Liseuse de pièces** (`LiseusePieces.tsx`, lecture seule, best-of + aperçu PDF pdf.js) montée en tête
  de « Pièces du permis ». Duplication assumée du rendu pdf.js (le tracé `BlocTraceEmprise` reste indépendant,
  bit-à-bit inchangé) ; règles best-of IMPORTÉES de `TraceEmpriseRendu.tsx`.
- **15** — Famille « Suivi et actions » = **une seule frise chronologique** (fond de l'état de cascade dans la frise).
- **16** — Libellés de la frise + pli « Texte de la demande » uniformisé sur la ligne des familles (`BlocLignePli`).
- **17** — Fonds blancs des corps · vocabulaire aligné (« Relance pièces complémentaires », plus « Cascade
  partielle ») · mention « N échanges — dernier le … » sur « Historique des échanges ».
- **18** — **Parcours complet projeté** (`friseSuivi.projeterParcours`, pur) : étapes faites ET à venir datées,
  dérivées à chaque rendu de la config (pilotage sans code) ; **position courante** = liseré rouge sur la dernière
  étape franchie ; bifurcation ordinaire→partiel (badge, futur ordinaire non survenu disparaît).
- **19** — « Historique » : ouverture directe (retrait du 2e pli) · mention corrigée = **dernier mail RÉEL**
  (déclarations exclues ; ⚠️ le fil `BlocFilEchanges` affiche encore les heures en **UTC**, la mention en Paris —
  divergence pré-existante à harmoniser un jour) · destinataire sur chaque étape d'envoi.
- **20** — **Multi-adresse des 2 dernières relances** (opt-in `relance_multi_adresse_active` défaut FALSE, migration
  182). Fonction pure `composerDestinatairesCommune` ; règle = dest_email ∪ mairie_contact **confirmé** ∪ prada ∪
  répondants (presume EXCLUS) ; TOUT en To ; injection gated dans `envoiRelance` (avis+saisine) et
  `cascadePartielleRepo` (dernière relance+annonce) ; trace dans `demande_journal.details`. **55/137 communes ≥ 2
  adresses.** Rattachement inchangé (par identifiant).
- **21** — Adresse sur TOUTE étape d'envoi (la bifurcation lit `details.destinataire` du journal réclamation) ·
  « Contact mairie » remontée en tête de `ORDRE_FAMILLES`.
- **22** — « Contact mairie » titre seul (suffixe LOT 9 retiré) · encart AVANT le pli « Texte de la demande » ·
  « Nous avons écrit à » retiré · **adresse stockée = CERTAINE** (« présumé » seulement si aucune adresse stockée) ·
  **liseuse plus rapide** : document pdf.js mis en cache par pièce (plus de re-téléchargement au changement de page),
  module mémorisé, échelle bornée, instrumentation `console.debug` par phase. Tracé bit-à-bit inchangé (prouvé).
- **23** (`6346366`) — **Préchargement des plans voisins + cache LRU de DOCUMENTS** (borné à 4). Précharge en tâche de
  fond (requestIdleCallback) le document suivant puis précédent du best-of → « suivant › » instantané. Recon : les
  octets sont servis par **URL signée MinIO** (pdf.js télécharge en direct, pas de proxy Next), **Range supporté** ;
  tailles médiane ~0,6–1 MB, max 21 MB, ~100 MB/dossier (d'où la borne LRU). Tracé bit-à-bit inchangé (prouvé).
- **24** (`ad67372`) — **CORRECTIF d'une régression du 23** : le flag `monteRef`, mis `false` au démontage et **jamais
  remis `true` au remontage**, restait `false` sur le montage réel sous le **StrictMode de React** (double-invoke
  même-fibre, **ON par défaut en dev Next 16**) → overlay « Chargement… » figé, plus aucun plan affiché. Remplacé par
  un **garde de fraîcheur « live »** sur `pieceIdRef` (immunisé au nombre de montages) ; overlay effacé dans **TOUS**
  les cas de sortie via `finally`. Test de non-régression `LiseusePieces.strictmode.test.ts` (jsdom).
- **25** (`d72595a`) — **Cache LRU des RENDUS peints** (ImageBitmap, clé `pièce:page:échelle`, borné à 6 = un best-of
  complet) → retour sur une page déjà peinte = drawImage immédiat, aucun `render()`. **Apparition d'un coup** : rendu
  HORS écran, montré seulement une fois terminé, indicateur **« Rendu… » DISTINCT de « Chargement… »** (calcul vs
  réseau). Le zoom (CSS) ne change pas la clé. Test `LiseusePieces.renducache.test.ts` (jsdom). Tracé inchangé.
- **26** (`523f635`) — « Contact mairie » : **gabarit UNIFORME des lignes** (fini le `<ul>/<li>` à puces, **filet
  uniforme** ; nom et date affichés **seulement s'ils existent** ; destinataire sans date **rejeté en fin de liste**).
  Pli « Texte de la demande » **remonté en 1re position**, périmètre « En cours » seul — **revirement assumé du
  LOT 22** (qui l'avait placé après l'encart « Contact mairie »).
- **27** (`43901b8`) — **Destinataires des relances, deux règles.** **A (défaut général)** : toute relance part vers
  la **dernière adresse qui nous a répondu** (`demande_reponse.de_adresse` le plus récent), repli `dest_email` figé →
  `mairie_contact` confirmé → prada (`choisirDestinataireParDefaut`, branché sur la cascade ordinaire ; la partielle
  était déjà conforme via In-Reply-To). **B (les 2 dernières relances)** : les 2 dernières étapes de CHAQUE cascade
  (ordinaire avis+saisine ; partielle dernière relance+annonce CADA) partent à **TOUTES les adresses ayant participé**
  (`dest_email` ∪ contact confirmé ∪ prada ∪ répondants ; les 'presume' EXCLUS). **La multi-adresse devient la NORME** :
  `relance_multi_adresse_active` passe à TRUE par défaut (**migration 183**) ; le drapeau reste comme arrêt d'urgence
  (FALSE désactive B, A vit dans le code). `resoudreDestinatairesRelance` (A+B) ; `estParmiDernieres` extrait dans un
  module PUR `rangDernieres.ts` (utilisable côté CLIENT, frise, sans tirer `pg`). Frise véridique (« à toutes les
  adresses ayant participé » vs dernier répondant). Golden Asnières inchangé (aucun envoi).
- **28** (`04028fb`) — « Contact mairie » : **téléphone des interlocuteurs depuis leur signature de mail** (module PUR
  `telephoneSignature.ts`, fil cité coupé, qualification **directe/standard SANS déduction**, repli sur le standard
  commune avec source **« annuaire » visible**). **Aucune migration** : numéros dérivés au runtime. Couverture
  mesurée : **1/1 interlocuteur réel du corpus**.
- **30bis** (`cdf8f80`) — ⚠️ **LA CASCADE PARTIELLE EST DEVENUE AUTOMATIQUE.** Elle était 100 % manuelle **non par
  choix** mais parce que **CASC-3, livré en « préparation-only », n'avait jamais été câblé à la boucle de veille**.
  `executerCascadePartielleAuto` câblé dans `executerVeille` ; interrupteur `cascade_partiel_auto_active` (**défaut
  TRUE**) ; garde-fou anti-doublon par **réservation de créneau** (table `cascade_partiel_creneau`) — auto et manuel
  réservent le MÊME créneau, le **premier gagne** (exactement-une-fois). **Butoir CADA prouvé inchangé** (ancré à
  `partiel_le`). **Migration 184.**
- **30** (`2fcaab9`) — Titre **« Complétude des pièces & relance mail »** + option **« compte / ne compte pas »** sur
  une relance manuelle + **traçabilité de ce choix dans la frise**.

## 6. État courant & prochaine action
- **Working tree PROPRE** (rien de non committé). Dernier commit : **`2fcaab9` (LOT 30)**, tout **poussé**
  (`main` == `origin/main`). **Migrations 183 ET 184 APPLIQUÉES en local** : 183 a fait passer
  `relance_multi_adresse_active` à **TRUE** (multi-adresse des 2 dernières relances = NORME, LOT 27) ; 184 a ajouté
  `cascade_partiel_auto_active` (défaut TRUE) + la table `cascade_partiel_creneau` (LOT 30bis). **Les DEUX cascades —
  ordinaire ET partielle — partent désormais en AUTO** (LaunchAgent /15 min) ; l'envoi manuel n'est plus qu'une option
  hors calendrier.
- **Aucun chantier en cours** : Arno enchaîne des « LOT N » séquentiels ; attendre le prochain.
- **PREMIER PASSAGE À OBSERVER EN RÉEL** : la demande **154 (Aubervilliers, `partiel_le` au 28/08/2026)** est le
  **SEUL dossier en régime partiel**. Sa **première relance partielle AUTOMATIQUE** est attendue **vers le 7 septembre
  2026** — c'est le **premier tir réel de la cascade partielle auto** (LOT 30bis) à surveiller.
- **Pistes ouvertes signalées à Arno** (à sa main) : (a) harmoniser l'affichage horaire du fil `BlocFilEchanges`
  (**UTC**) avec la mention (Paris) — divergence pré-existante ; (b) **réduire l'échelle de base du PREMIER rendu de la
  liseuse** (rendu à 1× + remontée en résolution au zoom, arbitrage sur le critère du flou) — ancienne piste « LOT 26
  possible », le n° 26 ayant servi à autre chose ; le cache de rendu (LOT 25) rend le RETOUR instantané mais n'accélère
  PAS le premier rendu d'un plan jamais vu. **Chiffres mesurés** : plan A0 le plus dense d'Aubervilliers (dossier 7424,
  pièce 314, **3370×2384 pt, 21 Mo**) → render **~3,5 s à froid** (polices incluses), **~0,65 s à chaud**.
- **Prochaine action immédiate** : recevoir et exécuter le prochain « LOT » d'Arno (recon lecture seule → implémente
  → contrôles de fin dans l'ordre → commit).

## 7. Format des livrables (pour une conversation web en relais)
Pour chaque instruction technique, un **bloc copiable** précédé d'un titre à pastille :
- 🔵 **PROMPT** — travail en relais manuel (l'agent Claude Code produit un DIFF, Arno vérifie puis commit). TOUJOURS
  préciser DANS QUEL TERMINAL.
- 🔴 **PROMPT AUTO** — prompt qui déclenche un run autonome multi-subagents (`/svav-build`, etc.) : vigilance accrue,
  contrôle a posteriori, commit toujours manuel.
- 🟢 **COMMIT** — message à coller dans la boîte de commit de VS Code.
Ne JAMAIS mélanger prompt et commit dans le même bloc. Tout run autonome porte 🔴, jamais 🔵.
