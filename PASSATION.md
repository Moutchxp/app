> Passation mise à jour le 22/09/2026 à 17h25

# PASSATION — Application Sans Vis-à-Vis®

Colle ce document en tête d'une nouvelle conversation Claude : il donne le projet, les rôles, les
règles, les invariants, l'historique et la prochaine action, sans qu'Arno ait à réexpliquer.

---

## 1. Rôles & workflow

- **Arno** (a.jorel@sansvisavis.com) = **fondateur non-développeur** de **Sans Vis-à-Vis**
  (sansvisavis.com), plateforme de **certification immobilière de la vue dégagée** (« sans
  vis-à-vis »), Paris + petite couronne. Il arbitre le métier ; il ne code pas. Communication
  **en français, tutoiement, direct, sans flatterie**.
- **Claude Code = implémente + teste + COMMITTE lui-même en local.** Règles du commit :
  **`git add` des SEULS fichiers du lot** (jamais `PASSATION.md` en même temps qu'un lot de code,
  jamais `.env`, jamais les 2 fichiers Gemini) ; **aucune ligne `Co-Authored-By`** ; **JAMAIS de
  `git push`**. **Arno pousse lui-même depuis l'application Terminal de macOS.**
- **Tout bloc de commande livré à Arno doit préciser DANS QUEL TERMINAL le coller** (fenêtre MinIO,
  fenêtre serveur, fenêtre tunnel, ou une fenêtre libre) — il en a plusieurs ouvertes en permanence (§6).
- **Workflow relais** (quand Claude ne code pas lui-même) : Claude rédige des **cartouches
  d'instructions (FR)** → Arno les colle à l'agent Claude Code → l'agent produit les diffs, teste,
  committe → Arno pousse.
- **Repo** : github.com/Moutchxp/app — branche `main`. **Stack** : Next.js **16.2.9**, React 19,
  TypeScript 5, Tailwind v4, **PostgreSQL 17 + PostGIS 3.6.4 en LOCAL** (driver `pg` sur
  `DATABASE_URL` du `.env` ; plus de Supabase). MinIO/S3 pour les fichiers (jamais en base).
- ⚠️ **`AGENTS.md` en tête de repo** : « This is NOT the Next.js you know » — lire
  `node_modules/next/dist/docs/` avant d'écrire du code Next (APIs/conventions v16 différentes).
  Précédent utile : `NextRequest.ip` et `geo` ont été **retirés en v15** — vérifié dans cette doc.

---

## 2. Règles de collaboration (impératives)

- **Un chantier = un prompt = une modif logique = un commit.** Après chaque diff : vérifier, committer.
- **Recon LECTURE SEULE avant tout write** sur fichier sensible (moteur pur `app/lib/svv/*`, accès
  données `app/lib/db/*`, `app/lib/pdf/*`, `app/lib/email/*`, `app/lib/sitadel/*`, `app/lib/admin/*`,
  front `app/page.tsx`, golden `app/lib/db/pipeline.itest.ts`).
- **Livrables : toujours des blocs copiables labellisés** (voir §7). Ne JAMAIS mélanger prompt + commit.
- **Ne jamais conseiller de faire une pause / d'arrêter ; Arno décide seul.** Proposer plusieurs
  options AVANT d'implémenter sur un choix de design/ressenti.
- **2 fichiers Gemini HORS staging** : `app/lib/svv/adaptateurIaPhoto.ts` et
  `app/api/analyse-photo/route.ts`.
- **CONTRÔLE DE FIN OBLIGATOIRE = `npm test` COMPLET vert.** `npm test` = `tsc --noEmit && vitest run`
  (le typecheck est DANS le gate depuis le 22/09). État réel au 22/09 : **596 fichiers de test /
  7 880 tests** (+ 21 ignorés). Les suites filtrées (internaute / sitadel / permis) sont des contrôles
  RAPIDES en cours de travail, **JAMAIS** le contrôle de fin : **~114 fichiers vivent hors de ces 3
  sous-ensembles** (précédent : `curation.test.ts` rouge du 14/07 au 03/08/2026, invisible aux contrôles
  filtrés). Pas d'alias `test:tout`.
