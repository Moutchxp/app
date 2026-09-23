# ÉTUDE PRÉALABLE — Module « Gestion locative »

> **Statut : ÉTUDE, LECTURE SEULE. Aucun code, aucune table, aucune migration n'a été créé.**
> Établie le 2026-09-23 par cinq mandats parallèles : recon du dépôt, métier de la gérance, modèle de
> données et moteur de classement, Google (Gmail + Drive), et un mandat **contradicteur** chargé d'attaquer
> la synthèse des quatre autres. Rien n'a été écrit hors ce document.
>
> **Décision déjà prise, non rouverte** : le module est construit **dans** l'application existante (même
> serveur, même authentification, même base), pas en service séparé.
>
> ⚠️ **Ce document n'est pas un avis juridique.** Les points de droit (RGPD, charges locatives, obligations
> d'entretien, assurance) sont signalés là où ils apparaissent et **doivent être validés par un professionnel**
> avant d'être inscrits dans le logiciel. La règle de conception que je retiens partout : **ne pas coder la
> règle de droit, tracer la décision humaine.**

---

## 0. Résumé pour décideur

**Le besoin est légitime et le dépôt est bien armé pour y répondre** — mais pas dans la forme demandée, et
pas tout de suite. Quatre conclusions, par ordre d'importance.

**① Le sujet n'est pas technique, il est d'hébergement.** L'application tourne sur un Mac, et son
ordonnanceur est un « agent de session » : il ne s'exécute **que machine allumée et session ouverte**. Le
dépôt l'a déjà écrit noir sur blanc (`ops/README.md:19` : « le 24/24 suppose un hébergement, pas ce Mac »).
Une veille de permis tolère de dormir une nuit. **Une boîte mail professionnelle, non.** Un outil qui se
présente comme le registre des interventions alors qu'il est aveugle le week-end est pire qu'une boîte mail
en désordre : il donne le droit de ne plus regarder ailleurs.
→ **Parade retenue : ne rien recopier.** Gmail reste la **seule** source de vérité ; le module ne garde que
des *pointeurs* et le classement. Mac éteint = module indisponible (honnête), au lieu de « disponible et
faux ». Cette seule décision règle aussi l'essentiel du point ②.

**② Recopier les mails en base serait le point faible juridique du projet.** Une boîte de gérance contient
des impayés, des situations familiales, parfois de la santé, des pièces d'identité, des RIB. Le dépôt
s'impose aujourd'hui un standard RGPD élevé sur des données **bien moins** sensibles. Surtout : on ne sait
pas *effacer* un locataire dont le nom est dans 200 corps de mails, dans les citations et dans les pièces
jointes. **Si on ne sait pas écrire la fonction « effacer cette personne » avant d'ingérer, on n'ingère pas.**

**③ La demande, telle qu'énoncée, embellit le passé sans piloter le futur.** Retrouver les mails d'un sujet
est utile ; la question à laquelle une boîte partagée est *structurellement* incapable de répondre est
autre : **« qu'est-ce qui est en cours, qui s'en occupe, qui attend-on, et qu'est-ce qui dort ? »**. Trois
manques rendent l'outil abandonnable en deux mois : **une personne responsable par intervention**, une
**date de prochaine action**, et des **notes internes** (une grande partie de la gérance se passe au
téléphone — sans elles, le fil *ment* et montre un silence de six jours là où il y a eu trois appels).

**④ Le chiffre qui compte n'est pas celui qu'on croit.** La cascade de classement automatique est estimée à
~79 % de bons rattachements. Mais pour trois personnes, un mail **non** classé coûte vingt secondes ; un mail
**mal** classé en silence coûte l'information perdue *et* le risque d'écrire au mauvais locataire. La cible
de conception est donc **« zéro faux rattachement, le reste à classer à la main »** — ce que le dépôt fait
déjà avec sa règle « en cas de doute, on ne tranche pas ».
→ **La meilleure dépense du projet : 1 à 2 jours pour rejouer la cascade hors ligne sur 3 mois de la vraie
boîte, et compter.** Ce chiffre-là décide du produit, de son ergonomie et de son opportunité. Avant tout code.

**Ce que je recommande** : construire un noyau de **6 tables** (pas 18), sans copie des mails, sans envoi
depuis l'outil au départ, sans Drive, sur **une** catégorie d'interventions. Et poser à Arno les **sept
questions du §7** — dont une, la première, peut à elle seule diviser le projet par deux ou le doubler.

---

## 1. Ce qui existe déjà et qui sert

> Chaque ligne est prouvée `fichier:ligne`. Verdicts : **RÉUTILISABLE** tel quel · **À ÉTENDRE** · **NE CONVIENT PAS**.

### 1.1 Les cinq briques précieuses

| Brique | Preuve | Verdict | Ce que ça fait gagner |
|---|---|---|---|
| **Cascade de rattachement** | `app/lib/veille/rattachementReponse.ts` (243 l.), règle `:131` | **RÉUTILISABLE** (patron) | La partie la plus difficile du classement automatique est **déjà conçue, écrite et testée** (275 l. de tests). Module « pur » : aucune base, aucun réseau → rejouable hors ligne. |
| **Client OAuth Google écrit à la main** | `app/lib/permis/drive.ts` (156 l.) + `app/scripts/drive-autoriser.ts` | **RÉUTILISABLE** | Le schéma « identifiant + secret + jeton de rafraîchissement → jeton d'accès → appel REST » existe déjà, sans dépendance lourde. Se transpose tel quel à Gmail. |
| **Envoi SMTP multi-comptes** | `app/lib/email/index.ts:40-47` (`lireCompteSmtp(infixe)`), `:278-288` (réponse dans le fil) | **RÉUTILISABLE** | Un compte `gestion@` s'ajoute par variables d'environnement. Le `from` est déjà un **paramètre** de chaque envoi (`:118`) — voir la correction en 1.3. |
| **Tuiles d'administration + droits** | `session.ts:7` (MODULES), `garde.ts:84-103`, `proxy.ts:23-43`, `menuAdmin.ts:11-21` | **À ÉTENDRE** (recette en 7 points) | Tuile gardée, permission déléguable à un collaborateur, révocation en base, défaut *fail-closed*. Zéro sécurité à reconcevoir. |
| **Dépôt de pièces jointes** | `app/lib/stockage/index.ts:258-273` | **À ÉTENDRE** | Contrat qui ne jette jamais, empreinte SHA-256, clé sans nom d'origine. ⚠️ Sa politique d'échec **silencieux** ne convient pas à la gérance (voir objection 11, §5). |

### 1.2 Ce qui NE convient pas, et pourquoi

