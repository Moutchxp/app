# PLAN — Onglet « Les coûts » dans « Mon espace » (chantier en lots)

> Reconnaissance en lecture seule du 03/11/2026 : aucun code modifié, aucune écriture en base, aucune migration. Un lot = un prompt = un commit.
> Migrations livrées NON APPLIQUÉES, code compatible sans elles (colonne/table absente → comportement d'avant, message « disponible après
> la mise à jour »), comme dans `docs/PLAN_MON_ESPACE.md`. Les références `fichier:ligne` sont celles du commit `6f40f774`.

---

## 🔴 Décisions d'Arno (03/11/2026) — elles PRIMENT sur toutes les propositions de ce plan

**RÈGLE ABSOLUE — UNE SEULE COMPTABILITÉ** : une valeur (nature × poste × mois × structure) n'existe qu'à UN endroit. Modifiée d'un côté (Les coûts,
Suivi CA, Mon espace, Gestion, Location, affaire), elle est mise à jour partout où elle apparaît et se répercute dans tous les calculs (CA net, CA net
consolidé, Espace par négociateur, variable, résultat net, cartes, graphiques). Aucune copie, aucune valeur parallèle, aucune ligne « Ajustement » à
côté de la vraie valeur.

- **C1.** Onglet « Les coûts » visible UNIQUEMENT pour les profils au statut « Associé » (statut existant). Pas de nouveau droit.
- **C2.** L'onglet suit le sélecteur « Voir » (CRITERIMMO / MACJ / FUSION) ; absent de la vue perso.
- **C3.** Salaires chargés : saisis directement (montant chargé tel quel, par salarié et par mois). En plus, une colonne « Variable négo (calculé) »
  affichée POUR INFORMATION à côté des salaires : valeur lue dans le calcul existant, non saisissable, NON ajoutée aux totaux du tableau des salaires
  (elle est déjà comptée dans son propre poste ; pas de double compte).
- **C4.** Correction d'un coût automatique = correction de l'enregistrement source lui-même (l'affaire, le bail…), accessible depuis la case du tableau
  (clic → détail du mois → affaires) comme depuis le Suivi CA : même enregistrement, mêmes gestes, même journal.
- **C5.** Postes ajoutés : part de gestion versée aux apporteurs, rémunération des collègues apporteurs, colonne « Autres » par famille (loyer,
  logiciels, portails, assurances, comptable, banque, publicité, GLI…).
- **C6.** MONGA : on saisit uniquement la FACTURE MENSUELLE MONGA (leur prestation). Aucune notion de devis ni d'intervention dans ce module.
- **C7.** Coûts de location et de gestion = CRITERIMMO uniquement (MACJ = vente seulement).
- **C8.** Les salaires déjà saisis en montant mensuel sont EFFACÉS : tout sera ressaisi par salarié à partir de 2026. Exécution au lot des salaires
  (pas avant) : migration dédiée, précédée d'une sauvegarde complète des montants effacés (fichier dans `.captures/sauvegardes/`, + trace au journal),
  réversible. ⚠️ **Conséquence : les années avant 2026 n'auront plus de salaires chargés dans « Coûts globaux » ni dans le résultat net** (gestion
  2025 : 18 577,46 € HT aujourd'hui ; gestion 2026 : 2 688,91 € ; location 09/2026 : 2 000 €).
- **C9.** Fonction des profils : une case par fonction (vente / location / gestion) dans la page Comptes, pré-cochée d'après les données
  existantes, plusieurs fonctions possibles.

- **C10.** La colonne « dont primes de gestion (dans le variable) » s'intitule « Primes de gestion » (elle ne contient que les primes). Plus aucun « dont ».
- **C11.** Tableau LOCATION, ordre des colonnes : Mois | Apporteurs | Variable négo (calculé) (pour information, hors totaux) | Primes de gestion |
  Variable négociateur (primes incluses) | Salaires chargés | Part de gestion versée aux apporteurs | Rémunération des collègues apporteurs | Autres |
  Total location.
- **C12.** Le tableau sous le graphique a QUATRE onglets : « Vente » (inchangé, par défaut) | « Location » (colonnes C11) | « Gestion » (Salaires
  chargés, ADHOC, MONGA facture mensuelle, Autres, Total gestion) | « Synthèse location et gestion » (Mois | Total location | Total gestion | Total
  location et gestion, ligne de l'année ; rien d'autre). La synthèse lit les MÊMES totaux que les onglets Location et Gestion. En MACJ : Location,
  Gestion et Synthèse présents, chaque case « — », avec « MACJ : vente seulement ». L'onglet choisi est dans l'adresse (`?couts-tableau=`).
  Aucun nouveau calcul : seuls l'ordre, les titres et la répartition en onglets changent (chantier du 03/11/2026).

- **C13.** Colonne MONGA : titre « MONGA » seul (sans « (facture mensuelle) »).
- **C14.** La mention « (saisie au lot suivant) » disparaît de tout l'écran (vocabulaire interne). Chaque colonne encore sans saisie garde son titre
  simple avec un picto « i » (au survol, au toucher) qui dit en une phrase ce qu'elle contiendra ; ses cases restent vides (fond gris). Le picto est le
  composant du Suivi CA (« Variable négociateur ») : `EnteteAide`, extrait tel quel de `EnteteVariableNegociateur` (même rendu), aucune recopie.
  Les phrases : `AIDE_POSTES_FUTURS` (`CoutsMonEspace.tsx`). Correctif d'affichage du 03/11/2026 : aucun calcul, aucune valeur, aucune colonne touchés.

- **C15.** Tout coût saisissable se modifie DIRECTEMENT dans les tableaux (Vente, Location, Gestion) ET depuis une page « Saisir les coûts du mois ».
  Les deux écrivent le MÊME enregistrement ; toute saisie se propage partout (Les coûts, Synthèse, Coûts globaux et CA global du Suivi CA, CA net,
  résultat net, Mon espace).
- **C16.** Page « Saisir les coûts du mois » : mois proposé = le mois PRÉCÉDENT (au 03/11/2026 → octobre 2026) ; sélecteur limité aux 6 derniers
  mois révolus.
- **C17.** Tant que les coûts du mois précédent ne sont pas complets : un badge discret sur l'onglet « Les coûts » (« Coûts d'octobre à saisir »)
  et un bouton en tête de l'onglet ouvrent la page de saisie.
