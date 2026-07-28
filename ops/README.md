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
