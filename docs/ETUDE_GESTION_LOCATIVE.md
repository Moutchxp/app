# ÉTUDE — Module « Gestion locative »

> **Statut : ÉTUDE RÉVISÉE, LECTURE SEULE. Aucun code, aucune table, aucune migration n'a été créé.**
> Version initiale du 2026-09-23 (commit `97f314e`), établie par cinq mandats parallèles dont un
> **contradicteur**. **Révisée le 2026-09-23** avec les réponses d'Arno aux sept questions ouvertes : ces
> réponses sont désormais des **faits**, plus des hypothèses, et elles changent la structure du projet — pas
> seulement ses détails.
>
> **Décisions cadres, non rouvertes** : le module est construit **dans** l'application existante (même
> serveur, même authentification, même base). Le logiciel **WIPPIMMO fait foi** pour le référentiel. Tous les
> messages, envoyés comme reçus, restent **visibles dans la boîte Gmail d'origine**.
>
> ⚠️ **Ce document n'est pas un avis juridique.** Les points de droit (RGPD, charges locatives, obligations
> d'entretien) sont signalés là où ils apparaissent et **doivent être validés par un professionnel**. Règle de
> conception retenue partout : **ne pas coder la règle de droit, tracer la décision humaine.**

---

## 0. Résumé pour décideur

**Les réponses d'Arno ont amélioré le projet sur trois points et l'ont durci sur un quatrième.**

**① L'envoi depuis une carte n'est pas un risque à repousser : c'est le meilleur signal de classement.**
J'avais proposé de le reporter, par prudence. Arno a inversé l'arbitrage, et **son raisonnement est meilleur
que le mien** : un mail envoyé depuis une carte revient tout seul dans cette carte, parce que nous maîtrisons
le fil de discussion **de bout en bout**. Ce n'est pas une heuristique qui devine après coup — c'est une
certitude par construction, à 100 %. Le retarder, c'était se priver du signal le plus fiable pour éviter un
risque qui se traite par des garde-fous. L'envoi remonte donc au **lot 4**, et le risque d'écrire au mauvais
destinataire est traité par trois verrous (§5, objection 3).

**② Monga est passé d'inconnue à atout.** Arno a fourni un vrai mail : la référence a la forme **`MNG-23987`**,
toujours préfixée, et le message porte **aussi** le titre de l'intervention **et** l'adresse du bien en clair.
Trois signaux concordants sur le même message, là où j'en supposais un seul et incertain. Conséquence : ce
flux se classe quasi parfaitement, **et** une référence `MNG-` inconnue peut créer automatiquement une carte.

**③ Le volume est modeste, et cela change l'ergonomie.** 320 biens, 10 à 30 mails par jour, soit **220 à 660
par mois** — environ **16 mails par bien et par an**. Un bien a donc rarement plus d'une intervention ouverte
à la fois, ce qui rend très fiable le signal « cet expéditeur n'a qu'un seul dossier ouvert ». À ce volume,
une file « à classer » de 40 à 60 mails par mois se traite en quelques minutes par jour.
→ **Le taux de classement automatique attendu passe de ~79 % à ~91 %** (§3.4).

**④ Plusieurs collaborateurs : l'hébergement n'est plus optionnel.** C'était ma réserve bloquante ; elle est
levée par une décision, pas par une pirouette. L'hébergement devient un **lot à part entière** (lot 3), placé
avant tout usage réel à plusieurs. Ce qui peut être construit et testé **avant** lui est précisément délimité
au §6.

**Ce qui n'a pas changé** : on ne recopie pas les mails en base (Gmail reste la source de vérité, on ne garde
que des pointeurs) ; on ne touche pas au drapeau « lu » de Gmail (état métier à la place) ; et les trois
manques que j'avais identifiés — **responsable par intervention**, **date de prochaine action**, **notes
internes d'appel** — sont validés par Arno et entrent dans le noyau.

**Le chantier tient en 8 lots, ~45 à 70 jours de travail**, le premier service utile arrivant au lot 2.

---

## 1. Ce qui existe déjà et qui sert

> Chaque ligne est prouvée `fichier:ligne`. Verdicts : **RÉUTILISABLE** · **À ÉTENDRE** · **NE CONVIENT PAS**.

### 1.1 Les briques précieuses

| Brique | Preuve | Verdict | Ce que ça fait gagner |
|---|---|---|---|
| **Cascade de rattachement** | `app/lib/veille/rattachementReponse.ts` (243 l.), règle `:131` | **RÉUTILISABLE** (patron) | La partie la plus difficile du classement est **déjà conçue, écrite et testée** (275 l. de tests). Module « pur » : aucune base, aucun réseau → rejouable hors ligne. |
| **Client OAuth Google écrit à la main** | `app/lib/permis/drive.ts` (156 l.) + `app/scripts/drive-autoriser.ts` | **RÉUTILISABLE** | Le schéma « identifiant + secret + jeton de rafraîchissement → jeton d'accès → appel REST » existe déjà. Se transpose à Gmail **et** sert déjà pour Drive. |
| **Tuiles d'administration + droits** | `session.ts:7`, `garde.ts:84-103`, `proxy.ts:23-43`, `menuAdmin.ts:11-21` | **À ÉTENDRE** (recette en 7 points) | Tuile gardée, permission déléguable par collaborateur, révocation en base, défaut *fail-closed*. Zéro sécurité à reconcevoir — et avec **plusieurs collaborateurs**, cette brique devient centrale. |
| **Import de fichier + journal de run** | `074_releve_auto.sql:40-60`, patrons d'ingestion `app/lib/sitadel/` | **À ÉTENDRE** | Le patron « ligne `en_cours` écrite avant, `ok`/`erreur` après » évite qu'un import interrompu passe pour réussi. Directement utile au lot 1. |
| **Verrou d'exécution unique** | `verrouVeille.ts:9`, `executerVeille.ts:527` | **RÉUTILISABLE** | Empêche deux imports ou deux synchronisations simultanés. |

### 1.2 Ce qui NE convient pas

| Élément | Preuve | Pourquoi |
|---|---|---|
| **Le client IMAP** | `imap.ts:5-7`, `:79`, `:170` | **Lecture stricte**, règle déclarée « non négociable ». Et le besoin est désormais tranché : on passe par **l'API Gmail** (§4). Ne jamais y toucher : ce serait ouvrir un droit d'écriture sur la boîte du module Permis par effet de bord. |
| **L'envoi SMTP existant** | `email/index.ts:40-47`, `:118` | Techniquement réutilisable (le `from` est un paramètre, plusieurs comptes sont gérés) — **mais écarté par une exigence d'Arno** : un envoi SMTP parallèle **n'apparaîtrait pas** dans les « Messages envoyés » de Gmail. Or tous les messages doivent rester visibles dans la boîte d'origine. → **envoi par l'API Gmail**, pas par SMTP. |
| **La table `demande_reponse`** | `073:30`, `:32`, `096:34`, **`:37-38`** | FK obligatoire vers `demande`, contraintes propres à l'urbanisme, et surtout : **ne stocke que l'expéditeur, aucun destinataire ni copie**. Table sœur, pas extension. |
| **La recherche existante** | aucun index plein texte dans les 227 migrations ; `demandeReponseRepo.ts:247-253` | Ni `LIMIT`, ni `OFFSET`, ni mots-clés, ni période. |
| **Les statistiques (`analytics`)** | `writer.ts:9-11`, `config.ts:36` | Modèle agrégé, best-effort (« perdre un événement est acceptable »). Un indicateur de gérance doit être exact. |

### 1.3 Deux corrections apportées à la recon (le code fait foi)

Le mandat contradicteur a pris la recon en défaut sur deux points. **Vérification faite, il avait raison** :

- **`MAIL_FROM` n'est pas un verrou** : le `from` est un **paramètre** de chaque envoi (`email/index.ts:118`).
  *(Point devenu sans objet : l'envoi passera par l'API Gmail.)*
- **`permsToutes()` n'est pas un piège silencieux** : `Perms = Record<Module, boolean>` (`session.ts:9`) fait
  **échouer `tsc`** si un module manque. Ce piège est **soldé depuis G1**.

> **Leçon de méthode** : ce dépôt a un précédent documenté de dérive entre documentation et code. La règle
> maison « **le code fait foi** » n'est pas une coquetterie. Toute décision prise sur la foi d'un résumé — y
> compris celui-ci — se re-vérifie dans le code.

