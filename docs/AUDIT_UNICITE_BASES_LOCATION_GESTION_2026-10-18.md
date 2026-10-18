# AUDIT — Unicité des bases locataires, propriétaires, biens et syndics entre les tuiles Location et Gestion

> 18-19/10/2026 · **lecture seule** : aucun fichier de code modifié, aucune migration, aucune écriture Drive. Base du
> serveur non consultée. Aucun nom de client ici ; les listes nominatives sont dans `.captures/audit-unicite/` (gitignoré) :
> `doublons.sql`, `meme_coordonnee.csv`, `meme_nom_adresse.csv`, `fiches_multi.csv`, `biens_meme_signature.csv`.
>
> **Réserve de méthode** : les requêtes de doublons (§6) ont créé trois **vues TEMPORAIRES de session** (`CREATE TEMP VIEW`)
> pour factoriser les `SELECT`. Rien n'a été écrit dans une table ; elles ont disparu à la fin de la session. Ce n'est
> néanmoins pas du « `SELECT` seul » au sens strict : je le signale.
>
> Chaque point porte **ÉTABLI** (preuve : fichier:ligne ou requête) ou **NON ÉTABLI**.

---

## 1. Inventaire des tables

**Aucune table parallèle propre à la Location** — ÉTABLI. Ni `location_*`, ni « fiche », « client », « CRM » parmi les
`CREATE TABLE` des migrations ; même constat dans les deux bases du Mac (`sansvisavis` et `svav_recette`, requête sur
`pg_tables`). La Location lit et écrit les tables `gestion_*` de la Gestion.

### 1.1 Personnes, biens, baux (le cœur partagé)

| Table (migration) | Rôle | Location | Gestion | Lignes (Mac) |
|---|---|---|---|---|
| `gestion_annuaire_proprietaire` (253) | propriétaire | lit + écrit | lit + écrit (import WIPPIMMO compris) | 313 |
| `gestion_annuaire_locataire` (253) | locataire | lit + écrit | lit + écrit | 510 |
| `gestion_annuaire_contact` (253) | téléphones et e-mails des propriétaires et locataires | lit (écrit via les fonctions de la Gestion) | lit + écrit | 1 807 (vivante) |
| `gestion_annuaire_lot` (253, + 370-382) | bien, lot **et** annexe (`categorie`) | lit + écrit | lit + écrit | 365 |
| `gestion_annuaire_occupation` (253) | bail (lot × locataire, entrée / sortie) | lit + écrit | lit + écrit | 535 |
| `gestion_annuaire_lot_proprietaire` (278) | bien ↔ propriétaire, daté | écrit | écrit | 17 |
| `gestion_lot_annexe` (372) | lien annexe → logement (pas un second stock de biens) | écrit | — | — |
| `gestion_location_conditions` (370) | loyer, provisions, taux par **occupation** (complète le bail) | lit (écrit via `honorairesGestionRepo`) | écrit | — |
| `gestion_lot_entretien` (379), `gestion_immeuble_ag` (377), `gestion_lot_sortie_origine` (381), `gestion_proprietaire_archivage_origine` (380) | compléments d'un bien / d'un geste | écrit | — | — |
| `gestion_annuaire_verrou` (278), `gestion_annuaire_import` (253) | champs protégés de l'import ; journal d'import | (via les fonctions communes) | écrit | 45 / 3 |

