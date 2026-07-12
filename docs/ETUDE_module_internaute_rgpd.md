# ÉTUDE D'ARCHITECTURE — Module « Internautes » nominatif & cadrage RGPD

> **Statut : ÉTUDE PRÉALABLE, LECTURE SEULE.** Ce module n'est PAS construit. Aucun code, aucune migration, aucune
> table n'est créée ici. Ce document cadre l'architecture et les exigences RGPD **avant** toute décision de build.
>
> ⚠️ **AVERTISSEMENT JURIDIQUE.** Ce document n'est PAS un avis juridique. Il décrit des principes RGPD généraux et
> des pistes d'architecture. **La validation par un juriste / DPO est REQUISE avant tout build** (base légale de
> chaque finalité, AIPD éventuelle, formulation des consentements, durées, conformité du retargeting). Les points
> à trancher par un professionnel sont regroupés au §7.

---

## 0. Résumé pour décideur

- **État actuel = page blanche nominative.** Le repo **ne persiste AUCUNE donnée nominative** aujourd'hui. Le
  formulaire de certificat (prénom, nom, email, téléphone) existe dans l'UI mais est un **placeholder** : les
  coordonnées restent dans le navigateur et **ne sont envoyées à aucune API ni stockées**. La photo n'est jamais
  stockée. Le certificat `SAVV-AAAA-NNNNNN` n'est pas implémenté. → **On conçoit à partir de zéro, en « privacy by
  design »** — c'est la position la plus favorable.
- **Trois finalités, trois régimes de risque croissant** : (1) recontact commercial INTERNE, (2) relances email,
  (3) **retargeting Meta/Google = transfert vers des TIERS** (le plus sensible, le plus sanctionné).
- **Le service (certificat) et le marketing sont DEUX choses séparées.** Le nom/email/adresse nécessaires au
  certificat relèvent de l'exécution du service ; les trois finalités marketing relèvent de **consentements EN
  COUCHES**, une case = une finalité, jamais pré-cochées, **jamais conditionnées** à l'obtention du certificat.
- **Cloisonnement total avec M2 (statistiques anonymes, k=11).** Aucune jointure, aucun flux. Frontière documentée
  au §6.
- **Séquencement prudent (§8)** : socle de conformité (consentements + effacement + opposition) AVANT toute
  exploitation ; retargeting en dernier.
- **⚠️ Deux mises à jour majeures (Sections A & B).** (A) La **loi du 30 juin 2025** (entrée en vigueur **11 août
  2026**) rend le **recontact téléphonique conditionné à un OPT-IN préalable PROUVÉ** — Bloctel disparaît, on passe de
  l'opt-out à l'opt-in : la case « recontact téléphonique » n'est plus un confort mais une **CONDITION LÉGALE
  d'appel**, avec **charge de la preuve** sur Sans Vis-à-Vis. (B) Le certificat peut servir à **justifier/contester un
  complément de loyer** (encadrement des loyers) → valeur juridique = **responsabilité accrue** : le certificat
  énonce un **fait géométrique**, JAMAIS une conclusion juridique.

---

## 1. État actuel de la donnée du parcours (faits du repo, lecture seule)

### 1.1 Flux des données saisies

| Donnée | Où elle est saisie | Où elle va | Persistée ? |
|---|---|---|---|
| Adresse / point d'origine (lat, lon) | écran localisation (`app/page.tsx`) | `POST /api/analyse` (`page.tsx:1968` : `{lat, lon, azimut, etage, hauteurSousPlafondM, dernierEtage, mode}`) ; autocomplétion `/api/adresses-proches` (`page.tsx:829` : `{lat, lon}`) | **NON** — utilisées pour le calcul, jamais stockées côté nominatif |
| Étage, dernier étage, hauteur sous plafond | écran infos logement | `POST /api/analyse` (idem) | **NON** |
| Jardin / balcon / terrasse | *(non trouvé dans le parcours actuel — à confirmer si prévu)* | — | — |
| Photo | écran photo (`page.tsx`) | `POST /api/analyse-photo` (`page.tsx:1997` : `{photo (base64 data URL), lat, lon, azimut, …}`) → Gemini | **NON** — aucun code S3/storage ; la photo est analysée « en vol » puis abandonnée |
| Verdict, score | calculés serveur (`app/api/analyse/route.ts`) | renvoyés au client (`{ok, validation, resultat}`) + événement ANONYME | **NON** côté nominatif ; **ANONYME** côté M2 (verdict + tranche + commune INSEE, `analyse/route.ts:80`) |
| **Prénom, nom, email, téléphone** | `EcranCertificat` (`page.tsx:751-754`, champs requis) | **NULLE PART** — restent en état React ; **aucun `fetch`** ne les transmet | **NON** |