### 1.4 Aucun référentiel existant dans le dépôt

Vérifié personnellement : **aucune table de biens, propriétaires, locataires ou baux** dans les 227
migrations. « CRITERIMMO » n'y apparaît que comme raison sociale au RCS, pour les saisines CADA du module
permis. Le module part donc d'une page blanche côté données — et c'est cohérent avec la réponse d'Arno :
**la vérité est dans WIPPIMMO, pas ici.**

---

## 2. Le référentiel : WIPPIMMO fait foi

### 2.1 Le principe, et pourquoi il n'est pas négociable

**WIPPIMMO est la source de vérité** pour les biens, propriétaires, locataires et caractéristiques. Notre
module en détient une **copie de travail**, jamais une saisie parallèle. La raison est mécanique : la vérité
est celle qui produit les quittances et les appels de loyer ; c'est elle qu'on met à jour. Une seconde vérité
n'est jamais mise à jour, devient fausse en trois mois, et le classement des mails — qui s'y adosse — devient
faux avec elle.

**Conséquence de conception, tranchée ici :** chaque bien, propriétaire et locataire porte une colonne
`reference_externe` (son identifiant WIPPIMMO). C'est **cette colonne**, et non notre identifiant interne, qui
fait le lien. Elle est unique, obligatoire pour tout enregistrement importé, et jamais modifiée à la main.

### 2.2 La source doit être interchangeable

Arno demande à son contact WIPPIMMO s'il existe une interface de synchronisation en temps réel. **Réponse
inconnue à ce jour.** Le module est donc conçu pour que la réponse ne change **pas** son architecture :

```
        ┌──────────────────────┐
        │  Fichier WIPPIMMO    │  ← lot 1 (certain)
        │  (CSV / Excel)       │
        └──────────┬───────────┘
                   │        ┌──────────────────────┐
                   │        │  Interface WIPPIMMO  │  ← plus tard, si elle existe
                   │        │  (synchronisation)   │
                   │        └──────────┬───────────┘
                   ▼                   ▼
        ┌────────────────────────────────────────┐
        │  UN SEUL point d'entrée :              │
        │  appliquerReferentiel(lignes[])        │  ← la seule fonction qui écrit
        │  — compare, insère, met à jour,        │
        │    désactive, journalise               │
        └────────────────────────────────────────┘
```

**Ce qui change selon que l'interface existe ou non :**

| | **Interface WIPPIMMO disponible** | **Fichier seulement** (hypothèse de travail) |
|---|---|---|
| Fraîcheur | Quasi temps réel | Aussi fraîche que le dernier import |
| Entretien | Automatique | **À la main**, au fil de la vie du portefeuille |
| Ce qui est en plus | Un lot « connecteur » (~3-5 j) : authentification, appel périodique, gestion des erreurs | Un écran d'import à relancer, et un **rappel visible** si l'import date de plus de N jours |
| Ce qui ne change PAS | `appliquerReferentiel` — comparaison, mise à jour, désactivation, journal — **écrit une seule fois** | idem |
| Risque propre | Dépendance à un tiers, format qui évolue sans préavis | **Dérive silencieuse** : un bien vendu reste actif chez nous |

**Le lot 1 construit le chemin « fichier ». Le connecteur, s'il devient possible, se branche par-dessus sans
refonte** — il appelle la même fonction avec les mêmes données. C'est la seule décision qui rend la réponse de
WIPPIMMO indifférente au calendrier du projet.

**Garde-fou contre la dérive silencieuse** (cas « fichier seulement ») : l'écran affiche en permanence la date
du dernier import, **en rouge au-delà de 30 jours**. Un outil qui dit qu'il est périmé reste honnête.

### 2.3 Ce que le fichier doit contenir, au minimum

Arno obtiendra « au minimum un fichier récapitulatif ». Pour que le module fonctionne, il faut, par bien :
l'**identifiant WIPPIMMO**, l'**adresse complète** (numéro, voie, code postal, ville — l'adresse est un signal
de classement, elle doit être exacte), le **propriétaire** (identifiant + nom), et le **locataire en place**
(identifiant + nom + adresse e-mail si disponible). Tout le reste est bienvenu mais non bloquant.

⚠️ **L'adresse e-mail du locataire est le champ le plus précieux du fichier** : c'est lui qui alimente
l'annuaire, donc le signal « cet expéditeur est le locataire du bien B-0142 ». S'il est absent du fichier,
l'annuaire se remplit à la main au fil des premiers classements — le module reste utilisable, mais le taux de
classement automatique démarre plus bas et met deux à trois mois à monter.

---

## 3. Le modèle de données

### 3.1 Sept tables au noyau

La proposition initiale en comptait 18 ; le contradicteur objectait — à raison — que le dépôt compte déjà 227
migrations appliquées à la main, sans registre, avec un seul auteur. J'avais réduit à 6. **Les réponses
d'Arno en ajoutent une** (l'occupation, pour savoir qui habitait où à l'époque d'un mail) : **7 tables**.

Restent hors du noyau, avec la place prévue : devis, autorisations de dépense, factures, assurance détaillée,
répartition des charges, échéances récurrentes.

**`loc_bien`** — le logement. **Copie de WIPPIMMO**, jamais une saisie.

```sql
CREATE TABLE IF NOT EXISTS loc_bien (
  id                bigserial PRIMARY KEY,
  reference_externe text NOT NULL UNIQUE,   -- identifiant WIPPIMMO : LE lien avec la source de vérité
  reference         text UNIQUE NOT NULL,   -- « B-0142 » : lisible, dictable au téléphone
  libelle           text,
  adresse_ligne1    text NOT NULL,          -- « 53 avenue des Ternes »
  adresse_complement text,
  code_postal       text NOT NULL,
  ville             text NOT NULL,
  etage             text,                   -- texte : « RDC », « combles » — jamais un entier forcé
  actif             boolean NOT NULL DEFAULT true,   -- false = sorti du portefeuille (JAMAIS supprimé)
  importe_le        timestamptz NOT NULL DEFAULT now(),
  maj_le            timestamptz NOT NULL DEFAULT now()
);
-- Appariement d'une adresse citée dans un mail, sur la forme NORMALISÉE (patron 085_reference_externe.sql:41)
CREATE INDEX IF NOT EXISTS loc_bien_adresse_norm_idx
  ON loc_bien (upper(regexp_replace(adresse_ligne1 || ' ' || code_postal, '[[:space:],.-]', '', 'g')));
```

**`loc_partie`** + **`loc_partie_email`** — le carnet d'adresses et l'annuaire. Propriétaires, locataires,
artisans, assurances, **Monga** : tous ceux qui écrivent. Une seule table, distinguée par `type`.

```sql
CREATE TABLE IF NOT EXISTS loc_partie (
  id                bigserial PRIMARY KEY,
  reference_externe text,                   -- identifiant WIPPIMMO ; NULL pour un artisan saisi chez nous
  type      text NOT NULL CONSTRAINT loc_partie_type_chk
              CHECK (type IN ('proprietaire','locataire','artisan','assurance','syndic','intermediaire','autre')),
  nom       text NOT NULL,
  prenom    text,
  telephone text,
  note      text,
  actif     boolean NOT NULL DEFAULT true,
  desactive_le timestamptz,                 -- désactivation, JAMAIS de suppression (patron 062_collaborateur.sql:9)
  cree_le   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loc_partie_externe_key
  ON loc_partie (reference_externe) WHERE reference_externe IS NOT NULL;

-- L'ANNUAIRE : « telle adresse e-mail appartient à telle personne ». Le nerf du classement.
CREATE TABLE IF NOT EXISTS loc_partie_email (
  id          bigserial PRIMARY KEY,
  partie_id   bigint NOT NULL REFERENCES loc_partie(id) ON DELETE CASCADE,
  email       text NOT NULL,
  verifiee_le timestamptz,                  -- quand un humain a confirmé « oui, c'est bien lui »
  cree_le     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loc_partie_email_key ON loc_partie_email (lower(email));
```

**`loc_occupation`** — qui habite où, et depuis quand. Sépare la personne du fait de l'occuper. Règle un
problème concret : quand M. Durand quitte le T2 et que Mme Martin y entre, un mail de M. Durand daté d'avril
doit se rattacher au T2 **avec le locataire de l'époque**. Sans cette table, on réécrit l'histoire à chaque
changement de locataire.