Les tables sans compte (« — ») n'existent pas dans la base `sansvisavis` du Mac (voir §5).
Lectures et écritures : grep `INSERT INTO|UPDATE|SELECT` par table (rapport d'exploration) — ÉTABLI.

### 1.2 Coordonnées et parties (Gestion)

| Table (migration) | Rôle | Lignes |
|---|---|---|
| `gestion_partie_categorie` (304) | une ADRESSE E-MAIL rangée « propriétaire / locataire / indépendant » pour un bien | 706 |
| `gestion_contact_carte` (304) | la carte d'un contact d'un bien (adresse e-mail, nom, un téléphone) | 506 |
| `gestion_contact_externe` (293) | contact extérieur (avocat, garant, syndic…), unique par e-mail | 2 |
| `gestion_tache_contact` (347) | instantané figé des contacts d'une tâche (copie voulue) | 9 |

La Location y écrit **indirectement**, par les fonctions de la Gestion (`contactsLocationRepo.ts:3,49,51` →
`poserCategorieAlaMain`, `poserCarteAlaMain`) — ÉTABLI.

### 1.3 Syndics (324 et suivantes)

| Table | Rôle | Lignes |
|---|---|---|
| `gestion_syndic` | le cabinet | 1 |
| `gestion_syndic_contact`, `gestion_syndic_coordonnee`, `gestion_syndic_contact_copropriete`, `gestion_syndic_note_bien` | ses contacts et leurs coordonnées | 5 / 9 / 20 / 0 |
| `gestion_copropriete`, `gestion_copropriete_syndic`, `gestion_copropriete_adresse`, `gestion_copropriete_contact(_coordonnee)` | l'immeuble, son syndic daté, ses contacts | 5 / 8 / 3 / 3 |
| `gestion_annuaire_lot.syndic_id` (374) | **lien direct bien → syndic**, posé par la Location | (colonne absente du Mac) |

### 1.4 Tables qui stockent « la même chose » — à signaler

1. **Trois magasins de coordonnées** — ÉTABLI par les schémas.
   - `gestion_annuaire_contact` : les clients ;
   - `gestion_contact_carte` : les contacts d'un bien, nom et téléphone en texte libre ;
   - `gestion_contact_externe` : peut aussi porter un `type='syndic'`.

   Ce ne sont pas des fiches de personnes en double : les deux derniers servent au rangement du courrier. Mais un même
   téléphone ou un même nom peut y vivre à deux endroits sans lien entre eux.
2. **Deux liens bien → propriétaire** : `gestion_annuaire_lot.proprietaire_id` (import) et
   `gestion_annuaire_lot_proprietaire` (copropriété saisie). C'est voulu (278:174-175), mais les deux tuiles ne lisent pas
   les deux (§4 b) — ÉTABLI.
3. **Deux liens bien → syndic** : `gestion_annuaire_lot.syndic_id` (Location) et copropriété → syndic (Gestion). Voir §4 f
   — ÉTABLI.

---

## 2. Chemins d'écriture

**Toutes les écritures des deux tuiles visent les tables `gestion_*` de la Gestion** — ÉTABLI. Aucune écriture hors des
tables communes.

Côté Location (`api/admin/location/route.ts`, POST l.191-328) :

| Action | Fonction | Tables |
|---|---|---|
| `modifier` / `archiver` / `restaurer` / `separer` | **fonctions de la Gestion** (`annuaireEditionRepo.ts:131, 342, 546`) | personne, contact, verrou, journal |
| `numero-mandat`, `en-gestion` | `locationRepo.ts:358`, `creationBienRepo.ts:464` | proprietaire |
| `modifier-bien`, `complements-bien` | `locationRepo.ts:379`, `creationBienRepo.ts:401` | lot (dont `syndic_id`), lot_entretien, immeuble_ag |
| `ajouter-annexe`, `rattacher-annexe`, `detacher-annexe` | `locationRepo.ts:441, 471`, `entretienAnnexeRepo.ts:79` | lot, lot_annexe |
| `creer`, `creer-bien`, `creer-proprietaires` | `locationRepo.ts:506`, `creationBienRepo.ts:175, 86` | proprietaire, lot, lot_annexe, lot_proprietaire ; contacts → partie_categorie, contact_carte |
| `creer-locataire(s)` | `portefeuilleRepo.ts:688, 740` → **`creerPersonne` / `ajouterOccupant` de la Gestion** | locataire, contact, occupation |
| `sortir`, `reactiver`, `sortir-biens` | `portefeuilleRepo.ts:386, 466, 613` | proprietaire, locataire, lot (`sorti_portefeuille_le`), occupation, origines |
| `sortie-locataires`, `corriger-…`, `annuler-…` | `sortieLocatairesRepo.ts:248, 297, 317` | occupation.sortie, journal |
| `conditions-location` | `honorairesGestionRepo.ts:120` (Gestion) | location_conditions |
| `ajouter-contact-syndic` | `syndicLocationRepo.ts:112` → **`enregistrerSyndic` de la Gestion** | syndic, syndic_contact, coordonnée, copropriété |

Côté Gestion :
- **`api/admin/gestion/annuaire/route.ts`** (`annuaireEditionRepo`) :
  - personnes : création, modification, archivage, suppression logique (`supprime_le`, :466-470) ;
  - occupant ajouté (:839), propriétaire ajouté ou remplacé (:663, :711-715) ;
  - **`depart`** (`enregistrerDepart`, :870).
- **`api/admin/gestion/annuaire/location/route.ts`** : les MÊMES fonctions que la Location.
- **Syndics** : `api/admin/gestion/syndics/**` (`enregistrerSyndic` :411, `supprimerSyndic` :811, affecter-contact,
  rattacher-bien, retirer-copropriété).
- **Parties et cartes** : `historique/parties` (`partieCategorieRepo`).

---

## 3. Le garde-fou « une seule fiche »

- **Où** : `app/(admin)/admin/(protected)/location/aucuneFicheEnDouble.test.ts` — ÉTABLI.
- **Ce qu'il interdit**, sous `location/` (hors tests) :
  1. tout composant dont le nom est `Fiche…` ou `Vue…` suivi de `Proprietaire`, `Locataire`, `Bien` ou `Lot` (l.23) ;
  2. toute mention de `CartePersonne`, `HistoriqueDuBien`, `VueLot`, `VueProprietaire` ou `VueLocataire` (l.34) ;
  3. il exige que `proprietaire/[id]`, `locataire/[id]` et `bien/[id]` montent `FicheCommuneLocation` (l.40-44) ;
  4. il exige que la fiche commune monte `Annuaire` sans rédaction (l.45-50).
- **Biens : couverts** — ÉTABLI.
- **Syndics : NON couverts** — ÉTABLI.
  - La regex ne contient pas `Syndic`.
  - `EcransLocation.tsx:124` définit **`FicheSyndicLocationVue`**, une fiche syndic propre à la Location, montée par
    `location/syndic/[id]/page.tsx`, alors que la Gestion a `gestion/FicheSyndic`.
  - Ses **données** ne sont pas copiées : `ficheSyndicLocation` rend `ficheSyndic(id)` de la Gestion
    (`portefeuilleRepo.ts:779-781`). C'est un doublon d'**écran**, pas de base.
- **Ce qu'il ne couvre pas** : les données (aucune épreuve sur les migrations ni sur les routes), et les composants nommés
  autrement (`Ecran…`, `Carte…`).

---

## 4. Interconnexion : ce qu'on voit après un geste fait depuis la Location

**Aucun cache, aucune copie** — ÉTABLI. Les routes répondent `no-store` (route Location l.58, route annuaire l.49), le
client lit en `cache: 'no-store'` (`location/commun.tsx`, `useLecture`), et le seul cache client (`gestion/cachePages.ts`)
ne concerne que les listes de mails. Tout est relu en base, à chaque affichage.

Après une sortie de locataire (qui pose `gestion_annuaire_occupation.sortie`) :

| Où | Règle de lecture | Visible tout de suite ? |
|---|---|---|
| (a) fiche bien de la Gestion (vacant / reste loué) | `ficheLot` (`annuaireRepo.ts:1807`) ; en place = **sortie absente** (`estLocataireEnPlace`, `historiqueBien.ts:1560`) | **oui** — ÉTABLI |
| (b) fiche propriétaire | locataire en place = `sortie IS NULL` (`annuaireRepo.ts:1631`) | **oui** — ÉTABLI |
| (c) « Biens de ce propriétaire » (écran d'archivage) | `o.sortie IS NULL` (`portefeuilleRepo.ts:538-539`) | **oui** — ÉTABLI |
| (d) recherche des occupants | `sortie IS NULL OR sortie > aujourd'hui` (`sortieLocatairesRepo.ts:105`) | **oui** pour une sortie datée d'aujourd'hui ou du passé — ÉTABLI |
| (e) historique et classement des mails | calculés à la lecture depuis `occupation.sortie` : « ancien locataire » = sortie renseignée (`estAncienLocataire`, `familleDestinataire.ts:202`, `BlocHistoriqueEchanges.tsx:59`) ; rattachement par date avec borne incluse `>=` (`historiqueBien.ts:1527`, `classementBien.ts:167`, `ficheRattachementRepo.ts:152-161`…) | **oui** — ÉTABLI |
| (f) syndic modifié depuis la Location (`ajouter-contact-syndic`) | `enregistrerSyndic` de la Gestion, mêmes tables | **oui** — ÉTABLI |

### Écarts trouvés (à corriger)

1. **Sortie datée dans le FUTUR — incohérence introduite par la sortie de locataire (commit `ad2568f9`)** — ÉTABLI.
   - Ma sortie accepte une date jusqu'à un an.
   - Dès l'enregistrement, (a), (b), (c) et (e) traitent le locataire comme **parti**, puisque la sortie est renseignée.
   - La recherche d'occupants (d) le garde **en place** jusqu'à la date. Elle mène alors à un bail qui ne le contient plus
     (`lireBailAvec` lit `sortie IS NULL`), et il apparaît sous « Sorties enregistrées ».
   - Il faut choisir **une** règle (question 1).
2. **Le jour même de la sortie** : (d) exclut le sortant (`>`), alors que le rattachement des mails le garde ce jour-là
   (`>=`). L'écart est de quelques heures sans effet métier fort, mais deux règles coexistent — ÉTABLI.
3. **Deux voies pour enregistrer un départ** — ÉTABLI.
   - `enregistrerDepart` (Gestion, `annuaireEditionRepo.ts:880-881`) n'a ni garde « déjà sorti » (il écrase une sortie
     existante), ni borne d'un an, ni contrôle par rapport à l'entrée, ni suivi des annexes, ni mail.
   - La sortie de la Location (`sortieLocatairesRepo.ts:248`) a tout cela.
   - Même fait, deux contrôles différents.
4. **Fiche propriétaire : les biens partagés** — ÉTABLI. La fiche propriétaire de la Gestion ne retient que
   `lot.proprietaire_id = …` (`annuaireRepo.ts:1635, 1766`) ; la vue Location ajoute les biens liés par
   `gestion_annuaire_lot_proprietaire` (`locationRepo.ts:233`). Un bien en copropriété saisie apparaît d'un côté, pas de
   l'autre.
5. **Syndic d'un bien : deux sources de vérité** — ÉTABLI.
   - Les « compléments du bien » (`creationBienRepo.ts:426`, formulaire « Syndic (Gestion) » de la fiche commune,
     `SectionsLocationFiche.tsx:608, 700`) écrivent seulement `gestion_annuaire_lot.syndic_id`.
   - La Gestion trouve le syndic d'un bien **par la copropriété** (`partiesSyndicRepo.ts:82, 101`,
     `syndicRepo.ts:195-199`), et aucune lecture de `lot.syndic_id` côté Gestion n'a été trouvée (grep).
   - Un syndic choisi ou changé là n'apparaît donc pas dans les parties ni sur la fiche syndic de la Gestion.
   - Seule la création d'un bien (`creer-bien`) pose les deux (`rattacherSyndicAuBien`).
