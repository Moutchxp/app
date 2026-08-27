# RECON — Refonte de l'onglet « Demandes » en DEUX RAILS

> **LECTURE SEULE.** Aucune écriture, aucun envoi, aucune migration. Recon menée le 27/08/2026 par 6 axes
> parallèles (A–F). Chaque affirmation est prouvée par `fichier:ligne` ou par une requête SQL exécutée en
> lecture seule. **Aucun découpage de chantier n'est proposé** — le cadrage se fait avec le porteur.
>
> **Rappel du cadre juridique en cours :** deux échéances CRPA courent (Aubervilliers ~04/09, Paris ~10/09).
> Aucune commande d'envoi/relève n'a été lancée pendant cette recon.

## Définition des deux rails (rappel du porteur)

- **RAIL A** — mairies joignables par e-mail : demande **et** relance **100 % automatiques**.
- **RAIL B** — mairies à téléservice (formulaire) : la machine **prépare**, l'humain **dépose à la main**.

**Le rail n'est PAS une colonne « rail ».** Il est porté, ligne par ligne, par `demande.dest_canal`
(`email` → rail A ; `formulaire` → rail B), figé à la création de la demande (voir Axe B).

---

## 0. Ce qu'il faut savoir avant de lire (faits saillants, tous prouvés plus bas)

1. **Il n'y a plus d'onglet unique « Demandes ».** Depuis PROJ-2c, la barre `OngletsPermis`
   (`PermisOnglets.tsx:11-20`) définit un **groupe « Demandes aux mairies »** de 8 onglets
   (`a_demander`, `en_cours`, `reponses`, `projection`, `archives`, `saisines`, `collaborateurs`,
   `reglages`). Les deux rails **cohabitent dans chaque liste** parce que la plupart des requêtes ne
   filtrent pas le canal.
2. **Il existe un TROISIÈME canal en base : `courrier`** (`demande.dest_canal='courrier'`, 1 ligne).
   Aucune vue ne le traite spécifiquement — il tombe dans les listes « les deux ». Il n'y a **pas** de
   « rail C » dans le code.
3. **Le canal est FIGÉ à la création et ne change JAMAIS ensuite** (aucun `UPDATE dest_canal`, aucun
   trigger). Changer le canal d'une commune n'affecte pas ses demandes déjà créées.
4. **« Demander à Paris » échoue par PLAFOND MENSUEL, pas par absence de chemin** : Paris est au quota
   5/5 pour août 2026 → 0 lot produit. Paris est aussi en canal `formulaire` (rail B), profil forcé.
5. **Aucune suppression physique de demande n'existe.** « Annuler » = `UPDATE statut='annulee'`. Une
   non-envoyée (brouillon/prête) ne porte **aucune preuve juridique** ; tout le risque juridique est sur
   les **envoyées** (FK CASCADE vers `demande_reference_externe`).
6. **`demande_journal` n'a AUCUNE FK vers `demande`** → un DELETE laisserait des lignes de journal
   orphelines. Les tables `saisine_cada` et `rattachement_reference_mairie` (migrations 083/091)
   **n'existent pas en base** (`to_regclass` = NULL).
7. **AXE F (le plus important) :** toutes les fonctions de surveillance juridique lisent la base
   **directement** avec leur propre `WHERE` ; **aucune** ne reçoit un « listing d'écran ». Six requêtes
   nommées §F **ne doivent JAMAIS recevoir de filtre de rail**.

---

## 1. AXE A — Cartographie exhaustive du groupe « Demandes aux mairies »

**Ossature :** onglets définis `PermisOnglets.tsx:19` ; aiguillage onglet→composant `PermisTuile.tsx:66-76`
(`a_demander`→`ADemanderVue`, `en_cours`→`EnCoursVue`→`SuiviDemandes`, `reponses`→`ReponsesVue`,
`archives`→`ArchivesVue`). Pastilles d'action : `GET /api/admin/permis/actions` (`PermisTuile.tsx:47`) →
`comptesActions.ts:31-47` (Réponses / Saisines / Rattachement / Projection ; **rien** pour À demander /
En cours / Archives).

