# Bascule Mac → serveur — le déroulé, commande par commande

> Rédigé le 15/10/2026 en LECTURE SEULE (rien n'a été exécuté) à partir de `docs/BASCULE_CHECKLIST.md`,
> `docs/BASCULE_LIDAR.md`, `scripts/bascule-sans-lidar.sh`, `deploy/systemd/` et de l'état MESURÉ du Mac ce jour-là.
> Chaque étape dit : **OÙ** la coller, **CE QU'ELLE FAIT**, **CE QUE VOUS DEVEZ VOIR** pour continuer, **SINON**.
>
> 🔴 RÈGLE D'OR : **jamais le Mac et le serveur en même temps** (double relève, mails envoyés deux fois aux mairies).
> 🔴 Drive : le dossier « Documents clients scannés » (GESTION LOCATIVE › 1 actifs / 2 vendus / 3 perdus) n'est touché
> par AUCUNE étape, ni par aucun test. Les tests Drive se font UNIQUEMENT dans « _TEST bascule », créé à la main.

## Ce que j'ai mesuré sur le Mac (15/10/2026)

| Élément | Mesure | Comment il démarre |
|---|---|---|
| `com.sansvisavis.gestion-continu` | chargé, **en cours** (processus 62757) | launchd, `~/Library/LaunchAgents/`, `RunAtLoad` + `KeepAlive` |
| `com.sansvisavis.veille` | chargé (toutes les 15 min) | launchd, idem |
| `com.sansvisavis.drive-empreintes` | chargé (toutes les 15 min) | launchd, idem |
| Les 3 fichiers `.plist` | identiques à ceux de `ops/` (vérifié par `diff`) | — |
| `next dev` | en cours (`npm run dev`, sans terminal : lancé par VS Code ou une session Claude Code) | à la main — ne redémarre pas seul |
| MinIO | en cours (`./.minio/minio server ./.minio/data`, onglet Terminal `ttys000`), données : 1,9 Go (`svav-dev` + `svav-jetable`) | à la main — ne redémarre pas seul |
| `cloudflared tunnel --url http://localhost:3000` | en cours (onglet Terminal `ttys002`), tunnel rapide | à la main — ne redémarre pas seul |
| PostgreSQL 17 | en cours (`homebrew.mxcl.postgresql@17`) | Homebrew — **reste allumé** (sauvegarde, retour arrière) |
| Base `sansvisavis` | 11 Go (LiDAR : 1 dalle, 64 + 64 tuiles) ; disque libre : 144 Go | — |
| File d'envoi Gmail | 24 « envoye », 4 « echec », **aucune en attente** (les « echec » ne sont JAMAIS réessayés automatiquement) | — |
| Outils | `pg_dump` 17.10, `psql`, `rsync` présents ; **`mc` (client MinIO) ABSENT** | — |
| Migrations | 352 et 354 appliquées sur le Mac ; 353, 355, 356, 357 non | — |

## Conventions

- **« Terminal Mac »** = l'application Terminal de macOS, **fenêtre neuve**. La première commande de chaque fenêtre est
  `whoami`, qui doit répondre `macbookprom4arnaud` ; la seconde : `cd /Users/macbookprom4arnaud/sansvisavis/app`.
  **Gardez la même fenêtre de A1 jusqu'à la fin de C** (elle porte la variable `$BASCULE`).
- **« Serveur »** = `ssh svav-prod`, puis les commandes sont tapées sur le serveur.
- **« Session svav »** = sur le serveur, la session du compte des services, ouverte par l'étape 0.2 :
  `sudo -u <SVC> -H bash`, puis `cd <APP> && set -a && . ./.env && set +a` (charge `DATABASE_URL` sans l'afficher).
- `<SVC>` (compte des services) et `<APP>` (dossier du dépôt) sont à **relever à l'étape 0.1** — la documentation dit
  `svav` et `/srv/sansvisavis/app`, **non vérifié** (voir « Points incertains »).

---

## 0. Reconnaissance du serveur (lecture seule, la veille ou le matin même)

**0.1 — Serveur**
```sh
systemctl show -p User -p WorkingDirectory svav-next.service; systemctl is-active svav-next svav-minio; df -h /
```
- Fait : affiche le compte et le dossier du site, l'état du site et de MinIO, la place disque.
- Vous devez voir : `User=svav` (ou un autre nom : c'est `<SVC>`), `WorkingDirectory=/srv/sansvisavis/app` (c'est
  `<APP>`), deux fois `active`, et au moins 30 Go libres.
- Sinon : `svav-minio` inconnu → me demander (le nom de l'unité MinIO du serveur n'est pas dans le dépôt) ; moins de
  30 Go → ne pas continuer.

**0.2 — Serveur** (ouvrir la session svav)
```sh
sudo -u svav -H bash
cd /srv/sansvisavis/app && set -a && . ./.env && set +a && git log -1 --oneline && grep -c '^SITE_URL=https://authentification.sansvisavis.com$' .env
```
- Fait : ouvre la session du compte des services, charge le `.env`, montre la version du code et vérifie `SITE_URL`.
- Vous devez voir : une ligne de commit, puis `1`.
- Sinon : `0` → `SITE_URL` n'est pas `https://authentification.sansvisavis.com` (voir section G) ; à corriger dans le
  `.env` du serveur avant D.

**0.3 — Session svav** (LiDAR du serveur, référence AVANT)
```sh
psql "$DATABASE_URL" -At -c "select 'mns', count(*) from mns_lidar_brut union all select 'mnt', count(*) from mnt_lidar_brut"
```
- Fait : compte les tuiles LiDAR du serveur.
- Vous devez voir : `mns|265024` et `mnt|265024` (4 141 dalles × 64 tuiles).
- Sinon : noter les deux nombres tels quels — ce sont eux qui doivent rester identiques après la copie (étape C7).

---

## A. Avant : deux sauvegardes

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
- Sinon : erreur → recommencer ; si le disque est plein, s'arrêter.

**A4 — Serveur** (sauvegarde du serveur, par le script existant)
```sh
sudo svav-sauvegarde        # ⚠️ NOM ET FORME À CONFIRMER — le script n'est pas dans le dépôt (voir « Points incertains »)
ls -lt /home/ubuntu/sauvegardes | head -3
```
- Fait : lance la sauvegarde habituelle du serveur (celle de 03 h 30), puis montre les dernières sauvegardes.
- Vous devez voir : un dossier daté d'aujourd'hui, contenant un fichier `TERMINEE` (c'est ce que lit la surveillance).
- Sinon : si le script porte un autre nom, utiliser le bon ; s'il n'existe pas, faire au moins A5.

**A5 — Session svav** (filet supplémentaire, toujours possible)
```sh
scripts/bascule-sans-lidar.sh exporter "$DATABASE_URL" /tmp/serveur-avant-bascule.dump && chmod 600 /tmp/serveur-avant-bascule.dump
```
- Fait : sauvegarde de la base du serveur SANS les données LiDAR (141 Go, jamais touchées par la bascule) — c'est le
  fichier qui permet de revenir à l'état d'avant côté serveur.
- Vous devez voir : `[bascule] export : /tmp/serveur-avant-bascule.dump (… G) — données LiDAR exclues`.
- Sinon : me transmettre le message ; ne pas continuer sans au moins une sauvegarde du serveur (A4 ou A5).

---

## B. Arrêter TOUS les automatismes du Mac — durablement, et réversiblement

**B1 — Terminal Mac** (même fenêtre) — attendre la fin d'une passe de veille
```sh
psql -d sansvisavis -At -c "select statut, demarre_le from veille_run order by demarre_le desc limit 1"
```
- Fait : montre l'état de la dernière passe de veille.
- Vous devez voir : un statut **autre que** `en_cours`.
- Sinon : attendre 2 minutes et relancer la commande.

**B2 — Terminal Mac** — arrêt ET désactivation des 3 tâches launchd
```sh
for l in com.sansvisavis.veille com.sansvisavis.drive-empreintes com.sansvisavis.gestion-continu; do launchctl bootout gui/$(id -u)/$l; launchctl disable gui/$(id -u)/$l; done
```
- Fait : `bootout` arrête et décharge chaque tâche maintenant ; `disable` empêche qu'elle reparte au prochain
  démarrage du Mac ou à la prochaine ouverture de session (les fichiers `.plist` restent en place, rien n'est effacé).
- Vous devez voir : rien, ou une ligne « Boot-out failed: 3: No such process » pour une tâche déjà arrêtée (sans gravité).
- Sinon : un autre message → me le transmettre.

**B3 — Terminal Mac** — vérification
```sh
launchctl list | grep -i sansvisavis; echo "---"; launchctl print-disabled gui/$(id -u) | grep -i sansvisavis; echo "---"; pgrep -fl relever-gestion-continu
```
- Fait : vérifie qu'aucune tâche n'est chargée, que les 3 sont marquées désactivées, et que la relève est morte.
- Vous devez voir : rien avant le premier `---` ; trois lignes `com.sansvisavis.… => disabled` (selon la version de
  macOS, `=> true`) entre les deux ; rien après le second.
- Sinon : une tâche encore listée → relancer B2 ; un processus `relever-gestion-continu` restant →
  `pkill -f relever-gestion-continu`, puis refaire B3.

**B4 — Terminal Mac** — file d'envoi Gmail vide
```sh
psql -d sansvisavis -At -c "select etat, count(*) from gestion_envoi_file where etat in ('attente','en_cours') group by etat"
```
- Fait : cherche un mail encore en attente d'envoi (qui partirait une seconde fois depuis le serveur).
- Vous devez voir : rien.
- Sinon : une ligne → me prévenir avant de continuer (ne pas relancer la relève du Mac).

**B5 — Terminal Mac** — arrêt du site local et du tunnel
```sh
pkill -f "next dev"; pkill -f "next-server"; pkill -f "cloudflared tunnel --url http://localhost:3000"; sleep 2; pgrep -fl "next|cloudflared"
```
- Fait : arrête `next dev` et le tunnel rapide (lancés à la main : ils ne redémarrent pas seuls au prochain démarrage).
- Vous devez voir : rien.
- Sinon : un processus `next` restant → fermer la fenêtre VS Code ou la session qui l'a lancé, puis refaire B5. Si une
  session Claude Code tourne encore, fermez-la : elle a pu lancer `npm run dev`.

**MinIO du Mac reste allumé jusqu'à la fin de C** (il sert à la copie des fichiers). Il sera arrêté en C9.

**Remettre le Mac en route plus tard (réversible)** — Terminal Mac :
```sh
for l in com.sansvisavis.veille com.sansvisavis.drive-empreintes com.sansvisavis.gestion-continu; do launchctl enable gui/$(id -u)/$l; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/$l.plist; done; launchctl list | grep sansvisavis
```
Attendu : les 3 noms listés. MinIO et le site : `cd /Users/macbookprom4arnaud/sansvisavis/app && ./.minio/minio server ./.minio/data --address :9000 --console-address :9001`
(dans un onglet à lui) et `npm run dev` (dans un autre). ⚠️ Jamais tant que les services du serveur tournent (section H).

---

## C. Copie fraîche Mac → serveur (base SANS le LiDAR, puis fichiers MinIO)

> Le script ne touche JAMAIS aux 4 tables LiDAR : il n'exporte pas leurs données, et retire de la liste de restauration
> toute entrée qui porte leur nom (tables, séquences, index, contraintes, données). `--clean` ne supprime que ce qui
> reste dans cette liste : aucun `DROP` ni `TRUNCATE` sur `mns_lidar_brut`, `mnt_lidar_brut`, `mns_bati_propre`,
> `rge_alti` — vérifié dans `scripts/bascule-sans-lidar.sh`. Le script compte les tuiles avant/après et sort en erreur
> si le nombre change.

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
- Fait : compte les lignes de 17 tables clés, une fois les automatismes du Mac arrêtés (plus rien ne bouge).
- Vous devez voir : 17 lignes `table|nombre` (au 15/10 par exemple : `gestion_message|58275`, `sitadel_dossier|72234`).
- Sinon : une erreur « relation does not exist » → me la transmettre.

**C2 — Terminal Mac** — export sans LiDAR
```sh
scripts/bascule-sans-lidar.sh exporter sansvisavis "$BASCULE/svav-sans-lidar.dump"
```
- Fait : exporte la base du Mac, données LiDAR exclues.
- Vous devez voir : `[bascule] export : …/svav-sans-lidar.dump (… G) — données LiDAR exclues`.
- Sinon : me transmettre le message.

**C3 — Terminal Mac** — copie du fichier et des comptes vers le serveur
```sh
scp "$BASCULE/svav-sans-lidar.dump" "$BASCULE/comptes-mac.txt" svav-prod:/tmp/ && ssh svav-prod 'ls -lh /tmp/svav-sans-lidar.dump /tmp/comptes-mac.txt'
```
- Fait : envoie le fichier exporté et les comptes de référence sur le serveur.
- Vous devez voir : les deux fichiers listés, le premier de la même taille qu'en C2.
- Sinon : « Permission denied » ou « Could not resolve hostname svav-prod » → l'alias `svav-prod` de `~/.ssh/config`
  manque ou ne marche pas ; me le dire.

**C4 — Serveur** (pas la session svav) — arrêter le site et la surveillance pendant la copie
```sh
sudo systemctl stop svav-surveillance.timer svav-next && systemctl is-active svav-next; sudo chown svav: /tmp/svav-sans-lidar.dump /tmp/comptes-mac.txt && sudo chmod 600 /tmp/svav-sans-lidar.dump
```
- Fait : arrête le site (il tient des connexions à la base) et la surveillance (sinon un mail « site arrêté » part
  pendant la copie), puis donne les fichiers au compte des services.
- Vous devez voir : `inactive`.
- Sinon : me transmettre le message. (`svav-surveillance.timer` absent : sans gravité, il n'était pas installé.)

**C5 — Session svav** — essai à blanc
```sh
scripts/bascule-sans-lidar.sh essai /tmp/svav-sans-lidar.dump "$DATABASE_URL" | tail -20
```
- Fait : montre, SANS RIEN ÉCRIRE, le LiDAR de la cible et les entrées que la restauration laissera de côté.
- Vous devez voir : `LiDAR de la cible (intouché) : mns_lidar_brut=265024 mnt_lidar_brut=265024 mns_bati_propre=0 rge_alti=0`
  (ou les nombres notés en 0.3), une liste d'entrées LiDAR / EXTENSION / SCHEMA écartées, et un nombre d'entrées restaurées.
- Sinon : un nombre LiDAR différent de 0.3 → STOP, me prévenir.

**C6 — Session svav** — restauration
```sh
scripts/bascule-sans-lidar.sh restaurer /tmp/svav-sans-lidar.dump "$DATABASE_URL"
```
- Fait : remplace, en UNE transaction, toutes les données et tables du serveur par celles du Mac — sauf le LiDAR.
  Une erreur annule tout (le serveur reste tel qu'avant). Durée : de quelques minutes à une demi-heure.
- Vous devez voir : `LiDAR de la cible avant : …`, puis `LiDAR de la cible après : …` IDENTIQUE, puis
  `[bascule] terminé : LiDAR du serveur intact`.
- Sinon : une erreur pg_restore → rien n'a changé (transaction annulée) : me transmettre le message, puis H1 si besoin.
  `⚠️ LE LiDAR A CHANGÉ` → STOP immédiat, ne rien relancer, me prévenir.

**C7 — Session svav** — vérifications après restauration
```sh
psql "$DATABASE_URL" -At -c "select 'mns', count(*) from mns_lidar_brut union all select 'mnt', count(*) from mnt_lidar_brut"
sed -e 's/|.*//' /tmp/comptes-mac.txt | while read t; do echo "$t|$(psql "$DATABASE_URL" -At -c "select count(*) from $t")"; done > /tmp/comptes-serveur.txt; diff /tmp/comptes-mac.txt /tmp/comptes-serveur.txt && echo "COMPTES IDENTIQUES"
```
- Fait : recompte le LiDAR du serveur, puis les 17 tables clés, et les compare à ceux du Mac.
- Vous devez voir : `mns|265024`, `mnt|265024` (comme en 0.3), puis `COMPTES IDENTIQUES`.
- Sinon : une différence de comptes → me transmettre la sortie de `diff` (rien d'irréversible : la base du Mac est
  intacte et le serveur a sa sauvegarde A4/A5).

**C8 — Terminal Mac + Serveur** — copie des fichiers MinIO (objet par objet)

C8.a — Terminal Mac (même fenêtre) : installer le client MinIO, une fois
```sh
brew install minio/stable/mc && mc --version
```
- Vous devez voir : une version de `mc`. Sinon : me transmettre le message.

C8.b — **Terminal Mac, fenêtre neuve n° 2** (à laisser ouverte pendant la copie) : tunnel vers le MinIO du serveur
```sh
ssh -N -L 9100:127.0.0.1:9000 svav-prod
```
- Fait : rend le MinIO du serveur joignable depuis le Mac sur le port 9100, par SSH (rien n'est ouvert sur internet).
- Vous devez voir : le curseur qui reste en attente, sans message. Sinon : me transmettre le message.

C8.c — Terminal Mac (fenêtre de A1) : déclarer les deux MinIO
```sh
set -a && . ./.env && set +a && mc alias set mac "$S3_ENDPOINT" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" && mc ls mac
mc alias set serveur http://127.0.0.1:9100 <S3_ACCESS_KEY_ID du serveur> <S3_SECRET_ACCESS_KEY du serveur> && mc ls serveur
```
- Fait : enregistre les accès aux deux MinIO (clés du serveur à recopier depuis son `.env`, en `ssh svav-prod`
  puis `grep '^S3_' <APP>/.env` — elles s'affichent : ne les recopiez nulle part ailleurs).
- Vous devez voir : `mc ls mac` liste `svav-dev/` (et `svav-jetable/`, à ignorer) ; `mc ls serveur` liste le seau du
  serveur — son nom est la valeur `S3_BUCKET` du `.env` du serveur (**à relever, non vérifié**).
- Sinon : « Access Denied » → clés erronées ; « connection refused » → le tunnel C8.b est fermé.

C8.d — Terminal Mac : copie, puis comptage
```sh
mc mirror --preserve mac/svav-dev serveur/<S3_BUCKET du serveur> && mc ls --recursive mac/svav-dev | wc -l && mc ls --recursive serveur/<S3_BUCKET du serveur> | wc -l
```
- Fait : copie tous les objets du seau du Mac vers celui du serveur (ajoute et remplace, ne supprime jamais rien côté
  serveur ; relançable sans risque), puis compte les objets des deux côtés. Le seau `svav-jetable` (essais) n'est pas copié.
- Vous devez voir : la copie se terminer sans erreur, puis deux nombres — celui du serveur égal ou supérieur à celui du Mac.
- Sinon : relancer la même commande (elle reprend) ; erreur persistante → me la transmettre.

C8.e — Fermer la fenêtre n° 2 (Ctrl-C), ce qui ferme le tunnel.

**C9 — Terminal Mac** — arrêter MinIO du Mac
```sh
pkill -f "minio server ./.minio/data"; sleep 2; pgrep -fl minio
```
- Fait : arrête MinIO du Mac (lancé à la main : il ne redémarre pas seul).
- Vous devez voir : rien.
- Sinon : aller dans l'onglet Terminal où il tourne et taper Ctrl-C.

---

## D. Sur le serveur : code, migrations, construction, golden

**D1 — Terminal Mac** (Arno) — publier le code
```sh
git status --short | grep -v '^??'; git log --oneline origin/main..HEAD | wc -l; git push
```
- Fait : envoie sur GitHub les commits non poussés (sécurité, tunnel, moteur…).
- Vous devez voir : seulement ` M PASSATION.md` (jamais commité, normal), un nombre de commits, puis la sortie du push.
- Sinon : me transmettre le message.

**D2 — Session svav** — récupérer le code
```sh
git pull --ff-only && npm ci && git log -1 --oneline
```
- Fait : met le dépôt du serveur à jour et réinstalle les modules.
- Vous devez voir : le dernier commit du Mac (celui de D1).
- Sinon : « Not possible to fast-forward » → le serveur a des modifications locales : me prévenir, ne rien forcer.

**D3 — Session svav** — migrations absentes du Mac (la copie a donné au serveur le schéma du Mac)
```sh
for m in 355_login_throttle_ip 356_admin_session_version 357_admin_connexion_journal; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/$m.sql || break; done
psql "$DATABASE_URL" -At -c "select count(*) from pg_constraint where conname='enforce_max_extent_rast'"
```
- Fait : applique les trois migrations du lot sécurité (idempotentes, sans risque), puis vérifie que la contrainte
  LiDAR levée par la 353 n'est pas revenue (le LiDAR et ses contraintes ne sont jamais restaurés).
- Vous devez voir : `INSERT`, `ALTER TABLE`, `CREATE TABLE`… sans `ERROR`, puis `0`.
- Sinon : une `ERROR` → me la transmettre ; `2` à la dernière ligne → appliquer
  `psql "$DATABASE_URL" -f db/migrations/353_lidar_emprise_libre.sql`.

**D4 — Session svav** — construire, puis redémarrer le site (hors session svav pour le redémarrage)
```sh
npm run build 2>&1 | tail -5
exit                                  # quitter la session svav
sudo systemctl start svav-next && sleep 5 && systemctl is-active svav-next && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/admin/login
```
- Fait : construit le site, quitte la session du compte des services, redémarre le site et teste la page de connexion.
- Vous devez voir : la construction terminée sans « Error », puis `active` et `200`.
- Sinon : construction en erreur → me transmettre la fin ; `failed` → `journalctl -u svav-next -n 50 --no-pager`.

**D5 — Session svav** (la rouvrir comme en 0.2) — golden
```sh
npx vitest run --config vitest.integration.config.ts app/lib/db/pipeline.itest.ts 2>&1 | tail -6
```
- Fait : rejoue le golden d'Asnières (**seulement ce fichier** : jamais `npm run test:integration` en entier, une
  trentaine d'autres tests écrivent dans la vraie base).
- Vous devez voir : `Tests  11 passed (11)`.
- Sinon : me transmettre la sortie ; ne pas allumer les automatismes (E) tant que le golden n'est pas vert.

---

## E. Allumer les automatismes du serveur, un par un

**E1 — Serveur** — installer les unités (sans rien activer)
```sh
cd /srv/sansvisavis/app/deploy/systemd && ls svav.conf && sudo ./installer.sh && cd -
```
- Fait : régénère et installe les unités systemd (dont la surveillance et les alertes `OnFailure`), sans en démarrer
  aucune.
- Vous devez voir : `svav.conf` listé, puis le compte rendu de l'installateur, sans erreur.
- Sinon : `svav.conf` absent → `cp svav.conf.exemple svav.conf` et le remplir avec `<SVC>`/`<APP>` (README §2), puis
  relancer.

**E2 — Serveur** — la relève Gestion
```sh
sudo systemctl enable --now svav-gestion-continu && sleep 90 && journalctl -u svav-gestion-continu -n 30 --no-pager | tail -15
```
- Fait : démarre la relève continue (et la rend automatique au démarrage), attend une passe, montre son journal.
- Vous devez voir : des lignes de passe, aucune « non autorisé » / « invalid_grant » / « ECONNREFUSED ».
- Sinon : `sudo systemctl stop svav-gestion-continu`, puis me transmettre le journal.

**E3 — Session svav** — 1re passe de relève en succès
```sh
psql "$DATABASE_URL" -c "select id, resultat, termine_le from gestion_releve_run order by id desc limit 3"
```
- Vous devez voir : une ligne datée de maintenant, résultat en succès.
- Sinon : arrêter le service (E2) et me transmettre ces lignes.

**E4 — Serveur** — l'index des empreintes Drive
```sh
sudo systemctl enable --now svav-drive-empreintes.timer && sleep 90 && journalctl -u svav-drive-empreintes -n 30 --no-pager | tail -10
```
- Fait : active le minuteur (1re passe 1 min après), puis montre le journal.
- Vous devez voir : une passe incrémentale terminée, sans erreur de clé.
- Sinon : `sudo systemctl disable --now svav-drive-empreintes.timer`, puis me transmettre le journal.

**E5 — Serveur** — la veille
```sh
sudo systemctl enable --now svav-veille.timer && systemctl list-timers svav-veille.timer --no-pager
```
- Fait : active la veille (1re passe dans 15 min). ⚠️ C'est le fonctionnement normal, pas un essai : une passe envoie la
  cascade partielle aux mairies et les alertes, comme le faisait le Mac.
- Vous devez voir : le minuteur, prochaine exécution dans ≈ 15 min. Après ce délai :
  `journalctl -u svav-veille -n 60 --no-pager | tail -20` puis, en session svav,
  `psql "$DATABASE_URL" -c "select statut, fini_le from veille_run order by demarre_le desc limit 1"` → passe terminée sans échec.
- Sinon : `sudo systemctl disable --now svav-veille.timer`, puis me transmettre le journal.

**E6 — Serveur** — la surveillance (arrêtée en C4)
```sh
cd /srv/sansvisavis/app && sudo npm run surveillance -- --essai | tail -15 && sudo systemctl enable --now svav-surveillance.timer && cd -
```
- Fait : montre les contrôles et les mails qui partiraient (sans rien envoyer), puis active la surveillance.
- Vous devez voir : des contrôles « OK », puis aucune erreur à l'activation.
- Sinon : me transmettre la sortie (la surveillance n'empêche rien de fonctionner).

**E7** — `svav-analytics-maintenance.timer` : **après** les tests F (décision du 14/10/2026), voir F6.

---

## F. Les tests de la checklist

**F1 — Session svav** — tous les comptes, sans rien envoyer
```sh
npm run smtp:verifier; echo "code de sortie : $?"
```
- Vous devez voir : « OK » pour SMTP défaut, SMTP « personne », Gmail de gestion@, Agenda, Drive ; `code de sortie : 0`.
- Sinon : me transmettre la ligne en échec (aucun envoi n'a eu lieu).

**F2 — Navigateur** — une relève Gestion réussie, de bout en bout : depuis l'admin
(`https://authentification.sansvisavis.com/admin`), Gestion → « Nouveau message » adressé **uniquement** à
a.jorel@sansvisavis.com, objet « _TEST bascule ». Puis, 2 minutes plus tard, vérifier que le fil « _TEST bascule »
apparaît dans la boîte de l'admin (relevé par le serveur).
- Vous devez voir : mail reçu sur a.jorel@ ; présent dans les Envoyés de gestion@ ; le fil dans l'admin ; aucun lien
  `localhost` dans le mail.
- Sinon : me transmettre ce qui manque (et `journalctl -u svav-gestion-continu -n 50`).

**F3 — Drive (Arno, Drive sur le web d'abord)** : créer à la main, sous « Base de données locative », un dossier
« _TEST bascule » avec deux sous-dossiers « A » et « B ». Puis suivre `docs/BASCULE_CHECKLIST.md` §5.5 (5.5.2 à 5.5.7) :
ajout Drive → appli, « Ranger » dans « A » une pièce d'un mail « _TEST » envoyé à a.jorel@sansvisavis.com, déplacement,
renommage, mise à la corbeille PAR L'APPLICATION, puis nettoyage (« _TEST bascule » à la corbeille dans Drive web).
- 🔴 Jamais une vraie pièce, jamais un autre dossier, jamais « Documents clients scannés ».
- Vous devez voir : chaque « Attendu » du tableau §5.5.
- Sinon : s'arrêter au geste en échec et me le décrire.

**F4 — Navigateur** — Agenda : dans Gestion, une tâche « _TEST bascule » **confiée à vous-même** (acceptée d'office :
aucun mail d'acceptation), échéance demain. Vérifier l'événement dans votre agenda Google ; puis **ANNULER** la tâche.
- Vous devez voir : l'événement apparaît, puis disparaît après l'annulation.
- Sinon : me transmettre le message affiché par la tâche (« Agenda : à resynchroniser… »).

**F5 — Session svav** — certificat (sans émission, sans mail)
```sh
node .claude/skills/run-svav-app/driver.mjs smoke
```
- Vous devez voir : `HTTP 200` et `"deja":true` (ré-émission d'un certificat existant : aucun mail, aucune ligne).
- Sinon : me transmettre la sortie.

**F6 — Serveur** — maintenance des statistiques (après F1-F5)
```sh
sudo systemctl enable --now svav-analytics-maintenance.timer && sudo systemctl start svav-analytics-maintenance && journalctl -u svav-analytics-maintenance -n 20 --no-pager | tail -8
```
- Vous devez voir : une passe terminée ; `systemctl list-timers svav-analytics-maintenance.timer` à 04 h 30.
- Sinon : `sudo systemctl disable --now svav-analytics-maintenance.timer` et me transmettre le journal.

---

## G. SITE_URL et QR des certificats — ce qui marche, ce qui ne marche pas (aucune modification)

**Comment le QR est fabriqué** (`app/lib/certificat/siteUrl.ts`) : à l'émission, le PDF grave dans son QR l'adresse
`SITE_URL` + `/verifier?n=<numéro>&j=<jeton>` (variantes : `&doc=anonyme`, `/verifier?ref=…&doc=visuel`), et imprime en
clair l'adresse `<hôte>/verifier` et le code. **Une fois émis, ce QR ne change plus jamais** : le PDF n'est pas
régénéré (une ré-émission rend le certificat existant). En production, une `SITE_URL` en http, locale, privée ou de
tunnel est refusée (aucun PDF fabriqué).

**Pour les NOUVEAUX certificats** : il suffit que le `.env` du serveur contienne
`SITE_URL=https://authentification.sansvisavis.com` (déclaré fait le 14/10 par Arno ; contrôlé à l'étape 0.2) et que
`svav-next` ait redémarré après (D4). Les liens des mails internautes (`/verifier`, `/desabonner`,
`/espace/reinitialiser`) suivent la même variable.

**Pour les QR DÉJÀ ÉMIS** (31 certificats au 15/10/2026, `SAVV-2026-000001` à `000031`) : chacun pointe vers la valeur de
`SITE_URL` **au moment de son émission**. Cette valeur n'est pas enregistrée en base ; je ne lis pas les valeurs du
`.env`, et je n'ai fait aucune requête internet. D'où, précisément :
- ✅ **Les données suivent** : la copie (C6) amène chaque certificat et son jeton sur le serveur, et la copie MinIO (C8)
  ses PDF. Toute vérification qui ARRIVE sur `https://authentification.sansvisavis.com/verifier?n=…&j=…` fonctionne.
- ❌ **Un QR qui pointe vers `https://www.sansvisavis.com/verifier?…`** n'arrive pas sur l'application : ce nom
  d'hôte n'est pas celui du serveur de l'application. Le scan affichera ce que sert www.sansvisavis.com pour
  `/verifier` (vraisemblablement une page introuvable), **sauf** si une redirection y est posée : `www.sansvisavis.com/verifier`
  → `https://authentification.sansvisavis.com/verifier`, **query comprise** (n, j, doc, ref). Une telle redirection se
  règle chez l'hébergeur de www.sansvisavis.com, rien dans l'application ; je ne peux pas vérifier d'ici si elle existe.
- ✅ **Repli toujours possible pour un titulaire** : taper à la main, sur la page de vérification de la nouvelle
  adresse, le numéro et le code imprimés en clair sur le certificat.
- ❌ **Un QR gravé avec une adresse temporaire** (le 22/09/2026 : `SAVV-2026-000023` avec `http://192.168.1.164:3000`)
  ne marche plus, avec ou sans la bascule : seul le repli manuel reste.
- **À faire pour trancher** (vous, sans rien modifier) : scanner avec un téléphone le QR d'un certificat déjà émis et
  noter l'adresse affichée ; puis ouvrir cette adresse après la bascule.

---

## H. Retour arrière : rallumer le Mac

**H1 — Blocage AVANT E (aucun automatisme du serveur n'a tourné) : ≈ 5 minutes, sans perte.** La base du Mac n'a pas
été modifiée par la bascule (seulement lue par l'export) ; le serveur n'a rien relevé ni envoyé.
1. Serveur : `sudo systemctl disable --now svav-gestion-continu svav-veille.timer svav-drive-empreintes.timer` (sans
   gravité s'ils n'étaient pas actifs) ; `systemctl is-active svav-gestion-continu` → `inactive`.
2. Terminal Mac : la commande « Remettre le Mac en route » de la section B (3 tâches réactivées), puis MinIO et
   `npm run dev` dans deux onglets.
3. Terminal Mac : `launchctl list | grep sansvisavis` → les 3 noms ; 2 minutes plus tard
   `psql -d sansvisavis -c "select resultat, termine_le from gestion_releve_run order by id desc limit 1"` → une passe de maintenant.
4. Le serveur garde la copie du Mac et son LiDAR : la bascule pourra être refaite (C repart d'un export neuf). Pour
   rendre au serveur son état d'avant : `scripts/bascule-sans-lidar.sh restaurer /tmp/serveur-avant-bascule.dump "$DATABASE_URL"` (session svav).

**H2 — Blocage APRÈS E (le serveur a relevé, envoyé, écrit) : PAS en 5 minutes.** Le serveur a alors des données que le
Mac n'a pas (mails relevés et envoyés, passes de veille, relances datées). Rallumer le Mac tel quel ferait REPARTIR ce que
le serveur a déjà fait (relances aux mairies envoyées deux fois). Il faut d'abord ramener la base du serveur sur le Mac :
1. Serveur : arrêter les automatismes (H1.1), puis, en session svav :
   `scripts/bascule-sans-lidar.sh exporter "$DATABASE_URL" /tmp/serveur-retour.dump`.
2. Terminal Mac : `scp svav-prod:/tmp/serveur-retour.dump /Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/`
   puis `scripts/bascule-sans-lidar.sh restaurer /Users/macbookprom4arnaud/sansvisavis/sauvegardes-bascule/serveur-retour.dump sansvisavis`
   (le LiDAR du Mac, 1 dalle, reste intact).
3. Puis H1.2 et H1.3. Les fichiers MinIO déposés sur le serveur après la bascule seraient à recopier dans l'autre sens
   (`mc mirror serveur/<seau> mac/svav-dev`, tunnel C8.b).
4. En dernier recours, la sauvegarde complète A2 (`mac-complet.dump`) rend le Mac exactement tel qu'au matin de la
   bascule — mais elle PERD ce que le serveur a fait depuis.

---

## Points incertains (signalés plutôt que devinés)

1. **Compte et dossier du serveur** (`<SVC>`, `<APP>`) : la documentation dit `svav` et `/srv/sansvisavis/app`, mais la
   surveillance lit les sauvegardes sous `/home/ubuntu`. À relever à l'étape 0.1 ; remplacer partout si différent.
2. **Script de sauvegarde du serveur** : `svav-sauvegarde` n'existe PAS dans le dépôt. Nom exact, forme (commande,
   unité systemd ?) et emplacement inconnus d'ici ; seuls indices : le dossier `/home/ubuntu/sauvegardes/*/TERMINEE` et
   l'heure 03 h 30. L'étape A5 donne un filet qui ne dépend pas de lui.
3. **MinIO du serveur** : unité `svav-minio` (citée par la checklist, absente du dépôt), nom du seau (`S3_BUCKET` du
   serveur) et clés : à relever sur le serveur (étapes 0.1 et C8.c).
4. **Alias `svav-prod`** : supposé déclaré dans `~/.ssh/config` du Mac (pas vérifié).
5. **Migration 353 sur le serveur** : très probablement appliquée (l'import du LiDAR l'exigeait) ; contrôlée en D3.
6. **Format de `launchctl print-disabled`** : `=> disabled` ou `=> true` selon la version de macOS (B3).
7. **Qui a lancé `next dev`** sur le Mac : `npm run dev` sans terminal (VS Code, ou une session Claude Code) — à fermer
   à la source s'il reparaît (B5).
8. **QR déjà émis** : l'adresse gravée dans chacun n'est pas connue d'ici, ni le comportement de www.sansvisavis.com
   pour `/verifier` (section G).
9. **4 envois Gmail « echec »** dans la file : copiés tels quels ; jamais réessayés automatiquement (seuls « attente » et
   « en_cours » le sont, `fileEnvoiRepo.ts`) — à regarder dans l'admin si l'on veut les relancer à la main.
10. **Durées** (A2, C6, C8) : estimées, non mesurées sur ce volume.