6. **Fiche syndic en double à l'écran** (§3) : `FicheSyndicLocationVue` contre `gestion/FicheSyndic` — mêmes données,
   deux présentations — ÉTABLI.

---

## 5. Écart de schéma : la base du Mac

**Les 13 migrations Location 370 à 382 sont TOUTES absentes de la base `sansvisavis` du Mac** — ÉTABLI. Une requête par
objet clé est revenue à 0 pour : `gestion_location_conditions` (370), `admin_utilisateur.perm_location` (371),
`gestion_lot_annexe` et `lot.categorie` (372), `sorti_portefeuille_le` (373), `type_logement` et `syndic_id` (374),
`en_gestion` (375), `ascenseur` (376), `gestion_immeuble_ag` (377), `nom_annexe` (378), `gestion_lot_entretien` (379),
`gestion_proprietaire_archivage_origine` (380), `gestion_lot_sortie_origine` (381), `dpe_non_soumis` (382).

**Mais la RECETTE ne tourne pas sur cette base** — ÉTABLI.
- `npm run recette` utilise `svav_recette`, une copie des données du serveur (`scripts/recette.sh:4, 13`).
- Elle **a** les migrations 371, 372 et 382 (sondées), avec les mêmes 510 locataires et 365 biens.

Ce que ça change à l'écran :
- **En recette** (`svav_recette`) : rien — le schéma est complet.
- **Sur `npm run dev`** (`sansvisavis`) :
  - les écrans Location qui exigent ces colonnes ou tables tombent sur « mise à jour de la base à appliquer » ou se
    réduisent (sondes de schéma) : pas d'annexes, pas d'étage ni de porte, pas de motif de sortie, pas de conditions de
    loyer ;
  - les requêtes qui nomment `gestion_lot_annexe` sans sonde échouent (par exemple `rechercherPortefeuille`,
    `portefeuilleRepo.ts:88`) — ÉTABLI par lecture du code, NON ÉTABLI à l'écran ;
  - le droit Location n'existe pas (`perm_location`) : le mail de sortie ne s'adresse alors qu'aux comptes Gestion et
    aux administrateurs (repli sondé).

