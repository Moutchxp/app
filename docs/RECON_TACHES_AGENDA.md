# RECON — Tâches rattachées à un bien + agendas Google de l'équipe

**Date :** 13/10/2026. **Nature :** reconnaissance en LECTURE SEULE. Aucun code, aucune migration, aucune écriture
en base, aucune configuration Google touchée, aucun appel à l'agenda, aucun mail.
**Sources :** le code (`app/lib/gestion/*`), la base locale (lecture), `docs/GUIDE_CONNEXION_GOOGLE_GESTION.md`.

> ⚠️ Aucun appel à l'API Agenda n'a été fait : la connexion actuelle **n'autorise pas** l'agenda (voir §1).
> Le prompt ne permettait l'appel de lecture que dans ce cas-là.

---

## 0. Résumé en dix lignes

1. L'application parle à Google par **trois portes distinctes** :
   - la boîte `gestion@criterimmo.fr` (OAuth) ;
   - un **compte de service avec délégation sur le domaine**, limité au **Drive**, qui agit au nom de la personne connectée ;
   - un vieux jeton Drive en lecture du module Permis.
2. **Aucune n'a l'agenda.** Il faut **ajouter une seule permission**, `calendar.events`, à la délégation existante.
   Ce sont trois gestes d'Arno dans deux consoles Google (§2). Aucun nouvel écran « Connecter Google » pour les collaborateurs.
3. Avec cette délégation, l'application peut écrire **directement** dans l'agenda de n'importe quel compte du Workspace, sans invitation ni mail.
4. Les personnes **hors Workspace** (adresse gmail.com, ADHOC) ne peuvent recevoir **qu'une invitation**. Une invitation est un **mail envoyé**.
5. Le sens **application → agenda** (créer, modifier, supprimer) est simple.
6. Le sens **agenda → application** est faisable par **relève périodique** (même principe que le démon de relève des mails).
   Les **notifications instantanées** de Google sont **impossibles aujourd'hui** : elles exigent une adresse publique, et l'application tourne sur le Mac.
7. L'existant le plus proche est la **frise des événements** : étapes « Prise de RDV », « RDV intervention », « Rappel devis », avec date et heure.
   Il n'existe aucune notion de **tâche à faire assignée à quelqu'un**.
8. Le bouton trouve sa place **sans rien déplacer** dans la zone d'actions de l'en-tête de la fiche bien, à côté de « Dossier Drive ↗ ».
9. **Titre prudent par défaut :** « Gestion — lot 315 — Visite » (numéro de lot + type).
   Ni nom de locataire, ni adresse dans le titre. L'adresse peut aller dans le **lieu**, au choix d'Arno.
10. **Ordre conseillé :**
    - **Lot 1** : tâches dans l'application seule ;
    - **Lot 2** : envoi vers l'agenda ;
    - **Lot 3** : retour depuis l'agenda.

---

## 1. La connexion Google actuelle

### 1.1 Trois portes, qui ne se rencontrent jamais

| Porte | Mécanisme | Portées (scopes) | Sert à | Où est la configuration |
|---|---|---|---|---|
| **A. `gestion@criterimmo.fr`** | OAuth « application de bureau », **un seul compte**, autorisé une fois par Arno (`npm run gestion:google:autoriser`) | `gmail.modify`, `gmail.settings.basic`, `drive` (`app/lib/gestion/google.ts:42-46`) | Envoyer/lire/étiqueter les mails de la boîte partagée, lire la signature | Identifiants du client : `.env` (`GOOGLE_GESTION_CLIENT_*` ou, à défaut, `GOOGLE_DRIVE_CLIENT_*`). Jeton : `~/.config/sansvisavis/google-gestion.json`, **hors dépôt** (`googleJeton.ts:40`) |
| **B. Compte de service + délégation sur tout le domaine** | Le compte de service signe une attestation « au nom de *adresse* » ; Google l'accepte parce que l'administrateur du Workspace l'a autorisé (`compteService.ts`) | **`drive` seulement**. C'est écrit en dur, avec la raison : une délégation peut agir au nom de n'importe qui, elle doit porter le strict nécessaire (`compteService.ts:14,27`) | Parcourir et déposer dans le Drive **avec les droits de la personne connectée** | Chemin de la clé : `.env` → `GOOGLE_DELEGATION_CLE_FICHIER` (fichier présent sur le poste). Domaines acceptés : **en base**, `gestion_config.domaines_google_autorises` = `criterimmo.fr,sansvisavis.com` |
| **C. Jeton Drive du module Permis** | OAuth ancien (chantier N6-B) | Drive en lecture | Module Permis uniquement | `.env` → `GOOGLE_DRIVE_REFRESH_TOKEN` |

