# Tâches de fond et serveur web sur un serveur Linux (systemd)

Ce dossier remplace, pour un serveur Linux allumé 24 h/24, les trois tâches automatiques du Mac (dossier `ops/`,
lancées par launchd) et ajoute le serveur web lui-même. **Rien n'est installé ni activé tout seul** : chaque étape
ci-dessous se fait à la main.

> ## ⚠️ AVANT TOUTE CHOSE : JAMAIS LES DEUX MACHINES EN MÊME TEMPS
>
> **N'activez AUCUN de ces services tant que les tâches du Mac tournent** sur les mêmes boîtes mail et le même Drive.
> Deux machines qui relèvent les mêmes boîtes et envoient les mêmes relances, c'est une **double relève** et des
> **mails envoyés deux fois** aux mairies — ce qui ne se rattrape pas.
>
> La bascule se fait toujours dans cet ordre :
> 1. **Arrêter d'abord le Mac** (dans un Terminal du Mac) :
>    ```sh
>    launchctl bootout gui/$(id -u)/com.sansvisavis.veille
>    launchctl bootout gui/$(id -u)/com.sansvisavis.gestion-continu
>    launchctl bootout gui/$(id -u)/com.sansvisavis.drive-empreintes
>    launchctl list | grep sansvisavis     # doit ne plus rien afficher
>    ```
> 2. **Ensuite seulement**, activer les services sur le serveur (étape 5 ci-dessous).
>
> Sur une machine de **répétition**, n'activer les tâches qu'avec des boîtes et un Drive de test, ou pas du tout.

---

## Ce que contient ce dossier

| Fichier | À quoi il sert | Équivalent sur le Mac |
|---|---|---|
| `svav-veille.service.in` + `svav-veille.timer` | La veille (relances, envois automatiques, ingestions…) : une passe toutes les 15 min | `ops/com.sansvisavis.veille.plist` |
| `svav-gestion-continu.service.in` | La relève du courrier de gestion : tourne **en permanence**, relancée si elle s'arrête | `ops/com.sansvisavis.gestion-continu.plist` |
| `svav-drive-empreintes.service.in` + `svav-drive-empreintes.timer` | La mise à jour de l'index des empreintes du Drive : toutes les 15 min, une première fois au démarrage | `ops/com.sansvisavis.drive-empreintes.plist` |
| `svav-next.service.in` | Le site lui-même (`next start`), relancé s'il s'arrête | aucun (lancé à la main) |
| `svav-analytics-maintenance.service.in` + `.timer` | Maintenance des statistiques, une fois par nuit — **à n'activer que sur décision d'Arno** | aucun (n'existe nulle part aujourd'hui) |
| `svav.conf.exemple` | Les réglages d'installation (dossier du dépôt, compte, chemin de node, port) | — |
| `installer.sh` | Remplit les gabarits avec vos réglages et les copie dans systemd, **sans rien activer** | — |

### Deux tâches qui n'ont pas de service ici

- **Maintenance des statistiques** (`npm run analytics:maintenance`) : aujourd'hui, **aucun déclencheur** ne la lance,
  alors que sa documentation demande un passage quotidien. Le service et son timer sont fournis prêts, mais **il ne faut
  les activer qu'après décision d'Arno** (étape 5, encadré).
