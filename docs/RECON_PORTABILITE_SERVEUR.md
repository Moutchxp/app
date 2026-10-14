# RECON PORTABILITÉ — Mac (macOS) → serveur Linux OVH 24 h/24

> Lot de reconnaissance, **lecture seule**, du 14/10/2026. Aucun fichier existant modifié, aucune écriture en base
> (SELECT uniquement), aucun correctif. Les sorties brutes des commandes (build, tsc, vitest JSON UTC/Paris) et le
> script de casse sont dans `.captures/recon-portabilite/` (gitignoré, non committé).
>
> Étiquettes : **PROUVÉ** = vu dans le code (`fichier:ligne`) ou mesuré par une commande exécutée pendant ce lot ;
> **SUPPOSÉ** = déduit, non vérifié jusqu'au bout. Une hypothèse n'est jamais donnée comme une cause.

## Synthèse — les 12 points qui cassent ou changent vraiment

| # | Point | Effet sur Linux | Étiquette |
|---|---|---|---|
| 1 | **Fuseau du processus** : ~22 calculs en heure locale (fenêtres d'envoi, alerte quotidienne, fenêtre nocturne, numéros annuels) | En TZ=UTC, décalage de 1–2 h ; **2 fichiers de test virent au ROUGE** (mesuré) | PROUVÉ |
| 2 | **Fuseau de la session PostgreSQL** (`CURRENT_DATE`, `date_trunc(now())`, `::date`) — le pool ne fixe rien | Si le PG du serveur est en UTC : plafonds quotidien/mensuel, « une alerte par jour », périodes de location basculent à 02 h Paris | PROUVÉ (code) / effet SUPPOSÉ |
| 3 | **3 tâches de fond launchd** (veille, relève gestion continue, index Drive) écrites pour ce Mac | À réécrire en services + timers systemd | PROUVÉ |
| 4 | **`tsx` et `dotenv` sont en devDependencies** mais indispensables aux tâches de fond et à tous les CLI | Un `npm ci --omit=dev` casse toutes les tâches de fond | PROUVÉ |
| 5 | **`node_modules` contient des binaires darwin-arm64** (sharp, SWC, lightningcss, oxide) | Ne JAMAIS copier `node_modules` : `npm ci` sur le serveur | PROUVÉ |
| 6 | **Binaires système** appelés par des routes de prod : `pdftoppm`, `pdfinfo`, `pdfseparate`, `pdfunite` ; par la veille : `tar -j`, `npm`, `curl`, `ogr2ogr` | Paquets `poppler-utils`, `bzip2`, `gdal-bin`, `curl` (+ `7zip` pour `bdtopo:import`) | PROUVÉ |
| 7 | **`GESTION_URL_APPLICATION` et `SVAV_URL_PUBLIQUE` absentes du `.env`** → repli `http://localhost:3000` | Liens agenda Google, Accepter/Refuser et alertes d'envoi pointent vers localhost (déjà le cas aujourd'hui) | PROUVÉ |
| 8 | **Fichiers hors dépôt** : `.env`, `~/.config/sansvisavis/google-gestion.json`, `~/.config/sansvisavis/drive-delegation.json` | Sans eux : pas de Gmail gestion@, pas de Drive délégué ni d'Agenda | PROUVÉ |
| 9 | **Cookies `secure` en production** (`NODE_ENV=production`) + `siteUrlCertificat()` refuse tout `SITE_URL` non https public | TLS obligatoire devant `next start`, sinon plus de connexion admin/internaute | PROUVÉ (code) / navigateur SUPPOSÉ |
| 10 | **MinIO** : `.minio/minio` est un binaire Mach-O arm64 | Binaire Linux à installer (ou S3 OVH) ; `S3_ENDPOINT` est `http://` local | PROUVÉ |
| 11 | **Utilisateur PostgreSQL implicite** : `DATABASE_URL` sans utilisateur, les plists posent `USER/LOGNAME` | Sur Linux : rôle PG du nom de l'utilisateur du service, ou utilisateur dans l'URL | PROUVÉ |
| 12 | **Dossier de travail** : polices/logos PDF lus via `process.cwd()` ; pas de `output: 'standalone'` | Lancer `next start` et les tâches **depuis la racine du dépôt** | PROUVÉ |

Ce qui **ne casse pas** (mesuré) : casse des imports (0 divergence), `npm run build` (vert), `npx tsc --noEmit` (vert),
golden (11/11 verts), aucune commande macOS-only exécutée par le code.

---

## 1. Variables d'environnement