Résidus :
- Un ancien mécanisme « chaque collaborateur relie son Google » (lot 5-PJ-C, `googleCollaborateur.ts`, portées `openid email drive`) a été **abandonné le 25/09/2026** sur décision d'Arno : « utiliser l'adresse avec laquelle le collaborateur s'identifie ».
- Sa table `gestion_google_compte` est **vide** (0 ligne) et ses jetons ont été purgés.
- `GESTION_JETON_CLE` (clé de chiffrement de ces jetons) reste dans `.env`.

### 1.2 Ce qui compte pour l'agenda

- **La porte B est la bonne.** Elle sait déjà agir *au nom de* n'importe quelle adresse du Workspace. Le *subject* est lu dans la session puis relu en base (`jetonCollaborateur.ts:56-95`), jamais reçu du navigateur.
- Il suffit d'élargir sa liste de portées. Le code devra demander un jeton « agenda » **séparé** du jeton « Drive », pour que chaque jeton reste étroit.
- **La porte A pourrait aussi servir** si l'on ajoute l'agenda à `gestion@`. Les événements seraient alors créés dans l'agenda de `gestion@` avec les collaborateurs **invités**, ce qui veut dire un **mail d'invitation** à chaque fois.
- C'est l'option B du §2.4, moins bonne pour l'usage voulu.
- **Aucune portée agenda n'existe aujourd'hui**, sur aucune des trois portes.

---

## 2. Agenda : ce qu'il faut ajouter

### 2.1 La permission exacte

```
https://www.googleapis.com/auth/calendar.events
```

**Elle suffit**, et c'est la plus étroite qui convienne : créer, modifier et supprimer des **événements** dans les agendas de la personne.

Elle ne permet **pas** :
- de créer ou supprimer des agendas ;
- de changer les partages ;
- de lire les réglages.

Inutile de demander `calendar` (accès total).

Option à part (voir le choix n° 6 du §8) : choisir les collaborateurs dans **l'annuaire Google** demanderait en plus `admin.directory.user.readonly`. Cela donne une délégation plus large : **à éviter** si la liste peut venir de l'application.

### 2.2 Les gestes d'Arno, pas à pas

> 🔴 **LE PIÈGE N° 1 (étape 2) :** dans la console d'administration, la ligne de la délégation porte la **liste
> complète** des portées. La modifier **remplace** la liste. Si l'on colle seulement la ligne « agenda », le
> **Drive cesse de fonctionner** pour tout le monde. Il faut coller **les deux lignes**.

**Étape 1 — Activer l'interface Agenda (console Google Cloud)**
1. Ouvrir **https://console.cloud.google.com**, connecté avec le compte administrateur.
2. En haut à gauche, choisir **le projet qui porte le compte de service du Drive**. C'est celui dont l'adresse du compte de service se termine par `…iam.gserviceaccount.com`.
   La commande `npm run gestion:drive:verifier` l'affiche sans rien modifier.
3. Menu **API et services → Bibliothèque**, chercher **« Google Calendar API »**, puis **ACTIVER**.
   Si le bouton affiche « GÉRER », c'est déjà activé : ne rien toucher.

**Étape 2 — Ajouter l'agenda à la délégation (console d'administration Workspace)**
1. Ouvrir **https://admin.google.com** (compte super-administrateur).
2. Aller dans **Sécurité → Contrôle des accès et des données → Commandes des API**.
3. Tout en bas, **GÉRER LA DÉLÉGATION AU NIVEAU DU DOMAINE**.
4. Trouver la ligne dont l'**ID client** est celui du compte de service. Le même `npm run gestion:drive:verifier` l'affiche.
   Cliquer **Modifier**.
5. Dans « Champs d'application OAuth », mettre **exactement ces deux lignes**, séparées par une virgule :
   ```
   https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/calendar.events
   ```
6. **AUTORISER**. La prise d'effet peut demander quelques minutes, parfois jusqu'à 24 h.