- **Purge des internautes échus** (`purgerEchus`) : il n'existe **aucune commande** pour la lancer depuis un terminal.
  Elle ne se déclenche que par le bouton de l'administration (route `POST /api/admin/internautes/purge`, réservée à
  l'administrateur). Aucun service n'est donc fourni ; en créer un demanderait d'abord d'écrire cette commande (lot
  dédié, sur décision d'Arno).

Les autres commandes (`relances:envoyer`, `demandes:envoyer`, `saisines:envoyer`, etc.) restent manuelles : leur
version automatique passe déjà par la veille.

---

## 1. Prérequis sur le serveur

- **Linux avec systemd 244 ou plus récent** (Debian 11 et suivants, Ubuntu 22.04 et suivants). Vérifier :
  `systemctl --version` (le premier nombre). En dessous de 244, voir « Redémarrage après un échec » plus bas.
- **Fuseau horaire de Paris** et horloge synchronisée :
  ```sh
  sudo timedatectl set-timezone Europe/Paris
  timedatectl        # doit indiquer Europe/Paris et « synchronized: yes »
  ```
- **Node 24** (la même version majeure que le Mac), avec `npm` dans le même dossier que `node` :
  ```sh
  node -v            # doit commencer par v24
  command -v node    # ce chemin ira dans svav.conf (ligne NODE=)
  ```
- **Programmes utilisés par l'application** :
  ```sh
  sudo apt install poppler-utils gdal-bin curl bzip2 tar 7zip
  ```
  (`7zip` s'appelle `p7zip-full` sur les versions plus anciennes de Debian/Ubuntu.)
- **Un compte dédié**, par exemple `svav`, propriétaire du dépôt :
  ```sh
  sudo adduser --system --group --home /home/svav --shell /bin/bash svav
  ```
- **Le dépôt cloné** (jamais une copie du dossier du Mac) et les modules installés **en entier** — comme `svav` :
  ```sh
  sudo -u svav -H bash -c 'cd /srv/sansvisavis/app && npm ci && npm run build'
  ```
  ⚠️ Pas de `npm ci --omit=dev` : `tsx` et `dotenv`, rangés parmi les outils de développement, sont indispensables aux
  tâches de fond.
- **Le fichier `.env`** à la racine du dépôt, et les fichiers Google dans `/home/svav/.config/sansvisavis/` (voir
  `docs/RECON_PORTABILITE_SERVEUR.md`, checklist étape 7).

### À propos du compte PostgreSQL (important)

Sur le Mac, les fichiers launchd déclaraient `USER` et `LOGNAME`, parce que l'adresse de la base (`DATABASE_URL`) ne
contient **pas** de nom d'utilisateur : le pilote PostgreSQL prend alors le nom du compte système, et sans lui la
connexion échoue (`FATAL 28000`, voir `ops/README.md`).

Ici, la ligne `User=` de chaque service règle la même chose : systemd fournit alors `USER`, `LOGNAME` et `HOME` du
compte choisi (comportement décrit dans `man systemd.exec`). **Il faut donc que le rôle PostgreSQL porte le même nom
que le compte** (par exemple `svav`), ou que `DATABASE_URL` contienne explicitement un nom d'utilisateur.

Le `.env` n'est **pas** recopié dans les services : chaque script le charge lui-même depuis la racine du dépôt.

---

## 2. Régler

Dans le dossier `deploy/systemd/` du dépôt cloné sur le serveur :

```sh
cp svav.conf.exemple svav.conf
nano svav.conf
```

Renseigner : le dossier du dépôt (`APP_DIR`), le compte (`SVAV_USER`, `SVAV_GROUP`), le chemin de node (`NODE`), et
l'adresse/le port du site (`NEXT_HOST`, `NEXT_PORT`). Chaque ligne est expliquée dans le fichier.

### Pourquoi un script plutôt qu'un simple fichier de variables

systemd **ne sait pas** remplacer une variable dans le dossier de travail (`WorkingDirectory=`), dans le compte
(`User=`, `Group=`), ni dans le nom du programme lancé (premier mot de `ExecStart=`). Or ce sont justement les
réglages qui changent d'un serveur à l'autre. `installer.sh` écrit donc les vrais chemins dans les fichiers, une fois
pour toutes, à partir de `svav.conf`. Si l'on change de dossier ou de compte : modifier `svav.conf` et relancer
`installer.sh`.

---

## 3. Essayer sans rien installer (facultatif)

```sh
./installer.sh --essai /tmp/units-essai
```

Le script vérifie les réglages, génère les fichiers dans `/tmp/units-essai` et s'arrête là. On peut les lire, et
contrôler leur syntaxe :

```sh
systemd-analyze verify /tmp/units-essai/*.service /tmp/units-essai/*.timer
```

(Cette commande n'existe que sur Linux : les fichiers n'ont pas pu être contrôlés ainsi sur le Mac, seulement relus
à la main.)

## 4. Installer

```sh
sudo ./installer.sh
```

Le script copie les fichiers dans `/etc/systemd/system/` et recharge systemd. **Il n'active et ne démarre rien.**

## 5. Activer (seulement après avoir arrêté le Mac — voir l'encadré en tête)

```sh
# le site
sudo systemctl enable --now svav-next.service

# la relève du courrier de gestion (tourne en permanence)
sudo systemctl enable --now svav-gestion-continu.service

# les deux tâches toutes les 15 minutes : on active le TIMER, pas le service
sudo systemctl enable --now svav-veille.timer
sudo systemctl enable --now svav-drive-empreintes.timer
```

`enable` = démarrage automatique à chaque allumage du serveur ; `--now` = démarrer tout de suite.

- La veille fait sa **première passe 15 minutes** après l'activation (comme sur le Mac : pas de passe à l'installation).
- L'index Drive fait sa première passe **1 minute** après l'activation (sur le Mac : dès le chargement).

> **Maintenance des statistiques — uniquement sur décision d'Arno :**
> ```sh
> sudo systemctl enable --now svav-analytics-maintenance.timer
> ```
> Elle passe chaque nuit à 00 h 15, **heure du serveur** (d'où le réglage Europe/Paris à l'étape 1). Si le serveur
> était éteint à cette heure-là, elle est rattrapée au démarrage suivant.

---

## 6. Vérifier

```sh
# tout ce qui concerne Sans Vis-à-Vis, d'un coup d'œil
systemctl list-units 'svav-*'
systemctl list-timers 'svav-*'      # prochaine et dernière passe de chaque timer

# l'état détaillé d'un service
systemctl status svav-gestion-continu.service

# les services en échec, s'il y en a
systemctl --failed
```

### Lire les journaux

Les messages des scripts vont dans le journal de systemd (plus de fichiers `~/Library/Logs/…`).

```sh
journalctl -u svav-veille.service -f            # la veille, en direct
journalctl -u svav-gestion-continu.service -f   # la relève du courrier, en direct
journalctl -u svav-drive-empreintes.service -f  # l'index Drive, en direct
journalctl -u svav-next.service -f              # le site, en direct
journalctl -u svav-analytics-maintenance.service -n 100

journalctl -u svav-veille.service --since today          # tout ce qu'a fait la veille aujourd'hui
journalctl -u svav-gestion-continu.service --since "-1h" # la dernière heure
```

(`-f` = suivre en direct, `Ctrl+C` pour sortir ; `-n 100` = les 100 dernières lignes.)

Pour la relève du courrier, « rien de nouveau — prochaine relève dans 60 s » est l'état **normal**. Une ligne
`FATAL 28000` signale un problème de compte PostgreSQL (voir l'étape 1).

### Lancer une passe tout de suite (pour tester)

```sh
sudo systemctl start --no-block svav-veille.service
sudo systemctl start --no-block svav-drive-empreintes.service
```

(`--no-block` rend la main immédiatement ; sans lui, le terminal attend la fin de la passe.) Si une passe tourne déjà,
la commande ne lance rien de plus.

### Vérifier le site

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/admin/login   # doit afficher 200
```

---

## 7. Arrêter

```sh
# arrêter les passes automatiques (la passe en cours, s'il y en a une, va jusqu'au bout)
sudo systemctl disable --now svav-veille.timer svav-drive-empreintes.timer

# arrêter la relève du courrier (elle termine son tour proprement)
sudo systemctl disable --now svav-gestion-continu.service

# arrêter le site
sudo systemctl disable --now svav-next.service
```

`disable` = ne plus démarrer à l'allumage. Pour un arrêt **temporaire** seulement, remplacer `disable --now` par `stop`.

Pour désinstaller pour de bon, après l'arrêt :
```sh
sudo rm /etc/systemd/system/svav-*.service /etc/systemd/system/svav-*.timer
sudo systemctl daemon-reload
```

**Après une mise à jour du code** (`git pull`) : `sudo -u svav -H bash -c 'cd /srv/sansvisavis/app && npm ci && npm run build'`,
puis `sudo systemctl restart svav-next.service svav-gestion-continu.service`. La veille et l'index Drive prennent le
nouveau code d'eux-mêmes à leur passe suivante.

---

## Comment les services sont réglés (pour le relecteur)

- **Dossier de travail = racine du dépôt** pour tous : la veille lit `data/sitadel` en relatif et lance
  `npm run cadastre:ingest` dans ce dossier ; le site lit les polices du certificat PDF depuis ce dossier ; la
  maintenance des statistiques y cherche le `.env`.
- **Lancement sans shell**, comme les fichiers du Mac : `node` → lanceur `tsx` du dépôt → script. Le `PATH` des
  services contient le dossier de `node`/`npm`, puis les dossiers système (`curl`, `ogr2ogr`, `tar`, `bzip2`,
  `pdftoppm`…).
- **`TZ=Europe/Paris`** dans chaque service ; `NODE_ENV=production` pour le site.
- **Jamais deux passes en même temps** : quand un timer sonne alors que la passe précédente n'est pas finie, systemd
  ne lance pas de seconde passe ; la suivante démarre au plus tôt après la fin de celle en cours. La veille a en plus
  son propre verrou en base.
- **Durée maximale** : 4 h pour une passe de veille (les ingestions peuvent être longues), 30 min pour l'index Drive,
  1 h pour la maintenance. Pour ce type de service, systemd ne pose aucune limite par défaut ; ces valeurs évitent
  qu'une passe bloquée empêche toutes les suivantes. Au-delà, la passe est arrêtée et comptée en échec.

### Redémarrage après un échec

- Relève du courrier et site : relancés **toujours**, 60 s (relève) ou 5 s (site) après un arrêt, sans limite de
  nombre — comme `KeepAlive` sur le Mac.
- Veille et index Drive : **nouvel essai 5 minutes après un échec** (`Restart=on-failure`). Pour ce type de service
  (« oneshot »), systemd n'accepte ce réglage qu'**à partir de la version 244**. Sur un systemd plus ancien,
  supprimer les deux lignes `Restart=` et `RestartSec=` de ces deux gabarits avant d'installer : le timer relance de
  toute façon une passe 15 minutes plus tard.
- Maintenance des statistiques : **pas** de nouvel essai — un échec doit rester visible (`systemctl --failed`) ;
  la passe de la nuit suivante suffit.

### Durcissement léger, et son effet sur les fichiers temporaires

Chaque service porte trois protections : `NoNewPrivileges=true` (aucun gain de droits possible), `ProtectSystem=full`
(`/usr`, `/boot` et `/etc` en lecture seule pour le service — le dépôt, le dossier personnel et `/var` restent
modifiables) et `PrivateTmp=true`.

`PrivateTmp=true` donne à chaque service **son propre** `/tmp` et `/var/tmp`, invisibles des autres programmes et
**vidés à l'arrêt du service**. Conséquence pour la veille : l'archive DILA (~600 Mo) et les fichiers du cadastre,
écrits dans le dossier temporaire, disparaissent à la fin de chaque passe. C'est sans effet sur le fonctionnement
(le code les efface déjà lui-même et ne les réutilise jamais d'une passe à l'autre), mais cela explique qu'on ne les
retrouve pas dans le `/tmp` du serveur. Le service de la veille pose aussi `TMPDIR=/var/tmp`, pour que ces gros
fichiers aillent **sur le disque** plutôt que dans `/tmp`, qui est en mémoire vive sur certaines distributions
récentes. On peut aussi choisir un autre dossier pour la DILA avec la variable `DILA_DIR` du `.env`.

---

## Ce qui n'a pas pu être vérifié depuis le Mac

- `systemd-analyze verify` n'existe pas sur macOS : la cohérence des clés a été relue à la main (sections, noms de
  clés, aucun commentaire en bout de ligne). **Lancer l'étape 3 sur le serveur avant d'activer quoi que ce soit.**
- Les comportements de systemd cités ici (variables non remplacées dans `WorkingDirectory=`/`User=`/programme de
  `ExecStart=`, `Restart=` des « oneshot » depuis la 244, absence de limite de durée par défaut des « oneshot »,
  `USER`/`LOGNAME`/`HOME` fournis par `User=`, nettoyage de `PrivateTmp`) viennent de la documentation de systemd
  telle que connue, **sans relecture en ligne pendant ce lot**. Les confirmer au besoin avec `man systemd.exec`,
  `man systemd.service` et `man systemd.timer` sur le serveur.
- Aucun de ces fichiers n'a été installé ni lancé.
