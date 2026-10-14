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
| 3.0 | Tous les comptes d'envoi, sans rien envoyer | `npm run smtp:verifier` | « OK » pour : SMTP défaut, SMTP « personne », API Gmail de gestion@, Agenda par délégation ; code de sortie 0 |
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
