# ÉTUDE — Tuile « LOCATION », interconnectée avec la tuile « GESTION »

> **Statut : ÉTUDE, LECTURE SEULE.** Aucun code applicatif, aucune migration, aucune écriture en base (ni locale
> ni prod), aucun mail. Rédigée le 17/10/2026.
> **Méthode** : reconnaissance du code (A) ; trois recherches parallèles — métier et réglementation (B1), logiciels
> du marché (B2), ergonomie « moins de clics » (B3) ; proposition v1 (C) ; critique par quatre relecteurs
> INDÉPENDANTS qui n'ont reçu que la proposition — gestionnaire locatif (D1), agent de terrain (D2), compteur de
> clics (D3), architecte des données (D4) ; révision v2 (E).
> **Maquettes** : `.captures/location-etude/index.html` (statiques, données inventées).
> ✅ **Mise à jour du 17/10/2026** : trois points juridiques vérifiés sur sources web (honoraires, cumul caution +
> assurance loyers impayés, DPE) — marqués « vérifié 17/10/2026 » ; voir §11.
> ✅ **Révision v3 du 17/10/2026 — réponses d'Arno aux 5 questions** (§12) : WIPPIMMO garde quittances et
> comptabilité ; registre des mandats hors périmètre (seul un « N° de mandat de gestion » libre par propriétaire) ;
> aucune pièce de candidat ; honoraires de location au barème modifiable, **loyer de départ + taux de gestion** saisis
> à l'entrée et **honoraires de gestion** calculés (§4.9) ; signature électronique hors périmètre (Yousign, PDF signé
> joint). Synthèse, modèle, écrans, clics et lots refaits en conséquence. Le lot L0 est livré (2e36daf7, migration 369).
> ⚠️ **Recherche web refusée dans la session d'étude** (WebSearch et WebFetch bloqués par les permissions). B1, B2 et B3
> reposent sur les connaissances des agents ; **toute référence juridique ou chiffre est marqué « à vérifier »** et
> devra être confirmé sur Légifrance / service-public.fr / ANIL / CNIL avant d'être codé en contrôle bloquant
> (liste au §11). La reconnaissance du code (A) et la critique données (D4), elles, sont vérifiées dans le dépôt
> et en base locale (comptages seuls).
> **Repères** : **[Arno]** = demandé par Arno ; **[proposé]** = ajouté par l'étude, avec son utilité. Ce document
> n'est pas un avis juridique.

---

## 0. Synthèse en une page (pour Arno)

**Ce qu'on construit.** Une tuile « Location » pour l'équipe location : suivre les **prospects**, **estimer** un
loyer devant le propriétaire, suivre les **candidats** (leur statut seulement) et les **visites**, puis créer le
**bail** et le **dossier d'entrée** (votre fiche papier « Nouveau dossier », intégrée champ pour champ). L'outil
**produit les PDF** (mandat, bail, dossier d'entrée) ; vous les faites signer dans Yousign et vous **joignez le PDF
signé** au dossier. [Arno]

**Ce qu'on ne construit pas** [Arno, 17/10/2026] : ni quittances ni comptabilité (WIPPIMMO les garde) ; ni registre
ni numérotation des mandats (votre logiciel dédié les garde : l'outil a seulement un champ libre « N° de mandat de
gestion » sur chaque propriétaire) ; ni pièces de candidats ; ni signature électronique intégrée.

**Un seul fichier, pas deux.** La Location écrit dans **le même annuaire** que la Gestion (313 propriétaires,
510 locataires, 365 biens), avec **les mêmes cartes**. Une coordonnée corrigée d'un côté l'est de l'autre. Quand
vous ressaisissez le nouveau locataire dans WIPPIMMO pour le quittancer, l'import le **rapproche** de la fiche créée
dans l'outil, sans doublon : c'est le lot L0, **déjà livré** (2e36daf7). [Arno]

**Une personne = une fiche, quels que soient ses rôles** (propriétaire, locataire, garant, candidat) ; un téléphone
ou un e-mail déjà connu est signalé, jamais fusionné tout seul. **Le logement est le « vaisseau mère »**, cave et
parking ses enfants : louer le parking à un autre ne perd jamais le lien. La fiche du bien s'enrichit (étage, porte,
Carrez, surface extérieure et habitable, n° de lot de copropriété, diagnostics). [Arno + proposé]

**Les honoraires, enfin visibles.** À chaque entrée, on saisit le **loyer mensuel de départ** et le **taux de
gestion** ; ils sont rangés sur la location, affichés sur la carte du locataire et sur le bien, et gardés à chaque
changement de locataire. L'outil en déduit les **honoraires de gestion** de chaque lot, par propriétaire et pour
toute l'agence, au mois et à l'année (§4.9). D'après vos exports WIPPIMMO (365 lots), le taux y est **hors taxes**
(4,5 % HT le plus souvent) et appliqué **charges comprises** : ce sont les valeurs par défaut proposées, avec le taux
WIPPIMMO de chaque lot repris comme point de départ. Les **honoraires de location** prennent le barème légal (réglage
daté par zone) et restent modifiables bail par bail, marqués « modifiés ».

**Moins de clics, mesuré** (§6). Les six parcours demandés : **42 → 41 clics** au bureau, **50 → 49** sur téléphone
(le mandat compact disparaît). Deux parcours nouveaux : joindre le PDF signé (4 clics) et consulter les honoraires par
propriétaire sur l'année (3 clics). Créer locataire + bail + dossier d'entrée complet reste à **9 clics** : loyer de
départ, taux et honoraires sont pré-remplis.

**Sécurité juridique au bon moment.** Rien ne bloque pendant la saisie. À « Mettre en place », l'outil vérifie :
diagnostics à jour, DPE autorisé (G interdit depuis le 01/01/2025, F à partir de 2028), dépôt et honoraires de
location sous les plafonds (12,10 €/m² + 3,03 €/m² à Paris depuis le 01/01/2026), loyer sous l'encadrement, pas de
caution personne physique avec une assurance loyers impayés sauf étudiant ou apprenti, identité des signataires
(*trois points vérifiés le 17/10/2026*). Un propriétaire sans « N° de mandat de gestion » est signalé, sans blocage.
Plafonds, dates DPE et TVA sont des **réglages datés**, jamais écrits dans le code.

**Rien n'est perdu.** Tout se fait par ajout ; l'historique des mails (173 894 rattachements) ne bouge pas.

**Découpage** : L0 livré (369) puis 9 lots **L1 → L9**, migrations **370 → 378**. **Premier lot proposé : L1
« Loyer de départ, taux et honoraires de gestion »**, utile tout de suite dans la Gestion, sans attendre la tuile
Location (§9.1, à valider avant tout code). **Deux questions** restent (§12) : un export WIPPIMMO des loyers en cours,
et qui voit les honoraires de l'agence.

---

## 1. Le besoin, tel qu'exprimé [Arno]

- Tuile « Location » pour l'équipe location : prospecter, estimer, trouver propriétaires bailleurs et locataires,
  créer les dossiers.
- Location et Gestion travaillent sur LE MÊME fichier unifié : mêmes personnes, mêmes biens, même base. Chacune peut
  modifier les coordonnées et ajouter des personnes dans chaque catégorie, sous forme de cartes identiques à celles de
  la Gestion.
- Créer un propriétaire = créer le propriétaire ET le(s) bien(s) confié(s) ; ajouter des biens au fil de la relation.
  Chaque bien : un ou plusieurs locataires, changements de locataire (en place + anciens).
- Toutes les coordonnées habituelles.
- Fiche du bien : adresse, étage, surface Carrez + extérieure, n° de porte, n° de lot de copropriété ; annexes (cave,
  parking) avec étage, n° de lot, n° de porte ou de place.
- Annexe rattachée par principe à son logement (vaisseau mère) ; dissociable (parking loué à un autre) SANS JAMAIS
  perdre le lien de parenté.
- Outil clair, structuré, simple ; clics au strict nécessaire.
- La fiche papier « Nouveau dossier » est intégrée au processus de création (§4.6, transcription intégrale).
- **Réponses du 17/10/2026** :
  1. WIPPIMMO **garde** les quittances et la comptabilité ; aucune comptabilité ni quittance dans l'outil ; le
     rapprochement par l'import (L0) fait le lien sans doublon.
  2. Registre des mandats **hors périmètre** (logiciel dédié) ; seulement un champ « N° de mandat de gestion » par
     propriétaire : texte libre, facultatif, saisi à la main, jamais généré ni numéroté par l'outil.
  3. **Aucune pièce** pour les candidats (statut seulement) ; documents classés seulement pour les locataires retenus
     qui occupent un logement, rattachés au locataire et à son bail à partir de la signature.
  4. Honoraires de location : barème légal par défaut (réglage daté par zone), **modifiable location par location**,
     affiché « modifié ». À l'entrée : **loyer mensuel de départ** et **taux de gestion (%)**, rangés sur la location,
     affichés sur la carte du locataire et sur le bien, historique conservé à chaque changement de locataire.
     **Honoraires de gestion** = loyer × taux, par lot, par propriétaire, total agence, mensuel et annuel.
  5. Signature électronique **hors périmètre** (Yousign) : l'outil produit les PDF et permet de joindre le PDF
     signé ; intégration Yousign = évolution possible.

---

## 2. Reconnaissance du code (étape A — vérifiée dans le dépôt et en base locale)

### 2.1 Ce qui existe

| Objet | Table (lignes en base locale) | Clé qui porte l'historique | Constat |
|---|---|---|---|
| Propriétaire | `gestion_annuaire_proprietaire` (313) | `wippimmo_id` (UNIQUE ; `app-…` si saisi à la main) | Pas de nature physique/morale (déduite de la civilité : 9 « Sté », 4 SCI…) ; 80 fiches « M. et Mme » |
| Locataire | `gestion_annuaire_locataire` (510) | **`cle_personne` = nom normalisé + e-mail** (506/510 contiennent un e-mail) | 116 fiches nomment deux personnes ; aucun lien avec la fiche propriétaire de la même personne (3 e-mails communs) |
| Bien | `gestion_annuaire_lot` (365) | `wippimmo_id` (tout le courrier) ; `id` interne (tâches, notes syndic) | **Aucune** surface, étage, porte, n° de lot de copro ; **aucune notion d'annexe** : 27 lots parking/garage/box autonomes |
| Co-propriétaires | `gestion_annuaire_lot_proprietaire` (17) | — | Saisis à la main, avec périodes |
| « Bail » | `gestion_annuaire_occupation` (535) | — | 1 locataire × 1 lot × entrée/sortie ; 317 en cours, 218 anciens (cartes violettes) ; **ni loyer, ni dépôt, ni garant** ; 11 chevauchements sur un même lot ; 13 locataires avec plusieurs occupations en cours (logement + parking) ; 14 sans lot |
| Coordonnées | `gestion_annuaire_contact` (1 807) | (sujet, sujet_id) polymorphe, sans FK | Écrites par l'import et par la saisie |
| Verrous d'import | `gestion_annuaire_verrou` (45) | — | Protège les champs saisis à la main… **des personnes seulement** (CHECK sujet ∈ propriétaire, locataire) |
| Contacts non clients | `gestion_contact_carte` (506), `gestion_partie_categorie` (706), `gestion_contact_externe` (2) | `lot_cle` = wippimmo du lot | « Un contact n'est jamais un client » (migr. 304) |
| Copro / syndic | `gestion_copropriete` (5), `gestion_syndic` (1)… | `cle_immeuble` = texte normalisé de l'immeuble | — |
| Courrier | `gestion_message` (58 279), `gestion_rattachement` (173 894) | `cible_cle` texte, sans FK | **Verrou historique** (migr. 339-340) : ni DELETE, ni réécriture d'un lien confirmé |
| Tâches | `gestion_tache` (6) | `lot_id` interne | Agenda Google, invitations, anti-DELETE |
| Journal | `gestion_journal` (44 932) | — | Append-only, **liste fermée d'entités** |