**Confirmation clé** : les seuls appels réseau du parcours public sont `/api/adresses-proches`, `/api/analyse`,
`/api/analyse-photo` (+ le beacon anonyme `/api/mesure`). **Aucun** ne porte le nom/email/téléphone. Il n'existe
**aucun endpoint** `certificat`/`contact`/`lead`/`internaute` (liste exhaustive des routes vérifiée).

### 1.2 Persisté vs éphémère aujourd'hui

- **Éphémère (jamais persisté)** : coordonnées de contact, photo, lat/lon exact, adresse, résultat nominatif.
- **Persisté** : (a) **comptes ADMIN** (`admin_utilisateur`, migrations 014-017) — personnel interne, PAS des
  internautes ; (b) **analytics ANONYMES** (`analytics_*`, migrations 018-022) — agrégats k-anonymisés, sans
  identité ni IP ; (c) données **géographiques/moteur** (BD TOPO, LiDAR, patrimoine, config).
- **Table nominative d'internautes : INEXISTANTE.**
- **Certificat `SAVV-AAAA-NNNNNN`** : **non implémenté** (aucune référence dans le code ; l'écran certificat indique
  lui-même « pas encore de PDF ni email — à l'étape suivante », `page.tsx:849,863,879`). C'est une **cible**
  (CLAUDE.md §6), pas une réalité.
- **Photo** : politique cible (CLAUDE.md §7) = object storage S3, **jamais l'image en base** (base = URL +
  métadonnées). Aujourd'hui, ni S3 ni stockage : la photo est purement transitoire.

### 1.3 Les événements analytiques ne seront PAS la source de la base nominative

Confirmé : `app/api/mesure/route.ts` et `app/api/analyse/route.ts` émettent des événements **anonymes** (aucune IP —
contrainte RGPD Q-C=1 ; commune INSEE dérivée puis lat/lon jetés, `analyse/route.ts:72,79-80` ; CHECK
anti-fingerprint 018). **La base nominative devra avoir une source DISTINCTE** (le formulaire de certificat consenti),
**jamais** l'instrumentation M2. → cf. cloisonnement §6.

---

## 2. Modèle de données nominatif proposé (CONCEPTION — aucune implémentation)

Principe : **séparer l'identité/contact (sensible) des résultats techniques**, relier une personne à ses multiples
analyses, ne stocker la photo que par **URL + métadonnées** (jamais l'image en base). Les noms de tables/colonnes
ci-dessous sont **indicatifs** (à arbitrer au build).

### 2.1 Entités

- **`internaute`** — l'identité/contact (le cœur sensible).
  - `id` (uuid), `prenom`, `nom`, `email` (unicité ? cf. §7), `telephone` (E.164, cf. `PhoneInput` déjà utilisé),
    `cree_le`, `maj_le`.
  - **Champs de contrôle RGPD** portés ici ou dans une table dédiée (§2.2) : `opposition_recontact` (bool,
    « ne pas recontacter »), `source_collecte`, `version_mentions_acceptees`.
  - *Chiffrement au repos recommandé pour email/téléphone (§3 sécurité).*

- **`analyse`** — un test réalisé (résultat technique), rattaché à un internaute.
  - `id`, `internaute_id` (FK), `date`, `adresse_saisie`, `adresse_normalisee`, `lat`, `lon` (⚠️ position d'un
    LOGEMENT = donnée sensible), `etage`, `dernier_etage`, `hauteur_sous_plafond`, `azimut`, `verdict`,
    `distance_premier_obstacle`, `score`, `commune_insee`.
  - Une personne ↔ **plusieurs** analyses (1-N).

- **`photo`** — métadonnées d'image (jamais l'image).
  - `id`, `analyse_id` (FK), `url` (S3), `url_miniature`, `date_prise`, `orientation`, `inclinaison`,
    `statut_validation`. (Aligné CLAUDE.md §7.)

- **`certificat`** — le document émis (si/quand implémenté).
  - `id`, `analyse_id` (FK), `numero` (`SAVV-AAAA-NNNNNN`, compteur atomique — CLAUDE.md §6), `url_pdf` (S3),
    `emis_le`.

- **`consentement`** — **une ligne par (internaute × finalité × décision)**, horodatée et versionnée (PREUVE, §3).
  - `id`, `internaute_id` (FK), `finalite` (enum : `recontact_commercial` | `email_marketing` | `retargeting_tiers`),
    `accepte` (bool), `horodatage`, `version_mentions`, `source` (ex. `formulaire_certificat`), *jamais* d'IP en
    clair (à trancher §7 : preuve de consentement vs minimisation IP).
  - **Ne jamais écraser** : un retrait de consentement = **nouvelle ligne** `accepte=false` (traçabilité). L'état
    courant d'une finalité = la ligne la plus récente.