- **Les tests d'INTÉGRATION sont hors `npm test`** (`vitest.integration.config.ts`). Le golden
  `pipeline.itest.ts` se rejoue à part : `npx vitest run --config vitest.integration.config.ts
  app/lib/db/pipeline.itest.ts` (lecture seule, 0 écriture). ⚠️ Ne pas lancer TOUTE la suite
  d'intégration sans intention : certains `.itest.ts` écrivent en base.
- **Flakes** : registre versionné `docs/FLAKES_CONNUS.md`, à consulter AVANT de diagnostiquer. Flakes à
  **relancer** (ne rien corriger) : `serverOnly.guard` (ENOENT `__garde_eslint_tmp__.ts`),
  `comptes.test.ts`, et les tests jsdom sensibles au timing sous charge → `npx vitest run --maxWorkers=4`.
- ⚠️ **NE PAS classer « flake connu » un échec qu'on vient de provoquer.** Précédent du 22/09 : après une
  modification du générateur PDF, ~4 assertions de déterminisme tombaient. Mesure décisive : **4 échecs
  sur 5 exécutions avec la modification, 0 sur 5 sans** (`git stash` du seul fichier) → c'était un vrai
  bug introduit, pas le flake historique. **Toujours mesurer la fréquence avec ET sans sa modification.**
- **Déterminisme du PDF = invariant testé.** `certificatPdf.ts` doit rendre les MÊMES octets pour les
  mêmes entrées. Deux causes de rupture découvertes le 22/09, à ne pas réintroduire : (1) **mémoïser** un
  actif et rendre le même objet `Buffer` d'une génération à l'autre ; (2) **palettiser** un PNG à canal
  alpha — pdfkit décode ces PNG de façon ASYNCHRONE et numérote ses objets dans l'ordre d'achèvement.
- **Tests : ne jamais figer la FORME d'un SQL émis au runtime** → asserter le COMPORTEMENT (réponse,
  paramètres liés) + le SQL par FRAGMENTS sémantiques whitespace-normalisés. Idem pour la signature d'un
  composant dans un source-scan.
- **Mocks de rejet** : préférer `mockImplementationOnce(async () => { throw … })` à
  `mockImplementation(…)` permanent — un mock qui rejette indéfiniment produit des rejets non gérés sur
  des appels ultérieurs et fait échouer le test pour une mauvaise raison (vécu le 22/09).
- **KNN spatial** : un `<->` ne lit JAMAIS son point d'un CTE multi-référencé (matérialisation → perte
  d'index silencieuse) → INLINER le point dans l'`ORDER BY`. Vérifier par `EXPLAIN (ANALYZE, BUFFERS)`
  sur la requête RÉELLE. (JOIN `ST_Intersects`/`ST_DWithin` non concernés.)

---

## 3. Objectif à atteindre

- **Objectif GLOBAL** : certifier automatiquement qu'un logement est « Sans Vis-à-Vis® » (verdict
  géométrique binaire), produire un **certificat PDF** + une **note de qualité de vue /100**, et à
  terme une **estimation de plus-value**. Cible : transformer un terme subjectif en **norme mesurable,
  certifiable, auditable**. Objectif d'architecture verrouillé : **PILOTAGE SANS CODE** (voir §4).