---

## 6. Doublons de données

Mesure sur `svav_recette` (données du serveur). La base `sansvisavis` donne les mêmes comptes de base (308 propriétaires
actifs, 510 locataires, 365 biens, 1 syndic actif ; 21 et 14 groupes de coordonnées partagées).

| Catégorie | Comptes | Exemples anonymisés |
|---|---|---|
| **Même e-mail** sur plusieurs fiches | **21 groupes**, 47 fiches : 18 dans une même table, 3 mêlant un propriétaire et un locataire | ① une personne seule ET la fiche de son couple (« NOM Prénom » / « NOM Prénom et Prénom2 ») ; ② une même société locataire en quatre fiches (raison sociale, raison sociale + forme juridique, « … représentée par M. X ») ; ③ une adresse de l'agence ou d'un dirigeant reportée sur des fiches de sociétés propriétaires ET une fiche locataire |
| **Même téléphone** sur plusieurs fiches | **14 groupes**, 30 fiches : 11 dans une même table, 3 mêlées | ① le même cas « personne / couple » ; ② deux sociétés d'un même groupe (holding et SCI) ; ③ le téléphone d'un dirigeant posé sur trois fiches |
| **Même nom + même adresse** (même table) | **1 groupe**, 2 fiches propriétaire | deux fiches WIPPIMMO homonymes à la même adresse (déjà connues : deux numéros WIPPIMMO distincts) |
| Même nom seul (homonymes) | 1 groupe propriétaires, 1 groupe locataires | à vérifier à la main |
| **Même bien en plusieurs fiches** | 0 sur « adresse + n° de lot de copro » ; 0 sur « adresse + étage + porte » ; **29 groupes / 120 biens** indiscernables par « adresse + nature + type » (aucun étage ni porte saisi) | ① plusieurs studios meublés d'une même résidence ; ② plusieurs parkings d'un même immeuble ; ③ deux appartements « Type 2 » d'une même adresse. Ce sont **probablement des lots distincts** (numéros WIPPIMMO différents), indiscernables faute d'étage ou de porte — NON ÉTABLI comme doublons |
| **Même syndic** | 0 (nom, e-mail, téléphone) | — un seul syndic actif |
| **Fiches qui regroupent plusieurs personnes** (« X et Y », « X & Y ») | **65 propriétaires sur 308 ; 115 locataires sur 510** (+ 7 et 5 noms à tiret « X - Y », à vérifier) | ① « NOM Prénom et Prénom2 » (couple) ; ② « NOM1 et NOM2 Prénoms » (indivision) ; ③ « SOCIÉTÉ … représentée par … » |