- Import WIPPIMMO toujours actif (3 exports : Lots, Bailleurs, Locataires ; idempotent ; rien n'est effacé, ce qui
  disparaît est marqué `absent_le`).
- Création de personne : **existe** (`creerPersonne`, `annuaireEditionRepo.ts:702-786`) mais **sans aucun contrôle de
  doublon**. Le seul dédoublonnage existant concerne les syndics.
- Écriture de l'annuaire : une seule porte, `POST /api/admin/gestion/annuaire` (modifier, créer, séparer, archiver,
  ajouter-occupant, départ…), tout journalisé. Aucun champ de bien n'est modifiable aujourd'hui.
- Droits : une colonne `perm_<module>` par collaborateur ; patron identique pour 8 tuiles (`session.ts:10`,
  `proxy.ts:34/49`, `menuAdmin.ts`, `comptes.ts`, écran des comptes).
- **Dernière migration : 369** (lot L0, 2e36daf7). Nouvelles migrations : **370 et suivantes**. Base de recette
  `svav_recette` : 365 à 369 appliquées et inscrites au registre. Base principale du Mac : 365 à 369 **non**
  appliquées (constaté en lecture le 17/10/2026) — à aligner avant d'y tester un lot.
- **Honoraires de gestion — rien dans le code ni dans la base** (lecture seule, 17/10/2026) : aucune occurrence de
  taux de gestion, d'honoraires de gestion, de « TTC » ou de « charges comprises » dans le code Gestion ; aucune
  colonne de loyer, de taux ou d'honoraires dans l'annuaire. **Mais l'export WIPPIMMO `Lots.xlsx` porte deux colonnes
  que l'import ignore** : « Tx honos » et « Base honos » (détail et conclusions au §4.9). `Locataires.xlsx` ne porte
  **aucun loyer**.

### 2.2 Verdict

- **Réutilisable tel quel** : les tables de l'annuaire (LE fichier partagé), leurs dépôts de lecture
  (`annuaireRepo.ts`) et d'écriture (`annuaireEditionRepo.ts`), les cartes (`CartesPersonnes.tsx`), copro, syndics,
  Drive, historique des mails, tâches (avec agenda), journal, patron des droits.
- **À étendre par ajout** : champs du bien, annexes, bail, caution, loyer de départ et taux de gestion, prospection, dédoublonnage, verrous
  d'import des biens.
- **Doublon à ne PAS créer** : une table de personnes ou de biens propre à Location, un second import, un second carnet
  de contacts, un second historique, un second formulaire de fiche.
- **Défauts existants trouvés** (D4, vérifiés) :
  1. ✅ **Corrigé au lot L0 (2e36daf7)** — `marquerDisparus` marquait absente **toute** ligne non présente dans
     l'export, y compris les fiches `app-…` créées à la main. Désormais une fiche de l'application n'est jamais
     marquée, et une fiche retrouvée dans l'export est rapprochée sans doublon (migration 369, `cle_import`). En
     production : 6 fiches `app-…`, 0 marquée (diagnostic d'Arno).
  2. L'import réécrit l'entrée et la sortie des occupations sans verrou (`annuaireRepo.ts:466-472`).
  3. Les tables de l'annuaire ne sont pas sous le verrou anti-suppression (339 ne couvre que mails, rattachements,
     adresses, pièces) ; l'occupation garde un `ON DELETE CASCADE` vers le locataire (migr. 253:142).

---

## 3. Recherche (étape B — sans accès web, à vérifier)

### 3.1 Métier et réglementation (B1) — conséquences retenues pour l'outil

| Sujet | Règle (résumé, à vérifier) | Conséquence dans l'outil |
|---|---|---|
| Loi Hoguet (1970) + décret 1972 | Mandat écrit préalable à toute action ; registre des mandats à numérotation continue, sans blanc, conservé 10 ans ; numéro reporté sur l'exemplaire du mandant ; fonds via compte couvert par la garantie financière ; rétractation 14 j si signé hors établissement | **Registre et numérotation : hors outil** (logiciel dédié d'Arno, 17/10/2026). L'outil garde le « N° de mandat de gestion » saisi sur le propriétaire et signale son absence à la mise en place, sans bloquer ; il produit le PDF du mandat ; dépôt « conservé par l'agence » = compte mandant |
| Loi 1989 / ALUR / ELAN | Bail type ; durée 3 ans (bailleur personne physique), 6 ans (personne morale), 1 an meublé, 9 mois étudiant, 1-10 mois mobilité ; préavis locataire 1 mois en zone tendue (tout Paris) | Fin prévue et date limite de congé calculées ; types de bail fermés |
| Honoraires | **Vérifié 17/10/2026** — plafonds imputables au locataire pour les baux signés depuis le 01/01/2026 (arrêté de fin 2025, après un gel depuis 2014) : visite + dossier + bail ≤ **12,10 €/m²** (zone très tendue, dont Paris), **10,09 €/m²** (zone tendue), **8,07 €/m²** (reste du territoire) ; état des lieux d'entrée ≤ **3,03 €/m²**. *À vérifier* : part locataire ≤ part bailleur ; rien d'encaissé avant signature | Deux lignes d'honoraires calculées sur la surface habitable, contrôlées chacune ; plafonds = **réglage daté** (zone, valeur, date d'effet), le bail lit la valeur en vigueur à sa date de signature ; jamais en dur |
| Dépôt de garantie | ≤ 1 mois HC (vide), 2 mois (meublé), 0 (mobilité) ; restitution 1 mois (EDL conforme) / 2 mois ; pénalité 10 % du loyer par mois de retard | DG pré-calculé ; échéance de restitution suivie dans l'accueil |
| GLI / Visale / caution | **Vérifié 17/10/2026** — cumul caution personne physique + assurance loyers impayés **interdit, sauf locataire étudiant ou apprenti** ; *à vérifier* : Visale est une **caution** (Action Logement) ; acte de caution distinct (montant max., durée, mention de la caution, art. 2297 C. civ.) | Objet « caution » à part ; alerte d'incompatibilité au choix, blocage à la signature ; **le contrôle prévoit l'exception** : il lit la qualité du locataire (étudiant / apprenti, champ du bail) et ne bloque pas dans ce cas |
| Diagnostics, DPE | **Vérifié 17/10/2026** — classe **G interdite à la location (nouveau bail ou renouvellement) depuis le 01/01/2025** ; **F à partir de 2028**. *À vérifier* : E en 2034 ; gel des loyers F/G ; DDT annexé ; ERP < 6 mois ; électricité/gaz si > 15 ans | Tableau de diagnostics par lot, validité calculée, blocage à la signature ; **dates d'interdiction par classe = réglage daté** (classe, date d'effet), jamais en dur |
| Assurance habitation | Attestation à l'entrée puis chaque année | Échéance par bail, relance en tâche Gestion |
| IRL, charges, EDL | Révision annuelle (prescription 1 an, pas de rétroactivité, interdite F/G) ; régularisation annuelle des charges ; EDL contradictoire | WIPPIMMO reste maître de la révision, des charges et des quittances (§5.0, décision d'Arno) ; l'outil stocke indice de base et date anniversaire |
| Dossier candidat | Pièces limitées par le décret 2015-1437 ; interdits : n° de sécurité sociale, relevés bancaires, RIB avant signature, photo… | Aucune catégorie de pièce interdite ; **aucune pièce de candidat dans l'outil** [Arno, 17/10/2026] ; pièces classées seulement pour le locataire retenu, à partir de la signature |
| Surfaces | Bail : surface habitable (loi Boutin, écart > 5 % → baisse de loyer) ; Carrez : vente | Deux champs distincts ; le bail lit la surface habitable |
| Parking seul | Bail civil (Code civil), TVA possible, hors loi 1989 | Type « stationnement (Code civil) » |
| Encadrement (Paris) | Loyer de base ≤ loyer de référence majoré (quartier, pièces, époque, meublé) ; complément justifié, interdit si DPE F/G ; mentions au bail ; dernier loyer du précédent locataire ; ⚠️ expérimentation jusqu'au 25/11/2026 sauf prorogation | Référentiel versionné ; contrôle et mentions automatiques ; veille sur la date |
| RGPD (référentiel CNIL gestion locative, 2021) | Candidats non retenus : 3 mois ; locataire : bail + prescription (3 ans) ; comptabilité 10 ans ; registre des mandats 10 ans | Comptabilité et registre hors outil ; aucune pièce de candidat, donc aucun dossier à détruire ; politique de conservation au §4.8 |
| SEPA | Prélèvement jamais imposé ; mandat SEPA après signature | « Prélèvement » = choix du locataire ; RIB jamais dans un dossier candidat |

### 3.2 Logiciels du marché (B2)

- **Trois familles** : ERP d'administration de biens (Crypto, ICS, Gercop, Seiitra, AC3 — structure riche, ergonomie
  datée), CRM de transaction (Hektor, Apimo, Netty — l'annexe y est un simple attribut), SaaS récents (Rentila,
  Lockimmo, Ublo — assistants, mobile, profondeur variable). Le point faible récurrent : **le passage location →
  gestion, source de doubles saisies**.
- **WIPPIMMO (constaté dans les exports)** : le lot est le pivot ; le lot désigne son propriétaire **par son nom**
  (homonymes impossibles à trancher) ; le locataire est exporté par occupation, sans clé personne ; aucune quote-part,
  garant, loyer ni surface.
- **Patrons copiés** : annexe = lot à part entière, louable seule ; bail multi-lots ; plusieurs propriétaires avec
  quote-part ; une seule fiche par personne ; calculs automatiques à l'entrée ; sortie guidée (solde, restitution DG).
- **Pièges évités** : lier par un nom ; annexe en attribut ; une fiche par rôle ; double saisie location/gestion ;
  effacer à la fin d'un bail ; un seul propriétaire par lot ; confondre lot de copropriété et lot de gestion.

### 3.3 Ergonomie « moins de clics » (B3) — 12 règles retenues