- **Objectif du chantier EN COURS** : rendre le parcours public **utilisable depuis un vrai téléphone**
  et **prêt pour une mise en production**. Le lot « gains rapides » de l'audit du 21/09 est **soldé**
  (G1-G4 ✅, G5 ⬜) ; la journée du 22/09 a traité les défauts constatés en test réel sur iPhone **et sur
  Android**. Le temps d'émission a été instruit et **arbitré** (T15, §6) : il reste ~3 s, par choix.
  Restent les items de mise en production (**T4** jeton dans l'URL du QR, **T3**, **T9**, **T10**, **T11**)
  et les finitions du certificat (§6).

---

## 4. Invariants verrouillés (garde-fous permanents)

> Le **code fait foi** (cf. `docs/INVARIANTS_SVAV.md`, prouvés `fichier:ligne`). Ne jamais les modifier
> sans accord explicite d'Arno.

- **Golden Asnières = `29.107259068449615`** (note Couche 1 /80), scellé `app/lib/db/pipeline.itest.ts`
  (rejoue Asnières : lat `48.90693182287072`, lon `2.269431435588249`, azimut 90, étage 2) **et** par un
  garde PUR sans base `app/lib/svv/golden.test.ts` (égalité STRICTE, dans `npm test`). Tout ce qui touche
  le score change le golden → recalcul + validation main + **rescellage en commit SÉPARÉ** (jamais pour
  « faire passer » un test : un écart = ALERTE).
- **Verdict binaire 100 % géométrique** : 1er obstacle réel ≥ **40 m** sur l'axe → `SANS_VIS_A_VIS`,
  sinon `VIS_A_VIS` (`THRESHOLD_M`). **Jamais couplé au score ni à la photo.** Toit obstacle = **MNS
  LiDAR lu DIRECTEMENT** (absolu, nettoyé) ; jamais sol+hauteur côté obstacle. Hors bâtiment / hors
  LiDAR → INDÉTERMINÉ (pas de certificat).
- **Hauteur de vision = FORMULE À PARAMÈTRE VARIABLE** : `hauteur_vision = etage × (hauteur_sous_plafond
  + 0,30 dalle) + 1,65 yeux`. Sous-plafond **choisi par l'internaute**, défaut **2,50 m**, fourchette
  **[2,40 ; 4,50] m** pas 0,10. **« 2,80 »** = coefficient plancher-à-plancher du SEUL cas par défaut
  (2,50+0,30 = `FLOOR_HEIGHT_M`), **PAS une constante**. **« 2,90 » = `FLOOR_HEIGHT_OBSTACLE_M`**,
  constante DISTINCTE (immeuble voisin sans hauteur BD TOPO), à NE PAS confondre. 1,65 = DÉFINITIF.
- **AUCUN ARRONDI nulle part.** Distances horizontales autoritatives en **Lambert-93 (EPSG:2154)**.
  **`ST_Force2D` jamais retiré** des opérations distance/raster.
- **Tolérances** : rattachement patrimoine 15 m ; point d'origine hors emprise 0,30 m.
- **Certificat** : `SAVV-AAAA-NNNNNN`, compteur **implémenté et atomique** (`db/certificatNumero.ts`)
  — contrairement à ce que dit encore `CLAUDE.md §6`.
- **`config_scoring`** : pondérations externalisées (39 colonnes, singleton id=1), lues au runtime,
  repli sûr `PROFIL_DEGAGEMENT_DEFAUT`.
- **`prefers-reduced-motion`** respecté pour toute animation.
- **EXIGENCE ARCHITECTURE — PILOTAGE SANS CODE** : toute variable de tout moteur DOIT être externalisée
  et éditable au runtime, jamais codée en dur ; toute nouvelle variable naît en table de config (type,
  défaut, plage validée). Cible : une interface d'administration native pour un non-développeur.
- **Sécurité auth** : `verifierJeton` épingle HS256 ; cookies httpOnly/secure/SameSite=strict ; gardes
  qui RELISENT `role/actif/perm` en base à chaque écriture. **Fail-closed depuis le 22/09 (M1)** : le
  rôle administrateur doit être une **claim POSITIVE explicite** — un jeton signé mais mal formé n'est
  plus admin par défaut.
- **NOUVEAUX garde-fous du 22/09 (ne pas défaire) :**
  - **Aucune URL de stockage ne sort vers un navigateur** dans l'espace client : l'application sert
    elle-même les octets des 3 documents (`Cache-Control: private, no-store`). Une URL signée porte
    l'endpoint S3 (injoignable hors du Mac) **et** est un laissez-passer transmissible vers un PDF
    nominatif.
  - **Aucune adresse temporaire dans un QR en production** : helper UNIQUE `lib/certificat/siteUrl.ts`
    (partagé par le PDF, l'e-mail et le visuel). En production, refus de http, localhost, IP privée,
    `*.trycloudflare.com`, ngrok → document NON fabriqué. En développement : accepté **avec
    avertissement** en console.
  - **L'attente de la base est bornée sur le SEUL chemin de l'analyse publique** (pool dédié
    `svav_analyse_publique`, `statement_timeout` 15 s, connexion 10 s, sélectionné par
    `AsyncLocalStorage` dans `lib/db/plafondAnalyse.ts`). **Pas de plafond global** sur le pool partagé :
    imports, veille, relève et scripts sont légitimement longs.
  - **Le limiteur de cadence ne doit jamais devenir une panne** : toute erreur de sa part LAISSE PASSER
    la requête.

---

## 5. Résumé de l'historique

### Le produit & le moteur (déjà en place)
- **Pipeline d'analyse** `app/lib/db/pipeline.ts` : `construireEntree(params)` (DB/LiDAR/géométrie) →
  `EntreeComplete` → `analyser(entree, profil)` (**PUR, aucune I/O**). Verdict géométrique + note
  Couche 1 /80 (61 faisceaux) + cartouches descriptives (score-only).
- **Gros back-office « Permis de construire »** (≈ 56 % du code) : veille Sitadel, relève IMAP des
  réponses mairies, GED, rattachement de polygones BD TOPO, projection, registre d'altitudes, saisines
  CADA, demandes (e-mail + téléservice). Dernier gros fil : **Rattachement** (migration 226).
- **Auth/RGPD** : argon2id, anti-énumération, voie de secours, consentement historisé + effacement,
  EXIF/GPS retirés des photos.

### Données (cf. `docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md` — À LIRE avant tout chantier données/verdict/certificat/permis)
Corpus figé les 25-26/07/2026 (ne rien redécouvrir) :
- **Couverture LiDAR = 1 km² de test à Asnières (92) seulement.** Rien sur 75/93/78 ni le reste du 92.
  `mns_bati_propre` VIDE. Aucun millésime LiDAR stocké. **BD TOPO ≈ mars 2026.** Aucune procédure de
  réingestion. Extension LiDAR : 32 Mo/km² → Paris+92+93 ≈ 16 Go, complet ≈ 90 Go.
- **Règle de contrôle mixte** : BD TOPO = **détecteur de changement**, jamais mesure du verdict.
  **Deux régimes** : `altitude_maximale_toit` remplie à 86-95 % sur le bâti MODIFIÉ récent (Régime 1, la
  règle marche) mais **~7-8 % sur le bâti NEUF** (Régime 2, la règle échoue — le cas le plus dangereux).
  **Brancher la règle sur la PRÉSENCE DU CHAMP (`IS NOT NULL`), jamais sur un seuil de date.**
  Décision Régime 2 : ne pas substituer une valeur plus faible → **MARQUER le certificat « à revérifier »**.
- **Hiérarchie des hauteurs** : CERTIFIER = LiDAR seul ; BORNER = PLU ; TRIER = BD TOPO/DPE ; RELIER = RNB.
  Permis = recours d'arbitrage, pas source de données.
- **Conformité Etalab** : mentionner source + date de MàJ. Parcs/jardins : licence IPR à vérifier.

### Nuit du 21 au 22/09 — fin du lot « gains rapides » (poussé)
- `4e58530` **M1 — autorisation fail-closed** : seul `role:'administrateur'` explicite donne l'admin ;
  le raccourci voie de secours l'exige aussi. Validé manuellement par Arno avant commit. `2abf307` coche.
- `bb8b6e8` **G4 — suppression de `/api/check-building`** (route publique morte, aucun appelant ; accord
  d'Arno). `4947de1` coche. Résidu d'alors : « throttle des routes publiques » → **soldé le 22/09 (T8)**.

### Journée du 22/09 — parcours public éprouvé sur iPhone via le tunnel (tout poussé)
Deux diagnostics en lecture seule ont ouvert la journée : **l'analyse publique qui expirait** et **le QR
du certificat qui n'ouvrait rien**. Résultats et correctifs :
1. `eddf022` **attente de la base bornée** sur le seul chemin public (pool dédié, 503 propre). Le
   diagnostic a prouvé que le calcul tient en **0,15 s à chaud / 0,69 s à froid** (réponse 2 Ko) et
   qu'aucun plafond pg n'existait : **la défaillance était l'acheminement** (tunnel rapide cloudflared —
   11 requêtes sans réponse sur 196, 7 reconnexions, 114 flux réinitialisés en 48 min).
2. `375f77c` **trois messages d'erreur distincts** dans le parcours (429 saturé / 502-503-504-524-530
   lien coupé / abandon à 60 s), au lieu d'un seul texte qui attribuait tout à la lenteur.
3. `f3b2ac5` **refus des adresses temporaires dans un QR en production** + les 3 copies de `siteUrl()`
   factorisées en un helper unique. Cause du QR mort : `SITE_URL` figée sur une ancienne IP locale du Mac,
   devenue injoignable après renouvellement du bail DHCP.
4. `87346c3` **documents de l'espace client servis par l'application** (fin de la redirection 302 vers
   MinIO, injoignable hors du Mac) ; `0fa1dc8` inventorie les 4 autres livraisons par URL signée (T7).
5. `1cbc327` **écran d'aperçu des 3 documents** avec boutons « Télécharger ce document » et « Retour »
   (retour sur l'analyse d'où l'on vient, dépliée). Aperçu PDF par **réutilisation de
   `app/verifier/PdfViewer.tsx`** (canvas PDF.js, build *legacy* choisi pour Safari iOS) — `<embed>` rend
   mal un PDF sur iPhone. Téléchargement = même route avec `?telecharger=1` (`attachment`).
6. `6fcbb86` **carte du certificat 8,4 s → ~4 s** : la cause n'était pas les tuiles en échec (8,1 et 8,8 s
   mesurés avec ZÉRO échec) mais la **rafale de ~100 tuiles lancées d'un coup** — congestion
   auto-infligée, médiane 1 236-1 460 ms par tuile contre 152-159 ms à **concurrence 8**. Les tuiles
   « fautives » répondent HTTP 200 en isolé. Budget total 20 s ajouté.
7. `f6dbb96` **PDF 996 → 360 Kio (−64 %)** : les images « en double » étaient des **masques alpha**
   (`/SMask`) ; la carte, pourtant opaque, en portait 286 Kio d'inutile. Carte en JPEG q80 (aucune mise à
   l'échelle : elle était déjà à 314 dpi), logos rééchantillonnés à 300 dpi. **Photo non touchée** (déjà
   JPEG à 226 dpi). Texte extrait identique caractère pour caractère, 1 page avant/après.