| Élément | Preuve | Pourquoi c'est disqualifié |
|---|---|---|
| **Le client IMAP en l'état** | `app/lib/email/imap.ts:5-7`, `:79`, `:170`, `:269` | Il est en **lecture stricte** (boîte ouverte en `EXAMINE`) et le fichier déclare cette règle « non négociable » : on ne pose jamais de drapeau, on ne déplace rien. Y toucher pour « gagner du temps » ouvrirait un droit d'écriture sur la boîte du module Permis **par effet de bord**. Module séparé, sans exception. |
| **La table `demande_reponse`** | `073_demande_reponse.sql:30` (FK obligatoire), `:32`, `096:34` (CHECK métier urbanisme), **`:37-38`** | Trois contraintes propres à l'urbanisme, et surtout : elle **ne stocke que l'expéditeur, aucune colonne destinataire ni copie**. Avec ce schéma, « ne voir que les échanges avec le locataire » serait **impossible** — un mail que *vous* envoyez au locataire a pour expéditeur… vous. Table sœur, pas extension. |
| **L'état « lu »** | recherche exhaustive sur les 227 migrations : **absent** | Il n'existe que `traite_le` et `repondu_le`, qui sont des états **métier**, pas l'état de lecture d'une messagerie. Les confondre créerait une divergence invisible avec Gmail. |
| **La recherche** | aucun index plein texte dans les 227 migrations ; `demandeReponseRepo.ts:247-253` | `listerReponses` n'a **ni `LIMIT` ni `OFFSET`** et ne filtre ni par mots-clés ni par période. Reprise telle quelle sur une boîte professionnelle, elle ramènerait tout. |
| **Les statistiques (`analytics`)** | `writer.ts:9-11` (« perdre un événement est acceptable »), `config.ts:36` (pool max 2) | Modèle **agrégé, approximatif, à rétention courte**. Un indicateur de gérance (« délai moyen de réponse ») doit être une requête **exacte** sur les tables métier, pas un compteur best-effort. |

### 1.3 Deux corrections apportées à la recon (le code fait foi)

Le mandat contradicteur a relevé deux affirmations inexactes dans la recon. **Vérification faite, il a raison
sur les deux** — et je les corrige ici plutôt que de les laisser circuler :

- **`MAIL_FROM` n'est pas un verrou.** Le `from` est un **paramètre** de chaque fonction d'envoi
  (`email/index.ts:118`, `:168`…), et `lireCompteSmtp(infixe)` gère déjà un deuxième compte. Envoyer « en tant
  que » `gestion@` n'exige de toucher à rien d'existant.
- **`permsToutes()` n'est pas un piège silencieux.** Le type `Perms = Record<Module, boolean>`
  (`session.ts:9`) fait **échouer `tsc`** si un module est ajouté sans compléter la fonction. Ce piège existait
  tant que `tsc` était hors du contrôle de fin ; il est **soldé depuis G1**.

> **Leçon de méthode, à garder pour la suite** : ce dépôt a un précédent documenté de dérive entre sa
> documentation et son code. La règle maison « **le code fait foi** » n'est pas une coquetterie. Toute
> décision prise sur la foi d'un résumé — y compris celui-ci — se re-vérifie dans le code.

### 1.4 L'ordonnanceur : le point dur

`ops/com.sansvisavis.veille.plist` est un **agent de session** : `StartInterval` 900 s, `RunAtLoad false`, et
son en-tête (`plist:11`) dit : *« ce job ne tourne que MACHINE ALLUMÉE et session ouverte »*. `ops/README.md:19`
enfonce le clou : *« le 24/24 suppose un hébergement, pas ce Mac »*.

Conséquences concrètes pour une boîte de gérance : la nuit, rien n'entre. Le week-end, rien. Une mise à jour
macOS redémarre la machine, la session n'est pas rouverte, **et personne n'est prévenu** — un travail qui ne
tourne pas ne produit pas d'erreur, il produit du silence. Le dépôt avait anticipé le trou (c'est la raison
d'être du journal `releve_run`, `074_releve_auto.sql:57`), mais pour une veille tolérante, pas pour une
messagerie. **C'est traité au §5, objection 1, et c'est ce qui commande tout le reste.**

---

## 2. Le modèle de données proposé

### 2.1 L'idée en une phrase