- **C18.** Phrase du picto « Salaires chargés » (Vente) validée telle quelle.
- **C19 (remplacée, option A d'Arno, 03/11/2026).** « Part de gestion versée aux apporteurs » et « Rémunération des collègues apporteurs » sont
  AUTOMATIQUES, reprises du calcul du module Location (`duRecurrent`, `commissionCollegueSignatureDe`, `duCollegueRecurrent` — les fonctions de
  son Résumé de la période) : la part versée en une fois reste dans « Apporteurs » (`partGestionSignatureDe`), seule la part RÉCURRENTE va dans
  « Part de gestion ». Correction à la source (le bail ou la règle de l'apporteur, comme C4). Elles entrent dans les coûts du Suivi CA
  (`coutsLocation`), donc partout, sans double compte : un apporteur INTERNE (un collègue) est payé par « Apporteurs » et n'a jamais de
  « rémunération du collègue » (`remunerationCollegueDe` le refuse) ; le variable du négociateur est déjà calculé net de ces commissions.
  Constat du 03/11/2026 (lecture seule) : 24 apporteurs, tous externes ; 1 barème « Récurrent » ; 4 règles de collègue, toutes « non rémunéré ».

Ce que ces décisions changent dans le plan ci-dessous (les passages concernés sont réécrits) : plus de droit « Coûts » (C1 : le statut « Associé ») ;
plus de ligne « Ajustement » ni de table de corrections (C4 + règle absolue) ; les salaires mensuels ne sont plus gardés à côté du détail, ils sont
effacés au lot des salaires (C8) ; plus de devis MONGA (C6) ; la part de gestion récurrente des apporteurs et les collègues apporteurs deviennent
des postes (C5) ; location et gestion restent CRITERIMMO, sans colonne de structure (C7).

**Conséquence de C1 + C2, constatée** : « Voir » (le mode agence) n'existe aujourd'hui que pour les administrateurs, et les deux seuls associés sont
les deux administrateurs. Un associé qui ne serait pas administrateur n'aurait donc pas l'onglet (pas de « Voir », et l'onglet est absent de la vue
perso). Le serveur exige les deux (associé ET administrateur, comme le mode agence). À rouvrir si Arno nomme un associé non administrateur.

---

## Spec d'Arno (03/11/2026) — recopiée telle quelle

- Nouvel onglet « Les coûts » sur la ligne « Compromis | Mois | Année(s) | Mes apporteurs », visible UNIQUEMENT pour les profils associés.
- Même type de page que « Mois » / « Année(s) », dédiée aux coûts : courbes pour analyser les coûts entre eux et leur évolution d'une année sur l'autre.
- 3 familles de coûts séparées dans le graphique : coûts liés aux VENTES, à la LOCATION, à la GESTION.
- Choix de l'année analysée : ce choix pilote TOUTE la page (graphique, tableau). On ne mélange jamais des coûts d'années différentes dans une même analyse.
- Sous le graphique, un tableau récapitulatif avec deux onglets : « Vente » et « Location et gestion ». Lignes = les 12 mois de l'année ; colonnes = les postes de coûts ; en bas de chaque colonne, le total par nature de coût.
- Tout ce qui peut se remplir automatiquement doit l'être, mais chaque ligne de coût doit rester modifiable.
- Location / gestion : saisie des SALAIRES CHARGÉS. Un même poste peut avoir plusieurs salariés ; chaque salaire chargé est rattaché à un profil collaborateur. Choix proposés = profils rattachés à la location ou à la gestion, en PREMIER ceux rattachés directement à la fonction en cours de saisie.
- Colonnes = tous les coûts rattachés directement à l'activité. Ex. gestion : salaires chargés + MONGA + ADHOC + « tout ce que j'aurais oublié ». Idem pour vente et location.
- CONNEXION TOTALE : toutes les données saisies ou corrigées dans ce module sont reliées à l'ensemble des données déjà traitées dans l'application et se propagent dans TOUS les outils d'analyse des coûts et du CA (Suivi CA : CA net, CA net consolidé, Espace par négociateur, variable négociateur, primes de gestion, cartes et graphiques ; Mon espace : vue perso et mode agence ; inter-cabinet ; modules Gestion et Location).

---

## 0. Constat principal (à lire d'abord)

**Le moteur des coûts existe déjà, et il est unique** : `app/lib/transaction/coutsGlobal.ts` (pur, sans base) assemble les trois familles
VENTE / LOCATION / GESTION en appelant la fonction propre à chaque page (`coutsVente` → `lignesCarteAffaire` / `caNetVente` ; `coutsLocation`
→ `locationCa.ts` ; `totauxGestion` → `gestionVue.ts`). Il alimente déjà, dans « Suivi CA › CA global » (`EcranGlobal`,
`EcransTransaction.tsx:1720`) :
- le tableau « Coûts globaux » mois par mois / année par année (`CoutsGlobaux.tsx:81,94`, colonnes groupées Vente / Location / Gestion, Total, N-1, écart) ;
- la ligne « Résultat net » (`ResultatNetGlobal.tsx:35`) = CA global − coûts ;
- la mesure `couts` du graphique global, par famille et par structure (`grapheGlobal.ts:51-80`, `atomesDuPoint`).

➡️ **« Les coûts » ne crée AUCUN nouveau calcul** : c'est une nouvelle PAGE (même gabarit que « Mois » / « Année(s) » de Mon espace) sur
`coutsGlobaux` / `coutsGlobauxAnnees`, plus trois sources de saisie qui manquent aujourd'hui (salaires par salarié, coûts « oubliés »,
fonction d'un profil). Toute saisie entre dans `coutsDe` (`coutsGlobal.ts:68`) ; c'est ce qui garantit la « connexion totale ».

---

## 1. Inventaire des coûts existants

Conventions : moteurs en centimes `MontantC = { htC, ttcC }` (`partAgence.ts:27`) ; base en euros `numeric` ; `TVA = 1.2`
(`modele.ts:28`) ; aucune suppression (triggers anti-DELETE, retrait par `retire_le`, `433_transaction.sql`).

### 1.1 Famille VENTE (porte une structure)

| Coût | Source (table.colonne) | Calcul (fonction unique) | Granularité | HT/TTC |
|---|---|---|---|---|
| Commissions négociateurs | `transaction_vente_ligne` (rôle négociateur : `montant_ttc` / `montant_ht` (437), `taux`, `cote`, `mode_commission`) | `remuneration` / `remunerationDuCote` (`commissions.ts:129,157`) → `ventilationVente` (`partAgence.ts:107`) → `lignesCarteAffaire` (`carteAffaireLignes.ts:94`) ; par classe : `payeParClasseTtc` (`modele.ts:445`) | par vente et par côté ; structure = celle de la partie du côté (`societeDuCote`, `carteAffaireLignes.ts:45`) | saisi HT ou TTC, les deux calculés |
| Rétrocessions apporteurs (sur la vente) | `transaction_vente.retro_apporteur_ttc` / `_ht` (434, 437) | `apporteurVerseHt` (`commissions.ts:205`) | par vente | TTC (HT = ÷ 1,2) |
| Rétrocessions apporteurs (mensuelles) | `transaction_retrocession` (`annee`, `mois`, `negociateur`, `montant_ttc`, `vente_id` nul = « à répartir », `societe`) | `retroTtcDe` (`modele.ts:453`) ; répartition entrée/sortie au prorata (`carteAffaireLignes.ts:122`) | mois × négociateur × structure | TTC |
| Reversé inter-cabinet | `transaction_inter_cabinet` (`societe` receveuse, `porteuse`, `part_ht`, `etat`) + `transaction_partie` | `bilanVente` (`modele.ts:259`), `miroirsAttendus` / `ligneMiroir` (`interCabinet.ts:27,42`) | par vente, par structure receveuse | HT |
| Agences extérieures | `transaction_partie` (`sorte='exterieure'`, `pourcentage` / `montant_ht`) | `bilanVente`, `LigneCarte.exterieures` | par vente | HT |
| CA « à rattacher » | `transaction_ca_a_rattacher` (`societe`, `annee`, `mois`, `montant_ttc`) | recette, PAS un coût — cité pour mémoire | mois × structure | TTC |

Aucun salaire, frais, abonnement ou dépense n'existe aujourd'hui côté vente.

### 1.2 Famille LOCATION (aucune colonne de structure → CRITERIMMO implicite, `locationCa.ts:5`)

| Coût | Source | Calcul | Granularité | TVA |
|---|---|---|---|---|
| Primes de gestion (nouvelle gestion) | règle `gestion_location_commission_regle.prime_gestion_logement / _parking / _local` (406, 412) ; surcharge par bail `gestion_location_activite.categorie_prime`, `prime_gestion_saisie`, `prime_mode` | `primeDe` (`location/suivi/tableauBord.ts:131`) → `montantsLigne` (`locationCa.ts:78`) | par bail, sommé au mois | sans TVA |
| Commission apporteur — part location | `gestion_location_apporteur_bareme.taux` ; par bail `apporteur_taux`, `apporteur_commission_saisie` | `partLocationDe` (`tableauBord.ts:166`) | par bail | sans TVA |
| Commission apporteur — part gestion (one shot) | `bareme.mode`, `taux_gestion`, `duree_annees` ; par bail `apporteur_mode`, `apporteur_taux_gestion`, `taux_gestion_bien_ht` | `partGestionSignatureDe` (`tableauBord.ts:208`) | par bail | sans TVA |
| Commission apporteur — part gestion RÉCURRENTE | idem | `partGestionMensuelleDe` / `duRecurrent` (`tableauBord.ts:208-266`) | par mois | ⚠️ NON comptée dans le Suivi CA (`locationCa.ts:8-9`) |
| Rémunération du collègue apporteur | `gestion_location_apporteur_remuneration` (419) | `commissionCollegueSignatureDe` (`tableauBord.ts:296`), `duCollegueRecurrent` (`:372`) | par bail + récurrent | ⚠️ NON comptée dans le Suivi CA (`locationCa.ts:74`) |
| Variable négociateur | non stocké : taux `commission_regle` (15 %) | `variableC` (`locationCa.ts:115`) ; affichage `variableNegociateur` = variable + primes (`locationCa.ts:160`) | par bail → mois × négociateur | sans TVA |
| Rétrocessions négociateur (location) | `gestion_location_retrocession.montant` (406) | diminuent le variable : `coutsLocationMois` (`locationCa.ts:142`) | mois × négociateur | — |
| Salaires chargés location | `transaction_location_salaires_mois.salaires_ht` (447) — **UN montant par mois, sans salarié** (1 ligne en base : 09/2026) | `coutsLocationMois` (`locationCa.ts:140`) : un mois AVEC salaires → primes et variable « inclus dans les salaires », non déduits | mois | sans TVA |
| Coût fixe mensuel apporteur | `bareme.cout_fixe_mensuel` | **champ mort** (toujours 0, `@deprecated`, `suivi.ts:233`) | — | — |

Le module Location calcule aussi son propre net : `resumeDuMois` (`tableauBord.ts:1466`) et `resultatNetAgence` (`tableauBord.ts:1545-1600`, droit
`perm_resultat_net`), qui déduisent les collègues mais pas la part récurrente : **deux définitions du net location coexistent** (voir § 8).

### 1.3 Famille GESTION (aucune colonne de structure → CRITERIMMO implicite, `EcransTransaction.tsx:2387`)

`transaction_gestion_mois` (433:153), une ligne vivante par (année, mois), 93 lignes 2019 → 09/2026 :

| Coût | Colonne | Calcul | TVA | Remplissage actuel |
|---|---|---|---|---|
| ADHOC (comptabilité externalisée « ADHOC Gestion ») | `adhoc_ht` | `moisGestion` / `totauxGestion` (`gestionVue.ts:48-69`) : net = honoraires − ADHOC − MONGA − salariés (`:54`) | × 1,2 (`TAUX_TVA_ADHOC`, `gestionVue.ts:29`) | import Excel (`importRepo.ts:131`) + saisie `SaisieGestion` (`EcransTransaction.tsx:2388`) |
| MONGA (prestataire d'interventions, forfait mensuel) | `monga_ht` (446) | idem | × 1,2 (`TAUX_TVA_MONGA`, `:31`) | saisie seule (vide partout aujourd'hui) |
| Salaires chargés gestion | `salarie_ht` — **UN montant par mois, sans salarié** (rempli 2025-2026) | idem ; option « Sans salaires » | sans TVA | saisie |
| Reste | `reste_ht` | affichage seul | — | import |

Autres montants présents mais **hors de tout calcul de coût** :
- `gestion_monga_etape.montant_cents` : devis / factures MONGA PAR intervention (191 étapes, montant rarement renseigné), affiché sur la frise
  (`FriseAvancement.tsx:772,872`), sommé « devis en attente / acceptés » (`tableauBordRepo.ts:64-75`). **Hors du module (décision C6)** : seule la
  facture mensuelle MONGA (`monga_ht`) est un coût.
- `gestion_partenaire_interne` (ADHOC) : des adresses, aucun montant.
- `gestion_location_gestion_perdue` (manque à gagner), `gestion_location_marge_gli` (recette), honoraires théoriques de gestion (recette) : pas des coûts.
- Introuvables : abonnements, factures fournisseurs, loyers, logiciels, publicité, assurances, frais bancaires.

---

## 2. Postes proposés (colonnes) par famille

Légende : ① **automatique** (source) ; ② **saisi à la main** ; ③ **automatique mais corrigeable** — la correction se fait À LA SOURCE (voir § 5.3).

### Onglet « Vente » (suit « Voir » : CRITERIMMO, MACJ ou FUSION)

| Colonne | Nature | Source / remarque |
|---|---|---|
| Commissions des négociateurs | ③ | lignes de commission des ventes du mois (`coutsVente`, la colonne de « Coûts globaux ») ; corrigées sur la carte de la vente (C4). Une seule colonne : la séparer indépendants / salariés serait un calcul nouveau (à proposer plus tard si Arno le veut) |
| Apporteurs | ③ | répartition de la vente + `transaction_retrocession` rattachées |
| Agences extérieures | ③ | `transaction_partie` extérieures |
| Salaires chargés vente | ② | NOUVEAU (par salarié, § 5.1) — n'existe pas aujourd'hui |
| Autres (vente) | ② | NOUVEAU (§ 5.2) : loyer, logiciels, portails, assurances, comptable, banque, publicité… (C5) |

L'inter-cabinet entre nos deux structures **n'est jamais un coût** (règle existante de `coutsGlobal.ts`, conservée) : en CRITERIMMO ou MACJ, chaque
structure compte les coûts de SES lignes de carte (`coutsVente(venteDansSociete(v, s), …, s)`, celle du graphique du CA global) ; en FUSION, la
page FUSION (`coutsGlobaux`). CRITERIMMO + MACJ = FUSION, au centime (testé).

### Onglet « Location et gestion » (CRITERIMMO et FUSION ; MACJ : aucune, C7)

| Colonne | Famille | Nature | Source |
|---|---|---|---|
| Apporteurs | Location | ③ | `partLocationDe` + `partGestionSignatureDe` ; corrigées sur le bail (`apporteur_commission_saisie`) |
| dont primes de gestion (dans le variable) | Location | ③, information | `primeDe` ; comptées DANS le variable (règle du 02/11/2026) ; corrigées sur le bail (`prime_gestion_saisie`) |
| Variable négociateur (primes incluses) | Location | ③ | `coutsLocationMois` ; « inclus dans les salaires » les mois où des salaires location existent (règle actuelle conservée) |
| Salaires chargés location | Location | ② | aujourd'hui un total mensuel (447) → par salarié (§ 5.1, C8) |
| Variable négo (calculé) | Location | information (C3) | `variableNegociateur(variable, primes)` : le calcul existant, même les mois où il est « inclus dans les salaires » ; NON ajouté aux totaux |
| Part de gestion versée aux apporteurs | Location | ③ (C5) | `partGestionMensuelleDe` / `duRecurrent` (`tableauBord.ts:208-266`) — à entrer dans `coutsLocation` au lot C7 |
| Rémunération des collègues apporteurs | Location | ③ (C5) | `commissionCollegueSignatureDe` / `duCollegueRecurrent` (`tableauBord.ts:296,372`) — idem |
| Autres (location) | Location | ② | NOUVEAU (C5) |
| Salaires chargés gestion | Gestion | ② | aujourd'hui `salarie_ht` mensuel → par salarié (C8) |
| ADHOC | Gestion | ② (③ si import) | `adhoc_ht`, déjà saisissable |
| MONGA (facture mensuelle) | Gestion | ② | `monga_ht`, déjà saisissable (C6 : ni devis ni intervention) |
| Autres (gestion) | Gestion | ② | NOUVEAU (C5) : GLI, logiciels… |

Chaque colonne a son total en pied ; une colonne « Total » par famille ; une ligne « Mois à confirmer » quand des ventes signées sans mois portent
des coûts (elles comptent dans l'année, dans aucun mois — la règle de « Coûts globaux ») ; la dernière ligne = l'année, celle de « Coûts globaux ».

### Postes ajoutés par la décision C5 (anciens « oublis »)
1. **Part gestion récurrente due aux apporteurs** et **rémunération des collègues apporteurs** : calculées par le module Location mais
   ABSENTES des coûts du Suivi CA (`locationCa.ts:8-9,74`) → elles entrent dans `coutsLocation` (lot C7), donc dans tous les écrans à la fois.
2. **Colonne « Autres » par famille** (loyer, logiciels, portails, assurances, comptable, banque, publicité, GLI…) : table `transaction_cout_divers` (§ 5.2).
3. Interventions MONGA par devis : **hors module** (C6).

---

## 3. Profils : fonction, structure, « associé »

- **Fonction (vente / location / gestion) : n'existe pas.** Aucune colonne ni table ne rattache un compte à une fonction. Ce qui s'en approche :
  `admin_utilisateur.service_gestion` (341, « appartient au service gestion », ne donne aucun droit), les droits de tuile `perm_transaction`,
  `perm_location`, `perm_gestion`, les négociateurs location (`gestion_location_activite.negociateur_id`, alias
  `gestion_location_negociateur_alias` (432)), les négociateurs vente (`transaction_vente.negociateur_entree_id/_sortie_id`, `lireNegociateurs`,
  `repo.ts:725`).
- **Associé : existe comme STATUT**, pas comme droit : `admin_utilisateur.statut ∈ {associe, salarie, independant, observateur}` (439,
  `app/lib/admin/statut.ts`). Aujourd'hui : 2 associés (les 2 administrateurs), 1 salarié, 1 indépendant, 2 « à renseigner ». Lecture serveur :
  `statutDuCompte` (`app/lib/admin/statutCompte.ts:20`).
- **Visibilité de l'onglet (décision C1)** : le statut « Associé » existant, lu au serveur (`statutDuCompte`) — aucun nouveau droit.
- **Ordre « fonction en cours d'abord »** (décision C9) :
  1. nouvelle table `admin_compte_fonction (compte_id, fonction ∈ {vente, location, gestion}, depuis, retire_le, pose_par_libelle)` (plusieurs
     fonctions possibles, datées, journalisées dans `admin_utilisateur_log`), une case par fonction dans la page Comptes ;
  2. pré-remplie à la migration par déduction (affichée « déduite », corrigeable) : `service_gestion` → gestion ; négociateur location connu →
     location ; négociateur vente / `transaction_societe_compte` → vente ;
  3. liste du sélecteur = profils actifs non observateurs ayant la fonction location OU gestion ; tri : d'abord ceux qui ont la fonction en
     cours de saisie, puis les autres de location/gestion, puis (repliés « Autres profils ») tous les autres ; alphabétique à l'intérieur.
     Une fonction unique `profilsPourSalaire(fonction, comptes, fonctions)` (pure) rend cet ordre.

## 4. Structure et sélecteur « Voir »

- Vente : chaque coût porte sa structure (vente porteuse, partie du côté, `societe` des rétrocessions et de l'inter-cabinet).
- Location et gestion : **aucune structure en base**, CRITERIMMO implicite partout (`celluleGlobal`, `modele.ts:818-819,849` : CRITERIMMO =
  ventes CRITERIMMO + location + gestion ; MACJ = ventes MACJ seules).
- L'onglet suit « Voir » (décision C2) avec cette même règle :
  - **CRITERIMMO** : Vente CRITERIMMO (ses lignes de carte, `coutsVente(venteDansSociete(v, 'criterimmo'), …)`) + Location + Gestion ;
  - **MACJ** : Vente MACJ ; l'onglet « Location et gestion » affiche « MACJ : vente seulement » (C7) ;
  - **FUSION** : tout (`coutsGlobaux`, la page FUSION), l'inter-cabinet entre nos deux structures jamais compté comme un coût.
- Les nouveaux coûts VENTE saisis (salaires, autres) portent une colonne `societe` (choix obligatoire si le salarié est rattaché aux deux
  structures, imposé sinon — même règle que `structureImposee`, `creationRepo.ts:21`). Location et gestion : **pas de colonne de structure**,
  CRITERIMMO par construction (C7).

## 5. Modèle de données proposé (non écrit)

### 5.1 Salaires chargés par salarié — migration A
```
transaction_salaire_charge (
  id bigserial, fonction text CHECK IN ('vente','location','gestion'), societe text CHECK IN ('criterimmo','macj'),
  annee int, mois int CHECK 1..12, compte_id bigint REFERENCES admin_utilisateur, montant_ht numeric CHECK >= 0,
  note text, origine text CHECK IN ('saisie','reprise_total'), cree_le, cree_par_libelle, modifie_le, retire_le, retire_par_libelle
)  -- index unique partiel (fonction, societe, annee, mois, compte_id) WHERE retire_le IS NULL ; trigger anti-DELETE
```
- `societe` : vente seulement ; location et gestion = CRITERIMMO (C7, la colonne y est nulle par contrainte).
- **Décision C8 — les anciens totaux mensuels sont effacés** au même lot, par une migration dédiée : AVANT, sauvegarde complète des montants
  (`transaction_location_salaires_mois.salaires_ht`, `transaction_gestion_mois.salarie_ht` : id, année, mois, montant, note) dans
  `.captures/sauvegardes/salaires-mensuels-<date>.csv` + une ligne de journal par montant effacé (`transaction_journal`, action
  `effacement_c8`, `avant` = la valeur) ; réversible par le journal (`annulerGeste`) ou le fichier. Les lignes ne sont pas supprimées (triggers
  anti-DELETE) : la colonne passe à NULL. Après : **une seule source**, le détail par salarié.
- Fonction unique `salairesDuMois(fonction, annee, mois)` = la somme des lignes détaillées du mois (rien d'autre : plus de total hérité).
  `lireLocationCa` et `lireGestion` passent par elle : `coutsLocationMois`, `moisGestion`, `coutsGlobaux`, le module Location reçoivent le
  même chiffre sans être touchés.
- ⚠️ Conséquence affichée à Arno : avant 2026, plus aucun salaire dans « Coûts globaux » ni dans le résultat net.

### 5.2 Autres coûts (« ce que j'aurais oublié ») — migration B
```
transaction_cout_divers (id, famille CHECK IN ('vente','location','gestion'), societe, annee, mois, poste text (libellé libre normalisé),
  montant_ht numeric, tva boolean, note, origine, cree_le, cree_par_libelle, modifie_le, retire_le, retire_par_libelle)
```
Une colonne par `poste` distinct de l'année (proposés depuis les postes déjà saisis, pour éviter « Loyer » / « loyer bureaux »).

### 5.3 Corriger un coût automatique sans écraser la source
- **Règle (décision C4 + règle absolue) : on corrige À LA SOURCE, jamais une copie.** Un clic sur une cellule ③ ouvre la liste des affaires du mois qui la
  composent (mêmes cartes que la liste sous le graphique de « Mois ») ; la correction se fait sur la ligne de commission, la rétrocession, le
  bail (prime, commission apporteur saisie) avec les gestes et le journal existants. Ainsi la carte, le CA net, l'Espace par négociateur, le
  variable et le module Location changent ensemble, par construction.
- La valeur d'origine est conservée par le journal (`transaction_journal.avant` / `apres`, annulable par `annulerGeste`, `repo.ts:637`) et,
  pour la location, par le couple « calculé / saisi » déjà en place (`prime_gestion_saisie`, `apporteur_commission_saisie` à côté du barème).
- **Aucun montant mensuel forcé, aucune ligne « Ajustement », aucune table de corrections** (règle absolue).
- Journal : étendre la liste fermée `transaction_journal.entite` (447:31) avec `salaire_charge`, `cout_divers`, et `COLONNES` / `AVEC_MODIFIE`
  (`repo.ts:320-381`) pour l'annulation.


## 6. Maquette textuelle (celle du lot C1, livré)

```
[ Voir : Mon espace | Agence : CRITERIMMO | MACJ | FUSION ]                        (administrateurs)
Compromis | Mois | Année(s) | Apporteurs | Les coûts                    Montants en [ HT | TTC ]
─────────────────────────────────────────────────────────────────────────────────────────────
  2019  2020  2021  2022  2023  2024  2025 [2026]        ← LigneDesAnnees (format restauré), UNE seule année
─────────────────────────────────────────────────────────────────────────────────────────────
 ┌ Coûts 2026 ┐ ┌ Vente ┐ ┌ Location ┐ ┌ Gestion ┐       ← tuiles de la page, chacune avec N−1 et l'écart
─────────────────────────────────────────────────────────────────────────────────────────────
  Mois par mois — 2026 (Coûts)                [Filtres]   ← GrapheGlobal du Suivi CA › CA global, mesure « Coûts »
  par défaut : Vente / Location / Gestion côte à côte ;    Comparer : « Année précédente » (N−1 hachuré),
  Affichage : Mensuel | Cumul ; Structure imposée par « Voir »
─────────────────────────────────────────────────────────────────────────────────────────────
  [ Vente ] [ Location et gestion ]
  Mois        | Commissions | Apporteurs | Ext. | Salaires (lot suivant) | Autres (lot suivant) | Total vente
  Janvier     |   …         |            |      |                        |                      |
  …
  Mois à confirmer (seulement s'il y en a)
  ─── 2026 (total, = « Coûts globaux ») ─────────────────────────────────────────────
```
Réutilisation, sans recopie :
- `OngletsVues` (`apres` = les boutons « Apporteurs » et « Les coûts ») ;
- `LigneDesAnnees` avec une option nouvelle `uneSeule` (le choix « Année | Période | Tout » masqué ; le Suivi CA n'est pas touché) ;
- **le graphique : `GrapheGlobal`** (le graphique du CA global) plutôt que `GrapheMois` / `GrapheAnnees`. Raison : ces deux-là ne savent montrer
  que du CA de ventes (vendu + compromis, nombre d'affaires) ; `GrapheGlobal` montre DÉJÀ les coûts par famille (`atomesDuPoint`, mesure
  « Coûts »), avec N−1, Mensuel / Cumul, et il est bâti sur les mêmes `Histogramme` / `CourbeCumul` que les autres pages. Deux props facultatives
  lui sont ajoutées (`initiaux` : les filtres d'arrivée sans lire ni écrire l'adresse ; `verrous` : mesure et structures imposées) — le Suivi CA
  ne les passe pas et rend à l'identique ;
- les valeurs : `coutsGlobaux` (FUSION, la fonction de « Coûts globaux ») et `coutsVenteDeLaSociete` (CRITERIMMO / MACJ, la fonction du graphique
  du CA global, extraite telle quelle de `atomesDuPoint`) — `app/lib/mon-espace/couts.ts` ne fait que les ranger par poste et par mois ;
- les données : `lireDonneesGlobal` (la lecture de `?vue=global` du Suivi CA, déplacée telle quelle dans `app/lib/transaction/donneesGlobal.ts`)
  servie par `GET /api/admin/mon-espace/couts` (droit « Mon espace » + associé + administrateur, 403 sinon).

## 7. Carte de propagation

Règle absolue : une source par coût, une fonction par calcul ; aucun chiffre recopié, aucune valeur parallèle.

| Poste | Source unique | Fonction | Doit apparaître dans |
|---|---|---|---|
| Commissions vente (③) | `transaction_vente_ligne` | `lignesCarteAffaire` → `caNetVente`, `resultatDesCartes`, `espaceNegociateurs`, `coutsVente` | cartes d'affaire, CA net / CA net consolidé (Suivi CA), Espace par négociateur, graphiques Mois / Année, « Commissions versées » (`detailCommissions.ts`), Mon espace perso (`monCa` / `monCaNet`) et agence (`accueil.ts`, `agence.ts`), Coûts globaux, Résultat net, graphique du CA global, **Les coûts** |
| Rétrocessions vente (③) | `transaction_vente.retro_*`, `transaction_retrocession` | `apporteurVerseHt`, `retroTtcDe` → idem | idem + « Par apporteur » (`parApporteur`) |
| Agences extérieures (③) | `transaction_partie` | `bilanVente`, `LigneCarte.exterieures` | cartes, CA net, Coûts globaux, Les coûts |
| Inter-cabinet (jamais un coût) | `transaction_inter_cabinet`, `transaction_partie` | `ligneMiroir`, `venteDansSociete` | cartes (miroir), CA net par structure ; neutralisé en FUSION |
| Primes de gestion (③) | `gestion_location_activite` + règle | `primeDe` → `montantsLigne` → `coutsLocationMois` | Suivi CA › Location (`EcranLocationCA`), Location & Gestion (`totauxFusion`), Coûts globaux, Résultat net, Outils de suivi Location, variable négociateur, Les coûts |
| Variable négociateur location (③) | idem + `gestion_location_retrocession` | `variableC`, `coutsLocationMois`, `variableNegociateur` | idem ; dans Les coûts : la colonne comptée ET la colonne d'information C3 (même fonction) |
| Part de gestion des apporteurs, collègues (③, C5) | `gestion_location_apporteur*` | `partGestionMensuelleDe`, `duCollegueRecurrent` → `coutsLocation` (lot C7) | Suivi CA › Location, Location & Gestion, Coûts globaux, Résultat net, Les coûts |
| Salaires location / gestion (②) | `transaction_salaire_charge` (seule source après C8) | **`salairesDuMois`** → `lireLocationCa` / `lireGestion` | Suivi CA › Location, › Gestion (tuiles, tableaux, net), Location & Gestion, Coûts globaux, Résultat net, graphique global, Outils de suivi Location (`resultatNetAgence`), Les coûts |
| Salaires vente (②, nouveau) | `transaction_salaire_charge` fonction vente | `salairesDuMois` → `coutsDe` | Coûts globaux, Résultat net, graphique global, Les coûts ; pas le CA net d'une vente (le salaire n'est pas une ligne de vente) |
| ADHOC / MONGA (②) | `transaction_gestion_mois` | `moisGestion` / `totauxGestion` | Suivi CA › Gestion, Location & Gestion, Coûts globaux, Résultat net, Les coûts |
| Autres coûts (②, nouveau) | `transaction_cout_divers` | `coutsDe` (nouvelle rubrique) | Coûts globaux, Résultat net, graphique global, Les coûts |

À faire une fois par rubrique : `coutsDe` la reçoit ; `CoutsGlobaux.tsx`, `ResultatNetGlobal.tsx`, `grapheGlobal.ts` et « Les coûts » l'affichent
puisqu'ils lisent `coutsDe`.

## 8. Risques de double compte

1. **Commissions déjà dans le CA net** : « Les coûts » ne STOCKE aucune commission ; il lit `coutsVente`, qui part des mêmes lignes que
   `caNetVente`. Le CA net d'une vente ne bouge que si la ligne bouge.
2. **Salaires location vs primes + variable** : règle actuelle conservée (`locationCa.ts:115-150`) : un mois avec salaires location, primes et
   variable sont « inclus ». La colonne C3 « Variable négo (calculé) » le montre pour information, hors totaux.
3. **Salaires de négociateurs vente salariés/associés vs leurs commissions** : le salaire chargé saisi est le montant chargé tel quel (C3) ; les
   commissions restent celles des cartes. Point de vigilance pour Arno à la saisie : ne pas y inclure un variable déjà payé par les cartes.
4. **Ancien total mensuel vs détail** : supprimé par C8 (les totaux sont effacés, sauvegardés, journalisés) — une seule source ensuite.
5. **Deux définitions du « net »** : `espaceNegociateurs.net` (et donc `monCaNet`) ne déduit, sur les ventes historiques sans répartition,
   que les commissions des indépendants (`carteAffaireLignes.ts:225,233`) ; `caNetVente` et `coutsVente` déduisent toutes les commissions.
   « Les coûts » suit `coutsVente` (comme « Coûts globaux »).
6. **Net location du module Location ≠ net du Suivi CA** (collègues et part récurrente) : réglé par C5 au lot C7 (les deux postes entrent dans
   `coutsLocation`, donc partout).
7. **Inter-cabinet** : jamais un coût, jamais saisi dans « Les coûts ».
8. **Correction manuelle** : à la source (C4) → une seule valeur partout ; l'ancienne reste dans le journal, annulable. Aucune ligne « Ajustement ».

## 9. Rafraîchissement

- Mon espace bat toutes les 15 s (`PERIODE_MON_ESPACE_MS`, `rafraichir.ts:11`) sur `GET /api/admin/mon-espace/empreinte` ; l'empreinte
  = ids des ventes + max(version) (`empreinteDe`, `mesAffaires.ts:127` ; `sqlVersionVente`, `transaction/repo.ts:45`). **Elle ignore**
  rétrocessions, `gestion_mois`, salaires, inter-cabinet et module Location.
- Lot C1 (lecture) : « Les coûts » se relit à chaque relecture de Mon espace (même compteur) ; une saisie de vente y apparaît donc en ≤ 15 s.
- Lot C3 : une empreinte « coûts » = max(`transaction_journal.id`) toutes entités + max(`modifie_le`, `annule_le`, `cree_le`) de
  `gestion_location_activite` / `gestion_location_retrocession` / `gestion_location_commission_regle`, ajoutée à l'empreinte agence.
- Le Suivi CA n'a AUCUN battement aujourd'hui (rechargement par `relire`). L'y brancher (même hook, même empreinte) : lot C8.

## 10. Tests de cohérence

Lot C1 (livrés) : chaque poste, chaque famille, chaque mois et l'année = « Coûts globaux » (FUSION) ou la fonction du graphique du CA global
(CRITERIMMO / MACJ), au centime, HT et TTC, sur 2025 et 2026 ; CRITERIMMO + MACJ = FUSION ; colonne C3 = `variableNegociateur(variable, primes)`
et absente des totaux ; une autre année ne change rien ; onglet absent en vue perso, pour un non-associé ; route 403.

Lots suivants :
1. **Saisie d'un salaire gestion de 1 234,57 € pour 03/2026** : `totauxGestion` net de mars baisse de 123 457 centimes ; Coûts globaux, Résultat net
   et Les coûts de mars 2026 aussi ; avril, 03/2025 et MACJ inchangés ; FUSION = CRITERIMMO + MACJ.
2. **Salaire location** : le mois passe en « inclus dans les salaires » (primes / variable non déduits), même chiffre dans `EcranLocationCA`,
   `totauxFusion`, `coutsGlobaux`, `resultatNetAgence`.
3. **C8** : après la migration, plus aucun salaire mensuel ; la sauvegarde contient chaque montant effacé ; l'annulation le rend.
4. **Correction d'une commission depuis « Les coûts »** : la cellule, la carte de la vente, `caNetVente`, l'Espace par négociateur, Mon espace
   agence et perso (part du titulaire) changent du même montant au centime, pour le bon mois et la bonne structure ; journal + annulation
   rendent la valeur d'avant partout.
5. **Sélecteur de profil** : ordre fonction en cours → autres location/gestion → autres ; observateurs exclus.
6. **Empreinte** : une saisie change l'empreinte « coûts » ; une saisie sans rapport (permis…) ne la change pas.
7. Garde : `clientBoundary.guard.test.ts` (aucun `pg` côté client), preuve curl.

## 11. Découpage en lots (réécrit après les décisions)

| Lot | Contenu | Migration | Tests |
|---|---|---|---|
| **C1** ✅ | Onglet « Les coûts » en LECTURE : statut « Associé » (C1), suit « Voir » (C2), rangée des années à une seule année, tuiles avec N−1, graphique du CA global en mesure « Coûts » (3 familles, N−1, Mensuel / Cumul), tableau « Vente » / « Location et gestion » × 12 mois + totaux, colonne C3, postes futurs présents et vides | aucune | ci-dessus |
| **C2** | Saisie en place des postes mensuels EXISTANTS (ADHOC, facture MONGA) via `enregistrerGestion` ; empreinte « coûts » | aucune | propagation, empreinte |
| **C3** | Fonctions des profils (page Comptes, une case par fonction, pré-cochées, C9) + `profilsPourSalaire` | `451_compte_fonction` | ordre du sélecteur |
| **C4** | Salaires chargés par salarié + `salairesDuMois` dans `lireLocationCa` / `lireGestion` / `coutsDe` ; journal étendu ; **C8 : effacement des totaux mensuels**, sauvegarde `.captures/sauvegardes/` + journal, réversible | `452_salaire_charge`, `453_effacement_salaires_mensuels` | tests 1-3 |
| **C5** | Colonnes « Autres » par famille (C5) ; rubrique dans `coutsDe` | `454_cout_divers` | totaux, Résultat net |
| **C6** | Cellules ③ : clic → détail du mois → affaires / baux → correction à la source (C4 : mêmes gestes, même journal) | aucune | test 4 |
| **C7** | Part de gestion versée aux apporteurs et rémunération des collègues apporteurs dans `coutsLocation` (C5) | aucune | égalité module Location / Suivi CA |
| **C8** | Battement 15 s dans le Suivi CA | aucune | empreinte |

Chaque migration : ajout seul (sauf l'effacement C8, décidé par Arno, sauvegardé et réversible), triggers anti-DELETE, livrée non appliquée ;
code compatible sans elle (`schemaDroits.ts` : `…Disponible()`).

## 12. Questions produit — tranchées par Arno le 03/11/2026

1. Profils associés → **C1** (statut « Associé », pas de nouveau droit).
2. « Voir » → **C2** (oui ; absent de la vue perso).
3. Salaires vente et variable → **C3** (montant chargé tel quel ; variable calculé affiché pour information, hors totaux).
4. Corriger un coût automatique → **C4** (à la source) + règle absolue (aucun « Ajustement »).
5. Postes oubliés → **C5**.
6. MONGA → **C6** (facture mensuelle seulement).
7. MACJ → **C7** (vente seulement).
8. Historique des salaires → **C8** (effacés au lot des salaires, sauvegardés, réversibles).
9. Fonction d'un profil → **C9**.

Reste ouvert (à poser plus tard, sans urgence) : un associé non administrateur aurait-il « Voir » pour cet onglet ? (aujourd'hui aucun cas.)

## ÉTAT AU 03/11/2026 08:50 — lot 1 interrompu, puis terminé à la reprise

Arrêt demandé par Arno (extinction de l'ordinateur). **Rien n'est committé** (ni le code, ni ce plan). Les fichiers restent tels quels sur le disque.
Aucune écriture en base, aucune migration. Le banc de captures est arrêté : plus de Chrome de banc, plus de serveur de banc, et les dossiers
temporaires du scratchpad sont effacés. Le serveur de recette d'Arno n'a pas été touché.

**Fichiers créés**
- `app/lib/mon-espace/couts.ts` : range par poste, par mois et par structure ; `coutsDuPoint`, `coutsDeLAnnee`, `ongletCoutsVisible`, `URL_COUTS`, `MOTIF_COUTS`.
- `app/lib/mon-espace/couts.test.ts` : 22 tests, verts.
- `app/lib/mon-espace/__fixtures__/couts.ts` : données fictives 2025-2026.
- `app/lib/transaction/donneesGlobal.ts` : `lireDonneesGlobal`, le corps de `?vue=global` déplacé tel quel ; option `compromis: false`.
- `app/(admin)/api/admin/mon-espace/couts/route.ts` et `route.test.ts` (3 tests, verts) : garde Mon espace, puis associé ET administrateur, sinon 403.
- `app/(admin)/admin/(protected)/mon-espace/CoutsMonEspace.tsx` : l'écran (rangée des années, une seule année ; 4 tuiles avec N−1 ;
  `GrapheGlobal` en mesure « Coûts » ; tableau « Vente » | « Location et gestion » ; colonne C3 ; postes futurs vides).
- `app/(admin)/admin/(protected)/mon-espace/CoutsMonEspace.test.tsx` : 13 tests, verts.

**Fichiers modifiés**
- `MesCompteurs.tsx` : onglet « couts » après « Apporteurs », seulement si `ongletCoutsVisible`. Retour à « Mon espace » depuis « Les coûts » : on revient sur « Mois ».
- `compteRepo.ts` : `titulaireDuCompte` (associé lu par `statutDuCompte`) et `peutVoirCouts`.
- `agenceRepo.ts`, `mesAffairesRepo.ts` : le titulaire passe par `titulaireDuCompte`.
- `mesAffaires.ts` : `titulaire.associe?`.
- `transaction/route.ts` : `?vue=global` appelle `lireDonneesGlobal` ; les imports devenus inutiles sont retirés.
- `grapheGlobal.ts` : `coutsVenteDeLaSociete` est extraite de `atomesDuPoint` ; `nbFiltresActifs(f, d?)`.
- `GrapheGlobal.tsx` : props facultatives `initiaux` et `verrous`. Absentes, le Suivi CA est inchangé.
- `EcransTransaction.tsx` : `LigneDesAnnees` reçoit l'option `uneSeule` ; `anneesDuGlobal`, `anneeAvecDonnees` et `DonneesGlobal` sont exportés.
- `CoutsMonEspace.tsx` : correctif CSS fait après la 1re série de captures. À 390 px, les tuiles restaient sur 4 colonnes (spécificité de la règle `@container`) ;
  les sous-titres des en-têtes du tableau sont allégés.

**Décisions prises en route**
- **Graphique.** On réutilise `GrapheGlobal` (le graphique du CA global), pas `GrapheMois` / `GrapheAnnees` : ces deux-là ne montrent que du CA de
  ventes. Par défaut : « Activités entre elles », côte à côte. N−1 : Comparer › « Année précédente ». Mensuel / Cumul : dans le panneau.
- **Correctif dans une fonction partagée** (`coutsVenteDeLaSociete`). En CRITERIMMO ou MACJ, seules les rétrocessions de LA société sont lues, comme
  sur sa page. Avant, une rétrocession CRITERIMMO rattachée à une vente partagée était aussi comptée sur la ligne miroir de MACJ, et le total
  CRITERIMMO + MACJ du graphique du CA global dépassait la FUSION. Aucun cas en base ce jour (requête en lecture seule).
- **Une seule colonne « Commissions des négociateurs »** (celle de « Coûts globaux ») : les séparer indépendants / salariés serait un calcul nouveau.
- **Colonne C3** (« Variable négo (calculé) ») : seulement en Location ; pas de variable en Gestion.
- **Totaux.** La ligne « Mois à confirmer » n'apparaît que s'il y a des ventes signées sans mois. La ligne de l'année = « Coûts globaux ».
- **La phrase existante du mode agence** (« Le montant est le CA de … ») s'affiche aussi sur « Les coûts ». Laissée telle quelle (pas de masquage sans accord).

**Vérifié**
- `tsc` sans erreur.
- eslint propre sur les fichiers du lot (seul reste un avertissement `enPeriode` déjà présent avant le lot).
- Suites ciblées vertes : `app/lib/transaction`, `app/lib/mon-espace`, écrans Mon espace et Transaction, routes Mon espace (67 fichiers, 1281 tests),
  puis les 3 nouveaux fichiers de test (38 tests).
- 1re série de captures, dans `.captures/mon-espace-les-couts/` (encore valable pour 1440 px) :
  - à 1440 et 390 px, aucun débordement horizontal ;
  - montants des tuiles conformes aux tests ;
  - défaut constaté à 390 px : tuiles sur 4 colonnes, corrigé depuis mais pas encore recapturé.

**Reprise du 03/11/2026 (lot 1 terminé)**
- Captures refaites (HT), Clair et Sombre, à 1440×900 et 390 px, dans `.captures/mon-espace-les-couts/` :
  - aucun débordement horizontal ;
  - tuiles sur 2 colonnes à 390 px (4 colonnes à 1440 px).
- `tsc` sans erreur ; `npm test` complet vert : 1587 fichiers, 24 904 tests (21 ignorés).

## LOT 2 — SAISIE DANS LES TABLEAUX + SALAIRES PAR SALARIÉ (03/11/2026)

**Migration `451_couts_saisis.sql`** (ajout seul, rejouable, enveloppée ; le code marche sans elle — « disponible après la mise à jour (migration 451) ») :
- `transaction_cout_ligne` : un salarié d'un mois (poste « salaires », profil) ou un frais « Autres » (libellé), structure × famille × mois × montant HT ;
  location et gestion = CRITERIMMO (contrainte) ; un salarié une fois par (structure, famille, mois) ; anti-DELETE / TRUNCATE ;
- `admin_compte_fonction` (C9) : plusieurs fonctions par profil, pré-cochées par déduction (service gestion → gestion ; négociateur Location →
  location ; structure de vente / négociateur d'une vente → vente), seulement pour un profil sans fonction ;
- journaux : `transaction_journal` accepte `cout_ligne` ; `admin_utilisateur_log` accepte `changement_fonctions`.

**Une seule comptabilité, branchée partout** :
- salaires de la Location et de la Gestion : `lireSalairesLocation` / `lireGestion` additionnent les salariés du mois (un mois qui en a prend leur
  somme, jamais en plus du montant mensuel d'avant) → page Location, page Gestion, Location & Gestion, Coûts globaux, résultat net, Les coûts ;
- salaires de la vente et « Autres » des trois familles : `coutsGlobaux` (`saisis`) → Coûts globaux (nouvelles colonnes), résultat net, graphique du
  CA global (nouvelles familles), Location & Gestion (« Autres »), Les coûts ;
- C19 option A : `dusLocationParMois` (les fonctions du Résumé de la période du module Location) → `coutsLocation` (`partGestion`, `collegues`) →
  page Suivi CA › Location (CA net, lignes du résultat), Location & Gestion, Coûts globaux, résultat net, graphique, Les coûts ;
- ADHOC et facture MONGA : la ligne du mois de `transaction_gestion_mois` (la Gestion du Suivi CA), colonne seule, journalisée ; ADHOC repris d'un
  import : non modifiable depuis « Les coûts » (il se corrige dans Suivi CA › Gestion).

**Écritures** (`POST /api/admin/mon-espace/couts`, associés seulement — 403 sinon) : `ligne-ajouter`, `ligne-modifier`, `ligne-retirer`,
`gestion-poste` ; garde de version (dernier n° du journal de la ligne) → 409 si périmée ; FUSION en lecture (422 : « saisissez sur CRITERIMMO ou
MACJ ») ; location / gestion sur MACJ : 422 (C7). Annulation : `annulerGeste` connaît `cout_ligne`.

**Écran** : clic sur une case saisie (✎) → panneau sur place (salariés : profils de la fonction de la famille d'abord, puis location / gestion,
puis les autres ; « Autres » : libellé + montant) ; clic sur une case calculée → « corriger à la source » (les affaires du mois et le lien vers le
Suivi CA ; pour la Location : la feuille du mois, les règles des apporteurs) ; « Variable négo (calculé) » jamais cliquable. Après une saisie : tout
est relu (tableaux, synthèse, graphique) ; les autres écrans ouverts suivent par l'empreinte des coûts (15 s). Page Comptes : bloc « Fonctions ».

**C8** : script `app/scripts/couts-c8-salaires-mensuels.ts` (lecture par défaut ; `--sauvegarder` → `.captures/sauvegardes/salaires-mensuels-<base>-<date>.json` ;
`--effacer=<sauvegarde>` : exactement ces montants, refus si l'un a changé ; `--restaurer=<sauvegarde>` : là où c'est vide ; chaque geste journalisé ;
garde `--base=<nom>` obligatoire). Testé (sauvegarde, effacement, refus, restauration, base étrangère refusée).

**Base de recette du lot** : `svav_recette` n'a pas la Transaction (migrations 383 → 450 non posées) ; la 451 et C8 ont donc été appliquées sur une base
d'essai `svav_test_couts` (schéma de la base de dev, données d'essai), effacée en fin de lot. **La base de dev (`sansvisavis`) n'a pas été touchée** :
la 451 et C8 y attendent la décision d'Arno (lecture C8 : 8 montants mensuels de gestion et de location y seraient effacés).

**Questions pour Arno** :
1. « Autres » : saisis en HT et comptés SANS TVA ajoutée (TTC = HT), faute de convention dans « Coûts globaux ». Faut-il ajouter 20 % en TTC
   (comme ADHOC et MONGA) ?
2. La saisie mensuelle des salaires dans Suivi CA › Gestion / › Location reste en place (aucun retrait) ; après C8, un mois qui a des salariés
   saisis dans « Les coûts » ignore ce montant mensuel. Faut-il, à terme, la remplacer par un lien vers « Les coûts » ?

## LOT 3 — PAGE « SAISIR LES COÛTS DU MOIS » (03/11/2026)

**Migration `452_couts_validation.sql`** (ajout seul, rejouable ; code compatible sans elle) : `transaction_cout_validation` — un poste d'un mois validé
(structure, famille, poste, mois, qui, quand ; retrait par `retire_le`, anti-DELETE) ; le journal accepte `cout_validation`.

**La page** (dans l'onglet « Les coûts », associés seulement) : ouverte par le bouton « Saisir les coûts du mois » en tête de l'onglet, ou par le rappel
« Coûts d'octobre à saisir » posé à côté de l'onglet (C17, tant que le mois précédent a un poste à compléter dans les structures vues).
- En tête : le mois (C16 : le mois précédent par défaut, les 6 derniers mois révolus) et la structure (CRITERIMMO / MACJ ; FUSION ouvre CRITERIMMO,
  FUSION ne se saisit pas).
- Trois blocs Vente / Location / Gestion (MACJ : Vente seul, C7) : les postes saisis (salariés et leurs profils — fonction de la famille d'abord —,
  lignes « Autres », ADHOC sauf s'il vient d'un import, MONGA) avec la case « complet pour ce mois (0 compris) » ; les postes calculés en lecture,
  avec « Corriger à la source ».
- Indicateur « complet / à compléter » par bloc et en tout : un poste est complet quand il est validé.
- « Enregistrer » : vérifie tout, puis écrit LES MÊMES gestes que la saisie dans les tableaux (`ligne-ajouter` / `-modifier` / `-retirer`,
  `gestion-poste` — journal, garde de version), puis les validations (`valider`) ; le premier refus (409 compris) arrête et le dit ; sinon retour à
  l'onglet, sur l'année du mois saisi. Mobile d'abord (390 px).
- Rappel : `GET /api/admin/mon-espace/couts?rappel=1&agence=…` (la même règle, `rappelMois`) ; relu après chaque saisie.

**Base de recette du lot** : la 452 a été appliquée sur la même base d'essai que la 451 (`svav_test_couts`), effacée en fin de lot. La base de dev
n'a pas été touchée.


## 🔴 Réponses et décisions d'Arno du 03/11/2026 (après les lots 2 et 3 de « Les coûts »)

- **R1.** Appliquer 451, 452 puis l'effacement C8 sur SA base locale (le site de recette du Mac, `sansvisavis`, celle de 448-450), jamais en production,
  dans cet ordre : sauvegarde complète (pg_dump daté), 451, 452, C8 (sa sauvegarde JSON + journal), contrôle. **Fait le 03/11/2026** (voir ci-dessous).
- **R2.** TVA des coûts saisis : choix PAR LIGNE « TVA 20 % » / « sans TVA » ; salaires chargés : toujours sans TVA ; MONGA, ADHOC : 20 % ; « Autres » :
  20 % par défaut, modifiable par ligne ; TTC = HT × 1,20 ou HT selon la ligne, partout (tableaux, cartes, Coûts globaux). Colonne `tva` de
  `transaction_cout_ligne` (ajoutée à la 451 avant son application), `ttcDeLigne` / `montantSaisi`.
- **R3.** L'ancienne saisie mensuelle des salaires (Suivi CA › Gestion et › Location) est REMPLACÉE (accord d'Arno) par le total venant de « Les coûts »
  (même enregistrement) et le lien « Saisir dans Les coûts » (`/admin/mon-espace?espace=criterimmo&onglet=couts&couts-tableau=…`). Plus aucune
  deuxième case : la fenêtre de la Location est retirée, la case de la Gestion devient un affichage, le serveur n'écrit plus la colonne mensuelle
  (Gestion) et refuse l'ancien geste (Location, 409).
- **D20.** Mon espace › « Année(s) » : la liste sous le graphique ne montre plus le groupe « Compromis » (comme « Mois », décision 15) ; les compromis
  restent dans le graphique et dans l'onglet « Compromis ».
- **D21.** Mon espace › « Année(s) » et « Mois » : « Apporteurs d'affaires » est GARDÉ et suit exactement la période choisie (vérifié et prouvé : il
  la suivait déjà — `apporteursPeriode`, rétrocessions saisies dans les mois choisis + celles rattachées aux ventes listées).
- **D22.** Onglet « Les coûts » : cartes Vente | Location | Gestion | Coûts totaux (le total à droite).

**R1, exécution du 03/11/2026 (base `sansvisavis`)** :
- sauvegarde complète : `.captures/sauvegardes/sansvisavis-avant-451-452-c8-2026-11-03-111406.dump` (5,28 Go, `pg_restore --list` lisible, 296 tables) ;
- 451 puis 452 : appliquées chacune en une transaction, sans erreur (hors registre `svav_migration`, comme 448-450) ; fonctions pré-cochées :
  comptes 2, 8, 9 → vente ; 5 → location + vente ;
- C8 : sauvegarde `.captures/sauvegardes/salaires-mensuels-sansvisavis-2026-11-03-111857.json`, 8 montants effacés (journalisés) — gestion 2025-05
  2 444,00 € ; 2025-06, 07, 08, 09, 10, 11 et 2026-01 : 2 688,91 € chacun ; la ligne de salaires location 09/2026 était un essai « _TEST » déjà
  retiré (non comptée, non concernée) ;
- contrôle (lecture seule, 96 mois 2019 → 2026) : les seuls écarts de « Coûts globaux » sont ces 8 montants, au centime, sur les salaires de la
  gestion et le total ; vente, location, ADHOC, MONGA inchangés.

## 🔴 Décisions d'Arno du 03/11/2026 (suite) — D23, D24

- **D23.** Un seul cartouche « Coûts d'<mois> à saisir » à l'écran : celui de la ligne des onglets est GARDÉ ; celui à droite du bouton « Saisir les
  coûts du mois » est RETIRÉ (accord d'Arno). Le bouton reste (en couleur tant que le mois précédent est à compléter).
- **D24.** Le formulaire « Saisir les coûts du mois » refait, compact, activités séparées (même logique, mêmes gestes, même journal, même garde de
  version, aucune route ni donnée touchée) :
  - en-tête collant sur une ligne : mois · structure · état global · « Retour aux coûts » (au téléphone : sur deux lignes, sans le libellé en double) ;
  - trois blocs (MACJ : Vente seul, puis « vente seulement ») avec une bande à la couleur de la famille dans le graphique (`trx-serie--1/3/5` : Vente
    bleu, Location vert, Gestion rose), l'état « complet / à compléter » et le TOTAL du mois de l'activité (HT, TTC en petit) — celui des tableaux ;
  - une grille par bloc : Poste | Montant HT | TVA | ✓ (picto « i » pour « complet », 0 compris) ; Salaires et « Autres » : un sous-tableau
    (Salarié / Libellé | Montant | TVA | ×), « + ajouter », le sous-total du poste ; ADHOC, MONGA : un champ ;
  - les postes calculés : une ligne repliée « Calculés automatiquement : X € » par bloc, le détail (dont le variable calculé, hors totaux) et
    « Corriger à la source » ;
  - pied collant : total du mois (HT / TTC) et « Enregistrer ».
  - Hauteur de la page (CRITERIMMO, septembre 2026, données d'essai) : 1 832 → 1 179 px à 1 440 px de large ; 2 431 → 1 498 px à 390 px.
