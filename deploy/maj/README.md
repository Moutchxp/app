# Mettre la prod à jour (deploy/maj)

Outil livré le 15/10/2026 (lots 3 et 4). Première mise à jour réelle : `a8454cde`, le 15/10/2026.

## En 3 commandes, depuis le Terminal du Mac

Dans `/Users/macbookprom4arnaud/sansvisavis/app`, une fois le travail **committé** :

```
mkdir -p .captures/maj
git push
npm run prod:mettre-a-jour -- --essai      2>&1 | tee .captures/maj/essai.txt
npm run prod:mettre-a-jour -- --appliquer  2>&1 | tee .captures/maj/appliquer.txt
```

1. **`git push`** : la prod est construite depuis le commit poussé sur GitHub, jamais depuis les fichiers du Mac.
2. **`--essai`** : fait tout **sauf** la bascule et l'écriture en base (sauvegarde, préparation de la nouvelle version,
   liste des migrations, golden). Rien ne change pour les visiteurs. Il doit finir par
   `═══ ESSAI RÉUSSI — rien n'a changé en service ═══`.
3. **`--appliquer`** : refait les contrôles, applique les migrations nouvelles, bascule, vérifie ; **revient tout seul**
   à la version d'avant si une vérification échoue. Il doit finir par `═══ MISE À JOUR RÉUSSIE — <commit> en service ═══`.
   Il réutilise la version préparée par l'essai du même commit (quelques minutes de gagnées).

Le site est coupé quelques secondes seulement, au redémarrage de `svav-next`.

Autres commandes :

| Commande | Usage |
|---|---|
| `npm run prod:mettre-a-jour -- --suivre` | se raccrocher au journal si le Terminal a été fermé ou la connexion coupée (la mise à jour, elle, continue sur le serveur) |
| `npm run prod:mettre-a-jour -- --verifier-seulement` | seulement les contrôles du Mac, rien n'est envoyé |
| `… --appliquer --accepter-irreversible=359_x.sql` | une migration marquée `-- svav:irreversible` ne passe qu'ainsi, nommée explicitement |

## Ce que la commande refuse (code 2, rien n'a changé)

- un fichier suivi modifié sur le Mac (seul `PASSATION.md` est toléré), une migration non committée dans `db/migrations` ;
- HEAD différent de `origin/main` (pas poussé, ou Mac en retard) ;
- une autre mise à jour en cours, la sauvegarde nocturne en cours (03 h 30), moins de 30 Go libres ;
- une migration refusée par le garde : elle nomme une table LiDAR, supprime en CASCADE, ou retire / transforme des
  données sans l'en-tête `-- svav:irreversible` ; une migration numérotée sous la dernière appliquée.

## Le déroulé sur le serveur

