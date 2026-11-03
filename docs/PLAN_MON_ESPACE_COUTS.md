# PLAN — Onglet « Les coûts » dans « Mon espace » (chantier en lots)

> Reconnaissance en lecture seule du 03/11/2026 : aucun code modifié, aucune écriture en base, aucune migration. Un lot = un prompt = un commit.
> Migrations livrées NON APPLIQUÉES, code compatible sans elles (colonne/table absente → comportement d'avant, message « disponible après
> la mise à jour »), comme dans `docs/PLAN_MON_ESPACE.md`. Les références `fichier:ligne` sont celles du commit `6f40f774`.

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
  (`FriseAvancement.tsx:772,872`), sommé « devis en attente / acceptés » (`tableauBordRepo.ts:64-75`). Très probablement à la charge des
  propriétaires (lecture, pas certitude) → question 12.6.
- `gestion_partenaire_interne` (ADHOC) : des adresses, aucun montant.
- `gestion_location_gestion_perdue` (manque à gagner), `gestion_location_marge_gli` (recette), honoraires théoriques de gestion (recette) : pas des coûts.
- Introuvables : abonnements, factures fournisseurs, loyers, logiciels, publicité, assurances, frais bancaires.

---

## 2. Postes proposés (colonnes) par famille

Légende : ① **automatique** (source) ; ② **saisi à la main** ; ③ **automatique mais corrigeable** — la correction se fait À LA SOURCE (voir § 5.3).

### Onglet « Vente » (par structure)