Trois blocs : **le référentiel** (qui est qui, quel bien) — **le dossier** (l'intervention et sa chronologie)
— **le courrier** (les mails et le lien entre un mail et un dossier). Le troisième ne touche jamais le
premier : un mail mal classé se reclasse sans rien casser.

### 2.2 Ce que je retire par rapport à la proposition initiale

Le mandat modèle proposait **18 tables**. Le contradicteur objecte, à juste titre, que le dépôt compte déjà
~56 % de code consacré à un premier back-office, que la pérennité est notée 8/20 (un seul auteur), et qu'il
n'existe aucun registre de migrations — 227 migrations appliquées à la main. **Ajouter 18 tables, c'est
ajouter 18 occasions de dérive.**

**Je tranche : 6 tables au démarrage.** Sont retirées du premier jet, avec la place prévue pour plus tard :
le référentiel complet si un logiciel de gérance existe déjà (§7, question 1), les participants normalisés,
les devis, autorisations et factures, l'assurance détaillée, les charges, les récurrences, et le singleton de
configuration (du cérémonial pour un module sans utilisateur).

### 2.3 Les six tables du noyau

**`loc_bien` — le logement.** L'ancre physique de tout le module : un sujet concerne toujours un bien.
⚠️ *Sous réserve de la question 1 du §7* : si un logiciel de gérance fait foi, cette table devient une **copie
en lecture seule** avec l'identifiant externe comme clé, jamais une saisie parallèle.

```sql
CREATE TABLE IF NOT EXISTS loc_bien (
  id             bigserial PRIMARY KEY,
  reference      text UNIQUE NOT NULL,   -- « B-0142 » : lisible, dictable au téléphone
  reference_externe text,                -- identifiant dans le logiciel de gérance, s'il existe (§7 q.1)
  libelle        text,                   -- « Studio Voltaire 3e gauche »
  adresse_ligne1 text NOT NULL,
  code_postal    text NOT NULL,
  ville          text NOT NULL,
  etage          text,                   -- texte : « RDC », « combles » — jamais un entier forcé
  actif          boolean NOT NULL DEFAULT true,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  maj_le         timestamptz NOT NULL DEFAULT now()
);
-- Appariement d'une adresse citée dans un mail, sur la forme NORMALISÉE (patron 085_reference_externe.sql:41)
CREATE INDEX IF NOT EXISTS loc_bien_adresse_norm_idx
  ON loc_bien (upper(regexp_replace(adresse_ligne1 || ' ' || code_postal, '[[:space:],.-]', '', 'g')));
```

**`loc_partie` — le carnet d'adresses.** Propriétaires, locataires, artisans, assurances, Monga : tous ceux
qui écrivent. Une seule table, distingués par un champ `type`, parce qu'ils jouent tous le même rôle vis-à-vis
du système. *(La proposition initiale en faisait quatre tables ; pour trois personnes, c'est du luxe.)*

```sql
CREATE TABLE IF NOT EXISTS loc_partie (
  id        bigserial PRIMARY KEY,
  type      text NOT NULL CONSTRAINT loc_partie_type_chk
              CHECK (type IN ('proprietaire','locataire','artisan','assurance','syndic','intermediaire','autre')),
  nom       text NOT NULL,               -- nom de famille ou raison sociale
  prenom    text,
  telephone text,
  note      text,
  actif     boolean NOT NULL DEFAULT true,
  desactive_le timestamptz,              -- désactivation, JAMAIS de suppression (patron 062_collaborateur.sql:9)
  cree_le   timestamptz NOT NULL DEFAULT now()
);

-- L'ANNUAIRE : « telle adresse e-mail appartient à telle personne ». C'est le nerf du classement.
CREATE TABLE IF NOT EXISTS loc_partie_email (
  id        bigserial PRIMARY KEY,
  partie_id bigint NOT NULL REFERENCES loc_partie(id) ON DELETE CASCADE,
  email     text NOT NULL,
  verifiee_le timestamptz,               -- quand un humain a confirmé « oui, c'est bien lui »
  cree_le   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loc_partie_email_key ON loc_partie_email (lower(email));
```

**`loc_intervention` — le dossier.** Le sujet : « fuite d'eau du ballon, 12 rue Voltaire, ouverte le 3 mars ».
Les trois champs marqués ⭐ sont ceux que le métier rend **non négociables** — sans eux, l'outil décrit le
passé sans piloter le futur.

```sql
CREATE TABLE IF NOT EXISTS loc_intervention (
  id          bigserial PRIMARY KEY,
  reference   text UNIQUE NOT NULL,      -- « LOC-2026-000001 », compteur atomique (patron 053_demande.sql:37)
  bien_id     bigint NOT NULL REFERENCES loc_bien(id),
  nom         text NOT NULL,             -- nom LIBRE donné à l'ouverture
  categorie   text NOT NULL CONSTRAINT loc_intervention_categorie_chk
                CHECK (categorie IN ('travaux','fuite_eau','administratif','litige')),
  urgence     text NOT NULL DEFAULT 'normale' CONSTRAINT loc_intervention_urgence_chk
                CHECK (urgence IN ('basse','normale','haute','critique')),
  statut      text NOT NULL DEFAULT 'ouverte' CONSTRAINT loc_intervention_statut_chk
                CHECK (statut IN ('ouverte','en_cours','en_attente','close','annulee')),
  assigne_a        bigint REFERENCES collaborateur(id),  -- ⭐ UNE personne responsable, et une seule
  prochaine_action_le   date,                            -- ⭐ « en attente » sans date est un trou noir
  prochaine_action_quoi text,                            -- ⭐ « relancer le devis Dupont »
  assurance_impliquee boolean NOT NULL DEFAULT false,
  ouverte_le  timestamptz NOT NULL DEFAULT now(),
  close_le    timestamptz,
  ouverte_par bigint REFERENCES collaborateur(id),
  ouverte_par_libelle text,              -- nom FIGÉ : lisible des années après (patron 053:44)
  maj_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loc_intervention_bien_idx ON loc_intervention (bien_id, ouverte_le DESC);
-- Les interventions OUVERTES d'un bien : requête la plus chaude du classement.
CREATE INDEX IF NOT EXISTS loc_intervention_ouvertes_idx ON loc_intervention (bien_id) WHERE close_le IS NULL;
```

**`loc_message` — le pointeur vers un mail.** ⚠️ **Le choix structurant de toute l'étude** : on ne recopie
**pas** le contenu. On garde l'identifiant Gmail, l'identifiant du fil, et le strict minimum pour afficher une
liste et classer. Le corps est chargé **à la demande** depuis Gmail quand quelqu'un ouvre la fiche.

```sql
CREATE TABLE IF NOT EXISTS loc_message (
  id           bigserial PRIMARY KEY,
  gmail_id     text NOT NULL UNIQUE,     -- identifiant Gmail : LE pointeur
  gmail_thread_id text NOT NULL,         -- identifiant du fil, natif Gmail
  message_id_rfc text,                   -- en-tête Message-ID standard (survit à un changement d'outil)
  sens         text NOT NULL CONSTRAINT loc_message_sens_chk CHECK (sens IN ('recu','envoye')),
  de_adresse   text NOT NULL,            -- conservé : nécessaire au classement hors ligne
  objet        text,                     -- conservé : nécessaire au classement et à la liste
  date_message timestamptz NOT NULL,
  classe_le    timestamptz,              -- NULL = file « à classer »
  cree_le      timestamptz NOT NULL DEFAULT now()
);
-- La FILE « À CLASSER » : index partiel, petit et ciblé (patron 073:61)
CREATE INDEX IF NOT EXISTS loc_message_a_classer_idx ON loc_message (date_message DESC) WHERE classe_le IS NULL;
```

> **Ce qu'on ne stocke pas, et pourquoi** : ni le corps, ni le HTML, ni les pièces jointes, ni les
> destinataires nominatifs. Trois bénéfices d'un coup — l'effacement d'une personne redevient trivial (on
> supprime dans Gmail, le pointeur meurt) ; il n'y a pas de seconde copie à protéger sur un portable ; et la
> divergence entre Gmail et la copie (mail supprimé, déplacé, fil fusionné) **n'existe pas**.

**`loc_message_rattachement` — le classement.** Une table **séparée**, jamais une colonne. Trois raisons, dans
l'ordre : un mail peut concerner **deux biens** (deux lignes) ; on veut garder **l'historique** des
reclassements (une colonne écraserait la décision précédente) ; un mail peut être rattaché au **bien** sans
qu'on sache encore à quelle intervention.

```sql
CREATE TABLE IF NOT EXISTS loc_message_rattachement (
  id              bigserial PRIMARY KEY,
  message_id      bigint NOT NULL REFERENCES loc_message(id) ON DELETE CASCADE,
  bien_id         bigint REFERENCES loc_bien(id),
  intervention_id bigint REFERENCES loc_intervention(id),
  methode         text NOT NULL CONSTRAINT loc_message_rattachement_methode_chk
                    CHECK (methode IN ('reference_interne','fil_discussion','reference_monga','reference_tiers',
                                       'adresse_bien','expediteur_unique','manuel','aucun')),
  motif           text NOT NULL,         -- phrase lisible, TOUJOURS écrite, même en cas de succès (patron :40)
  actif           boolean NOT NULL DEFAULT true,   -- un reclassement désactive l'ancien : on n'efface jamais
  rattache_le     timestamptz NOT NULL DEFAULT now(),
  rattache_par    bigint REFERENCES collaborateur(id),   -- NULL = classement automatique
  rattache_par_libelle text,
  CONSTRAINT loc_message_rattachement_cible_chk CHECK (bien_id IS NOT NULL OR intervention_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS loc_message_rattachement_interv_idx
  ON loc_message_rattachement (intervention_id, rattache_le DESC) WHERE actif;
```

**`loc_journal` — qui a fait quoi, quand.** Append-only, garanti **en base par un déclencheur** (patron
`118_permis_altitude_journal.sql:60-72`) : on ne corrige pas une ligne, on en émet une nouvelle. C'est le seul
niveau qui tienne devant un litige — et c'est là que vivent les **notes internes** (les appels téléphoniques).

```sql
CREATE TABLE IF NOT EXISTS loc_journal (
  id         bigserial PRIMARY KEY,
  entite     text NOT NULL CONSTRAINT loc_journal_entite_chk
               CHECK (entite IN ('intervention','message','bien','rattachement')),
  entite_id  bigint NOT NULL,            -- PAS de FK : la trace survit à la purge de l'objet (doctrine 118:30)
  action     text NOT NULL,              -- 'ouverture','changement_statut','reclassement','note_interne','appel'
  valeur_avant text,
  valeur_apres text,
  commentaire  text,                     -- la NOTE INTERNE : « appel du propriétaire, a validé 840 €, 14h20 »
  survenu_le timestamptz NOT NULL DEFAULT now(),  -- quand ÇA s'est passé (≠ quand on l'a saisi)
  auteur_id  bigint,
  auteur_libelle text NOT NULL,          -- nom FIGÉ, ou 'automatique'
  horodatage timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loc_journal_entite_idx ON loc_journal (entite, entite_id, horodatage);
```

### 2.4 Les trois choix expliqués

**Pourquoi une table de rattachement et pas une colonne ?** Une colonne répond « quel dossier ? » par *un
seul* nombre. La réalité en dit trois de plus : deux biens possibles, un classement qui évolue, un bien connu
sans dossier. Une table le fait ; une colonne, non. *(Le même raisonnement de cardinalité est déjà écrit dans
le dépôt : `104_permis_extraction_journal.sql:4-9`.)*

**Comment un mail concerne deux biens ?** Deux lignes, même message, deux `bien_id`. Le mail apparaît dans les
deux dossiers et n'est stocké qu'une fois. À l'écran, il porte un marqueur (« concerne aussi B-0087 ») pour ne
pas passer pour un doublon.

**Comment trace-t-on qui a fait quoi ?** Trois niveaux : l'horodatage et l'auteur sur chaque fait ; le nom
**figé en texte** à côté de la clé étrangère (lisible même si le collaborateur est désactivé) ; et le journal
append-only pour tout le reste.

---

## 3. La cascade de classement automatique

### 3.1 Les trois principes, repris du dépôt

1. **On s'arrête au premier signal qui désigne exactement UN dossier.**
2. **Deux candidats au même niveau → on ne tranche pas, on demande.** (`rattachementReponse.ts:131`)
3. **On ne classe JAMAIS sur la seule adresse de l'expéditeur** (`:5-6`) — la boîte est partagée, un artisan
   écrit pour dix immeubles.

Avant la cascade, trois gardes : **déduplication** par identifiant unique ; **message de non-remise** écarté
(`:221-229`) ; **accusé automatique** marqué mais **jamais jeté** (`:239-243`). ⚠️ Ce dernier point vient d'un
bug réel et coûteux documenté à `:214-219` : un accusé de réception avait été pris pour un rebond et **supprimé
en silence**. Transposé ici, cela voudrait dire perdre « votre demande a bien été reçue » de Monga.

### 3.2 Signal par signal

| # | Signal | Ce qu'il attrape | Ce qu'il rate | Ce qu'il risque de mal classer | Précision |
|---|---|---|---|---|---|
| 1 | **Notre référence** `LOC-…` citée | Toute réponse à un de nos envois qui conserve l'objet | Tout premier contact ; les objets réécrits | Un vieux mail recopié avec l'ancienne référence ; la référence dans le **texte cité** en bas → ne chercher que dans la partie **non citée** | ~99,5 % |
| 2 | **Fil de discussion** | La majorité du volume : la conversation continue | Les « réponses » créées comme mails neufs (fréquent sur mobile) ; les clients dont le logiciel casse les en-têtes | **Le fil qui dérive de sujet** — voir 3.3 | ~95 % (bien) / ~88 % (dossier) |
| 3 | **Référence Monga** | Toute la chaîne Monga, y compris sans aucun de nos identifiants | Les interventions gérées **en interne** sans Monga | Faux positif par sous-chaîne si la référence est courte → plancher de longueur **en configuration** | ~97 % *une fois le format connu* |
| 4 | **Référence d'un tiers** (n° de sinistre) | Les mails d'assureur et d'expert | Les assureurs qui répondent avant ouverture du dossier | Un sinistre couvrant **deux** interventions (la fuite, puis la remise en état) → la garde « ≥2 » se déclenche, c'est voulu | ~94 % |
| 5 | **Adresse du bien citée** | Le premier contact : « je vous écris pour le 12 rue Voltaire » | Les adresses approximatives | ⚠️ **Le plus risqué.** La **signature** de l'expéditeur contient son adresse → l'écarter avant d'appliquer le signal. Et exiger **numéro + voie + code postal**, jamais la voie seule (le 12 et le 14) | ~85 % (bien seulement) |
| 6 | **Expéditeur connu × unicité** | Le locataire dont l'occupation ne porte que sur un bien | Un artisan sur dix immeubles : ne conclut jamais — **et c'est voulu** | Si la fuite est close depuis deux jours et que le locataire y revient, on classerait dans la seule intervention ouverte (le bail) → élargir aux dossiers **clos depuis moins de N jours** | ~90 % (bien) / ~70 % (dossier) |
| 7 | **File « à classer »** | Tout le reste | — | Rien : c'est la sortie sûre | — |

**Un écart assumé au dépôt** : le dépôt met le **fil** en premier ; je place la **référence explicite** devant.
Motif : là-bas, un dossier est mono-sujet par construction ; ici, un fil avec un propriétaire **dérive**
naturellement. Citer une référence est un **acte volontaire** ; appartenir à un fil est un accident d'usage du
bouton « Répondre ». *C'est un arbitrage, à valider.*

### 3.3 Les six cas difficiles

**① Le fil qui change de sujet.** On parlait de la fuite ; le propriétaire enchaîne sur le bail. C'est **la
limite structurelle** de tout classement par fil. Trois couches : référence explicite prioritaire ; détection
de rupture (objet réécrit, vocabulaire étranger à la catégorie) qui **ne conclut pas** mais classe au **bien**
seul et envoie le dossier en arbitrage ; et un bouton « détacher ce message et les suivants ». **Franchement :
on en attrape 60-75 %, pas plus.** Le reste se corrige d'un clic — le mail est dans le bon bien, sur le
mauvais dossier voisin. C'est une gêne, pas une perte.

**② Un mail qui concerne deux biens.** Ce n'est **pas une ambiguïté, c'est un fait** — et la distinction est
cruciale. Un signal **énumératif** (deux adresses citées, deux références) = le message parle de deux choses →
**deux lignes**. Un signal **désignatif** (le fil désigne deux dossiers) = le signal ne sait pas → **on ne
tranche pas**.

**③ Un expéditeur lié à plusieurs biens.** C'est là que la doctrine du dépôt sauve la mise : l'expéditeur seul
ne classe jamais. Pour un propriétaire de trois biens, trois candidats → on demande. La vraie parade est
**opérationnelle** : si le mail sortant porte la référence dans l'objet, toutes les réponses retombent sur les
signaux 1 et 2.

**④ Réexpéditions et copies.** Un transfert **casse le fil** (mail neuf) **et** son expéditeur est celui qui
transfère : les signaux 2 et 6 sont aveugles. Parade : détecter le transfert et, **dans ce cas seulement**,
chercher les références dans le **corps cité** — là où vit l'information d'origine. Précision ~80 %, confiance
dégradée d'office. Les **copies**, elles, ne posent pas de problème de classement : elles sont le cœur du
filtre par partie (voir §5, objection 3).

**⑤ La référence Monga absente, tronquée ou changée.** Le format est **inconnu** — et ce n'est pas un
obstacle, c'est une situation déjà vécue par le dépôt avec les références de mairie :
`085_reference_externe.sql:9` pose la règle *« format LIBRE, **jamais de contrainte de forme** »*. Donc :
aucun motif codé en dur, la référence est **apprise** au premier classement manuel ; absente → le signal est
muet, la cascade continue ; tronquée → **non classé, jamais approximé** (c'est testé : `rattachementReponse.test.ts:82`) ;
format changé → **rien ne casse**, précisément parce que rien n'est gravé.

**⑥ Deux signaux qui se contredisent.** Deux candidats au **même** niveau → on ne tranche pas. Deux **niveaux**
différents qui divergent → **la cascade est ordonnée, le signal le plus haut gagne** (le dépôt le teste trois
fois). J'ajoute une chose qu'il ne fait pas : **tracer la contradiction** dans le motif (« classé sur la
référence ; le fil pointait LOC-2026-000038 »). Coût nul, et au bout de deux mois on sait si l'ordre de la
cascade est le bon.

### 3.4 Taux attendu — et pourquoi ce n'est pas la bonne cible

| | Régime établi | Premier mois |
|---|---|---|
| Classé au bon **bien** | 85-92 % | — |
| Classé à la bonne **intervention** | **75-85 %** (retenu : ~79 %) | 55-70 % |
| Erreurs **non détectées** | **2-5 %** | — |

**Ce chiffre est une opinion argumentée, pas une mesure** : personne n'a ouvert la vraie boîte. Il dépend, par
ordre d'impact : (1) **répondez-vous depuis l'outil ?** ±15 points — levier organisationnel, pas technique ;
(2) la référence Monga est-elle systématique ? ±10 ; (3) **combien d'interventions ouvertes par bien en
moyenne ?** ±8 — si c'est 1,1 le signal 6 classe presque toujours, si c'est 2,5 presque jamais ; (4) la tenue
de l'annuaire ±7 ; (5) la part de propriétaires multi-biens ±5.

**Mais la bonne cible n'est pas 79 %.** Pour trois personnes, un mail **non** classé coûte vingt secondes. Un
mail **mal** classé en silence coûte l'information perdue *et* le risque d'écrire au mauvais locataire. À 300
mails/mois, 2-5 % d'erreurs invisibles font **6 à 15 mails mal rangés par mois** — en un trimestre, la
quasi-certitude qu'un impayé se retrouve sous le mauvais dossier. **La cible est : zéro faux rattachement, le
reste à classer.** Et si le vrai chiffre est 50 %, ce n'est plus le même produit : c'est un **classement
manuel assisté**, où la file « à classer » est l'écran principal et non une file d'exception. Cette différence
d'ergonomie ne se rattrape pas après coup — d'où le lot 0 du §6.

---

## 4. Recommandation Google

### 4.1 API Gmail plutôt qu'IMAP — et c'est contre-intuitif

On pourrait croire qu'il faut réutiliser l'IMAP existant. **Non** : sur les sept besoins exprimés, **six sont
natifs côté API Gmail et sont des machineries à construire côté IMAP.**

| Besoin | IMAP | API Gmail |
|---|---|---|
| Suivre les fils | dossiers simulés : un mail à 3 étiquettes apparaît **3 fois** avec 3 numéros → comptage double **silencieux** | `threadId` natif |
| Savoir ce qui a changé ailleurs | à construire (`UIDVALIDITY`, `UIDNEXT`, drapeaux) — **rien de tel dans le dépôt**, la synchro actuelle est « depuis telle date moins 3 jours » | `history.list` : ajouts, suppressions, étiquettes, en un appel |
| Recherche mots-clés + période | capricieuse ; correspondance par mot | `q=` — la barre de recherche Gmail, indexée |
| Pièces jointes sans les télécharger | possible mais l'adaptateur actuel télécharge **tout** le message | nom/type/taille sans un octet de contenu |
| Robustesse | connexion longue avec état ; le Mac se met en veille, l'état casse | requêtes sans état, rejouables |
| Réutiliser l'existant | **seul point en faveur d'IMAP** | client OAuth déjà écrit (`permis/drive.ts`) |

**Et surtout** : réutiliser `imap.ts` obligerait à y ouvrir un droit d'écriture, ce que le fichier interdit
explicitement pour protéger la boîte du module Permis. **L'IMAP ferait gagner deux jours et en coûterait dix.**

### 4.2 Authentification : ce qu'il faut faire, et par qui

**Prérequis n° 0, bloquant** : vérifier que `gestion@criterimmo.fr` est **un vrai compte**, ni un alias, ni un
groupe. Le dépôt connaît déjà ce piège (`email/index.ts:12-14` : *« un alias ne peut pas s'authentifier »*).
Un **groupe** n'a ni IMAP ni API Gmail — ce serait une tout autre conception.

**Retenu : OAuth « Interne » avec jeton de rafraîchissement** pour démarrer (le dépôt a déjà le script exact,
`npm run drive:autoriser`, à dupliquer avec d'autres périmètres), **compte de service avec délégation** comme
cible quand le module deviendra critique. Écarté : le **mot de passe d'application** — aucun périmètre
limitable (lecture + écriture + suppression + envoi, tout ou rien), incompatible avec l'API, et avenir non
garanti.

| Étape | Où | Par qui |
|---|---|---|
| Confirmer que `gestion@` est un vrai compte | — | administrateur |
| Activer les API Gmail (et Drive si retenu) | console Google Cloud | administrateur |
| Écran de consentement **« Interne »**, puis **publier** | console Google Cloud | administrateur |
| Créer un identifiant client « Application de bureau » | console Google Cloud | administrateur |
| Lancer une fois l'autorisation en étant connecté comme `gestion@` | script du dépôt | quiconque a le mot de passe |

⚠️ **Le piège le plus fréquent, et il est silencieux** : si l'écran de consentement reste au statut
**« Test »**, le jeton **expire au bout de 7 jours**. Il faut **publier** — ce qui, pour une application
« Interne », ne déclenche aucune revue de Google.

**Périmètres à demander, et rien de plus** : lecture + étiquettes, et envoi. **Ne pas** demander l'accès total.

### 4.3 Drive : retiré du périmètre initial

L'analyse est solide (un **seul** Drive partagé — jamais « Mon Drive », dont le contenu part avec le compte
d'un salarié ; identifiants mémorisés en base, jamais identifier un dossier par son **nom**, car Drive autorise
les doublons ; vérifier le drapeau « à la corbeille » avant d'écrire ; corbeille 30 jours puis plus rien sans
licence d'archivage). Et un lien Drive est **remarquablement durable** : il survit au renommage, au
déplacement, au changement de propriétaire ; il ne meurt qu'à la suppression définitive ou à la copie.

**Mais je le retire du démarrage**, pour une raison que l'analyse Drive ne voyait pas : ajouté à Gmail et à
MinIO, il crée une **troisième copie** des mêmes documents, sans vérité unique, et un droit d'effacement qui
doit désormais atteindre les trois. Le jour où il reviendra, il sera **soit** le stockage, **soit** MinIO —
jamais les deux. En attendant, le **permalien vers le mail d'origine** suffit pour un usage interne, coûte
zéro et ne duplique rien. Sa limite, à connaître : il est inutilisable pour un propriétaire externe, et il
pointe un *message*, pas un *document*.

### 4.4 Notifications : différées

Être prévenu instantanément d'un nouveau mail exige, côté Google, une file de messages Cloud (Pub/Sub) et
— pour la forme la plus simple — une **adresse web publique et stable**, que le Mac avec tunnel temporaire n'a
pas. **Interroger toutes les 60 secondes coûte une fraction dérisoire du quota** et évite tout ce chantier. À
rouvrir le jour de l'hébergement.

---

## 5. Les objections du contradicteur

> Douze objections retenues sur dix-sept. Pour chacune : la réponse retenue, ou la mention **NON RÉSOLU**.

**1 — BLOQUANT. « Un outil qui dort la nuit ne synchronise pas : il ment par omission. »**
Le dépôt l'avait déjà écrit (`ops/README.md:19`). Mac éteint = rien n'entre, et **personne n'est prévenu** :
un travail qui ne tourne pas ne produit pas d'erreur, il produit du silence.
→ **RETENU, et c'est la décision structurante de l'étude.** On ne synchronise pas : **Gmail reste la seule
source de vérité**, le module ne garde que des pointeurs et charge le contenu à la demande. Mac éteint =
module **indisponible**, ce qui est honnête. Et l'écran affiche en permanence la **date de dernière
synchronisation**, en rouge au-delà de 24 h. *(L'hébergement reste la vraie réponse ; Arno l'a déjà prévu « au
passage sur un vrai serveur ».)*

**2 — BLOQUANT. « Recopier impayés, situations familiales et RIB en clair sur un Mac. »**
Base légale à établir, durée de conservation absente des propositions, **aucun script de sauvegarde dans tout
le dépôt**, et surtout : on ne sait pas *effacer* une personne dont le nom est dans 200 corps de mails, les
citations et les pièces jointes.
→ **RETENU** : l'option « pointeurs » (objection 1) fait tomber l'essentiel. L'effacement redevient trivial —
on supprime dans Gmail, le pointeur meurt. **Règle posée : si on ne sait pas écrire « effacer cette personne »
avant d'ingérer, on n'ingère pas.**
→ **NON RÉSOLU** : la durée de conservation des *interventions* (qui, elles, restent en base) reste à fixer,
et c'est un choix métier (§7, question 6).

**3 — BLOQUANT. « Le premier mail parti au mauvais locataire est un incident à déclarer. »**
Scénario concret : la cascade rattache par adresse citée un mail du 2e à l'intervention du 4e ; l'opérateur
répond depuis la fiche ; **le locataire du 2e reçoit l'historique de l'impayé du 4e**, citation comprise.
Et le contradicteur relève la tension centrale que personne n'avait arbitrée : **« répondre depuis l'outil »
est à la fois le plus gros levier de classement (+15 points) et le geste le plus dangereux.**
→ **RETENU en partie.** L'envoi sort du premier jet (lot 6, pas lot 1). Quand il arrivera : destinataires
résolus depuis **le message auquel on répond**, jamais depuis la fiche ; liste nominative affichée en clair
avec cases à décocher ; aucun « répondre à tous » par défaut ; refus si le message ne relève pas de
l'intervention ouverte ; fenêtre d'annulation ; journal d'envoi append-only.
→ ⚠️ **Arno a explicitement demandé de pouvoir répondre et écrire depuis l'outil.** Le reporter est un choix
de séquencement, pas un refus — **mais c'est à lui de le valider** (§7, question 2).

**5 — GRAVE. « La dépendance à Monga est traitée comme un acquis : personne n'a vu un seul mail. »**
Le pire n'est pas qu'un changement de format casse, c'est qu'il **casse en silence** : le taux baisse, les
mails partent en « à classer », et personne ne fait le lien pendant six semaines.
→ **RETENU** : aucun motif codé en dur (doctrine `085:9`), et surtout **instrumenter le taux de rattachement
par méthode**, avec alerte sur décrochage. Une cascade sans télémétrie par étage n'est pas maintenable.

**6 — GRAVE. « Si un logiciel de gérance existe, 60 % du modèle est mort-né. »**
La seconde vérité perd toujours : ce n'est pas elle qui produit les quittances, donc ce n'est pas elle qu'on
met à jour. Trois mois plus tard le référentiel local est faux, et le classement avec lui.
→ **RETENU, et devenu la question n° 1 du §7.** Selon la réponse, le module garde un référentiel réduit avec
un identifiant externe opaque, ou il double de taille.

**7 — GRAVE. « Les 79 % sont une opinion déguisée en mesure. »**
Quatre chiffres à la décimale sur un corpus que personne n'a ouvert.
→ **RETENU** : §3.4 réécrit pour dire que la bonne cible est « zéro faux rattachement », et le **lot 0**
(rejeu hors ligne sur la vraie boîte) est devenu le premier du plan.

**8 — GRAVE. « Le "lu/non lu" de Gmail est un piège sur une boîte partagée. »**
Excellente objection, que les quatre autres mandats avaient manquée : le drapeau est **commun**. Si Arno ouvre
un mail, il est « lu » pour tout le monde. « Lu » ne veut dire ni « vu par la bonne personne », ni « traité ».
→ **RETENU** : l'état d'avancement devient **métier** (assigné à + prochaine action), et **on ne touche pas au
drapeau Gmail** au démarrage. Bénéfice inattendu : le besoin d'**écrire** dans la boîte s'effondre, donc la
règle de lecture stricte du dépôt est préservée sans exception.

**9 — GRAVE. « 18 tables pour trois personnes, dans un dépôt à 227 migrations manuelles sans registre. »**
→ **RETENU** : ramené à **6 tables** (§2.2).

**10 — GRAVE. « 12-13 jours répond à une autre question que "quand Arno peut-il s'en servir". »**
L'estimation chiffrait la plomberie Google, pas : l'affichage du HTML d'un tiers sans faille (aucun
assainisseur HTML dans le dépôt), la recherche et la pagination (aucun index plein texte dans les 227
migrations), la plomberie de permissions, les tests au standard maison, ni les fonctions de recours (classer à
la main, détacher, fusionner, scinder).
→ **RETENU** : l'estimation honnête est **35 à 60 jours** hors hébergement et hors référentiel. Le plan du §6
est découpé pour que **le premier résultat utile arrive au lot 2**, pas au bout des 35 jours.

**11 — GRAVE. « `deposerPieceEntrante` ne jette jamais : correct pour la veille, dangereux pour la gérance. »**
Une pièce de mairie perdue se redemande. **Un constat d'huissier ou un état des lieux signé, non.**
→ **RETENU** : sans copie des pièces jointes au démarrage (elles restent dans Gmail), le problème ne se pose
pas. S'il revient : échec de dépôt **visible** (bandeau sur l'intervention) et rejouable.

**12 — GRAVE. « Drive crée une troisième copie sans histoire d'effacement. »** → **RETENU**, Drive retiré (§4.3).

**13 — MODÉRÉ. « Rien n'est prévu pour la divergence entre Gmail et le miroir. »**
→ **RETENU** : sans miroir, la question ne se pose pas.

**14 — MODÉRÉ. « La synthèse s'appuie sur des documents plutôt que sur le réel. »**
Le contradicteur a trouvé **deux affirmations fausses** dans la recon (corrigées en §1.3). Le dépôt a un
précédent documenté de dérive entre sa documentation et son code.
→ **RETENU** : c'est pourquoi le §8 sépare strictement le prouvé du non vérifié.

**16 — MINEUR. « Démarrer par les fuites d'eau est le bon conseil sur le mauvais objet. »**
Une fuite est le cas **urgent** : l'équipe n'ira pas vérifier dans un outil neuf avec le plombier au
téléphone. Un pilote tient mieux sur un flux **régulier et non urgent**.
→ **RETENU** : le pilote portera sur une catégorie tolérante (administratif / entretien), pas sur les fuites.

**Deux objections écartées** : celle sur `MAIL_FROM` et celle sur `permsToutes()` — j'ai vérifié, et c'est le
contradicteur qui avait raison contre la recon. Les corrections sont en §1.3.

---

## 6. Plan de construction en lots

> Un lot = un chantier = un prompt = un commit. Ordonné par dépendance. **Le lot 0 n'écrit aucun code de
> production** et c'est pourtant le plus rentable.

**LOT 0 — Mesurer avant de construire** · *dépend de : rien*
Exporter 3 mois de la vraie boîte, rejouer la cascade **hors ligne** (fonction pure, sans base ni Gmail — le
dépôt a exactement ce patron), et compter : taux par signal, part de mails réellement dans un fil, part
portant une référence Monga, nombre moyen d'interventions ouvertes par bien.
→ **Visible pour Arno** : un chiffre réel à la place d'une estimation, et la réponse à « ce module vaut-il la
peine ? ». **Risque** : le chiffre peut être décevant — c'est précisément l'intérêt de le savoir maintenant.

**LOT 1 — La tuile et le socle d'accès** · *dépend de : lot 0, et des réponses du §7*
Permission `perm_gestion_locative` (recette en 7 points), tuile dans le menu, écran vide gardé. Jeton Google
obtenu, fonction d'authentification **isolée** (le passage au compte de service doit être 40 lignes, pas une
refonte). Un script de lecture seule affiche les 10 derniers objets de la boîte.
→ **Visible** : Arno voit sa tuile et la preuve que l'application lit sa boîte. **Risque** : l'écran de
consentement laissé en « Test » (jeton mort à 7 jours) ; `gestion@` qui serait un alias ou un groupe.

**LOT 2 — La liste des mails et la file « à classer »** · *dépend de : lot 1*
Tables `loc_message` + `loc_message_rattachement`. Balayage initial, index des pointeurs, liste paginée,
recherche déléguée à Gmail (`q=`), ouverture d'un mail (contenu chargé à la demande).
→ **Visible, et c'est le premier vrai service** : 100 % des mails consultables et cherchables depuis
l'application. **Risque** : le volume réel (inconnu) ; la pagination et la recherche sont à construire.

**LOT 3 — Les interventions** · *dépend de : lot 2*
Tables `loc_bien`, `loc_partie`, `loc_intervention`, `loc_journal`. Cartes dépliables, catégories, urgence,
**assigné à**, **date de prochaine action**, **notes internes**, dates d'ouverture et de clôture. Rattachement
**manuel** d'un mail à une intervention, et **détachement**.
→ **Visible** : le registre des interventions existe, alimenté à la main. **Déjà utilisable seul.**
**Risque** : si le référentiel des biens doit venir d'ailleurs (§7 q.1), ce lot change de forme.

**LOT 4 — Le classement automatique** · *dépend de : lots 2, 3 et des mesures du lot 0*
La cascade, signal par signal, en module **pur** et testé. Motif toujours écrit. Télémétrie par méthode.
→ **Visible** : la file « à classer » se vide toute seule. **Risque** : le principal du projet — un faux
rattachement silencieux. Mitigation : la règle « en cas de doute, on ne tranche pas », et le taux par méthode
sous les yeux.

**LOT 5 — Le pilotage quotidien** · *dépend de : lot 3*
Une vue unique : ce qui est en retard, ce qui dort, ce qui attend qui. Tri par date, urgence, dernière
interaction. Filtre par partie. Fusion et scission des doublons.
→ **Visible** : la question « qu'est-ce qui dort ? » a enfin une réponse. **Risque** : le filtre par partie
suppose de connaître les destinataires — à charger depuis Gmail à l'ouverture, ou à normaliser (table
retirée du noyau, à rouvrir ici).

