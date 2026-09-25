# Ordonnanceur de la veille Sitadel (launchd) — S11b

Ce dossier contient le déclencheur de la veille automatique. **Rien n'est installé automatiquement** :
joue toi-même les commandes ci-dessous.

## Ce que fait le job

Toutes les **15 minutes** (`StartInterval 900`), launchd lance `npm run veille:run` à la racine du dépôt.
Ce CLI appelle le moteur `executerVeille` :

- prend un **verrou** (jamais deux runs à la fois) ;
- lit le **millésime distant** par les métadonnées DiDo (quelques Ko) → **rien à faire** s'il est déjà en base ;
- sinon **télécharge + ingère** le nouveau millésime, puis **purge** les CSV des millésimes antérieurs
  (le millésime en base n'est jamais supprimé) ;
- consomme aussi une éventuelle **« demande manuelle »** posée depuis l'écran Automatisation (bouton
  « Lancer maintenant »).

> ⚠️ **Le job ne tourne que machine allumée et session ouverte** (c'est un *LaunchAgent*). Un fonctionnement
> **24 h/24 suppose un hébergement** (serveur / VM toujours allumé), pas ce Mac.

## Pré-requis

- Adapter si besoin, dans `com.sansvisavis.veille.plist` :
  - le chemin du dépôt dans `ProgramArguments` (`cd /Users/macbookprom4arnaud/sansvisavis/app`) ;
  - les chemins de log `StandardOutPath` / `StandardErrorPath` (launchd **n'expande pas** `~`, d'où le chemin absolu).
- Le fichier `.env` doit être présent à la racine du dépôt (le CLI le charge en absolu).

## Installer

```sh
# 1) copier le plist dans les LaunchAgents de l'utilisateur
cp ops/com.sansvisavis.veille.plist ~/Library/LaunchAgents/

# 2) charger le job (le nouveau launchctl : bootstrap sur le domaine gui)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sansvisavis.veille.plist
# (ancienne syntaxe équivalente : launchctl load ~/Library/LaunchAgents/com.sansvisavis.veille.plist)
```

## Vérifier

```sh
# le job est-il connu de launchd ?
launchctl list | grep com.sansvisavis.veille

# forcer un passage immédiat (utile pour tester)
launchctl kickstart -k gui/$(id -u)/com.sansvisavis.veille

# consulter le log (stdout + stderr y sont redirigés)
tail -n 50 ~/Library/Logs/svav-veille.log
```

Chaque passage écrit une ligne horodatée du type
`[2026-07-28T09:15:00.000Z] veille: rien_a_faire — millésime déjà à jour (« 2026-07 »)`.
L'onglet **Automatisation** de la tuile Permis montre l'historique et avertit si **aucun passage** n'a eu lieu
depuis plus de deux intervalles (ordonnanceur peut-être non installé).

## Désinstaller

```sh
launchctl bootout gui/$(id -u)/com.sansvisavis.veille
# (ancienne syntaxe : launchctl unload ~/Library/LaunchAgents/com.sansvisavis.veille.plist)
rm ~/Library/LaunchAgents/com.sansvisavis.veille.plist
```

---

# Relève continue du courrier de gestion (launchd) — lot 5-DIRECT

`com.sansvisavis.gestion-continu.plist` fait tourner **en permanence** `app/scripts/relever-gestion-continu.ts` :
une passe de relève **toutes les 60 s** (intervalle lu dans `gestion_config.releve_continue_secondes`, relu à chaque
tour). La boîte est ouverte en **lecture stricte** (EXAMINE) : aucun drapeau, rien de déplacé, aucun envoi.

> **Pourquoi launchd et pas une fenêtre Terminal.** Le 25/09/2026, le rapatriement s'est terminé à 06:32 et rien n'a
> pris le relais : **dix heures** de courrier absentes de l'application, sans que rien ne le signale. Une fenêtre se
> ferme par erreur ; un job launchd repart tout seul, y compris après un plantage ou une réouverture de session.

## Deux différences avec le job de la veille, toutes deux voulues

- **`KeepAlive`, pas `StartInterval`** : le processus est de longue durée et tient sa propre boucle. `StartInterval`
  empilerait un nouveau processus toutes les N secondes par-dessus le précédent.
- **Aucun shell, que des chemins absolus** : `node` (absolu) → lanceur `tsx` du dépôt → point d'entrée du dépôt.
  L'ancienne version passait par `/bin/zsh -lc … npm run …` et dépendait du shell de login pour trouver `node`.
  Une panne d'ordonnanceur est silencieuse : moins il y a de relais, mieux c'est.

## Un piège mesuré, qui vaut pour tout futur job

`DATABASE_URL` ne porte **pas** de nom d'utilisateur (`postgresql://localhost:5432/sansvisavis`). Le pilote `pg` se
rabat alors sur le compte du système, qu'il lit dans `USER` / `LOGNAME`. Dans un environnement vide, ces variables
n'existent pas et la connexion échoue sur `FATAL 28000 — no PostgreSQL user name specified in startup packet`
(mesuré le 25/09/2026 avec `env -i`). Le plist les déclare donc explicitement. Ce ne sont pas des secrets : les
secrets restent dans `.env`, que le CLI charge lui-même en chemin absolu (`app/lib/chargerEnv.ts`).

## Installer

```sh
cp ops/com.sansvisavis.gestion-continu.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sansvisavis.gestion-continu.plist
```

## Vérifier

```sh
# tourne-t-elle ? (1re colonne = PID du processus vivant, 2e = 0 si le dernier arrêt était propre)
launchctl list | grep gestion-continu

# le journal, en direct (stdout ET stderr y sont redirigés)
tail -n 30 ~/Library/Logs/svav-gestion-continu.log
```

Une ligne par tour, du type `[2026-09-25T14:11:17.119Z] rien de nouveau — prochaine relève dans 60 s`.
« Rien de nouveau » est l'état **normal**. La preuve en base se lit dans `gestion_releve_run` : une ligne par tour,
horodatée, avec son résultat.

> ⚠️ **Ces passes sont enregistrées `declencheur = 'manuel'`**, exactement comme un clic sur « Relever maintenant »
> (`releveReelle.ts:80` : seul `--depuis-origine` change l'étiquette, en `'rattrapage'`). On ne peut donc pas, en
> base, distinguer une passe automatique d'un clic. La valeur `'planifie'` existe pourtant déjà dans le type
> (`captureRepo.ts:426`) : c'est elle qu'il faudra poser le jour où l'on voudra dire « l'ordonnanceur tourne » —
> une distinction qui manquera au garde-fou « la relève est arrêtée depuis X ».

## Arrêter / désinstaller

```sh
launchctl bootout gui/$(id -u)/com.sansvisavis.gestion-continu   # SIGTERM : le tour en cours se termine proprement
rm ~/Library/LaunchAgents/com.sansvisavis.gestion-continu.plist   # seulement pour désinstaller pour de bon
```

> ⚠️ Ne pas lancer **en même temps** `npm run gestion:relever-continu` dans un Terminal : les deux processus ne
> s'abîmeraient pas (le verrou consultatif les en empêche), mais l'un tournerait pour rien.
