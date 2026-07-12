# Étude d'architecture data — Module Internaute (base nominative évolutive)

> Sans Vis-à-Vis® — document de travail interne
> Statut : **ÉTUDE PRÉPARATOIRE — aucun build.** Le module reste bloqué en attente de validation juriste / DPO.
> Nature : architecture de données (schéma, finalités, consentement, évolutivité). Ce document n'est pas un avis juridique ; toute mention réglementaire est une base de discussion à valider par le conseil.
> À lire avec : `docs/ETUDE_module_internaute_rgpd.md` (cadrage RGPD amont), `docs/INVARIANTS_SVAV.md`.

---

## 0. Objet et périmètre

L'objectif est de définir **comment stocker les coordonnées d'un internaute** qui a explicitement accepté de les laisser en échange d'un service sur mesure (accompagnement sur des biens à vue dégagée), de façon à ce que la base soit :

1. **RGPD-native** : la conformité est dans la structure, pas ajoutée après coup.
2. **Évolutive** : de nouveaux champs (parcours d'estimation en ligne à venir, ou modifications du tunnel actuel) doivent pouvoir être ajoutés **sans casser** l'existant ni ré-écrire le schéma.
3. **Cloisonnée** de M2 analytics (anonyme, k=11, sans IP) — exigence dérivée du principe de limitation des finalités.

Ce que ce document **ne fait pas** : il ne définit pas les routes, ne produit pas de migration, ne tranche aucune question juridique. Il pose l'ossature data et les invariants à respecter le jour où le build sera autorisé.

---

## 1. Principe directeur : séparer l'identité, le consentement et les données métier

La faute classique est de mettre le nom, l'email, le téléphone, le consentement et les données de projet **dans une seule table plate**. C'est ce qui rend une base non conforme et non évolutive à la fois. On sépare en trois blocs logiques distincts :

**Bloc A — Identité (qui).** Les données qui identifient directement la personne : prénom, nom, email, téléphone. C'est le bloc le plus sensible, le plus réglementé, et celui sur lequel s'exercent les droits (accès, rectification, effacement).

**Bloc B — Consentement (droit de traiter).** La preuve, horodatée et versionnée, de ce que la personne a accepté, finalité par finalité. Ce bloc est ce qui rend le traitement **légal**. Sans une entrée valide ici, aucune donnée du bloc A ne devrait être exploitable pour la finalité concernée.

**Bloc C — Données de projet (quoi).** Ce que l'internaute a renseigné sur son besoin : les champs déjà présents dans le tunnel actuel, et tous ceux à venir. C'est le bloc qui doit être **évolutif par conception**.

La règle qui lie les trois : **le bloc C n'a de valeur commerciale que si le bloc B l'autorise, et le bloc A n'est joignable que dans les finalités que le bloc B couvre.** Séparer permet aussi d'appliquer des durées de conservation différentes à chaque bloc (voir §6).

---

## 2. Bloc A — Identité

### 2.1 Ce qu'on stocke

Le strict nécessaire à la finalité « recontact pour service sur mesure » : prénom, nom, email, téléphone. Le principe de **minimisation** interdit de collecter « au cas où » : chaque champ d'identité doit être justifié par une finalité active. Le téléphone, en particulier, est le champ le plus exposé (loi démarchage, opt-in au 11/08/2026) — il ne doit être collecté que si une finalité qui l'exige est consentie, et jamais comme champ obligatoire par défaut.

### 2.2 Forme

Une ligne = une personne physique. Un identifiant interne stable (UUID) sert de clé, **jamais** l'email (qui peut changer et sur lequel s'exerce un droit de rectification). L'email peut porter une contrainte d'unicité applicative pour éviter les doublons, mais la clé technique reste l'UUID.

### 2.3 Ce qu'on ne met PAS dans ce bloc

Aucune donnée de comportement, aucune IP, aucune donnée analytique. Ce bloc ne contient que de l'identité. Le mélanger avec du comportemental est précisément ce qui crée un profil intrusif non minimisé.

---

## 3. Bloc B — Consentement (le cœur de la conformité)

C'est le bloc le plus important et le plus souvent bâclé. Il doit répondre, pour chaque personne, à : **a-t-elle consenti, à QUOI exactement, QUAND, sur la base de QUEL texte, et l'a-t-elle retiré ?**

### 3.1 Consentement granulaire par finalité

Le RGPD exige un consentement **spécifique** : on ne demande pas « acceptez-vous qu'on utilise vos données », mais un consentement **par finalité distincte**. Dans ton cas, les finalités pressenties (issues de l'étude RGPD existante) sont au moins :

- **F1 — Recontact interne** : SVAV recontacte la personne pour lui proposer son accompagnement. C'est la finalité « service sur mesure » cœur.
- **F2 — Communications / email marketing** : envoi d'informations, nouveautés, opportunités par email.
- **F3 — Partage avec des tiers / retargeting** : transmission à des partenaires. La plus sensible ; à consentement séparé et probablement à éviter au lancement.