**LOT 6 — Écrire depuis l'outil** · *dépend de : lot 5, et de l'accord d'Arno (§7 q.2)*
Répondre dans le fil et écrire, avec pièces jointes, depuis un compte `gestion@` dédié. **Avec tous les
garde-fous de l'objection 3** : destinataires issus du message répondu, liste affichée, pas de « répondre à
tous » par défaut, fenêtre d'annulation, journal d'envoi.
→ **Visible** : l'outil devient autonome, et le classement gagne ~15 points. **Risque** : le plus élevé du
projet — écrire au mauvais destinataire. À ne pas avancer dans le plan.

**LOT 7 et au-delà** — devis / autorisation de dépense / facture ; assurance et n° de sinistre ; relances
(alerte **interne**, jamais de mail automatique au locataire) ; échéances récurrentes ; export complet d'un
dossier pour un litige. Chacun est un lot, aucun n'est un préalable.

---

## 7. Questions ouvertes pour Arno

> Sept choix **métier**, aux conséquences concrètes. Les arbitrages techniques, je les ai tranchés moi-même et
> j'ai dit pourquoi (API Gmail plutôt qu'IMAP ; pointeurs plutôt que copie ; 6 tables plutôt que 18 ; état
> d'avancement métier plutôt que drapeau Gmail ; Drive différé).