---

## 7. Verdict (pour Arno)

1. **Une seule base, oui** : locataires, propriétaires, biens (annexes comprises) et syndics vivent dans les MÊMES tables
   de la Gestion. La Location n'a aucune table à elle et écrit avec les mêmes fonctions. Pas de cache : un geste se voit
   partout au rechargement.
2. **Interconnecté, presque partout** : une sortie de locataire se voit tout de suite sur la fiche du bien, sur la fiche
   du propriétaire, dans l'écran d'archivage, dans la recherche et dans le classement des mails.
3. **Trois trous à boucher** : une sortie datée dans le futur (traitée « partie » ici, « en place » là — défaut de ma
   sortie de locataire) ; le syndic choisi dans les compléments d'un bien, invisible de la Gestion ; les biens partagés
   entre propriétaires, absents de la fiche propriétaire de la Gestion.
4. **Deux portes pour un même geste** : le « départ » de la Gestion n'a pas les contrôles de la sortie de la Location ;
   et la fiche syndic existe en deux présentations.
5. **Données** : pas de bien ni de syndic en double. 21 adresses e-mail et 14 téléphones sont partagés entre fiches
   (surtout « personne » + « couple », et une même société en plusieurs fiches) ; 180 fiches portent deux personnes dans
   un même nom.