| Bloc / élément | Composant `fichier:ligne` | Source données (fn + SQL) `fichier:ligne` | Condition d'affichage | Rail |
|---|---|---|---|---|
| Barre d'onglets (2 groupes) | `PermisOnglets.tsx:38-59` ; monté `PermisTuile.tsx:64` | pastilles `GET …/actions` → `comptesActions.ts:31-47` | toujours | les deux |
| **ONGLET « À demander »** | `ADemanderVue.tsx:31` | — | `onglet==='a_demander'` (`PermisTuile.tsx:68`) | les deux |
| ├ Bandeau réglages + filtre ancienneté | `BandeauReglages` `DemandesRendu.tsx:71` ; monté `ADemanderVue.tsx:148` | props dérivées de config (`PermisTuile.tsx:24,37`) ; filtre = état écran (`ADemanderVue.tsx:51-52`) | toujours | les deux |
| ├ **Stock de permis par commune** (repliable, lecture seule) | `BlocStock`/`TableStock`/`PanneauDetailStock` `DemandesRendu.tsx:1053,987,916` ; monté `ADemanderVue.tsx:154-170` | `GET …/demandes/stock?ancienneteMois=` → `stockPermisParCommune` `demandeRepo.ts:193` (**aucun filtre canal**) ; détail `lireDetailPermisCommune` `demandeRepo.ts:218` (SQL `:228-239`) | replié par défaut ; chargé à l'ouverture (`ADemanderVue.tsx:60-72`) | les deux |
| ├ Bouton « Préparer les demandes » + select Profil | `ADemanderVue.tsx:174-179` | déclenche `GET …/demandes/proposition?profil&ancienneteMois` (`ADemanderVue.tsx:101`) | toujours | les deux |
| ├ **Propositions de lots** (cases, tout sél., pagination, « Créer ») | `CartePropositions` `DemandesRendu.tsx:336` ; monté `ADemanderVue.tsx:184` | `proposition()` `demandeRepo.ts:174` → `proposerLots` `demande.ts:250` ; route `proposition/route.ts:25`. Création : `POST …/demandes` → `creerDemandes` `demandeRepo.ts:651` (INSERT `:715`) | après clic « Préparer » (`prop!==null`, `ADemanderVue.tsx:183`) | les deux (chaque lot porte `l.canal`) |
| ├ **Encart arbitrages PRADA** (info, repliable) | `EncartArbitrages` `DemandesRendu.tsx:125` ; via `BlocPrada.tsx:110` | `GET …/prada` → `lireArbitrages` `pradaAdmin.ts:54` (SQL `:56-63`, `mairie_prada ⋈ mairie_contact` WHERE `courriel<>''` AND `mc.statut='confirme'`) | `arbitrages.length>0` | **RAIL A** (PRADA au courriel) |
| ├ **Rapprochements PRADA ambigus** (rattacher/écarter) | `CarteAmbiguite` `DemandesRendu.tsx:868` ; `BlocPrada.tsx:119-153` | `lireAmbiguites` `pradaAdmin.ts:93` ; action `POST …/prada` → `rattacherManuel`/`ecarterHorsPerimetre` `pradaAdmin.ts:128,133` | `ambiguites.length>0` | **RAIL A** |
| ├ **Communes sans adresse e-mail** (saisie e-mail) | `BlocInjoignables`/`CarteInjoignable` `DemandesRendu.tsx:215,164` ; `BlocPrada.tsx:160-179` | `lireInjoignables` `pradaAdmin.ts:82` (SQL `:74-79`, communes SANS email ET SANS courriel PRADA) ; saisie `PATCH …/contact` canal=email statut=confirme (`BlocPrada.tsx:91-94`) | `injoignables.length>0` | **RAIL A** (rendre joignable) |
| ├ **Dépôt manuel / « à déposer à la main »** | `BlocDepot` + `CarteDepot` `BlocDepot.tsx:21`, `DemandesRendu.tsx:233,307` | `GET …/demandes/depot` → `listerADeposer` `demandeRepo.ts:1025` (SQL `:1051`, **WHERE `dest_canal='formulaire'` AND statut IN brouillon/prete**) ; « Déposée » `marquerDeposee` `demandeRepo.ts:1113` ; trace clic `POST …/depot-presume` (`BlocDepot.tsx:16`) | `demandes.length>0` | **RAIL B** |
| └ **Tableau « À demander »** + actions groupées (prête / annuler / profil) | `SuiviDemandes.tsx:55` (perimetre='a_demander') ; `TableDemandes` `DemandesRendu.tsx:703` | `GET …/demandes` → `listerDemandes` `demandeRepo.ts:769` (SQL `:787-790`, **aucun filtre canal** ; pré-filtre statut front `dansPerimetre`). Actions `PATCH …/demandes` → `changerStatutLot`/`changerProfilLot` `demandeRepo.ts:913,1211` | toujours | les deux |
| **ONGLET « En cours »** | `EnCoursVue.tsx:13` → `SuiviDemandes.tsx:55` (perimetre='en_cours') | — | `onglet==='en_cours'` (`PermisTuile.tsx:69`) | les deux |
| ├ Bandeau compteurs + mention masquage | `SuiviDemandes.tsx:354-360` ; `MentionMasquage` `DemandesRendu.tsx:487` | dérivé de `listerDemandes` | `liste` chargée | les deux |
| └ Tableau envoyées/close + Délai / Retour mairie / Réf. mairie + détail dossiers (7 actions, clôture, liens, pièces, alertes GED, « autre ») | `TableDemandes` `DemandesRendu.tsx:703` ; détail `ReponsesRendu.*` importés `SuiviDemandes.tsx:10`, montés `:460-503` | `GET …/en-cours` → `chargerDemandesSuivi` `reponsesSuivi.ts:270` (SQL `:296-327`, **WHERE statut IN envoyee/close, tous canaux**). Actions `POST …/reponses` (`SuiviDemandes.tsx:284`) ; réf. `POST/DELETE …/demandes/reference` | perimetre en_cours | les deux |
| **ONGLET « Réponses »** | `ReponsesVue.tsx:45` | `GET …/reponses` → `chargerSuiviReponses` `reponsesSuivi.ts:485` (route `reponses/route.ts:23`) | `onglet==='reponses'` | voir sous-blocs |
| ├ **État de la relève** (repliable) | `BlocEtatReleve` (`ReponsesRendu`) ; `ReponsesVue.tsx:189` | `chargerSuiviReponses` → `releve_run` (SQL `reponsesSuivi.ts:493-508`) | replié par défaut | **RAIL A** (relève IMAP e-mail) |
| ├ Suivi des demandes envoyées (tableau + détail) | `ReponsesVue.tsx:196-297` | `chargerDemandesSuivi` (filtré front `demandeADuRetour`) | `demandes.length>0` | les deux (retours par e-mail → surtout A) |
| ├ **À rattacher** (messages orphelins) | `BlocARattacher` (`ReponsesRendu`) ; `ReponsesVue.tsx:302` | `chargerSuiviReponses` → SQL `reponsesSuivi.ts:510-516` (`demande_reponse WHERE demande_id IS NULL`) ; action `POST …/reponses` rattacher/traiter | toujours (paginé) | **RAIL A** (courriels reçus) |
| ├ **Dépôts à confirmer** | `BlocPropositions` (`ReponsesRendu`) ; `ReponsesVue.tsx:315` | `chargerSuiviReponses` → `cibleRows` SQL `reponsesSuivi.ts:532-538` (**WHERE statut brouillon/prete AND `dest_canal='formulaire'`**) ; `apparierPropositions` `:545` ; confirm `POST …/reponses` confirmer_depot | toujours (paginé) | **RAIL B** |
| └ **Relances préparées** (éditer/régénérer/abandonner) | `RelanceCarte` (`ReponsesRendu`) ; `ReponsesVue.tsx:335-343` | `chargerSuiviReponses` → `data.relances` (`demande_relance`) ; envoi auto `data.envoi` (`reponsesSuivi.ts:279`) | `relances.length>0` | **RAIL A** (relance e-mail auto) |
| **ONGLET « Archives »** | `ArchivesVue.tsx:19` | `GET …/archives` → `listerArchives` `demandeRepo.ts:308` (SQL `:320-326`, `dd.satisfait_le IS NOT NULL`, **aucun filtre canal**) | `onglet==='archives'` | les deux |
| ├ Tableau permis renseignés + pièces | `TableArchives` (`ArchivesRendu`) ; `ArchivesVue.tsx:104` | idem `listerArchives` | `archives!==null` | les deux |
| └ Téléverser / supprimer / télécharger un document | `ArchivesVue.tsx:45-86` | `POST/DELETE …/archives` → `deposerDocumentSurPermis`/`supprimerDocumentDossier` `demandeRepo.ts:478,590` ; ouverture `url_piece` → `lireCleTelechargeable` `demandeRepo.ts:609` | par ligne/pièce | les deux |