**1. Qu'est-ce qui fait foi aujourd'hui pour la liste des biens, des propriétaires et des locataires ?**
*Un logiciel de gérance ? Un tableur ? Rien, tout est dans les têtes et les mails ?*
→ **La question qui pèse le plus lourd.** Si un logiciel existe, le module ne doit **pas** recréer ce
référentiel : il l'importe en lecture seule et garde l'identifiant externe. Sinon il devient une seconde
vérité qui sera fausse en trois mois, et le classement avec elle. Si rien n'existe, le module devient aussi le
référentiel — et le projet double de taille.

**2. Acceptez-vous que, dans un premier temps, on lise et on classe dans l'outil mais qu'on réponde dans
Gmail ?**
→ Vous avez demandé de pouvoir écrire depuis l'outil, et c'est légitime. Mais c'est à la fois le plus gros
levier de classement automatique **et** le geste le plus dangereux (envoyer l'historique d'un impayé au
mauvais locataire est un incident à déclarer). Le reporter au lot 6 permet de livrer plus tôt et de construire
les garde-fous sans pression. **C'est votre appel.**

**3. Combien de biens gérez-vous, et combien de mails arrivent par jour dans cette boîte ?**
→ 40 lots ou 900, 50 mails/mois ou 800 : ce n'est pas le même produit ni la même ergonomie. Ce chiffre
change l'ordre des lots.