8. `0890df2` **limitation de cadence** (migration **227**, `config_cadence`) — solde le résidu de G4.
   `c66005f`, `ff2e6db` : registre d'audit tenu à jour.

### Après-midi du 22/09 — émission allégée et téléchargement des documents (tout poussé)
9. `c5c01ed` **T5-bis — le mail d'émission part APRÈS la réponse** (`after()`, comme l'instrumentation
   de `/api/analyse`). Mesure sur 8 émissions réelles : **2,83 à 3,74 s** (médiane ~3,10 s) retirés de
   l'attente. Traçabilité inchangée (statut `'envoye'`, `envoye_le`, `derniere_erreur` écrits par la même
   fonction, après la réponse) ; garde « jamais un 2e mail » conservée avant la réponse. `cd7b1b2` coche.
10. `2db2cb7` **téléchargement sans attribut `download` + erreurs non mises en cache** (correctifs A et C
    du diagnostic « 200 puis 401 sur la même URL »). **`SameSite` était hors de cause** : le cookie
    internaute est `Lax`, pas `strict`. Constat mesuré : un 401 de cette route rend **29 octets de JSON**,
    enregistrables sous un nom `.png` — d'où `Cache-Control: private, no-store` sur TOUTES ses réponses
    d'erreur (401, 404, 503, et aussi 400 et 409). `c0c1bb0` coche.