Chaque finalité a son propre état de consentement. Accepter F1 n'implique **jamais** F2 ou F3. Le téléphone appelé pour du démarchage relève d'un régime spécifique (opt-in, preuve) qui se rattache à la ou aux finalités qui l'utilisent.

### 3.2 Ce qu'une preuve de consentement doit contenir

Pour chaque consentement donné, on conserve : la finalité concernée, l'état (accordé / refusé / retiré), l'horodatage précis, **la version exacte du texte de consentement** affiché à ce moment-là (voir §3.3), et le canal/contexte de recueil (quel formulaire, quelle étape). L'objectif : pouvoir **prouver a posteriori** qu'à telle date, la personne a vu tel texte et a coché tel choix. C'est ce que demandera un contrôle, et c'est ce qu'exige la loi démarchage pour le téléphone.

### 3.3 Versionnement des textes de consentement

Les textes de consentement (mentions, cases à cocher) **évolueront**. Si on stocke seulement « a consenti = oui », on perd la capacité de prouver **à quoi**. Donc : chaque version de chaque texte de consentement est archivée avec un identifiant de version, et chaque preuve de consentement pointe vers la version qu'a vue la personne. Un texte modifié = nouvelle version = les consentements passés restent rattachés à l'ancienne, les nouveaux à la nouvelle. C'est une contrainte d'**évolutivité de la conformité**, pas seulement des données.

### 3.4 Retrait aussi simple que l'octroi

Le retrait de consentement doit être aussi facile que son octroi (exigence RGPD). Techniquement, un retrait n'efface pas l'historique : il ajoute un état « retiré » horodaté. On garde la trace du consentement passé **et** de son retrait — la preuve de conformité vaut pour la période où le traitement était autorisé.

---

## 4. Bloc C — Données de projet, conçues pour l'évolutivité

C'est ici que ta demande d'évolutivité se joue. Le tunnel actuel a des champs ; le futur parcours d'estimation en ajoutera ; des champs actuels seront modifiés. Il faut un modèle qui **absorbe le changement sans migration lourde ni perte d'historique**.

### 4.1 Le piège à éviter : la table plate à colonnes fixes

Si chaque champ du tunnel = une colonne, alors chaque nouveau champ = une migration de schéma, chaque champ retiré = une colonne morte, et on ne sait plus quelle version du tunnel a produit quelle donnée. Ce modèle est rigide par nature — exactement ce que tu veux éviter.

### 4.2 Trois approches évolutives, par ordre de recommandation

**Approche 1 — Payload structuré versionné (recommandée).**
Les réponses de l'internaute sont stockées comme un **document structuré** (JSON) attaché à la personne, accompagné d'un **numéro de version de schéma de tunnel**. Le tunnel v1 produit un document conforme au schéma v1 ; le futur parcours d'estimation produira un document v2, etc. On ajoute des champs sans toucher la structure de la table ; on sait toujours quelle version a produit quelle donnée ; les anciennes réponses restent lisibles telles qu'elles ont été collectées.

- **Avantage** : évolutivité maximale, zéro migration pour ajouter un champ, historique de version natif.
- **Coût** : les requêtes analytiques sur un champ précis sont un peu moins directes qu'avec une colonne dédiée (mais PostgreSQL indexe le JSON, donc gérable).
- **Garde-fou** : chaque version de schéma est documentée (quels champs, quels types) pour ne pas transformer le JSON en fourre-tout ingérable. Le schéma est *souple dans la table, strict dans la doc*.

**Approche 2 — Modèle attribut-valeur (EAV).**
Une table « réponses » où chaque ligne = (personne, nom_du_champ, valeur, version). Très souple aussi, mais tend à devenir difficile à requêter et à typer proprement à grande échelle. Recommandé seulement si tu as besoin d'ajouter/retirer des champs de façon très fréquente et non planifiée.

**Approche 3 — Hybride (souvent le bon compromis à terme).**
Les **champs stables et structurants** (ceux qui ne bougeront pas : type de bien, localisation, budget…) en colonnes dédiées pour des requêtes efficaces ; les **champs mouvants / expérimentaux / spécifiques à une version de parcours** dans un payload JSON versionné. On stabilise en colonne ce qui est mûr, on garde en JSON ce qui bouge. C'est vers ça que convergent la plupart des bases évolutives une fois matures.