**4. Voulez-vous **remplacer** Gmail pour la gestion locative, ou **compléter** Gmail ?**
→ Si c'est compléter, le module n'a pas à gérer le lu/non lu ni l'envoi, et il devient nettement plus simple
et plus sûr. Si c'est remplacer, il faut l'hébergement d'abord (question 5).

**5. Quand l'application passe-t-elle sur un vrai serveur ?**
→ Vous avez déjà tranché que le tunnel nommé et l'adresse publique se feraient à ce moment-là. Tant que
l'application vit sur le Mac, le module sera **indisponible** quand la machine dort — c'est acceptable pour un
outil de consultation, pas pour un outil dont on attend qu'il n'oublie rien.

**6. Combien de temps doit-on garder la trace d'une intervention close ?**
→ Il faut une durée, décidée maintenant, et inscrite dès la première migration. Une intervention close en 2026
n'a pas vocation à rester indéfiniment. *(Point à faire valider juridiquement : les durées varient selon la
nature des données et les obligations comptables.)*

**7. Qui doit voir cette boîte dans l'application ?**
→ Tous les collaborateurs, ou seulement certains ? ⚠️ **Avant d'y mettre des données de locataires**, deux
points du registre d'audit devraient être soldés : la **voie de secours** (mot de passe partagé, non nominatif,
non révocable sans rotation du secret — item M2, toujours ouvert) et le **nettoyage du `.env`** (item G5). Le
contradicteur a raison : mettre la messagerie des locataires derrière une porte qui garde une clé partagée
serait incohérent.