Chargement : `app/lib/db/client.ts:23` (`import "dotenv/config"`, relatif au **cwd**) ; CLI : `app/lib/chargerEnv.ts:15-16`
(chemin **absolu** `<racine>/.env`, n'écrase pas une variable déjà posée). Aucune variable `NEXT_PUBLIC_*` → rien n'est
figé dans le bundle navigateur au build (PROUVÉ). Valeurs du `.env` **non lues** : seuls les noms et un indicateur
« locale-only » (contient `localhost`, `127.0.0.1`, `/Users/` ou une IP privée) ont été calculés par script.

| Variable | Lue (1re occurrence) | Dans `.env` | Locale-only | Rôle | Ce qui casse / à faire |
|---|---|---|---|---|---|
| `DATABASE_URL` | `app/lib/db/client.ts:25` | oui | **OUI** | Connexion PostgreSQL | Pointer le PG du serveur ; ajouter l'utilisateur dans l'URL (cf. §8) |
| `ANALYSE_STATEMENT_TIMEOUT_MS` / `_CONNECT_TIMEOUT_MS` / `ANALYSE_POOL_MAX` | `app/lib/db/plafondAnalyse.ts:56,64,68` | non | — | Pool public de l'analyse | Défauts 15000 / 10000 / 10 |
| `ANALYTICS_POOL_MAX`, `_CONNECT_`, `_STATEMENT_`, `_IDLE_`, `_IDLE_IN_TX_`, `_ECRITURE_TIMEOUT_MS` | `app/lib/analytics/config.ts:37-68` | non | — | Pool analytique | Défauts en dur |
| `ADMIN_SESSION_SECRET` | `app/lib/admin/session.ts:66` | oui | non | Clé cookie admin | Obligatoire (exception sinon) |
| `ADMIN_PASSWORD` | `app/lib/admin/password.ts:16` | oui | non | Mot de passe admin (ancien) | — |
| `ADMIN_PASSWORD_ARGON2_B64` | `app/(admin)/api/admin/session/route.ts:48` | oui | non | Voie de secours argon2 | — |
| `INTERNAUTE_SESSION_SECRET` | `app/lib/internaute/authSession.ts:39` | oui | non | Cookie internaute | Obligatoire |
| `INTERNAUTE_TOKEN_SECRET` | `app/lib/internaute/jetonCada.ts:27` | oui | non | Jetons CADA / rectification | Obligatoire |
| `SESSION_INTERNAUTE_TTL` | `app/lib/internaute/authSession.ts:21` | non | — | Durée session | Défaut 30 j |
| `CADENCE_ENTETE_IP` | `app/lib/cadence/ip.ts:36` | non | — | En-tête IP client de confiance | **À poser derrière un proxy** (`x-forwarded-for` / `cf-connecting-ip`), sinon tous les anonymes partagent un quota (`cadence/ip.ts:55-60`) |
| `SITE_URL` | `app/lib/certificat/siteUrl.ts:60` | oui | non (https) | QR certificat, liens mails, réinit. mot de passe, CADA | En prod, refus si non https public (`siteUrl.ts:75-79`) |
| `GESTION_URL_APPLICATION` | `app/lib/gestion/adresseApplication.ts:34` | **non** | défaut **`http://localhost:3000`** (`:18`) | Liens agenda / Accepter-Refuser | **À poser** (déjà faux aujourd'hui hors du Mac) |
| `SVAV_URL_PUBLIQUE` | `app/lib/gestion/travailleurEnvoiReel.ts:41` | **non** | défaut **`http://localhost:3000`** | Liens alertes d'envoi gestion | **À poser** |
| `SMTP_HOST/PORT/USER/PASS` | `app/lib/email/index.ts:41-44` (nom dynamique) | oui | non | Compte « entreprise » | Port 465/587 sortant ouvert chez OVH (SUPPOSÉ) |
| `SMTP_PERSONNE_HOST/PORT/USER/PASS` | idem, infixe `PERSONNE_` (`sitadel/envoiDemande.ts:24`) | oui — **`_PORT/_USER/_PASS` présents 3 fois ; `_PASS` avec 2 valeurs distinctes** | non | Boîte personnelle | La **dernière** occurrence l'emporte (dotenv) : **dédoublonner avant de copier le `.env`** |
| `IMAP_HOST/PORT`, `IMAP_PERSONNE_HOST/PORT` | `app/lib/email/index.ts:67-68` | non | — | Relève | Défaut `imap.gmail.com:993` |
| `MAIL_FROM` | `app/lib/email/index.ts:76` | oui | non | Expéditeur | — |
| `GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` | `app/lib/permis/drive.ts:45-47` | oui | non | OAuth Drive (permis) + repli gestion@ | — |
| `GOOGLE_GESTION_CLIENT_ID/SECRET` | `app/lib/gestion/google.ts:77-78` | non | — | Client OAuth gestion@ (facultatif) | Repli sur `GOOGLE_DRIVE_*` |
| `GOOGLE_GESTION_REFRESH_TOKEN`, `GOOGLE_GESTION_COMPTE` | `app/lib/gestion/googleJeton.ts:63,65` | non | — | Jeton gestion@ par l'env (prioritaire) | Alternative au fichier |
| `GOOGLE_GESTION_JETON_FICHIER` | `app/lib/gestion/googleJeton.ts:39` | non | défaut **`homedir()/.config/sansvisavis/google-gestion.json`** (`:40`) | Fichier jeton gestion@ | Copier le fichier chez l'utilisateur du service, ou passer par l'env |
| `GOOGLE_DELEGATION_CLE_FICHIER` | `app/lib/gestion/compteService.ts:60` | oui | **OUI** (`/Users/…/.config/sansvisavis/…`) | Clé compte de service (Drive délégué, Agenda) | Chemin à recréer ; ou `GOOGLE_DELEGATION_CLE_JSON` |
| `GOOGLE_DELEGATION_CLE_JSON` | `app/lib/gestion/compteService.ts:58` | non | — | Clé en JSON direct | Alternative |
| `GESTION_JETON_CLE` | `app/lib/gestion/coffre.ts:43` | oui | non | Clé AES du coffre | CLI seulement (`purger-jetons-google.ts:46`) |
| `GEMINI_API_KEY` | `app/lib/svv/adaptateurIaPhoto.ts:120` | oui | non | Analyse photo | — |
| `MISTRAL_API_KEY` | `app/lib/permis/lireCompteRenduIa.ts:83` | oui | non | OCR Cerfa / planches | — |
| `GEMINI_MODEL`, `MISTRAL_MODEL`, `BANC_FOURNISSEUR`, `MESURE_COMPTE` | `app/scripts/banc-vision.ts:155-156`, `mesurer-depot-drive.ts:34` | non | — | Bancs d'essai | CLI |
| `S3_ENDPOINT` | `app/lib/stockage/config.ts:48` | oui | **OUI** (`http://`, local) | MinIO | Nouvel endpoint (MinIO Linux ou S3 OVH) |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | `stockage/config.ts:49-55` | oui | non | — | — |
| `S3_REGION`, `S3_URL_EXPIRATION_S`, `S3_TAILLE_MAX_MO` | `stockage/config.ts:54-57` | non | — | — | Défauts |
| `DILA_URL`, `DILA_DIR` | `app/lib/veille/detectionRepo.ts:39`, `sitadel/dilaIngest.ts:36` | non | — | DILA | `DILA_DIR` défaut `tmpdir()/svav-dila` : archive ~350 Mo + JSON ~260 Mo → attention si `/tmp` est en tmpfs (SUPPOSÉ) |
| `CARTE_TUILES_CONCURRENCE`, `CARTE_TUILES_BUDGET_MS` | `app/lib/carte/orientationCarte.ts:58,66` | non | — | Tuiles IGN | Défauts |
| `CERTIFICAT_CARTE_QUALITE_JPEG` | `app/lib/pdf/publierCertificatPdf.ts:215` | non | — | — | Défaut 80 |
| `NODE_ENV` | `siteUrl.ts:75`, routes de session (`(admin)/api/admin/session/route.ts:132`…) | non (posé par Next) | — | Prod/dev | Change `secure` des cookies et la garde `SITE_URL` (cf. §9) |
| `VITEST` | `gestion/envoiDemandeTache.ts:42`, `agendaSynchro.ts:78` | non | — | Faux Google en test | — |
| `PATH` | `app/scripts/completer-miniatures.ts:385` | — | — | Recherche `soffice` | — |
| `TZ` | **jamais lue** | non | — | — | **À poser `TZ=Europe/Paris`** (cf. §6) |
| `PGOPTIONS` | lue par `pg` (`node_modules/pg/lib/connection-parameters.js:83`), pas par le code | non | — | — | Levier possible `-c timezone=Europe/Paris` |

Variables du `.env.example` absentes du `.env` : `SESSION_INTERNAUTE_TTL`, `GOOGLE_GESTION_CLIENT_ID/SECRET`,
`GOOGLE_GESTION_JETON_FICHIER` (toutes à défaut sûr). `.env.example` ne liste ni `GESTION_URL_APPLICATION` ni
`SVAV_URL_PUBLIQUE` ni `S3_*` ni `GOOGLE_DELEGATION_*` (PROUVÉ) : il n'est pas une référence complète.

URL en dur dans des scripts : `app/scripts/vidage-epreuve.ts:107,187` (`postgresql://localhost:5432/…`),
`app/scripts/audit-monga.ts:326` (`http://localhost:3000/admin/gestion?…`) — CLI d'épreuve, PROUVÉ.

---

## 2. Fichiers nécessaires mais absents de git

| Élément | Preuve | Étiquette | Ce qui casse sans lui | À faire |
|---|---|---|---|---|
| `.env` | `.gitignore` (`.env*`) | PROUVÉ | Tout (`DATABASE_URL manquant`) | Copier par canal sûr, dédoublonner `SMTP_PERSONNE_*`, corriger `DATABASE_URL`, `S3_ENDPOINT`, `GOOGLE_DELEGATION_CLE_FICHIER`, ajouter les URL publiques et `TZ` |
| `~/.config/sansvisavis/google-gestion.json` (0600) | `app/lib/gestion/googleJeton.ts:37-40` ; lu par des routes de prod (`api/admin/gestion/{envois,redaction,corbeille,messages/[id]/gmail,messages/[id]/original}`) | PROUVÉ | Pas d'envoi Gmail gestion@, corbeille, original ; l'écran affiche « non autorisé » (`googleJeton.ts:67`, pas de plantage) | Copier chez l'utilisateur du service, ou `GOOGLE_GESTION_REFRESH_TOKEN` |
| `~/.config/sansvisavis/drive-delegation.json` (0600) | `GOOGLE_DELEGATION_CLE_FICHIER` → `compteService.ts:55-62` | PROUVÉ | Drive délégué + Agenda « non configuré » | Copier + corriger le chemin |
| Base PostgreSQL (11 Go, dont rasters `mnt_lidar_brut` / `mns_lidar_brut`, `batiment`, `parcelle`, `gestion_message` 5,6 Go) | `SELECT pg_database_size` | PROUVÉ | Tout, golden compris | `pg_dump -Fc` → `pg_restore` (jamais copier le répertoire de données : binaire macOS) |
| Données MinIO `.minio/data` (photos, PDF, pièces) | `.gitignore` `/.minio/` | PROUVÉ | Pièces, certificats, miniatures introuvables | `mc mirror` vers le nouveau stockage |
| `data/sitadel`, `data/prada`, `data/commune`, `data/mairie`, `data/bdnb`, `data/parcs_jardins`, `app/data/lidar` | `.gitignore:4-26` | PROUVÉ | Re-téléchargeables (veille) ; `app/data/lidar` = dalles sources déjà en base | Ne pas copier sauf besoin de ré-import |
| `certs/`, `certificates/` | `.gitignore` ; `package.json` `dev:https` | PROUVÉ | Seulement `npm run dev:https` | Inutiles en prod (TLS au proxy) |
| `sauvegardes/` | `.gitignore` | PROUVÉ | Rien au runtime | Archiver à part |
| `app/lib/svv/adaptateurIaPhoto.ts`, `app/api/analyse-photo/route.ts` (« hors staging ») | `git ls-files` → **suivis**, aucune modif locale | PROUVÉ | Rien : ils sont dans git, le clone les apporte | — |
| Polices/logos PDF `app/lib/pdf/actifs/*` | `git ls-files` | PROUVÉ | — (dans git) | — |

---

## 3. Chemins absolus propres au Mac

| Élément | Preuve | Étiquette | Ce qui casse sur Linux | À faire |
|---|---|---|---|---|
| Plists : `/usr/local/bin/node`, `/bin/zsh -lc "cd /Users/macbookprom4arnaud/…"`, `~/Library/Logs/svav-*.log`, `USER/LOGNAME=macbookprom4arnaud` | `ops/com.sansvisavis.veille.plist:22-36`, `gestion-continu.plist:65-103`, `drive-empreintes.plist:55-87` | PROUVÉ | launchd n'existe pas | Units systemd (§8) |
| `homedir()/.config/sansvisavis/google-gestion.json` | `app/lib/gestion/googleJeton.ts:40` | PROUVÉ | Chemin résolu chez l'utilisateur Linux ; fichier absent → « non autorisé » | Copier ou variable d'env |
| `GOOGLE_DELEGATION_CLE_FICHIER=/Users/…` | `.env` (indicateur, valeur non lue) | PROUVÉ | Clé introuvable → Drive délégué / Agenda inactifs | Nouveau chemin |
| Scripts écrivant dans `~/Desktop` sans `mkdir` | `rattraper-pieces-refusees.ts:80`, `audit-historique-biens.ts:77`, `reparer-mails-contraires-aux-regles.ts:214`, `photo-historiques.ts:101`, `adresses-inconnues-documents.ts:71`, `audit-monga.ts:726` | PROUVÉ | ENOENT (pas de Bureau sur un serveur) | À décider par Arno (CLAUDE.md : ne pas déplacer sans accord) — créer `~/Desktop` sur le serveur suffit à court terme |
| Scripts avec `mkdir` ou option de sortie | `rapport-tri-pieces.ts:29` (`--sortie=`), `reprendre-categories-parties.ts:221`, `importer-annuaire.ts:68` (lit `~/Downloads`, `--dossier=`) | PROUVÉ | Fonctionnent / option disponible | — |
| `/Applications/LibreOffice.app` | `app/scripts/completer-miniatures.ts:391` | PROUVÉ | Repli sur `soffice` du PATH (`:385-389`) | `libreoffice-core` facultatif |
| Texte d'aide affiché dans l'UI : `nohup caffeinate -i npm run … >> ~/Desktop/copie-pieces.log` | `app/lib/gestion/copieArretee.ts:70` (figé par `copieArretee.test.ts:115`) | PROUVÉ | Commande proposée inutilisable sur Linux (rien n'est exécuté) | Adapter le texte (lot dédié) |
| Messages d'aide `cd /Users/macbookprom4arnaud/…` | `construire-arbre-drive.ts:124`, `importer-annuaire.ts:180`, `copier-pieces-drive.ts:110`, `proposer-rattachements.ts:241`, `relever-adresses.ts:63` ; `docs/PROTOCOLES_REINGESTION.md` (affiché dans l'écran Sources via `app/lib/admin/protocolesRepo.ts:15`) | PROUVÉ | Affichage faux uniquement | Cosmétique |
| `/opt/homebrew` (PG, poppler, gdal, 7z) | `which` + processus PG `/opt/homebrew/opt/postgresql@17` | PROUVÉ | Aucune référence dans le code : uniquement l'installation | Paquets apt |
| `package.json`, `next.config.ts`, `tsconfig.json`, `vitest*.config.ts`, `proxy.ts` | lecture | PROUVÉ | Aucun chemin Mac | — |
| `allowedDevOrigins: ['*.trycloudflare.com', …, '192.168.1.164']` | `next.config.ts:12` | PROUVÉ (présence) / SUPPOSÉ (inopérant sous `next start`) | Rien en prod | — |

---

## 4. Dépendances à macOS, binaires et paquets

| Élément | Preuve | Étiquette | Ce qui casse sur Linux | À installer |
|---|---|---|---|---|
| `pdftoppm`, `pdfinfo`, `pdfseparate`, `pdfunite` — **routes de prod** `api/admin/permis/extraire`, `…/emprise` | `app/lib/permis/lireCerfaScan.ts:195,209,215,219`, `reperePlanches.ts:122` | PROUVÉ | Extraction / emprise en échec | `poppler-utils` |
| `tar -tjf` / `tar -xjOf` (DILA, veille) | `app/lib/sitadel/dilaIngest.ts:74,131` | PROUVÉ | Ingestion DILA en échec | `tar`, `bzip2` |
| `npm run cadastre:ingest` lancé en sous-processus par la veille (`cwd: process.cwd()`) | `app/lib/veille/ingestionAutoRepo.ts:161` | PROUVÉ | `npm` absent du PATH du service → échec | `nodejs`/`npm` dans le PATH de l'unit |
| `curl`, `ogr2ogr` (cadastre) | `app/scripts/cadastre-ingest.ts:45,49,57` | PROUVÉ | Ingestion cadastre | `curl`, `gdal-bin` (pilote PostgreSQL) |
| `curl`, `7z`, `ogr2ogr` (BD TOPO) | `app/scripts/bdtopo-import.ts:89,90,97` | PROUVÉ | `bdtopo:import` (CLI) | `7zip` / `p7zip-full`, `gdal-bin` |
| `soffice` (détecté seulement) | `completer-miniatures.ts:177,385` | PROUVÉ | Miniatures bureautiques absentes | `libreoffice-core` (facultatif) |
| Commandes macOS-only (`sips`, `open`, `osascript`, `security`, `pbcopy`, `caffeinate`, `launchctl`) | grep | PROUVÉ | **Aucune exécutée** par le code (`caffeinate` seulement dans un texte, `launchctl` dans les plists/README) | — |
| `.minio/minio` | `file` → Mach-O arm64 | PROUVÉ | Inutilisable | Binaire MinIO Linux, ou S3 OVH |
| npm natifs : `sharp` (`@img/sharp-darwin-arm64`), `next`/SWC, `lightningcss`, `@tailwindcss/oxide`, `@rolldown/binding` | `node_modules/` | PROUVÉ | Plantage si `node_modules` copié (sharp utilisé en prod : `internaute/photoDepot.ts:1`, `visuel/genererVisuelPng.ts:3`, `carte/orientationCarte.ts:17`) | `npm ci` sur le serveur ; `package-lock.json` contient déjà les variantes `linux-x64-gnu` (ex. `@img/sharp-linux-x64`, l.1993) |
| `argon2` | `prebuilds/linux-x64` présent | PROUVÉ | — | — |
| `@hyzyla/pdfium` (WASM), `pdfkit` (`.afm` via `serverExternalPackages`, `next.config.ts:11`) | lecture | PROUVÉ | — | — |
| **`tsx`, `dotenv` en devDependencies** | `package.json` (devDependencies) ; plists lancent `node_modules/tsx/dist/cli.mjs` ; `chargerEnv.ts:11` importe `dotenv` ; `db/client.ts:23` aussi | PROUVÉ | `npm ci --omit=dev` → toutes les tâches de fond et CLI cassent ; **`db/client.ts` importe `dotenv/config` → même `next start` en dépend** (SUPPOSÉ : non testé sans devDeps) | `npm ci` **complet** (ou déplacer en dependencies — lot dédié) |
| Version de Node | ni `.nvmrc` ni `engines` ; Mac = Node 24.16.0 (`/usr/local/bin/node`) | PROUVÉ | Version arbitraire sur le serveur | Installer Node 24.x (NodeSource/nvm), la figer |
| Dev servi par Turbopack (`.next/dev/build/…`) malgré `NEXT_TURBO=0` ; build = Turbopack | `ps` + log build « Next.js 16.2.9 (Turbopack) » | PROUVÉ | Rien de spécifique Linux | — |

---

## 5. Sensibilité à la casse

Script : `.captures/recon-portabilite/verifier-casse.mjs` (gitignoré). Il contrôle (1) chaque fichier suivi par git
contre son nom réel sur disque (segment par segment, `readdirSync`), (2) chaque `import`/`require`/`import()`/
`export from`/`@import` relatif ou `@/` contre la casse exacte du fichier résolu, (3) les chemins d'assets `/images/…`
de `public/`. Témoin intégré : `app/lib/svv/Config.ts` **est bien détecté** (« Config.ts ≠ disque config.ts ») — le
détecteur n'est pas aveugle sur APFS.

| Contrôle | Résultat | Étiquette |
|---|---|---|
| Fichiers suivis (3 109) — casse git ↔ disque | **0 divergence** | PROUVÉ |
| Imports relatifs / `@/` contrôlés (6 461, dans 2 537 sources) | **0 divergence** | PROUVÉ |
| Assets `public/` cités | **0 divergence** | PROUVÉ |
| Doublons de casse dans `git ls-files` | 0 | PROUVÉ |
| `git config core.ignorecase` | `true` (macOS) → un renommage de casse futur peut être invisible à git | PROUVÉ |
| Chemins construits dynamiquement (`require('./'+x)`, `readFile(var)`) | non couverts par le script | SUPPOSÉ sans risque |

À noter : `public/images/` contient des noms avec espaces (`FOOTER 3.png`, `sceau-certifie copie.svg` — ce dernier non
suivi) : sans effet sur Linux. Le build Linux reste la preuve finale (checklist).

---

## 6. Fuseau horaire

Le Mac est en `Europe/Paris` (processus Node **et** PostgreSQL : `SHOW timezone` → `Europe/Paris`, PROUVÉ). Aucun
`TZ` n'est fixé nulle part (code, vitest, plists) ; le pool `pg` ne fixe pas de fuseau (`app/lib/db/client.ts:29`).
Trois mécanismes : (A) fuseau du processus Node, (B) fuseau de session PG, (C) colonnes SQL `date` → `Date` JS à minuit
**local** (`node_modules/postgres-date/index.js:75`).

### Mesure : suite complète sous deux fuseaux (vitest seul, sans tsc)

| | Fichiers | Tests | Verts | Rouges | Ignorés |
|---|---|---|---|---|---|
| `TZ=Europe/Paris` | 1 127 | 19 524 | 19 503 | **0** | 21 |
| `TZ=UTC` | 1 127 | 19 524 | 19 499 | **4** (2 fichiers) | 21 |

Rouges sous UTC (PROUVÉ) :
- `app/lib/veille/envoiInitialAuto.test.ts` (3 tests) : un instant `10:00+02:00` (mercredi) n'est plus « dans la
  fenêtre » car `fenetreEnvoiOuverte` lit `maintenant.getHours()` (`app/lib/veille/envoiOuvre.ts:64`) → 08 h en UTC.
  **Effet réel** : l'envoi initial automatique partirait 2 h plus tard (été) que le réglage.
- `app/lib/gestion/ecran.test.ts:78` : « Dernière relève : 23 septembre 2026, 14:00 » devient 12:00 —
  `formaterDateFr` (`app/lib/gestion/ecran.ts:12-17`) n'a pas de `timeZone`.

### Inventaire (extrait — points fragiles)

| Élément | Preuve | Mécanisme | Ce qui change si le serveur est en UTC | Étiquette |
|---|---|---|---|---|
| Fenêtre d'envoi / jour ouvré / prochain créneau | `app/lib/veille/envoiOuvre.ts:36,42,50,65,79` (appelants `envoiAuto.ts:22`, `envoiInitialAuto.ts:19`, `relanceReponsePartielleAuto.ts:24`, `cascadePartielleAuto.ts:15`, `alerteLienPeremptionAuto.ts:16`) | A | Fenêtre 9–11 h ouverte 11–13 h Paris (été) ; lundi 00–02 h vu comme dimanche ; « prévu le … » décalé | PROUVÉ (test rouge) |
| Heure de l'alerte quotidienne | `app/lib/veille/alerteAuto.ts:188` (`getHours()`) | A | Récapitulatif à 10 h au lieu de 8 h (été) | PROUVÉ |
| Fenêtre nocturne d'ingestion + clé `nuit_du` | `app/lib/veille/ingestionAuto.ts:52,61-64` | A | 3–6 h devient 5–8 h Paris ; clé de nuit = date UTC | PROUVÉ |
| Quota mensuel libéré le | `app/lib/sitadel/demande.ts:450-452` | A | Le 1er 00–02 h : mauvais mois annoncé | PROUVÉ |
| Bornes d'ancienneté des permis | `app/lib/sitadel/demandeRepo.ts:74-83`, `permis/page.tsx:35-36` | A | Borne reculée d'un jour 00–02 h | PROUVÉ |
| Numéros annuels `DEM-AAAA` / `GES-AAAA` | `api/admin/permis/demandes/route.ts:43`, `…/depot-auto/route.ts:24`, `app/lib/gestion/gestes.ts:171` | A | 1er janvier 00–01 h : année précédente | PROUVÉ |
| Mail « Envoi demandé le … » | `app/lib/gestion/fileEnvoi.ts:140-143` | A | Heure −1/−2 h | PROUVÉ |
| « Mon espace » — date du certificat | `app/espace/page.tsx:23-24` (Intl sans `timeZone`, composant serveur) | A | Veille pour un certificat émis 00–02 h | PROUVÉ |
| Horodatage DOS des ZIP | `app/lib/gestion/zip.ts:56-60` | A | Cosmétique | PROUVÉ |
| Plafond quotidien d'envoi | `app/lib/sitadel/envoiDemande.ts:170` (`envoye_le::date = CURRENT_DATE`) | B | Journée 02 h–02 h si PG en UTC | PROUVÉ (code) |
| Plafond mensuel par commune | `app/lib/sitadel/demandeRepo.ts:153` (`date_trunc('month', now())`) | B | Demande du 1er 00 h 30 comptée au mois précédent | PROUVÉ (code) |
| « Une alerte / une relève approfondie par jour » | `app/lib/veille/alerteAuto.ts:191`, `releveApprofondie.ts:317` | B | Bascule à 02 h ; 2e alerte possible (SUPPOSÉ) | PROUVÉ (code) |
| Périodes de location vs `current_date` | `app/lib/gestion/rechercheBienRepo.ts:127,226-227`, `historiqueBienRepo.ts:238-246`, `annuaireContenuRepo.ts:74,87`, écritures `annuaireEditionRepo.ts:678,684,829` | B | 00–02 h : sortant encore en place, entrant pas encore ; sortie datée de la veille | PROUVÉ (code) |
| Surveillance polygones, filtres « du/au », `recu_le::date` | `veille/surveillancePolygonesAuto.ts:91,119,123,169`, `gestion/rechercheBoite.ts:378,832`, `veille/demandeReponseRepo.ts:780` | B | Bornes décalées de 2 h | PROUVÉ (code) |
| Colonnes `date` → `Date` (CADA `refus_le`, `nuit_du`, `date_distante`) | `veille/saisineCadaRepo.ts:73,86,352,395`, `veille/ingestionAutoRepo.ts:226-234`, `veille/detectionRepo.ts:146-158` | C | **Aujourd'hui sur le Mac** ces lectures donnent la VEILLE (minuit Paris → `toISOString` J−1) ; en UTC elles donneraient le bon jour → **le comportement change** (forclusion CADA affichée au 13 au lieu du 14) | PROUVÉ (code) / impact métier SUPPOSÉ |

Robustes (PROUVÉ) : Agenda Google (`gestion/agendaTache.ts:39,264-266`), numérotation certificat
(`app/lib/db/certificatNumero.ts:40`, `AT TIME ZONE 'Europe/Paris'`), PDF (`publierCertificatPdf.ts:116-121`),
`/verifier`, analytics (`jour_paris`), échéances CADA en UTC explicite (`veille/echeance.ts:41`,
`permis/dossierPartiel.ts:36`), helpers `horodatageParis.ts`, `admin/heureParis.ts`, `gestion/taches.ts:194-228`.

**Conclusion** : le code **suppose** un serveur à l'heure de Paris (commentaire explicite `envoiOuvre.ts:9`). Sur Linux,
fixer **`TZ=Europe/Paris`** dans chaque unit systemd (Next + tâches) **et** `timezone = 'Europe/Paris'` dans
`postgresql.conf` (ou `ALTER DATABASE sansvisavis SET timezone = 'Europe/Paris'`, ou `PGOPTIONS`). Point (C) : garder
Paris conserve le comportement actuel (y compris son biais J−1, à instruire dans un lot dédié). Non fait dans ce lot :
les tests d'intégration sous `PGOPTIONS='-c timezone=UTC'` (ils écrivent des fixtures en base → hors lecture seule).

---

## 7. Build de production et typage

| Commande | Résultat | Étiquette |
|---|---|---|
| `npm run build` (Next 16.2.9, Turbopack, `.env` chargé) | **EXIT 0**, 27 s ; « Compiled successfully in 7.2s », TypeScript 17.9 s, 188 pages générées | PROUVÉ |
| — avertissement unique | « **Encountered unexpected file in NFT list** — the whole project was traced unintentionally » ; trace : `next.config.ts` → `app/lib/sitadel/dilaIngest.ts` → `app/lib/veille/ingestionAutoRepo.ts` → `app/(admin)/api/admin/sources/route.ts`. Sans effet sous `next start` depuis le dépôt ; **gonflerait** un déploiement `standalone` (tout le projet tracé) | PROUVÉ |
| `npx tsc --noEmit` | **EXIT 0**, 18 s, aucune erreur | PROUVÉ |
| Erreurs masquées par le mode dev | **aucune** révélée par le build | PROUVÉ |

Note : `next build` et `next dev` utilisent des dossiers séparés (`.next/` vs `.next/dev/`, doc
`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:918-920`) — le build n'a pas perturbé le serveur
de dev en cours. Pas de `output: 'standalone'` (`next.config.ts`) : déployer = clone + `npm ci` + `npm run build` +
`next start` depuis la racine.

---

## 8. Tâches de fond

| Tâche | Déclenchement aujourd'hui | Preuve | Étiquette | Remplacement Linux |
|---|---|---|---|---|
| **Veille** (`npm run veille:run` → `executerVeille` : relève auto, relances, cascade, alerte quotidienne, envois auto, saisines, alertes GED, ingestion auto DILA/PRADA/Sitadel/cadastre, surveillance polygones…) | launchd `StartInterval 900` (15 min) | `ops/com.sansvisavis.veille.plist:22-28` ; `app/lib/sitadel/executerVeille.ts:212+` | PROUVÉ | `svav-veille.service` (oneshot, `WorkingDirectory=<dépôt>`, `Environment=TZ=Europe/Paris`) + `.timer` `OnUnitActiveSec=15min` |
| — état actuel | **dernier code de sortie 1** : `Error: read ETIMEDOUT` émis par `ImapFlow` **sans écouteur `error`** → le processus meurt | `launchctl list` ; `~/Library/Logs/svav-veille.log` (fin) | PROUVÉ | Même plantage possible sous systemd (non spécifique Mac) ; à instruire dans un lot dédié |
| **Relève gestion continue** (`relever-gestion-continu.ts`, boucle interne 60 s) | launchd `KeepAlive`, `RunAtLoad`, `ThrottleInterval 60` ; en cours (PID 62757) | `ops/com.sansvisavis.gestion-continu.plist:65-103` | PROUVÉ | `svav-gestion-continu.service` (simple, `Restart=always`, `RestartSec=60`) |
| **Index empreintes Drive** (`indexer-empreintes-drive.ts --changements --appliquer`, **aucun script npm**) | launchd `StartInterval 900`, `RunAtLoad` | `ops/com.sansvisavis.drive-empreintes.plist:55-63` | PROUVÉ | service oneshot + timer 15 min |
| Bouton « Lancer maintenant » (Automatisation) | pose une demande consommée au prochain passage de la veille | `ops/README.md:15-16` ; aucune route n'appelle `executerVeille(` | PROUVÉ | Inchangé (dépend du timer) |
| `analytics:maintenance` (rétention RGPD) | **aucun** déclencheur (`crontab -l` → vide) alors que la doc exige un cron quotidien | `app/scripts/analytics-maintenance.ts:7-14`, `docs/RAPPORT_BUILD_m2_lot2_instrumentation.md:136-141` | PROUVÉ | timer `OnCalendar=*-*-* 00:15` (à décider) |
| Purge internautes échus (`purgerEchus`) | manuel | `docs/RAPPORT_BUILD_lot4_internaute_cycle_vie.md:42,64` | PROUVÉ (manuel) / besoin de timer SUPPOSÉ | à décider |
| `relances:envoyer`, `demandes:envoyer`, `saisines:envoyer`, `demandes:relever`, `alertes:envoyer`, `*:ingest` | manuels (l'automatique passe par la veille) | `relances-envoyer.ts:7`, `saisines-envoyer.ts:6`, `envoyer-alerte.ts:2` | PROUVÉ | inchangés |
| `setInterval`/`instrumentation.ts` côté serveur Next | aucun | grep | PROUVÉ | — |

Contraintes communes des units (PROUVÉ) : les plists posent `PATH=/usr/local/bin:…` et `USER/LOGNAME` parce que
`DATABASE_URL` n'a pas d'utilisateur (`ops/README.md:87-91`, sinon `FATAL 28000`) ; la veille a besoin de `npm`,
`ogr2ogr`, `curl`, `tar`, `bzip2` dans le PATH et du **dossier de travail = racine du dépôt** (`data/sitadel` relatif,
`app/lib/sitadel/ingestionMillesime.ts:35`, `pradaIngest.ts:22`, `statfs(process.cwd())` dans
`veille/ingestionAutoRepo.ts:109`). Journaux : journald au lieu de `~/Library/Logs`. Serveur Next lui-même :
`svav-next.service` (`next start`, `Restart=always`) — aujourd'hui lancé à la main (`next dev`, PID 50621).

---

## 9. Services externes

| Service | Authentification | Preuve | Dépendance localhost / Mac | À faire |
|---|---|---|---|---|
| SMTP (nodemailer) — 2 profils | utilisateur + mot de passe d'application ; `secure = port === 465` | `app/lib/email/index.ts:85-93` | aucune | Ports sortants 465/587 ouverts (SUPPOSÉ) |
| IMAP (imapflow) | mêmes identifiants, TLS 993 | `app/lib/email/index.ts:64-70`, `email/imap.ts:71` | aucune | — |
| Gmail API gestion@criterimmo.fr | OAuth2 refresh token (`gmail.modify`, `gmail.settings.basic`, `drive`) | `app/lib/gestion/google.ts:42-61` | jeton **dans un fichier du home** (`googleJeton.ts:40`) | Copier ou variable d'env |
| Consentement OAuth (CLI `gestion:google:autoriser`, `drive:autoriser`) | client « bureau », **`redirect_uri = http://127.0.0.1:<port libre>`** | `app/scripts/gestion-google-autoriser.ts:82,120-124`, `drive-autoriser.ts:40,59-65` | boucle locale + navigateur | Sur serveur sans écran : tunnel `ssh -L`, ou autoriser sur le Mac puis copier le jeton (SUPPOSÉ). Aucune route web de retour OAuth (`api/admin/gestion/google/route.ts:8-11`) |
| Google Drive permis | OAuth2 refresh `GOOGLE_DRIVE_*` | `app/lib/permis/drive.ts:44-61` | aucune | — |
| Google Drive délégué + Agenda | compte de service JWT RS256, délégation de domaine (`drive`, `calendar.events`) | `gestion/compteService.ts:27-33`, `agendaDelegue.ts:17` | clé = fichier `/Users/…` | Copier ; NTP indispensable (JWT, SUPPOSÉ) |
| Liens dans l'agenda / Accepter-Refuser / alertes d'envoi | — | `gestion/agendaTache.ts:174`, `acceptationRepo.ts:137`, `travailleurEnvoiReel.ts:151` | repli **`http://localhost:3000`** | Poser `GESTION_URL_APPLICATION`, `SVAV_URL_PUBLIQUE` |
| QR certificat, mail certificat, réinit., CADA | — | `pdf/certificatPdf.ts:167`, `email/index.ts:131,136`, `api/internaute/auth/reinitialiser/demander/route.ts:68`, `veille/propositionAuto.ts:81` | `SITE_URL` (https en prod sinon refus, `siteUrl.ts:75-79`) | Déjà https |
| Gemini | clé API (`x-goog-api-key`) | `app/lib/svv/adaptateurIaPhoto.ts:129-132` | aucune | — |
| Mistral | Bearer | `permis/lireCerfaScan.ts:234-250` | `tmpdir()` | — |
| IGN Géoplateforme (WMTS/WFS/BD TOPO) | aucune | `carte/orientationCarte.ts:168`, `sitadel/commune.ts:29` | aucune | Sortie HTTPS |
| BAN, Sitadel/DiDo, DILA, cadastre, PRADA, service-public | aucune | `permis/plancheParcellesRepo.ts:174`, `sitadel/ingestionMillesime.ts:31`, `dilaIngest.ts:46-50`, `scripts/cadastre-ingest.ts:28` | aucune | — |
| MinIO / S3 | clé + secret | `stockage/config.ts:47-66` | endpoint `http://` local | Nouvel endpoint ; fichiers déjà servis via l'app (`…/certificats/[id]/telecharger/route.ts:73`) |
| Cookies `svv_admin_session` (strict) / `svv_client_session` (lax) | `secure = NODE_ENV === 'production'` | `app/lib/admin/session.ts:51-59`, `(admin)/api/admin/session/route.ts:132`, `api/internaute/auth/login/route.ts:57` | aucun `domain` | **TLS obligatoire** (proxy nginx/Caddy ou tunnel Cloudflare nommé) ; transmettre `Host` (`api/mesure/route.ts:80`, redirections `proxy.ts:136-192`, SUPPOSÉ) |
| Tunnel Cloudflare | — | aucune config `cloudflared` dans le dépôt ; `trycloudflare` refusé (`siteUrl.ts:36`) | dev uniquement | Choisir le frontal (décision Arno) |

---

## 10. Base de données

| Élément | Valeur | Preuve | Étiquette | À faire sur Linux |
|---|---|---|---|---|
| PostgreSQL | **17.10** (Homebrew, aarch64-apple-darwin) | `SELECT version()` | PROUVÉ | PostgreSQL 17 (dépôt PGDG) |
| PostGIS | **3.6.4** — GEOS 3.15.0, PROJ 9.9.0 (`NETWORK_ENABLED=OFF`), GDAL 3.13.3 | `SELECT postgis_full_version()` | PROUVÉ | `postgresql-17-postgis-3` en 3.6.x ; versions GEOS/PROJ différentes possibles → cf. §11 |
| Extensions installées | `pg_trgm 1.6`, `plpgsql`, `postgis 3.6.4`, `postgis_raster 3.6.4`, `postgis_topology 3.6.4`, `unaccent 1.1` | `SELECT … FROM pg_extension` | PROUVÉ | Toutes à installer **avant** `pg_restore` |
| `CREATE EXTENSION` des migrations | `postgis`, `postgis_raster` (`db/migrations/001_bloc_b_schema.sql`), `unaccent` (`027_unaccent_extension.sql`, `049_commune.sql`, `253_gestion_annuaire.sql`), `pg_trgm` (`049`, `253`) | grep | PROUVÉ | `postgis_topology` est installée en base mais **créée par aucune migration** |
| Dernière migration | **`351_gestion_envoi_classement.sql`** (351 fichiers, aucun numéro en double) | `ls db/migrations` | PROUVÉ | — |
| Taille | 11 Go (`gestion_message` 5,6 Go, `batiment` 2,2 Go, `parcelle` 1,6 Go) | `pg_database_size` | PROUVÉ | Disque + temps de `pg_restore` |
| Fuseau serveur PG | `Europe/Paris` | `SHOW timezone` | PROUVÉ | **Le reproduire** (§6) |
| Collation | `en_US.UTF-8`, fournisseur libc (`datlocprovider = c`) | `pg_database` | PROUVÉ | Locale `en_US.UTF-8` à générer sur Linux ; la libc macOS ≠ glibc → **ordres `ORDER BY` texte possiblement différents** (SUPPOSÉ ; échantillon Mac `'a'<'B'`=t, `'é'<'f'`=t, `'Zoé'<'abc'`=f — à rejouer sur Linux) |
| Rasters LiDAR | `mnt_lidar_brut` 64 tuiles, `mns_lidar_brut` 64 tuiles (en base) | `SELECT count(*)` | PROUVÉ | Inclus dans le dump |
| Réglages | `max_connections=100`, `shared_buffers=128MB` | `current_setting` | PROUVÉ | À dimensionner sur le serveur |
| Transfert | répertoire de données Homebrew `/opt/homebrew/var/postgresql@17` (binaire macOS) | `current_setting('data_directory')` | PROUVÉ | **`pg_dump -Fc` / `pg_restore`** uniquement |

---

## 11. Golden

| Élément | Valeur | Étiquette |
|---|---|---|
| Commande | `npx vitest run --config vitest.integration.config.ts app/lib/db/pipeline.itest.ts` (ou `npm run test:integration`, qui joue **tous** les `*.itest.ts`, dont certains écrivent des fixtures) | PROUVÉ |
| Résultat ce jour | **1 fichier, 11 tests verts**, 2,8 s | PROUVÉ (exécuté) |
| Assertion | `toBeCloseTo(29.107259068449615, 3)` → tolérance ±0,0005 (`app/lib/db/pipeline.itest.ts:88,102,125,…`) | PROUVÉ |
| Données lues | `mnt_lidar_brut`, `mns_lidar_brut`, `bdtopo_batiment`, `bdtopo_vegetation`, `bdtopo_eau_plan`, `bdtopo_eau_surface`, `bdnb_annee_batiment`, `parcs_jardins_*`, `patrimoine_entite(_batiment)`, `config_famille_annee` (`config_scoring` découplé par `PROFIL_GOLDEN_REF`, `pipeline.itest.ts:31`) ; `DATABASE_URL` | PROUVÉ (grep des `FROM/JOIN` du pipeline) |
| Écritures | aucune `INSERT/UPDATE/DELETE` dans `app/lib/db/pipeline.ts` | PROUVÉ |
| Risque Linux | GEOS / PROJ / GDAL d'une autre version peuvent déplacer les dernières décimales (`ST_Transform` 4326→2154, rasters) | SUPPOSÉ — la tolérance à 3 décimales absorbe une petite dérive ; **rejouer le golden sur Linux est le test d'acceptation n° 1** |

---

## Checklist de répétition générale (machine Linux de test, avant la vraie bascule)

À dérouler dans l'ordre ; chaque étape a son critère de réussite.

1. **Système** : Ubuntu/Debian LTS x86_64 ; `timedatectl set-timezone Europe/Paris` ; NTP actif (`timedatectl` → synchronized) ;
   locale `en_US.UTF-8` générée (`locale -a`).
2. **Paquets** : `postgresql-17`, `postgresql-17-postgis-3` (3.6.x), `poppler-utils`, `gdal-bin`, `curl`, `bzip2`, `tar`,
   `7zip`/`p7zip-full` ; facultatif `libreoffice-core`. Node **24.x** (même majeure que le Mac : 24.16.0).
3. **Utilisateur de service** `svav` ; rôle PostgreSQL de même nom (ou utilisateur dans `DATABASE_URL`).
4. **PostgreSQL** : `timezone = 'Europe/Paris'` dans `postgresql.conf` ; créer la base avec `LC_COLLATE/LC_CTYPE=en_US.UTF-8` ;
   `CREATE EXTENSION postgis, postgis_raster, postgis_topology, pg_trgm, unaccent` ; vérifier `postgis_full_version()`.
5. **Données** : sur le Mac `pg_dump -Fc sansvisavis` (11 Go) → `pg_restore` ; contrôler les comptes de quelques tables
   (`mnt_lidar_brut`=64, `mns_lidar_brut`=64, `gestion_message`, `batiment`) et la dernière migration (351).
6. **Code** : `git clone` (jamais copier le dossier du Mac) ; `npm ci` **complet** (devDeps incluses : `tsx`, `dotenv`).
7. **Secrets** : `.env` copié par canal sûr, **dédoublonné** (`SMTP_PERSONNE_*`) ; corriger `DATABASE_URL`, `S3_ENDPOINT`,
   `GOOGLE_DELEGATION_CLE_FICHIER` ; ajouter `GESTION_URL_APPLICATION`, `SVAV_URL_PUBLIQUE`, `CADENCE_ENTETE_IP`, `TZ=Europe/Paris` ;
   copier `~/.config/sansvisavis/{google-gestion,drive-delegation}.json` en 0600 chez `svav`.
8. **Stockage** : MinIO Linux (ou S3 OVH), bucket créé, `mc mirror` des données `.minio/data` ; vérifier qu'une pièce et un
   certificat existants s'ouvrent.
9. **Contrôles statiques** : `npx tsc --noEmit` (vert) ; `npm run build` (vert, seul l'avertissement NFT attendu) ;
   `node .captures/recon-portabilite/verifier-casse.mjs` recopié (0 divergence — le build Linux est la vraie preuve).
10. **Golden** : `TZ=Europe/Paris npx vitest run --config vitest.integration.config.ts app/lib/db/pipeline.itest.ts` → 11/11 ;
    noter la valeur brute obtenue si elle diffère de `29.107259068449615` au-delà de la 6e décimale (signe GEOS/PROJ).
11. **Suite complète** : `TZ=Europe/Paris npm test` → attendu vert (1 127 fichiers). Puis `TZ=UTC npx vitest run` pour
    confirmer qu'on retrouve exactement les 2 fichiers rouges connus (sinon : nouvelle dépendance au fuseau).
12. **Collation** : rejouer `SELECT ('a' < 'B'), ('é' < 'f'), ('Zoé' < 'abc');` → comparer à t/t/f ; parcourir une liste
    triée par nom (annuaire) contre la même sur le Mac.
13. **Binaires** : déclencher une extraction permis (`pdftoppm`/`pdfinfo`) et une emprise sur une pièce **« _TEST »**
    uniquement ; `tar -tjf` sur une petite archive `.tar.bz2`.
14. **Serveur web** : `svav-next.service` (`next start`, `WorkingDirectory=<dépôt>`, `Environment=NODE_ENV=production TZ=Europe/Paris`) ;
    frontal TLS (nginx/Caddy ou Cloudflare nommé) ; `curl -s -o /dev/null -w '%{http_code}' https://…/admin/login` → 200 et
    corps sans « Module not found » ni « Build Error » ; connexion admin et internaute (cookies `secure`).
15. **Certificat** : émettre un certificat de test → PDF produit, QR pointant vers `SITE_URL` https, polices présentes.
16. **Tâches de fond** (sur la machine de test, **boîtes et Drive de test uniquement**, ou désactivées côté envoi) :
    units `svav-veille.{service,timer}`, `svav-gestion-continu.service`, `svav-drive-empreintes.{service,timer}` avec
    `WorkingDirectory`, `User=svav`, `TZ`, PATH contenant `npm`/`ogr2ogr`/`curl` ; `journalctl -u …` sans erreur sur
    2 passages ; vérifier qu'aucun job du Mac ne tourne en parallèle sur les mêmes boîtes (double relève / double envoi).
17. **Fuseau en conditions réelles** : vérifier dans les journaux que la fenêtre d'envoi s'ouvre à l'heure réglée (heure
    de Paris) et que l'alerte quotidienne part à `alerte_heure_locale`.
18. **Google** : `npm run gestion:google:verifier`, `gestion:drive:verifier`, `gestion:agenda:verifier` (lecture) ; liens
    agenda / Accepter-Refuser pointant vers l'URL publique, plus vers localhost.
19. **Bascule** : arrêter les 3 agents launchd du Mac (`launchctl bootout`) **avant** d'activer les timers Linux ; dump
    final + restauration ; DNS ; surveillance 24 h.

---

## Contrôle final

`npm test` (= `tsc --noEmit && vitest run`, fuseau du Mac = Europe/Paris) exécuté en fin de lot : **EXIT 0 —
1 127 fichiers verts / 1 127 ; 19 503 tests verts, 21 ignorés (19 524)**, 36,7 s (PROUVÉ).