```sql
CREATE TABLE IF NOT EXISTS loc_occupation (
  id           bigserial PRIMARY KEY,
  bien_id      bigint NOT NULL REFERENCES loc_bien(id),
  partie_id    bigint NOT NULL REFERENCES loc_partie(id),   -- le locataire
  entree_le    date,
  sortie_le    date,                        -- NULL = occupation EN COURS
  cree_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loc_occupation_bien_idx ON loc_occupation (bien_id) WHERE sortie_le IS NULL;
```

> **Colocation** : je ne pose **pas** de contrainte d'unicité sur l'occupation en cours. Le parc d'Arno n'est
> pas connu sur ce point, et interdire deux occupants simultanés serait un pari inutile. Plusieurs lignes
> ouvertes sur le même bien sont donc permises.

**`loc_intervention`** — la carte d'événement. Les trois champs ⭐ sont ceux qu'Arno a validés.

```sql
CREATE TABLE IF NOT EXISTS loc_intervention (
  id          bigserial PRIMARY KEY,
  reference   text UNIQUE NOT NULL,         -- « LOC-2026-000001 », compteur atomique (patron 053_demande.sql:37)
  bien_id     bigint REFERENCES loc_bien(id),   -- NULLABLE : une carte Monga peut naître sans bien identifié
  nom         text NOT NULL,                -- titre ; par défaut celui de l'intervention Monga (exigence d'Arno)
  nom_origine text,                         -- le titre Monga d'origine, conservé tel quel pour comparaison
  categorie   text NOT NULL CONSTRAINT loc_intervention_categorie_chk
                CHECK (categorie IN ('travaux','fuite_eau','administratif','litige')),
  urgence     text NOT NULL DEFAULT 'normale' CONSTRAINT loc_intervention_urgence_chk
                CHECK (urgence IN ('basse','normale','haute','critique')),
  statut      text NOT NULL DEFAULT 'ouverte' CONSTRAINT loc_intervention_statut_chk
                CHECK (statut IN ('ouverte','en_cours','en_attente','close','annulee')),
  assigne_a             bigint REFERENCES collaborateur(id),  -- ⭐ UNE personne responsable
  prochaine_action_le   date,                                 -- ⭐ « en attente » sans date est un trou noir
  prochaine_action_quoi text,                                 -- ⭐ « relancer le devis Dupont »
  assurance_impliquee boolean NOT NULL DEFAULT false,
  origine     text NOT NULL DEFAULT 'manuelle' CONSTRAINT loc_intervention_origine_chk
                CHECK (origine IN ('manuelle','monga_auto')),
  ouverte_le  timestamptz NOT NULL DEFAULT now(),
  close_le    timestamptz,
  ouverte_par bigint REFERENCES collaborateur(id),
  ouverte_par_libelle text,                 -- nom FIGÉ : lisible des années après (patron 053:44)
  maj_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loc_intervention_ouvertes_idx ON loc_intervention (bien_id) WHERE close_le IS NULL;
-- File des cartes Monga nées sans bien identifié (cas dur n° 1, §4.3)
CREATE INDEX IF NOT EXISTS loc_intervention_sans_bien_idx ON loc_intervention (ouverte_le DESC) WHERE bien_id IS NULL;

-- Références externes suivant une carte : MNG-…, n° de sinistre, n° de mission.
-- FORMAT LIBRE → AUCUNE contrainte de forme (doctrine 085_reference_externe.sql:9).
CREATE TABLE IF NOT EXISTS loc_reference_externe (
  id              bigserial PRIMARY KEY,
  intervention_id bigint NOT NULL REFERENCES loc_intervention(id) ON DELETE CASCADE,
  reference       text NOT NULL,
  source          text,                     -- 'monga' | 'assurance' | 'artisan' | 'saisie'
  cree_le         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loc_reference_externe_key UNIQUE (intervention_id, reference)
);
CREATE INDEX IF NOT EXISTS loc_reference_externe_norm_idx
  ON loc_reference_externe (upper(regexp_replace(reference, '[[:space:]-]', '', 'g')));
```

**`loc_message`** — le pointeur vers un mail. **On ne recopie pas le contenu.** Le corps est chargé à la
demande depuis Gmail quand quelqu'un ouvre la fiche.

```sql
CREATE TABLE IF NOT EXISTS loc_message (
  id              bigserial PRIMARY KEY,
  gmail_id        text NOT NULL UNIQUE,     -- identifiant Gmail : LE pointeur
  gmail_thread_id text NOT NULL,            -- identifiant du fil, natif Gmail
  message_id_rfc  text,                     -- en-tête standard (survit à un changement d'outil)
  sens            text NOT NULL CONSTRAINT loc_message_sens_chk CHECK (sens IN ('recu','envoye')),
  de_adresse      text NOT NULL,            -- conservé : nécessaire au classement
  objet           text,                     -- conservé : nécessaire au classement et à la liste
  date_message    timestamptz NOT NULL,
  -- ÉTAT MÉTIER, en remplacement du « lu/non lu » de Gmail (accord d'Arno)
  etat            text NOT NULL DEFAULT 'a_traiter' CONSTRAINT loc_message_etat_chk
                    CHECK (etat IN ('a_traiter','traite')),
  traite_par      bigint REFERENCES collaborateur(id),
  traite_par_libelle text,
  traite_le       timestamptz,
  classe_le       timestamptz,              -- NULL = file « à classer »
  cree_le         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loc_message_a_classer_idx ON loc_message (date_message DESC) WHERE classe_le IS NULL;
CREATE INDEX IF NOT EXISTS loc_message_a_traiter_idx ON loc_message (date_message DESC) WHERE etat = 'a_traiter';
CREATE INDEX IF NOT EXISTS loc_message_thread_idx ON loc_message (gmail_thread_id);
```

**`loc_message_rattachement`** — le classement. Une table **séparée**, jamais une colonne : un mail peut
concerner **deux biens** (deux lignes) ; on garde **l'historique** des reclassements ; un mail peut être
rattaché au **bien** sans qu'on sache encore à quelle carte.

```sql
CREATE TABLE IF NOT EXISTS loc_message_rattachement (
  id              bigserial PRIMARY KEY,
  message_id      bigint NOT NULL REFERENCES loc_message(id) ON DELETE CASCADE,
  bien_id         bigint REFERENCES loc_bien(id),
  intervention_id bigint REFERENCES loc_intervention(id),
  methode         text NOT NULL CONSTRAINT loc_message_rattachement_methode_chk
                    CHECK (methode IN ('fil_sortant','reference_monga','fil_discussion','reference_interne',
                                       'adresse_bien','expediteur_unique','titre_monga','manuel','aucun')),
  motif           text NOT NULL,            -- phrase lisible, TOUJOURS écrite, même en cas de succès
  actif           boolean NOT NULL DEFAULT true,
  rattache_le     timestamptz NOT NULL DEFAULT now(),
  rattache_par    bigint REFERENCES collaborateur(id),   -- NULL = automatique
  rattache_par_libelle text,
  CONSTRAINT loc_message_rattachement_cible_chk CHECK (bien_id IS NOT NULL OR intervention_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS loc_message_rattachement_interv_idx
  ON loc_message_rattachement (intervention_id, rattache_le DESC) WHERE actif;
```

**`loc_journal`** — qui a fait quoi, quand. Append-only, garanti **en base par un déclencheur** (patron
`118_permis_altitude_journal.sql:60-72`). C'est là que vivent les **notes internes d'appel** ⭐.

```sql
CREATE TABLE IF NOT EXISTS loc_journal (
  id           bigserial PRIMARY KEY,
  entite       text NOT NULL CONSTRAINT loc_journal_entite_chk
                 CHECK (entite IN ('intervention','message','bien','partie','rattachement','import')),
  entite_id    bigint NOT NULL,             -- PAS de FK : la trace survit à la purge de l'objet (doctrine 118:30)
  action       text NOT NULL,               -- 'ouverture','changement_statut','reclassement','note_interne','appel','envoi'
  valeur_avant text,
  valeur_apres text,
  commentaire  text,                        -- ⭐ la NOTE D'APPEL : « propriétaire a validé 840 € par tél., 14h20 »
  survenu_le   timestamptz NOT NULL DEFAULT now(),   -- quand ÇA s'est passé (≠ quand on l'a saisi)
  auteur_id    bigint,
  auteur_libelle text NOT NULL,             -- nom FIGÉ, ou 'automatique'
  horodatage   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loc_journal_entite_idx ON loc_journal (entite, entite_id, horodatage);
```