---

## 8. Ce qui est prouvé, et ce qui ne l'est pas

### 8.1 Prouvé (vérifié dans le code, `fichier:ligne`)

- Le client IMAP est en **lecture stricte**, règle déclarée non négociable — `imap.ts:5-7`.
- La cascade de rattachement existe, est **pure et testée**, et sa règle d'ambiguïté est écrite —
  `rattachementReponse.ts:131`, 275 lignes de tests.
- `demande_reponse` **ne stocke que l'expéditeur**, sans destinataire ni copie — `073:37-38`.
- Il n'existe **aucun index plein texte** dans les 227 migrations, et `listerReponses` n'a **ni `LIMIT` ni
  `OFFSET`** — `demandeReponseRepo.ts:247-253`.
- L'ordonnanceur est un **agent de session** — `plist:11`, `ops/README.md:19`.
- **Aucun référentiel de biens, propriétaires, locataires ou baux n'existe** dans le dépôt : aucune table de ce
  domaine dans les 227 migrations. *(Vérifié personnellement.)* Le module part d'une page blanche côté données.
- Le `from` d'un envoi est un **paramètre**, et `lireCompteSmtp(infixe)` gère déjà plusieurs comptes —
  `email/index.ts:118`, `:40-47`.
- `Perms = Record<Module, boolean>` fait échouer `tsc` si un module manque — `session.ts:9`.
- Le client OAuth Google et le script d'autorisation existent — `permis/drive.ts`, `scripts/drive-autoriser.ts`.