`deploy/maj/serveur.sh` tourne dans une unité systemd temporaire `svav-maj` (une coupure ssh n'arrête rien) :

0. préconditions (verrou, lien `current`, place, sauvegarde nocturne, registre des migrations) ;
1. miroir git `/home/ubuntu/sansvisavis/depot.git` mis à jour, le commit doit être sur `main` ;
2. **sauvegarde de la base sans LiDAR, à chaque fois**, vérifiée par `pg_restore --list` ;
3. nouvelle version préparée **à côté** dans `releases/<commit>` (git archive, liens vers `shared/`, `npm ci`,
   `next build`) — le site en service n'est pas touché ;
4. liste des migrations **nouvelles** d'après le registre `svav_migration` ;
5. (appliquer) minuteries en pause (veille, Drive, surveillance, analytics), attente de la fin des passes en cours ;
6. (appliquer) migrations nouvelles, chacune inscrite au registre ;
7. golden `pipeline.itest.ts` lancé depuis la nouvelle version : **tout vert, au moins 11**, sinon pas de bascule ;
8. unités systemd régénérées si leurs gabarits ont changé, puis bascule du lien `current` ;
9. redémarrage de `svav-next` et `svav-gestion-continu`, attente qu'ils soient **stables** (30 s sans redémarrage),
   vérifications : `/` et `/admin/login` en 200 (local et public), `surveillance --essai` sans problème ;
10. échec en 9 → **retour automatique** : lien et unités d'avant remis, redémarrage, vérification ;
11. minuteries relancées (toujours), ménage (5 versions, 10 sauvegardes), ligne d'historique.

**La base n'est jamais restaurée automatiquement.** Après un retour arrière, une migration passée reste en base : nos
migrations ajoutent (colonnes, tables), l'ancien code les ignore.

## Où sont les choses, sur le serveur

| Quoi | Où |
|---|---|
| Version en service | `/home/ubuntu/sansvisavis/current` → `releases/<commit>` (ou `app`, la « version zéro » d'avant l'outil) |
| Versions gardées (5) | `/home/ubuntu/sansvisavis/releases/<commit>/` — fichier `REVISION` = commit, `PRETE` = préparation finie |
| Fichiers hors dépôt | `/home/ubuntu/sansvisavis/shared/` (`.env`, `data/`) — liés dans chaque version ; archivés par la sauvegarde nocturne |
| Journal d'une mise à jour | `/home/ubuntu/sansvisavis/maj/<date>_<commit>.log` (+ `.npm-ci.log`, `.build.log`, `.golden.json`, `.code`) |
| Historique (une ligne par passage) | `/home/ubuntu/sansvisavis/maj/historique.tsv` |
| Sauvegardes avant mise à jour (10) | `/home/ubuntu/sauvegardes-maj/<date>_<commit>/base-sans-lidar.dump` (+ `LISTE_VERIFIEE`) |
| Sauvegardes nocturnes (inchangées) | `/home/ubuntu/sauvegardes/<date>/`, rotation 7 jours, copie chiffrée sur `/mnt/svav-ovh` |
| Registre des migrations | table `svav_migration` (`origine` : `amorcage`, `mise_a_jour`, `ecartee`) |

Lire l'historique : `ssh svav-prod "column -t -s \$'\t' /home/ubuntu/sansvisavis/maj/historique.tsv | tail -5"`.

## Si un ⛔ apparaît

La dernière ligne `═══ … ═══` du journal dit dans quel cas on est :

| Fin du journal | Situation | Que faire |
|---|---|---|
| `DÉJÀ EN SERVICE — rien à faire` (le Mac : « Terminé : déjà en service — rien à faire », code 0) | ce commit tourne déjà : rien n'a été touché | rien |
| `REFUSÉ (rien n'a été modifié en service)` | le site tourne sur la version d'avant, intacte | lire la ligne ⛔ juste au-dessus, corriger (pousser, attendre la fin de la sauvegarde nocturne, corriger la migration…), relancer l'essai |
| `ÉCHEC À LA MIGRATION …` | pas de bascule, version d'avant en service ; une migration « enveloppée » est annulée entière, une migration qui gère ses propres transactions peut être à moitié passée | envoyer le journal à Claude avant toute autre chose |
| `GOLDEN EN ÉCHEC — pas de bascule` | version d'avant en service ; si des migrations sont passées, le journal les nomme (elles restent) | envoyer le journal et `<id>.golden.json` à Claude |
| `ÉCHEC — RETOUR ARRIÈRE FAIT, ancienne version en service et vérifiée` | la nouvelle version a échoué une vérification ; le site est revenu tout seul et répond | envoyer le journal ; rien d'urgent |
| `ÉCHEC — RETOUR ARRIÈRE AVEC … PROBLÈME(S)` | **urgent** : le retour lui-même a rencontré un problème | ouvrir le site ; puis « Revenir en arrière à la main » ci-dessous, et prévenir Claude |
| `ÉCHEC — ARRÊT INATTENDU DU SCRIPT (code …)` | le script serveur a été arrêté en route (unité arrêtée, signal) : il le dit au lieu de se taire | lire le journal ; ouvrir le site ; prévenir Claude |
| pas de ligne `═══` (Terminal coupé) | la mise à jour continue peut-être | `npm run prod:mettre-a-jour -- --suivre` |
| « RÉSULTAT INCONNU — connexion perdue » (code 3) | la connexion ssh a été coupée avant la ligne `═══`, et 6 reconnexions automatiques (reprise du journal là où il s'était arrêté) n'ont pas suffi. **Rien n'est conclu** : ne jamais lancer `--appliquer` sur la foi de cet essai | la commande affichée (lecture seule de la fin du journal), ou `--suivre` |
| « SANS CONCLUSION » (code 4) | la connexion est restée ouverte jusqu'au bout, mais le journal s'arrête sans ligne `═══` (ne devrait plus arriver : toute fin du script serveur écrit sa ligne). **Rien n'est conclu** | la commande affichée (lecture seule de la fin du journal) |

## Revenir en arrière à la main

**Le code** (sûr, quelques secondes de coupure). Choisir la version voulue dans `historique.tsv` (colonne `de`) ou
`ls -lt /home/ubuntu/sansvisavis/releases`, puis, en remplaçant `<VERSION>` par son dossier complet
(`/home/ubuntu/sansvisavis/releases/<commit>` ou `/home/ubuntu/sansvisavis/app`) :

```
ssh -t svav-prod 'V=<VERSION> && sudo ln -sfn "$V" /home/ubuntu/sansvisavis/current.retour \
  && sudo mv -T /home/ubuntu/sansvisavis/current.retour /home/ubuntu/sansvisavis/current \
  && sudo bash "$V/deploy/systemd/installer.sh" /etc/svav/svav.conf \
  && sudo systemctl restart svav-next svav-gestion-continu \
  && sleep 40 && systemctl is-active svav-next svav-gestion-continu \
  && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/admin/login'
```

Attendu : `active`, `active`, `200`. `installer.sh` remet les unités systemd de cette version (sans rien activer).

**La base** : restaurer une sauvegarde de `/home/ubuntu/sauvegardes-maj/` **efface tout ce qui a été écrit depuis**
(mails relevés, envois, demandes, connexions). C'est une décision d'Arno, jamais un réflexe : demander à Claude un bloc
relu (arrêt des services, `scripts/bascule-sans-lidar.sh restaurer`, contrôle des comptages, redémarrage — procédure
éprouvée à l'étape C6 de `docs/BASCULE_DEROULE.md`). Les 4 tables LiDAR ne sont jamais touchées.

## À savoir

- **Première utilisation** : le registre a été amorcé le 15/10/2026 (357 migrations, dont 148, 212, 216 et 262
  « écartées », jamais appliquées — voir `docs/BASCULE_CHECKLIST.md` §8). Une migration écartée se réveille par une
  **nouvelle** migration qui porte l'en-tête `-- svav:remplace <fichier>`, jamais en rejouant l'ancien fichier.
- **Unités systemd** : elles sont régénérées depuis la nouvelle version quand leurs gabarits changent ; les unités hors
  dépôt (`svav-minio`, `svav-sauvegarde`) ne sont jamais touchées.
- **Le Mac** reste l'atelier : ses tâches launchd sont désactivées, ne rien y relancer.
- `/home/ubuntu/sansvisavis/app` (version zéro) peut être supprimé à la main quand il n'est plus ni en service ni la
  version précédente d'une mise à jour récente.