**Onglets du même groupe non détaillés** (hors flux demande/relance/dépôt, hors périmètre de la mission) :
`projection` (`ProjectionVue`), `saisines`, `collaborateurs`, `reglages` (`PermisTuile.tsx:71-76`).

**Éléments dont le rail n'est pas strictement isolable (et pourquoi) :** les grandes listes (Propositions,
À demander, En cours, Archives, Suivi des envoyées) ne filtrent aucun canal — le rail réel d'une ligne
dépend de `demande.dest_canal`, qui prend **trois** valeurs (`email`/`formulaire`/`courrier`). « Les deux »
est donc un raccourci ; une ligne `courrier` n'est ni A ni B.

---

## 2. Schéma texte — parcours d'une demande de bout en bout

```
COMMUNE (mairie_contact.canal ∈ {email, formulaire, courrier, inconnu}, CHECK 051_mairie_canal.sql:26)
   │  effectifs : email 322 · inconnu 11 · formulaire 2   (SELECT canal,count(*) FROM mairie_contact)
   ▼
CLASSEMENT DE PRIORITÉ  (lireDossiersPriorite, veilleRepo.ts:179 ; ORDER BY tri_candidats, priorite.ts:178)
   │  profondeur = nb_candidats_examines (=5000)   (demandeRepo.ts:175)
   ▼
PROPOSITION DE LOTS  (proposerLots, demande.ts:250)  ← SEUL générateur de demandes
   │  éligibilité : anciennete_max_demande_annees (=1), estCandidatEligible
   │  PLAFOND MENSUEL : quota = permis_par_commune_par_mois(=5) − permisCeMoisParCommune  (demande.ts:262)
   │     quota ≤ 0 → commune SAUTÉE, jamais nommée (« N commune(s) au plafond », demande.ts:406/424)
   │  découpage : dossiers_par_demande(=1) ∧ maxDossiersParDemande imposé par la commune (demande.ts:272)
   ▼
CRÉATION  creerDemandes → INSERT INTO demande (demandeRepo.ts:715)
   │  dest_* FIGÉS ICI (demandeRepo.ts:714-717) : dest_canal=$7 = resoudreDestination(...)
   │    branche normale  → canal = mairie_contact.canal            (destinataire.ts:62)
   │    branche PRADA     → canal = 'email' (override)              (destinataire.ts:50,54)
   │  statut initial = 'brouillon'
   ▼
BROUILLON ──(action « prête », changerStatutLot, demandeRepo.ts:913)──▶ PRÊTE
   │
   ├── RAIL A (dest_canal='email') : ENVOI AUTOMATIQUE
   │      lireCandidatsEnvoi WHERE statut='prete' AND dest_canal='email'   (envoiDemande.ts:148)
   │      → UPDATE statut='envoyee' + demande_acheminement (preuve d'expédition)
   │
   └── RAIL B (dest_canal='formulaire') : DÉPÔT MANUEL
          listerADeposer WHERE dest_canal='formulaire' AND statut IN (brouillon,prete)  (demandeRepo.ts:1051)
          → l'humain dépose au téléservice → marquerDeposee (demandeRepo.ts:1113)
          → trace : demande_depot_presume (migration 124)
   ▼
ENVOYÉE  → SURVEILLANCE JURIDIQUE (voir §F, toutes canal-agnostiques)
   │  échéance CRPA (chargerDemandesSuivi, reponsesSuivi.ts:296 ; moteur echeance.ts)
   │  relance cascade rappel/avis/saisine (relanceAuto.ts:246 ; auto-envoi email envoiRelance.ts:170)
   │  saisine CADA due (lireSaisinesEligibles, saisineCadaRepo.ts:59)
   │  alerte quotidienne opérateur (alerteAuto.ts:127)
   ▼
RÉPONSES  relève IMAP (releveReponses.ts:173, lireEnvoyees) → rattachement → pièces / liens / GED
   ▼
CLÔTURE (statut='close', cloturerDemande demandeRepo.ts:976)  ou  ARCHIVES (dd.satisfait_le IS NOT NULL)
```