### 3.2 Les trois choix expliqués

**Pourquoi une table de rattachement et pas une colonne ?** Une colonne répond par *un seul* nombre. La
réalité en dit trois de plus : deux biens possibles, un classement qui évolue, un bien connu sans carte.

**Comment un mail concerne deux biens ?** Deux lignes, même message, deux `bien_id`. Le mail apparaît dans les
deux cartes et n'est stocké qu'une fois ; à l'écran il porte un marqueur pour ne pas passer pour un doublon.

**Comment trace-t-on qui a fait quoi ?** Horodatage + auteur sur chaque fait ; le **nom figé en texte** à côté
de la clé étrangère (lisible même si le collaborateur est désactivé) ; et le journal append-only pour le reste.

---

## 4. La cascade de classement — révisée

### 4.1 Ce que les réponses d'Arno changent

Deux signaux nouveaux, tous deux beaucoup plus forts que ce que j'avais supposé :

**① Le fil sortant : une certitude, pas une heuristique.** Quand un mail part **depuis une carte**, nous
connaissons l'identifiant du fil que nous venons de créer. Toute réponse arrive dans **ce** fil. Le
rattachement n'est pas deviné, il est **su**. C'est l'argument d'Arno, et il est juste : aucun signal *a
posteriori* n'égale un identifiant que l'on a soi-même émis. **Précision : 100 %, par construction.**

**② Monga porte trois signaux concordants.** Le mail fourni par Arno prouve : la référence **`MNG-23987`**
(préfixe constant `MNG-`), **le titre** de l'intervention (« barre de douche defixer »), et **l'adresse du
bien en clair** (« 53 avenue des Ternes, 75017 PARIS »). Expéditeur `interventions@monga.io`.
→ On n'a plus besoin de *deviner* : on peut **exiger la concordance** d'au moins deux des trois. C'est ce qui
fait tomber le taux d'erreurs silencieuses.

⚠️ **Un seul spécimen a été observé.** Le préfixe `MNG-` et la présence des trois éléments sont **prouvés sur
ce mail-là**, pas sur tous. Le format reste donc **en configuration, jamais codé en dur** (doctrine
`085_reference_externe.sql:9`) : si Monga passe à `MNG2-…` ou à six chiffres, on change une valeur, pas du code.

### 4.2 La cascade, signal par signal

Les gardes d'entrée sont inchangées : déduplication ; message de non-remise écarté ; **accusé automatique
marqué mais jamais jeté** (`rattachementReponse.ts:239-243` — ce garde-fou vient d'un bug réel où un accusé de
réception avait été pris pour un rebond et supprimé en silence ; transposé ici, cela voudrait dire perdre
« votre demande a bien été reçue » de Monga).

| # | Signal | Ce qu'il attrape | Ce qu'il rate / risque | Précision |
|---|---|---|---|---|
| **1** | **Fil que NOUS avons créé depuis une carte** | Toute réponse à un envoi sortant de l'outil | Rien, par construction. Seule limite : ne couvre que les fils que nous avons initiés | **100 %** |
| **2** | **Référence `MNG-…`** (objet + corps) | Toute la chaîne Monga d'une intervention | Les interventions gérées en interne sans Monga | ~99 % |
| **3** | **Fil de discussion** (réponse à un mail déjà classé) | La conversation continue | Les « réponses » créées comme mails neufs ; **le fil qui dérive de sujet** (§4.3) | ~95 % |
| **4** | **Notre référence `LOC-…`** citée | Les réponses qui conservent l'objet | Volume faible une fois le signal 1 en place | ~99 % |
| **5** | **Adresse du bien citée** | Le premier contact, **et les mails Monga** (qui la portent en clair) | ⚠️ La **signature** de l'expéditeur contient son adresse → l'écarter avant d'appliquer le signal. Exiger **numéro + voie + code postal**, jamais la voie seule | ~90 % (bien) |
| **6** | **Expéditeur connu × unicité** | Le locataire dont l'occupation ne porte que sur un bien | Un artisan sur dix immeubles : ne conclut jamais — **et c'est voulu** | ~95 % (bien) |
| **7** | **Titre d'intervention Monga** | Appoint : confirme un candidat, ne le désigne jamais seul | Titre modifié côté Monga (§4.3) | appoint |
| **8** | **File « à classer »** | Tout le reste | — | — |

**Règle d'or conservée** : deux candidats au même niveau → **on ne tranche pas, on demande**
(`rattachementReponse.ts:131`). Et le **motif est toujours écrit**, y compris en cas de succès.

