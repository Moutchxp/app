# PLAN — Interface d'administration interne Sans Vis-à-Vis®

> Document d'architecture et de plan de construction. **Conception pure, aucun code écrit, aucun commit.**
> Rédigé après une reconnaissance en lecture seule du code réel (moteur de score, `config_scoring`,
> couche API/DB, données patrimoine, parcours front). Chaque décision est ancrée dans le code cité en
> `fichier:ligne`. À valider par le porteur avant tout chantier d'implémentation.

---

## 0. État des lieux — ce que la recon a établi (fondation du plan)

Tout le plan repose sur ces faits vérifiés. Ils sont plus favorables sur certains points (moteur déjà
config-driven) et plus lourds sur d'autres (rien n'est persisté, aucune auth) que ce que le cadrage
supposait.

### 0.1 Moteur de score — déjà 100 % config-driven, verdict découplé
- Le **score affiché** = `noteDegagement()` (`coucheDegagement.ts:197`) : somme des `distancePercueFaisceau`
  sur 61 faisceaux, minorée du malus couloir, normalisée par `plafondDegagement` (×80), + points
  d'orientation, clampée `[0, plafondCouche1=90]`. C'est **toute** la note aujourd'hui.
- **Couche 2 (photo /20) NON implémentée** : `scoreTotal.ts:44` renvoie uniquement `noteDegagement`.
  `famille1` (Résultat A, `scoreDegagement.ts`) et `famille2` (paysage) sont **calculées et conservées
  pour audit mais n'alimentent PAS le total** (`scoreTotal.ts:40-42`).
- Le **verdict** (`verdict.ts:103` `premierObstacle`) est purement géométrique (1er obstacle réel ≥ 40 m),
  calculé en amont dans `analyser()` (`analyse.ts:79`) et **n'entre jamais dans le score**. Invariant
  respecté dans le code. ✅
- **Point d'architecture décisif** : toute la géométrie extraite (`EntreeComplete` : obstacles, 61
  faisceaux, longueurs de nature, familles cleabs) est produite AVANT le chargement du profil et
  **NE DÉPEND PAS de `config_scoring`** — l'extraction utilise les constantes de code `ANALYSIS_RANGE_M`
  / `CONE_VUE_NATURE_DEG` (`pipeline.ts:118-132`), le profil n'est lu qu'à l'étape (g)
  (`pipeline.ts:174`) puis passé à la fonction **pure** `analyser(entree, profil)`. → **Changer une
  variable de score ne rejoue QUE le calcul pur, jamais la géométrie.** C'est ce qui rend l'aperçu
  d'impact golden *instantané et hors-DB* (voir §A-M1 et Étape 3).

### 0.2 `config_scoring` — singleton lu au runtime, mais schéma de base HORS VERSIONING
- Lue une seule fois par analyse dans `profilConfig.ts:57` (`SELECT … FROM config_scoring WHERE id = 1`),
  mappée en `ProfilDegagement`, avec **repli total** `PROFIL_DEGAGEMENT_DEFAUT` si la table est
  absente/vide/incohérente (`profilConfig.ts:74-78, 118-121`). Aucun writer dans le code.
- **46 colonnes** (dont `id`). Statuts (voir Annexe 1 pour le mapping complet) :
  **~38 VIVES**, **5 VESTIGIALES** (`boost_f2`, `forfait_cone_central`, `forfait_extremites`,
  `cone_f3_demi_angle_deg`, `natures_remarquables`), **1 DE GARDE** (`mode_combinaison`, liste fermée),
  **1 MIROIR** (`analysis_range_m`, garde-fou seulement).
- ⚠️ **DETTE CRITIQUE** : il n'existe **aucun `CREATE TABLE config_scoring`** dans le repo. Un dossier
  `db/migrations/` versionné existe (`001_bloc_b_schema.sql`, `002_bdtopo_batiment_vue.sql`) mais seul un
  `ALTER` touche `config_scoring` (`scripts/migration_config_scoring_orientation_annee_portee.sql`, il
  *suppose* la table préexistante). La table a été créée à la main. → **Le schéma dont dépendent le
  moteur, la config live ET le banc de test n'est pas reproductible.** À corriger en Étape 0.

### 0.3 Couche API/DB — stateless, lecture seule, aucune auth
- 6 routes (`app/api/*/route.ts`), pivot unique `analyserAdresse()` (`pipeline.ts:82`) appelé par
  `/api/analyse` (verdict + score) et `/api/analyse-photo` (enrichissement IA Gemini).
- Driver **`pg` (node-postgres) v8.21**, **un `Pool` unique** sur `DATABASE_URL` (`client.ts:8`),
  helper `query()`. **Aucune transaction** (parallélisme par `Promise.all` de `SELECT` autonomes).
- **~14 tables lues, 100 % en `SELECT`. AUCUNE écriture nulle part.** Enrichissement patrimoine dans
  `faisceaux.ts:102-106`.
- **AUTH : néant absolu** — pas de `middleware.ts`, aucune dépendance d'auth dans `package.json`, aucun
  cookie/session/rôle. Tout est public.

### 0.4 Parcours front — SPA éphémère, rien n'est persisté
- Tout le parcours vit dans `app/page.tsx` (~3080 lignes, machine à états `etape`). Ordre réel :
  accueil → étapes → **consentement = permissions device (caméra/orientation/GPS), PAS du RGPD**
  (`page.tsx:2128`) → photo (capture + cap boussole) → localisation (adresse BAN + point d'origine sur
  carte, validé live par `/api/origine`, obligation de déplacer, dans un bâtiment) → orientation
  (azimut ±30°) → infos (étage, hauteur sous plafond défaut 2,5 m bornes 2,40–4,50, dernier étage) →
  résultat (`EcranResultat`) → certificat (`EcranCertificat`).
- Analyse lancée par `handleAnalyse()` (`page.tsx:1888`) → `POST /api/analyse`
  `{lat, lon, azimut, etage, hauteurSousPlafondM, dernierEtage, mode}` + appel photo async.
- **PERSISTANCE : RIEN.** Zéro `INSERT`/`localStorage`/`cookie`/server action. `prenom/nom/email/telephone`
  restent en state React (`page.tsx:752-755`) ; le « submit » certificat = `setSoumis(true)` → écran
  placeholder. **Aucune table users/tests/certificats/consentement.**
- **Certificat PDF + numérotation `SAVV-AAAA-NNNNNN` : n'existent pas** (aucune dépendance PDF, aucun
  `SAVV-` hors specs). Seul le formulaire de collecte est en place.
- Bon point : un **design system SVAV** existe déjà (tokens `@theme` dans `globals.css` :
  `--color-svv-red #a30402`, `-ink`, `-green`, classes `.svv-btn/.svv-card/.svv-pill/.svv-label`) →
  l'admin les réutilise (coquille commune).

### 0.5 Données patrimoine — divergence de schéma (le nœud de la carte M4)