| Colonne | Nature | Source / remarque |
|---|---|---|
| Commissions négociateurs indépendants | ③ | lignes de commission des ventes du mois (`coutsVente`) ; corrigées sur la carte de la vente |
| Commissions négociateurs salariés / associés (variable) | ③ | idem ; séparées des indépendants (`payeParClasseTtc`) pour ne pas les confondre avec les salaires |
| Rétrocessions apporteurs | ③ | vente + `transaction_retrocession` |
| Reversé agences extérieures | ③ | `transaction_partie` extérieures |
| Reversé inter-cabinet | ③ | **montré en structure seule** (CRITERIMMO ou MACJ), neutralisé en FUSION (comme `coutsVente` vue nulle) |
| Salaires chargés vente | ② | NOUVEAU (par salarié, § 5.1) — n'existe pas aujourd'hui |
| Autres coûts vente (« ce que j'aurais oublié ») | ② | NOUVEAU (§ 5.2), lignes libres nommées |

### Onglet « Location et gestion » (CRITERIMMO)

| Colonne | Famille | Nature | Source |
|---|---|---|---|
| Salaires chargés location | Location | ② | AUJOURD'HUI un total mensuel (447) → par salarié (§ 5.1) ; l'ancien total reste lu tant qu'aucun détail n'existe pour le mois |
| Primes de gestion | Location | ③ | `primeDe` ; corrigées sur le bail (`prime_gestion_saisie`, existe déjà) |
| Variable négociateur (net des rétrocessions) | Location | ③ | `coutsLocationMois` ; « inclus dans les salaires » les mois où des salaires location existent (règle actuelle conservée) |
| Commissions apporteurs location | Location | ③ | `partLocationDe` + `partGestionSignatureDe` ; corrigées sur le bail (`apporteur_commission_saisie`) |
| Autres coûts location | Location | ② | NOUVEAU |
| Salaires chargés gestion | Gestion | ② | AUJOURD'HUI `salarie_ht` mensuel → par salarié |
| ADHOC | Gestion | ② (③ si import) | `adhoc_ht`, déjà saisissable |
| MONGA | Gestion | ② | `monga_ht`, déjà saisissable |
| Autres coûts gestion | Gestion | ② | NOUVEAU |

Chaque colonne a son total en pied ; une colonne « Total » par famille ; une dernière ligne « Total de l'année ».

### Postes qu'Arno a peut-être oubliés (à confirmer, question 12.5)
1. **Part gestion récurrente due aux apporteurs** et **rémunération des collègues apporteurs** : calculées par le module Location mais
   ABSENTES des coûts du Suivi CA (`locationCa.ts:8-9,74`). Proposition : les ajouter en ③ colonnes Location / Gestion.
2. **Charges de structure** non rattachées à une activité : loyer des bureaux, logiciels (dont WIPPIMMO), portails d'annonces, téléphonie,
   véhicules, assurance RCP / garantie financière (carte T), expert-comptable côté transaction, frais bancaires. La spec ne garde que les
   coûts « rattachés directement à l'activité » → proposition : une famille « Frais communs » à part, hors des trois familles, ou une
   ligne « Autres » par famille.
3. **Publicité et diffusion des annonces** (vente et location) : coût direct de chaque activité → colonne « Autres » de la famille.
4. **Assurance GLI** : seule la marge (recette) existe ; s'il y a une prime payée par l'agence, c'est un coût gestion.
5. **Interventions MONGA par devis** (`gestion_monga_etape.montant_cents`) : à ne PAS compter si elles sont refacturées au propriétaire.

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
- **Ordre « fonction en cours d'abord »** — proposition :
  1. nouvelle table `admin_compte_fonction (compte_id, fonction ∈ {vente, location, gestion}, depuis, retire_le, pose_par_libelle)` (plusieurs
     fonctions possibles, datées, journalisées dans `admin_utilisateur_log`), cochée dans la page Comptes ;
  2. pré-remplie à la migration par déduction (affichée « déduite », corrigeable) : `service_gestion` → gestion ; négociateur location connu →
     location ; négociateur vente / `transaction_societe_compte` → vente ;
  3. liste du sélecteur = profils actifs non observateurs ayant la fonction location OU gestion ; tri : d'abord ceux qui ont la fonction en
     cours de saisie, puis les autres de location/gestion, puis (repliés « Autres profils ») tous les autres ; alphabétique à l'intérieur.
     Une fonction unique `profilsPourSalaire(fonction, comptes, fonctions)` (pure) rend cet ordre.

## 4. Structure et sélecteur « Voir »

- Vente : chaque coût porte sa structure (vente porteuse, partie du côté, `societe` des rétrocessions et de l'inter-cabinet).
- Location et gestion : **aucune structure en base**, CRITERIMMO implicite partout (`celluleGlobal`, `modele.ts:818-819,849` : CRITERIMMO =
  ventes CRITERIMMO + location + gestion ; MACJ = ventes MACJ seules).
- L'onglet suit « Voir » avec cette même règle (une seule fonction : `celluleGlobal` / `coutsGlobaux({ vue })`) :
  - **CRITERIMMO** : Vente CRITERIMMO (inter-cabinet reversé à MACJ compté) + Location + Gestion ;
  - **MACJ** : Vente MACJ ; l'onglet « Location et gestion » affiche « Aucune activité location / gestion pour MACJ » ;
  - **FUSION** : tout, l'inter-cabinet entre nos deux structures neutralisé.
- Les nouveaux coûts saisis (salaires, autres) portent une colonne `societe` (défaut : criterimmo pour location/gestion ; choix obligatoire
  pour la vente si le salarié est rattaché aux deux structures, imposé sinon — même règle que `structureImposee`, `creationRepo.ts:21`).

## 5. Modèle de données proposé (non écrit)

### 5.1 Salaires chargés par salarié — migration A
```
transaction_salaire_charge (
  id bigserial, fonction text CHECK IN ('vente','location','gestion'), societe text CHECK IN ('criterimmo','macj'),
  annee int, mois int CHECK 1..12, compte_id bigint REFERENCES admin_utilisateur, montant_ht numeric CHECK >= 0,
  note text, origine text CHECK IN ('saisie','reprise_total'), cree_le, cree_par_libelle, modifie_le, retire_le, retire_par_libelle
)  -- index unique partiel (fonction, societe, annee, mois, compte_id) WHERE retire_le IS NULL ; trigger anti-DELETE
```
- Fonction unique `salairesDuMois(fonction, annee, mois, { detail, totalHerite })` : **si au moins une ligne détaillée existe pour ce
  (fonction, mois), le total = leur somme ; sinon, l'ancien total** (`transaction_location_salaires_mois.salaires_ht` ou
  `transaction_gestion_mois.salarie_ht`). Jamais les deux → pas de double compte, et l'historique 2025 reste juste sans reprise.
- `lireLocationCa` et `lireGestion` passent par elle : `coutsLocationMois`, `moisGestion`, `coutsGlobaux`, le module Location reçoivent le
  même chiffre sans être touchés.

### 5.2 Autres coûts (« ce que j'aurais oublié ») — migration B
```
transaction_cout_divers (id, famille CHECK IN ('vente','location','gestion'), societe, annee, mois, poste text (libellé libre normalisé),
  montant_ht numeric, tva boolean, note, origine, cree_le, cree_par_libelle, modifie_le, retire_le, retire_par_libelle)
```
Une colonne par `poste` distinct de l'année (proposés depuis les postes déjà saisis, pour éviter « Loyer » / « loyer bureaux »).

### 5.3 Corriger un coût automatique sans écraser la source
- **Règle proposée : on corrige À LA SOURCE, jamais une copie.** Un clic sur une cellule ③ ouvre la liste des affaires du mois qui la
  composent (mêmes cartes que la liste sous le graphique de « Mois ») ; la correction se fait sur la ligne de commission, la rétrocession, le
  bail (prime, commission apporteur saisie) avec les gestes et le journal existants. Ainsi la carte, le CA net, l'Espace par négociateur, le
  variable et le module Location changent ensemble, par construction.
- La valeur d'origine est conservée par le journal (`transaction_journal.avant` / `apres`, annulable par `annulerGeste`, `repo.ts:637`) et,
  pour la location, par le couple « calculé / saisi » déjà en place (`prime_gestion_saisie`, `apporteur_commission_saisie` à côté du barème).
- Si Arno veut malgré tout un montant mensuel forcé (question 12.4) : table `transaction_cout_correction (poste, famille, societe, annee, mois,
  valeur_ht, source_ht_au_moment, motif, …)` appliquée DANS `coutsDe` comme une ligne « Ajustement » visible et séparée — jamais en remplaçant
  les chiffres des cartes (sinon le total des coûts ne serait plus la somme des cartes).
- Journal : étendre la liste fermée `transaction_journal.entite` (447:31) avec `salaire_charge`, `cout_divers` (et `cout_correction`), et
  `COLONNES` / `AVEC_MODIFIE` (`repo.ts:320-381`) pour l'annulation.

## 6. Maquette textuelle

```
[ Voir : Agence CRITERIMMO ▾ ]
Compromis | Mois | Année(s) | Mes apporteurs | Les coûts                         [ HT | TTC ]
─────────────────────────────────────────────────────────────────────────────────────────
  2019  2020  2021  2022  2023  2024  2025 [2026]        ← LigneDesAnnees, UNE seule année
─────────────────────────────────────────────────────────────────────────────────────────
 ┌ Coûts 2026 ┐ ┌ Vente ┐ ┌ Location ┐ ┌ Gestion ┐ ┌ Résultat net ┐   ← cartes (tuiles Mon espace), N-1 et écart
─────────────────────────────────────────────────────────────────────────────────────────
  Graphique mois par mois : 3 courbes Vente / Location / Gestion (+ total)
  pointillés = mêmes familles en 2025 (N-1)                  ← GrapheMois, source « couts » (grapheGlobal)
  bascule « Mois par mois | Année par année » : GrapheAnnees, mêmes familles, 2019 → 2026
─────────────────────────────────────────────────────────────────────────────────────────
  [ Vente ] [ Location et gestion ]
  Mois       | Com. indép. | Com. salariés | Apporteurs | Ext. | Inter-cab. | Salaires | Autres | Total
  Janvier    |   …         |               |            |      |            |  ✎       |  ✎     |
  …          |
  Décembre   |
  ─────────── Total ─────────────────────────────────────────────────────────────────
  ✎ = saisi (clic → saisie) ; ③ = automatique (clic → affaires du mois, correction à la source)
```
Réutilisation, sans recopie : `OngletsVues` (`apres` = boutons d'onglets, `EcransTransaction.tsx:345`), `LigneDesAnnees` /
`useLigneDesAnnees` (avec une option « une seule année » à ajouter — le Suivi CA permet plusieurs), `GrapheMois` / `GrapheAnnees` avec une
`source` (`sourceGraphe.ts`) construite depuis `atomesDuPoint(mesure: 'couts')` (`grapheGlobal.ts`), les cartes de `AccueilMonEspace`, le
tableau `CoutsGlobaux` (déjà mois par mois, à décliner par onglet Vente / Location et gestion), la bascule HT/TTC (`useAffichage`).

## 7. Carte de propagation

Règle : une source par coût, une fonction par calcul ; aucun chiffre recopié.

| Poste | Source unique | Fonction | Doit apparaître dans |
|---|---|---|---|
| Commissions vente (③) | `transaction_vente_ligne` | `lignesCarteAffaire` → `caNetVente`, `resultatDesCartes`, `espaceNegociateurs`, `coutsVente` | cartes d'affaire, CA net / CA net consolidé (Suivi CA), Espace par négociateur, graphiques Mois / Année, « Commissions versées » (`detailCommissions.ts`), Mon espace perso (`monCa` / `monCaNet`) et agence (`accueil.ts`, `agence.ts`), Coûts globaux, Résultat net, **Les coûts** |
| Rétrocessions vente (③) | `transaction_vente.retro_*`, `transaction_retrocession` | `apporteurVerseHt`, `retroTtcDe` → idem | idem + « Par apporteur » (`parApporteur`) |
| Inter-cabinet / extérieures (③) | `transaction_inter_cabinet`, `transaction_partie` | `bilanVente`, `ligneMiroir` | cartes (miroir), CA net par structure, FUSION neutralisée, Coûts globaux, Les coûts |
| Primes de gestion (③) | `gestion_location_activite` + règle | `primeDe` → `montantsLigne` → `coutsLocationMois` | Suivi CA › Location (`EcranLocationCA`), Location & Gestion (`totauxFusion`), Coûts globaux, Résultat net, Outils de suivi Location, variable négociateur, Les coûts |
| Variable négociateur location (③) | idem + `gestion_location_retrocession` | `variableC`, `coutsLocationMois`, `variableNegociateur` | idem |
| Salaires location / gestion (②, nouveau détail) | `transaction_salaire_charge` (+ ancien total) | **`salairesDuMois`** → `lireLocationCa` / `lireGestion` | Suivi CA › Location, › Gestion (tuiles, tableaux, net), Location & Gestion, Coûts globaux, Résultat net, graphique global (mesure coûts), Outils de suivi Location (`resultatNetAgence`), Les coûts |
| Salaires vente (②, nouveau) | `transaction_salaire_charge` fonction vente | `salairesDuMois` → `coutsDe` | Coûts globaux, Résultat net, Les coûts ; **PAS** le CA net d'une vente (question 12.3) |
| ADHOC / MONGA (②) | `transaction_gestion_mois` | `moisGestion` / `totauxGestion` | Suivi CA › Gestion, Location & Gestion, Coûts globaux, Résultat net, Les coûts |
| Autres coûts (②, nouveau) | `transaction_cout_divers` | `coutsDe` (nouvelle rubrique) | Coûts globaux, Résultat net, graphique global, Les coûts |

À faire une fois : `coutsDe` reçoit les nouvelles rubriques ; `CoutsGlobaux.tsx`, `ResultatNetGlobal.tsx`, `grapheGlobal.ts` les affichent
automatiquement puisqu'ils lisent `coutsDe`. La route de lecture `?vue=global` (`api/admin/transaction/route.ts:75-97`) devient la source
de « Les coûts » (ou une route Mon espace qui appelle les mêmes repos).

## 8. Risques de double compte

1. **Commissions déjà dans le CA net** : « Les coûts » ne STOCKE aucune commission ; il lit `coutsVente`, qui part des mêmes lignes que
   `caNetVente`. Le CA net d'une vente ne bouge que si la ligne bouge.
2. **Salaires location vs primes + variable** : règle actuelle conservée (`locationCa.ts:115-150`) : un mois avec salaires location, primes et
   variable sont « inclus ». Le détail par salarié passe par la même règle (le test : présence d'au moins un salaire location du mois).
3. **Salaires de négociateurs vente salariés/associés vs leurs commissions** : un salarié vente touche peut-être fixe + variable ; si le salaire
   chargé saisi inclut déjà le variable, la commission « interne » serait comptée deux fois → question 12.3 (proposition : le salaire chargé
   saisi = le FIXE chargé ; les commissions restent celles des cartes).
4. **Ancien total mensuel vs détail** : `salairesDuMois` prend l'un OU l'autre, jamais la somme (§ 5.1).
5. **Deux définitions du « net »** : `espaceNegociateurs.net` (et donc `monCaNet`) ne déduit, sur les ventes historiques sans répartition,
   que les commissions des indépendants (`carteAffaireLignes.ts:225,233`) ; `caNetVente` et `coutsVente` déduisent toutes les commissions.
   « Les coûts » suit `coutsVente` (comme « Coûts globaux ») et l'écrit en note sous le tableau ; les tests comparent chaque écran à SA
   fonction, pas à l'autre.
6. **Net location du module Location ≠ net du Suivi CA** (collègues et part récurrente). Si Arno ajoute ces postes (§ 2, oublis 1), ils
   entrent dans `coutsLocation` et la différence disparaît ; sinon elle est documentée.
7. **Inter-cabinet** : coût pour la porteuse, recette pour la receveuse, neutralisé en FUSION (déjà fait par `coutsVente` vue nulle). Jamais
   saisi à la main dans « Les coûts ».
8. **Correction manuelle** : à la source (§ 5.3) → une seule valeur partout ; l'ancienne reste dans le journal, annulable.

## 9. Rafraîchissement

- Mon espace bat toutes les 15 s (`PERIODE_MON_ESPACE_MS`, `rafraichir.ts:11`) sur `GET /api/admin/mon-espace/empreinte` ; l'empreinte
  = ids des ventes + max(version) (`empreinteDe`, `mesAffaires.ts:127` ; `sqlVersionVente`, `transaction/repo.ts:45`). **Elle ignore**
  rétrocessions, `gestion_mois`, salaires, inter-cabinet et module Location.
- Proposition : une empreinte « coûts » = max(`transaction_journal.id`) toutes entités + max(`modifie_le`, `annule_le`, `cree_le`) de
  `gestion_location_activite` / `gestion_location_retrocession` / `gestion_location_commission_regle`, servie par la même route
  (`?onglet=couts`) et ajoutée à l'empreinte agence. Une saisie dans « Les coûts » apparaît ainsi en ≤ 15 s dans un autre « Mon espace »
  ouvert.
- Le Suivi CA n'a AUCUN battement aujourd'hui (rechargement par `relire`). L'y brancher (même hook, même empreinte) est un ajout, proposé
  en lot séparé (lot 7).

## 10. Tests de cohérence à prévoir

1. **Saisie d'un salaire gestion de 1 234,57 € pour 03/2026** : `totauxGestion` net de mars baisse de 123 457 centimes ; Coûts globaux et
   Résultat net de mars 2026 aussi ; avril, 03/2025 et MACJ inchangés ; FUSION = CRITERIMMO + MACJ.
2. **Salaire location** : le mois passe en « inclus dans les salaires » (primes / variable non déduits), même chiffre dans `EcranLocationCA`,
   `totauxFusion`, `coutsGlobaux`, `resultatNetAgence` (s'il lit la même fonction).
3. **Détail vs ancien total** : un mois avec ancien total 2 000 € et sans détail → 2 000 ; on ajoute deux salariés 900 + 600 → 1 500 (pas 3 500).
4. **Correction d'une commission depuis « Les coûts »** : la cellule, la carte de la vente, `caNetVente`, l'Espace par négociateur, Mon espace
   agence et perso (part du titulaire) changent du même montant au centime, pour le bon mois et la bonne structure ; journal + annulation
   rendent la valeur d'avant partout.
5. **Totaux** : pied de chaque colonne = Σ des 12 lignes = la colonne correspondante de `CoutsGlobaux` pour l'année ; HT et TTC.
6. **Une seule année** : changer l'année change graphique, cartes et tableau ensemble ; aucune valeur d'une autre année (fixtures sur deux années).
7. **Visibilité** : onglet absent en vue perso et pour un non-associé ; route 403 serveur ; présent en CRITERIMMO / MACJ / FUSION.
8. **Sélecteur de profil** : ordre fonction en cours → autres location/gestion → autres ; observateurs exclus.
9. **Empreinte** : une saisie change l'empreinte « coûts » ; une saisie sans rapport (permis…) ne la change pas.
10. Garde : `clientBoundary.guard.test.ts` (aucun `pg` côté client), preuve curl.

## 11. Découpage en lots

| Lot | Contenu | Migration | Tests |
|---|---|---|---|
| **C1** | Onglet « Les coûts » en LECTURE : visibilité (associé, § 12.1), suit « Voir », rangée des années à une seule année, cartes, graphique 3 familles + N-1 (source `couts`), tableau 2 onglets × 12 mois + totaux, tous calculés par `coutsGlobaux`. Aucune saisie. | aucune (droit : statut `associe` existant) | égalité au centime avec `CoutsGlobaux` ; une seule année ; visibilité ; 403 |
| **C2** | Droit « Coûts » par profil (si Arno le choisit) dans Comptes, journalisé (modèle `resultatNet.ts`) | `451_perm_couts` | droit, garde serveur, admin implicite |
| **C3** | Saisie en place des postes mensuels EXISTANTS (ADHOC, MONGA, salaires location/gestion en total) via `enregistrerGestion` / `enregistrerSalairesLocation` ; empreinte « coûts » | aucune | propagation tests 1-2, empreinte |
| **C4** | Fonctions des profils (page Comptes, déduction initiale) + `profilsPourSalaire` | `452_compte_fonction` | ordre du sélecteur |
| **C5** | Salaires chargés par salarié + `salairesDuMois` branché dans `lireLocationCa` / `lireGestion` / `coutsDe` ; journal étendu | `453_salaire_charge` (+ CHECK journal) | tests 1-3 |
| **C6** | Autres coûts (« oubliés ») par famille, colonnes libres ; rubrique dans `coutsDe` | `454_cout_divers` | totaux, Résultat net |
| **C7** | Cellules ③ : clic → affaires du mois → correction à la source (gestes existants) ; (option ajustement mensuel si 12.4 = oui : `455_cout_correction`) | selon 12.4 | test 4 |
| **C8** | Postes oubliés validés (part récurrente apporteurs, collègues) dans `coutsLocation` ; battement 15 s dans le Suivi CA | aucune | égalité module Location / Suivi CA |

Chaque migration : ajout seul (aucune colonne retirée), triggers anti-DELETE, livrée non appliquée ; code compatible sans elle
(`schemaDroits.ts` : `…Disponible()`).

## 12. Questions produit pour Arno

1. **Qui sont les « profils associés » ?** Aujourd'hui le statut « Associé » existe déjà (vos deux comptes administrateurs).
   *Proposition* : un nouveau droit « Coûts » à cocher par profil dans Comptes (administrateurs : implicite), plutôt que le statut — on peut
   ainsi ouvrir l'onglet à quelqu'un qui n'est pas associé, ou le fermer à un associé.
2. **L'onglet suit-il le sélecteur « Voir » ?** *Proposition* : oui (CRITERIMMO, MACJ, FUSION), et il est absent en vue perso « Mon espace ».
   Corollaire : aujourd'hui seuls les administrateurs ont « Voir ». *Proposition* : un profil qui a le droit « Coûts » sans être
   administrateur voit « Voir » dans cet onglet seulement.
3. **Salaires des négociateurs vente salariés / associés** : le salaire chargé saisi comprend-il leur variable ? *Proposition* : non, on saisit le
   fixe chargé ; les commissions restent celles des cartes (sinon double compte).
4. **Corriger un coût automatique** : à la source (la commission sur la vente, la prime sur le bail) ou par un montant mensuel forcé ?
   *Proposition* : à la source — un seul chiffre partout ; le montant forcé ne serait qu'une ligne « Ajustement » visible, jamais en
   remplacement.
5. **Postes oubliés** : faut-il ajouter (a) la part gestion récurrente due aux apporteurs et la rémunération des collègues apporteurs (calculées
   par Location, absentes du Suivi CA), (b) des frais communs (loyer, logiciels, portails, assurances, comptable, banque) ? *Proposition* :
   (a) oui, en coûts Location ; (b) une colonne « Autres » libre par famille d'abord, une famille « Frais communs » plus tard si besoin.
6. **Interventions MONGA par devis** : à la charge des propriétaires (pas un coût de l'agence) ? *Proposition* : oui → non comptées ; seul le
   forfait mensuel MONGA est un coût.
7. **Location / gestion de MACJ** : y a-t-il des coûts location ou gestion pour MACJ ? *Proposition* : non, tout est CRITERIMMO (comme
   aujourd'hui) ; la colonne structure existe quand même sur les nouvelles saisies.
8. **Historique des salaires** : les totaux mensuels déjà saisis (gestion 2025-2026, location 09/2026) restent tels quels, ou faut-il les
   répartir par salarié ? *Proposition* : ils restent ; le détail par salarié s'applique aux mois saisis ensuite (et remplace le total d'un mois
   dès qu'on détaille ce mois).
9. **Fonction d'un profil** : une case par fonction (vente / location / gestion) dans Comptes, pré-cochée par déduction ? *Proposition* : oui,
   plusieurs fonctions possibles par profil.