**Règle ajoutée pour Monga** : quand deux des trois signaux Monga **se contredisent** (la référence pointe la
carte A, l'adresse désigne le bien de la carte B), on **ne classe pas** et on signale la contradiction. Ce cas
ne devrait jamais survenir ; s'il survient, c'est qu'une référence a été recopiée d'un dossier à l'autre, et
c'est précisément ce qu'il faut voir.

### 4.3 Les cas durs de Monga (demandés par Arno)

**① Référence `MNG-` inconnue dont l'adresse ne correspond à aucun bien du référentiel.**
La carte **est créée quand même** (exigence d'Arno : une référence inconnue crée une carte), mais avec
`bien_id` à NULL, et elle atterrit dans une **file dédiée « cartes sans bien »** (index partiel prévu au §3.1).
Trois causes possibles, toutes utiles à voir : un bien absent du dernier import WIPPIMMO (import à relancer) ;
un bien qui n'est pas géré par l'agence (Monga travaille aussi pour d'autres) ; une adresse mal orthographiée.
→ **Ne jamais créer un bien automatiquement** à partir d'une adresse lue dans un mail : ce serait fabriquer
une seconde vérité en contradiction directe avec §2.1. Le rattachement du bien se fait à la main, en un clic.

**② Deux références `MNG-` pour un même bien.**
Ce n'est **pas une ambiguïté, c'est un fait** : deux interventions distinctes sur le même logement (la fuite,
puis la serrure). Chacune a sa carte. Le modèle le permet nativement — `loc_reference_externe` est unique par
`(intervention_id, reference)`, pas par `reference` seule. En revanche, **une même référence désignant deux
cartes** est une vraie anomalie → garde « ≥2 » → on ne tranche pas.

**③ Référence citée dans une réponse sans en-tête de fil.**
C'est exactement le cas que le signal 2 traite : la référence est cherchée dans **l'objet et dans le corps**,
indépendamment des en-têtes. Un transfert ou une réponse depuis un autre outil reste classé. ⚠️ Restriction
importante : ne chercher que dans la partie **non citée** du corps — sans quoi un vieux mail recopié
ressusciterait une carte close.

**④ Titre modifié côté Monga après création.**
Le titre reste le nôtre. `nom` est notre titre de travail ; `nom_origine` conserve celui de Monga. Si Monga
change le sien, on **ne l'écrase pas** — un titre édité par un humain est une décision, pas une donnée
importée — mais on **journalise** le changement et on l'affiche discrètement sur la carte (« Monga a renommé :
… »). L'exigence d'Arno (« le titre par défaut est celui de Monga, pour un suivi identique des deux côtés »)
est respectée **à la création** ; ensuite, c'est l'humain qui décide.

### 4.4 Taux de classement attendu — recalculé

Avec 320 biens et 10 à 30 mails par jour, soit **220 à 660 par mois**, un bien reçoit environ **16 mails par
an**. Conséquence directe : **un bien a rarement plus d'une intervention ouverte à la fois**, ce qui rend le
signal 6 (« expéditeur × unicité ») beaucoup plus efficace que dans mon estimation initiale.

| Part du volume | Flux | Précision | Apport |
|---:|---|---:|---:|
| 40 % | Monga (trois signaux concordants) | 99 % | 39,6 % |
| 25 % | Fils initiés depuis une carte | **100 %** | 25,0 % |
| 15 % | Réponses dans un fil déjà classé | 95 % | 14,3 % |
| 15 % | Premiers contacts (locataire, propriétaire, artisan) | 65 % | 9,8 % |
| 5 % | Transferts et divers | 50 % | 2,5 % |
| | **Total attendu à la bonne intervention** | | **≈ 91 %** |

**Retenu : 88 à 93 %, valeur centrale ~91 %** en régime établi — contre ~79 % dans l'estimation initiale. Au
**bien** seul : ~96 %. **Erreurs silencieuses : 1 à 3 %** (contre 2-5 %), grâce à l'exigence de concordance
sur le flux Monga.

**Premier mois : 70 à 80 %.** L'annuaire des adresses se remplit, aucun fil sortant n'existe encore. La montée
est une caractéristique du système, pas un défaut — et elle se **mesure** : le taux par méthode se lit
directement dans `loc_message_rattachement.methode`.

**En volume réel** : à 450 mails/mois, ~91 % laisse **40 mails par mois à classer à la main**, soit deux par
jour ouvré. C'est tenable pour plusieurs collaborateurs, et cela valide l'ergonomie « file à classer » comme
file d'exception et non comme écran principal.

⚠️ **Ce chiffre reste une estimation.** La répartition du volume entre les cinq flux est **supposée**, pas
mesurée. Le **lot 0** (rejeu hors ligne sur la vraie boîte) reste le moyen de la vérifier, et il est d'autant
plus utile que le format Monga est maintenant connu : la mesure sera nette.

---

## 5. Les objections du contradicteur, revues

> Statut de chacune après les réponses d'Arno.

**1 — « Un outil qui dort la nuit ne synchronise pas. »** → **LEVÉE PAR DÉCISION.** Plusieurs collaborateurs
rendent l'hébergement obligatoire ; il devient le **lot 3** du plan, avant tout usage réel à plusieurs.
Maintenue comme garde-fou : la date de dernière synchronisation reste affichée en permanence, **en rouge
au-delà de 24 h**. Un outil qui dit qu'il est aveugle reste honnête.

**2 — « Recopier impayés et RIB en clair sur un Mac. »** → **RETENUE, réponse inchangée** : on ne recopie
pas. Gmail reste la source de vérité, le module ne garde que des pointeurs. L'effacement d'une personne
redevient trivial. **Règle posée : si on ne sait pas écrire « effacer cette personne » avant d'ingérer, on
n'ingère pas.**
→ **NON RÉSOLU** : la durée de conservation des **cartes** (qui, elles, restent en base) reste à fixer — c'est
la question ouverte n° 2 du §8.

**3 — « Le premier mail parti au mauvais locataire est un incident à déclarer. »** → **RETENUE, mais l'arbitrage
est inversé par Arno**, et son motif est meilleur que ma prudence : l'envoi depuis une carte est le signal de
classement le plus fiable. Il remonte au **lot 4**. Le risque est traité par **trois verrous** :
1. **Envoi impossible sans carte rattachée** — pas de composition « libre » dans le module ;
2. **Destinataire affiché en clair** avant l'envoi, nominativement (« À : Mme Martin, locataire du B-0142 —
   martin@… »), avec cases à décocher ; aucun « répondre à tous » par défaut ;
3. **Traçabilité de l'auteur** : chaque envoi écrit une ligne `loc_journal` avec le collaborateur, l'heure, les
   destinataires et l'objet.
J'ajoute deux garde-fous que je tranche moi-même : **refus d'envoi** si le message auquel on répond
n'appartient pas à la carte ouverte ; et **fenêtre d'annulation de 10 secondes** après le clic.

**5 — « La dépendance à Monga est traitée comme un acquis. »** → **LARGEMENT LEVÉE** : le format est prouvé sur
un mail réel. **Maintenue sur un point** : un seul spécimen observé. D'où le format **en configuration** et
l'instrumentation du **taux par méthode**, avec alerte sur décrochage — pour qu'un changement de format se
voie en jours, pas en six semaines.

**6 — « Si un logiciel de gérance existe, 60 % du modèle est mort-né. »** → **CONFIRMÉE PAR LES FAITS** :
WIPPIMMO existe et fait foi. Le référentiel devient une **copie** avec identifiant externe (§2), jamais une
saisie parallèle. C'est l'objection qui a le plus changé le projet — et elle avait raison.

**7 — « Les 79 % sont une opinion déguisée en mesure. »** → **TOUJOURS VALABLE** pour les 91 % recalculés : la
répartition du volume reste supposée. Le lot 0 est maintenu.

**8 — « Le lu/non lu de Gmail est un piège sur une boîte partagée. »** → **RETENUE ET VALIDÉE PAR ARNO** :
remplacé par « à traiter » / « traité par X ». Le drapeau Gmail n'est pas touché.

**9 — « 18 tables pour trois personnes. »** → **RETENUE** : 7 tables (§3.1).

**10 — « 12-13 jours répond à une autre question. »** → **RETENUE** : le chiffrage révisé est de **45 à 70
jours**, hébergement et référentiel compris (§6).

**11 — « Un échec de dépôt silencieux est dangereux en gérance. »** → **SANS OBJET au démarrage** (pas de copie
des pièces jointes). Redeviendra valable au lot 8.

**12 — « Drive crée une troisième copie. »** → **PARTIELLEMENT LEVÉE.** Arno tranche : l'**arborescence** est
créée tôt (lot 2), la **copie automatique** des documents reste reportée (lot 8). L'objection portait sur la
copie, pas sur les dossiers : créer une arborescence vide ne duplique rien et prépare le terrain.

**14 — « La synthèse s'appuie sur des documents plutôt que sur le réel. »** → **RETENUE**, et illustrée deux
fois de plus : le format Monga et l'existence de WIPPIMMO ont été établis par **Arno**, pas par l'analyse.

**16 — « Démarrer par les fuites d'eau est le bon conseil sur le mauvais objet. »** → **RETENUE** : le pilote
portera sur un flux régulier et tolérant, pas sur l'urgence.

---

## 6. Google Drive : l'arborescence

### 6.1 La structure retenue, et pourquoi elle n'est pas l'évidente

L'arborescence naturelle serait `/Propriétaire/Bien/`. **Je ne la retiens pas**, pour une raison précise : un
bien **change de propriétaire** (vente, succession, changement de mandat). Avec l'arborescence naturelle, il
faudrait alors **déplacer le dossier du bien et tout son historique** — opération risquée, et qui fait que
l'historique d'un bien suit son propriétaire au lieu de suivre le bien.

**Structure retenue** — deux racines, et des **raccourcis** :

```
Drive partagé « Gestion locative »
├── Biens/
│   ├── B-0142 — 53 avenue des Ternes 75017/     ← le dossier RÉEL, ne bouge JAMAIS
│   │   ├── Interventions/
│   │   │   └── LOC-2026-000001 — barre de douche/
│   │   ├── Bail et diagnostics/
│   │   └── Photos et états des lieux/
│   └── B-0143 — …/
└── Propriétaires/
    ├── P-0042 — DUPONT Jean/
    │   └── → B-0142  (RACCOURCI vers le dossier du bien)
    └── P-0043 — SCI des Ternes/
```

**Ce que cette structure apporte :**
- un **changement de propriétaire** = déplacer un **raccourci**. Le dossier du bien, ses fichiers et **tous les
  liens** restent intacts. L'historique reste attaché au bien, ce qui est la réalité juridique ;
- un bien en **indivision** apparaît sous plusieurs propriétaires, sans duplication ;
- un bien qui **sort du portefeuille** : le raccourci est déplacé dans `Propriétaires/P-00xx/Anciens biens/`,
  le dossier réel **reste** dans `Biens/` et le bien passe `actif = false` en base. **On n'efface rien** — un
  litige peut survenir deux ans après la fin du mandat.

**Convention de nommage** : `<référence> — <libellé>`, la référence **d'abord**. Elle rend le dossier
identifiable à l'œil et triable, et surtout elle survit à un renommage partiel. ⚠️ **Mais le nom ne fait jamais
autorité** : Drive autorise les doublons de nom, deux dossiers « DUPONT » sont indiscernables. **La vérité est
l'identifiant Drive mémorisé en base**, doublé d'une étiquette technique invisible (`appProperties`,
p. ex. `bienRef=B-0142`) qui permet de retrouver un dossier renommé à la main.

**Droits** : les collaborateurs sont membres du Drive partagé (rôle **Contributeur** : ajouter et modifier,
pas supprimer définitivement). Un ou deux **Gestionnaires** seulement. Un propriétaire externe à qui l'on
voudrait donner accès n'est **pas** membre du Drive : il reçoit un partage **sur son dossier**, de préférence
via un groupe Google plutôt qu'à titre nominatif — ajouter ou retirer quelqu'un devient alors une opération
d'annuaire, pas une modification de milliers de permissions.

⚠️ **À vérifier avant de promettre un accès externe** : le partage hors du domaine peut être interdit par une
règle d'administration. *(Non vérifié — aucun accès à la console.)*

### 6.2 Ce qui est fait au lot 2, et ce qui attend

**Lot 2 — créé** : les deux racines, un dossier par bien et par propriétaire, les raccourcis, les sous-dossiers
types, et la table de correspondance en base. **Lot 8 — reporté** : la copie automatique des pièces jointes.
Motif maintenu : tant que Gmail garde les documents, les copier ailleurs crée une deuxième source sans vérité
unique. Un **permalien vers le mail d'origine** suffit entre-temps, coûte zéro et ne duplique rien.

---

## 7. Google Workspace : les prérequis, pas à pas

> Écrit pour être exécuté par une personne non technique disposant des droits d'administration. Chaque étape
> dit **où aller** et **quoi obtenir**. ⚠️ Google réorganise régulièrement ses menus : les intitulés peuvent
> différer légèrement. *(Non vérifié en conditions réelles — aucun accès à la console.)*

**Étape 0 — la vérification bloquante.** Dans la console d'administration (`admin.google.com`), rubrique
**Annuaire → Utilisateurs**, chercher `gestion@criterimmo.fr`. Il doit apparaître comme **utilisateur**, avec
sa propre licence. S'il apparaît seulement comme **alias** d'un autre compte, ou comme **groupe**
(Annuaire → Groupes), **tout le reste tombe** : un alias ne peut pas s'authentifier, un groupe n'a pas de
boîte interrogeable. Le dépôt connaît déjà ce piège (`email/index.ts:12-14`).
→ *Résultat attendu : « oui, c'est un compte utilisateur à part entière ».*

**Étape 1 — créer le projet technique.** Sur `console.cloud.google.com`, créer un projet (nom libre, par
exemple « Criterimmo Gestion »). Puis, dans **API et services → Bibliothèque**, activer **Gmail API** et
**Google Drive API**.
→ *Résultat attendu : les deux interfaces marquées « activée ».*

**Étape 2 — déclarer l'application comme interne.** Dans **API et services → Écran de consentement OAuth**,
choisir le type **« Interne »** (réservé aux comptes du domaine). Renseigner un nom et un contact, puis
**PUBLIER** l'application.
→ ⚠️ **L'erreur la plus fréquente, et elle est silencieuse** : si l'application reste au statut **« Test »**,
l'autorisation **expire au bout de 7 jours** et le module s'arrête sans message clair. Il faut voir « En
production ». Pour une application « Interne », publier ne déclenche **aucune** validation par Google.

**Étape 3 — créer l'identifiant.** Dans **API et services → Identifiants → Créer des identifiants → ID client
OAuth**, type **« Application de bureau »**. Noter l'**identifiant client** et le **secret**.
→ *Résultat attendu : deux valeurs à transmettre, à ne jamais publier ni envoyer par messagerie non protégée.*

**Étape 4 — autoriser une fois, en étant connecté comme `gestion@`.** Un script du dépôt ouvre le navigateur
et demande l'autorisation ; il faut être connecté **avec la boîte `gestion@criterimmo.fr`**, pas avec un
compte personnel. Le script rend un **jeton de rafraîchissement**.
→ *Résultat attendu : une longue chaîne de caractères, à ranger dans la configuration du serveur.*

**Étape 5 — le Drive partagé.** Sur `drive.google.com`, créer un Drive partagé nommé **« Gestion locative »**,
y ajouter `gestion@criterimmo.fr` comme **Gestionnaire de contenu**, et les collaborateurs comme
**Contributeurs**.
→ *Vérifier au préalable, dans la console d'administration (**Applications → Google Workspace → Drive et
Docs**), que la création de Drive partagés est autorisée.*