| Famille | Table(s) | cleabs | Cardinalité | source auto/manuel | Verdict |
|---|---|---|---|---|---|
| **Patrimoine mondial** | `monuments_emblematiques` + `monument_emblematique_batiment` | liaison dédiée (PK `monument_id,cleabs`) | **1→N natif** | ✅ `CHECK(auto\|manuel)` | ✅ **gabarit cible** |
| **Monuments Historiques** | `monuments_historiques` (1 table) | colonne unique nullable | **MONO** (176 MH, 152 rattachés) | ❌ | ❌ **à migrer** |
| **Inventaire (IA)** | `inventaire_general` (1 table dénormalisée) | colonne, `UNIQUE(ref,cleabs)` | multi-capable mais dénormalisé, 0 multi en pratique (306 notices, ~248 rattachées) | ❌ (`mode_rattachement` ≠ curation) | ❌ **à migrer** |

- Consommation moteur à réécrire lors de la migration : `faisceaux.ts:103` (MH), `:104` (Inventaire),
  `:105-107` (mondial) ; cartouche `obstacles.ts:826-829` (MH).
- Modèle « manuel jamais écrasé au ré-import » existe **uniquement** sur le mondial
  (`DELETE … WHERE source='auto'`). À généraliser (roadmap `ROADMAP_bati_patrimonial.md:26-29`).

### 0.6 Dettes/incohérences relevées (à traiter opportunément)
- `SPEC_ponderation_familles.md` : statut « non implémentée » alors que le code l'est (doc en retard).
- Commentaire périmé `scoreDegagement.ts:74` (« emblématique toujours false ») : la jointure est branchée.
- Commentaire périmé en tête de `coucheDegagement.ts` (« NON BRANCHÉ ») : `noteDegagement` EST branché via
  `scoreTotal.ts:44`.
- Incohérence doc **248 vs 250** rattachés Inventaire (`SOURCES_DATA.md:18` vs `ROADMAP:5`).
- Sécurité : `next.config.ts` autorise `*.trycloudflare.com` (dev) ; email `a.jorel@sansvisavis.com` en
  dur dans le User-Agent Overpass (`check-building/route.ts:36`).

---

## A. Analyse critique des 5 modules

### Module 1 — Pilotage des moteurs (config live)
**Faisabilité : élevée.** Le moteur est déjà config-driven (`config_scoring` → `ProfilDegagement`), et la
géométrie est indépendante du profil (§0.1) → l'aperçu d'impact est réalisable *sans re-requêter la DB*.

**Angles morts / risques à couvrir absolument :**
1. **Repli silencieux = danger n°1.** Toute écriture invalide fait retomber `chargerProfilDegagement()`
   sur `PROFIL_DEGAGEMENT_DEFAUT` **sans erreur visible** : `mode_combinaison` hors
   `{max,addition,sequentiel}`, `distance_max_m > analysis_range_m`, ou n'importe quelle colonne
   manquante/NULL (`profilConfig.ts:74-78, 118-121`). Un opérateur non-dev pourrait « éditer » le profil
   et faire basculer TOUT le scoring sur le défaut sans s'en rendre compte. → L'UI doit (a) **valider
   avant écriture** (bloquer `distance_max_m > analysis_range_m`, enum fermée), (b) afficher en
   permanence un **bandeau d'état « Profil personnalisé actif » vs « Repli par défaut actif (raison) »**
   calculé en relisant la table comme le moteur.
2. **Effet immédiat, pas de staging.** La config est lue *à chaque analyse* : une écriture prend effet
   pour le visiteur suivant, sans redémarrage. → Il faut un modèle **brouillon → aperçu → publication**
   (voir Étape 4 + versioning §C), jamais d'édition en place à chaud.
3. **Aperçu limité à un seul point.** Le golden Asnières ne prouve que la non-régression d'UN cas. Une
   variable peut être golden-neutre et déplacer d'autres configurations. → Prévoir un **petit panel
   d'adresses de référence** (Asnières + 2-3 cas typés : dégagé, vis-à-vis, cumul nature) recalculées
   dans l'aperçu, pas seulement le golden.
4. **Variables VESTIGIALES trompeuses.** Éditer `boost_f2` / `forfait_*` / `cone_f3_demi_angle_deg` /
   `natures_remarquables` **ne change rien** (mortes depuis l'Étape 2). Les laisser éditables induirait
   l'opérateur en erreur. → **grisées, lecture seule, badge « sans effet (héritage) »**.
5. **`analysis_range_m` = miroir.** L'éditer ne re-cadre PAS les faisceaux (l'extraction utilise la
   constante de code `ANALYSIS_RANGE_M`), elle ne fait que borner `distance_max_m` au chargement. →
   badge « garde-fou / portée réelle figée en code », effet partiel documenté.
6. **`mode_combinaison` de GARDE.** Aujourd'hui **plus consultée** par le calcul (la priorité de famille a
   remplacé le « max »), mais reste une **sentinelle** : une valeur invalide nuke le profil. → éditable
   mais **sélecteur verrouillé à la liste fermée**, badge « contrainte ».
7. **Couche 2 non pilotable.** L'exigence « piloter TOUS les moteurs » n'est *aujourd'hui que
   partiellement* satisfaisable : les constantes de la Couche 2 photo (Strate 1/2, propreté, courbes
   monuments) sont **en dur dans `config.ts`**, pas dans `config_scoring`. → À l'activation de la Couche 2,
   les externaliser d'abord (même patron). À signaler comme limite connue, pas à masquer.