### Propositions de lots (rien d'implémenté)

| Lot | Contenu | Question à trancher d'abord |
|---|---|---|
| **A — Sortie datée dans le futur** | une seule règle partout | question 1 |
| **B — Syndic du bien** | les compléments passent par `rattacherBienAuSyndic`, ou la Gestion lit aussi `lot.syndic_id` ; plus une reprise des biens déjà saisis | question 2 |
| **C — Biens partagés sur la fiche propriétaire** | la Gestion lit aussi `gestion_annuaire_lot_proprietaire` | — |
| **D — Un seul geste de départ** | le « départ » de la Gestion passe par `enregistrerSortie` (contrôles, annexes, journal, mail) | — |
| **E — Fiche syndic** | la Location monte `gestion/FicheSyndic`, et le garde-fou couvre aussi `Syndic` | accord d'Arno requis : un écran est remplacé |
| **F — Fiches à rapprocher** | liste de travail des coordonnées partagées et des fiches « X et Y », pour décider au cas par cas (« Séparer en deux personnes » existe déjà) | — |
| **G — Base du Mac** | appliquer les migrations 370-382 à `sansvisavis`, ou documenter que le développement Location se fait sur `svav_recette` | — |

### Questions de choix métier
1. **Une sortie datée dans le futur** : le locataire est-il encore « en place » jusqu'à cette date (et le logement loué),
   ou « sortant » dès l'enregistrement ? Exemple : préavis reçu le 19/10, départ le 31/12.
2. **Le syndic d'un bien** : la vérité est-elle l'immeuble (copropriété, comme la Gestion) ou le bien lui-même ? Exemple :
   un parking et un appartement d'une même adresse peuvent-ils avoir deux syndics différents ?
