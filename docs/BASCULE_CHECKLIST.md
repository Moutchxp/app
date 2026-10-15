# Bascule Mac → serveur OVH — ce qui tourne seul, ce qui agit vers l'extérieur

> Inventaire en LECTURE SEULE du 14/10/2026 (code, LaunchAgents du Mac, réglages en base lus par SELECT). Rien n'a
> été lancé, envoyé, démarré ni arrêté. Complète `docs/RECON_PORTABILITE_SERVEUR.md` (variables, fichiers hors dépôt)
> et `docs/BASCULE_LIDAR.md` (copie de la base sans écraser le LiDAR). Les gabarits systemd sont dans `deploy/systemd/`.
>
> ⚠️ RÈGLE D'OR : **jamais le Mac et le serveur en même temps.** Deux relèves vident deux fois la file d'envoi Gmail,
> deux veilles envoient deux fois les relances aux mairies, deux synchros agenda se concurrencent. Le verrou de la veille
> ne protège que dans UNE base.

## 1. Inventaire

### 1.1 Automatismes (ce qui tourne seul)

Sur le Mac (MESURÉ) : 3 LaunchAgents installés dans `~/Library/LaunchAgents/`, identiques à `ops/` ; pas de crontab ;
rien dans `/Library/Launch*`. `next dev` et MinIO tournent À LA MAIN (pas de launchd). `instrumentation.ts` ne lance
aucune minuterie (avertissements d'URL seulement).

| Automatisme | Mac | Fréquence | Ce qu'il fait | Serveur (`deploy/systemd/`) |
|---|---|---|---|---|
| Relève continue Gestion | `com.sansvisavis.gestion-continu` (KeepAlive) → `app/scripts/relever-gestion-continu.ts` | boucle, `gestion_config.releve_continue_secondes` = **60 s** (lu en base) | ① vide la FILE D'ENVOI Gmail (`passeFileEnvoi`) ; ② relève IMAP en lecture de gestion@ + suite (lu/non lu, corbeille, étoiles, noms Drive) ; ③ range les documents | `svav-gestion-continu.service` — **fidèle** (Restart=always, TZ ajouté) |
| Veille | `com.sansvisavis.veille` → `npm run veille:run` | **15 min** | une passe `executerVeille` (33 étapes, §1.3) : relève des réponses de mairies, cascade partielle, alertes, propositions CADA, surveillance, Sitadel… | `svav-veille.service` + `.timer` — **fidèle** : PAS de rejeu d'une passe en échec, comme launchd (décision du 14/10/2026 ; la passe suivante du minuteur reprend) |
| Index des empreintes Drive | `com.sansvisavis.drive-empreintes` → `indexer-empreintes-drive.ts --changements --appliquer` | **15 min** | lecture `changes.list` du Drive (lecture seule), jeton de reprise en base | `svav-drive-empreintes.service` + `.timer` — fidèle (1re passe à +1 min) |
| Maintenance analytique | **aucune** (jamais planifiée sur le Mac) | — | compaction, partitions, purge de rétention | `svav-analytics-maintenance.*` (04 h 30, après la sauvegarde de 03 h 30) — installé par `installer.sh`, **à activer APRÈS la bascule** (décision du 14/10/2026) |
| Site | `next dev`, à la main | permanent | — | `svav-next.service` (`next start`, après `npm run build`) |
| Envoi « au clic » | dans Next (`lancerPasseEnFond`) | à chaque envoi | passe d'envoi lancée après la réponse | suit `svav-next` ; filet : la relève continue |
| Rattrapage agenda | dans Next, à l'ouverture de la liste des tâches | ≤ 1 fois / 2 min, SEULEMENT si quelqu'un l'ouvre | rejoue les tâches `a_envoyer` / `echec` vers Google Agenda | pas de démon (idem Mac) ; manuel : `npm run gestion:agenda:rattraper` |
| Minuteries du navigateur | onglets ouverts (Gestion 30 s, envois 5 s…) | — | lectures d'affichage | sans objet |

### 1.2 Réglages actifs en base (MESURÉ par SELECT le 14/10/2026)

`config_veille` : `alerte_active` **true** (vers `a.jorel@sansvisavis.com`, 8 h), `cascade_partiel_auto_active`
**true**, `proposition_cada_active` **true**, `attente_bati_alerte_active` **true**, `surveillance_active` **true**,
`auto_active` (Sitadel) **true** (24 h), `detection_active` **true**, `releve_active` **true**,
`teleservice_instruction_auto_active` **true**, `rattachement_suivi_auto_active` **true** ; ÉTEINTS :
`email_envoi_initial_auto_active`, `relance_auto_active`, `saisine_cada_auto_active`, `obstacle_disparu_alerte_active`,
`alerte_maj_active`, `dila/prada/sitadel/cadastre_auto_active`. `cada_email` vide (saisines par formulaire).
`gestion_tache_reglage` : `envoi_agenda` **true**, `envoi_mail_acceptation` **true**.
`gestion_config` : `adresse_gestion` = gestion@criterimmo.fr, domaines Google autorisés criterimmo.fr, sansvisavis.com.

### 1.3 Ce que fait une passe de veille (ordre du code, `executerVeille.ts:212-494`)

Verrou → relève des réponses (IMAP) → relève approfondie (1/jour) → diagnostics de vague → **cascade partielle
(ENVOI aux mairies)** → relance après réponse partielle (éteint) → brouillons de relance → **récap quotidien (mail)** →
brouillon de saisine → **proposition CADA (mail)** → **alertes GED / lien périmé / attente bâti / action (mails)** →
pré-cochage « répondu » (Envoyés, lecture) → capture des envoyés hors outil → **envoi auto relances/saisines (éteint)**
→ **1re demande auto (éteinte)** → détection de nouvelles éditions (HEAD/GET) → ingestions (éteintes) → rejeu du suivi
→ alertes mises à jour (éteinte) / obstacle disparu (éteinte) → **surveillance des polygones (mail)** → versement GED →
précalcul best-of → cœur Sitadel (DiDo, 24 h) → libération du verrou.

### 1.4 Effets extérieurs

**Mails — SMTP** (`app/lib/email/index.ts`, nodemailer) :

| Envoi | Compte / expéditeur | Déclencheur |
|---|---|---|
| 1re demande CRPA, relances, saisine CADA, cascade partielle, relance partielle | compte du PROFIL : `SMTP_*` (entreprise) ou `SMTP_PERSONNE_*` (personne) ; From/Reply-To = `config_demandeur.email_contact` | veille (selon interrupteurs §1.2), boutons Permis, CLI `--appliquer` |
| Demande de pièces / réponse libre à une mairie | compte du profil | boutons Permis (administrateur) |
| Récap quotidien, alertes (GED, lien périmé, action, attente bâti, surveillance, mises à jour, obstacle disparu, superstructures), compte rendu d'envoi auto, alerte de saisine, versement GED | compte par défaut `SMTP_*`, From `MAIL_FROM` → `config_veille.alerte_email` | veille, relève, CLI |
| Proposition de saisine CADA (lien `SITE_URL/cada/confirmer`) | compte par défaut | veille |
| Certificat à l'internaute (liens `SITE_URL/verifier`, `/desabonner`) | compte par défaut | route publique `api/certificat` |
| Réinitialisation du mot de passe internaute (`SITE_URL/espace/reinitialiser`) | compte par défaut | route publique |

**Mails — API Gmail de gestion@criterimmo.fr** (jeton `google-gestion.json`) : réponses / nouveaux messages /
transferts (bouton « Envoyer »), file d'envoi différée (relève continue), alerte d'échec d'envoi (vers gestion@, liens
`SVAV_URL_PUBLIQUE`), mail d'acceptation de tâche (liens `GESTION_URL_APPLICATION`, réglage actif).