---

## 3. Réponses factuelles — Axes B à E

### AXE B — Où et quand le rail se décide

1. **Valeurs de canal en base** (requêtes exécutées) :
   - `mairie_contact.canal` : **email 322 · inconnu 11 · formulaire 2** (335). Domaine CHECK
     `{email,formulaire,courrier,inconnu}` (`051_mairie_canal.sql:26`).
   - `demande.dest_canal` : **email 153 · formulaire 5 · courrier 1** (159). Réparti par statut :
     `email` = 101 annulee + 50 brouillon + 1 envoyee + 1 prete ; `formulaire` = 3 annulee + 2 envoyee ;
     `courrier` = 1 annulee.
   - `demande.statut` : **annulee 105 · brouillon 50 · envoyee 3 · prete 1** (`annulee` = renommage de
     `abandonnee`, `090_renommer_statut_abandonnee_en_annulee.sql:28`).
   - ⚠️ **Les 50 brouillons et la seule `prete` sont TOUS `email`.** La file rail B non-envoyée
     (`formulaire` brouillon/prete) est **vide aujourd'hui**.
2. **Le canal est FIGÉ à la création** : unique écriture `INSERT INTO demande (… dest_canal …) VALUES (… $7 …)`
   (`demandeRepo.ts:714-718`), `$7 = dest.canal` issu de `resoudreDestination` (`:707-713`) qui lit
   `SELECT mc.canal FROM mairie_contact` (`:699-704`). Mapping : `destinataire.ts:62` (copie directe) ou
   `destinataire.ts:50,54` (override `email` si PRADA au courriel). Intention documentée
   `053_demande.sql:52` (« figés à la création »).
3. **Il ne change JAMAIS ensuite** : grep exhaustif des `UPDATE demande SET …` (hors tests) → seules
   colonnes écrites : `statut, corps, objet, profil_demandeur, maj_le` (`demandeRepo.ts:873,934,990,1009,1121,1225` ;
   `envoiDemande.ts:112`). **Aucun** UPDATE de `dest_canal`. **Aucun trigger** (`pg_trigger` sur `demande`
   et `mairie_contact` = 0).