- **`statut_commercial`** — suivi par contact (finalité 1).
  - `id`, `internaute_id` (FK), `statut` (enum : `nouveau` | `a_rappeler` | `rappele` | `pas_interesse` | `oppose`),
    `note` (libre, interne), `maj_le`, `maj_par` (admin). Historisation possible (table d'événements de statut).

### 2.2 Relations & séparation identité / technique

```
internaute (identité/contact, sensible)
   ├─1..N→ analyse (résultat technique)
   │          ├─1..N→ photo (URL S3 + métadonnées)
   │          └─0..1→ certificat (numéro + PDF S3)
   ├─1..N→ consentement (une ligne / finalité / décision, horodatée, versionnée)  ← PREUVE
   └─1..1→ statut_commercial (suivi finalité 1)
```

- **Séparation forte** : `internaute` (qui) ≠ `analyse` (quoi/résultat). Permet de purger/chiffrer l'identité
  indépendamment, et d'appliquer des durées de conservation distinctes.
- **`statut_commercial` par contact** : `nouveau → a_rappeler → rappele → pas_interesse / oppose`. Le statut
  `oppose` (ou le flag `opposition_recontact`) **bloque** la force commerciale (§3 droits).

---

## 3. Cadrage RGPD — LE CŒUR DE L'ÉTUDE

> Rappel : principes généraux, **pas un avis juridique** (validation DPO requise, §7).

### 3.1 Distinction fondamentale : DONNÉES DU SERVICE vs FINALITÉS ADDITIONNELLES

**a) Données NÉCESSAIRES au service (le certificat).**
- Nom, email, adresse du bien = **obligatoires pour établir et envoyer le certificat**. Base légale plausible :
  **exécution du contrat / du service demandé** (art. 6.1.b) — l'internaute demande explicitement le certificat.
- Peuvent être **exigées sans consentement marketing** : on peut rendre nom/email/adresse obligatoires *pour le
  certificat*, car ils sont nécessaires à CE service. (⚠️ le **téléphone** est-il nécessaire au certificat, ou
  seulement au recontact commercial ? Si le certificat part par email, le téléphone n'est PAS nécessaire au
  service → il relève alors du consentement recontact, pas de l'obligation service. À trancher §7.)

**b) FINALITÉS ADDITIONNELLES = CONSENTEMENTS EN COUCHES.**
Règles NON négociables (principes RGPD) :
- **Une case = une finalité.** Trois finalités → **trois cases distinctes**.
- **Jamais pré-cochées** (le consentement doit être un acte positif clair).
- **Jamais conditionnées au certificat** (interdiction du **couplage** : un consentement conditionné à l'obtention
  du service est **NUL**). L'internaute doit pouvoir obtenir son certificat **sans** cocher aucune case marketing.

| Finalité | Case (formulation à valider juriste) | Base légale plausible (à trancher §7) | Sensibilité |
|---|---|---|---|
| **1. Recontact commercial INTERNE** | « Un spécialiste Sans Vis-à-Vis peut me recontacter pour discuter de mon projet » | **Le plus défendable si l'internaute DEMANDE le recontact** (service demandé) ; sinon **intérêt légitime** (interne, pas de tiers) OU consentement. À trancher. | Modérée (interne, pas de tiers) |
| **2. Relances email** | « Je souhaite recevoir vos communications par email » | **Consentement** (opt-in prospection électronique) | Moyenne |
| **3. Retargeting réseaux sociaux** | « J'accepte le ciblage publicitaire sur les réseaux sociaux (Meta/Google) » | **Consentement spécifique** — ⚠️ **TRANSFERT VERS TIERS** (Meta/Google) | **La plus haute** (sanctions CNIL si non consenti) |

