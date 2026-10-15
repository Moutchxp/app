# Bascule Mac → serveur — le déroulé, commande par commande

> Rédigé le 15/10/2026 en LECTURE SEULE (rien n'a été exécuté) à partir de `docs/BASCULE_CHECKLIST.md`,
> `docs/BASCULE_LIDAR.md`, `scripts/bascule-sans-lidar.sh`, `deploy/systemd/`, de l'état MESURÉ du Mac ce jour-là, et
> des réponses MESURÉES par Arno sur le serveur les 14-15/10/2026 (compte, dossiers, services, sauvegarde, MinIO).
> Chaque étape dit : **OÙ** la coller, **CE QU'ELLE FAIT**, **CE QUE VOUS DEVEZ VOIR** pour continuer, **SINON**.
>
> 🔴 RÈGLE D'OR : **jamais le Mac et le serveur en même temps** (double relève, mails envoyés deux fois aux mairies).
> 🔴 Drive : le dossier « Documents clients scannés » (GESTION LOCATIVE › 1 actifs / 2 vendus / 3 perdus) n'est touché
> par AUCUNE étape, ni par aucun test. Les tests Drive se font UNIQUEMENT dans « _TEST bascule », créé à la main.

## État de départ

**Mac (mesuré le 15/10/2026)**

| Élément | Mesure | Comment il démarre |
|---|---|---|
| `com.sansvisavis.gestion-continu` | chargé, **en cours** | launchd, `~/Library/LaunchAgents/`, `RunAtLoad` + `KeepAlive` |
| `com.sansvisavis.veille` | chargé (toutes les 15 min) | launchd, idem |
| `com.sansvisavis.drive-empreintes` | chargé (toutes les 15 min) | launchd, idem |
| Les 3 fichiers `.plist` | identiques à ceux de `ops/` (vérifié par `diff`) | — |
| `next dev` | en cours (`npm run dev`, sans terminal : lancé par VS Code ou une session Claude Code) | à la main — ne redémarre pas seul |
| MinIO | en cours (`./.minio/minio server ./.minio/data`, onglet Terminal), 1,9 Go (`svav-dev` + `svav-jetable`) | à la main — ne redémarre pas seul |
| `cloudflared tunnel --url http://localhost:3000` | en cours (onglet Terminal), tunnel rapide | à la main — ne redémarre pas seul |
| PostgreSQL 17 | en cours (`homebrew.mxcl.postgresql@17`) | Homebrew — **reste allumé** (sauvegarde, retour arrière) |
| Base `sansvisavis` | 11 Go (LiDAR : 1 dalle, 64 + 64 tuiles) ; disque libre : 144 Go | — |
| File d'envoi Gmail | aucune en attente ; 4 « echec » (jamais réessayés automatiquement) | — |
| Migrations | 352, 354, 355, 356, 357 appliquées (353 inutile sur le Mac) | — |

**Serveur (mesuré par Arno, 14-15/10/2026)**

| Élément | Valeur |
|---|---|
| Compte | `ubuntu` (connexion `ssh svav-prod`, raccourci qui fonctionne) |
| Dossier de l'application | `/home/ubuntu/sansvisavis/app` |
| Réglages systemd | `/etc/svav/svav.conf` (APP_DIR=/home/ubuntu/sansvisavis/app, SVAV_USER=ubuntu, SVAV_GROUP=ubuntu, NODE=/usr/bin/node, NEXT_HOST=127.0.0.1, NEXT_PORT=3000) ; Node 24.22 |
| Sauvegarde | `/usr/local/bin/svav-sauvegarde` lancé par `svav-sauvegarde.service` (minuteur 03 h 30) : base sans contenu LiDAR + `minio.tar` + `reglages.tgz`, dans `/home/ubuntu/sauvegardes/<AAAA-MM-JJ_HHMM>/` avec le témoin `TERMINEE` ; suivi de `/usr/local/bin/svav-sauvegarde-ovh` (copie chiffrée vers `/mnt/svav-ovh`) |
| MinIO | service `svav-minio`, données `/home/ubuntu/sansvisavis/minio/data`, écoute `127.0.0.1:9000`, identifiants dans `/etc/svav/minio.env` (identiques au `.env`), compartiments `svav-dev` et `svav-jetable` ; même version que le Mac (premier transfert fait par `tar` via ssh) |
| Migrations | 352 à 357 toutes appliquées |
| Services actifs | `svav-next`, `svav-minio`, `caddy`, `postgresql`, `svav-surveillance.timer`, `svav-sauvegarde.timer` ; `svav-lidar-import` terminé — **ne pas relancer** |
| LiDAR attendu | **265 088 tuiles par table** (`mns_lidar_brut`, `mnt_lidar_brut`) : 4 142 dalles × 64 = 4 141 importées + Asnières (mesuré par Arno le 15/10/2026) |
| À installer à la bascule | `svav-gestion-continu`, `svav-veille.timer`, `svav-drive-empreintes.timer`, `svav-analytics-maintenance.timer` |

## Conventions

- **« Terminal Mac »** = l'application Terminal de macOS, **fenêtre neuve**. Première commande : `whoami` → doit
  répondre `macbookprom4arnaud` ; seconde : `cd /Users/macbookprom4arnaud/sansvisavis/app`.
  **Gardez la même fenêtre de A1 jusqu'à la fin de C** (elle porte la variable `$BASCULE`). Si elle a été fermée :
  `export BASCULE=/Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/2026-10-15_1113` (dossier de la bascule du
  15/10/2026).
- **« Serveur »** = une session `ssh svav-prod` (compte `ubuntu`).
- **« Serveur (app) »** = la même session, placée dans le dossier de l'application avec le `.env` chargé (sans
  l'afficher) — à refaire après chaque nouvelle connexion :
  `cd /home/ubuntu/sansvisavis/app && set -a && . ./.env && set +a`

---

## 0. Reconnaissance du serveur (lecture seule, la veille ou le matin même)

**0.1 — Serveur**
```sh
systemctl is-active svav-next svav-minio caddy postgresql svav-surveillance.timer svav-sauvegarde.timer; df -h /home
```
- Fait : affiche l'état des six services déjà installés, et la place disque.
- Vous devez voir : six fois `active`, et au moins 30 Go libres.
- Sinon : un service `inactive` ou `failed` → `journalctl -u <service> -n 30 --no-pager`, et me le transmettre ;
  moins de 30 Go → ne pas continuer.

**0.2 — Serveur**
```sh
cd /home/ubuntu/sansvisavis/app && set -a && . ./.env && set +a && git log -1 --oneline && grep -c '^SITE_URL=https://authentification.sansvisavis.com$' .env
```
- Fait : se place dans l'application, charge le `.env`, montre la version du code et vérifie `SITE_URL`.
- Vous devez voir : une ligne de commit, puis `1`.
- Sinon : `0` → `SITE_URL` n'est pas `https://authentification.sansvisavis.com` (voir G) ; à corriger dans le `.env`
  du serveur avant D.

**0.3 — Serveur (app)** — LiDAR, référence AVANT
```sh
psql "$DATABASE_URL" -At -c "select 'mns', count(*) from mns_lidar_brut union all select 'mnt', count(*) from mnt_lidar_brut"
```
- Fait : compte les tuiles LiDAR du serveur.
- Vous devez voir : `mns|265088` et `mnt|265088`.
- Sinon : noter les deux nombres tels quels — ce sont eux qui doivent rester identiques après la copie (C7) ; me prévenir.

---

## A. Avant : sauvegardes

> **FAITE ET VÉRIFIÉE le 15/10/2026 (Arno)** : Mac → `/Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/2026-10-15_1113/`
> (`mac-base` au format répertoire `-Fd`, et `mac-minio-data.tgz`) ; serveur → `/home/ubuntu/sauvegardes/2026-10-15_1116/`
> et `/home/ubuntu/sauvegardes/serveur-avant-bascule.dump`.

**A1 — Terminal Mac**
```sh
export BASCULE=/Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/$(date +%Y-%m-%d_%H%M) && mkdir -p "$BASCULE" && echo "$BASCULE"
```
- Fait : crée un dossier daté pour la bascule, HORS du dépôt et hors `.captures`.
- Vous devez voir : `/Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/2026-…`.
- Sinon : message d'erreur → vérifier l'orthographe, recommencer.

**A2 — Terminal Mac** (même fenêtre)
```sh
pg_dump -Fc -d sansvisavis -f "$BASCULE/mac-complet.dump" && ls -lh "$BASCULE/mac-complet.dump" && pg_restore -l "$BASCULE/mac-complet.dump" | wc -l
```
- Fait : sauvegarde COMPLÈTE de la base du Mac (LiDAR compris : 1 dalle), puis liste son contenu pour s'assurer
  qu'elle est lisible. Durée : quelques minutes (11 Go en base).
- Vous devez voir : un fichier de plusieurs Go, puis un nombre d'environ 2 000 (objets de la base).
- Sinon : erreur ou fichier de quelques Ko → NE PAS CONTINUER ; me transmettre le message.

**A3 — Terminal Mac** (même fenêtre)
```sh
tar -C /Users/macbookprom4arnaud/sansvisavis/app/.minio -czf "$BASCULE/mac-minio-data.tgz" data && ls -lh "$BASCULE/mac-minio-data.tgz"
```
- Fait : copie de secours des fichiers MinIO du Mac (pièces, certificats, photos), 1,9 Go avant compression.
- Vous devez voir : un fichier d'environ 1 à 2 Go.
- Sinon : erreur → recommencer ; disque plein → s'arrêter.

**A4 — Serveur** — la sauvegarde habituelle, tout de suite
```sh
sudo systemctl start svav-sauvegarde.service && systemctl show -p Result svav-sauvegarde.service && D=$(ls -t /home/ubuntu/sauvegardes | head -1) && echo "$D" && ls -lh /home/ubuntu/sauvegardes/$D
```
- Fait : lance la sauvegarde du serveur (base sans contenu LiDAR, `minio.tar`, `reglages.tgz`), attend sa fin (elle
  est ensuite copiée, chiffrée, vers `/mnt/svav-ovh`), puis montre le dossier qu'elle vient de créer.
- Vous devez voir : `Result=success`, un dossier daté d'aujourd'hui (heure de maintenant), contenant le fichier de la
  base, `minio.tar`, `reglages.tgz` et le témoin `TERMINEE`.
- Sinon : `Result=` autre que `success` ou pas de `TERMINEE` → `journalctl -u svav-sauvegarde -n 40 --no-pager` et me
  le transmettre ; ne pas continuer sans une sauvegarde terminée.

**A5 — Serveur (app)** — filet de retour arrière, au format du script de bascule
```sh
scripts/bascule-sans-lidar.sh exporter "$DATABASE_URL" /home/ubuntu/sauvegardes/serveur-avant-bascule.dump && chmod 600 /home/ubuntu/sauvegardes/serveur-avant-bascule.dump
```
- Fait : exporte la base du serveur sans les données LiDAR (jamais touchées), dans le format que `restaurer` relit
  directement — c'est le fichier de H1.4 pour rendre au serveur son état d'avant.
- Vous devez voir : `[bascule] export : /home/ubuntu/sauvegardes/serveur-avant-bascule.dump (… G) — données LiDAR exclues`.
- Sinon : me transmettre le message (A4 reste la sauvegarde de référence).

---

## B. Arrêter TOUS les automatismes du Mac — durablement, et réversiblement

**B1 — Terminal Mac** (même fenêtre) — attendre la fin d'une passe de veille
```sh
psql -d sansvisavis -At -c "select statut, demarre_le from veille_run order by demarre_le desc limit 1"
```
- Vous devez voir : un statut **autre que** `en_cours`.
- Sinon : attendre 2 minutes et relancer la commande.

**B2 — Terminal Mac** — arrêt ET désactivation des 3 tâches launchd
```sh
for l in com.sansvisavis.veille com.sansvisavis.drive-empreintes com.sansvisavis.gestion-continu; do launchctl bootout gui/$(id -u)/$l; launchctl disable gui/$(id -u)/$l; done
```
- Fait : `bootout` arrête et décharge chaque tâche maintenant ; `disable` l'empêche de repartir au prochain démarrage
  du Mac ou à la prochaine ouverture de session (les `.plist` restent en place, rien n'est effacé).
- Vous devez voir : rien, ou « Boot-out failed: 3: No such process » pour une tâche déjà arrêtée (sans gravité).
- Sinon : un autre message → me le transmettre.

**B3 — Terminal Mac** — vérification
```sh
launchctl list | grep -i sansvisavis; echo "---"; launchctl print-disabled gui/$(id -u) | grep -i sansvisavis; echo "---"; pgrep -fl relever-gestion-continu
```
- Vous devez voir : rien avant le premier `---` ; trois lignes `com.sansvisavis.… => disabled` (selon la version de
  macOS : `=> true`) entre les deux ; rien après le second.
- Sinon : une tâche encore listée → relancer B2 ; un processus restant → `pkill -f relever-gestion-continu`, puis B3.

**B4 — Terminal Mac** — file d'envoi Gmail vide
```sh
psql -d sansvisavis -At -c "select etat, count(*) from gestion_envoi_file where etat in ('attente','en_cours') group by etat"
```
- Vous devez voir : rien.
- Sinon : une ligne → me prévenir avant de continuer (ne pas relancer la relève du Mac).

**B5 — Terminal Mac** — arrêt du site local et du tunnel
```sh
pkill -f "next dev"; pkill -f "next-server"; pkill -f "cloudflared tunnel --url http://localhost:3000"; sleep 2; pgrep -fl "next|cloudflared"
```
- Fait : arrête `next dev` et le tunnel rapide (lancés à la main, ils ne redémarrent pas seuls).
- Vous devez voir : rien.
- Sinon : un `next` restant → fermer la fenêtre VS Code ou la session (Claude Code compris) qui l'a lancé, puis B5.

**B6 — Terminal Mac** — arrêt de MinIO du Mac (la copie C8 se fait sur ses fichiers, MinIO arrêté)
```sh
pkill -f "minio server ./.minio/data"; sleep 2; pgrep -fl minio
```
- Vous devez voir : rien.
- Sinon : aller dans l'onglet Terminal où il tourne et taper Ctrl-C.

**Remettre le Mac en route plus tard (réversible)** — Terminal Mac :
```sh
for l in com.sansvisavis.veille com.sansvisavis.drive-empreintes com.sansvisavis.gestion-continu; do launchctl enable gui/$(id -u)/$l; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/$l.plist; done; launchctl list | grep sansvisavis
```
Attendu : les 3 noms listés. MinIO et le site, chacun dans un onglet à lui, depuis
`/Users/macbookprom4arnaud/sansvisavis/app` : `./.minio/minio server ./.minio/data --address :9000 --console-address :9001`
et `npm run dev`. ⚠️ Jamais tant que les automatismes du serveur tournent (section H).

---

## C. Copie fraîche Mac → serveur (base SANS le LiDAR, puis fichiers MinIO)

> Le script ne touche JAMAIS aux 4 tables LiDAR : il n'exporte pas leurs données et retire de la liste de restauration
> toute entrée qui porte leur nom (tables, séquences, index, contraintes, données). `--clean` ne supprime que ce qui
> reste dans cette liste : aucun `DROP` ni `TRUNCATE` sur `mns_lidar_brut`, `mnt_lidar_brut`, `mns_bati_propre`,
> `rge_alti` — vérifié dans `scripts/bascule-sans-lidar.sh`. Il compte les tuiles avant/après et sort en erreur si le
> nombre change.

**C1 — Terminal Mac** (même fenêtre) — comptes de référence côté Mac
```sh
psql -d sansvisavis -At -f - > "$BASCULE/comptes-mac.txt" <<'SQL'
select 'admin_utilisateur', count(*) from admin_utilisateur union all select 'internaute', count(*) from internaute
union all select 'certificat', count(*) from certificat union all select 'demande', count(*) from demande
union all select 'demande_dossier', count(*) from demande_dossier union all select 'dossier_document', count(*) from dossier_document
union all select 'gestion_fil', count(*) from gestion_fil union all select 'gestion_message', count(*) from gestion_message
union all select 'gestion_piece', count(*) from gestion_piece union all select 'gestion_journal', count(*) from gestion_journal
union all select 'gestion_tache', count(*) from gestion_tache union all select 'gestion_envoi_file', count(*) from gestion_envoi_file
union all select 'permis_empreinte', count(*) from permis_empreinte union all select 'sitadel_dossier', count(*) from sitadel_dossier
union all select 'veille_run', count(*) from veille_run union all select 'batiment', count(*) from batiment
union all select 'parcelle', count(*) from parcelle;
SQL
cat "$BASCULE/comptes-mac.txt"
```
- Fait : compte les lignes de 17 tables clés, une fois le Mac arrêté (plus rien ne bouge).
- Vous devez voir : 17 lignes `table|nombre` (au 15/10 par exemple : `gestion_message|58275`, `sitadel_dossier|72234`).
- Sinon : « relation does not exist » → me la transmettre.

**C2 — Terminal Mac** — export sans LiDAR
```sh
scripts/bascule-sans-lidar.sh exporter sansvisavis "$BASCULE/svav-sans-lidar.dump"
```
- Vous devez voir : `[bascule] export : …/svav-sans-lidar.dump (… G) — données LiDAR exclues`.
- Sinon : me transmettre le message.

**C3 — Terminal Mac** — copie du fichier et des comptes vers le serveur
```sh
scp "$BASCULE/svav-sans-lidar.dump" "$BASCULE/comptes-mac.txt" svav-prod:/home/ubuntu/ && ssh svav-prod 'chmod 600 /home/ubuntu/svav-sans-lidar.dump && ls -lh /home/ubuntu/svav-sans-lidar.dump /home/ubuntu/comptes-mac.txt'
```
- Vous devez voir : les deux fichiers listés, le premier de la même taille qu'en C2.
- Sinon : me transmettre le message.

**C4 — Serveur** — arrêter le site et la surveillance pendant la copie
```sh
sudo systemctl stop svav-surveillance.timer svav-next && systemctl is-active svav-next svav-surveillance.timer
```
- Fait : arrête le site (il tient des connexions à la base) et la surveillance (sinon un mail « site arrêté » part
  pendant la copie). La sauvegarde de 03 h 30 n'est pas concernée.
- Vous devez voir : deux fois `inactive`.
- Sinon : me transmettre le message.

**C5 — Serveur (app)** — essai à blanc
```sh
scripts/bascule-sans-lidar.sh essai /home/ubuntu/svav-sans-lidar.dump "$DATABASE_URL" | tail -20
```
- Fait : montre, SANS RIEN ÉCRIRE, le LiDAR de la cible et les entrées que la restauration laissera de côté.
- Vous devez voir : `LiDAR de la cible (intouché) : mns_lidar_brut=265088 mnt_lidar_brut=265088 mns_bati_propre=0 rge_alti=0`
  (ou les nombres de 0.3), la liste des entrées LiDAR / EXTENSION / SCHEMA écartées, et un nombre d'entrées restaurées.
- Sinon : un nombre LiDAR différent de 0.3 → STOP, me prévenir.

**C6 — Serveur (app)** — restauration
```sh
scripts/bascule-sans-lidar.sh restaurer /home/ubuntu/svav-sans-lidar.dump "$DATABASE_URL"
```
- Fait : remplace, en UNE transaction, toutes les données et tables du serveur par celles du Mac — sauf le LiDAR.
  Une erreur annule tout (le serveur reste tel qu'avant). Durée : de quelques minutes à une demi-heure.
- Vous devez voir : `LiDAR de la cible avant : …`, puis `après : …` IDENTIQUE, puis
  `[bascule] terminé : LiDAR du serveur intact`.
- Sinon : erreur pg_restore → rien n'a changé (transaction annulée) : me transmettre le message, puis H1 si besoin.
  `⚠️ LE LiDAR A CHANGÉ` → STOP immédiat, ne rien relancer, me prévenir.

**C7 — Serveur (app)** — vérifications après restauration
```sh
psql "$DATABASE_URL" -At -c "select 'mns', count(*) from mns_lidar_brut union all select 'mnt', count(*) from mnt_lidar_brut"
sed -e 's/|.*//' /home/ubuntu/comptes-mac.txt | while read t; do echo "$t|$(psql "$DATABASE_URL" -At -c "select count(*) from $t")"; done > /home/ubuntu/comptes-serveur.txt; diff /home/ubuntu/comptes-mac.txt /home/ubuntu/comptes-serveur.txt && echo "COMPTES IDENTIQUES"
```
- Vous devez voir : `mns|265088`, `mnt|265088` (comme en 0.3), puis `COMPTES IDENTIQUES`.
- Sinon : me transmettre la sortie de `diff` (rien d'irréversible : la base du Mac est intacte, le serveur a A4 et A5).

**C8 — Fichiers MinIO, par `tar` via ssh** (méthode du premier transfert ; même version de MinIO des deux côtés ;
seul le compartiment `svav-dev` est copié — `svav-jetable` sert aux essais, `.minio.sys` reste celui du serveur)

C8.1 — Terminal Mac (même fenêtre) : nombre d'objets côté Mac (MinIO du Mac arrêté en B6)
```sh
find /Users/macbookprom4arnaud/sansvisavis/app/.minio/data/svav-dev -name xl.meta | wc -l
```
- Vous devez voir : un nombre (un `xl.meta` par objet). Le noter.

C8.2 — Serveur : arrêter MinIO du serveur, compter ses objets
```sh
sudo systemctl stop svav-minio && systemctl is-active svav-minio; find /home/ubuntu/sansvisavis/minio/data/svav-dev -name xl.meta | wc -l
```
- Vous devez voir : `inactive`, puis un nombre (objets déjà présents).
- Sinon : me transmettre le message.

C8.3 — Terminal Mac : la copie
```sh
tar -C /Users/macbookprom4arnaud/sansvisavis/app/.minio/data -cf - svav-dev | ssh svav-prod 'tar -C /home/ubuntu/sansvisavis/minio/data -xf - && echo COPIE_TERMINEE'
```
- Fait : envoie les fichiers du compartiment `svav-dev` du Mac dans celui du serveur (ajoute et remplace ; ne supprime
  rien côté serveur).
- Vous devez voir : `COPIE_TERMINEE`.
- Sinon : relancer la même commande (sans risque) ; erreur persistante → me la transmettre, puis C8.4 quand même.

C8.4 — Serveur : redémarrer MinIO, vérifier
```sh
sudo systemctl start svav-minio && sleep 3 && systemctl is-active svav-minio && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9000/minio/health/live && find /home/ubuntu/sansvisavis/minio/data/svav-dev -name xl.meta | wc -l
```
- Vous devez voir : `active`, `200`, puis un nombre **égal ou supérieur** à celui de C8.1.
- Sinon : MinIO ne démarre pas → `journalctl -u svav-minio -n 40 --no-pager` ; restaurer au besoin le `minio.tar` de la
  sauvegarde A4.

---

## D. Sur le serveur : code, vérification du schéma, construction, golden

**D1 — Terminal Mac** (Arno) — publier le code
```sh
git status --short | grep -v '^??'; git log --oneline origin/main..HEAD | wc -l; git push
```
- Vous devez voir : seulement ` M PASSATION.md` (jamais commité, normal), un nombre de commits, puis la sortie du push.
- Sinon : me transmettre le message.

**D2 — Serveur (app)** — récupérer le code
```sh
git pull --ff-only && npm ci && git log -1 --oneline
```
- Vous devez voir : le dernier commit du Mac (celui de D1).
- Sinon : « Not possible to fast-forward » → le serveur a des modifications locales : me prévenir, ne rien forcer.

**D3 — Serveur (app)** — vérification du schéma (aucune migration à appliquer : 352 à 357 le sont des deux côtés)
```sh
psql "$DATABASE_URL" -At <<'SQL'
select '352', count(*) from information_schema.columns where table_name='config_scoring' and column_name='reentree_tolerance_contact_m';
select '353 (doit être 0)', count(*) from pg_constraint where conname='enforce_max_extent_rast';
select '354', count(*) from information_schema.tables where table_name='analyse_sans_lidar';
select '355', count(*) from analytics_config where cle like 'login_throttle_ip%';
select '356', count(*) from information_schema.columns where table_name='admin_utilisateur' and column_name='session_version';
select '357', count(*) from information_schema.tables where table_name='admin_connexion_journal';
SQL
```
- Fait : vérifie que le schéma copié du Mac porte bien les migrations 352 à 357, et que la contrainte LiDAR levée par
  la 353 n'est pas revenue (le LiDAR et ses contraintes ne sont jamais restaurés).
- Vous devez voir : `352|1`, `353 (doit être 0)|0`, `354|1`, `355|2`, `356|1`, `357|1`.
- Sinon : me transmettre les lignes fausses (ne rien appliquer sans en parler).

**D4 — Serveur (app)** — construire, redémarrer le site
```sh
npm run build 2>&1 | tail -5 && sudo systemctl start svav-next && sleep 5 && systemctl is-active svav-next && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/admin/login
```
- Vous devez voir : la construction terminée sans « Error », puis `active` et `200`.
- Sinon : construction en erreur → me transmettre la fin ; `failed` → `journalctl -u svav-next -n 50 --no-pager`.

**D5 — Serveur (app)** — golden
```sh
npx vitest run --config vitest.integration.config.ts app/lib/db/pipeline.itest.ts 2>&1 | tail -6
```
- Fait : rejoue le golden d'Asnières, **ce fichier seul** (jamais `npm run test:integration` en entier : une trentaine
  d'autres tests écrivent dans la vraie base).
- Vous devez voir : `Tests  11 passed (11)`.
- Sinon : me transmettre la sortie ; ne pas allumer les automatismes (E) tant que le golden n'est pas vert.

---

## E. Allumer les automatismes du serveur, un par un

**E1 — Serveur (app)** — installer les unités manquantes (sans rien activer)
```sh
cd deploy/systemd && ./installer.sh --essai /tmp/units-essai /etc/svav/svav.conf && for u in svav-next.service svav-surveillance.service svav-surveillance.timer; do diff -q /tmp/units-essai/$u /etc/systemd/system/$u; done; cd ../..
```
- Fait : génère les unités dans un dossier d'essai, à partir de `/etc/svav/svav.conf`, et les compare à celles déjà
  installées (site, surveillance).
- Vous devez voir : aucune ligne « differ » (les unités en place sont celles du dépôt).
- Sinon : une unité « differ » → me la signaler avant E1 bis (l'installateur la remplacerait).

**E1 bis — Serveur (app)**
```sh
cd deploy/systemd && sudo ./installer.sh /etc/svav/svav.conf && cd ../.. && systemctl list-unit-files 'svav-*' --no-pager
```
- Fait : installe toutes les unités du dépôt (les existantes à l'identique, plus relève, veille, index Drive,
  maintenance, alertes), sans en démarrer aucune. `svav-sauvegarde`, `svav-minio` et `svav-lidar-import` (hors dépôt)
  ne sont pas touchés.
- Vous devez voir : la liste comprenant `svav-gestion-continu.service`, `svav-veille.timer`,
  `svav-drive-empreintes.timer`, `svav-analytics-maintenance.timer`.
- Sinon : me transmettre la sortie de l'installateur.

**E2 — Serveur** — la relève Gestion
```sh
sudo systemctl enable --now svav-gestion-continu && sleep 90 && journalctl -u svav-gestion-continu -n 30 --no-pager | tail -15
```
- Vous devez voir : des lignes de passe, aucune « non autorisé » / « invalid_grant » / « ECONNREFUSED ».
- Sinon : `sudo systemctl stop svav-gestion-continu`, puis me transmettre le journal.

**E3 — Serveur (app)** — 1re passe de relève en succès
```sh
psql "$DATABASE_URL" -c "select id, resultat, termine_le from gestion_releve_run order by id desc limit 3"
```
- Vous devez voir : une ligne datée de maintenant, résultat en succès.
- Sinon : arrêter le service (E2) et me transmettre ces lignes.

**E4 — Serveur** — l'index des empreintes Drive
```sh
sudo systemctl enable --now svav-drive-empreintes.timer && sleep 90 && journalctl -u svav-drive-empreintes -n 30 --no-pager | tail -10
```
- Vous devez voir : une passe incrémentale terminée, sans erreur de clé.
- Sinon : `sudo systemctl disable --now svav-drive-empreintes.timer`, puis me transmettre le journal.

**E5 — Serveur** — la veille
```sh
sudo systemctl enable --now svav-veille.timer && systemctl list-timers svav-veille.timer --no-pager
```
- Fait : active la veille (1re passe dans 15 min). ⚠️ C'est le fonctionnement normal, pas un essai : une passe envoie la
  cascade partielle aux mairies et les alertes, comme le faisait le Mac.
- Vous devez voir : le minuteur, prochaine exécution dans ≈ 15 min. Après ce délai :
  `journalctl -u svav-veille -n 60 --no-pager | tail -20` puis (Serveur (app))
  `psql "$DATABASE_URL" -c "select statut, fini_le from veille_run order by demarre_le desc limit 1"` → passe terminée sans échec.
- Sinon : `sudo systemctl disable --now svav-veille.timer`, puis me transmettre le journal.

**E6 — Serveur (app)** — la surveillance (arrêtée en C4)
```sh
sudo npm run surveillance -- --essai | tail -15 && sudo systemctl start svav-surveillance.timer && systemctl is-active svav-surveillance.timer
```
- Fait : montre les contrôles et les mails qui partiraient (sans rien envoyer), puis rallume la surveillance.
- Vous devez voir : des contrôles « OK », puis `active`.
- Sinon : me transmettre la sortie (la surveillance n'empêche rien de fonctionner).

**E7** — `svav-analytics-maintenance.timer` : **après** les tests F (décision du 14/10/2026), voir F6.

---

## F. Les tests de la checklist

**F1 — Serveur (app)** — tous les comptes, sans rien envoyer
```sh
npm run smtp:verifier; echo "code de sortie : $?"
```
- Vous devez voir : « OK » pour SMTP défaut, SMTP « personne », Gmail de gestion@, Agenda, Drive ; `code de sortie : 0`.
- Sinon : me transmettre la ligne en échec (aucun envoi n'a eu lieu).

**F2 — Navigateur** — une relève Gestion réussie de bout en bout : depuis
`https://authentification.sansvisavis.com/admin`, Gestion → « Nouveau message » adressé **uniquement** à
a.jorel@sansvisavis.com, objet « _TEST bascule ». Deux minutes plus tard, le fil « _TEST bascule » doit apparaître dans
l'admin (relevé par le serveur).
- Vous devez voir : mail reçu sur a.jorel@ ; présent dans les Envoyés de gestion@ ; le fil dans l'admin ; aucun lien
  `localhost` dans le mail.
- Sinon : me transmettre ce qui manque (et `journalctl -u svav-gestion-continu -n 50 --no-pager`).

**F3 — Drive** (Arno, Drive sur le web d'abord) : créer à la main, sous « Base de données locative », un dossier
« _TEST bascule » avec deux sous-dossiers « A » et « B ». Puis `docs/BASCULE_CHECKLIST.md` §5.5 (5.5.2 à 5.5.7) : ajout
Drive → appli, « Ranger » dans « A » une pièce d'un mail « _TEST » envoyé à a.jorel@sansvisavis.com, déplacement,
renommage, corbeille PAR L'APPLICATION, puis nettoyage (« _TEST bascule » à la corbeille dans Drive web).
- 🔴 Jamais une vraie pièce, jamais un autre dossier, jamais « Documents clients scannés ».
- Vous devez voir : chaque « Attendu » du tableau §5.5.
- Sinon : s'arrêter au geste en échec et me le décrire.

**F4 — Navigateur** — Agenda : dans Gestion, une tâche « _TEST bascule » **confiée à vous-même** (acceptée d'office :
aucun mail d'acceptation), échéance demain. Vérifier l'événement dans votre agenda Google, puis **ANNULER** la tâche.
- Vous devez voir : l'événement apparaît, puis disparaît après l'annulation.
- Sinon : me transmettre le message affiché par la tâche (« Agenda : à resynchroniser… »).

**F5 — Serveur (app)** — certificat, sans émission ni mail
```sh
node .claude/skills/run-svav-app/driver.mjs smoke
```
- Vous devez voir : `HTTP 200` et `"deja":true` (ré-émission d'un certificat existant : aucun mail, aucune ligne).
- Sinon : me transmettre la sortie.

**F6 — Serveur** — maintenance des statistiques (après F1 à F5)
```sh
sudo systemctl enable --now svav-analytics-maintenance.timer && sudo systemctl start svav-analytics-maintenance && journalctl -u svav-analytics-maintenance -n 20 --no-pager | tail -8
```
- Vous devez voir : une passe terminée ; `systemctl list-timers svav-analytics-maintenance.timer` à 04 h 30.
- Sinon : `sudo systemctl disable --now svav-analytics-maintenance.timer` et me transmettre le journal.

---

## G. SITE_URL et QR des certificats (aucune modification)

**Comment le QR est fabriqué** (`app/lib/certificat/siteUrl.ts`) : à l'émission, le PDF grave dans son QR
`SITE_URL` + `/verifier?n=<numéro>&j=<jeton>` (variantes `&doc=anonyme`, `/verifier?ref=…&doc=visuel`), et imprime en
clair `<hôte>/verifier` et le code. **Une fois émis, ce QR ne change plus** : le PDF n'est pas régénéré. En production,
une `SITE_URL` en http, locale, privée ou de tunnel est refusée (aucun PDF fabriqué).

**Nouveaux certificats** : `SITE_URL=https://authentification.sansvisavis.com` dans le `.env` du serveur (contrôlé en
0.2) et `svav-next` redémarré après (D4) suffisent. Les liens des mails internautes (`/verifier`, `/desabonner`,
`/espace/reinitialiser`) suivent la même variable.

**QR déjà émis** (31 certificats au 15/10/2026) :
- ✅ Les données suivent : la copie (C6) amène chaque certificat et son jeton, la copie MinIO (C8) ses PDF. Toute
  vérification qui ARRIVE sur `https://authentification.sansvisavis.com/verifier?…` fonctionne.
- ❌ Un QR vers `https://www.sansvisavis.com/verifier?…` n'arrive pas sur l'application tant qu'aucune redirection
  n'existe chez l'hébergeur de www.sansvisavis.com.
- ✅ Repli : taper à la main, sur la page de vérification de la nouvelle adresse, le numéro et le code imprimés.
- ❌ `SAVV-2026-000023`, gravé le 22/09/2026 avec `http://192.168.1.164:3000`, ne marche plus avec ou sans bascule.

> **CHANTIER SÉPARÉ, HORS BASCULE (décision d'Arno, 15/10/2026)** : poser plus tard, chez l'hébergeur de
> www.sansvisavis.com, une redirection `https://www.sansvisavis.com/verifier…` → `https://authentification.sansvisavis.com/verifier…`
> en conservant la query (`n`, `j`, `doc`, `ref`). Rien à changer dans l'application. Rien de cette bascule n'en dépend.

---

## H. Retour arrière : rallumer le Mac

**H1 — Blocage AVANT E (aucun automatisme du serveur n'a tourné) : ≈ 5 minutes, sans perte.** La base du Mac n'a pas
été modifiée (seulement lue par l'export) ; le serveur n'a rien relevé ni envoyé.
1. Serveur : `sudo systemctl disable --now svav-gestion-continu svav-veille.timer svav-drive-empreintes.timer 2>/dev/null; systemctl is-active svav-gestion-continu`
   → `inactive` (ou « inconnu » s'ils n'étaient pas installés).
2. Terminal Mac : « Remettre le Mac en route » (fin de la section B), puis MinIO et `npm run dev` dans deux onglets.
3. Terminal Mac : `launchctl list | grep sansvisavis` → les 3 noms ; 2 minutes plus tard
   `psql -d sansvisavis -c "select resultat, termine_le from gestion_releve_run order by id desc limit 1"` → une passe de maintenant.
4. Pour rendre au serveur sa base d'avant (facultatif) — Serveur (app) :
   `scripts/bascule-sans-lidar.sh restaurer /home/ubuntu/sauvegardes/serveur-avant-bascule.dump "$DATABASE_URL"` (fichier A5) ;
   ses fichiers MinIO d'avant sont dans le `minio.tar` de A4.

**H2 — Blocage APRÈS E (le serveur a relevé, envoyé, écrit) : PAS en 5 minutes.** Le serveur a des données que le Mac
n'a pas (mails relevés et envoyés, passes de veille, relances datées) : rallumer le Mac tel quel ferait REPARTIR ce que
le serveur a déjà fait (relances aux mairies envoyées deux fois). D'abord ramener la base du serveur sur le Mac :
1. Serveur : arrêter les automatismes (H1.1), puis Serveur (app) :
   `scripts/bascule-sans-lidar.sh exporter "$DATABASE_URL" /home/ubuntu/serveur-retour.dump`.
2. Terminal Mac : `scp svav-prod:/home/ubuntu/serveur-retour.dump /Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/`
   puis `scripts/bascule-sans-lidar.sh restaurer /Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/serveur-retour.dump sansvisavis`
   (le LiDAR du Mac, 1 dalle, reste intact).
3. Fichiers déposés sur le serveur depuis la bascule : `svav-minio` arrêté des deux côtés, la même méthode dans l'autre
   sens : `ssh svav-prod 'tar -C /home/ubuntu/sansvisavis/minio/data -cf - svav-dev' | tar -C /Users/macbookprom4arnaud/sansvisavis/app/.minio/data -xf -`.
4. Puis H1.2 et H1.3.
5. En dernier recours, la sauvegarde complète A2 rend le Mac exactement tel qu'au matin de la bascule — mais elle PERD
   ce que le serveur a fait depuis. Faite le 15/10/2026 au **format répertoire** (`-Fd`) :
   `/Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/2026-10-15_1113/mac-base` ; se restaure par
   `pg_restore --clean --if-exists -d sansvisavis /Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/2026-10-15_1113/mac-base`.

---

## Points encore incertains

1. **Format de `launchctl print-disabled`** : `=> disabled` ou `=> true` selon la version de macOS (B3).
2. **Qui a lancé `next dev`** sur le Mac : `npm run dev` sans terminal (VS Code, ou une session Claude Code) — à fermer à
   la source s'il reparaît (B5).
3. **Propriétaire des fichiers MinIO après `tar`** : extraits par `ubuntu` (C8.3) ; c'est ainsi que le premier transfert
   a fonctionné. Si `svav-minio` refusait de démarrer, vérifier son compte (`systemctl show -p User svav-minio`).
4. **Unités déjà installées vs dépôt** : contrôlé en E1 avant de laisser l'installateur les réécrire.
5. **4 envois Gmail « echec »** : copiés tels quels, jamais réessayés automatiquement (`fileEnvoiRepo.ts` ne reprend que
   « attente » et « en_cours ») — à regarder dans l'admin si l'on veut les relancer à la main.
6. **Durées** (A2, A4, C6, C8) : estimées, non mesurées sur ce volume.