### Module 2 — Statistiques trafic & comportement
**Faisabilité : moyenne — tout est à instrumenter (aucun tracking aujourd'hui, §0.3).**

**Angles morts / risques :**
- **Frontière RGPD anonyme/nominatif (cadrage §M2/M3).** M2 ne doit stocker que de l'agrégé/anonyme :
  pas d'IP brute (hash tronqué), pas de clé de jointure vers l'internaute nominatif de M3.
- **Tiers hors UE rouvre la conformité.** Un GA/produit US est à proscrire. Deux besoins distincts :
  (a) analytics web génériques (pages vues, sources) → outil **UE/auto-hébergé** (Plausible/Matomo EU,
  cookieless de préférence) ; (b) **métriques de tunnel spécifiques** (taux de complétion par étape,
  points d'abandon, conversion certificat/estimation) → **table d'events maison** minimale, car aucun
  outil générique ne connaît nos 9 écrans. → Trancher : **events maison pour le tunnel + éventuel outil
  UE cookieless pour le web**. Décision à confirmer par le porteur.
- **Consentement analytics** : si cookies → bandeau consentement ; le cookieless évite le sujet.

### Module 3 — Base internautes + RGPD
**Faisabilité : c'est le plus gros chantier — la persistance part de ZÉRO (§0.4).** Aujourd'hui l'email
n'est même pas stocké, et l'écran « consentement » n'est que des permissions device.

**Angles morts / risques (RGPD = structurant, pas un ajout final) :**
- **Il faut d'abord PERSISTER** (tests + internautes), donc **modifier le tunnel public** (`page.tsx`)
  pour (a) recueillir un **consentement actif RGPD** (case non pré-cochée, distincte des permissions
  device), (b) journaliser le consentement (**date + version + hash du texte**), (c) écrire le test.
- **Privacy by design** : base légale documentée ; information à la collecte (finalité dont prospection,
  durée, destinataires, droits) ; **chiffrement au repos** (pgcrypto colonne pour email/téléphone) **et en
  transit** ; accès restreint.
- **Droit d'effacement à distance** : lien « Accès à mes données » en pied de chaque email → espace
  self-service (consultation/rectif/suppression) via **jeton signé**, sans compte. L'effacement doit
  **cascader** aux fichiers S3 (photo/PDF) et aux certificats, pas seulement à la ligne SQL.
- **Rétention + purge auto** (durée définie, job de purge), **registre des traitements**, **portabilité
  (export)**, **traçabilité des consentements**, **workflow interne** des demandes de droits.
- **Stockage fichiers** : photos/PDF sur **S3 (OVH)**, la base ne garde que les URL (CLAUDE.md §7).
- ⚠️ **Validation juridique par un DPO/juriste obligatoire** — Claude n'est pas juriste ; le plan pose
  l'architecture technique, pas l'avis de conformité.

### Module 4 — Carte de curation unique
**Faisabilité : bonne, mais bloquée par un pré-requis de migration (§0.5).** La stack Leaflet
(`react-leaflet`) est déjà une dépendance et déjà utilisée (`MapSelector`, `FaisceauMap`).

**Angles morts / risques :**
- **Pré-requis bloquant** : MH (mono-cleabs) et Inventaire (dénormalisé) doivent migrer vers le modèle
  entité + liaison + source **avant** la carte, sinon 3 schémas à gérer (cadrage confirmé).
- **La migration touche le chemin d'entrée du score** (`faisceaux.ts:103-105` alimente
  `impactMH/impactInventaire/impactEmblematique`). Si elle **préserve l'ensemble des cleabs**, les flags
  sont identiques → **golden inchangé**. À **prouver** (re-run golden après migration ; rescellage
  seulement s'il bouge — il ne doit pas).
- **Sémantique d'état couleur** : rouge = entité sans cleabs (à placer) ; orange = liaison `source='auto'`
  non vérifiée ; vert = `source='manuel'` **ou** auto marqué « vérifié ». Prévoir un flag
  `verifie_manuellement` pour promouvoir un auto en vert sans changer `source`.
- **Manuel jamais écrasé** au ré-import (à généraliser depuis le mondial).
- **Multi-polygones des grands monuments** (Louvre, Versailles, Invalides, Grand Palais) : composition
  manuelle de plusieurs cleabs sous un même point.
- **Tolérance de rattachement 15 m** identique aux 3 familles — à préserver.

### Module 5 — Banc de test + débriefing
**Faisabilité : élevée — le harnais existe déjà** (`pipeline.itest.ts` rejoue Asnières via
`analyserAdresse`), et chaque faisceau porte déjà toutes les données nécessaires (`FaisceauResultat` :
`offsetDeg`, `distanceObstacleM`, `natureTraverseeM`, `impactMH/Inventaire/Emblematique/Annee`,
`scoreDegagement.ts:38-82`).

**Angles morts / risques :**
- **Deux notions de score parallèles** : `scoreFamille1` (Résultat A « factuel », distance+amplitude,
  **non affiché**) vs `noteDegagement` (Couche 1 /80, **LE score affiché**). Le rapport pédagogique doit
  dire explicitement lequel est officiel, sinon confusion garantie.
- **Décomposition faisceau par faisceau** : `analyser()` ne renvoie aujourd'hui que des agrégats + les
  cartouches. Il faut un **seam verbeux additif** (une variante qui expose, par faisceau : distance
  brute, famille détectée, coeff cône/flanc appliqué, diviseur cumul nature, cap distMax, contribution
  perçue finale). **Additif et pur → golden-safe** (aucune modif du chemin de calcul, juste une sortie
  détaillée).
- **Rejeu contre config live vs brouillon** : le banc doit pouvoir tourner avec le profil publié ET avec
  un brouillon M1 (boucle « change une variable → rejoue → observe »), en réutilisant l'aperçu pur de
  l'Étape 3.

---

## B. Hébergement de l'interface — décision

**Décision : MÊME codebase (l'application Next actuelle), mais ADRESSE DÉDIÉE ET FERMÉE — l'admin n'est
PAS exposé sur le domaine public.** L'admin est un groupe de routes `app/(admin)/…` + `app/api/admin/…`
du même projet Next (pour réutiliser le moteur et `config_scoring` in-process), servi en **production**
sous un **sous-domaine dédié `admin.sansvisavis.com`** — ou, plus étanche, un accès **strictement
interne** (VPN / réseau local, non publié sur l'internet public) — **jamais** sous un chemin du domaine
public (`sansvisavis.com/…`). Double barrière (défense en profondeur) : (1) **filtre réseau** en amont
(Cloudflare Access / allowlist IP / VPN) qui décide qui peut seulement *atteindre* l'adresse ;
(2) **auth applicative** (`middleware.ts` + session signée httpOnly) qui décide qui peut *entrer*.

> Distinction clé : « même code » ≠ « même URL ». On garde UN seul projet Next (bénéfice technique
> ci-dessous), mais on lui donne une **porte d'entrée séparée et verrouillée** pour l'admin.

**Justification ancrée dans le code réel :**
1. **Accès direct au moteur sans duplication.** Le moteur est un ensemble de fonctions **pures**
   importables (`analyser`, `noteDegagement`, `distancePercueFaisceau`) — l'aperçu d'impact (M1) et le
   banc de test (M5) les importent tel quel. Une app séparée devrait dupliquer le moteur ou l'appeler via
   API.
2. **Réutilisation du `Pool` DB unique.** `client.ts:8` expose un `Pool` sur `DATABASE_URL` ; les routes
   d'écriture admin réutilisent le même helper `query()` (et le futur helper transactionnel). Une app
   séparée dupliquerait les credentials et la couche d'accès.
3. **`config_scoring` est la source runtime in-process** (`profilConfig.ts`) : une route admin qui écrit
   `id=1` est **immédiatement effective** dans le même process. Aucun bus, aucune synchro.
4. **Leaflet déjà présent** pour la carte M4 ; **design tokens SVAV** déjà présents pour la coquille.
5. **Une APP séparée reste injustifiée** (un seul utilisateur interne non-dev) : dupliquer le projet =
   surface de déploiement, CI et duplication du moteur/DB inutiles. ⚠️ Nuance : un **sous-domaine dédié**
   n'est PAS une app séparée — il route vers le **même** déploiement Next ; c'est une frontière
   d'**adresse/d'accès**, pas un second code à maintenir (cf. Décision ci-dessus).

**Contraintes de sécurité (car auth = néant aujourd'hui, §0.3) :**
- `middleware.ts` **matcher** sur `/admin` **et** `/api/admin/*` — refuser tout accès non authentifié
  (redirection login pour les pages, 401 pour l'API).
- **Isolation du bundle** : groupe `app/(admin)` + routes/handlers `server-only` ; ne rien importer
  d'admin dans le bundle public.
- **Auth minimale mais réelle** : identifiant admin en variable d'env + **cookie de session signé
  httpOnly** (pas de mot de passe en dur côté client). Option recommandée en plus : **proxy d'identité**
  (Cloudflare Access / basic-auth réseau / allowlist IP) puisque l'usage est strictement interne.
- **Adresse dédiée en production** : servir l'admin sous `admin.sansvisavis.com` (ou accès interne/VPN),
  **jamais** sous le domaine public ni via les tunnels publics de dev (`next.config.ts`
  `*.trycloudflare.com`). En dev, `localhost` est de fait interne (personne d'autre n'y accède) — la
  frontière d'adresse se joue surtout en production.
- Séparer physiquement les routes **analytics pseudonymes (M2)** des routes **nominatives (M3)**.
- ⚠️ **Correction revue adversariale (majeur) — ne pas simplement « réutiliser le Pool ».** Le `Pool`
  unique (`client.ts:8`) tourne avec **une seule identité DB** (`DATABASE_URL`), aujourd'hui en lecture.
  Lui donner l'écriture le partage avec le process public. → **Rôle DB admin dédié (2 connection strings,
  moindre privilège)** : écriture réservée aux tables admin, distinct du rôle public en lecture ;
  `statement_timeout` court sur les écritures ; **DDL interdite depuis l'app** (les migrations restent des
  scripts hors-ligne, sinon un `ALTER` prend un `ACCESS EXCLUSIVE` qui gèle les `SELECT` publics). Le
  partage du Pool n'est donc PAS un argument pour B — l'argument pour B reste l'import direct du moteur
  pur et de `config_scoring` in-process.

---

## C. Schéma de données prévisionnel

Principe : **le moteur continue de lire `config_scoring WHERE id=1` inchangé** (zéro modif de
`profilConfig.ts`) ; tout le reste s'ajoute autour. Introduire un **helper transactionnel** dans la couche
DB (aujourd'hui absent) pour les écritures atomiques (snapshot + update + audit).

### C.1 Fondation — rapatrier `config_scoring` (dette §0.2)
- **`db/migrations/003_config_scoring_create.sql`** : `CREATE TABLE IF NOT EXISTS config_scoring` avec les
  **~45 colonnes** réellement consommées par `profilConfig.ts:60-71`, **valeurs par défaut =
  `PROFIL_DEGAGEMENT_DEFAUT`** (`profilDegagement.ts:96-132`), contrainte `id` singleton, `CHECK
  mode_combinaison ∈ {max,addition,sequentiel}`, `CHECK distance_max_m <= analysis_range_m`. Idempotent.
  Objectif : **schéma reproductible, comportement identique, golden inchangé**.

### C.2 Config versionnée + audit (M1)
- **`config_scoring_version`** : `id`, `created_at`, `auteur`, `note`, **snapshot** de toutes les colonnes
  (une ligne = un état complet publié). La ligne active reste `config_scoring id=1` (contrat moteur).
- **`config_scoring_audit`** : `id`, `version_id`, `ts`, `auteur`, `variable`, `valeur_avant`,
  `valeur_apres` (une ligne par variable modifiée → journal qui/quoi/quand/avant→après).
- Publication = **transaction** : snapshot de l'ancien `id=1` dans `config_scoring_version` → diff en
  `config_scoring_audit` → `UPDATE config_scoring` (`id=1`). Reset variable/groupe = ré-application des
  défauts. Rollback = ré-application d'une `version`.

### C.3 Analytics PSEUDONYMES (M2) — strictement dé-corrélés du nominatif
> ⚠️ **Correction revue adversariale (majeur) :** ne PAS qualifier M2 d'« anonyme ». `ip_hash` +
> recoupement `geo_dept × device_type × utm × timestamp précis` singularise un visiteur (surtout à
> faible trafic interne) → ce sont des **données personnelles pseudonymes** : rétention courte, droit
> d'accès/effacement et registre s'appliquent (comme M3). Mesures : **agrégation à l'écriture**
> (compteurs par étape/jour/département plutôt qu'événements unitaires horodatés à la seconde),
> **troncature de l'horodatage au jour**, sel de hash **rotatif et jeté** ; pour viser le vrai anonyme,
> supprimer `ip_hash` et garantir un k-anonymat (écarter les combinaisons uniques dept×device×utm).
- **`analytics_session`** : `id` (uuid éphémère), `first_seen`, `utm_source/medium/campaign`, `referer`,
  `device_type`, `geo_dept` (grain département, jamais d'IP brute), `ip_hash` (sel rotatif jeté — ou
  supprimé au profit d'un compteur anti-doublon non stocké).
- **`analytics_event`** : `id`, `session_id` (→ `analytics_session`), `ts`, `type`
  (`page_view|etape_atteinte|analyse_lancee|resultat|clic_certificat|clic_estimation|abandon`), `etape`,
  `meta` JSONB non-nominatif. **Aucune FK vers `internaute`.**

### C.4 Base internautes + RGPD (M3) — nouvelles tables nominatives
> ⚠️ **Correction revue adversariale (BLOQUANT) — ordre du consentement.** Le `test` porte `lat/lon`
> d'origine = **le domicile** (donnée personnelle), calculé à l'écran *résultat* alors que l'identité et
> le consentement ne sont saisis qu'à l'écran *certificat*, APRÈS (`page.tsx:1888` vs `:752-1104`).
> **Interdiction de persister un `test` contenant `lat/lon` AVANT une base légale établie.** Deux
> options à trancher : (a) ne rien écrire tant que le consentement actif n'est pas donné (test gardé en
> session) ; (b) persister sous **intérêt légitime** avec **notice d'information affichée dès la
> manipulation de la carte** (finalité, durée, purge auto si pas de suite sous X jours) et **clé de
> session pseudonyme, jamais l'identité**. `internaute_id` nullable N'EST PAS neutre : il ne dispense
> pas de la base légale du test anonyme.
> ⚠️ **Auditabilité PARTIELLE (majeur) :** `config_version_id` fige le profil de score, mais **pas**
> l'état patrimoine/bâti lu *en live* par `faisceaux.ts` (`monuments_historiques`, `inventaire_general`,
> `bdnb_annee_batiment`). Après une curation M4 ou un ré-import, rejouer un vieux test donnera un score
> différent sans signal. → soit figer aussi une **version de données** par test, soit **documenter** que
> seul le profil est rejouable à l'identique.
- **`internaute`** : `id`, `prenom`, `nom`, `email` (chiffré), `telephone` (chiffré),
  `source_acquisition`, `created_at`, `consent_actif_id` (→ `consentement`), `anonymise_at` (nullable).
- **`consentement`** : `id`, `internaute_id`, `base_legale`, `finalites` (dont prospection),
  `texte_version`, `texte_hash`, `granted_at`, `revoked_at`, `ip_hash`, `user_agent`. Historique complet
  (append-only) → traçabilité.
- **`test`** : `id`, `internaute_id` (nullable — un test peut précéder l'identité), `created_at`, `adresse`,
  `lat_origine`, `lon_origine`, `azimut`, `etage`, `dernier_etage`, `hauteur_sous_plafond`, `mode`,
  `verdict`, `distance_premier_obstacle`, `score_total`, **`config_version_id`** (→ `config_scoring_version`,
  pour rejouer un test avec le profil EXACT utilisé → auditabilité CLAUDE.md §8), `photo_url`,
  `miniature_url`. **Aucune image en base** (URL seulement).
- **`point_observation`** : `test_id`, `geom` (Point 2154, PostGIS) — position exacte de la fenêtre.
- **`certificat`** (aval, Étape 11) : `id`, `test_id`, `numero` (`SAVV-AAAA-NNNNNN`, séquence annuelle),
  `pdf_url`, `created_at`.
- **`demande`** : `id`, `internaute_id`, `type` (`certificat|estimation`), `test_id`, `created_at`,
  `statut` — alimente les statuts « a demandé certificat / estimation ».
- **`droit_rgpd_demande`** : `id`, `internaute_id`, `type` (`acces|rectification|effacement|portabilite|
  opposition`), `created_at`, `statut`, `resolved_at` — workflow interne.

### C.5 Patrimoine unifié (M4) — cible « 1 entité → N cleabs » pour les 3 familles
- **`patrimoine_entite`** : `id`, `famille` (`mondial|mh|inventaire`), `ref_code` (`EIFFEL`/`PA…`/`IA…`),
  `nom`, `statut` (`classe|inscrit|bati_patrimonial|mondial`), `geom_point` (Point 2154), `actif`,
  `meta` JSONB (deno, datation, adresse…).
- **`patrimoine_entite_batiment`** : `entite_id`, `cleabs`, `source` (`auto|manuel`), `dist_m`,
  `verifie_manuellement` (bool), `created`, PK `(entite_id, cleabs)`. Index sur `cleabs`
  (jointure inverse faisceau→entité).
- **État couleur dérivé** : rouge = entité sans liaison ; orange = liaison `auto` non vérifiée ;
  vert = `manuel` ou `verifie_manuellement`.

**Plan de migration des données existantes :**
1. **config_scoring** : dumper l'`id=1` courant → l'inscrire comme défauts du `CREATE TABLE` (C.1) →
   vérifier que `chargerProfilDegagement()` renvoie un profil identique → **golden inchangé**.
2. **MH** : `patrimoine_entite(famille='mh', ref_code=ref, nom=tico, statut, geom)` depuis
   `monuments_historiques` ; liaison `source='auto'` pour les 152 `cleabs NOT NULL` ; les 24 `cleabs NULL`
   → entités **rouges** (0 liaison, à placer sur la carte).
3. **Inventaire** : une `patrimoine_entite(famille='inventaire')` par `ref` distinct (dédupliquer les
   champs descriptifs une seule fois) ; liaison par `(ref,cleabs)` `cleabs NOT NULL` `source='auto'` ;
   `badge_actif` → `entite.actif` ; les non rattachées → rouges.
4. **Mondial** : copier `monuments_emblematiques`/`monument_emblematique_batiment` (déjà au bon modèle,
   `source` préservée) dans l'unifié.
5. **Réécrire** `faisceaux.ts:100-108` en **reproduisant EXACTEMENT les trois `EXISTS` indépendants
   PAR CLEABS** (pas « une famille par cleabs ») sur `patrimoine_entite_batiment` filtré par `famille` :
   `is_mh` = MH **sans aucun filtre `actif`** (inconditionnel aujourd'hui, `faisceaux.ts:103`) ;
   `is_inv` = Inventaire **avec le filtre actif au niveau LIAISON** (aujourd'hui `badge_actif` est
   par-`(ref,cleabs)`, `faisceaux.ts:104` — NE PAS le remonter en `entite.actif` per-entité) ;
   `is_emblematique` = mondial `AND actif` (`faisceaux.ts:107`).
   > ⚠️ **BLOQUANT.** « Préserver les cleabs » ne suffit PAS : il faut préserver (i) la **précédence**
   > mondial > MH > Inventaire > ≤1900 > 1901-1935 (`coucheDegagement.ts:82,47-52`), calculée par flags
   > **indépendants** — un cleabs bi-famille (MH ET Inventaire) doit conserver ses DEUX flags ; (ii) la
   > **granularité du filtre actif** (par-liaison, pas par-entité) ; (iii) **chaque paire `(ref,cleabs)`**
   > de l'Inventaire (`UNIQUE(ref,cleabs)` → N lignes/ref ; un dédoublonnage sur `ref` qui perd une paire
   > bascule `is_inv=false`). La colonne `actif` de `patrimoine_entite` NE DOIT JAMAIS filtrer la famille
   > `mh`.
6. **Prouver l'invariance sur un jeu de points SCELLÉS, pas seulement Asnières** (résidentiel, ne heurte
   probablement aucun patrimoine → oracle FAIBLE pour ce chantier) : cas couvrant un cleabs bi-famille
   MH+Inventaire, un emblématique+MH, un bâti aux bornes exactes 1900 et 1935, un flanc en cumul-nature,
   un couloir. Re-run golden + ce jeu ; rescellage seulement s'il bouge (il ne doit pas).
7. Conserver les tables sources en lecture le temps de valider, puis les retirer dans un commit séparé.

---

## D. Structure de navigation & découpage en écrans

**Coquille commune** (`app/(admin)/layout.tsx`) : barre latérale gauche (5 modules + déconnexion),
bandeau d'état global (profil actif/repli), design tokens SVAV réutilisés (`globals.css`). Auth via
`middleware.ts`.

```
/admin
├── /pilotage        (M1) arbre config + aperçu d'impact + publication versionnée
├── /statistiques    (M2) tableau de bord anonyme
├── /internautes     (M3) base nominative + RGPD  [zone à accès renforcé]
├── /curation        (M4) carte unique à filtres
└── /banc-test       (M5) analyse de test + débriefing
```

### D.1 Module 1 — arbre `Moteur → Couche → Calcul → Sous-calcul → Variable`
Vue arborescente dépliable reflétant l'architecture réelle. Chaque **feuille = une variable** avec une
carte : **libellé clair** (pas le nom SQL brut) · description de l'effet · valeur actuelle · défaut ·
plage/unité · **badge de statut** (🟢 VIVE / ⚪ VESTIGIALE grisée / 🔒 DE GARDE / ↔ MIROIR). Édition →
brouillon → panneau **Aperçu d'impact** (delta golden + panel de référence) → **Publier** (transaction
versionnée + audit). Boutons **Reset** par variable et par groupe.

Arbre (mapping complet des 46 colonnes en **Annexe 1**) :

```
Score de qualité de vue (/100)
└── Couche 1 — Dégagement objectif (/80)  ← aujourd'hui = tout le score affiché
    ├── Calcul: Distance perçue par faisceau (distancePercueFaisceau)
    │   ├── Base + nature (classique) : boost_f4🟢, distance_max_m🟢
    │   ├── Barème par famille (une seule s'applique, par priorité)
    │   │   ├── Seuil cône/flanc : cone_famille_demi_angle_deg🟢
    │   │   ├── Patrimoine mondial : mondial_faisceau_m🟢 (faisceau fixe)
    │   │   ├── Monument Historique : mh_cone🟢, mh_flanc🟢, mh_distmax_m🟢
    │   │   ├── Inventaire : inv_cone🟢, inv_flanc🟢, inv_distmax_m🟢
    │   │   ├── Bâti ≤1900 : a1900_cone🟢, a1900_flanc🟢, a1900_distmax_m🟢
    │   │   ├── Bâti 1901–1935 : a1935_cone🟢, a1935_flanc🟢, a1935_distmax_m🟢
    │   │   └── Bornes d'appartenance année : borne_annee_1900🟢, borne_annee_1935🟢
    │   └── Cumul nature + bâti : cumul_seuil_min_m🟢, cumul_base_m🟢, cumul_pas_m🟢,
    │                             cumul_increment🟢, cumul_plafond🟢, cumul_cap_p1_m🟢
    ├── Calcul: Malus couloir : couloir_seuil_lateral_m🟢, couloir_fenetre_condition_n🟢,
    │                           couloir_tolerance_bord_n🟢, couloir_malus_pct🟢
    ├── Calcul: Normalisation & orientation & clamp (noteDegagement)
    │   ├── Coefficient dégagement (×80) : plafond_degagement🟢
    │   ├── Barème orientation (0..10) : orientation_n/ne/e/se/s/so/o/no🟢 (×8)
    │   └── Clamp final [0..90] : plafond_couche1🟢
    ├── Garde-fou de portée : analysis_range_m↔ (borne distance_max_m ; ne re-cadre pas la géométrie)
    ├── Sentinelle de validation : mode_combinaison🔒 (liste fermée ; non consultée par le calcul actuel)
    └── Héritage sans effet (Étape 2) : boost_f2⚪, forfait_cone_central⚪, forfait_extremites⚪,
                                        cone_f3_demi_angle_deg⚪, natures_remarquables⚪
└── Couche 2 — Exception / photo (/20)  ← NON IMPLÉMENTÉE ; constantes en dur dans config.ts,
                                           à externaliser AVANT de l'activer (non pilotable aujourd'hui)
```

### D.2 Module 4 — carte de curation unique
Une seule carte Leaflet (réutilise `react-leaflet`). **Filtres par famille** (MH / Inventaire / Mondial,
afficher/masquer). **Points colorés par état** (rouge à placer / orange auto à vérifier / vert sûr).
Interactions : sélectionner une entité → **déplacer son point**, **rattacher/détacher des polygones**
(cleabs) par clic sur les emprises `bdtopo_batiment`, **composer plusieurs cleabs** sous un même point
(grands monuments). Chaque action écrit `patrimoine_entite_batiment` avec `source='manuel'` (jamais
écrasé au ré-import). Rattachement auto conservé (tolérance **15 m**). Panneau latéral : liste filtrée,
compteur d'états, recherche par nom/ref.

### D.3 Modules 2/3/5 (écrans clés)
- **M2** : cartes KPI (visites, complétion tunnel par étape, conversions certificat/estimation), sources,
  carte géo (grain département), répartition appareils, entonnoir avec points d'abandon.
- **M3** : table internautes (recherche/filtre : a demandé certificat/estimation) → fiche internaute
  (coordonnées, historique des tests avec verdict+score+date, traçabilité consentement) → actions RGPD
  (export, rectifier, effacer). File des `droit_rgpd_demande`. Zone à accès renforcé.
- **M5** : formulaire (adresse **ou** lat/lon, azimut, étage, hauteur sous plafond, dernier étage, mode ;
  photo optionnelle) → rapport pédagogique : **verdict** + justification géométrique ; **score /100** +
  décomposition ; **tableau 61 faisceaux** (offset, distance brute, famille, coeff cône/flanc, diviseur
  cumul, cap distMax, contribution perçue) ; malus couloir ; orientation ; « pourquoi ce score ».
  Sélecteur **profil publié / brouillon M1** pour la boucle d'itération.

---

## E. Plan de construction par étapes (un chantier = un prompt = un commit)

Ordonné par dépendances. Chaque étape est autonome et commitable ; les étapes « golden-adjacentes »
imposent un re-run du test golden dans le même chantier.

| # | Étape (chantier) | Dépend de | Touche le score/golden ? | Livrable |
|---|---|---|---|---|
| **0** | **Dette DB** : `003_config_scoring_create.sql` (schéma reproductible, défauts = profil actuel) + helper **transaction** dans `client.ts` | — | Non (comportement identique) — **re-run golden pour confirmer** | Migration + helper |
| **1** | **Coquille + auth** : `middleware.ts`, groupe `app/(admin)`, session signée env, layout SVAV, nav 5 modules | 0 | Non | Shell protégé |
| **2** | **M1 lecture seule** : arbre config, 46 variables avec statut/valeur/défaut/plage, bandeau « profil actif vs repli » | 1 | Non (lecture) | Écran pilotage read-only |
| **3** | **Aperçu d'impact** : fixtures `EntreeComplete` **gelées** + `simulerScore(fixture, profilDraft)` pur ; **panel à valeurs attendues SCELLÉES** (pas des adresses recalculées live) couvrant chaque dimension pilotable (MH, Inventaire, ≤1900, 1901-1935, emblématique, cumul-nature, couloir, chaque secteur d'orientation) — sinon l'aperçu ne détecte rien | 2 | **Adjacent** (recalcul pur, additif) — golden + panel scellé = oracle | Moteur d'aperçu |
| **4** | **M1 édition + publication** : brouillon → aperçu → publier (transaction snapshot+audit) ; garde-fous (enum, `distance_max_m≤analysis_range_m`, VESTIGIALES grisées) ; reset ; versioning `config_scoring_version`/`_audit`. **Gate « aperçu panel complet vert obligatoire »** + hash d'aperçu stocké dans `_version` + double confirmation (`auteur`+`note`) + **rollback 1-clic répété en exercice** | 3 | **OUI** (écrit `config_scoring`) | Config live complète |
| **5a** | **Schéma + API persistance** : tables `internaute/consentement/test/point_observation` ; **hook isolé** `useConsentement`/`persistTest` (diff `page.tsx` minimal) ; chiffrement au repos ; **consentement/notice AVANT tout INSERT contenant lat/lon** | 0 | Non (le score ne change pas) | Schéma + API |
| **5b** | **Branchement tunnel** : câbler le hook dans `page.tsx` (monolithe 3080 l. caméra/capteurs) ; **e2e du parcours AVANT de toucher au fichier** ; revue ligne à ligne | 5a | Non | Tunnel persistant |
| **6** | **M3 base internautes** : liste/fiche, export, rectif, **effacement à cascade transactionnellement fiable** (journal `effacement_pending` par fichier + job de reprise idempotent avant clôture ; couvre S3, `test/point_observation/certificat`, `analytics_event` ; **préserve** `config_scoring_audit/_version` non-perso), file des demandes de droits, self-service « Accès à mes données » (jeton) + lien pied d'email | 5b | Non (nominatif) | Module RGPD |
| **7** | **M2 analytics** : `analytics_session/_event`, instrumentation **pseudonyme** du tunnel (agrégée à l'écriture, horodatage tronqué au jour), tableau de bord ; (décision outil UE cookieless optionnel) | 1, 5b | Non (pseudonyme) | Tableau de bord |
| **8** | **Migration patrimoine unifiée** : `patrimoine_entite`/`_batiment`, migrer MH+Inventaire+Mondial, **réécrire `faisceaux.ts:100-108` en 3 `EXISTS` par-cleabs indépendants (MH sans filtre `actif` ; Inventaire filtre au niveau LIAISON ; mondial `actif`)**, **prouver invariance sur le jeu de points scellés** (§C.5-6), pas seulement Asnières | 0 | **OUI** (chemin d'entrée du score) | Schéma patrimoine unique |
| **9** | **M4 carte de curation** : Leaflet, filtres famille, couleurs d'état, déplacement points, rattachement/détachement cleabs, multi-polygones, source manuelle tracée | 8 | Adjacent (édite des rattachements → refaire tourner golden après curation lourde) | Carte unique |
| **10** | **M5 banc de test** : seam verbeux additif (décomposition 61 faisceaux) + rapport pédagogique + rejeu profil publié/brouillon | 3, 4 | Adjacent (sortie détaillée additive, golden-safe) | Banc + débriefing |
| **11** | *(aval, hors 5 modules)* **Certificat PDF + `SAVV-AAAA-NNNNNN` + S3 (OVH)** — numéro via **compteur `(annee, dernier)` verrouillé `SELECT … FOR UPDATE` dans la même transaction que l'insert** (ou `ON CONFLICT (annee) … RETURNING`) ; trancher explicitement trous vs sans-trou | 5a | Non | Certificat réel |

**Garde-fous d'ordonnancement respectés :** migration patrimoine (8) **avant** carte (9) ; aperçu
d'impact (3) **avant** édition des variables (4) ; coquille + auth (1) **avant** les modules ; dette DB
(0) en tout premier.

---

## F. Modèles d'IA recommandés par étape

Règle transverse (garde-fou du cadrage) : **tout ce qui touche `config_scoring`, le golden, le moteur de
scoring ou le nominatif → modèle le plus capable (Opus) + relecture humaine, jamais délégué à un modèle
léger.** Sonnet pour le volume d'UI sous supervision. Haiku pour le mécanique répétitif si taux de
reprise < ~20 %. Fable 5 pour les gros morceaux de code (mais conception/revue restent sur Opus).

| # | Étape | Modèle(s) | Justification |
|---|---|---|---|
| 0 | Dette DB config_scoring | **Opus** + relecture humaine | Touche le schéma dont dépend le golden ; erreur = repli silencieux. |
| 1 | Coquille + auth | Opus (conception auth/middleware) + **Sonnet** (layout/nav) | Auth = sécurité ; UI = volume. |
| 2 | M1 lecture seule | Opus (catalogue des 46 variables + statuts) + **Sonnet** (arbre UI) | Le catalogue doit être exact ; l'arbre est du volume. |
| 3 | Aperçu d'impact | **Opus** + relecture humaine | Recalcul pur adossé au golden ; cœur de la sûreté de M1. |
| 4 | M1 édition/publication | **Opus** + relecture humaine | Écrit `config_scoring` ; garde-fous anti-repli ; versioning/audit. |
| 5 | Persistance + consentement | **Opus** (schéma nominatif + RGPD + modif tunnel) + Sonnet (UI formulaire) + **DPO** | Nominatif + base légale ; tunnel public sensible. |
| 6 | M3 base internautes | **Opus** (workflows droits, effacement cascade) + Sonnet (tables/fiches) + **DPO** | Données personnelles ; effacement à distance. |
| 7 | M2 analytics | Opus (frontière anonymisation/RGPD) + **Sonnet** (dashboard) | La frontière anonyme/nominatif est critique ; le dashboard est du volume. |
| 8 | Migration patrimoine | **Opus** + relecture humaine | Touche le chemin d'entrée du score ; golden à prouver. |
| 9 | M4 carte | **Sonnet/Fable 5** (gros composant Leaflet) sous supervision + Opus (endpoints d'écriture patrimoine + revue) | UI lourde = volume ; les écritures touchent la donnée patrimoniale. |
| 10 | M5 banc de test | **Opus** (seam verbeux moteur, golden-safe) + Sonnet (rapport UI) | Le seam frôle le moteur (additif) ; le rapport est du volume. |
| 11 | Certificat PDF/S3 | Sonnet/Fable 5 (génération PDF) + Opus (numérotation séquentielle + revue) | Volume de code ; la séquence SAVV doit être fiable. |

---

## Annexe 1 — Mapping complet des 46 colonnes `config_scoring`

Source autoritative : `profilConfig.ts:14-48` (interface) et `:60-71` (SELECT), défauts
`profilDegagement.ts:96-132`. Statut : 🟢 VIVE · ⚪ VESTIGIALE · 🔒 DE GARDE · ↔ MIROIR · 🔑 technique.

| Colonne | Défaut | Statut | Rôle / effet |
|---|---|---|---|
| `id` | 1 | 🔑 | Clé du singleton (jamais éditable). |
| `boost_f2` | 0.3 | ⚪ | Ex-boost bâti <1900 ; **remplacé** par les familles année (non consulté). |
| `boost_f4` | 2.5 | 🟢 | Boost additif de la nature traversée (base + `boost_f4×longueur`). |
| `forfait_cone_central` | 300 | ⚪ | Ex-forfait F3 remarquable cône ; **remplacé** par MH/Inventaire. |
| `forfait_extremites` | 200 | ⚪ | Ex-forfait F3 flancs ; remplacé. |
| `cone_f3_demi_angle_deg` | 60 | ⚪ | Ex-demi-angle cône F3 ; remplacé. |
| `distance_max_m` | 200 | 🟢 | Plafond de distance perçue F1/base/P1 (≤ `analysis_range_m`). |
| `plafond_couche1` | 90 | 🟢 | Clamp final de la note `[0, plafond_couche1]`. |
| `plafond_degagement` | 80 | 🟢 | Coefficient du dégagement pur (×80). |
| `mode_combinaison` | max | 🔒 | Liste fermée `{max,addition,sequentiel}` ; invalide → repli défaut. Non consulté par le calcul actuel. |
| `couloir_seuil_lateral_m` | 3 | 🟢 | Distance ⊥ sous laquelle un obstacle « longe » l'axe. |
| `couloir_fenetre_condition_n` | 16 | 🟢 | Fenêtre (nb faisceaux) d'enclenchement du couloir. |
| `couloir_tolerance_bord_n` | 2 | 🟢 | Faisceaux de bord exemptés de la condition. |
| `couloir_malus_pct` | 0.01 | 🟢 | Malus (fraction du cumul brut) par faisceau de chaîne. |
| `natures_remarquables` | (6 libellés) | ⚪ | Ex-liste F3 remarquable ; non consultée. |
| `cone_famille_demi_angle_deg` | 60 | 🟢 | Seuil cône/flanc du barème de familles. |
| `mondial_faisceau_m` | 800 | 🟢 | Faisceau FIXE Patrimoine mondial. |
| `mh_cone` / `mh_flanc` / `mh_distmax_m` | 2.0 / 1.5 / 400 | 🟢 | Coeffs Monument Historique + cap distance. |
| `inv_cone` / `inv_flanc` / `inv_distmax_m` | 2.0 / 1.5 / 400 | 🟢 | Coeffs Inventaire + cap. |
| `a1900_cone` / `a1900_flanc` / `a1900_distmax_m` | 1.5 / 1.2 / 300 | 🟢 | Coeffs bâti ≤1900 + cap. |
| `a1935_cone` / `a1935_flanc` / `a1935_distmax_m` | 1.2 / 1.1 / 200 | 🟢 | Coeffs bâti 1901–1935 + cap. |
| `cumul_seuil_min_m` | 30 | 🟢 | Nature sous laquelle diviseur = 1,0. |
| `cumul_base_m` | 25 | 🟢 | Base du palier `floor((nature−base)/pas)`. |
| `cumul_pas_m` | 5 | 🟢 | Pas d'un palier de diviseur. |
| `cumul_increment` | 0.1 | 🟢 | Incrément de diviseur par palier. |
| `cumul_plafond` | 2.0 | 🟢 | Plafond du diviseur. |
| `cumul_cap_p1_m` | 200 | 🟢 | Cap de la Partie 1 (nature classique) dans le cumul. |
| `orientation_n…no` (×8) | 0/1/5/8/10/9/7/3 | 🟢 | Barème d'orientation (0..10) par secteur. |
| `borne_annee_1900` | 1900 | 🟢 | Borne haute incluse famille « ≤1900 ». |
| `borne_annee_1935` | 1935 | 🟢 | Borne haute incluse famille « 1901–1935 ». |
| `analysis_range_m` | 200 | ↔ | Garde-fou (`distance_max_m ≤ analysis_range_m`) ; **ne re-cadre pas** la géométrie (constante de code). |

---

## Annexe 2 — Invariants respectés par ce plan
- **Golden Asnières = 29.107259068449615** : oracle de non-régression ; toute étape golden-adjacente
  (0, 3, 4, 8, 9, 10) le re-run ; rescellage seulement s'il bouge, en commit séparé.
- **Verdict binaire 100 % géométrique** (1er obstacle réel ≥ 40 m), jamais couplé au score ni à la photo.
- **Hauteur de vision** `(étage × 2,80 dérivé) + 1,65` ; `FLOOR_HEIGHT_OBSTACLE_M = 2,90` distinct.
- **`ST_Force2D` jamais retiré** des opérations distance/raster ; **tolérance 15 m** verrouillée.
- **Aucun arrondi** (calculs sur valeurs brutes) ; distances en **Lambert-93**.
- **Pilotage sans code** : toute nouvelle variable de moteur naît en table de config (type, défaut,
  plage) ; distinction VIVE/VESTIGIALE/DE GARDE maintenue et documentée.
- **Certificat** `SAVV-AAAA-NNNNNN` (Étape 11) ; **fichiers hors base** (S3 OVH, URL seulement).
- **`prefers-reduced-motion`** respecté pour toute animation de la coquille.

## Annexe 3 — Dettes & incohérences à traiter opportunément
- `db/migrations/003…` manquante pour `config_scoring` (Étape 0).
- Docs en retard : `SPEC_ponderation_familles.md` (statut « non implémentée »), incohérence **248 vs 250**
  Inventaire.
- Commentaires périmés : `scoreDegagement.ts:74` (« emblématique toujours false »),
  en-tête `coucheDegagement.ts` (« NON BRANCHÉ »).
- Sécurité : `next.config.ts` tunnels `*.trycloudflare.com` (dev) ; email en dur
  `check-building/route.ts:36`.

---

## Annexe 4 — Revue adversariale (corrections intégrées)

Deux relecteurs adverses en lecture seule : l'un a re-vérifié les faits porteurs **dans le code** (sans
faire confiance à la recon), l'autre a **attaqué la conception**.

### 4.1 Vérification des faits — 6/7 confirmés, 1 nuancé
| Claim | Verdict | Preuve |
|---|---|---|
| Géométrie indépendante de `config_scoring` (aperçu hors-DB légitime) | **CONFIRMÉ** | extractions `pipeline.ts:84-142` avant profil `:174-175` ; aucune extraction ne prend `Profil` |
| `mode_combinaison` = sentinelle, non consultée par le calcul | **CONFIRMÉ** | validée `profilConfig.ts:75`, jamais lue en calcul ; morte `coucheDegagement.ts:70` |
| Aucun `CREATE TABLE config_scoring` (seul un `ALTER`) | **CONFIRMÉ** | grep repo ; `migration_config_scoring_orientation_annee_portee.sql:12-26` (ALTER only) |
| Score total = `noteDegagement` seul | **CONFIRMÉ** | `scoreTotal.ts:44` (total) vs `:57` (famille1/2 ré-émis, non sommés) |
| `analysis_range_m` = miroir (ne re-cadre pas la géométrie) | **CONFIRMÉ** | constante `config.ts:25` utilisée partout ; colonne lue seulement `profilConfig.ts:78` |
| Golden figé `29.107259068449615` `toBeCloseTo(...,3)` | **CONFIRMÉ** | `pipeline.itest.ts:42` + verdict/distance `:34-36` |
| « Migration préservant les cleabs ⇒ golden inchangé » | **NUANCÉ → corrigé** | dépend de `badge_actif`/`me.actif` (`faisceaux.ts:104,107`) et de l'**absence** de filtre `actif` sur MH (`:103`) ; Asnières = oracle faible → §C.5-6 et Étape 8 corrigés |

### 4.2 Objections de conception — classées, avec correction intégrée
| # | Objection | Gravité | Corrigé dans |
|---|---|---|---|
| 1 | Timing consentement : `test` avec lat/lon domicile persisté avant base légale | **Bloquant** | §C.4 (encadré) ; Étapes 5a/5b |
| 2 | Migration patrimoine change la granularité (`badge_actif`/`actif` per-liaison→per-entité) & risque de casser la précédence par-cleabs | **Bloquant** | §C.5-5/6 (encadré) ; Étape 8 |
| 3 | Aperçu sans oracle scellé (seul Asnières a une valeur de vérité) | Majeur | Étape 3 (fixtures gelées + panel scellé) |
| 4 | Analytics faussement « anonymes » (pseudonyme réel) | Majeur | §C.3 (encadré) ; §B ; Étape 7 |
| 5 | Effet immédiat de la config (publish live, aperçu à couverture partielle) | Majeur | Étape 4 (gate aperçu complet + hash + rollback) |
| 6 | Auditabilité partielle (`config_version_id` ne fige pas l'état patrimoine/bâti live) | Majeur | §C.4 (encadré) |
| 7 | Pool/credentials DB partagés admin↔public ; DDL à chaud ; repli silencieux global | Majeur | §B (rôle DB dédié, pas de DDL depuis l'app) |
| 8 | Numérotation SAVV non spécifiée (concurrence, trous) | Majeur | Étape 11 (compteur verrouillé `FOR UPDATE`) |
| 9 | Effacement S3 non transactionnel (fichiers orphelins) | Majeur | Étape 6 (journal `effacement_pending` + reprise idempotente) |
| 10 | Modif `page.tsx` (3080 l.) sous-estimée | Majeur | Étapes 5a/5b (hook isolé + e2e avant) |

### 4.3 Ce que la revue n'a PAS remis en cause (piliers confirmés)
Indépendance géométrie/profil → **aperçu d'impact hors-DB légitime** ; **repli silencieux** de
`profilConfig.ts:74-78` correctement identifié comme danger n°1 ; divergence de schéma patrimoine exacte
et gabarit cible (`monument_emblematique_batiment`, `source auto/manuel`) valide ; score = `noteDegagement`.

### 4.4 Correctifs mineurs de traçabilité (non structurants)
Chemin réel des fichiers TS = `app/app/lib/…` (double `app`) ; le chemin de score patrimoine est
`enrichirFamilles()` `faisceaux.ts:93-121` (les `resoudre*` d'`obstacles.ts` sont DESCRIPTIFS/cartouches,
pas le score).
```