**Nuance décisive** : la finalité 1 (recontact interne) est la plus simple car **aucune donnée ne sort** vers un
tiers. La finalité 3 fait **SORTIR** les coordonnées vers Meta/Google (audiences personnalisées) → régime le plus
strict (consentement spécifique + information sur le transfert tiers + éventuel transfert hors UE selon l'outil).

### 3.2 BANDEAU COOKIE vs CONSENTEMENT FORMULAIRE — ne pas confondre

Ce sont **deux consentements distincts qui ne se recouvrent pas** :

| | Objet | Couvre | Ne couvre PAS |
|---|---|---|---|
| **Bandeau cookie** | Traceurs **navigateur** posés sur le site (analytics tiers, pixels pub) | Le dépôt de cookies/pixels lors de la navigation | **PAS** l'usage marketing des coordonnées collectées dans le formulaire |
| **Consentement formulaire** | Usage des **coordonnées** (email/téléphone) fournies au certificat | Les finalités 1/2/3 (recontact, email, retargeting **de la base**) | **PAS** les traceurs de navigation |

**Conséquence critique** : **le bandeau cookie NE COUVRE PAS le retargeting de la base nominative.** Charger un
email dans une audience Meta/Google (finalité 3) exige le **consentement FORMULAIRE spécifique**, pas l'acceptation
du bandeau cookie. Confondre les deux est une cause classique de non-conformité.
*(Note : M2 est conçu pour fonctionner **sans** bandeau cookie de traçage — cf. SPEC_M2 ; le bandeau ne devient un
sujet que si des pixels Meta/Google sont posés sur le site public, ce qui est un autre chantier.)*

### 3.3 Preuve de consentement

Stocker, **par consentement** (table `consentement`, §2) : **qui** (internaute_id), **quand** (horodatage),
**quelle finalité**, **quelle version des mentions** (versioning du texte affiché). Un retrait = nouvelle ligne
(jamais d'écrasement). Objectif : pouvoir **prouver** à tout moment qu'une personne a consenti à une finalité
précise, à une date précise, sur la base d'un texte précis.

### 3.4 Mentions d'information

- **Où** : sur le **formulaire de certificat** (au moment de la collecte) **ET** rappel sur la **fiche résultat**.
- **Contenu minimal** : finalités (les 3, distinctes), **responsable de traitement** (Sans Vis-à-Vis), **durées de
  conservation** (§3.7), **droits** (accès, rectification, effacement, opposition, portabilité + comment les
  exercer), **destinataires** (interne ; pour la finalité 3 : mention explicite du **transfert vers Meta/Google**),
  éventuel transfert hors UE.

### 3.5 Droits des personnes

- **Effacement COMPLET (exigence explicite d'Arno)** : suppression en **cascade** de l'internaute → analyses →
  **photo S3** (l'objet dans le bucket, pas seulement l'URL en base) → certificat PDF S3 → consentements →
  statut_commercial. Prévoir un **processus de purge** qui va jusqu'à l'object storage (une simple suppression de
  ligne laissant l'image sur S3 = non conforme). *(Rappel garde-fou build : cf. Règle dure « interdiction de
  suppression autonome » — toute purge est un process explicitement validé, jamais improvisé par un agent.)*
- **Opposition (« ne pas recontacter »)** : flag `opposition_recontact` / statut `oppose` qui **bloque la force
  commerciale**. Pour le **téléphone** : **Bloctel** s'applique **jusqu'au 11/08/2026**, puis le régime bascule en
  **OPT-IN** (loi du 30 juin 2025, cf. **Section A**). ⚠️ Dès lors, le droit d'opposition **ne suffit plus** : appeler
  exige un **consentement préalable prouvé**. Le module doit donc gérer **le consentement téléphonique ET
  l'opposition**, pas seulement l'opposition.
- **Accès / rectification** : consultation et correction des données d'une personne.
- **Portabilité** : **export d'UNE personne** (ses données dans un format réutilisable).

### 3.6 Sécurité & accès

- **Chiffrement** au repos des données de contact sensibles (email/téléphone) ; TLS en transit (déjà le cas).
- **Contrôle d'accès admin** : **qui** peut voir/filtrer/**extraire** la base nominative = permission dédiée
  (analogue au modèle `perm_*` existant + garde serveur `exigerCompteActif`, cf. `app/lib/admin/garde.ts`). La base
  nominative est **bien plus sensible** que M2 → accès restreint, distinct de la permission statistiques.
- **Journalisation** des accès **et des extractions** (qui a exporté quoi, quand, pour quelle finalité) — traçabilité
  (le repo a déjà un modèle de journal d'audit : `curation_patrimoine_log`, `analytics_admin_jour`).

### 3.7 Conservation (durées — à VALIDER juriste)

Durées **limitées et distinctes par finalité** (à trancher §7). Principe : ne pas conserver indéfiniment. Exemples
de logique (indicatifs, non juridiques) : données de prospect sans suite commerciale → durée courte ; contact actif
en relation commerciale → durée liée à la relation ; base légale service (certificat) → durée liée à l'obligation.
**Purge automatique** en fin de durée (comme le job de rétention M2, `analytics_retention`).

### 3.8 Minimisation

Ne collecter que le nécessaire **par finalité**. Le téléphone n'est utile qu'au recontact (finalité 1) → ne pas
l'exiger pour un internaute qui ne veut que son certificat par email (à confirmer §7). Ne pas stocker la photo si
elle n'est pas nécessaire au certificat émis.

---

## A — [MISE À JOUR] Loi démarchage téléphonique du 30 juin 2025 — IMPACT CRITIQUE

> Rappel : synthèse de contexte légal, **pas un avis juridique** (validation DPO requise, §7). Références citées à
> vérifier par un juriste.

- **Texte** : **loi n° 2025-594 du 30 juin 2025, art. 13**, modifiant l'**art. L223-1 du Code de la consommation**.
  **Entrée en vigueur : 11 août 2026** (imminente à l'échelle d'un projet).
- **Renversement de logique : de l'OPT-OUT (Bloctel) à l'OPT-IN.** **Bloctel disparaît le 11 août 2026.** On ne peut
  plus appeler « tant que la personne ne s'est pas opposée » ; il faut son **consentement préalable**.
- **Interdiction de démarcher par téléphone** un consommateur **qui n'a pas exprimé préalablement son consentement**.
  Ce consentement doit être **libre, spécifique, éclairé, univoque, révocable** — un **acte positif clair** (case à
  cocher **non pré-cochée**). ⚠️ **L'acceptation des CGU ne suffit PAS.**
- **⚠️ CHARGE DE LA PREUVE SUR LE PROFESSIONNEL** : Sans Vis-à-Vis devra **prouver comment, quand et dans quelles
  conditions** le consentement téléphonique a été recueilli. → **Impact modèle de données (§2)** : la table
  `consentement` DOIT stocker, pour la finalité téléphone, l'**horodatage**, la **version des mentions** affichées,
  et le **canal**/source de recueil. Sans cette preuve, l'appel est en infraction.
- **Exception « contrat en cours »** : un appel **sans** consentement est autorisé s'il intervient **dans le cadre de
  l'exécution d'un contrat en cours ET a un rapport avec l'objet de ce contrat**. Un appel sur des offres **sans lien**
  avec le contrat exige le consentement. → **Frontière fine à faire trancher par le juriste (§7)** : « appel pour
  finaliser/préciser le service certificat demandé » (exception possiblement mobilisable) **vs** « prospection
  commerciale large » (consentement requis).
- **Obligation d'information dès la collecte du numéro** : informer que toute **sollicitation téléphonique
  commerciale suppose le consentement préalable** (mention à ajouter au formulaire, cf. §3.4).
- **Sanctions** : jusqu'à **375 000 €** (personne morale, **doublé en récidive**) ; **nullité des contrats** conclus
  via un démarchage non consenti ; volet **pénal jusqu'à 500 000 € / 5 ans** en cas de manœuvres agressives.
- **Double opt-in en BtoC** : la prospection **téléphonique** exige un opt-in **au titre de la loi 2025-594 ET du
  RGPD**. La prospection **email/SMS** est, elle, **déjà** en opt-in (RGPD / ePrivacy).
- **IMPACT ARCHITECTURE** :
  - La case « **un spécialiste peut me recontacter par téléphone pour discuter de mon projet** » n'est plus une
    option de confort mais la **condition légale d'appel** (sauf exception « contrat en cours » à confirmer).
  - **Preuve de consentement téléphonique stockée = OBLIGATOIRE** (table `consentement`, §2 : horodatage + version +
    canal).
  - **Construire directement en régime OPT-IN.** L'application est **vierge** (aucune base existante à migrer, §1) —
    autant la concevoir conforme d'emblée. Concrètement : le **consentement téléphonique + sa preuve** font partie du
    **LOT 1** (socle de conformité, §8), pas d'un lot ultérieur.

---

## B — [MISE À JOUR] Valeur juridique du certificat : encadrement des loyers / complément de loyer

> Contexte produit **et** juridique — **pas un avis juridique**. Points de droit à confirmer par un juriste (§7).

- **Contexte** : **encadrement des loyers** à **Paris + 69 villes** en zone tendue (dispositif **expérimental
  jusqu'au 23 nov. 2026**, **reconduction probable mais non encore actée — à surveiller**). Le loyer de référence
  majoré est un **plafond**, sauf **COMPLÉMENT DE LOYER** justifié par une caractéristique exceptionnelle du bien.
- **La VUE DÉGAGÉE / REMARQUABLE est un critère RECONNU** pour justifier un complément (vue panoramique, sur monument,
  sur la Seine…). Confirmé par la **Cour de cassation** (vue sur monument historique à proximité + étage élevé =
  complément **légalement justifiable**). → Le certificat Sans Vis-à-Vis a une **valeur d'usage juridique réelle**.
- **MAIS critère STRICT et souvent CONTESTÉ** : la vue doit être **véritablement exceptionnelle/distinctive** par
  rapport aux biens **comparables du secteur** (« beaucoup de logements ont une vue » est un argument opposé par des
  locataires). **Conditions cumulatives** (caractéristique non déjà intégrée au loyer de référence + loyer de base au
  plafond majoré). Complément souvent **plafonné (~20 % du loyer de référence)**. **Contestable** par le locataire
  (3 mois → Commission de conciliation → tribunal).
- **POSITIONNEMENT PRODUIT — double marché** : côté **propriétaire** (justifier objectivement un complément au titre
  de la vue) **et** côté **locataire** (vérifier / contester un complément). Le **verdict 100 % géométrique/LiDAR
  objectif** (cf. invariants moteur) sert la **neutralité** et la **crédibilité** vis-à-vis des deux marchés et du
  juge.
- **⚠️ RESPONSABILITÉ ACCRUE** : un certificat produit dans un **contentieux locatif** engage la responsabilité de
  Sans Vis-à-Vis. Le certificat doit énoncer un **FAIT GÉOMÉTRIQUE** (« premier obstacle réel à ≥ 40 m », « dégagement
  sur tel axe/amplitude »), **JAMAIS une conclusion juridique** (« ce bien mérite un complément de loyer » relève du
  **juge**, pas de Sans Vis-à-Vis). → Prévoir des **mentions/limites de portée** claires sur le certificat + une
  **question d'assurance responsabilité civile professionnelle** (§7).
- **LIEN AVEC LA SECTION A (téléphone/identité)** : la valeur d'usage **juridique** du certificat (document
  potentiellement **opposable** en contentieux) **renforce la légitimité d'une vérification d'identité** du
  bénéficiaire (téléphone / **OTP SMS**), au titre du **sérieux** d'un document opposable. À **articuler avec la
  minimisation** (§3.8) et à faire trancher (§7) : la vérification d'identité justifie-t-elle d'exiger le téléphone,
  et par quel moyen (OTP) ?

---

## 4. Exploitation (filtres + extraction)

### 4.1 Filtres

Structurer l'exploration de la base par : **date** (période de l'analyse), **verdict** (SANS/VIS/INDÉTERMINÉ),
**géolocalisation** (commune / département), **statut commercial** (`nouveau`/`a_rappeler`/…), et **par finalité
consentie** (voir 4.2). Autres au choix (score, dernier étage, etc.).

### 4.2 Extraction / export — LA RÈGLE D'OR

**Pour CHAQUE finalité, n'extraire QUE les personnes ayant consenti à CETTE finalité.**
- Export **retargeting** (finalité 3) = **uniquement** les internautes dont la dernière ligne `consentement`
  `finalite='retargeting_tiers'` est `accepte=true` **et** non opposés.
- Export **email** = uniquement opt-in email.
- Export **force commerciale** = uniquement consentants finalité 1 **et** non opposés (statut ≠ `oppose`).
- **Jamais d'export « toute la base »** mélangeant des finalités : l'export est **toujours filtré par la finalité
  visée**, calculé côté serveur (le client ne reconstitue jamais une liste non consentie).
- **Traçabilité** : chaque extraction est **journalisée** (qui, quand, quelle finalité, combien de lignes) — cf.
  §3.6.

---

## 5. Benchmark MeilleursAgents (synthèse transposable)

- **Ce qu'ils font** : habillent la collecte en **service de mise en relation** (base légale = exécution du
  contrat), **transmettent aux partenaires TIERS** dans le cadre du service, prévoient **droit d'opposition** +
  **Bloctel**.
- **Différence clé pour Sans Vis-à-Vis** :
  - Finalités 1 & 2 (recontact interne, email) : **PAS de transmission à des tiers** → **plus simple** que
    MeilleursAgents (pas de partage partenaires). Le recontact peut être présenté comme un **service** (« un
    spécialiste vous rappelle pour votre projet »).
  - Finalité 3 (retargeting) : **fait sortir les données vers Meta/Google** → là, Sans Vis-à-Vis **rejoint la
    complexité du transfert tiers** de MeilleursAgents (consentement spécifique, information sur le tiers).
- **Leçons transposables** :
  - **Formulaire progressif < 5 min** : friction minimale, collecte étalée.
  - **Recontact présenté comme un service** (pas comme de la pub) : rend la finalité 1 plus légitime et mieux
    acceptée.
  - **Le « compte » / le suivi comme prétexte de recontact légitime** : un espace de suivi (statut de la demande)
    donne une raison de service au recontact.
  - ⚠️ Ces habillages **ne dispensent PAS** du consentement spécifique pour la finalité 3 (transfert tiers).

### 5.1 [MISE À JOUR] Benchmark Maline — la conformité comme argument commercial

- **Qui** : Maline (Lyon, fondé 2018-2019 par un ex-directeur digital d'ORPI) = **générateur de leads vendeurs
  prédictif** (Big Data + « moments de vie »), **revendu aux agences** par abonnement (**59 € à 300 €+/mois**),
  **territoire exclusif**. Modèle **PUSH** (inférer qui va vendre) — à l'inverse du modèle **PULL** de Sans
  Vis-à-Vis / MeilleursAgents (un service qui **attire** l'internaute).
- **Leçon centrale** : leur **argument commercial N°1 est la CONFORMITÉ** (« alternative **légale** à la pige, respect
  RGPD + loi démarchage »). → **Dans ce secteur, la conformité est un ACTIF commercial, pas un frein.** Cela conforte
  la stratégie « conformité d'abord » (§8) : elle est aussi un argument de vente.
- **Transposable à Sans Vis-à-Vis** :
  - **Lead scoring** : Sans Vis-à-Vis dispose de **critères en or** pour qualifier les contacts « chauds » — **verdict**,
    **score de vue**, **géolocalisation**, **étage**. Un contact « Sans vis-à-vis, score élevé, étage élevé » est un
    prospect qualifié. (⚠️ le scoring reste **interne** et **cloisonné de M2** anonyme, §6.)
  - **Rapidité de contact** : contacter dans les **~5 min** multiplierait la conversion par **~9** → intérêt d'une
    **alerte force commerciale en temps réel** (finalité 1) — sous réserve du **consentement téléphonique** (Section A).
  - **Valeur d'un lead vendeur chaud** : CPL indicatif **~20-40 €** → repère pour **estimer la valeur future** de la
    base nominative consentie (aide à prioriser le build).
- **Nuance** : Maline **revend à des agences tierces** ; Sans Vis-à-Vis exploite **en interne** (finalités 1 & 2) →
  plus simple. Seul le **retargeting (finalité 3)** fait sortir des données vers des tiers (Meta/Google).

---

## 6. Cloisonnement vs M2 (frontière technique et logique)

**Principe non négociable : le module nominatif est TOTALEMENT CLOISONNÉ de M2 (statistiques anonymes, k=11).**

| | M2 (statistiques) | Module Internautes (nominatif) |
|---|---|---|
| Nature | **Anonyme** (k=11, agrégats) | **Nominatif** (identité/contact) |
| Source | Beacon `/api/mesure` + événement `resultat` **anonymes** | **Formulaire certificat CONSENTI** (source distincte) |
| Contenu | Commune INSEE, verdict, tranche score, **jamais** d'IP/identité/lat-lon | Nom, email, téléphone, adresse, analyses rattachées |
| Frontière | CHECK anti-fingerprint (018:126-133), pool analytique dédié | Tables + accès + permission **séparés** |

**Règles de frontière** :
- **Aucune jointure** entre tables nominatives et tables `analytics_*`. **Aucun `internaute_id` dans M2**, **aucun
  agrégat M2 recopié** dans le nominatif.
- **Aucun flux** M2 → nominatif ni l'inverse. M2 **reste anonyme** ; il ne devient jamais une source d'identités.
- L'événement `resultat` (M2) et l'`analyse` nominative décrivent le **même acte** mais par **deux chemins
  disjoints** : M2 dérive la commune puis **jette lat/lon** (`analyse/route.ts:79-80`) ; le nominatif (à construire)
  conservera lat/lon **sous consentement**, dans un stockage séparé. Ils ne se rejoignent jamais.
- **Contrôle** : une garde de test (analogue à `garde.test.ts` de M2 qui interdit à l'UI stats d'importer la base)
  pourra vérifier qu'aucun module nominatif n'importe `analytics/*` et réciproquement.

---

## 7. Questions pour le JURISTE / DPO (à trancher avant tout build)

1. **Base légale de chaque finalité** : le **recontact commercial** (finalité 1) relève-t-il de l'**intérêt
   légitime**, du **consentement**, ou de l'**exécution du service** si l'internaute demande explicitement le
   rappel ? (Détermine s'il faut une case à cocher ou non.)
2. **Téléphone** : est-il **nécessaire au service** (certificat), ou relève-t-il du **consentement recontact** ?
   (Impacte s'il peut être exigé.)
3. **AIPD / analyse d'impact** : est-elle **nécessaire** au vu de la sensibilité (position de logement + verdict +
   retargeting tiers à grande échelle) ?
4. **Retargeting Meta/Google (finalité 3)** : conditions exactes de conformité (consentement spécifique, mentions,
   transfert hors UE selon l'outil, éventuelle base de calcul de hash côté audiences).
5. **Durées de conservation** par finalité (prospect sans suite, contact actif, base service).
6. **Formulation exacte des cases** de consentement et des mentions d'information (versionnées).
7. **Statut des photos** : conservation, base légale, durée, effacement S3 (l'image est-elle nécessaire au
   certificat ? combien de temps ?).
8. **Articulation bandeau cookie vs consentement formulaire** : si des pixels Meta/Google sont posés sur le site,
   quel périmètre couvre le bandeau, quel périmètre couvre le formulaire.
9. **Preuve de consentement** : peut-on/doit-on horodater sans stocker d'IP (minimisation) ? Quelle granularité de
   preuve est exigée ?
10. **Opposition & Bloctel** : modalités exactes pour le démarchage téléphonique **jusqu'au 11/08/2026**, puis
    articulation avec le nouveau régime opt-in.

**Ajouts liés aux mises à jour (Sections A & B) :**

11. **Frontière « contrat en cours » vs prospection (loi 2025-594)** : jusqu'où un appel « pour finaliser/préciser le
    service certificat demandé » relève-t-il de l'**exception contrat en cours** (sans consentement), à partir de quand
    devient-il de la **prospection** exigeant le consentement ? (Détermine si un opt-in téléphone est requis pour le
    recontact « projet ».)
12. **Téléphone & vérification d'identité d'un certificat à valeur juridique** : peut-on **exiger le téléphone** au
    titre de la **vérification d'identité** d'un document opposable (encadrement des loyers), **au regard de la
    minimisation** ? Une **vérification SMS / OTP** est-elle proportionnée et admissible ?
13. **Responsabilité d'un certificat produit en contentieux locatif** : **mentions** et **limites de portée**
    obligatoires sur le certificat (fait géométrique, pas conclusion juridique) ; nécessité d'une **assurance RC
    professionnelle** ?
14. **Formulation exacte des cases opt-in** (téléphone / email / retargeting) conforme **à la fois** à la loi 2025-594
    et au RGPD (une case par finalité, non pré-cochée, non couplée).
15. **Preuve de consentement à stocker** : **format**, **granularité** et **durée** de conservation de la preuve
    (notamment téléphonique — charge de la preuve, Section A) ; peut-on/doit-on horodater sans stocker d'IP ?
16. **Incertitude sur la reconduction de l'encadrement des loyers (échéance nov. 2026)** : impact sur la
    **communication commerciale** « justifier un complément de loyer » (que dire/ne pas dire tant que la reconduction
    n'est pas actée ?).

---

## 8. Découpage en lots (SI un build est un jour décidé) — séquencement PRUDENT

> Ordre **imposé par la conformité** : on construit d'abord ce qui protège, puis ce qui exploite. **Jamais
> l'inverse.** Chaque lot est committable seul et **subordonné à la validation juridique préalable** (§7).

- **LOT 0 — Cadrage juridique (hors code).** Réponses DPO au §7, formulation des cases + mentions, durées, décision
  AIPD. **Bloquant** : rien ne se construit avant.
- **LOT 1 — Socle nominatif + consentements + effacement/opposition (CONFORMITÉ D'ABORD).**
  - Tables `internaute` / `analyse` / `photo` (URL) / `consentement` / `statut_commercial`.
  - Système de **consentements en couches** (une case par finalité, non pré-cochées, non couplées) + **preuve**
    (horodatage, version des mentions, **canal**). ⚠️ **Inclut dès le LOT 1 l'opt-in TÉLÉPHONE + sa preuve**
    (loi 2025-594, Section A) : la charge de la preuve étant sur Sans Vis-à-Vis, ce n'est pas reportable à plus tard.
  - **Droit d'effacement complet** (cascade + purge S3) + **opposition** (flag bloquant) + accès/rectification +
    **export d'une personne** (portabilité).
  - Permission admin dédiée + journalisation des accès.
  - **Aucune exploitation marketing encore.** À ce stade on collecte proprement et on sait supprimer.
- **LOT 2 — Force commerciale INTERNE (finalité 1).** Statut commercial, filtres (date/verdict/géo/statut), vue
  admin, respect de l'opposition. Pas de tiers → le plus simple.
- **LOT 3 — Relances email (finalité 2).** Export/segments **uniquement opt-in email**, respect du retrait,
  désinscription.
- **LOT 4 — Retargeting réseaux sociaux (finalité 3) — LE PLUS TARD, LE PLUS SENSIBLE.** Export **uniquement
  opt-in retargeting**, mentions transfert tiers, traçabilité stricte. À ne lancer qu'après validation juridique
  spécifique de la finalité 3.

**Rappel transverse** : à chaque lot, **cloisonnement M2 préservé** (§6), **effacement testé de bout en bout**
(y compris S3), **golden/M2 hors de portée** (le nominatif ne touche ni le moteur ni les analytics anonymes). **Le
jour où le certificat (`SAVV-…`, actuellement non implémenté) sera construit**, il devra porter les **mentions/limites
de portée** (fait géométrique, jamais conclusion juridique — Section B) et la question **assurance RC pro** aura été
tranchée (§7-13).

---

## 9. Ce que cette étude NE fait pas

Aucune ligne de code, aucune migration, aucune table créée. Aucun endpoint, aucun schéma appliqué. **La construction
n'est pas engagée** : elle suppose (a) la validation juridique/DPO du §7, puis (b) une décision explicite d'Arno de
lancer le LOT 0 → LOT 1. Ce document est le **support de cette décision**, pas son exécution.