11. `3d6f159` **le bouton « Télécharger ce document » ouvre la FEUILLE DE PARTAGE native** quand
    l'appareil la propose (décision d'Arno) ; sinon il télécharge comme avant. A et C n'avaient pas suffi :
    même sans `download`, Safari iOS AFFICHAIT le PDF et rejouait la requête sans session. Désormais **le
    document est récupéré UNE SEULE FOIS à l'ouverture de l'aperçu** (`fetch` same-origin, donc avec le
    cookie) et devient un `File` ; ce même fichier sert à l'aperçu ET au bouton → **aucune requête réseau
    au clic**, la seconde requête ne peut plus exister. `navigator.share` est appelé **dans l'élan direct
    du geste, sans aucun `await` avant** (exigence Safari). **Testé en réel sur iPhone ET sur Android.**
    `96d2253` coche ; **le plan B (jeton de téléchargement à usage unique) est ABANDONNÉ** — sans requête
    au clic, il n'y a plus rien à authentifier.

---

## 6. État courant & prochaine action

### Dépôt
- Branche `main`. Dernier commit de code : `3d6f159` ; dernier commit de doc : celui-ci.
- **Migrations appliquées en local jusqu'à la 227 incluse.**
- ⚠️ **Arno pousse lui-même** : vérifier `git status` en début de session pour savoir ce qui reste local.