4. **Factuel — une commune change de canal alors qu'elle a des demandes :** la demande existante **garde
   son `dest_canal` figé**. Preuve réelle : demande `id=8`, `code_insee=75056` (Paris), `dest_canal='courrier'`,
   alors que `mairie_contact` pour 75056 est aujourd'hui `formulaire` — la commune a changé de registre, la
   demande n'a pas suivi (aucun `courrier` ne reste dans `mairie_contact`, mais la demande le porte encore).
   Conséquence : si Paris repassait en `email`, ses demandes figées `courrier`/`formulaire` ne rejoindraient
   jamais l'envoi auto rail A (`envoiDemande.ts:148` exige `dest_canal='email'`) — il faudrait une nouvelle
   demande. Choix d'auditabilité assumé (`053_demande.sql:50-51`).

### AXE C — Le parcours « je veux demander à telle commune »

1. **Un SEUL chemin de création existe** (hors script de démo `reponseDemo.ts`) : l'unique `INSERT INTO demande`
   est `demandeRepo.ts:715`, atteint par **Propositions de lots** uniquement :
   `ADemanderVue.tsx:174` « Préparer » → `proposition/route.ts:25` → `CartePropositions` « Créer » `DemandesRendu.tsx:363`
   → `POST …/demandes` (`demandes/route.ts:46`) → `creerDemandes` `demandeRepo.ts:651`.
   **Commune libre ? NON** : l'utilisateur coche des **lots** produits algorithmiquement (`proposerLots`,
   `demande.ts:250`) sur le top `nb_candidats_examines` du classement ; le serveur ne recrée que les lots
   qu'il **re-dérive lui-même** (`apparierSelection` par clé, `demandeRepo.ts:654`) → impossible de forger
   un lot pour une commune choisie. Le bloc « Stock par commune » est **lecture seule** (aucun bouton
   « demander », `ADemanderVue.tsx:154`). Les routes `…/demandes/depot` et `…/demandes/reference` ne créent
   aucune demande.
2. **Pourquoi « demander à Paris » échoue aujourd'hui = PLAFOND MENSUEL à 0.** Paris (`75056`, 4706 dossiers
   Sitadel, `mairie_contact` canal `formulaire`, `max_dossiers_par_demande=1`, profil imposé `personne`) a
   déjà 5 demandes. `config_veille` : `permis_par_commune_par_mois=5`, `dossiers_par_demande=1`,
   `anciennete_max_demande_annees=1`. `proposerLots` (`demande.ts:262-263`) :
   `quota = max(0, 5 − permisCeMoisParCommune)` ; `if (quota<=0) continue`. `lireHistorique`
   (`demandeRepo.ts:123-127`) compte les permis des demandes `statut IN (envoyee,close)` du mois courant :
   Paris en août 2026 = 4 + 1 = **5 → quota 0 → aucun lot Paris**. Paris n'apparaît que comme compteur
   **anonyme** (`communesPlafondMensuel`, `demandeRepo.ts:160-163` ; texte « N commune(s) au plafond »,
   `demande.ts:406/424`). Facteurs aggravants (non bloquants seuls) : canal `formulaire` → tout lot Paris
   irait en dépôt manuel (rail B), profil forcé `personne`, 1 dossier/lot ; fenêtre 1 an réduit Paris à
   ~278 dossiers éligibles. **Ce n'est PAS** un manque de chemin, ni une exclusion de canal, ni un hors-top.
3. **Visibilité des demandables ailleurs que « stock par commune » :** le stock (`stockPermisParCommune` →
   `agregerStock`, `stock.ts:51-56`) applique l'éligibilité **mais PAS le plafond mensuel** → Paris y
   **apparaît** avec ses ~278 demandables, **mais en lecture seule**. Dans les lots actionnables
   (`CartePropositions`), Paris est **absente** dès que le quota est 0. Un permis peut donc être « demandable »
   (visible au stock) **et** impossible à demander (absent des lots) sans que l'écran ne nomme Paris — c'est
   l'angle mort exact.

### AXE D — Suppression des demandes

1. **Aucun DELETE physique n'existe.** La route `demandes/[id]/route.ts` n'expose que `GET`/`PATCH`
   (`:17/29`). Primitives réelles :
   - **Annuler** (`changerStatutLot`, `nouveau='annulee'`, `demandeRepo.ts:913`) :
     `UPDATE demande SET statut='annulee', maj_le=now()` (`:934`) **+** `UPDATE demande_dossier SET actif=false
     WHERE demande_id=$1 AND satisfait_le IS NULL` (`:937`) **+** si `dest_canal='formulaire'` →
     `resoudreDepotPresume(…,'renoncee')` (`:942`) **+** `INSERT INTO demande_journal` (`:962`).
     **Réversible** (annulee→prete réactive les liens, `:944-960`). Aucune ligne détruite.
   - **Retrait d'un dossier** : `demande_dossier.actif=false` (ligne conservée). **Clôturer** (`:976`,
     interdit hors `envoyee`). **supprimerReferenceExterne** (`:1095`, `DELETE FROM demande_reference_externe`
     — cible une référence, jamais la demande). Le commentaire `:896` confirme : « le vrai abandon … n'existe pas ici ».