**Google Agenda** (`agendaGoogle.ts`, compte de service + délégation de domaine, clé `drive-delegation.json`, portée
`calendar.events`) : crée / modifie / supprime un événement dans **l'agenda PRINCIPAL de la personne à qui la tâche est
confiée** (agenda = son identifiant), seulement pour un compte actif d'un domaine autorisé, tâche acceptée ou
auto-attribuée, `sendUpdates=none` (aucun mail Google). Ne touche QUE les événements marqués `svavApp=svav-gestion-tache`
(relu avant chaque modification ; appels journalisés dans `gestion_tache_agenda_appel`). Déclencheurs : création /
modification / acceptation de tâche, bouton « Réessayer », rattrapage à l'ouverture de la liste. **Aucun agenda de test
n'existe.**

**Google Drive** (même compte de service, portée `drive`, au nom du collaborateur connecté ou de gestion@) : ranger /
copier / déplacer / corbeille (jamais de suppression définitive) / créer un dossier / renommer (registre de
l'application) — boutons ; renommage d'alignement automatique (relève continue, ouverture d'un fil) ; CLI de
construction et de copie (simulation par défaut). « Documents clients scannés » (1 actifs / 2 vendus / 3 perdus)
INTERDIT par nom, en remontant les parents. Drive « Permis » : `GOOGLE_DRIVE_*`, lecture seule.

**API Gmail (hors envoi)** : lu/non lu à l'ouverture d'un fil (automatique), étiquettes, filtre « Bloquer », corbeille
(boutons), lectures de réconciliation (relève continue).

**Autres API** : Mistral (`MISTRAL_API_KEY`, boutons Permis), Gemini (`GEMINI_API_KEY`, analyse photo), DiDo / DILA /
PRADA / cadastre / BD TOPO (veille : détection ; ingestions éteintes), IGN (tuiles du certificat, WFS LiDAR), BAN
(géocodage), annuaire service-public (CLI). Aucun webhook.

## 2. Ordre de la bascule

### 2.0 Avant le jour J (serveur, sans rien allumer d'autre que svav-next et MinIO)

> **ÉTAT AU 14/10/2026 (déclaré par Arno, non vérifiable depuis le Mac) : sur le serveur, `SITE_URL`,
> `SVAV_URL_PUBLIQUE`, `GESTION_URL_APPLICATION`, `GOOGLE_DELEGATION_CLE_FICHIER` et le dédoublonnage de
> `SMTP_PERSONNE_*` sont DÉJÀ FAITS ; la clé Gmail est copiée dans `~/.config/sansvisavis/` (droits go-rwx).** À
> VÉRIFIER au premier démarrage du service, par `npm run smtp:verifier` (lancé sous l'utilisateur du service, depuis la
> racine du dépôt) et par le test 3.8 (aucun `localhost` dans les liens).

1. `.env` du serveur (copié par canal sûr, valeurs jamais dans le dépôt) — corrections OBLIGATOIRES (faites, cf. encadré) :
   - `SITE_URL` = l'adresse publique HTTPS définitive (aujourd'hui un tunnel trycloudflare : en production les
     certificats sont refusés, et les liens de réinitialisation seraient morts) ;
   - `SVAV_URL_PUBLIQUE` et `GESTION_URL_APPLICATION` = la même adresse publique (absentes aujourd'hui → liens
     `http://localhost:3000` dans les alertes Gestion, les tâches d'agenda et les liens Accepter / Refuser) ;
   - `GOOGLE_DELEGATION_CLE_FICHIER` = chemin du serveur de `drive-delegation.json` (aujourd'hui `/Users/…` → Drive et
     Agenda « non configurés » sans erreur visible) ;
   - `DATABASE_URL` avec l'utilisateur, `S3_ENDPOINT` = MinIO du serveur (`http://127.0.0.1:9000`) ;
   - dédoublonner `SMTP_PERSONNE_PORT / USER / PASS` (3 occurrences dans le `.env` du Mac).
2. Fichiers de clés chez l'utilisateur du service, droits 0600 : `~/.config/sansvisavis/google-gestion.json` (cherché
   sous le HOME de cet utilisateur) et `drive-delegation.json` (au chemin de `GOOGLE_DELEGATION_CLE_FICHIER`).
3. `timedatectl set-timezone Europe/Paris` ; NTP actif (jetons JWT Google).
4. `npm ci`, `npm run build` ; `deploy/systemd/installer.sh` (gabarits), sans `enable` des automatismes.
5. Golden sur le serveur (test d'acceptation de la portabilité) : `npm run test:integration -- app/lib/db/pipeline.itest.ts`.
6. Comptes d'envoi, SANS RIEN ENVOYER : `npm run smtp:verifier` (sous l'utilisateur du service, depuis la racine du
   dépôt). Pour chaque compte SMTP (défaut et « personne ») : connexion, STARTTLS / TLS, authentification, puis QUIT —
   ni MAIL FROM, ni RCPT, ni DATA ; puis lecture du profil Gmail de gestion@ et d'un événement à venir de l'agenda
   d'a.jorel@sansvisavis.com (lecture seule, date seulement). Tout doit être « OK » (code de sortie 0).

### 2.1 Jour J — arrêter le Mac

1. Prévenir l'équipe : ne plus rien envoyer depuis l'application du Mac.
2. Attendre la fin d'une passe de veille en cours (`select statut from veille_run order by demarre_le desc limit 1`
   ≠ `en_cours`).