**Étape 6 — une décision à prendre maintenant, pas après l'incident.** La corbeille d'un Drive partagé
conserve 30 jours. Au-delà, un dossier supprimé est **définitivement perdu**, sauf si une règle d'archivage
(Google Vault, selon l'édition souscrite) est active. **À trancher avant la mise en service.**

**Périmètres demandés, et rien de plus** : lecture des messages et gestion des étiquettes ; envoi ; accès aux
fichiers créés par l'application. **Ne pas** demander l'accès total à la boîte.

**Ce qu'on ne fait pas, et pourquoi** : ni mot de passe d'application (aucun périmètre limitable : lecture,
écriture, suppression et envoi d'un bloc — et incompatible avec l'interface Gmail), ni compte de service avec
délégation au domaine **pour l'instant** (il permettrait d'agir au nom de **n'importe quel** compte du
domaine : trop large tant que l'application vit sur une machine de développement). Le passage au compte de
service se fera quand le module sera hébergé — et il est prévu pour coûter une quarantaine de lignes, parce
que l'authentification est isolée derrière **une seule fonction** dès le lot 2.

---

## 8. Plan de construction en lots

> Un lot = un chantier = un prompt = un commit. **Effort total estimé : 45 à 70 jours**, hors délais
> calendaires (réponses Google, WIPPIMMO, hébergeur).

| Lot | Intitulé | Apport visible pour Arno | Dépend de | Effort |
|---|---|---|---|---|
| **0** | **Mesurer avant de construire** | Le vrai taux de classement, à la place d'une estimation | rien | 1-2 j |
| **1** | **Le référentiel WIPPIMMO** | Les 320 biens consultables et cherchables dans l'application | lot 0 | 5-7 j |
| **2** | **Accès Gmail + Drive, et l'arborescence** | La boîte est lue ; l'arborescence Drive existe, propre et complète | lot 1 | 6-9 j |
| **3** | **Hébergement** | L'outil devient accessible à plusieurs, en permanence | lot 2 | 4-6 j |
| **4** | **Les cartes d'événement, avec envoi** | Le cœur du produit : ouvrir une carte, écrire depuis elle, la réponse revient dedans | lot 3 | 10-14 j |
| **5** | **Le classement automatique** | La file « à classer » se vide toute seule | lots 2 et 4 | 7-10 j |
| **6** | **Monga : création automatique de cartes** | Une intervention Monga apparaît sans rien faire | lot 5 | 4-6 j |
| **7** | **Le pilotage quotidien** | « Qu'est-ce qui dort ? » a enfin une réponse | lot 4 | 5-7 j |
| **8** | **Documents dans Drive** | Les pièces jointes rangées par bien | lots 2 et 4 | 4-6 j |

### Détail et risques

**LOT 0 — Mesurer.** Exporter 3 mois de la vraie boîte, rejouer la cascade **hors ligne** (fonction pure, sans
base ni Google — le dépôt a exactement ce patron), et compter : part réelle de chaque flux, part de mails
Monga, nombre d'interventions ouvertes par bien. → **Risque** : le chiffre peut être décevant ; c'est
précisément l'intérêt de le savoir avant d'engager 45 jours.

**LOT 1 — Le référentiel.** *Spécification exécutable complète au §10.* → **Risque** : le fichier WIPPIMMO
peut être incomplet (adresses e-mail manquantes). Le lot reste livrable, l'annuaire se remplit plus lentement.

**LOT 2 — Accès Gmail + Drive.** Authentification isolée derrière **une seule fonction**. Lecture de la boîte,
pointeurs en base, liste paginée, recherche déléguée à Gmail, ouverture d'un mail (contenu chargé à la
demande). Création de l'arborescence Drive (§6). → **Risque** : les prérequis du §7 dépendent d'un tiers ;
l'étape « publier l'application » est celle qui se rate le plus souvent.

**LOT 3 — Hébergement.** Serveur, base, sauvegardes, nom de domaine stable, certificat. **Placé ici et pas
avant** : les lots 0 à 2 se construisent et se testent très bien en local, et il serait absurde de payer un
serveur pour écrire un import de fichier. **Placé ici et pas après** : le lot 4 introduit l'usage à plusieurs
et l'envoi de vrais mails — cela ne peut pas vivre sur un poste qui s'endort. → **Risque** : c'est le lot qui
déplace les données de locataires sur une machine louée ; sauvegardes chiffrées et accès nominatifs sont
**dans** le lot, pas après.