### Redémarrer la machine de développement (procédure vécue ce matin)
Depuis `/Users/macbookprom4arnaud/sansvisavis/app`. **Postgres redémarre seul** (service brew
`postgresql@17`). **MinIO NE redémarre PAS seul.** Trois fenêtres de terminal dédiées :

```
# fenêtre MinIO
./.minio/minio server .minio/data --address :9000

# fenêtre serveur
set -a && source .env && set +a && npm run dev

# fenêtre tunnel
cloudflared tunnel --url http://localhost:3000
```

L'adresse `*.trycloudflare.com` rendue par la 3ᵉ fenêtre **CHANGE à chaque lancement**.

### ⚠️ Piège `SITE_URL` (vécu 3 fois le 22/09)
Pour qu'un **certificat d'essai** ait un QR qui s'ouvre depuis l'iPhone, `SITE_URL` doit valoir
**l'adresse du tunnel EN COURS**, **puis le serveur doit être REDÉMARRÉ** (Ctrl+C dans la fenêtre
serveur, puis la commande ci-dessus). Le « Reload env » automatique **ne suffit pas** : la valeur
exportée dans la fenêtre au démarrage reste prioritaire. Chaque relance du tunnel rend **morts** les QR
émis avant — normal pour des essais ; la page reste consultable via
`<adresse du tunnel en cours>/verifier?ref=<référence>&doc=visuel`.
**NE JAMAIS écrire l'adresse du tunnel du jour comme une valeur durable** (ni en dur, ni en exemple).

### Décisions prises le 22/09 (à respecter, ne pas rouvrir sans Arno)
- **Arno** — l'adresse publique **`authentification.sansvisavis.com`** et le **tunnel Cloudflare nommé**
  se feront **LORS DU PASSAGE SUR UN VRAI SERVEUR, pas avant**. (Item T3 du registre ; le domaine porte
  aussi la messagerie Google Workspace → recon DNS préalable.)