1. Une page par dossier, en sections (pas d'assistant pas à pas) ; une seule colonne sur téléphone.
2. Le minimum pour exister : un nom ou un téléphone (personne) ; une adresse (bien) ; bien + locataire + date + loyer
   (bail).
3. Brouillon automatique, rien ne se perd.
4. Un seul champ « chercher ou créer » (touche « / » au bureau) ; Entrée crée quand rien n'est trouvé.
5. Dédoublonner sans bloquer : « cette coordonnée est déjà sur la fiche X » ; fusion manuelle, journalisée, réversible.
6. Créer l'objet lié sur place (un seul niveau de panneau, jamais de fenêtres empilées).
7. Ne jamais faire ressaisir (adresse BAN, adresse héritée par les annexes, bailleur repris du bien).
8. Valeurs par défaut justes, visibles, modifiables ; une valeur modifiée n'est plus recalculée.
9. Annexes en arbre visible ; « dissocier » ≠ « supprimer ».
10. Le bon clavier par champ (téléphone, e-mail, décimal) ; « Suivant » enchaîne les champs.
11. Cibles ≥ 44 px, rien qui n'apparaisse au seul survol, bouton principal sous le pouce.
12. Mesurer avant d'affirmer : grille de comptage figée (§6).

---

## 4. Modèle de données (v2, après critiques)

Principes : **tout par ajout** ; aucune clé existante ne change de format ni de valeur ; aucune suppression (verrou
anti-DELETE étendu) ; les nouvelles tables portent le préfixe `gestion_` (même espace que l'annuaire).

### 4.1 Personnes

- `gestion_personne` [proposé] — l'identité unique : `nature` (physique | morale | groupe), civilité, nom, prénom,
  raison sociale, forme (SCI, SARL…), représentant légal (personne_id), date et lieu de naissance, situation
  (marié, pacsé, autre), mesure de protection et qui signe. Tout est facultatif à la saisie ; ce que la signature
  exige est vérifié au moment de signer.
  - `groupe` = une fiche « M. et Mme » telle qu'elle existe aujourd'hui (80 + 116) : utilisable partout, mais la
    signature d'un bail ou d'une caution exige des personnes individuelles → « Séparer » (geste existant) proposé à
    ce moment-là, jamais avant.
- **Les tables existantes deviennent des rôles** : `personne_id` ajouté à `gestion_annuaire_proprietaire` et
  `gestion_annuaire_locataire`. Elles gardent leurs clés (`wippimmo_id`, `cle_personne`), qui portent l'historique
  des mails.
- `gestion_annuaire_tiers` [proposé] — les rôles qui n'existaient pas : `garant`, `candidat`, `prospect`
  (propriétaire pas encore sous mandat). Clé **opaque** `app-<uuid>`, jamais nom + e-mail (RGPD : une clé ne doit pas
  contenir de donnée personnelle).
- **Coordonnées : restent sur les lignes de rôle** (décision D4-I2) ; la fiche personne affiche l'union des rôles
  (dédoublonnée par valeur). Une coordonnée ajoutée depuis la fiche personne s'écrit sur chacun de ses rôles en une
  transaction. `gestion_annuaire_contact.sujet` accepte `tiers`.
- **Fusion** : `gestion_personne_fusion` (absorbée, absorbante, le, par, défaite_le) en ajout seul ; profondeur 1
  (on ne fusionne pas vers une fiche déjà fusionnée) ; vue `gestion_personne_active`. Jamais de fusion automatique.
- **Dédoublonnage à la saisie** : recherche par e-mail (minuscules) et téléphone (E.164, `libphonenumber-js` déjà
  présent) dans les coordonnées ; message « cette coordonnée est déjà sur la fiche X » ; liste d'adresses
  « intermédiaires » (notaire, syndic, curateur, agence) jamais proposées au rapprochement ; aucune contrainte
  UNIQUE sur une valeur de coordonnée.

### 4.2 Biens et annexes [Arno]

- Colonnes ajoutées à `gestion_annuaire_lot`, **toutes facultatives** : `categorie` (logement | cave | parking | box |
  local | autre — défaut déduit de nature/type WIPPIMMO), `etage`, `porte` (porte ou n° de place), `num_lot_copro`,
  `batiment`, `surface_carrez_m2` [Arno], `surface_exterieure_m2` [Arno], `surface_habitable_m2` [proposé : la seule
  valable au bail], `pieces` [proposé : encadrement], `meuble` [proposé], `epoque_construction` [proposé :
  encadrement], `regime_local` (permis de louer) [proposé], `pno` [proposé], `origine` (import | app), `perimetre`
  (gere | prospection | hors_gestion) [proposé : les biens prospectés ne doivent pas polluer les listes ni le
  rattachement automatique du courrier de la Gestion].
- `gestion_lot_piece` [proposé, D2] : surfaces pièce par pièce (nom, m²), dont la somme est **proposée** en surface
  habitable.
- `gestion_lot_annexe` [Arno, forme D4-I5] — le lien de parenté **avec son histoire** : (annexe_id, parent_id,
  depuis, jusqu_a, motif, pose_par). Index unique partiel « une annexe a un seul parent en cours » ; CHECK annexe ≠
  parent ; trigger : profondeur 1 (pas d'annexe d'annexe), parent de catégorie logement ou local.
  - **Louer séparément ne touche jamais ce lien.** Il ne se clôt que pour une **vente séparée** ou une **erreur**
    (motif obligatoire) — et même clos, il reste lisible : « rattachée au n° 315 du … au … ».
- `gestion_lot_filiation` [proposé, D4-I6] : fusion de deux studios / scission d'un appartement (ancien → nouveau),
  l'ancien lot archivé, ses mails intacts.
- `gestion_lot_diagnostic` [proposé] : type, date, résultat (classe DPE, n° ADEME), validité calculée, document
  (stockage objet).
- `gestion_lot_acces` [proposé, D2] : digicode, interphone, clés, gardien — visible seulement des collaborateurs
  Location / Gestion, digicode masqué par défaut.
- `gestion_lot_photo` [proposé, D2] : photos prises sur le terrain (catégorie : pièce, cave, compteur, document),
  fichiers en stockage objet, jamais en base.
- Propriété : `gestion_annuaire_lot_proprietaire` étendue de `droit` (pleine propriété | usufruit | nue-propriété |
  indivision) et `quote_part` (facultative). **Une seule règle de lecture** : vue `gestion_v_lot_proprietaire_a_date`
  (les lignes manuelles font foi si elles existent, sinon le propriétaire de l'import) ; le mandant d'un mandat n'est
  jamais lu comme propriétaire.
- Verrous d'import : le CHECK de `gestion_annuaire_verrou` accepte `lot` et `occupation` ; l'import des lots lit les
  verrous (une adresse corrigée dans l'application n'est plus écrasée).

### 4.3 Prospection et estimation [Arno : « prospecte, estime »]

- `gestion_affaire` [proposé, D2] : une piste de mandat — personne (prospect ou propriétaire), bien(s), étape
  (piste | rendez-vous | estimation remise | mandat signé | perdu + motif), source (recommandation, boîtage, appel
  entrant, pige, ancien client), agent, **prochaine action datée**.
- **Relances et visites = tâches existantes** (`gestion_tache`, qui a déjà l'agenda Google et les invitations),
  avec une `sorte` ajoutée : relance | visite | rendez-vous. Aucune seconde mécanique d'agenda.
- `gestion_estimation` [proposé, D2] : bien, date, loyer de référence et majoré (lus dans le référentiel
  d'encadrement versionné), loyer proposé, commentaire, PDF remis au propriétaire. Historique daté, jamais écrasé.
- `gestion_candidature` [proposé, D2] : candidat × bien, visite (tâche), statut (intéressé | dossier envoyé | complet |
  retenu | refusé + motif dans une liste fermée), critères de recherche (budget, surface, secteur, date). **Aucune
  pièce de candidat dans l'outil** [Arno, 17/10/2026] : on suit seulement le statut ; la liste des pièces autorisées
  s'envoie en un geste par le rédacteur de mails existant, et ce que le candidat envoie reste dans le courrier.
- `gestion_note` [proposé, D2] : note rapide horodatée et signée sur une personne, un bien ou une affaire (la dictée
  du clavier du téléphone suffit).

### 4.4 Mandat — réduit au « N° de mandat de gestion » et au PDF [Arno, 17/10/2026]

**Hors périmètre** : le registre des mandats, sa numérotation et tout contrôle de continuité (Arno a un logiciel
dédié). L'outil ne crée, ne numérote ni ne contrôle aucun mandat.

- **Un champ, et un seul** : `numero_mandat_gestion` (texte libre, facultatif) sur `gestion_annuaire_proprietaire`.
  Saisi à la main dans la fiche du propriétaire (et sur la page « Nouveau propriétaire + bien ») ; jamais généré, jamais
  incrémenté, jamais vérifié (ni format, ni unicité) ; journalisé à chaque modification. WIPPIMMO ne l'exporte pas :
  l'import ne le lit ni ne l'écrit.
- **Le PDF du mandat** : produit à la demande depuis la fiche du propriétaire, ses biens et quelques conditions saisies
  au moment de le produire (type location / gestion, durée, honoraires de location, taux de gestion). Il est rangé
  comme un document (`gestion_document`, §4.5) ; le PDF signé dans Yousign s'y joint.
- **Le pont vers la Gestion** n'est plus « un mandat actif » mais le **périmètre du bien** (`perimetre`, §4.2) :
  « géré » est proposé dès qu'un N° de mandat de gestion est saisi sur le propriétaire, et se choisit sinon en un
  geste. Les 365 biens actuels restent « gérés » d'après les dates WIPPIMMO (rien ne change pour eux).
- **À la mise en place d'un bail** : propriétaire sans N° de mandat de gestion → **alerte, jamais blocage**.
- Supprimés de l'étude : `gestion_mandat`, `gestion_mandat_mandant`, `gestion_mandat_lot`, `gestion_mandat_compteur`,
  `gestion_mandat_registre`, `gestion_mandat_registre_evenement`, `numero_historique`.

### 4.5 Bail [Arno + cadre tranché, revu par D1-B1/B4/B5/B7 et D4-B3/B6/B7]

- `gestion_bail` : qualité du locataire étudiant ou apprenti (oui/non — lue par le contrôle caution + assurance loyers
  impayés, *vérifié 17/10/2026*) ; type (vide | meublé | étudiant | mobilité | Code civil — personne morale ou résidence secondaire |
  stationnement Code civil), date de signature, date d'effet (= date d'entrée, une seule date), fin prévue
  **calculée** (type + nature du bailleur), date limite du congé du bailleur, statut **stocké** limité à brouillon |
  signé | annulé (« en cours » et « terminé » sont **dérivés** des dates), `origine` (app | reprise), mentions
  d'encadrement (référence, référence majorée, complément et justification, loyer du précédent locataire et date du
  dernier versement), indice IRL de base et trimestre.
- ~~`gestion_bail_loyer`~~ → remplacé par **`gestion_location_conditions`** (§4.9, livré au lot L1, AVANT le bail) :
  loyer mensuel de départ, provisions et taux de gestion **par location** (une occupation = un lot × un locataire),
  en ajout seul. Le bail (L6) lit et écrit cette même table : une seule vérité du loyer de départ. Les révisions
  restent dans WIPPIMMO (§5.0).
- `gestion_document` [v3] : les PDF de l'outil et les PDF signés — sorte (mandat | bail | dossier d'entrée | pièce du
  locataire), propriétaire / bail / locataire concernés, paramètres figés au moment de la production, identifiant du
  fichier dans le **dossier Drive du bien** (arborescence existante, sous-dossier du locataire ; la base ne garde que
  l'identifiant), signé oui / non et date. Les pièces ne concernent que le **locataire retenu**, à partir de la
  signature [Arno] ; jamais un candidat. Rien n'est écrit dans « Documents clients scannés ».
- `gestion_bail_lot` : lots du bail (logement + annexes, ou parking seul), période (`daterange`), part de loyer
  facultative. **Contrainte d'exclusion** (`btree_gist`) : un lot ne peut pas être dans deux baux actifs dont les
  périodes se chevauchent. Les 11 chevauchements existants restent visibles dans une liste à trancher (les baux repris
  ne sont actifs qu'une fois validés).
- `gestion_bail_partie` : personne × rôle (**bailleur** | locataire | colocataire), FK vers la ligne de rôle adéquate
  (CHECK de cohérence rôle ↔ FK), **date d'entrée, date de sortie, motif** (signature, avenant, transfert art. 14,
  congé, décès, vente du bien), **fin de solidarité** (colocataire parti : 6 mois). Changer de bailleur (vente,
  succession) ou de colocataire **ne clôt pas** le bail.
- `gestion_caution` [D1-B7] : garant (personne) ou Visale (n° de visa, validité), bail, colocataire garanti, montant
  maximal, durée déterminée ou non, date de signature, résiliation et date d'effet (pour l'avenir seulement).
- `gestion_conge` [D1-B6] : auteur (locataire | bailleur), forme (recommandé, commissaire de justice, remise contre
  émargement), date de réception, préavis calculé (1 mois en zone tendue / meublé, 3 mois sinon) et motif de préavis
  réduit, date de fin.
- `gestion_etat_des_lieux` [D1-I8, minimal] : entrée | sortie, date, document, clés remises, index des compteurs.
- `gestion_restitution_dg` [D1-B6] : date de l'état des lieux de sortie, échéance légale calculée (1 ou 2 mois),
  retenues et justificatifs, date de restitution — échéance affichée dans l'accueil.
- **Occupation = projection du bail** (D4-B3) : à la mise en place, une ligne `gestion_annuaire_occupation` par
  locataire × lot, avec `bail_id`, et ses conditions (loyer de départ, taux) dans `gestion_location_conditions`. Un trigger refuse toute écriture de entrée/sortie d'une occupation qui a un
  `bail_id`, hors des fonctions du bail ; l'import ne touche plus ces lignes. Les cartes « locataire en place /
  anciens » de la Gestion marchent sans changement.

### 4.6 Dossier d'entrée — la fiche papier « Nouveau dossier » [Arno]

`gestion_bail_entree` (1-1 avec le bail), **tous les champs de la fiche papier** :

| Fiche papier [Arno] | Dans l'outil | Défaut |
|---|---|---|
| Locataire NOM Prénom, coordonnées | Parties du bail (fiche personne, cartes existantes) | — |
| Propriétaire NOM Prénom, coordonnées | Bailleur, repris du bien | repris |
| Adresse logement | Lots du bail | repris |
| Date d'entrée du locataire | `date d'effet` du bail (une seule date) | — |
| Dépôt de garantie : conservé par l'Agence / reversé au Bailleur | Choix | réglage agence |
| Prélèvement : OUI au 5 / au 10 / NON | Choix (toujours celui du locataire) | réglage agence |
| Garants personne physique : OUI / NON | Déduit des cautions, modifiable | déduit |
| Assurance Loyers Impayés : GLI (préciser) / VISALE / Autres | GLI (assureur) / Visale (→ caution) / Autre / **Aucune** [proposé : absent de la fiche, nécessaire] | réglage agence |
| Entretien à prévoir : Chaudière / Ramonage / Autres | Cases + texte | repris du bail précédent du lot |
| Honoraires locataire : compte bancaire agence / gestion | Choix (libellés de la fiche conservés) | réglage agence |
| Honoraires propriétaire : compte bancaire agence / gestion | Choix | réglage agence |
| Sommes dues à l'entrée : prorata loyer, prorata provisions/charges, dépôt de garantie, honoraires agence | **Calculées** (prorata au jour exact du mois, sans arrondi intermédiaire ; honoraires = barème × surface habitable, en deux lignes, plafonnés par le **réglage daté** en vigueur à la date de signature — 12,10 €/m² et 3,03 €/m² à Paris au 01/01/2026, *vérifié 17/10/2026*) et **modifiables** : deux colonnes par somme, `_calcule` (toujours recalculé) et `_saisi` (si modifié) ; affiché = saisi sinon calculé ; marque « modifié » | calculé |
| — | [Arno, 17/10/2026] **Honoraires de location** : barème légal par défaut (réglage daté par zone, valeur en vigueur à la date de signature), **modifiable pour ce bail** ; la valeur propre au bail s'affiche « modifiée » face au barème (« 450,00 € — modifié, barème : 498,52 € ») | barème |
| — | [Arno, 17/10/2026] **Loyer mensuel de départ** (HC) et **provisions** : ceux des Conditions, rangés sur la location (`gestion_location_conditions`, un enregistrement par lot loué) | saisis |
| — | [Arno, 17/10/2026] **Taux de gestion (%)**, hors taxes, base charges comprises (§4.9) ; honoraires de gestion mensuels affichés HT et TTC | taux de la location précédente du lot, sinon taux WIPPIMMO du lot, sinon réglage agence |
| Mode de règlement : Chèque / Virement / Autres | Choix | réglage agence |
| Commentaires | Texte | — |
| — | [proposé, D1-C6] Remise : clés, badges, index des compteurs, attestation d'assurance reçue | — |

- Les **réglages agence** (défauts) se modifient dans l'écran Réglages, sans code (exigence transverse « pilotage
  sans code »).
- **PDF** imprimable, même ordre que la fiche papier, généré côté serveur (`pdfkit`, déjà utilisé) ; de même le PDF
  du bail et celui du mandat. **Signature : hors outil** [Arno] — les PDF partent dans Yousign à la main ; « Joindre le
  PDF signé » range la version signée dans `gestion_document` (dossier Drive du bien). Tant qu'un bail mis en place n'a
  pas son PDF signé, l'accueil l'indique (« PDF signé à joindre »). *Évolution possible, non prévue* : envoi direct à
  Yousign et retour automatique du PDF signé (service tiers, clé d'API, coût) — un lot à part le jour venu.
- ⚠️ Méthode du prorata (jours réels du mois, terme à échoir) à **aligner sur WIPPIMMO** : le premier avis d'échéance
  doit tomber sur le même montant (vérification au lot L7).

### 4.7 Droits

- Migration : `perm_location` sur `admin_utilisateur`, administrateurs à vrai (calque de 228). Tuile « Location »
  cochée par collaborateur dans l'écran des comptes, comme les autres.
- Routes `/api/admin/location/*` qui **réutilisent les dépôts communs** : un collaborateur « Location seule » ne voit
  pas le courrier de la Gestion. Un collaborateur qui a les deux tuiles voit tout.
- Liste fermée du journal étendue (`personne`, `bail`, `location_conditions`, `document`, `lot_annexe`, `affaire`…) dans la migration qui crée
  chaque entité.

### 4.8 RGPD (tranché par l'étude)

- **Clés opaques** pour tout ce que la Location crée (`app-<uuid>`), jamais nom + e-mail.
- **Candidats** [Arno, 17/10/2026] : **aucune pièce** dans l'outil, seulement la fiche et le statut. Le lot et les
  règles de destruction des dossiers de candidats non retenus sont **supprimés** de l'étude (il n'y a plus de dossier
  à détruire). ⚠️ Reste vrai hors outil : la fiche d'un candidat non retenu (nom, coordonnées, statut) est une donnée
  personnelle, que le référentiel CNIL limite à 3 mois (*à vérifier*) ; voir risque 7 (§10).
- **Locataires retenus** : leurs pièces sont classées à partir de la signature, rattachées au locataire et à son bail
  (`gestion_document`, dossier Drive du bien) ; conservation durée du bail + 3 ans (prescription), puis archivage.
  Comptabilité (10 ans) et registre des mandats : hors outil.
- **Données interdites** : aucune catégorie de pièce ni champ pour n° de sécurité sociale, relevés bancaires, RIB avant
  signature, santé, casier.
- Motifs de refus de candidature dans une liste fermée (preuve de non-discrimination) ; pas de commentaire libre
  visible sur un candidat refusé.

### 4.9 Loyer de départ, taux de gestion et honoraires de gestion [Arno, 17/10/2026]

**Ce que disent les données (lecture seule, 17/10/2026).** Le code Gestion n'a aucun taux ni aucune règle
d'honoraires (§2.1). L'export WIPPIMMO `Lots.xlsx` (25/09/2026, 365 lots, tous en gestion) porte deux colonnes que
l'import ignore aujourd'hui (comptes seulement, aucun nom lu) :

| « Tx honos » | 4,5 | 5,83 | 4 | 3,75 | 3,5 | 4,17 | 0,83 | 5 | 2,5 | 3,67 | autres (7 valeurs) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| lots | 191 | 88 | 33 | 12 | 9 | 9 | 4 | 4 | 3 | 3 | 9 |

| « Base honos » | LCDTA | LCDA | LCTA | LCDT | L |
|---|---|---|---|---|---|
| lots | 352 | 5 | 4 | 2 | 2 |

- **Taux hors taxes — déduit, pas deviné.** Les taux « bizarres » sont exactement des taux TTC ronds divisés par 1,2 :
  5,83 = 7 / 1,2 ; 4,17 = 5 / 1,2 ; 0,83 = 1 / 1,2 ; 6,67 = 8 / 1,2 ; 3,67 = 4,4 / 1,2 ; 2,5 = 3 / 1,2 ; 4,5 =
  5,4 / 1,2. L'inverse (TTC stocké) donnerait des taux HT non ronds (5,83 / 1,2 = 4,858…). **WIPPIMMO stocke donc
  des taux HT** ; 3,75 et 4,5 sont le même taux exprimé HT de 4,5 % TTC et de 5,4 % TTC.
- **Base charges comprises.** La base est un code de lettres ; « L » seul (2 lots) contre « LCDTA » (352) fait lire
  L = loyer et C = charges. **363 lots sur 365 incluent C** : le taux s'applique au loyer **et** aux provisions. Les
  lettres D, T et A ne sont pas identifiées avec certitude (elles visent des sommes que l'outil ne connaît pas : il
  n'en a pas besoin).
- **Défauts proposés** (aucun ne nécessite de question) :
  - taux saisi et affiché **HT**, honoraires montrés **HT et TTC** ; TVA = **réglage daté** (20 % au 17/10/2026) ;
  - base = **loyer HC + provisions** (charges comprises), réglage agence modifiable (HC seul possible) ;
  - taux d'une nouvelle location = celui de la **location précédente du lot**, sinon le **« Tx honos » WIPPIMMO du
    lot** (repris par l'import, en lecture), sinon le réglage agence **4,5 % HT** (valeur la plus fréquente,
    191 lots) ; toujours modifiable.

**Le modèle.**
- `gestion_location_conditions` : (occupation_id, depuis, loyer_hc, provisions, taux_gestion_ht, base, motif
  entrée | correction, origine saisie | reprise, saisi_par, saisi_le), en **ajout seul** — une correction ajoute une
  ligne, la précédente reste lisible. Une **location** = une occupation (un lot × un locataire) : la cave ou le
  parking loués avec le logement ont chacun leur ligne (loyer souvent 0, ou part de loyer), ce qui donne les honoraires
  **par lot** demandés. Un changement de locataire ouvre une nouvelle occupation, donc de nouvelles conditions :
  l'**historique est conservé par construction**.
- `gestion_annuaire_lot` + `taux_honos_wippimmo`, `base_honos_wippimmo` : écrits par l'import (référence WIPPIMMO,
  jamais modifiés à la main, jamais lus comme vérité de la location).
- Montants en `numeric` sans échelle ; aucun arrondi de calcul (affichage au centime seulement).

**Le calcul.** Honoraires de gestion mensuels d'une location = (loyer HC + provisions) × taux HT ; TTC = HT × (1 +
TVA du réglage en vigueur). Exemple : (1 180 + 90) × 4,5 % = **57,15 € HT**, 68,58 € TTC par mois.
- **Mois** : chaque location en cours compte au prorata de ses jours dans le mois (entrée ou sortie en cours de mois).
- **Année** : somme des 12 mois de l'année civile choisie (ou des 12 derniers mois).
- **Par lot**, **par propriétaire** (propriétaire à date, vue unique §4.2 ; en indivision, le lot compte entier pour
  chaque fiche avec la mention « indivision », jamais réparti au jugé) et **total agence**.
- C'est un montant **théorique, sur le loyer de départ** : ni encaissé, ni révisé. WIPPIMMO reste la vérité
  comptable (décision 1). L'écran le dit en toutes lettres.
- Les locations **sans loyer saisi** sont comptées à part (« N locations sans loyer de départ ») au lieu de valoir 0
  en silence. Au départ, ce sera **317 sur 317** : aucune location en cours n'a de loyer dans l'annuaire (WIPPIMMO ne
  l'exporte pas, question 1).

**Où ça s'affiche.** Carte du locataire (Gestion et Location) : « Loyer de départ 1 180 € HC + 90 € · taux 4,5 % HT
· 57,15 € HT/mois », modifiable en un geste. Fiche du bien : location en cours et **historique** (chaque locataire avec
son loyer de départ, son taux, ses dates). Écran **Honoraires de gestion** (maquette 7) : bascules Lot / Propriétaire
/ Agence et Mois / Année, total en tête, export tableur.

---

## 5. Écrans et parcours

### 5.0 Qui est maître de quoi (décision écrite, D1-B3)

| Donnée | Maître en v1 | Pourquoi |
|---|---|---|
| Identité, coordonnées, biens, annexes, surfaces, diagnostics, accès | **L'application** (créée par Location ou Gestion) ; l'import WIPPIMMO ne réécrit plus un champ saisi (verrous), et rapproche au lieu de dupliquer (§9 L0) | C'est le besoin d'Arno : un fichier commun modifiable des deux côtés |
| Registre et numérotation des mandats | **Logiciel dédié d'Arno** (hors outil) | Décision 2 ; l'outil garde le seul « N° de mandat de gestion » saisi |
| Bail à la signature : conditions, dossier d'entrée, sommes dues, cautions, loyer de départ, taux de gestion | L'application, figé après la mise en place | La fiche papier devient numérique |
| Signature des PDF | **Yousign** (hors outil) | Décision 5 ; l'outil range le PDF signé |
| Honoraires de gestion | L'application, **en théorique** (loyer de départ × taux) | Décision 4 ; le réel encaissé reste dans WIPPIMMO |
| Quittancement, avis d'échéance, loyer en vigueur après révision, charges, comptabilité mandant | **WIPPIMMO** | **Décision 1 d'Arno** : il produit les quittances ; aucune comptabilité dans l'outil |

**Conséquence assumée** : un nouveau locataire est aussi saisi dans WIPPIMMO pour être quittancé ; au prochain import,
la fiche créée dans l'outil est **rapprochée** (L0, livré : même nom + une coordonnée commune + une seule candidate),
jamais doublée.

### 5.1 Écrans (maquettes dans `.captures/location-etude/`)

1. **Accueil Location** (`01-accueil-location.html`) : « Chercher ou créer » (curseur déjà dedans, « / » au bureau ;
   recherche tolérante : fragment de téléphone, numéro + rue partielle, prénom seul) ; boutons directs « + Propriétaire
   & bien » et « + Locataire & bail » ; « + Prospect / Candidat / Visite / Estimation » ; **Aujourd'hui** (visites,
   relances, restitutions de dépôt, attestations d'assurance) en tête ; biens à louer (bouton **Louer** sur chaque
   ligne) ; mes prospects ; baux en préparation ; échéances ; **« PDF signé à joindre »** (baux mis en place sans leur
   PDF signé). Sur téléphone : Aujourd'hui d'abord, bouton « + » flottant.
2. **Fiche personne / fiche locataire** (`02-fiche-personne.html`) — composant COMMUN aux deux tuiles : identité,
   coordonnées (cartes existantes, boutons Appeler / SMS / Écrire), note rapide, rôles (ses biens, ses baux, ses
   cautions). **Carte de la location** : loyer de départ, taux de gestion, honoraires mensuels HT / TTC, modifiable ;
   ses pièces (locataire retenu seulement) et le PDF signé. Pour un propriétaire : champ **« N° de mandat de
   gestion »** (texte libre). Bandeau « cette coordonnée est déjà sur la fiche X ». Boutons : **+ Ajouter un bien**,
   Séparer, Fusionner.
3. **Fiche bien** (`03-fiche-bien.html`) — COMMUNE : arbre logement → annexes, déplié ; « + Cave / + Parking /
   + Autre annexe » en une ligne (curseur dans le n°, 📷 pour la plaque) ; menu ⋯ d'une annexe : **Louer séparément**,
   Remettre avec le logement, Rattacher à un autre logement (vente séparée ou erreur) ; caractéristiques et
   diagnostics ; accès ; **locations : en cours et historique, chacune avec son loyer de départ, son taux et ses
   honoraires de gestion** ; congé, restitution ; candidats (statut seul) ; estimation. Boutons : **Louer**,
   **Estimer le loyer**, 📷 Photo, + Visite, **Clore et relouer** (sur le bail en cours).
4. **Bail + dossier d'entrée** (`04-bail-dossier-entree.html`) : UNE page à sections (Lots · Bailleur, locataires,
   garants · Conditions · **Gestion (taux, honoraires)** · Dossier d'entrée · Sommes dues · Remise des clés),
   brouillon automatique, boutons segmentés, encadrement vérifié en direct, honoraires de location « modifiés » face au
   barème. Barre du bas : **« Produire les PDF »** (bail + dossier d'entrée), **« Mettre en place »** (contrôles listés,
   récapitulatif, confirmation), puis **« Joindre le PDF signé »** une fois signé dans Yousign.
5. **Nouveau propriétaire + bien** (`05-creation-proprietaire-bien.html`) : UNE page ; seul un nom ou un téléphone est
   obligatoire ; adresse BAN avec « 📍 Ici » ; annexes à adresse héritée ; champ **« N° de mandat de gestion »**
   (texte libre, facultatif) et périmètre **Géré / Prospection** (« Géré » proposé dès qu'un N° est saisi).
6. **Le même dossier dans les deux tuiles** (`06-meme-dossier-location-gestion.html`) : mêmes blocs communs (bail,
   annexes, propriétaire, locataires) ; la Gestion ajoute courrier, événements, tâches ; la Location ajoute candidats,
   estimation, visites. Côté Gestion, le bloc « Bail en cours » porte le lien direct **Dossier d'entrée (PDF)**, et un
   badge « créé par la Location le … ».
7. **Honoraires de gestion** (`07-honoraires-gestion.html`) [Arno, 17/10/2026] — atteint depuis la Gestion et la
   Location : bascules **Lot / Propriétaire / Agence** et **Mois / Année**, total agence en tête (HT et TTC), lignes
   triables, « N locations sans loyer de départ » cliquable (pour les compléter), mention « théorique, sur loyer de
   départ — le réel encaissé est dans WIPPIMMO », export tableur.

### 5.2 Téléphone (équipe terrain, D2)

- Une colonne, sections dépliées, `inputmode` (tel, email, decimal), `enterkeyhint="next"` : « Suivant » enchaîne les
  champs ; sélecteur de date natif ; bouton principal collant en bas ; cibles ≥ 44 px.
- **Réseau faible** : brouillon conservé sur l'appareil tant que l'envoi n'a pas réussi, avec l'indicateur « non
  envoyé » ; photos envoyées en arrière-plan à la reprise du réseau. (Un vrai mode hors ligne complet est écarté :
  coût disproportionné pour le gain.)
- Création express d'un prospect ou d'un candidat : **un seul champ** (téléphone, nom ou adresse) + note.

---

## 6. Parcours clés et comptage des clics

**Grille (B3, appliquée par D3)** : 1 clic = toute activation volontaire (ouvrir une liste 1, choisir 1, cocher 1,
bouton segmenté 1, suggestion 1, Enregistrer/Valider 1, date = ouvrir 1 + jour 1) ; entrer dans un champ quand le
curseur n'y est pas = 1 ; taper du texte = 1 « champ saisi », pas un clic ; défaut accepté = 0 ; Tab au bureau d'un
champ texte au suivant = 0 ; sur téléphone « Suivant » = 0 seulement si prévu (il l'est en v2). Écran = changement de
vue principale ou panneau masquant.

**Avant / après les réponses d'Arno** (v1 = proposition initiale ; v2 = après critiques, 17/10 matin ; **v3** = après
les 5 réponses, 17/10 soir). Même grille, mêmes hypothèses.

| # | Parcours | v1 recompté (bureau / tél.) | v2 avant (bureau / tél.) | **v3 après (bureau / tél.)** | Écrans v3 | Champs v3 | Ce qui change en v3 |
|---|---|---|---|---|---|---|---|
| 1 | Nouveau propriétaire + 1 logement + cave + parking | 12 (+8 mandat) / 15 (+8) | 6 / 9 | **5 / 8** | 1 | 7 | Le mandat compact (1 clic) disparaît ; le N° de mandat se tape au clavier (Tab, 0 clic), « Géré » est alors proposé (0) |
| 2 | Ajouter un bien à un propriétaire existant | 8 / 9 | 4 / 5 | **4 / 5** | 2 | 2 | — |
| 3 | Nouveau locataire + bail + dossier d'entrée complet | 31 / 36 | 9 / 10 | **9 / 10** | 2 | 5 | Loyer de départ = loyer des Conditions (déjà compté) ; taux de gestion et honoraires de location pré-remplis (0) ; « Signer et mettre en place » devient « Produire les PDF » + « Mettre en place » + confirmer (même compte) |
| 4 | Changement de locataire (congé + sortie + nouvelle entrée) | 37 / 42 | 10 / 12 | **10 / 12** | 2 | 3 | Loyer de départ et taux repris de la location précédente (0) |
| 5 | Dissocier un parking et le louer à une autre personne | 19 / 23 | 11 / 12 | **11 / 12** | 2 | 4 | Taux du parking repris du logement (0) |
| 6 | Retrouver depuis la Gestion le dossier créé par la Location | 3 / 4 | 2 / 2 | **2 / 2** | 2 | 1 | — |
| | **Sous-total des six parcours demandés** | **110 / 129** | **42 / 50** | **41 / 49** | | | |
| 7 | **Nouveau** — joindre le PDF signé (Yousign) au bail | — | — | **4 / 5** | 2 | 0 | Décision 5 |
| 8 | **Nouveau** — honoraires de gestion d'un propriétaire sur l'année | — | — | **3 / 3** | 1 | 0 | Décision 4 |
| | **Total v3 (8 parcours)** | | | **48 / 57** | | | |

Détail v3 (bureau) :
- **P1** : « + Propriétaire & bien » 1 · nom tapé, Entrée = créer 0 · téléphone (Tab) 0 · N° de mandat de gestion
  (Tab) 0 · suggestion BAN 1 · étage (Tab) 0 · « + Cave » 1 (curseur dans le n°) · « + Parking » 1 · périmètre
  « Géré » proposé (N° saisi) 0 · Enregistrer 1 = **5**. Téléphone : + 3 entrées de champ = 8.
- **P2** : choisir la personne dans la recherche 1 · « + Ajouter un bien » 1 · puce « même immeuble que… » ou suggestion
  BAN 1 · Enregistrer 1 = **4** ; téléphone + étage = 5.
- **P3** (bail vide, GLI, sans garant ; logement + cave à louer) : « Louer » sur la ligne du bien 1 (lots, bailleur,
  type, DG, honoraires et 6 défauts agence remplis) · locataire : nom, Entrée = créer 0 · téléphone, e-mail (Tab) 0 ·
  date d'entrée 2 · loyer de départ 1 · provisions (Tab) 0 · taux de gestion pré-rempli 0 · honoraires de location au
  barème 0 · assurance « GLI » 1 · Produire les PDF 1 · Mettre en place 1 · confirmer le récapitulatif 1 = **9**
  (variante avec garant : +3 ; candidat déjà connu : « Utiliser cette fiche » 1 au lieu de 3 champs ; honoraires de
  location modifiés : +1 entrée de champ ; taux différent : +1). Téléphone : 10.
- **P4** : choisir le bien 1 · « Clore et relouer » 1 · date de réception du congé 2 (préavis et fin calculés) ·
  confirmer 1 · nouveau bail pré-rempli (lots, type, loyer = dernier loyer, provisions, DG, assurance, entretien,
  honoraires, taux de gestion) : locataire Entrée 0 · date d'entrée 2 · Produire les PDF 1 · Mettre en place 1 ·
  confirmer 1 = **10**. L'échéance de
  restitution du dépôt naît à la saisie de l'état des lieux de sortie. Téléphone : 12.
- **P5** : choisir le logement 1 · ⋯ du parking 1 · « Louer séparément » 1 → **avenant** au bail du logement : date de
  sortie du parking = date d'effet du nouveau bail (défaut) 0, nouveau loyer du bail 1 · 1 (mise au point), confirmer
  l'avenant 1 → nouveau bail (type « stationnement » déduit, taux repris du logement) : locataire Entrée 0 · date 2 ·
  loyer 1 · Mettre en place 1 · confirmer 1 = **11**. Le lien de parenté du parking n'est pas touché. Téléphone : 12.
- **P6** : chercher dans la Gestion, choisir le bien 1 · « Dossier d'entrée (PDF) » dans le bloc Bail en cours 1 =
  **2** (sur téléphone, le bloc Bail est placé avant le courrier).
- **P7** (nouveau) : dans Aujourd'hui, « PDF signé à joindre » → choisir le bail 1 · « Joindre le PDF signé » 1 ·
  choisir le fichier dans la fenêtre Drive existante 1 · Valider 1 = **4**. Téléphone : + ouvrir « Fichiers » 1 = 5.
- **P8** (nouveau) : « Honoraires de gestion » depuis le menu de la tuile 1 (vue par lot, mois en cours) ·
  « Propriétaire » 1 · « Année » 1 = **3** (le propriétaire cherché se lit dans la liste triée, ou se tape dans le
  filtre : saisie, 0 clic). Téléphone : 3.

Critère d'acceptation des lots : **six parcours demandés ≤ 41 au bureau et ≤ 49 sur téléphone ; P7 ≤ 4 / 5 ; P8 ≤ 3
/ 3**, recomptés sur l'écran réel avec la même grille (deux compteurs indépendants).

---

## 7. Tableau des critiques (étape E) — objection → décision

Légende : **R** = retenue ; **P** = retenue en partie ; **X** = rejetée (avec la raison).

### 7.1 D1 — Gestionnaire locatif

| # | Objection | Gravité | Décision |
|---|---|---|---|
| B1 | Le bail n'a pas de bailleur ; propriétaire confondu avec mandant | Bloquante | **R** — rôle `bailleur` dans les parties ; `droit` (usufruit, indivision…) sur la propriété ; mandant ≠ signataire (qualité + pouvoir) |
| B2 | Registre en conflit avec l'existant ; « numéro à compléter » interdit | Bloquante | **Caduque (décision 2 d'Arno)** — registre et numérotation hors outil (logiciel dédié) ; seul un « N° de mandat de gestion » libre sur le propriétaire |
| B3 | Deux sources de vérité pour le bail (WIPPIMMO quittance) | Bloquante | **R, tranchée (décision 1)** — WIPPIMMO garde quittances et comptabilité (§5.0) ; l'outil garde le bail signé et le loyer de départ ; L0 rapproche sans doublon |
| B4 | Bail figé alors que ses parties changent (transfert, époux, colocataire, vente) | Bloquante | **R** — parties datées avec motif et fin de solidarité ; changer de bailleur ou de colocataire ne clôt pas le bail |
| B5 | Encadrement, dernier loyer, gel F/G absents | Bloquante | **R** — mentions au bail, contrôle à la signature, référentiel versionné |
| B6 | Sortie sans congé, préavis, EDL ni restitution du DG | Bloquante | **R** — `gestion_conge`, `gestion_etat_des_lieux`, `gestion_restitution_dg`, échéance dans l'accueil |
| B7 | Garant = rôle au lieu d'acte de caution | Bloquante | **R** — `gestion_caution` (montant, durée, colocataire garanti, résiliation pour l'avenir) |
| I1 | Durée du bail selon le bailleur, congé du bailleur | Importante | **R** — fin prévue et date limite calculées |
| I2 | IRL absent | Importante | **P** — indice de base, trimestre, date anniversaire stockés ; le calcul reste dans WIPPIMMO en v1 |
| I3 | Honoraires : deux plafonds ; comptes ; rien avant signature | Importante | **R** — barème par défaut, **modifiable par bail et marqué « modifié »** (décision 4) ; deux lignes contrôlées contre les plafonds du **réglage daté** (12,10 / 10,09 / 8,07 €/m² et 3,03 €/m² au 01/01/2026, *vérifié 17/10/2026*) ; « compte agence / compte gestion » gardés comme libellés de la fiche [Arno], avec leur sens (honoraires / mandant) écrit dans l'aide |
| I4 | Autres diagnostics, DPE avant 07/2021 invalide, 9 m² | Importante | **R** — `gestion_lot_diagnostic`, blocage à la signature ; G interdit depuis le 01/01/2025, F à partir de 2028 (*vérifié 17/10/2026*), dates en **réglage daté** |
| I5 | Baux hors loi 1989 (personne morale, résidence secondaire) | Importante | **R** — types Code civil |
| I6 | Dissocier exige un avenant ; vente séparée ; TVA parking | Importante | **R** — avenant dans le geste ; motif « vente séparée » ; TVA facultative sur le bail de stationnement |
| I7 | Assurance habitation annuelle, PNO | Importante | **R** — échéance + tâche Gestion automatique ; case PNO |
| I8 | Charges et EDL absents | Importante | **P** — EDL minimal retenu ; charges hors v1 (WIPPIMMO), écrit noir sur blanc |
| I9 | Identité insuffisante pour signer | Importante | **R** — champs facultatifs, exigés à la signature |
| I10 | RGPD : anonymisation contredite par les mails conservés | Importante | **Caduque (décision 3)** — aucune pièce de candidat ; lot d'anonymisation et règles de destruction retirés ; conservation de la fiche candidat : risque 7 (§10) |
| I11 | Mandat incomplet (rétractation 14 j, rémunération…) | Importante | **P** — conditions reprises dans le PDF du mandat ; le suivi du mandat (rétractation, échéance) est dans le logiciel dédié (décision 2) |
| I12 | Visale = caution, GLI : critères et agrément | Importante | **R** — Visale dans `gestion_caution` ; GLI : assureur, contrat, date d'agrément du dossier |
| C1 | SIREN, quote-part, surface extérieure, escalier superflus | Confort | **P** — surface extérieure gardée [Arno] ; quote-part gardée facultative (indivisions) ; SIREN et escalier reportés |
| C2 | Fausses alertes sur 317 baux repris | Confort | **R** — statut « repris, à compléter », hors contrôles |
| C3 | Faux positifs du dédoublonnage | Confort | **R** — suggestion seulement, liste d'adresses intermédiaires |
| C4 | Méthode du prorata | Confort | **R** — jours réels, à aligner sur WIPPIMMO (lot L7) |
| C5 | Permis de louer | Confort | **R** — champ `regime_local` |
| C6 | Clés et compteurs | Confort | **R** — section « Remise » |

### 7.2 D2 — Agent de terrain

| # | Objection | Gravité | Décision |
|---|---|---|---|
| 1 | Prospection absente | Bloquante | **R** — `gestion_affaire` (étape, source, prochaine action), « Mes prospects » |
| 2 | Estimation absente | Bloquante | **R** — `gestion_estimation` + écran « Estimer le loyer » + PDF propriétaire |
| 3 | Relances non modélisées | Bloquante | **R** — tâches existantes (sorte « relance »), « À relancer aujourd'hui », +2 j / +1 sem / +1 mois en un geste |
| 4 | Candidat sans place | Bloquante | **R** — `gestion_candidature` (statut, critères), sans pièces |
| 5 | Visites non modélisées | Bloquante | **R** — tâche de sorte « visite » + compte rendu (note) |
| 6 | Photos et pièces sur le terrain | Bloquante | **R** — `gestion_lot_photo` (stockage objet), 📷 sur fiche bien et annexes |
| 7 | Réseau faible | Bloquante | **P** — brouillon gardé sur l'appareil + envoi différé des photos ; mode hors ligne complet écarté (coût disproportionné) |
| 8 | Création express | Importante | **R** — un seul champ |
| 9 | N° de cave lu sur la porte | Importante | **R** — curseur dans le n° + 📷 |
| 10 | Mesures pièce par pièce | Importante | **R** — `gestion_lot_piece`, somme proposée |
| 11 | Note libre, dictée | Importante | **R** — `gestion_note` |
| 12 | Appeler / écrire en un geste | Importante | **R** |
| 13 | Recherche tolérante, autour de moi | Importante | **P** — recherche tolérante retenue ; « biens autour de moi » reporté (confort) |
| 14 | Liste des pièces au candidat | Importante | **R** — modèle de mail, envoi par le rédacteur existant |
| 15 | Annonce | Importante | **X** en v1 — la diffusion est un chantier à part (portails, photos, mentions) ; les champs utiles (surfaces, DPE, encadrement, photos) existent déjà dans le modèle |
| 16 | Mandat signé sur le terrain | Importante | **P, tranchée (décision 5)** — l'outil produit le PDF ; signature dans Yousign, hors outil ; PDF signé joint ; intégration = évolution possible |
| 17 | Accueil mobile « Aujourd'hui » | Confort | **R** |
| 18 | Menu « + » élargi | Confort | **R** |
| 19 | « Ici » (géolocalisation) | Confort | **R** |
| 20 | Codes d'accès, gardien | Confort | **R** — `gestion_lot_acces`, digicode masqué par défaut |

### 7.3 D3 — Compteur de clics

| # | Objection | Gravité | Décision |
|---|---|---|---|
| 1 | Parcours 5 impossible : rien ne sort le parking du bail 1 | Bloquante | **R** — avenant intégré à « Louer séparément » + contrainte d'exclusion |
| 2 | Tableau v1 = estimation (73 contre 110/129) | Bloquante | **R** — tableau refait geste par geste ; critère d'acceptation 42 / 50 |
| 3 | P1 crée un bien invisible (« biens à louer » exige un mandat) | Bloquante | **R** — v3 : périmètre « Géré / Prospection » sur le bien (« Géré » proposé dès qu'un N° de mandat est saisi) ; un bien en prospection reste visible dans « Mes prospects » |
| 4 | Boutons nécessaires absents des écrans | Bloquante | **R** — boutons listés par écran (§5.1) et dessinés dans les maquettes |
| 5 | Double saisie date d'effet / entrée | Importante | **R** — une seule date |
| 6 | Pas d'option « Aucune » pour l'assurance | Importante | **R** |
| 7 | Aucun défaut au dossier d'entrée | Importante | **R** — réglages agence sans code |
| 8 | Pas d'entrée contextuelle vers le bail | Importante | **R** — bouton « Louer » |
| 9 | Changement de locataire = ressaisie | Importante | **R** — « Clore et relouer » |
| 10 | Listes au lieu de boutons segmentés | Importante | **R** |
| 11 | DG et honoraires non calculés | Importante | **R** |
| 12 | Mobile non spécifié | Importante | **R** — §5.2 |
| 13 | P6 s'arrête à la fiche bien | Importante | **R** — lien direct Dossier d'entrée (PDF) |
| 14 | Clé d'un locataire créé par la Location instable | Importante | **R** — clé opaque attribuée à la création, rôle créé dès le brouillon |
| 15 | Sortie : nouvelle adresse, échéance DG | Importante | **R** |
| 16-19 | Autofocus, Entrée = créer, curseur dans le n°, puces « même immeuble », entretien mémorisé | Confort | **R** |
| 20 | Raccourcis clavier ; confirmation de « Signer » à compter | Confort | **R** — « / » et Ctrl+Entrée ; confirmation comptée dans v2 |

### 7.4 D4 — Architecte des données

| # | Objection | Gravité | Décision |
|---|---|---|---|
| B1 | L'import marquera « disparu » tout ce que l'application crée | Bloquante | **R, livrée (L0, 2e36daf7)** — `marquerDisparus` ne vise plus les clés `app-…` (garde sans migration) |
| B2 | Aucun rapprochement avec le ré-export WIPPIMMO → doublons | Bloquante | **R, livrée (L0, migration 369)** — `cle_import` sur la fiche de l'application ; rapprochement seulement si même nom + une coordonnée commune + une seule candidate ; sinon fiche créée et cas signalé au rapport d'import, jamais de fusion au jugé |
| B3 | Bail et occupation : deux vérités que l'import réécrit | Bloquante | **R** — occupation = projection du bail, trigger, import tenu à l'écart |
| B4 | Regroupement des baux repris faux par construction | Bloquante | **R** — regroupement par (locataire, date d'entrée), tous lots confondus, en **proposition** validée une par une |
| B5 | Registre « continu » contredit « à compléter » et « ajout seul » | Bloquante | **Caduque (décision 2)** — plus de registre dans l'outil |
| B6 | Clés étrangères impossibles (polymorphes, 14 occupations sans lot) | Bloquante | **R** — `bail_lot.lot_id` NOT NULL FK ; parties avec FK typées + CHECK ; pas de bail repris sur un lot hors annuaire sans créer le lot |
| B7 | Rien n'empêche un lot dans deux baux en cours | Bloquante | **R** — contrainte d'exclusion ; 11 cas existants en liste à trancher |
| I1 | Les verrous ne savent pas verrouiller un lot | Importante | **R** |
| I2 | Coordonnées à la personne = double vérité | Importante | **R** — coordonnées sur les rôles ; la fiche personne lit l'union (inverse de la v1) |
| I3 | Fusion : chaînes, cycles | Importante | **R** — table de fusion, profondeur 1, vue active |
| I4 | Trois vérités de propriété | Importante | **R** — vue unique « propriétaire à date » |
| I5 | `parent_lot_id` sans historique | Importante | **R** — `gestion_lot_annexe` datée |
| I6 | Logements fusionnés ou scindés | Importante | **R** — `gestion_lot_filiation` |
| I7 | Annuaire hors verrou anti-suppression ; CASCADE | Importante | **R** — trigger anti-DELETE étendu, FK en NO ACTION (v3 : lot L2, reliquat de l'ancien L0) |
| I8 | Biens prospectés dans la table des biens gérés | Importante | **R** — `perimetre` + inventaire des lecteurs avant d'ouvrir la création |
| I9 | Fiches « couple » contre signature individuelle | Importante | **R** — nature `groupe`, séparation exigée à la signature |
| I10 | Faux positifs mesurés du dédoublonnage | Importante | **R** — formulation « cette coordonnée est déjà sur… » |
| I11 | Anonymisation impossible si courrier | Importante | **Caduque (décision 3)** — plus d'anonymisation dans l'outil ; clés opaques conservées |
| I12 | Loyer sans historique | Importante | **R** — v3 : `gestion_location_conditions` en ajout seul (loyer de départ, taux), une par location ; révisions dans WIPPIMMO |
| I13 | Calcul et saisie mélangés | Importante | **R** — colonnes `_calcule` / `_saisi`, `numeric` sans échelle |
| I14 | Statut du bail redondant | Importante | **R** — statut limité, « en cours / terminé » dérivés |
| C1-C5 | Vrais noms de tables ; journal ; clé `app-` faible ; 27 parkings ; contrôle de reprise permanent | Confort | **R** (clé `app-<uuid>` en base ; contrôle « 100 % des rattachements résolus » en test permanent) |

### 7.5 Relance des critiques ?

**Les 25 objections bloquantes sont retenues** (24 entièrement, 1 en partie : réseau faible, avec une solution
légère). Aucune ne subsiste sans réponse ; la relance prévue « si une bloquante subsiste » n'a donc pas été
déclenchée. Deux bloquantes dépendaient d'une **information** qu'Arno seul pouvait donner (dernier numéro du registre,
rôle futur de WIPPIMMO).

**Après les réponses du 17/10/2026 (v3)** : D1-B3 est tranchée (WIPPIMMO garde la comptabilité) ; D1-B2 et D4-B5
(registre) deviennent **caduques**, le registre étant hors outil ; D4-B1 et D4-B2 sont **livrées** (L0). Les réponses
**retirent** du périmètre (registre, pièces de candidats, anonymisation, signature intégrée) et n'ajoutent qu'un
sujet, les honoraires de gestion (§4.9), qui ne touche à aucune règle juridique bloquante. Aucune bloquante nouvelle
→ pas de nouvelle relance des critiques.

---

## 8. Plan de reprise des données Gestion (sans perte)

Ordre impératif ; chaque étape est rejouable et journalisée ; rien n'est supprimé.

1. ✅ **Lot 0, livré** (2e36daf7) : les fiches `app-…` ne sont jamais marquées absentes ; rapprochement sans doublon
   (369). Contrôlé sur une base jetable (4 scénarios). Restent à faire, déplacés au lot L2 : verrou anti-DELETE sur
   l'annuaire, FK de l'occupation en NO ACTION, verrous d'import `lot` et `occupation`.
1 bis. **Conditions des locations (lot L1)** : le « Tx honos » et la « Base honos » de chaque lot sont repris de
   `Lots.xlsx` par l'import (colonnes de référence). Les 317 locations en cours reçoivent ce taux comme **valeur de
   départ** (origine « reprise », modifiable) ; leur **loyer de départ reste vide** tant qu'il n'est pas saisi ou
   fourni par un export WIPPIMMO (question 1). Rien n'est inventé : sans loyer, pas d'honoraires calculés.
2. **Personnes** : une `gestion_personne` par ligne propriétaire et par ligne locataire (1-1), `personne_id` posé.
   Nature déduite (civilité société → morale ; « M. et Mme » → groupe), modifiable. **Aucun rapprochement
   automatique** ; liste « coordonnées partagées » (21 e-mails, 14 téléphones, 3 e-mails propriétaire/locataire)
   proposée à l'examen.
3. **Biens** : `categorie` déduite de nature/type ; les **27** parkings/garages/box sont **proposés** au rattachement à
   un logement du même propriétaire et du même immeuble, validés un par un.
4. **Baux repris** : regroupement **proposé** par (locataire, date d'entrée), tous lots confondus (logement + parking
   = un bail) ; statut « repris, à compléter », exclu des contrôles ; montants vides ; inactifs pour la contrainte
   d'exclusion tant qu'ils ne sont pas validés ; les 11 chevauchements listés à trancher ; les 14 occupations sans lot
   restent sans bail. Les occupations ne sont pas modifiées (seul `bail_id` s'ajoute).
5. ~~Mandats repris~~ — **supprimé** (décision 2) : aucun mandat n'est repris ; le « N° de mandat de gestion » des
   propriétaires se saisit à la main, au fil de l'eau (ou par import d'un tableau si Arno en fournit un un jour).
6. **Contrôle final et permanent** : 100 % des rattachements de mails se résolvent toujours (0 non résolu aujourd'hui) ;
   test d'intégration conservé.

Volume : environ 1 400 lignes à reprendre — faible ; le risque n'est pas le volume mais les clés (§10).

---

## 9. Lots de développement et migrations (v3 — numérotées à la suite de 369)

| Lot | Migration | Contenu | Pourquoi dans cet ordre |
|---|---|---|---|
| **L0** ✅ | **369** | **Livré (2e36daf7)** : une fiche créée dans l'application n'est jamais « absente du dernier export » ; retrouvée dans l'export, elle est rapprochée sans doublon (`cle_import`, `rapproche_le`) | Corrigeait un défaut actuel ; préalable à toute création |
| **L1** | **370** | **Loyer de départ, taux et honoraires de gestion** (détail §9.1) : `gestion_location_conditions` ; « Tx honos » / « Base honos » importés ; réglages datés (TVA) et agence (base, taux par défaut) ; saisie sur la carte du locataire ; affichage carte + fiche bien ; écran Honoraires de gestion | Décision 4 ; **utile tout de suite dans la Gestion**, sans attendre la tuile Location ni le bail ; le bail (L6) écrira dans la même table |
| **L2** | **371** | Socle Location : `perm_location`, tuile, menu, comptes, routes `/api/admin/location/*` gardées, entités du journal ; **reliquat sécurité de l'ancien L0** : anti-DELETE sur l'annuaire, FK de l'occupation en NO ACTION, verrous d'import `lot` et `occupation` | Droits et garde-fous avant toute écriture de la Location |
| **L3** | **372** | Biens et annexes : champs du bien, `perimetre`, `gestion_lot_annexe`, `gestion_lot_filiation`, `gestion_lot_piece`, `gestion_lot_diagnostic`, `gestion_lot_acces`, `gestion_lot_photo` ; fiche bien enrichie (arbre) dans les **deux** tuiles ; rattachement proposé des 27 parkings | La demande la plus visible d'Arno ; utile à la Gestion seule |
| **L4** | **373** | Personnes : `gestion_personne`, `personne_id`, `gestion_annuaire_tiers`, `gestion_personne_fusion` ; reprise 1-1 ; dédoublonnage à la saisie ; fiche personne commune ; **champ « N° de mandat de gestion »** ; page « Nouveau propriétaire + bien » | Unicité des personnes avant les rôles nouveaux |
| **L5** | **374** | Prospection : `gestion_affaire`, `gestion_estimation`, `gestion_candidature` (**statut seul, aucune pièce**), `gestion_note` ; `gestion_tache.sorte` ; référentiel d'encadrement versionné ; accueil Location | Le cœur du métier location |
| **L6** | **375** | Bail : `gestion_bail`, `gestion_bail_lot` (exclusion), `gestion_bail_partie`, `gestion_caution` ; occupation = projection ; conditions écrites dans `gestion_location_conditions` (L1) ; reprise proposée des baux | Le bail |
| **L7** | **376** | Dossier d'entrée et documents : `gestion_bail_entree` (calculé / saisi, honoraires de location au barème **modifiables**), réglages agence, **`gestion_document`** ; PDF du mandat, du bail et du dossier d'entrée ; **« Joindre le PDF signé »** ; pièces du locataire retenu ; alignement du prorata sur WIPPIMMO | La fiche papier numérique ; décisions 3 et 5 |
| **L8** | **377** | `gestion_conge`, `gestion_etat_des_lieux`, `gestion_restitution_dg`, échéances d'assurance ; « Clore et relouer », « Louer séparément » (avenant) | Sortie et changement de locataire |
| **L9** | **378** | Contrôles à la mise en place (plafonds d'honoraires, dates DPE, cumul caution / assurance avec l'exception étudiant-apprenti, N° de mandat absent = alerte non bloquante), tous lus dans des **réglages datés** ; recomptage des clics sur l'écran réel (critère 41 / 49, P7 4 / 5, P8 3 / 3) | Conformité et réception |

**Retirés par les réponses d'Arno** : l'ancien L5 (mandat, registre, compteur, événements, reprise des mandats) ;
l'anonymisation des candidats et le journal des purges (ancien L9) ; toute intégration de signature électronique.
⚠️ **Numérotation** : un numéro se réserve au moment où le lot est codé. La migration dormante
`db/migrations-en-attente/361_permis_emprise_numero_reveil.sql` prendra elle aussi le prochain numéro libre si elle est
réveillée avant (le test `migrationsEnAttente.test.ts` suppose aujourd'hui 370) : tout ce tableau glisserait d'un cran.

### 9.1 Le premier lot à développer — L1 « Loyer de départ, taux et honoraires de gestion » (à valider par Arno)

1. Migration 370 (ajout seul, enveloppée) : table `gestion_location_conditions` (une ligne par location = occupation ;
   loyer HC de départ, provisions, taux de gestion HT, base, depuis, origine, auteur ; ajout seul, anti-DELETE).
2. Sur `gestion_annuaire_lot` : `taux_honos_wippimmo`, `base_honos_wippimmo`, remplis par l'import depuis « Tx honos » /
   « Base honos » de `Lots.xlsx` (lecture de deux colonnes de plus ; rien d'autre ne change dans l'import).
3. Réglages sans code : TVA datée (20 %), base par défaut (charges comprises), taux par défaut (4,5 % HT).
4. Saisie sur la **carte du locataire** (Gestion) : loyer de départ, provisions, taux pré-rempli (location précédente
   du lot › taux WIPPIMMO › réglage) ; aussi au geste existant « Ajouter un occupant ». Chaque changement journalisé.
5. Affichage : carte du locataire (loyer, taux, honoraires HT/TTC par mois) et **fiche du bien** (en cours + historique).
6. Écran **Honoraires de gestion** : Lot / Propriétaire / Agence × Mois / Année, total HT et TTC, « N sans loyer de
   départ », export tableur, mention « théorique — le réel est dans WIPPIMMO » ; visible des administrateurs
   (question 2).
7. Reprise : les 317 locations en cours reçoivent le taux WIPPIMMO de leur lot (origine « reprise »), loyer vide.
8. Calcul pur, sans arrondi, testé unitairement (prorata de mois, base HC/CC, TVA datée, sans loyer = non compté).
9. Aucun mail, aucun Drive, aucune comptabilité ; rien n'est retiré ni masqué des écrans existants.
10. Contrôle de fin : `npm test` vert, itest nommé sur base jetable, preuve curl, captures avant/après ; P8 ≤ 3 clics.

Chaque lot : une modification logique, un commit ; suite complète `npm test` verte ; itests nommés uniquement ;
preuve curl pour les composants client ; captures avant/après dans `.captures/`.

---

## 10. Risques

1. **Clé nominative des locataires** (`cle_personne` = nom + e-mail, 17 172 liens inaltérables) : ne jamais la modifier
   lors d'une fusion ou d'une correction ; la fusion passe par `personne_id`, jamais par la clé.
2. **Import WIPPIMMO actif** : ✅ traité par L0 (livré). Reste un cas assumé : un homonyme sans coordonnée commune
   n'est pas rapproché (fiche créée, cas signalé au rapport d'import, à trancher à la main).
3. **Double saisie WIPPIMMO, confirmée** (décision 1) : chaque nouveau locataire est saisi deux fois (outil, puis
   WIPPIMMO pour les quittances) ; L0 les relie sans doublon, mais le temps de saisie demeure.
4. **Deux identifiants de bien** (`id` interne / numéro WIPPIMMO) : l'API Location n'expose que le numéro ; les tests
   vérifient qu'aucune route ne mélange les deux.
5. **Références juridiques non vérifiées** (recherche web refusée) : aucun contrôle bloquant n'est codé avant
   vérification de sa source (§11).
6. **Encadrement des loyers** : expérimentation jusqu'au 25/11/2026 sauf prorogation — le référentiel est versionné et
   le contrôle désactivable par réglage.
7. **RGPD — fiches de candidats non retenus** : sans pièces, il n'y a plus de dossier à détruire (décision 3), mais la
   fiche elle-même (nom, coordonnées, statut) reste une donnée personnelle que le référentiel CNIL limite à 3 mois
   (*à vérifier*). L'outil n'automatise rien ; c'est à l'agence de l'inscrire à son registre des traitements, et un
   geste manuel « Archiver » existe déjà. Un candidat qui a écrit garde ses mails (historique inaltérable).
8. **Honoraires de gestion théoriques** : calculés sur le loyer de départ, ni encaissés ni révisés ; ils divergent du
   réel de WIPPIMMO (impayés, révisions IRL, vacance non saisie). L'écran le dit ; ce n'est pas une comptabilité.
9. **Loyers de départ absents au démarrage** : 317 locations en cours sans loyer ; tant qu'ils ne sont pas saisis (ou
   importés, question 1), les totaux sont incomplets — le compteur « sans loyer de départ » le montre.
10. **Base principale du Mac sans 365-369** : aligner avant d'y tester un lot (la recette, elle, est à jour).
11. **Numérotation des migrations** : la 361 dormante peut prendre le 370 si elle est réveillée avant L1 (§9).

---

## 11. Sources à vérifier avant de coder un contrôle

**Vérifié le 17/10/2026** (sources web consultées par Claude, reportées par Arno) :
- **Plafonds d'honoraires imputables au locataire**, baux signés depuis le 01/01/2026 (arrêté de fin 2025, après un
  gel depuis 2014) : zone très tendue **12,10 €/m²** ; zone tendue **10,09 €/m²** ; reste du territoire **8,07 €/m²** ;
  état des lieux d'entrée **3,03 €/m²**. Ils remplacent les 12 et 3 €/m² de la première version. → **Réglage daté**
  (zone, valeur, date d'effet), modifiable sans code, jamais écrit en dur : ces plafonds évoluent désormais.
- **Cumul caution personne physique + assurance loyers impayés** : interdit, **sauf locataire étudiant ou apprenti**.
  → Le contrôle lit la qualité du locataire et prévoit l'exception.
- **DPE** : classe **G interdite à la location** (nouveau bail ou renouvellement) **depuis le 01/01/2025** ; **F à partir
  de 2028**. → **Réglage daté** (classe, date d'effet), jamais dans le code.

**Encore à vérifier** (la session d'étude n'a pas pu ouvrir de page web) : part locataire ≤ part bailleur et liste des
communes par zone ; plafonds et délais du dépôt de garantie (L89 art. 22) ; conditions Visale ; classe E en 2034, gel
des loyers F/G et validité des DPE ; décret 2015-1437 (pièces) ; référentiel CNIL « gestion locative » (numéro de
délibération) et durée de conservation d'une fiche de candidat non retenu ; encadrement des loyers à Paris (arrêté
en vigueur, échéance du 25/11/2026) ; délai du commandement de payer (loi 2023-668). Logiciels (B2) : modèles annexe /
bail multi-lots de Rentila, Buildium, Ublo, Crypto ; avis réels Capterra / Appvizer ; documentation WIPPIMMO sur
l'indivision et les garants. Ergonomie (B3) : sources NN/g, Baymard, GOV.UK citées dans le rapport B3.

---

## 12. Questions pour Arno

### 12.1 Réponses reçues le 17/10/2026 (intégrées dans cette v3)

| # | Question | Réponse d'Arno | Où c'est intégré |
|---|---|---|---|
| 1 | WIPPIMMO garde-t-il quittances et comptabilité ? | **Oui.** Aucune comptabilité ni quittance dans l'outil ; L0 fait le lien sans doublon | §0, §5.0, D1-B3, risque 3 |
| 2 | Registre des mandats ? | **Hors périmètre** (logiciel dédié). Un champ libre « N° de mandat de gestion » par propriétaire, jamais généré ni numéroté | §4.4, §9 (ancien L5 retiré), D1-B2, D4-B5 |
| 3 | Pièces des candidats ? | **Aucune.** Statut seulement ; pièces classées pour le locataire retenu, rattachées au locataire et au bail dès la signature | §4.3, §4.5 (`gestion_document`), §4.8, risque 7 |
| 4 | Honoraires ? | Location : barème légal par défaut, **modifiable par bail**. Gestion : **loyer de départ + taux** à l'entrée, honoraires = loyer × taux par lot, propriétaire, agence, mois, année | §4.6, §4.9, §9.1 (premier lot) |
| 5 | Signature électronique ? | **Hors périmètre** (Yousign). L'outil produit les PDF et range le PDF signé ; intégration = évolution possible | §4.6, §5.1, P7, D2-16 |

**Base du taux et HT / TTC** : tranchés par les données, sans question (§4.9) — taux **HT** (les valeurs WIPPIMMO sont
des taux TTC ronds divisés par 1,2) et base **charges comprises** (363 lots sur 365 incluent les charges). Défaut
proposé : 4,5 % HT (191 lots), TVA en réglage daté.

### 12.2 Deux questions nouvelles (aucune ne bloque le lot L1)

1. **Pouvez-vous exporter de WIPPIMMO la liste des baux en cours avec leur loyer (et provisions) ?** Les 317 locations
   en cours n'ont aucun loyer dans l'outil (`Locataires.xlsx` n'en porte pas). Avec un tel export, l'import pourrait
   pré-remplir leur loyer de départ (origine « reprise », modifiable) et les honoraires seraient complets dès le
   premier jour. Sans lui, l'équipe les saisit au fil de l'eau ; l'écran compte ceux qui manquent.
2. **Qui voit l'écran « Honoraires de gestion » ?** Il montre le chiffre d'affaires théorique de l'agence.
   Proposition : **les administrateurs seulement** ; la carte du locataire et la fiche du bien (taux et honoraires de
   ce lot) restent visibles de tous les collaborateurs de la Gestion.