**LOT 4 — Les cartes, avec envoi.** Tables `loc_intervention`, `loc_occupation`, `loc_journal`. Cartes
dépliables, catégories, urgence, **assigné à**, **date de prochaine action**, **notes d'appel**. Rattachement
manuel d'un mail, détachement. **Et l'envoi depuis une carte**, avec les cinq verrous du §5 objection 3.
→ **Risque** : le plus élevé du projet (écrire au mauvais destinataire). Les verrous ne sont pas optionnels,
ils font partie du lot.

**LOT 5 — Le classement automatique.** La cascade du §4, en module **pur** et testé, avec motif toujours écrit
et télémétrie par méthode. → **Risque** : un faux rattachement silencieux. Mitigation : règle « en cas de
doute, on ne tranche pas », exigence de concordance sur Monga, et taux par méthode sous les yeux.

**LOT 6 — Monga automatique.** Détection d'une référence `MNG-` inconnue → création d'une carte, titre repris
de Monga, file « cartes sans bien » pour les cas non rattachables. → **Risque** : créer des cartes en double si
la détection est trop large. Mitigation : une carte n'est créée que si la référence est **inconnue** et que
l'expéditeur est Monga.

**LOT 7 — Pilotage.** Vue unique de ce qui est en retard, dort ou attend. Tri par date, urgence, dernière
interaction. Filtre par partie. Fusion et scission des doublons.

**LOT 8 — Documents.** Copie des pièces jointes dans l'arborescence du lot 2, avec échec de dépôt **visible**
(bandeau sur la carte) et rejouable — et non silencieux comme dans le module permis, où une pièce perdue se
redemande, ce qui n'est pas le cas d'un état des lieux signé.

**Hors plan, à leur heure** : devis, autorisation de dépense, facture, assurance et n° de sinistre, relances
(alerte **interne**, jamais de mail automatique au locataire), échéances récurrentes, export d'un dossier
complet pour un litige.

---

## 9. Ce qui est prouvé, et ce qui ne l'est pas

### 9.1 Prouvé

- Le client IMAP est en **lecture stricte**, règle non négociable — `imap.ts:5-7`.
- La cascade de rattachement existe, **pure et testée**, règle d'ambiguïté écrite — `rattachementReponse.ts:131`.
- `demande_reponse` **ne stocke que l'expéditeur** — `073:37-38`.
- **Aucun index plein texte** dans les 227 migrations ; `listerReponses` sans `LIMIT` — `demandeReponseRepo.ts:247-253`.
- L'ordonnanceur est un **agent de session** — `plist:11`, `ops/README.md:19`.
- **Aucun référentiel de biens, propriétaires ou locataires** dans le dépôt *(vérifié personnellement)*.
- Le `from` d'un envoi est un **paramètre** — `email/index.ts:118`. `Perms = Record<Module, boolean>` protège
  l'ajout d'un module — `session.ts:9`.
- Le client OAuth Google et le script d'autorisation existent — `permis/drive.ts`, `scripts/drive-autoriser.ts`.

### 9.2 Établi par Arno (fait, non vérifié par l'analyse)

- **WIPPIMMO** fait foi pour biens, propriétaires, locataires, caractéristiques.
- **320 biens**, **10 à 30 mails/jour**, plusieurs collaborateurs.
- **Monga** : référence `MNG-23987`, préfixe `MNG-`, titre et adresse présents dans le mail, contact
  `interventions@monga.io` — **sur un spécimen observé**.
- Tout part de `gestion@criterimmo.fr` ; le Drive partagé existe et son arborescence est **vierge**.

### 9.3 NON vérifié — et ce que ça changerait