- **Claude** — le **jeton de vérification passera derrière un fragment `#`** dans l'URL du QR (un
  fragment n'est jamais transmis au serveur, donc jamais journalisé). **À faire AVANT le premier
  certificat réel** (item T4 : aujourd'hui `?j=…` se retrouve en clair dans tout journal d'accès, ce qui
  contredit la règle écrite « le jeton n'apparaît dans AUCUN log »).
- **Claude** — les **liens des alertes e-mail (T7)** mèneront à la **page du permis dans le back-office**
  (session admin), **plus jamais à une URL signée** — avec la mise en production.
- **Claude** — **P1 (batcher les 61 faisceaux) DÉPRIORITISÉ** : le calcul mesuré ne prend que 0,15 à
  0,7 s. L'estimation « > 3 s » du 21/09 était structurelle et pessimiste.

### Décision d'Arno du 22/09 — l'émission garde ses ~3 s (NE PAS reproposer)
On **NE sort PAS** la fabrication des documents (carte, PDF) de la réponse d'émission, alors que ce serait
techniquement possible (répondre dès la frappe du certificat, fabriquer derrière). **Arno a tranché** :
l'internaute attend ~3 s **mais trouve ses documents PRÊTS immédiatement**, sans jamais rencontrer d'état
« en préparation ». ⚠️ **C'est un arbitrage produit, pas une dette** : classé ⏸️ *écarté* au registre
(**T15**) — ne pas le réinscrire comme « à faire ».

### Ouverts au registre (`docs/AUDIT_2026-09-21_diagnostic_code_et_dette.md`)
- **Finitions du certificat** (relevées par Claude le 22/09, non traitées) : **chevauchement du pied de
  page à côté du QR** ; **espace parasite** dans « Denfert -Rochereau » ; **lettres « fi » perdues** dans le
  texte extractible du PDF (ligature non mappée à l'extraction — l'affichage, lui, est correct).
  ✅ **Confirmés par Arno, à NE PAS « corriger »** : le siège imprimé **« 191-195 avenue Charles de Gaulle »
  est correct** ; les **tirets « — »** des blocs *Qualité de vue* et *Nuisances* **restent en l'état**.
- **T16** 📌 — une émission à **14,5 s** le 22/09 à 16:14 (`SAVV-2026-000029`), **sans défaut de code**
  (code à jour prouvé par le poids du PDF déposé ; le mail était bien hors de la réponse). Carte et SMTP
  ont ralenti ENSEMBLE → **hypothèse : dégradation passagère du réseau du Mac**. Rien à corriger ; à
  rouvrir seulement si le cas se répète sur un réseau sain.
- **T9** 🟠 — **`CADENCE_ENTETE_IP` à poser avec le tunnel nommé.** Next 16 n'expose plus l'adresse du
  socket ; la confiance est donc **déclarée**, jamais déduite d'un en-tête. **D'ici là, tous les
  visiteurs sans compte partagent un même compteur** (sûr, mais grossier à forte affluence). Les
  titulaires de compte sont comptés par compte et ne sont pas concernés.
- **T10** 🟠 — **confirmation d'adresse e-mail à l'inscription : choix produit d'Arno, à venir.**
  Aujourd'hui aucun envoi à la création ; atténué par le jeton-capacité qui impose un vrai parcours.
- **T11** 🟠 — **Cloudflare Turnstile avec la mise en production** (la cadence borne le rythme mais ne
  distingue pas un robot patient d'un humain).
- **Écran de réglage des seuils de cadence : absent** — édition en SQL sur `config_cadence` pour
  l'instant (l'écran Réglages existant appartient au module permis/veille, domaine différent).
- **Doublons `SMTP_PERSONNE_USER` / `_PORT` / `_PASS`** dans le `.env` (définis 3 fois chacun, seule la
  dernière occurrence compte) — **à nettoyer par Arno** (item G5).
- **Icône `apple-touch-icon` absente.**
- Autres items inchangés : G5, P1, P2, P4, M2-M5, F1-F5, T3, T4, T7.

### LA prochaine action immédiate
**AUCUNE en cours.** Le fil ouvert ce matin (parcours public éprouvé sur téléphone) est allé à son terme :
analyse, messages d'erreur, QR, livraison et aperçu des documents, émission, cadence — tout est livré et
poussé. **Demander à Arno ce qu'il veut faire ensuite** plutôt que de choisir à sa place.

Les candidats, tous inscrits au registre (§2 du document d'audit) et AUCUN engagé :
- **T4** 🔴 le **jeton de vérification voyage dans l'URL du QR** (`?j=…`) et se retrouve en clair dans tout
  journal d'accès → décision déjà prise (fragment `#`), **à faire AVANT le premier certificat réel** ;
- **finitions du certificat** ci-dessus (pied de page/QR, espace parasite, ligature « fi ») ;
- **T3 / T9 / T11** : tunnel nommé + `authentification.sansvisavis.com`, `CADENCE_ENTETE_IP`, Turnstile —
  tous trois **au passage sur un vrai serveur**, décision d'Arno ;
- **T10** confirmation d'e-mail à l'inscription — choix produit d'Arno ;
- **G5** nettoyage du `.env` (doublons `SMTP_PERSONNE_*`) — à faire par Arno.

---

## 7. Format des livrables (à rappeler au nouveau Claude)

Pour chaque instruction technique, produire un **bloc copiable** précédé d'un titre sans équivoque avec
une pastille emoji :

- 🔵 **PROMPT** — prompt de travail en relais manuel : l'agent Claude Code produit un diff, teste,
  committe. **TOUJOURS préciser DANS QUEL TERMINAL** l'envoyer.
- 🔴 **PROMPT AUTO** — prompt qui **DÉCLENCHE L'AUTOMATISATION** (`/svav-build` ou tout run autonome
  multi-subagents). Pastille rouge = vigilance accrue, contrôle a posteriori via le rapport final.
- 🟢 **COMMIT** — message de commit, si Arno committe lui-même depuis VS Code (Source Control).

**Règles** : tout prompt lançant un run autonome porte 🔴, jamais 🔵. Ne JAMAIS mélanger un prompt et un
commit dans le même bloc. **L'agent committe lui-même** (`git add` des seuls fichiers du lot, aucune
ligne `Co-Authored-By`) et **ne pousse jamais** — **Arno pousse depuis l'application Terminal de macOS**.

---

Arno : colle ce bloc au début de ta nouvelle conversation.