2. **Une non-envoyée (brouillon/prete) est-elle effaçable ?** FK référençant `demande` (via `pg_constraint`) et
   lignes filles présentes sur les non-envoyées :

   | Table référençante | ON DELETE | lignes sur brouillon | sur prete |
   |---|---|---|---|
   | `demande_dossier` | **NO ACTION** | 103 (actives) | 1 |
   | `demande_acheminement` | NO ACTION | 0 | 0 |
   | `demande_reponse` | NO ACTION | 0 | 0 |
   | `demande_relance` | NO ACTION | 0 | 0 |
   | `releve_run` | NO ACTION | 0 | 0 |
   | `demande_depot_presume` | CASCADE | 0 | 0 |
   | `demande_reference_externe` | CASCADE | 0 | 0 |
   | `proposition_cada` | CASCADE | 0 | 0 |

   **Aucun trigger** sur les tables `demande*` (`information_schema.triggers` = 0). Un DELETE d'un
   brouillon/prete est **bloqué par le seul FK `demande_dossier` (NO ACTION)** tant que ses liens existent ;
   les 3 FK CASCADE n'ont **aucune** ligne sur les non-envoyées → rien ne serait cascadé en silence. ⚠️
   **`demande_journal` n'a AUCUNE FK vers `demande`** (`pg_constraint` = 0) : un DELETE laisserait 50
   lignes de journal orphelines (brouillons) + 2 (prete), non bloquant mais détaché.
3. **Effacer une demande libère-t-il ses dossiers ?** Oui — **par la suppression préalable obligatoire des
   `demande_dossier`** (nécessaire pour débloquer le DELETE). La logique « déjà demandé » repose
   exclusivement sur `dd.actif` (`SQL_DOSSIERS_DEJA_DEMANDES` `demandeRepo.ts:111-118` ; `demande.ts:218` ;
   `priorite.ts:148`). Retirer le lien actif rend le dossier proposable — exactement comme « annuler ».
4. **Comptes par statut** (dossiers gelés = liens `demande_dossier` actifs) :

   | Statut | demandes | liens | liens **actifs** | dossiers gelés |
   |---|---|---|---|---|
   | annulee | 105 | 288 | 0 | **0** (déjà libérés) |
   | brouillon | 50 | 103 | 103 | **103** |
   | envoyee | 3 | 6 | 3 | **3** |
   | prete | 1 | 1 | 1 | **1** |

   Non-envoyées (brouillon+prete) : **104 dossiers gelés**.
5. 🔴 **Preuves juridiques menacées par une suppression :**

   | Preuve | Table | Où elle vit | Verdict |
   |---|---|---|---|
   | Acheminement / expédition | `demande_acheminement` | 3 lignes, **toutes envoyee** ; 0 non-envoyée | N'existe que sur envoyée |
   | Référence mairie / accusé | `demande_reference_externe` (mig 085) | 2 lignes envoyee ; FK **CASCADE** | Un DELETE d'une envoyée les effacerait **en silence** |
   | Réponse / relance | `demande_reponse`, `demande_relance` | envoyee only | idem |
   | Dépôt présumé (téléservice) | `demande_depot_presume` (mig 124) | 1 ligne, demande annulee formulaire, `renoncee` ; FK CASCADE | 0 sur brouillon/prete |
   | Journal d'audit | `demande_journal` | 50/2 sur non-envoyées ; **aucune FK** | Deviendrait orphelin, non protégé |
   | `saisine_cada` (083), `rattachement_reference_mairie` (091) | — | **tables inexistantes en base** (`to_regclass`=NULL) | aucune preuve stockée |

   **Bilan :** une **brouillon/prete ne porte AUCUNE preuve juridique** (0 acheminement/référence/réponse/
   relance/dépôt/cada) — uniquement des liens `demande_dossier` + le journal. La supprimer physiquement ne
   détruit aucune preuve, **à condition** (a) de retirer d'abord les `demande_dossier` (ce qui libère les
   dossiers) et (b) de trancher le sort du journal orphelin. **Tout le risque juridique est sur les
   `envoyee`** (CASCADE effacerait acheminement + référence mairie).

### AXE E — Réglages touchant les demandes (thèmes actuels + rail)