### 8.2 NON vérifié — et ce que ça changerait

| Fait non établi | Ce que ça change si la réponse est inattendue |
|---|---|
| **Ce qui fait foi pour biens / locataires / propriétaires** | Le plus lourd : divise le projet par deux, ou le double (§7 q.1) |
| **Le volume réel** de la boîte et le nombre de biens | Change l'ergonomie, l'ordre des lots et le chiffrage |
| **La part de mails réellement dans un fil**, et la part portant une référence Monga | Ce sont les deux premières marches de la cascade : l'estimation de 79 % en dépend directement |
| **Le format de la référence Monga** — jamais vu | Aucun motif n'est codé en dur, donc rien ne casse ; mais le signal 3 peut valoir beaucoup moins que prévu |
| **`gestion@` est-il un vrai compte, un alias ou un groupe ?** | Un groupe n'a ni IMAP ni API Gmail : conception entièrement différente |
| **L'édition Google Workspace** et qui est super-administrateur | La délégation à l'échelle du domaine n'est pas disponible partout |
| **Présence d'un assainisseur HTML** dans les dépendances | Afficher le HTML d'un tiers sans faille est un chantier à part entière |
| **FileVault, sauvegardes, qui accède à `gestion@` aujourd'hui** | Conditionne tout le volet données personnelles |
| **Politiques Google actuelles** (quotas, durée de validité de l'historique, statut des mots de passe d'application) | Les mandats ont travaillé **sans accès au web** : ces points sont donnés de mémoire et doivent être revérifiés |

### 8.3 Limites de méthode, assumées

Les cinq mandats ont travaillé **en lecture seule et sans accès à internet** : aucun appel à Google, aucune
recherche web, aucune connexion à la base, aucun mail réel lu. Les éléments métier (pratiques de la gérance,
réglementation française) et les éléments Google proviennent de connaissances internes et sont signalés comme
tels là où ils sont incertains. **Deux affirmations « prouvées » se sont révélées fausses à la contre-vérification**
(§1.3) : c'est l'ordre de grandeur de fiabilité à retenir pour ce qui n'a pas été re-vérifié ligne à ligne.

---

**Prochaine étape recommandée** : répondre aux sept questions du §7 — en commençant par la première — puis
lancer le **lot 0**. Aucun code n'est justifié avant.