3. Arrêter les 3 automatismes :
   ```bash
   launchctl bootout gui/$(id -u)/com.sansvisavis.veille
   launchctl bootout gui/$(id -u)/com.sansvisavis.drive-empreintes
   launchctl bootout gui/$(id -u)/com.sansvisavis.gestion-continu
   launchctl list | grep sansvisavis   # doit être vide
   ```
4. Vérifier que la FILE D'ENVOI Gmail est vide (aucun mail en attente qui partirait deux fois) :
   `select etat, count(*) from gestion_envoi_file group by etat;` — rien en attente / en cours.
5. Arrêter `next dev`. Garder MinIO du Mac allumé pour la copie, puis l'arrêter.

### 2.2 Copier

1. Base : `scripts/bascule-sans-lidar.sh exporter` (Mac) → copie → `essai` puis `restaurer` (serveur) — LiDAR du
   serveur intact (`docs/BASCULE_LIDAR.md` §3).
2. Stockage objet : `mc mirror` de `.minio/data` vers le MinIO du serveur.
3. Clés `~/.config/sansvisavis/*.json` si pas déjà fait (0600).

### 2.3 Allumer le serveur, un service à la fois, chacun vérifié (§3) avant le suivant

1. `svav-next` (déjà actif) : redémarrer après la copie.
2. `systemctl enable --now svav-gestion-continu` → test 3.1.
3. `systemctl enable --now svav-drive-empreintes.timer` → test 3.3.
4. `systemctl enable --now svav-veille.timer` → test 3.2 (⚠️ une passe envoie la cascade partielle aux mairies et les
   alertes, comme le faisait le Mac : c'est le fonctionnement normal, pas un essai).
5. `svav-analytics-maintenance.timer` : APRÈS la bascule (décision du 14/10/2026), test 3.15.
6. Basculer l'adresse publique (DNS / tunnel) vers le serveur.

## 3. Tests après bascule (aucun effet sur un vrai client)

| # | Quoi | Test concret | Attendu |
|---|---|---|---|
| 3.1 | Relève continue Gestion | `journalctl -u svav-gestion-continu -n 50` ; `select resultat, termine_le from gestion_releve_run order by id desc limit 3` | une passe toutes les ~60 s, en succès ; aucun « non autorisé » Gmail |
| 3.2 | Veille | `journalctl -u svav-veille -n 100` ; `select statut, fini_le from veille_run order by demarre_le desc limit 1` ; `select resultat from releve_run order by id desc limit 1` | passe en succès ; relève des mairies `ok` |
| 3.3 | Empreintes Drive | `journalctl -u svav-drive-empreintes -n 30` | une passe incrémentale terminée, sans erreur de clé |
| 3.0 | Tous les comptes d'envoi, sans rien envoyer | `npm run smtp:verifier` | « OK » pour : SMTP défaut, SMTP « personne », API Gmail de gestion@, Agenda par délégation, Drive par délégation (racine « Base de données locative » et ses enfants directs, §5) ; code de sortie 0 |
| 3.4 | Mail SMTP compte par défaut (envoi réel) | `npm run alertes:envoyer` (simulation, affiche le mail) puis `npm run alertes:envoyer -- --appliquer` | reçu par **a.jorel@sansvisavis.com** (adresse d'alerte en base), et par lui seul |
| 3.5 | Mail SMTP des profils (mairies) | `npm run smtp:verifier` (connexion + authentification, AUCUN envoi) — aucun envoi réel de test : ces comptes n'écrivent qu'aux mairies | « OK » pour les deux comptes SMTP |
| 3.6 | Gmail gestion@ (envoi) | Gestion → « Nouveau message » adressé **uniquement** à a.jorel@sansvisavis.com, objet « _TEST bascule » | reçu ; apparaît dans les Envoyés de gestion@ ; relevé par la relève suivante |
| 3.7 | Gmail (lu / étiquettes) | ouvrir le fil « _TEST bascule » ; poser puis retirer une étoile | état visible dans Gmail |
| 3.8 | Liens publics | dans le mail 3.6 / une alerte : aucun `localhost` ; `SITE_URL`, `SVAV_URL_PUBLIQUE`, `GESTION_URL_APPLICATION` = adresse publique | liens cliquables depuis un téléphone |
| 3.9 | Google Agenda | d'abord `npm run smtp:verifier` (lecture d'un événement de l'agenda d'Arno) ; puis une tâche « _TEST bascule » **attribuée à Arno lui-même** (auto-attribuée : pas de mail d'acceptation), échéance demain | un événement marqué apparaît dans l'agenda d'Arno ; ANNULER la tâche → l'événement est retiré (`agendaSynchro.ts:30`) ; `gestion_tache_agenda_appel` journalise les 2 appels |
| 3.10 | Mail d'acceptation de tâche | tâche « _TEST » attribuée à un compte de test d'un domaine autorisé, ou à un collaborateur prévenu | mail reçu, liens Accepter / Refuser vers l'adresse publique ; annuler la tâche ensuite |
| 3.11 | Drive (écriture) | « Ranger » une pièce d'un mail « _TEST » envoyé à a.jorel@sansvisavis.com dans un dossier de test sous « Base de données locative », puis la mettre à la corbeille par l'application | fichier créé puis à la corbeille ; **jamais une vraie pièce, jamais « Documents clients scannés »** (CLAUDE.md) |
| 3.12 | Certificat (internaute) | `node .claude/skills/run-svav-app/driver.mjs smoke` (ré-émission idempotente, `deja:true`) et `render` | HTTP 200, aucun mail, PDF rendu |
| 3.13 | Réinitialisation internaute | demander une réinitialisation pour un compte internaute de test **a.jorel@sansvisavis.com** | mail reçu, lien vers `SITE_URL` public |
| 3.14 | Mistral / IGN / BAN / DiDo | un bouton d'analyse Permis sur un dossier de test ; carte d'un certificat ; saisie d'adresse ; détection DiDo dans le journal de veille | réponses reçues, aucune clé manquante |
| 3.15 | Maintenance analytique | APRÈS la bascule : `sudo systemctl enable --now svav-analytics-maintenance.timer` ; essai immédiat : `sudo systemctl start svav-analytics-maintenance` puis `journalctl -u svav-analytics-maintenance` | passe terminée ; minuteur à 04 h 30 dans `systemctl list-timers` |
| 3.16 | Mac éteint pour de bon | `launchctl list \| grep sansvisavis` vide ; aucune nouvelle ligne `gestion_releve_run` côté Mac | — |

## 4. Ce qui manque aujourd'hui côté serveur

| Manque | Effet si oublié |
|---|---|
| ~~`SITE_URL` public HTTPS~~ | **fait le 14/10/2026** (Arno) — à vérifier : test 3.8 |
| ~~`SVAV_URL_PUBLIQUE`, `GESTION_URL_APPLICATION`~~ | **fait le 14/10/2026** — à vérifier : test 3.8 |
| ~~`GOOGLE_DELEGATION_CLE_FICHIER` au chemin du serveur~~ | **fait le 14/10/2026** — à vérifier : `npm run smtp:verifier` (Agenda « OK ») |
| ~~`google-gestion.json` sous `~/.config/sansvisavis/` de l'utilisateur du service~~ | **copié le 14/10/2026 (droits go-rwx)** — à vérifier au premier démarrage : `npm run smtp:verifier` (Gmail « OK ») et `journalctl -u svav-gestion-continu` (aucun « non autorisé ») |
| ~~`SMTP_PERSONNE_*` dédoublonné~~ | **fait le 14/10/2026** — à vérifier : `npm run smtp:verifier` (SMTP « personne » « OK ») |
| `DATABASE_URL` avec utilisateur, `S3_ENDPOINT` du serveur | rien ne démarre / pièces introuvables |
| Consentement OAuth sans écran (`127.0.0.1:<port>`) | ré-autoriser = `ssh -L` ou autoriser sur le Mac puis copier le jeton |
| ~~Outil de vérification SMTP sans envoi~~ | **fait** : `npm run smtp:verifier` (`scripts/verifier-smtp.ts`) |
| Agenda de test | le test 3.9 passe par l'agenda d'Arno |
| ~~Décision : `svav-analytics-maintenance`~~ | **décidé le 14/10/2026 : activée APRÈS la bascule**, chaque nuit à 04 h 30 (après la sauvegarde de 03 h 30) |
| ~~Décision : rejeu de la veille~~ | **décidé le 14/10/2026 : PAS de rejeu** (`Restart=` retiré de `svav-veille.service.in`) ; la passe suivante du minuteur reprend |
| Outils d'ingestion (`ogr2ogr`, `7z`, `curl`, `bzip2`) | seulement si une ingestion automatique est rallumée (toutes éteintes aujourd'hui) |
| Docs à mettre à jour : `ops/README.md:114-118` (passes « planifie »), en-tête de `veille-run.ts:13` (« aucun envoi » : faux) | confusion à l'exploitation |

## 5. Drive : comment l'application y accède, et ce qui marchera sur le serveur

> Recon en lecture seule du 14/10/2026 (code du dépôt et noms des variables du `.env` ; aucun appel réseau, aucun
> accès au Drive ni aux dossiers synchronisés du Mac).

### 5.1 Carte des accès

**(A) API Google Drive par la clé de délégation** — TOUS les accès de l'application. Compte de service
(`drive-delegation.json`, `GOOGLE_DELEGATION_CLE_FICHIER`), portée `drive`, au nom du collaborateur connecté
(`jetonCollaborateur.ts`) ou de gestion@ pour les passes de fond (`driveDelegue.ts:jetonPourSubject`).

| Usage | Code | Déclencheur | Lecture / écriture |
|---|---|---|---|
| Fenêtre Drive de la Gestion : naviguer, lister, aperçu, localiser | routes `api/admin/gestion/drive/{fichiers,dossiers,dossier-du-bien,apercu,localiser}`, `drive.ts` (`files.list`) | à chaque ouverture / clic | lecture, **en direct** |
| Ranger / copier une pièce | `depotDriveReel.ts`, `drive.ts` (téléversement), `driveMouvement.ts` (copie) | bouton | écriture |
| Déplacer | `driveMouvement.ts` (`addParents` / `removeParents`), route `drive/deplacer` | bouton | écriture |
| Corbeille (jamais de suppression définitive) | `driveCorbeilleReel.ts`, route `drive/corbeille` | bouton | écriture |
| Créer un dossier | `driveCreation.ts`, route `drive/dossier` | bouton | écriture |
| Renommer (registre de l'application seulement) | `renommageDrive.ts`, `renommagePieceReel.ts` | bouton ; **alignement automatique** quand un nom a changé dans Drive : ouverture d'un fil (`fils/[id]/messages/route.ts:73`, `relireNomsDesPieces`) et relève continue (`suiteReleveReel.ts`) | écriture |
| Lire le contenu d'une copie (pièce vidée de MinIO) | `pieceDriveLecture.ts`, `driveLectureFichier.ts` | ouverture d'une pièce | lecture |
| Index des empreintes | `app/scripts/indexer-empreintes-drive.ts --changements --appliquer` (`changes.list`), puis correction des emplacements fantômes (`fantomesEmplacements.ts`) | **toutes les 15 min** (launchd → `svav-drive-empreintes.timer`) | lecture du Drive, écriture en base |
| Arbre, copies en masse, vidage | `driveEcriture.ts`, `copiePiecesReel.ts`, CLI `gestion:drive:*` | CLI, simulation par défaut | écriture sous « Base de données locative » seulement (`driveGardeFou.ts`) |
| Drive « Permis » | `permis/drive.ts` (`GOOGLE_DRIVE_*`, `drive.readonly`) | veille | lecture |

**(B) Fichiers locaux d'un dossier synchronisé par l'application Google Drive du Mac** — **AUCUN.** Recherche dans
`app/`, `scripts/`, `ops/`, `deploy/` : aucun chemin `~/Library/CloudStorage/GoogleDrive-…`, `/Users/…/Google Drive`,
« Mon Drive » ou « Drive partagés » sur le disque (ces mots n'apparaissent que comme LIBELLÉS d'écran de la fenêtre
Drive) ; aucun `fs.watch`, `watchFile`, `chokidar`, aucune dépendance de ce type ; aucune variable du `.env` ne pointe
vers un dossier synchronisé. Les seuls dossiers locaux lus ou écrits par des scripts sont le Bureau (rapports),
Téléchargements (import de l'annuaire, à la main) et `data/sitadel` — rien qui touche au Drive.

### 5.2 D'où vient la « synchronisation dans les deux sens »

Ce n'est PAS le client Google Drive du Mac : l'application ne lit ni n'écrit aucun fichier local. C'est l'API.

- **Application → Drive : immédiat.** Ranger, copier, déplacer, mettre à la corbeille, créer un dossier, renommer :
  chaque geste est un appel API, visible dans Google Drive à l'instant (le client Drive du Mac ne fait que l'AFFICHER
  à Arno sur son poste).
- **Drive → application : à l'ouverture.** La fenêtre Drive lit le Drive EN DIRECT (`files.list`) à chaque ouverture
  et à chaque clic : un document déposé, déplacé, renommé ou mis à la corbeille dans Drive apparaît tel quel dès
  qu'on ouvre ou rafraîchit la fenêtre. Latence : aucune.
- **Les déplacements de dossiers « suivent »** parce que l'application désigne dossiers et fichiers par leur
  IDENTIFIANT Drive (ex. le dossier d'un bien, `drive_dossier_id`), qui ne change pas quand on les déplace ; les
  chemins affichés sont relus en direct.
- **L'index des empreintes** (`changes.list`, toutes les 15 min) tient à jour nom, parent et empreinte de chaque fichier
  (ajout, corbeille, déplacement, renommage). Il sert à « cette pièce est déjà dans le Drive », à la loupe « Localiser »
  et à la correction des emplacements fantômes. Latence : 15 min au plus.
- **Les renommages faits dans Drive** sur des copies créées par l'application sont relus à l'ouverture d'un fil et
  alignés pendant la relève continue (60 s).
- Aucun webhook (`changes.watch`) : rien n'est poussé par Google.

### 5.3 Conclusion pour le serveur

Tout passe par (A) : **aucun client Google Drive n'est nécessaire sur Linux, ni rclone.** Le même comportement est
obtenu dès que :
1. la clé de délégation est lisible par l'utilisateur du service (`GOOGLE_DELEGATION_CLE_FICHIER` → fait le
   14/10/2026, à vérifier par `npm run smtp:verifier`, ligne Drive) ;
2. l'horloge est juste (NTP : le jeton est un JWT signé) ;
3. `svav-drive-empreintes.timer` est activé (sans lui, la fenêtre en direct marche, mais « déjà dans le Drive », la
   localisation et les fantômes se figent) ;
4. `svav-gestion-continu` tourne (alignement des renommages).

Ce qui manque : rien côté code. La délégation de domaine (portées `drive` et `calendar.events`) est déjà déclarée
dans la console Google Workspace (13/10/2026, `agendaDelegue.ts`).

### 5.4 Vérification sans risque (lecture seule)

`npm run smtp:verifier` lit en base l'identifiant de la racine « Base de données locative » (`gestion_drive_arbre`),
puis, au nom de gestion@ : ses MÉTADONNÉES (id, nom) et le NOMBRE de ses enfants directs (identifiants seulement).
Aucune lecture de contenu, aucune écriture, aucun autre dossier : toute autre requête est refusée avant de partir
(`fetchDriveLectureSeule`). 🔴 Un dossier nommé « Documents clients scannés », « 1 actifs », « 2 vendus » ou
« 3 perdus » est REFUSÉ par garde-fou codé (`estNomProtege`), avant tout appel et à la lecture des métadonnées.

### 5.5 Tests de bascule — UNIQUEMENT dans un dossier de test créé à la main par Arno

> 🔴 Jamais ailleurs, et jamais dans « Documents clients scannés » (GESTION LOCATIVE › 1 actifs / 2 vendus / 3 perdus).
> Pièces : uniquement celles d'un mail « _TEST » envoyé à a.jorel@sansvisavis.com (CLAUDE.md).

Préparation (Arno, dans Google Drive sur le web) : créer sous « Base de données locative » un dossier
« _TEST bascule », avec deux sous-dossiers « A » et « B ».

| # | Geste | Attendu |
|---|---|---|
| 5.5.1 | `npm run smtp:verifier` | ligne Drive « OK » (racine accessible, N enfants directs) |
| 5.5.2 | **Ajout Drive → appli** : Arno dépose un fichier « _TEST ajout.pdf » dans « A » (Drive web) ; puis la fenêtre Drive de l'appli, dossier « _TEST bascule › A » | le fichier apparaît dès l'ouverture |
| 5.5.3 | **Ajout appli → Drive** : « Ranger » une pièce du mail « _TEST » dans « A » | le fichier apparaît aussitôt dans Drive web |
| 5.5.4 | **Déplacement** : Arno déplace « A » dans « B » (Drive web) ; rouvrir la fenêtre ; puis, 15 min plus tard, la loupe « Localiser » de la pièce rangée en 5.5.3 | « A » apparaît sous « B » à l'ouverture ; la loupe montre le nouveau chemin après la passe d'index |
| 5.5.5 | **Renommage** : Arno renomme la copie rangée en 5.5.3 (Drive web) ; rouvrir le fil du mail « _TEST » | le nouveau nom est repris |
| 5.5.6 | **Suppression** : mettre « _TEST ajout.pdf » à la corbeille PAR L'APPLICATION | le fichier est dans la corbeille de Drive (jamais supprimé définitivement) ; disparu de la fenêtre |
| 5.5.7 | Nettoyage | Arno met « _TEST bascule » à la corbeille dans Drive web |

## 6. Surveillance du serveur — être prévenu par mail

> Lot du 14/10/2026. Destinataire unique : a.jorel@sansvisavis.com, par le compte SMTP par défaut (`SMTP_*` +
> `MAIL_FROM`). La surveillance **observe et prévient** : elle ne redémarre rien, ne corrige rien, n'écrit jamais en
> base (connexion en lecture seule). Code : `app/lib/ops/surveillance.ts` (logique, testée), `surveillanceSysteme.ts`
> (sondes), `scripts/surveillance.ts` (`npm run surveillance`).

### 6.1 Ce qui est contrôlé, toutes les 5 minutes (`svav-surveillance.timer`)

| Contrôle | Alerte si |
|---|---|
| `svav-next`, `svav-minio`, `caddy`, `postgresql` | pas actif (ou introuvable) |
| Automatismes `svav-gestion-continu`, `svav-veille.timer`, `svav-drive-empreintes.timer`, `svav-analytics-maintenance.timer` | **seulement s'ils sont installés ET activés** : pas actif. Non installé ou non activé = « non concerné », jamais une alerte |
| Toute unité `svav-*` | en échec (`systemctl --failed`) |
| Site (`SURVEILLANCE_URL`, défaut `https://authentification.sansvisavis.com/`) | pas de 200, ou 10 s et plus |
| Certificat https du site | invalide, ou 20 jours restants ou moins (`SURVEILLANCE_CERT_JOURS`) : **un mail par jour** (`SURVEILLANCE_CERT_RAPPEL_JOURS`, défaut 1) avec le décompte du jour, ex. « [SVAV serveur] ⚠ Certificat https : coupure dans 17 jours (le 31/01/2027) » ; « ✅ Résolu : Certificat https renouvelé » quand il redépasse 20 jours |
| Dernière sauvegarde locale (`/home/ubuntu/sauvegardes/*/TERMINEE`, date du fichier) | 26 h et plus, ou aucune |
| Espace OVH (`/mnt/svav-ovh`) | non monté |
| Dernier `svav-*.tar.zst.age` de l'espace OVH (racine et un niveau en dessous) | 26 h et plus, ou aucun |
| Disque `/`, espace OVH | plus de 85 % occupés |
| PostgreSQL | ne répond pas |
| Relève Gestion (si `svav-gestion-continu` est activé) | aucune passe `ok` dans `gestion_releve_run` depuis 10 min |

Et à **l'échec de toute unité `svav-*`** (`OnFailure=svav-alerte@%n.service`, posé dans les gabarits de ce dépôt) : un
mail immédiat avec les 30 dernières lignes de son journal. `svav-minio` n'est pas un gabarit de ce dépôt : il est
surveillé par le contrôle toutes les 5 minutes ; pour l'alerte immédiate, ajouter la même ligne par
`sudo systemctl edit svav-minio` (section `[Unit]`).

### 6.2 Quand part un mail

- **Apparition** d'un problème → un mail « [SVAV serveur] ⚠ … » ; **rappel** toutes les 6 h tant qu'il dure (certificat https : un par jour, décompte recalculé) ;
  **disparition** → « [SVAV serveur] ✅ Résolu : … ». Les événements d'une même passe partent dans UN seul mail.
- **Échec d'une unité** → mail immédiat, puis au plus un par 6 h pour la même unité ; le « résolu » part quand elle n'est
  plus en échec (pour un minuteur : à la passe réussie suivante).
- **Récapitulatif quotidien** à 8 h (« tout va bien » ou la liste des problèmes en cours).
- **Envoi raté** → écrit dans le journal (`journalctl -u svav-surveillance`), aucun nouvel essai pendant 30 min, jamais de
  mail sur l'échec d'un mail.
- État : `/var/lib/svav-surveillance/etat.json` (le supprimer = repartir de zéro : les problèmes en cours seront
  re-signalés une fois).

Réglages facultatifs dans `.env` : `SURVEILLANCE_DESTINATAIRE`, `SURVEILLANCE_URL`, `SURVEILLANCE_SAUVEGARDES_LOCALES`,
`SURVEILLANCE_OVH`, `SURVEILLANCE_RECAP` (`non` pour couper le récapitulatif), `SURVEILLANCE_RECAP_HEURE` (défaut 8),
`SURVEILLANCE_ETAT`, `SURVEILLANCE_CERT_JOURS` (défaut 20), `SURVEILLANCE_CERT_RAPPEL_JOURS` (défaut 1).

Les deux services tournent en **root** (sauvegardes sous `/home/ubuntu`, journal de toutes les unités), avec un système
de fichiers en lecture seule sauf `/var/lib/svav-surveillance`. **`DATABASE_URL` doit donc nommer son utilisateur
PostgreSQL** (sinon PostgreSQL essaierait le rôle « root » et la surveillance signalerait « PostgreSQL ne répond pas »).

### 6.3 Installer

```sh
cd /srv/sansvisavis/app            # APP_DIR de svav.conf
git pull                           # récupérer le lot (ou la méthode de mise à jour habituelle)
cd deploy/systemd && sudo ./installer.sh && cd ../..
sudo npm run surveillance -- --essai          # contrôles + mails qui partiraient, RIEN n'est envoyé
sudo systemctl enable --now svav-surveillance.timer
systemctl list-timers svav-surveillance.timer
```

`installer.sh` réinstalle aussi les gabarits existants, désormais porteurs de `OnFailure=` : rien n'est activé ni
redémarré par lui ; la ligne prend effet au prochain démarrage de chaque unité (`daemon-reload` suffit pour les
minuteurs).

### 6.4 Tester sans risque

| # | Geste | Attendu |
|---|---|---|
| 6.4.1 | `sudo npm run surveillance -- --essai` | tous les contrôles « OK » ou « — » (non concerné) ; « Aucun mail ne partirait » (ou le seul récapitulatif s'il est plus de 8 h et qu'il n'est pas encore parti) |
| 6.4.2 | `sudo systemctl start svav-surveillance` puis `journalctl -u svav-surveillance -n 20` | « N contrôles, 0 problème(s) » ; le récapitulatif du jour arrive s'il est plus de 8 h |
| 6.4.3 | **Provoquer une alerte** : `sudo systemctl stop svav-minio`, puis `sudo systemctl start svav-surveillance` | mail « [SVAV serveur] ⚠ Service svav-minio arrêté (inactive) » |
| 6.4.4 | `sudo systemctl start svav-minio`, puis `sudo systemctl start svav-surveillance` | mail « [SVAV serveur] ✅ Résolu : Service svav-minio arrêté (inactive) » |
| 6.4.5 | Alerte d'échec : `sudo systemctl start svav-alerte@essai-manuel.service` | mail « ⚠ Échec de essai-manuel.service » avec un journal « -- No entries -- » ; puis 5 min plus tard « ✅ Résolu » (l'unité n'existe pas, donc n'est pas en échec) |
| 6.4.6 | Envoi impossible (facultatif) : lire `journalctl -u svav-surveillance` après une coupure SMTP | une ligne « ÉCHEC D'ENVOI (prochain essai dans 30 min) », pas de boucle |

Arrêter MinIO quelques secondes n'a pas d'effet durable : seules les pièces demandées pendant ce temps échouent.

## 7. Si je ne peux plus me connecter

Depuis le 15/10/2026 (décision d'Arno, audit `docs/AUDIT_COMPTES_COLLABORATEURS.md`, point A), **la page de connexion
n'a plus de voie de secours** : l'ancienne astuce « identifiant vide + mot de passe partagé » est refusée comme n'importe
quel échec. La seule corde de rappel est une commande **sur le serveur**, qui réactive un compte nommé existant, le
repasse administrateur avec tous les droits, et lui donne un nouveau mot de passe. Elle n'utilise aucune page web : elle
écrit directement en base, et marche même si l'admin est inaccessible.

```sh
ssh <compte>@<serveur>                       # connexion au serveur
cd /srv/sansvisavis/app                      # APP_DIR de svav.conf
npm run admin:secours -- --identifiant a.jorel@sansvisavis.com
#   → en production : taper « oui » pour confirmer
#   → saisir DEUX FOIS le nouveau mot de passe (frappe masquée, rien ne s'affiche, ≥ 12 caractères conseillé)
#   → « ✓ Secours : a.jorel@sansvisavis.com → administrateur actif, toutes permissions, mot de passe réinitialisé. »
```

Puis se connecter normalement sur `https://authentification.sansvisavis.com/admin/login` avec cette adresse et ce
nouveau mot de passe.

| Situation | Ce qui se passe |
|---|---|
| Mot de passe oublié | la commande le remplace ; les sessions ouvertes ailleurs avec l'ancien mot de passe sont coupées |
| Compte désactivé (même administrateur) | la commande le réactive |
| Trop d'essais (« Trop de tentatives ») | attendre le délai affiché (5 min au plus) — ou la commande, qui ne dépend pas de ce compteur |
| Identifiant inconnu | refusé : la commande ne crée pas de compte (`npm run admin:creer` pour cela) |

Pour lister les comptes et voir lesquels sont actifs : `npm run admin:lister`. Pour désactiver ou réactiver un compte,
administrateur compris (l'écran ne le permet pas pour un administrateur) : `npm run admin:desactiver -- --identifiant …`
/ `npm run admin:reactiver -- --identifiant …` — il faut retaper l'adresse du compte pour confirmer ; le dernier
administrateur actif ne peut pas être désactivé ; le geste est journalisé et les sessions du compte désactivé sont coupées.

La variable `ADMIN_PASSWORD_ARGON2_B64` du `.env` ne sert plus à rien ; elle peut rester ou être retirée, sans effet.

**Limite d'essais par adresse IP** (audit point 3) : elle ne s'applique que si le `.env` du serveur déclare l'en-tête
d'adresse posé par le frontal, `CADENCE_ENTETE_IP=x-forwarded-for` derrière Caddy (Caddy remplace cet en-tête par
l'adresse réelle du visiteur tant qu'aucun `trusted_proxies` n'est configuré — à vérifier sur la version installée).
Sans cette ligne, seule la limite par compte s'applique. L'adresse n'est jamais conservée en clair (empreinte HMAC).