**Recommandation** : démarrer en **Approche 1** (tout en JSON versionné) pour la souplesse maximale au lancement, puis **promouvoir en colonnes** (glissement vers l'hybride, Approche 3) les champs qui se révèlent stables et fréquemment interrogés. Ce chemin évite à la fois la rigidité initiale et le désordre à long terme.

### 4.3 Traçabilité de version

Quel que soit le modèle, chaque enregistrement de projet porte : la version du tunnel/parcours qui l'a produit, et l'horodatage. Ainsi, le jour où tu modifies un champ existant du tunnel, les données déjà collectées ne deviennent pas ambiguës — on sait qu'elles viennent de la version précédente.

---

## 5. Cloisonnement avec M2 analytics (exigence RGPD)

M2 est **anonyme** (k=11, sans IP, commune INSEE seule, pas de donnée nominative persistée). La base internaute est **nominative**. Les lier reviendrait à ré-identifier des données anonymes et à réutiliser pour du commercial des données collectées pour de l'analyse — double violation (limitation des finalités + base légale). Donc :

- **Séparation physique et logique.** Aucune clé étrangère, aucune jointure possible entre le pool analytique et la base internaute. C'est un invariant, pas une préférence.
- **Aucun identifiant commun.** Pas d'UUID partagé, pas d'email hashé qui servirait de pont, rien qui permette de recroiser une session analytique avec une personne nommée.
- **La contrainte anti-fingerprint de M2 reste intacte.** Rien dans le module internaute ne doit fournir à M2 un moyen de désanonymiser.

Ce cloisonnement est ce que « faire ce que le RGPD demande » implique concrètement ici.

---

## 6. Durées de conservation et cycle de vie

Le RGPD impose de ne pas conserver indéfiniment. Chaque bloc a sa logique :

- **Bloc A (identité)** : conservé tant qu'une finalité active le justifie. Si tous les consentements sont retirés/expirés, l'identité doit pouvoir être purgée.
- **Bloc B (consentement)** : la **preuve** de consentement se conserve au-delà de la relation active (pour se défendre en cas de contrôle), selon une durée à fixer avec le juriste — c'est le seul bloc qui survit volontairement à l'effacement des données actives.
- **Bloc C (projet)** : lié à la durée de pertinence commerciale du projet ; au-delà, anonymisation ou suppression.

Prévoir dès la conception : un mécanisme de **purge/anonymisation automatique** à échéance, et un mécanisme d'**effacement sur demande** (droit à l'effacement) qui retire A et C mais conserve la preuve B de la période autorisée. Ces mécanismes sont plus faciles à intégrer dans un schéma cloisonné (§1) que dans une table plate.

---

## 7. Droits des personnes — conséquences sur le schéma

Le schéma doit rendre ces opérations **simples**, sinon la conformité devient un chantier permanent :

- **Accès / portabilité** : pouvoir extraire tout ce qu'on détient sur une personne → un UUID unique qui relie A, B et C rend l'extraction triviale.
- **Rectification** : modifier une identité sans perdre l'historique de consentement → d'où la clé UUID (et non l'email) au §2.2.
- **Effacement** : supprimer A et C, conserver la preuve B → possible seulement si les blocs sont séparés.
- **Retrait de consentement** : bascule d'état dans B, sans toucher A ni C → §3.4.

Un schéma en trois blocs reliés par un UUID rend chacun de ces droits mécaniquement simple. Une table plate les rend tous pénibles.

---

## 8. Points à trancher AVANT tout build (renvoi au juriste / DPO)

Ces questions ne relèvent pas de l'architecture mais la conditionnent. Elles reprennent et complètent les questions ouvertes de l'étude RGPD existante :

1. **Base légale exacte de chaque finalité** (consentement ? exécution de mesures précontractuelles ? intérêt légitime ?). Détermine si un consentement explicite est requis champ par champ.
2. **Téléphone** : justification de sa collecte, articulation avec la loi démarchage (opt-in 11/08/2026, preuve). Le collecte-t-on au lancement, ou plus tard seulement ?
3. **Frontière de l'exception « contrat en cours »** : jusqu'où va la relation précontractuelle sans consentement marketing.
4. **Finalité F3 (tiers/retargeting)** : la lance-t-on, ou la réserve-t-on ? Elle change la sensibilité de toute la base.
5. **Durées de conservation** précises par bloc.
6. **Rôle de sous-traitant** de tout prestataire (hébergement, emailing) et clauses associées.
7. **Analyse d'impact (AIPD/DPIA)** : nécessaire ou non selon l'ampleur et les finalités.

Tant que ces points ne sont pas tranchés, l'architecture ci-dessus reste une ossature ; les valeurs (quels champs obligatoires, quelles durées, quelles finalités actives) se remplissent avec les réponses du juriste.

---

## 9. Synthèse

| Bloc | Contenu | Rôle | Évolutivité |
|------|---------|------|-------------|
| A — Identité | prénom, nom, email, téléphone | Qui | Stable, minimisé |
| B — Consentement | finalité, état, date, version du texte | Droit de traiter | Versionné par conception |
| C — Projet | réponses du tunnel + futurs parcours | Quoi | JSON versionné → colonnes à maturité |

**Trois idées à retenir :**
1. **Séparer identité / consentement / projet** rend la base conforme ET évolutive d'un même geste.
2. **Le consentement versionné par finalité** est le cœur : il faut pouvoir prouver *qui a accepté quoi, quand, sur quel texte*.
3. **Le bloc projet en JSON versionné** absorbe les futurs champs (estimation en ligne, modifications de tunnel) sans migration ni perte d'historique ; on promeut en colonnes ce qui se stabilise.

Le cloisonnement total avec M2 et le respect des droits des personnes ne sont pas des couches ajoutées : ils découlent directement de cette séparation en trois blocs.

---

*Document préparatoire. Ne pas builder avant validation juriste / DPO des points du §8.*