**Étape 3 — Vérifier que le Drive marche toujours**
- `npm run gestion:drive:verifier -- a.jorel@sansvisavis.com` doit toujours afficher ✅.
- L'agenda, lui, se vérifiera au lot 2 avec une commande de **lecture** (liste des agendas d'un compte), sur le même modèle.

**Rien d'autre à faire :**
- pas d'écran de consentement à modifier (la délégation n'en utilise pas) ;
- pas de nouvelle clé ;
- pas de bouton pour les collaborateurs.

### 2.3 Point à vérifier par Arno : un seul Workspace, ou deux ?

La délégation vaut **pour une organisation Google**.
- Si `sansvisavis.com` et `criterimmo.fr` sont **dans la même organisation** (un domaine principal + un domaine secondaire), l'étape 2 suffit pour les deux.
- Si ce sont **deux Workspace distincts**, il faut refaire l'étape 2 dans la console de chacun.
- Le code ne permet pas de trancher. Sur **admin.google.com → Compte → Domaines → Gérer les domaines**, Arno voit si les deux y figurent.

### 2.4 Où vit l'événement : deux montages possibles

| | **Montage 1 — dans l'agenda du collaborateur** *(conseillé)* | **Montage 2 — dans un agenda partagé « Gestion »** |
|---|---|---|
| Geste | L'application agit **au nom** du collaborateur choisi et pose l'événement dans **son** agenda | L'événement est posé dans un agenda commun (appartenant à `gestion@`), avec le collaborateur en invité, ou bien l'agenda est simplement partagé avec l'équipe |
| Mail envoyé ? | **Non** | Oui si invitation ; non si simple partage d'agenda |
| Le collaborateur peut-il le déplacer ? | Oui, c'est son événement | Seulement s'il a les droits de modification sur l'agenda commun |
| Si le collaborateur quitte l'entreprise | Ses événements **disparaissent avec son compte**, sauf transfert par l'administrateur. La tâche, elle, reste dans l'application (§4.4) | L'événement **survit** |
| Vue d'ensemble de l'équipe | Non : chacun voit le sien | **Oui** : un seul agenda à regarder |

---

## 3. Les collaborateurs

### 3.1 Comment un utilisateur de l'application est relié à son adresse Google

- Table **`admin_utilisateur`**, champ **`identifiant`** : c'est l'adresse e-mail de connexion. Elle est contrainte au format e-mail et **unique sans tenir compte des majuscules**.
- La délégation l'emploie telle quelle comme *subject*, après vérification du domaine contre `gestion_config.domaines_google_autorises`.
- Accès au module : `perm_gestion` (bool). Droit d'envoyer des mails : `perm_gestion_envoi`. Membre du « service gestion » : `service_gestion`.
- **Il n'existe aucun autre lien** : pas de table « comptes Google », pas d'identifiant d'agenda stocké. L'agenda principal d'un compte s'adresse par son adresse (`calendarId = l'adresse`).

### 3.2 Qui pourrait être choisi, aujourd'hui (comptage, sans nom)

| Domaine | Rôle | Actif | Accès Gestion | Nombre |
|---|---|---|---|---|
| sansvisavis.com | administrateur | oui | oui | 1 |
| sansvisavis.com | collaborateur | **non** | non | 1 |
| gmail.com | collaborateur | oui | non | 1 |

➡️ **Aujourd'hui, une liste « collaborateurs du Workspace actifs ayant l'accès Gestion » ne contiendrait qu'une personne.**

Pour proposer d'autres membres de l'équipe, il faudra au choix :
- (a) leur **créer un compte** dans l'application, même sans autre droit ;
- (b) tenir une **petite liste d'adresses** dans les réglages Gestion ;
- (c) lire l'**annuaire Google**, ce qui demande une permission de plus (déconseillé, §2.1).

C'est le choix n° 6.

### 3.3 Les personnes hors Workspace (ADHOC Gestion, `gestion.criterimmo@gmail.com`, prestataires…)