| Fait non établi | Ce que ça change |
|---|---|
| **L'interface de synchronisation WIPPIMMO existe-t-elle ?** | Rien à l'architecture (§2.2) ; ajoute ou non un lot « connecteur » de 3-5 j, et décide si l'entretien du référentiel est manuel |
| **Le fichier WIPPIMMO contient-il les adresses e-mail des locataires ?** | Le champ le plus précieux. Absent → le taux démarre plus bas et met 2-3 mois à monter |
| **La répartition réelle du volume** entre les cinq flux | L'estimation de 91 % en dépend directement → **lot 0** |
| **La stabilité du format Monga** (un seul spécimen vu) | Format en configuration : un changement se règle sans code, à condition que la télémétrie le signale |
| **`gestion@` est-il un vrai compte ?** | Bloquant : un groupe n'a pas de boîte interrogeable (§7 étape 0) |
| **Politiques Google actuelles** (quotas, durée de validité de l'historique, partage externe) | Données **de mémoire**, sans accès au web : à revérifier en console |
| **Présence d'un assainisseur HTML** dans les dépendances | Afficher le HTML d'un tiers sans faille est un chantier en soi (lot 2) |
| **Le parc comporte-t-il des colocations ?** | Aucune contrainte d'unicité posée sur l'occupation : le modèle les accepte déjà |

### 9.4 Les deux questions métier encore ouvertes

**① Le pilote démarre sur quel flux ?** Je recommande un flux **régulier et tolérant** (administratif,
entretien), pas les fuites d'eau : sur une urgence, l'équipe n'ira pas vérifier dans un outil neuf avec le
plombier au téléphone. *Conséquence concrète : le choix décide de ce qu'on regarde pendant les deux premières
semaines, pas de ce qu'on construit.*

**② Combien de temps garde-t-on une carte close ?** Il faut une durée, décidée **avant** le lot 4 et inscrite
dès la migration. Une intervention close en 2026 n'a pas vocation à rester indéfiniment. *Conséquence
concrète : trop court, on perd la preuve en cas de litige tardif ; trop long, on conserve des données
personnelles sans raison.* ⚠️ *À faire valider juridiquement : les durées varient selon la nature des données
et les obligations comptables.*

---

## 10. LOT 1 — Spécification exécutable

> **Objet** : importer le référentiel WIPPIMMO dans l'application, et le rendre consultable. Rien d'autre.
> Ce lot ne touche **ni Gmail, ni Drive, ni les interventions** : il se construit et se teste **entièrement en
> local**, sans aucune dépendance à un tiers. C'est le socle de tout le reste.

### 10.1 Périmètre exact

**DANS le lot 1 :**
1. Une **tuile « Gestion locative »** dans l'administration, gardée par une permission dédiée.
2. Une **migration** créant `loc_bien`, `loc_partie`, `loc_partie_email`, `loc_occupation`, `loc_journal`.
3. Un **écran d'import** : on dépose un fichier CSV, on voit un **aperçu avant écriture**, on confirme.
4. La fonction **`appliquerReferentiel(lignes[])`** — le point d'entrée unique, conçu pour qu'une future
   synchronisation WIPPIMMO l'appelle sans rien changer.
5. Un **écran de consultation** : liste des biens, recherche, fiche d'un bien avec son propriétaire et son
   locataire en place.
6. Le **journal** de chaque import et de chaque modification.

**HORS du lot 1, explicitement :**
- Gmail, Drive, OAuth, l'hébergement — aucun accès réseau dans ce lot ;
- les interventions, les cartes, les messages, le classement ;
- la saisie manuelle d'un bien ou d'un propriétaire *(la vérité est WIPPIMMO ; on importe, on ne saisit pas)* ;
- l'édition d'un bien importé *(sauf les champs qui n'existent pas chez WIPPIMMO : note interne)* ;
- le connecteur de synchronisation WIPPIMMO ;
- toute statistique ou tableau de bord.

### 10.2 Tables (les cinq du lot)

Reprendre **telles quelles** les définitions du §3.1 pour `loc_bien`, `loc_partie`, `loc_partie_email`,
`loc_occupation`, `loc_journal`. Trois tables du §3.1 (`loc_intervention`, `loc_message`,
`loc_message_rattachement`) sont **hors périmètre** et ne sont pas créées ici.

**Conventions imposées** *(patrons prouvés du dépôt)* : migration **additive et idempotente**
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), en-tête expliquant le pourquoi, bloc de
vérification en fin de fichier, numéro **suivant le dernier appliqué** (228 au moment de l'écriture, **à
revérifier**). Contraintes `CHECK` **nommées** et élargissables (`DROP CONSTRAINT IF EXISTS` + `ADD`), jamais
de type énuméré. Déclencheur append-only sur `loc_journal` (patron `118:60-72`). **Aucun `DROP`, aucun
`UPDATE` de données existantes.**

### 10.3 Le format du fichier

Une ligne par **bien**. Colonnes attendues, par leur intitulé (l'ordre est indifférent) :

| Colonne | Obligatoire | Usage |
|---|---|---|
| `reference_bien` | **oui** | identifiant WIPPIMMO du bien — la clé de rapprochement |
| `adresse`, `code_postal`, `ville` | **oui** | l'adresse ; sert aussi de signal de classement plus tard |
| `complement`, `etage`, `libelle` | non | affichage |
| `reference_proprietaire`, `proprietaire_nom` | **oui** | identifiant WIPPIMMO + nom (ou raison sociale) |
| `proprietaire_prenom`, `proprietaire_email`, `proprietaire_telephone` | non | annuaire |
| `reference_locataire`, `locataire_nom` | non | absent si le bien est vacant |
| `locataire_prenom`, `locataire_email`, `locataire_telephone` | non | **`locataire_email` est le champ le plus précieux** |
| `locataire_entree_le` | non | date d'entrée (`AAAA-MM-JJ` ou `JJ/MM/AAAA`) |

**Règles de lecture** : encodage UTF-8 **ou** Windows-1252 (détecté, pas supposé — un export français est
souvent en Windows-1252) ; séparateur `;` ou `,` (détecté sur la ligne d'en-tête) ; espaces de début et de fin
supprimés partout ; e-mails normalisés en minuscules ; une colonne inconnue est **ignorée sans erreur** ; une
colonne obligatoire absente **arrête tout l'import** avant écriture.

### 10.4 Règles d'application (`appliquerReferentiel`)

**La règle cardinale : le rapprochement se fait sur `reference_externe`, jamais sur le nom ni sur l'adresse.**
Deux « DUPONT Jean » sont deux personnes ; un bien dont l'adresse a été corrigée reste le même bien.

Pour chaque ligne :
1. **Bien** — `reference_bien` connue → mise à jour des champs modifiés ; inconnue → création, avec attribution
   d'une référence interne `B-NNNN` (compteur atomique, patron `053:37`).
2. **Propriétaire** — même logique sur `reference_proprietaire`, avec `type = 'proprietaire'`.
3. **Locataire** — si présent : création ou mise à jour, `type = 'locataire'`.
4. **Occupation** — si le locataire de la ligne **diffère** de l'occupation en cours : la précédente est
   **clôturée** (`sortie_le` = date d'import) et une nouvelle est ouverte. **On ne supprime jamais une
   occupation** : c'est l'historique qui permet de rattacher un vieux mail au bon locataire.
5. **Adresses e-mail** — ajoutées à l'annuaire si absentes. Une adresse **déjà rattachée à une autre personne**
   n'est **pas** déplacée : elle est signalée en anomalie (voir 10.6).
6. **Biens absents du fichier** — passés `actif = false` (**jamais supprimés**), et **seulement** si l'import
   est déclaré « complet » (voir 10.5).

Chaque création, mise à jour, désactivation et clôture d'occupation écrit une ligne dans `loc_journal`, avec
l'auteur et l'horodatage. **Tout l'import s'exécute dans une seule transaction** : en cas d'erreur, rien n'est
écrit.

### 10.5 Les écrans

**Écran « Import du référentiel »**
- Zone de dépôt du fichier ; case **« Ce fichier est le portefeuille complet »** (décochée par défaut).
  ⚠️ Cette case commande la désactivation des biens absents — un fichier partiel importé comme complet
  désactiverait tout le portefeuille. **Case décochée = aucune désactivation.**
- **Aperçu avant écriture, obligatoire** : « 320 lignes lues — 12 biens nouveaux, 301 inchangés, 7 modifiés,
  0 désactivé, 3 anomalies ». Le détail des modifications et des anomalies est consultable **avant** de
  confirmer. Aucune écriture tant que « Confirmer l'import » n'est pas cliqué.
- Après import : date et heure, auteur, compteurs, et lien vers le journal.
- **Bandeau permanent** : « Référentiel importé le JJ/MM à HH:MM » — **en rouge au-delà de 30 jours**.

**Écran « Biens »**
- Liste paginée (50 par page), tri par référence, adresse ou ville ; recherche libre sur référence, adresse,
  ville, nom du propriétaire, nom du locataire ; filtre « actifs seulement » (coché par défaut).
- **Fiche d'un bien** : adresse, propriétaire (nom, contacts), locataire en place (nom, contacts), historique
  des occupations, note interne éditable, et le journal du bien.

**Exigences d'interface** *(transverses au projet)* : **mobile d'abord** — un tableau de 320 lignes doit se
replier en cartes lisibles sur un téléphone, jamais déborder horizontalement ; charte SVAV (jetons
`--color-svv-*`, aucune couleur en dur) ; `prefers-reduced-motion` respecté ; cibles tactiles suffisantes.

### 10.6 Cas limites (tous à traiter)

| Cas | Comportement attendu |
|---|---|
| Colonne obligatoire absente | **Refus avant écriture**, message nommant la colonne manquante |
| Fichier vide, ou en-tête seul | Refus, message explicite ; **aucune désactivation** |
| `reference_bien` en double dans le fichier | Refus avant écriture, en listant les références fautives |
| Bien présent, propriétaire changé | Mise à jour du lien, **ancien propriétaire conservé** (jamais supprimé), changement journalisé |
| Locataire changé | Occupation précédente clôturée, nouvelle ouverte, les deux conservées |
| Bien sans locataire (vacant) | Aucune occupation ouverte ; si une occupation était en cours, elle est clôturée |
| E-mail déjà rattaché à une autre personne | **Anomalie signalée**, l'import continue, le rattachement existant n'est pas modifié |
| E-mail mal formé | Ignoré, anomalie signalée, le reste de la ligne est importé |
| Date d'entrée illisible | Occupation créée **sans** date, anomalie signalée |
| Bien absent du fichier, case « complet » **décochée** | **Aucune désactivation** |
| Bien absent du fichier, case « complet » **cochée** | `actif = false`, journalisé |
| Bien désactivé qui **réapparaît** dans un import | Réactivé (`actif = true`), journalisé |
| Accents, apostrophes typographiques, casse variable | Conservés tels quels à l'affichage ; **normalisés** pour la recherche et l'appariement |
| Fichier de 320 lignes | Doit passer en moins de 10 secondes (c'est le volume réel) |
| Deux imports simultanés | Le second est refusé (verrou, patron `verrouVeille.ts:9`) |

### 10.7 Tests attendus

**Sur la lecture du fichier (fonctions pures, sans base)** : détection du séparateur et de l'encodage ;
colonne obligatoire manquante → refus ; doublon de référence → refus ; colonne inconnue ignorée ; e-mail mal
formé signalé sans bloquer ; dates aux deux formats ; accents et Windows-1252 préservés.

**Sur l'application (base mockée, paramètres liés vérifiés — jamais la forme du SQL)** : création d'un bien
neuf ; mise à jour d'un bien existant **sans** créer de doublon ; changement de propriétaire ; changement de
locataire → ancienne occupation clôturée **et conservée** ; bien vacant ; **case « complet » décochée → aucune
désactivation** (le test qui compte le plus) ; case cochée → désactivation des absents ; bien désactivé qui
réapparaît → réactivé ; e-mail déjà pris → anomalie sans écrasement ; **échec en milieu d'import → aucune
écriture** (transaction).

**Sur l'aperçu** : les compteurs annoncés correspondent **exactement** à ce que l'import produira ; l'aperçu
n'écrit **rien** (vérifié par l'absence d'appel d'écriture).

**Sur la garde d'accès** : sans permission → refus ; avec permission → accès ; la route d'import exige en plus
un compte actif (patron `exigerCompteActif`, `garde.ts:147`).

**Contrôle de fin** : `npm test` complet vert (`tsc --noEmit && vitest run`), conformément à la règle du projet.

### 10.8 Ce que le lot 1 rend visible, et comment le vérifier

À la fin du lot, Arno doit pouvoir : ouvrir la tuile « Gestion locative » ; déposer le fichier WIPPIMMO ; voir
l'aperçu, le confirmer ; **consulter ses 320 biens**, chercher « Ternes » et trouver le bien du 53 avenue des
Ternes avec son propriétaire et son locataire ; ouvrir la fiche et lire le journal. Puis **réimporter le même
fichier** et constater « 0 nouveau, 320 inchangés » — la preuve que l'import est rejouable sans dégât.

---

**Prochaine étape** : trancher les deux questions du §9.4, puis lancer le **lot 0** (mesure) et enchaîner sur
le **lot 1**, dont la spécification ci-dessus est directement exécutable.