Fait structurant : `corps` et `dest_canal` sont posés au même INSERT (`demandeRepo.ts:714-717`) ; le corps est
identique quel que soit le canal → tout réglage qui **façonne le corps ou l'identité** vaut pour **les deux**
rails (pour B, l'humain recopie ce corps dans le téléservice). L'ancre d'échéance est **agnostique au canal**
(`envoiRelance.ts:163` « formulaire compris » ; `demande.ts:255`).

**RAIL A pur — aucun sens pour le rail B** (tous liés à l'émission/auto-émission d'e-mails) :
`envois_max_par_run`, `envois_max_par_jour` (`envoiDemande.ts:198`, `envoiRelance.ts:233`) ;
`envoi_heure_debut`, `envoi_heure_fin` (`envoiAuto.ts:101,102,189`) ; `relance_auto_active`
(`envoiAuto.ts:189` ; l'auto-envoi filtre `dest_canal='email'`, `envoiRelance.ts:170`) ;
`envois_auto_max_par_run` (`envoiAuto.ts:189`, **absent de l'UI Réglages** — non surfacé dans `PARAMS_VEILLE`).

**Les deux rails** (éligibilité amont, corps, mentions, échéances, réponses, alertes, CADA) — extrait :
`anciennete_max_demande_annees`, `nb_candidats_examines`, `tri_candidats`, `dossiers_par_demande`,
`permis_par_commune_par_mois`, `pieces_demandees`, `profil_demandeur_defaut` (préparation) ;
`adresse_reponse`, `relance_rappel_jours_avant`, `relance_avis_jours_avant`, `relance_saisine_delai_jours`,
`mention_service_*`, `mention_delai_*`, `mention_sources_*` (corps) ; `releve_*`, `echeance_alerte_jours`,
`piece_taille_max_mo`, `nature_accuse_motifs`, `depot_adresses_connues` (réception/échéances) ;
`alerte_active`, `alerte_email`, `alerte_heure_locale` (récap opérateur) ;
`proposition_cada_active`, `cada_email`, `cada_url_formulaire`, `saisine_cada_auto_active` (CADA) ;
`dila_url` (annuaire). *(Références `fichier:ligne` complètes établies par l'axe E — chaque clé tracée à
son ou ses lecteurs.)*

**Vestigiaux (ne pilotent plus aucun rail) :** `demandes_par_commune_par_mois` (remplacé par
`permis_par_commune_par_mois`, refusé `validerReglages` `reglagesVeille.ts:461`) ; `relance_jours_avant_echeance`
(remplacé par `relance_rappel_jours_avant`, `veilleConfig.ts:66`). **Hors périmètre demandes :**
`obstacle_disparu_alerte_active` (signal certificat/BD TOPO).

---

## 4. AXE F — La ligne à ne pas franchir (le point le plus important)

**Fait structurant :** *aucune* fonction de surveillance ne reçoit de « liste d'écran » ; **toutes lisent la
base directement** avec leur propre `WHERE`. Les deux écrans appellent `chargerDemandesSuivi()` /
`chargerSuiviReponses()` **sans argument** (`en-cours/route.ts:17`, `reponses/route.ts:23`) : il n'existe
aujourd'hui **aucun paramètre de rail**. Le seul module « qui reçoit une liste » est `rattacherReponse`
(pur, `rattachementReponse.ts:128`), et ses candidates viennent d'une requête canal-agnostique (`lireEnvoyees`).
Le danger est donc **prospectif** : il naîtrait si, pour séparer les listes par rail, on poussait un
`AND dest_canal=…` **dans** l'une des requêtes ci-dessous plutôt que de partitionner l'affichage en aval.

### 🔑 Requêtes/fonctions qui NE DOIVENT JAMAIS recevoir de filtre de rail (`dest_canal`)

1. **`chargerDemandesSuivi` — `reponsesSuivi.ts:296`** (`WHERE d.statut IN ('envoyee','close')`).
   *Source unique de « En cours » ET « Réponses ».* Filtrée par rail → les demandes de l'autre canal
   disparaissent des deux écrans : échéance CRPA plus calculée/affichée, retour mairie plus suivi. **La plus
   dangereuse.**
2. **`lireSaisinesEligibles` / `SQL_CANDIDATS` — `saisineCadaRepo.ts:59-80`** (`WHERE d.statut='envoyee'`,
   CTE ancre « agnostique au canal » `:60-63`). Filtrée sur `dest_canal='email'` → les demandes téléservice
   (formulaire, ex. Paris) dépassant le délai CRPA **ne seraient jamais détectées comme saisissables** →
   aucune saisine CADA → **forclusion à 2 mois atteinte en silence** (perte définitive du recours).
3. **`lireDemandesEnvoyees` — `relanceAuto.ts:246-261`** (`WHERE d.statut='envoyee' AND profil_demandeur=$1`).
   Filtrée par rail → plus de brouillon de relance (rappel/avis/saisine) pour l'autre canal → la cascade
   s'arrête, la mairie n'est jamais relancée pour ce rail.
4. **`chargerEntreeAlerte` (bloc échéances) — `alerteAuto.ts:127-140`** (`WHERE d.statut='envoyee'`).
   Filtrée par rail → les demandes de l'autre canal passant « proche/dépassée » ne remontent plus dans
   l'alerte quotidienne → l'exploitant n'est jamais prévenu qu'un délai expire.
5. **`lireEnvoyees` — `releveReponses.ts:173-182`** (+ satellites `lireReferencesRecherche:206`,
   `dateDepart:239`, `lireDomainesDerives:310`). Filtrée par rail → les réponses des mairies de l'autre canal
   ne trouvent plus de demande candidate → restent « à rattacher » indéfiniment (et la demande paraît
   silencieuse → relance/saisine à tort). `lireDomainesDerives` existe *spécifiquement* pour capter les
   réponses des communes **formulaire sans `dest_email`** (Paris) — le filtrer par email les aveuglerait.
6. **`lireCandidatsSaisine` — `envoiSaisineCada.ts:123-138`** (`WHERE d.statut='envoyee'`). ⚠️ Ne pas
   confondre son CTE `canal='email'` (qui borne l'**acheminement confirmé** servant d'ancre de date) avec un
   filtre sur `demande.dest_canal` : ajouter `AND d.dest_canal='email'` empêcherait l'envoi/dépôt de la
   saisine pour une demande formulaire pourtant saisissable.

**Cas où `dest_canal` EST lu — et pourquoi ce n'est pas un risque de surveillance :** envoi auto rail A
(`envoiDemande.ts:148`, `envoiRelance.ts:170`, `dest_canal='email'`, voulu) ; files rail B formulaire-only
(« Dépôts à confirmer » `reponsesSuivi.ts:537`, présomption `depotPresume.ts:36`, « à déposer »
`demandeRepo.ts:1051`) ; `chargerLotRelance` lit `dest_canal` pour renseigner le texte, **sans `WHERE`**
dessus (`relanceAuto.ts:196-218`).

**Principe à graver :** la séparation par rail est une opération d'**AFFICHAGE**, à faire en aval (partition
de `demandes[]` par canal dans le rendu — le motif `partitionnerReponses` existe déjà,
`reponsesSuivi.ts:163-164`), **jamais** par un `dest_canal` poussé dans les six requêtes ci-dessus. Un motif
« B2 » est déjà gravé en commentaire dans plusieurs de ces requêtes (`reponsesSuivi.ts:322-323`,
`alerteAuto.ts:137`, `relanceAuto.ts:257`) : il documente exactement ce garde-fou (un défaut symétrique —
filtrer `canal='email'` sur l'acheminement — avait déjà été corrigé une fois).

---

## 5. Ce que je n'ai pas pu établir (et pourquoi)

- **Aucun DELETE réel n'a été exécuté** (consigne lecture seule) : le blocage NO ACTION et le comportement
  CASCADE sont **déduits de `confdeltype`** (`pg_constraint`), non observés à l'exécution. Le sort du journal
  orphelin (conserver vs purger) est un **choix de conception non tranché** — aucune primitive de suppression
  n'existe encore.
- **Origine des lignes `statut='envoyee'` en base** (3 demandes) : le code répète « aucun envoi réel n'existe
  encore » ; je n'ai pas déterminé si ces `envoyee` viennent d'un passage de statut manuel ou d'un jeu de
  données. Cela ne change pas les calculs (plafond, surveillance les comptent), mais leur origine n'est pas
  prouvée.
- **Classement de priorité complet non rejoué** : que les ~278 dossiers Paris figurent bien dans le top
  `nb_candidats_examines` est **déduit** de l'existence des demandes Paris d'août (qui ont dû passer par
  `proposerLots` quota>0), pas prouvé par un `EXPLAIN` du rang de chaque dossier.
- **Date exacte de la tentative « Paris » du porteur inconnue** : le diagnostic « plafond 5/5 » vaut pour le
  27/08/2026. Si sa tentative précédait la demande du 04/08, le quota n'était pas nul et l'échec aurait une
  autre cause (probablement : lot Paris présent mais rangé en « à déposer à la main » formulaire, non reconnu
  comme une demande e-mail). Impossible de trancher entre les deux moments sans cette date.
- **Chemin complet du dépôt/relance MANUEL d'une demande rail B** : préparation prouvée agnostique au canal et
  auto-envoi prouvé filtré `email` ; le geste exact par lequel l'opérateur dépose à la main une **relance**
  formulaire n'a pas été tracé de bout en bout (classification appuyée sur commentaires + filtres SQL, pas sur
  une exécution observée).
- **`BandeauReglages`** : les valeurs `ancienneteMaxAnnees`/`triLibelle` sont des props calculées par un
  composant serveur parent non lu ligne à ligne (probablement `config_veille` via la route `reglages`).
- **Migrations 076/083/128 et corps intégral d'`executerVeille.ts`** non lus ligne à ligne : non nécessaires à
  la conclusion (le risque de rail se joue dans les `WHERE` runtime, tous cités). Les tables `saisine_cada`
  (083) et `rattachement_reference_mairie` (091) sont **absentes de la base** — migrations non matérialisées.
```