- La délégation **ne peut rien** pour elles : Google ne laisse pas une organisation agir au nom d'un compte qui ne lui appartient pas.
- La seule voie est l'**invitation** : l'événement est créé dans l'agenda d'un collaborateur du Workspace (ou dans l'agenda « Gestion »), et la personne extérieure y figure comme **invitée**.
- Google lui envoie alors **un vrai mail** d'invitation, puis un mail à chaque modification ou annulation.
- Le code devra le dire **avant** l'envoi. Les essais devront rester sur des adresses `_TEST` / `a.jorel@sansvisavis.com`, comme pour les mails.
- Rappel : ADHOC est un partenaire externe, **ni nous ni un client** (mémoire « Partenaire interne ADHOC »). Il ne doit jamais apparaître dans la liste des collaborateurs. S'il apparaît, ce sera comme « invité extérieur ».

---

## 4. Synchronisation

### 4.1 Application → agenda (le sens principal) : simple

| Geste dans l'application | Appel Google | Remarque |
|---|---|---|
| Créer une tâche « dans l'agenda de X » | `events.insert` sur l'agenda de X | On garde en base : agenda, **identifiant de l'événement**, étiquette de version (`etag`) |
| Modifier date, heure, titre ou personne | `events.patch`. Si la personne change : supprimer chez l'ancien, créer chez le nouveau (ou `events.move` en montage 2) | |
| Marquer « faite » | Au choix (choix n° 4) : laisser l'événement, le préfixer « ✓ », ou le retirer | |
| Supprimer ou annuler la tâche | `events.delete` | L'événement part dans la corbeille de l'agenda de la personne, **restaurable 30 jours** côté Google |

Détails techniques retenus pour plus tard :
- **Rendez-vous** = `start.dateTime` / `end.dateTime` en `Europe/Paris`.
- **Repère d'une journée** = `start.date` / `end.date`. Attention : la fin est **le lendemain** (borne exclusive, piège classique).
- **Rappel** = `reminders.overrides`. Exemple : « fenêtre la veille à 17 h » pour un repère d'une journée, ou « 30 min avant » pour un rendez-vous.
- Chaque événement porte en `extendedProperties.private` le **numéro de la tâche**. On reconnaît ainsi les événements de l'application sans jamais toucher aux autres.
- **Envoi différé et rattrapable** : si Google est indisponible, la tâche est créée quand même, marquée « pas encore dans l'agenda », et un passage du démon réessaie. L'**application fait foi**, l'agenda est une copie.

### 4.2 Agenda → application (le rendez-vous déplacé dans Google)

| Voie | Faisable ? | Coût |
|---|---|---|
| **Notifications de Google** (`events.watch` : Google prévient d'un changement) | **Non, en l'état.** Google appelle une **adresse HTTPS publique avec un domaine vérifié**. L'application tourne en local sur le Mac (port 3000) : Google ne peut pas la joindre. Il faudrait l'exposer sur Internet, ce qui est un autre chantier, avec ses risques. De plus, l'abonnement expire et doit être renouvelé | — |
| **Relève périodique** (le démon demande « quoi de neuf depuis la dernière fois ? » avec un `syncToken`) | **Oui.** Même principe que la relève des mails | Une requête par agenda suivi et par passage. À 5 agendas toutes les 5 minutes : ~1 500 requêtes/jour, très loin du quota gratuit (≈ 1 million/jour). **Gratuit.** Délai de retour : la période choisie |

Ce qu'on rapatrie, uniquement sur les événements portant un numéro de tâche :
- nouvelle date ou heure ;
- événement supprimé dans Google (marquer la tâche, **ne jamais la supprimer** : choix n° 5) ;
- en option, réponse d'un invité.

⚠️ **Le démon `com.sansvisavis.gestion-continu` devra être redémarré** pour prendre ce nouveau travail (mémoire « Démon relève launchd »). C'est un geste à faire avec Arno, au lot 3.

### 4.3 Si l'autorisation Google est retirée

- **Délégation retirée** (ligne supprimée dans admin.google.com) : Google répond `unauthorized_client`, déjà traduit en français par `motifRefus` (`compteService.ts:134`).
  - Les tâches continuent de vivre dans l'application.
  - Les envois vers l'agenda restent « en attente ».
  - Un bandeau dit pourquoi.
  - **Rien n'est perdu.**
- **Clé du compte de service supprimée ou révoquée** : même comportement (`invalid_client`).

### 4.4 Si un collaborateur quitte l'entreprise

| Situation | Effet côté Google | Effet côté application (proposé) |
|---|---|---|
| Compte **suspendu** | Jeton refusé (`invalid_grant`, motif déjà traduit) ; ses événements restent mais deviennent inaccessibles | Ses tâches ouvertes apparaissent « à réassigner » ; rien n'est effacé |
| Compte **supprimé** | Son agenda et ses événements **disparaissent**, sauf si l'administrateur transfère les données à la suppression | Idem. La tâche garde l'adresse et le nom d'origine (« ancien collaborateur »), dans l'esprit de l'historique inaltérable |
| Compte de l'application **désactivé** (`actif = false`) mais Google toujours actif | Rien ne change chez Google | Il ne figure plus dans la liste de choix ; ses tâches existantes restent visibles |

➡️ C'est l'argument fort du **montage 2** (agenda partagé « Gestion ») : rien ne disparaît au départ de quelqu'un.

---

## 5. L'existant à réutiliser

### 5.1 Notions proches, et pourquoi aucune n'est déjà « la tâche »

| Existant | Où | Proche par | Différent par |
|---|---|---|---|
| **Événements** (dossiers GES-AAAA-NNNNNN) | `gestion_evenement` : état à traiter / en cours / traité, catégorie, urgence | Rattachés à un bien, ont un état | Ce sont des **dossiers** (fuite, travaux…), pas des choses à faire à une date ; **aucune personne assignée** (seulement `ouvert_par` et `traite_par`) |
| **Étapes de la frise** | `gestion_monga_etape` : types `prise_rdv`, `rdv_intervention`, `rappel_devis`, `relance`, `expertise`… avec `survenu_le`, `heure_connue`, `heure_fin`, `jour_connu` | **Le plus proche** : des dates, avec ou sans heure, sur un événement d'un bien | Décrivent **ce qui s'est passé** (ou est convenu), toujours dans un événement ; aucune personne assignée ; en base, **1 seule étape future** sur toutes (une `prise_rdv`) |
| **Affectation** | `gestion_affectation` | Relie un mail à un événement ou à un bien | Ce n'est pas une affectation **à une personne** |
| **Tableau de bord des événements** | `TableauBordEvenements.tsx` (lot du 09/10) | Vue d'ensemble repliable en haut de l'écran | Compte des dossiers, pas des échéances personnelles |
| **Droits par tuile** | `admin_utilisateur.perm_gestion` / `perm_gestion_envoi` / `service_gestion` | Gate d'accès déjà en place | Pas de droit « tâches » : faut-il en créer un ? (choix n° 8) |
| **Journal append-only** | Journal de gestion (trigger anti-DELETE, **liste fermée d'entités**) | Traçabilité des gestes | Une nouvelle entité « tâche » demande une migration qui élargit la liste |
| **Démon de relève** | `com.sansvisavis.gestion-continu` | Déjà un passage périodique | Recevra la relève d'agenda au lot 3 |
| **Délégation Google + vérification du domaine** | `compteService.ts`, `driveDelegue.ts`, `jetonCollaborateur.ts` | Tout le mécanisme | Le `scope` est déjà un paramètre de `construireAssertion` : il faut un jeton par portée, avec un cache par couple (adresse, portée) |

**Lien avec la frise, à trancher (choix n° 7).** Une tâche « RDV plombier jeudi 10 h » sur un bien qui a un événement « fuite » ressemble beaucoup à une étape `rdv_intervention`. Deux voies :
- (a) la tâche est **indépendante** : simple, mais elle peut faire doublon avec la frise ;
- (b) la tâche peut **en option** se rattacher à un événement ouvert du bien, sans rien changer à la frise : conseillé pour le lot 1.

### 5.2 Où placer le bouton, sans rien déplacer ni retirer

- **En-tête de la fiche bien** : `Annuaire.tsx:1404-1420`, `<header className="ann-tete">`.
- À droite se trouve la zone **`.ann-tete-actions`**, qui ne contient aujourd'hui **que** « Dossier Drive ↗ », et seulement quand le bien a un dossier Drive.
- Le bouton « + Tâche » s'y ajoute **à côté**, même style (`svv-btn svv-btn-outline gst-btn`).
- Rien d'autre ne bouge : bande orange, cartouche « Événement en cours », syndic, Événements, Historique restent en place.
- La zone passe déjà à la ligne sur mobile (`flex-wrap`).
- Le cadre visuel (`ann-tete`) est **propre à la fiche bien**. La fiche propriétaire (`:918`) et la fiche syndic (`:1956`) ont leur propre en-tête : le bouton n'y apparaît **que si Arno le demande**.

---

## 6. Affichage à la connexion — proposition (sans code)

**Proposition, en trois touches discrètes, sans rien retirer :**

1. **Accueil admin, tuile Gestion** :
   - une petite pastille « 3 aujourd'hui » à côté des compteurs existants, uniquement s'il y a des tâches **pour moi** aujourd'hui ou en retard ;
   - un clic ouvre la liste.
   - Pas de fenêtre surgissante à la connexion : elle gêne tous les jours.
2. **Dans le module Gestion** : un écran « Mes tâches », avec deux onglets « À moi » / « Toute l'équipe ».
   - Il est classé en **En retard**, **Aujourd'hui**, **7 prochains jours**, **Plus tard**.
   - Chaque ligne mène à sa fiche bien.
3. **Sur la fiche bien** : un bloc **« Tâches à venir »**, posé comme le bloc « Événements », juste **au-dessus** de lui.
   - Il ne rend **rien** quand le bien n'a pas de tâche, ce qui garde l'empreinte de la fiche.
   - Les tâches passées et faites sont repliées.

---

## 7. Confidentialité

### 7.1 Ce qui part dans l'agenda

| Champ de l'événement | Proposition par défaut |
|---|---|
| **Titre** (le plus visible : écran verrouillé du téléphone, vue « semaine » d'un collègue) | **« Gestion — lot 315 — Visite »** (type de tâche + numéro de lot). **Jamais le nom du locataire** |
| **Lieu** | L'adresse du bien, **si Arno le décide** (choix n° 3). Utile pour l'itinéraire, mais plus révélateur |
| **Description** (visible seulement en ouvrant l'événement) | La note de la tâche, puis la mention « Créée depuis l'application Gestion ». Pas de lien vers l'application : il ne marche que sur le Mac d'Arno (`localhost`) |
| **Visibilité** | `private` par défaut : les collègues qui voient l'agenda ne voient que « Occupé » |
| **Invités** | Aucun par défaut (montage 1). Un invité extérieur reçoit un mail **et voit tout l'événement** |

### 7.2 Qui pourra le voir

- **La personne** dont c'est l'agenda.
- **Ses collègues**, selon le partage par défaut du Workspace. Il se règle dans admin.google.com → Applications → Google Workspace → Agenda → « Options de partage ».
  - Avec `visibility = private`, ils ne voient que « Occupé ».
- **Les assistants** (délégués d'agenda) de la personne, s'il y en a.
- **Les synchronisations** de la personne : son téléphone, une montre, Outlook…
- **Les invités**, pour la totalité de l'événement.

---

## 8. Mon avis

### 8.1 Découpage en lots, ordre conseillé

| Lot | Contenu | Pourquoi dans cet ordre |
|---|---|---|
| **1. Tâches dans l'application, sans Google** | Table des tâches (bien, date avec ou sans heure, titre, note, personne assignée, état à faire / faite / annulée, auteur, journal) ; bouton « + Tâche » en tête de fiche ; bloc « Tâches à venir » ; écran « Mes tâches » ; pastille d'accueil | Utile **seul** dès le premier jour ; aucun risque côté Google ; fixe le vocabulaire avant de l'envoyer à l'extérieur |
| **2. Envoi vers l'agenda** | Les trois gestes d'Arno (§2.2) ; jeton « agenda » par délégation ; créer / modifier / supprimer ; rendez-vous ou repère + rappel ; état « pas encore dans l'agenda » + nouvel essai ; commande de vérification **en lecture** | Dépend de la configuration Google, à faire une fois le lot 1 stabilisé |
| **3. Retour depuis l'agenda** | Relève périodique dans le démon (`syncToken`) ; date déplacée → tâche mise à jour ; événement supprimé → tâche signalée, **jamais effacée** | Demande un redémarrage du démon, à faire avec Arno |
| *(4. optionnel)* | Invités extérieurs (ADHOC, prestataires), avec avertissement « un mail va partir » | C'est le seul lot qui **envoie des mails** : à isoler |

### 8.2 Risques

- **Liste de portées écrasée** dans admin.google.com : le Drive tombe pour tout le monde (§2.2, piège n° 1). Il faut toujours coller les deux lignes et revérifier le Drive juste après.
- **Pouvoir de la délégation.** Ajouter l'agenda permet à l'application d'écrire dans l'agenda de **n'importe qui** dans l'organisation.
  - La garde existe déjà pour le Drive : *subject* lu côté serveur, domaine vérifié.
  - Il faudra **en plus** limiter la cible aux personnes de la liste choisie (choix n° 6), et ne jamais l'accepter du navigateur.
- **Essais réels.** Un événement de test dans le vrai agenda d'un collègue est visible et lui envoie des rappels.
  - Règle proposée, calquée sur celle du Drive : essais **uniquement dans l'agenda de `a.jorel@sansvisavis.com`**, titre commençant par « _TEST », et nettoyage par le geste normal de l'application.
- **Fuseau et journées entières.** Fin exclusive des journées entières, passage heure d'été / heure d'hiver.
  - On reprend la convention « date civile à midi Europe/Paris » déjà établie (mémoire LOT-1) pour toute date sans heure.
- **L'agenda est une copie.** Si quelqu'un efface l'événement dans Google, la tâche ne doit pas disparaître : on la **signale**.
- **Doublons avec la frise** : voir le choix n° 7.
- **Fonctionnement local.** Tout dépend du Mac allumé (démon). Une tâche créée au téléphone directement dans Google ne remonte pas : seules les tâches **créées par l'application** sont suivies.

### 8.3 Les VRAIS choix d'Arno

1. **Agenda de la personne, ou agenda commun « Gestion » ?**
   - *Dans l'agenda de la personne*, elle voit la tâche au milieu de ses rendez-vous, mais la tâche disparaît de Google si elle quitte l'entreprise.
   - *Dans un agenda commun*, tout le monde voit tout au même endroit et rien ne se perd au départ de quelqu'un, mais chacun doit afficher cet agenda en plus du sien.
2. **Qui peut poser une tâche dans l'agenda d'un collègue ?**
   - Tout le monde dans Gestion ?
   - Seulement les administrateurs ?
   - Ou chacun seulement pour soi ?
   - Si n'importe qui peut écrire dans l'agenda de n'importe qui, un oubli ou une erreur apparaît sur le téléphone d'un collègue.
3. **L'adresse du bien dans le « lieu » de l'événement ?**
   - Oui : on clique pour l'itinéraire, mais l'adresse se voit sur le téléphone.
   - Non : seulement « lot 315 », plus discret, et il faut ouvrir l'application pour savoir où aller.
   - (Le nom du locataire n'apparaît jamais, sauf demande expresse.)
4. **Que devient l'événement quand la tâche est faite ?**
   - Il reste tel quel (trace dans l'agenda).
   - Il reste avec « ✓ » devant le titre.
   - Ou il est retiré.
5. **Quelqu'un déplace le rendez-vous dans Google : l'application suit-elle ?**
   - Oui, automatiquement (lot 3) : la date de l'application change toute seule, sans votre geste.
   - Non : l'application garde sa date et signale « l'agenda dit autre chose ».
6. **Qui peut-on choisir dans la liste ?**
   - Seulement les personnes qui ont un compte dans l'application. Aujourd'hui, une seule personne active a l'accès Gestion : il faudra créer les comptes de l'équipe.
   - Ou une petite liste d'adresses tenue dans les réglages.
   - Lire tout l'annuaire Google est possible, mais demande une permission de plus. Je le déconseille.
7. **Une tâche peut-elle être reliée à un événement du bien (fuite, travaux…) ?**
   - Oui, en option : on la retrouve dans le dossier, mais il faut choisir l'événement à la création.
   - Non : plus simple, mais un « RDV plombier » peut exister deux fois, en tâche et dans la frise.
8. **Faut-il un droit séparé « Tâches » dans les comptes,** ou l'accès Gestion suffit-il ?
9. **Rappel par défaut :**
   - pour un repère d'une journée : la veille à 17 h ? le matin même à 9 h ?
   - pour un rendez-vous : 30 minutes avant ? 1 heure ?
   - Notification sur le téléphone seulement, ou aussi par mail ?
10. **Les personnes extérieures (ADHOC, artisans) :** les inviter depuis l'application ? Chaque invitation, modification ou annulation leur envoie un **vrai mail** de Google.
11. **Un ou deux Workspace ?** Vérification de 2 minutes dans admin.google.com → Domaines (§2.3). Elle décide si l'étape 2 se fait une fois ou deux.
