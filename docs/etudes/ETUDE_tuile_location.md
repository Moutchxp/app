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
> ⚠️ **Recherche web refusée dans la session d'étude** (WebSearch et WebFetch bloqués par les permissions). B1, B2 et B3
> reposent sur les connaissances des agents ; **toute référence juridique ou chiffre est marqué « à vérifier »** et
> devra être confirmé sur Légifrance / service-public.fr / ANIL / CNIL avant d'être codé en contrôle bloquant
> (liste au §11). La reconnaissance du code (A) et la critique données (D4), elles, sont vérifiées dans le dépôt
> et en base locale (comptages seuls).
> **Repères** : **[Arno]** = demandé par Arno ; **[proposé]** = ajouté par l'étude, avec son utilité. Ce document
> n'est pas un avis juridique.

---

## 0. Synthèse en une page (pour Arno)

**Ce qu'on construit.** Une tuile « Location » pour l'équipe location : suivre les **prospects** (propriétaires pas
encore sous mandat), **estimer** un loyer devant le propriétaire, signer le **mandat**, suivre les **candidats** et
les **visites**, puis créer le **bail** et le **dossier d'entrée** (votre fiche papier « Nouveau dossier », intégrée
champ pour champ). [Arno]

**Un seul fichier, pas deux.** La Location ne crée **aucune** nouvelle liste de personnes ni de biens : elle écrit
dans **le même annuaire** que la Gestion (313 propriétaires, 510 locataires, 365 biens aujourd'hui), avec **les mêmes
cartes** locataire / propriétaire. Une coordonnée corrigée d'un côté est corrigée de l'autre. Un bien loué par la
Location apparaît dans la Gestion sans ressaisie dès qu'un mandat de gestion existe. [Arno]

**Une personne = une fiche, quels que soient ses rôles** (propriétaire, locataire, garant, candidat). Société, SCI
et couple sont prévus. Si vous tapez un téléphone ou un e-mail déjà connu, l'outil le signale (« ce téléphone est
déjà sur la fiche de Mme X ») sans jamais fusionner tout seul. [proposé]

**Le logement est le « vaisseau mère », cave et parking sont ses enfants.** Chaque annexe garde pour toujours la trace
de son logement d'origine. Louer le parking à quelqu'un d'autre se fait en deux gestes (le retirer du bail du
logement par avenant, le louer seul) : il reste affiché sous son logement avec la mention « loué séparément ». [Arno]

**La fiche du bien s'enrichit** : étage, porte, surface Carrez, surface extérieure, n° de lot de copropriété ; pour
chaque annexe : étage, n° de lot, n° de porte ou de place. [Arno] On y ajoute la **surface habitable** (c'est elle,
pas la Carrez, que la loi exige dans le bail), le nombre de pièces, meublé ou non, l'époque de construction et les
diagnostics avec leur date de validité. [proposé]

**Moins de clics, mesuré.** Les six parcours demandés passent, au bureau, de **110 clics** (proposition initiale
recomptée honnêtement) à **42 clics** ; sur téléphone de 129 à **50** (§6). Exemple : créer locataire + bail +
dossier d'entrée complet = **9 clics** au bureau, parce que les choix habituels de l'agence (dépôt conservé,
prélèvement au 5, compte des honoraires, virement…) sont pré-remplis et réglables sans code, et que dépôt, prorata
et honoraires sont calculés (modifiables).

**Sécurité juridique au bon moment.** Rien ne bloque pendant la saisie. Au moment de « Signer et mettre en place »,
l'outil vérifie : mandat signé, diagnostics à jour, DPE autorisé (G interdit depuis le 01/01/2025, F à partir de
2028 — *vérifié 17/10/2026*), dépôt et honoraires sous les plafonds (12,10 €/m² + 3,03 €/m² pour l'état des lieux à
Paris depuis le 01/01/2026 — *vérifié 17/10/2026*), loyer sous le plafond de l'encadrement parisien, pas de caution
personne physique avec une assurance loyers impayés sauf locataire étudiant ou apprenti (*vérifié 17/10/2026*),
identité complète des signataires. Plafonds d'honoraires et dates d'interdiction DPE sont des **réglages datés**,
jamais écrits dans le code : ils évoluent.

**Rien n'est perdu.** Tout se fait par AJOUT ; l'historique des mails (173 894 rattachements) ne bouge pas.

**Un défaut actuel trouvé au passage** (Gestion, aujourd'hui) : au prochain import WIPPIMMO, les fiches créées à la
main dans l'application (6 propriétaires depuis le 28/09) seront marquées « absentes du dernier export ». Correctif
prévu au lot 0 (§9) ; rien n'a été modifié.

**Ce qu'il vous reste à trancher** : 5 questions au §12 — la principale est le rôle futur de WIPPIMMO.

**Découpage** : 10 lots (L0 → L9), migrations **369 → 378**.

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
- La fiche papier « Nouveau dossier » est intégrée au processus de création (§5.5, transcription intégrale).

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
- **Dernière migration : 368.** Nouvelles migrations : **369 et suivantes**. ⚠️ En base locale, 365-368 ne semblent pas
  appliquées : à aligner avant de tester la 369.

### 2.2 Verdict

- **Réutilisable tel quel** : les tables de l'annuaire (LE fichier partagé), leurs dépôts de lecture
  (`annuaireRepo.ts`) et d'écriture (`annuaireEditionRepo.ts`), les cartes (`CartesPersonnes.tsx`), copro, syndics,
  Drive, historique des mails, tâches (avec agenda), journal, patron des droits.
- **À étendre par ajout** : champs du bien, annexes, bail, caution, mandat, prospection, dédoublonnage, verrous
  d'import des biens.
- **Doublon à ne PAS créer** : une table de personnes ou de biens propre à Location, un second import, un second carnet
  de contacts, un second historique, un second formulaire de fiche.
- **Défauts existants trouvés** (D4, vérifiés) :
  1. `marquerDisparus` (`annuaireRepo.ts:615-633`) marque absente **toute** ligne non présente dans l'export, y compris
     les fiches `app-…` créées à la main → 6 propriétaires concernés au prochain import, et toute création de la
     Location le serait.
  2. L'import réécrit l'entrée et la sortie des occupations sans verrou (`annuaireRepo.ts:466-472`).
  3. Les tables de l'annuaire ne sont pas sous le verrou anti-suppression (339 ne couvre que mails, rattachements,
     adresses, pièces) ; l'occupation garde un `ON DELETE CASCADE` vers le locataire (migr. 253:142).

---

## 3. Recherche (étape B — sans accès web, à vérifier)

### 3.1 Métier et réglementation (B1) — conséquences retenues pour l'outil

| Sujet | Règle (résumé, à vérifier) | Conséquence dans l'outil |
|---|---|---|
| Loi Hoguet (1970) + décret 1972 | Mandat écrit préalable à toute action ; registre des mandats à numérotation continue, sans blanc, conservé 10 ans ; numéro reporté sur l'exemplaire du mandant ; fonds via compte couvert par la garantie financière ; rétractation 14 j si signé hors établissement | Mandat obligatoire pour signer un bail ; registre en ajout seul avec compteur continu ; délai de rétractation calculé ; dépôt « conservé par l'agence » = compte mandant |
| Loi 1989 / ALUR / ELAN | Bail type ; durée 3 ans (bailleur personne physique), 6 ans (personne morale), 1 an meublé, 9 mois étudiant, 1-10 mois mobilité ; préavis locataire 1 mois en zone tendue (tout Paris) | Fin prévue et date limite de congé calculées ; types de bail fermés |
| Honoraires | **Vérifié 17/10/2026** — plafonds imputables au locataire pour les baux signés depuis le 01/01/2026 (arrêté de fin 2025, après un gel depuis 2014) : visite + dossier + bail ≤ **12,10 €/m²** (zone très tendue, dont Paris), **10,09 €/m²** (zone tendue), **8,07 €/m²** (reste du territoire) ; état des lieux d'entrée ≤ **3,03 €/m²**. *À vérifier* : part locataire ≤ part bailleur ; rien d'encaissé avant signature | Deux lignes d'honoraires calculées sur la surface habitable, contrôlées chacune ; plafonds = **réglage daté** (zone, valeur, date d'effet), le bail lit la valeur en vigueur à sa date de signature ; jamais en dur |
| Dépôt de garantie | ≤ 1 mois HC (vide), 2 mois (meublé), 0 (mobilité) ; restitution 1 mois (EDL conforme) / 2 mois ; pénalité 10 % du loyer par mois de retard | DG pré-calculé ; échéance de restitution suivie dans l'accueil |
| GLI / Visale / caution | **Vérifié 17/10/2026** — cumul caution personne physique + assurance loyers impayés **interdit, sauf locataire étudiant ou apprenti** ; *à vérifier* : Visale est une **caution** (Action Logement) ; acte de caution distinct (montant max., durée, mention de la caution, art. 2297 C. civ.) | Objet « caution » à part ; alerte d'incompatibilité au choix, blocage à la signature ; **le contrôle prévoit l'exception** : il lit la qualité du locataire (étudiant / apprenti, champ du bail) et ne bloque pas dans ce cas |
| Diagnostics, DPE | **Vérifié 17/10/2026** — classe **G interdite à la location (nouveau bail ou renouvellement) depuis le 01/01/2025** ; **F à partir de 2028**. *À vérifier* : E en 2034 ; gel des loyers F/G ; DDT annexé ; ERP < 6 mois ; électricité/gaz si > 15 ans | Tableau de diagnostics par lot, validité calculée, blocage à la signature ; **dates d'interdiction par classe = réglage daté** (classe, date d'effet), jamais en dur |
| Assurance habitation | Attestation à l'entrée puis chaque année | Échéance par bail, relance en tâche Gestion |
| IRL, charges, EDL | Révision annuelle (prescription 1 an, pas de rétroactivité, interdite F/G) ; régularisation annuelle des charges ; EDL contradictoire | v1 : WIPPIMMO reste maître de la révision et des charges (§5.0) ; l'outil stocke indice de base et date anniversaire |
| Dossier candidat | Pièces limitées par le décret 2015-1437 ; interdits : n° de sécurité sociale, relevés bancaires, RIB avant signature, photo… | Aucune catégorie de pièce interdite ; v1 : pas de pièces de candidat stockées |
| Surfaces | Bail : surface habitable (loi Boutin, écart > 5 % → baisse de loyer) ; Carrez : vente | Deux champs distincts ; le bail lit la surface habitable |
| Parking seul | Bail civil (Code civil), TVA possible, hors loi 1989 | Type « stationnement (Code civil) » |
| Encadrement (Paris) | Loyer de base ≤ loyer de référence majoré (quartier, pièces, époque, meublé) ; complément justifié, interdit si DPE F/G ; mentions au bail ; dernier loyer du précédent locataire ; ⚠️ expérimentation jusqu'au 25/11/2026 sauf prorogation | Référentiel versionné ; contrôle et mentions automatiques ; veille sur la date |
| RGPD (référentiel CNIL gestion locative, 2021) | Candidats non retenus : 3 mois ; locataire : bail + prescription (3 ans) ; comptabilité 10 ans ; registre des mandats 10 ans | Politique de conservation par catégorie (§5.8) |
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
  pièce stockée** en v1 : la liste des pièces autorisées s'envoie en un geste par le rédacteur de mails existant, et
  les pièces reçues restent dans le courrier.
- `gestion_note` [proposé, D2] : note rapide horodatée et signée sur une personne, un bien ou une affaire (la dictée
  du clavier du téléphone suffit).

### 4.4 Mandat [proposé — cadre tranché, revu par D1-B2 et D4-B5]

- `gestion_mandat` : type (location | gestion | location+gestion), date et lieu de signature (agence | hors
  établissement → fin de rétractation calculée), début, durée, reconduction, exclusif, rémunération, périodicité de
  reddition, document signé.
- `gestion_mandat_mandant` : mandant (personne) **et** signataire (personne, qualité, justificatif du pouvoir :
  gérant de SCI, tuteur, mandataire). `gestion_mandat_lot` : lots concernés.
- **Registre** : `gestion_mandat_compteur` lu `FOR UPDATE` dans la transaction d'inscription (une séquence laisserait
  des trous) ; `gestion_mandat_registre` (numéro, mandat, inscrit le…) en **ajout seul** (trigger anti-UPDATE/DELETE) ;
  corrections et annulations par lignes d'événement (`gestion_mandat_registre_evenement`), jamais par modification.
  La série continue **le registre actuel de l'agence** (dernier numéro à fournir : question 2).
- **Reprise** : les mandats existants gardent leur numéro d'origine dans `numero_historique`, hors série ; une gestion
  venue d'une autre agence = **nouveau mandat, nouveau numéro** (un mandat ne se « reprend » pas).
- **C'est le pont** : un bien apparaît dans la Gestion si un mandat de gestion est actif — ou, pour les 365 biens
  actuels, si les dates de gestion WIPPIMMO l'indiquent (rien ne change pour eux).

### 4.5 Bail [Arno + cadre tranché, revu par D1-B1/B4/B5/B7 et D4-B3/B6/B7]

- `gestion_bail` : qualité du locataire étudiant ou apprenti (oui/non — lue par le contrôle caution + assurance loyers
  impayés, *vérifié 17/10/2026*) ; type (vide | meublé | étudiant | mobilité | Code civil — personne morale ou résidence secondaire |
  stationnement Code civil), date de signature, date d'effet (= date d'entrée, une seule date), fin prévue
  **calculée** (type + nature du bailleur), date limite du congé du bailleur, statut **stocké** limité à brouillon |
  signé | annulé (« en cours » et « terminé » sont **dérivés** des dates), `origine` (app | reprise), mentions
  d'encadrement (référence, référence majorée, complément et justification, loyer du précédent locataire et date du
  dernier versement), indice IRL de base et trimestre.
- `gestion_bail_loyer` : (bail, depuis, loyer HC, provisions, motif initial | révision | avenant) en **ajout seul** —
  le loyer en vigueur est une vue. En v1, seul le loyer initial est saisi (§5.0).
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
- **Occupation = projection du bail** (D4-B3) : à la signature, une ligne `gestion_annuaire_occupation` par
  locataire × lot, avec `bail_id`. Un trigger refuse toute écriture de entrée/sortie d'une occupation qui a un
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
| Mode de règlement : Chèque / Virement / Autres | Choix | réglage agence |
| Commentaires | Texte | — |
| — | [proposé, D1-C6] Remise : clés, badges, index des compteurs, attestation d'assurance reçue | — |

- Les **réglages agence** (défauts) se modifient dans l'écran Réglages, sans code (exigence transverse « pilotage
  sans code »).
- **PDF** imprimable, même ordre que la fiche papier, généré côté serveur (`pdfkit`, déjà utilisé).
- ⚠️ Méthode du prorata (jours réels du mois, terme à échoir) à **aligner sur WIPPIMMO** : le premier avis d'échéance
  doit tomber sur le même montant (vérification au lot 7).

### 4.7 Droits

- Migration : `perm_location` sur `admin_utilisateur`, administrateurs à vrai (calque de 228). Tuile « Location »
  cochée par collaborateur dans l'écran des comptes, comme les autres.
- Routes `/api/admin/location/*` qui **réutilisent les dépôts communs** : un collaborateur « Location seule » ne voit
  pas le courrier de la Gestion. Un collaborateur qui a les deux tuiles voit tout.
- Liste fermée du journal étendue (`personne`, `bail`, `mandat`, `lot_annexe`, `affaire`…) dans la migration qui crée
  chaque entité.

### 4.8 RGPD (tranché par l'étude)

- **Clés opaques** pour tout ce que la Location crée (`app-<uuid>`), jamais nom + e-mail.
- **Candidats non retenus** : aucune pièce conservée dans l'outil ; à J+3 mois de la décision, la fiche candidat est
  **anonymisée** (nom remplacé, coordonnées réellement mises à blanc) si la personne n'a aucun mail rattaché.
  **Limite assumée et documentée** : un candidat qui a écrit à l'agence garde ses mails (historique inaltérable) ;
  « Sortir du suivi » reste le geste mail par mail. Ce point figure au registre des traitements.
- **Locataires partis, garants** : conservation durée du bail + 3 ans (prescription), puis archivage ; pièces
  comptables 10 ans (dans WIPPIMMO) ; registre des mandats 10 ans.
- **Données interdites** : aucune catégorie de pièce ni champ pour n° de sécurité sociale, relevés bancaires, RIB avant
  signature, santé, casier.
- Motifs de refus de candidature dans une liste fermée (preuve de non-discrimination) ; pas de commentaire libre
  visible sur un candidat refusé.

---

## 5. Écrans et parcours

### 5.0 Qui est maître de quoi (décision écrite, D1-B3)

| Donnée | Maître en v1 | Pourquoi |
|---|---|---|
| Identité, coordonnées, biens, annexes, surfaces, diagnostics, accès | **L'application** (créée par Location ou Gestion) ; l'import WIPPIMMO ne réécrit plus un champ saisi (verrous), et rapproche au lieu de dupliquer (§9 L0) | C'est le besoin d'Arno : un fichier commun modifiable des deux côtés |
| Mandats, registre | L'application | WIPPIMMO ne l'exporte pas |
| Bail à la signature : conditions, dossier d'entrée, sommes dues, cautions | L'application, figé après la mise en place | La fiche papier devient numérique |
| Quittancement, avis d'échéance, loyer en vigueur après révision, charges, comptabilité mandant | **WIPPIMMO** | Il produit les quittances ; une seconde vérité financière divergerait au premier litige |

Cela suppose qu'un nouveau locataire soit aussi saisi dans WIPPIMMO pour être quittancé : voir **question 1**.

### 5.1 Écrans (maquettes dans `.captures/location-etude/`)

1. **Accueil Location** (`01-accueil-location.html`) : « Chercher ou créer » (curseur déjà dedans, « / » au bureau ;
   recherche tolérante : fragment de téléphone, numéro + rue partielle, prénom seul) ; boutons directs « + Propriétaire
   & bien » et « + Locataire & bail » ; « + Prospect / Candidat / Visite / Estimation » ; **Aujourd'hui** (visites,
   relances, restitutions de dépôt, attestations d'assurance) en tête ; biens à louer (bouton **Louer** sur chaque
   ligne) ; mes prospects ; baux en préparation ; échéances. Sur téléphone : Aujourd'hui d'abord, bouton « + » flottant.
2. **Fiche personne** (`02-fiche-personne.html`) — composant COMMUN aux deux tuiles : identité, coordonnées (cartes
   existantes, boutons Appeler / SMS / Écrire), note rapide, rôles (ses biens, ses baux, ses cautions, ses mandats),
   bandeau « cette coordonnée est déjà sur la fiche X ». Boutons : **+ Ajouter un bien**, Séparer, Fusionner.
3. **Fiche bien** (`03-fiche-bien.html`) — COMMUNE : arbre logement → annexes, déplié ; « + Cave / + Parking /
   + Autre annexe » en une ligne (curseur dans le n°, 📷 pour la plaque) ; menu ⋯ d'une annexe : **Louer séparément**,
   Remettre avec le logement, Rattacher à un autre logement (vente séparée ou erreur) ; caractéristiques et
   diagnostics ; accès ; baux (en cours, anciens, congé, restitution) ; candidats ; estimation. Boutons : **Louer**,
   **Estimer le loyer**, 📷 Photo, + Visite, **Clore et relouer** (sur le bail en cours).
4. **Bail + dossier d'entrée** (`04-bail-dossier-entree.html`) : UNE page à sections (Lots · Bailleur, locataires,
   garants · Conditions · Dossier d'entrée · Sommes dues · Remise des clés), brouillon automatique, boutons segmentés
   plutôt que listes, encadrement vérifié en direct, « Imprimer la fiche (PDF) », « Signer et mettre en place »
   (contrôles listés, récapitulatif, confirmation).
5. **Nouveau propriétaire + bien** (`05-creation-proprietaire-bien.html`) : UNE page ; seul un nom ou un téléphone est
   obligatoire ; adresse BAN avec « 📍 Ici » (adresse la plus proche du téléphone) ; annexes à adresse héritée ;
   **mandat compact** facultatif (sans mandat, le bien est suivi en prospection, donc visible).
6. **Le même dossier dans les deux tuiles** (`06-meme-dossier-location-gestion.html`) : mêmes blocs communs (bail,
   annexes, propriétaire, locataires) ; la Gestion ajoute courrier, événements, tâches ; la Location ajoute candidats,
   estimation, visites. Côté Gestion, le bloc « Bail en cours » porte le lien direct **Dossier d'entrée (PDF)**, et un
   badge « créé par la Location le … ».

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

| # | Parcours | v1 annoncé | v1 recompté par D3 (bureau / tél.) | **v2 bureau** | **v2 tél.** | Écrans v2 | Champs v2 |
|---|---|---|---|---|---|---|---|
| 1 | Nouveau propriétaire + 1 logement + cave + parking (avec mandat compact) | 9 | 12 (+8 mandat) / 15 (+8) | **6** | **9** | 1 | 6 |
| 2 | Ajouter un bien à un propriétaire existant | 6 | 8 / 9 | **4** | **5** | 2 | 2 |
| 3 | Nouveau locataire + bail + dossier d'entrée complet | 22 | 31 / 36 | **9** | **10** | 2 | 5 |
| 4 | Changement de locataire (congé + sortie + nouvelle entrée) | 27 | 37 / 42 | **10** | **12** | 2 | 3 |
| 5 | Dissocier un parking et le louer à une autre personne | 7 | 19 / 23 | **11** | **12** | 2 | 4 |
| 6 | Retrouver depuis la Gestion le dossier créé par la Location | 2 | 3 / 4 | **2** | **2** | 2 | 1 |
| | **Total** | 73 | **110 / 129** | **42** | **50** | | |

Détail v2 (bureau) :
- **P1** : « + Propriétaire & bien » 1 · nom tapé, Entrée = créer 0 · téléphone (Tab) 0 · suggestion BAN 1 · étage (Tab)
  0 · « + Cave » 1 (curseur dans le n°) · « + Parking » 1 · mandat « Location + gestion » 1 (signé aujourd'hui à
  l'agence par défaut) · Enregistrer 1 = **6**. Téléphone : + 3 entrées de champ = 9.
- **P2** : choisir la personne dans la recherche 1 · « + Ajouter un bien » 1 · puce « même immeuble que… » ou suggestion
  BAN 1 · Enregistrer 1 = **4** ; téléphone + étage = 5.
- **P3** (bail vide, GLI, sans garant ; logement + cave à louer) : « Louer » sur la ligne du bien 1 (lots, bailleur,
  type, DG, honoraires et 6 défauts agence remplis) · locataire : nom, Entrée = créer 0 · téléphone, e-mail (Tab) 0 ·
  date d'entrée 2 · loyer 1 · provisions (Tab) 0 · assurance « GLI » 1 · Imprimer 1 · Signer 1 · confirmer le
  récapitulatif 1 = **9** (variante avec garant : +3 ; si le candidat est déjà connu : « Utiliser cette fiche » 1 au
  lieu de 3 champs). Téléphone : 10.
- **P4** : choisir le bien 1 · « Clore et relouer » 1 · date de réception du congé 2 (préavis et fin calculés) ·
  confirmer 1 · nouveau bail pré-rempli (lots, type, loyer = dernier loyer, provisions, DG, assurance, entretien,
  honoraires) : locataire Entrée 0 · date d'entrée 2 · Imprimer 1 · Signer 1 · confirmer 1 = **10**. L'échéance de
  restitution du dépôt naît à la saisie de l'état des lieux de sortie. Téléphone : 12.
- **P5** : choisir le logement 1 · ⋯ du parking 1 · « Louer séparément » 1 → **avenant** au bail du logement : date de
  sortie du parking = date d'effet du nouveau bail (défaut) 0, nouveau loyer du bail 1 · 1 (mise au point), confirmer
  l'avenant 1 → nouveau bail (type « stationnement » déduit) : locataire Entrée 0 · date 2 · loyer 1 · Signer 1 ·
  confirmer 1 = **11**. Le lien de parenté du parking n'est pas touché. Téléphone : 12.
- **P6** : chercher dans la Gestion, choisir le bien 1 · « Dossier d'entrée (PDF) » dans le bloc Bail en cours 1 =
  **2** (sur téléphone, le bloc Bail est placé avant le courrier).

Critère d'acceptation des lots : **≤ 42 au bureau et ≤ 50 sur téléphone**, recomptés sur l'écran réel avec la même
grille (deux compteurs indépendants).

---

## 7. Tableau des critiques (étape E) — objection → décision

Légende : **R** = retenue ; **P** = retenue en partie ; **X** = rejetée (avec la raison).

### 7.1 D1 — Gestionnaire locatif

| # | Objection | Gravité | Décision |
|---|---|---|---|
| B1 | Le bail n'a pas de bailleur ; propriétaire confondu avec mandant | Bloquante | **R** — rôle `bailleur` dans les parties ; `droit` (usufruit, indivision…) sur la propriété ; mandant ≠ signataire (qualité + pouvoir) |
| B2 | Registre en conflit avec l'existant ; « numéro à compléter » interdit | Bloquante | **R** — série qui continue le registre actuel (Q2) ; numéro historique hors série pour la reprise ; nouveau mandat si la gestion vient d'ailleurs |
| B3 | Deux sources de vérité pour le bail (WIPPIMMO quittance) | Bloquante | **R** — tableau « qui est maître de quoi » (§5.0) ; financier en vigueur = WIPPIMMO ; Q1 |
| B4 | Bail figé alors que ses parties changent (transfert, époux, colocataire, vente) | Bloquante | **R** — parties datées avec motif et fin de solidarité ; changer de bailleur ou de colocataire ne clôt pas le bail |
| B5 | Encadrement, dernier loyer, gel F/G absents | Bloquante | **R** — mentions au bail, contrôle à la signature, référentiel versionné |
| B6 | Sortie sans congé, préavis, EDL ni restitution du DG | Bloquante | **R** — `gestion_conge`, `gestion_etat_des_lieux`, `gestion_restitution_dg`, échéance dans l'accueil |
| B7 | Garant = rôle au lieu d'acte de caution | Bloquante | **R** — `gestion_caution` (montant, durée, colocataire garanti, résiliation pour l'avenir) |
| I1 | Durée du bail selon le bailleur, congé du bailleur | Importante | **R** — fin prévue et date limite calculées |
| I2 | IRL absent | Importante | **P** — indice de base, trimestre, date anniversaire stockés ; le calcul reste dans WIPPIMMO en v1 |
| I3 | Honoraires : deux plafonds ; comptes ; rien avant signature | Importante | **R** — deux lignes contrôlées contre les plafonds du **réglage daté** (12,10 / 10,09 / 8,07 €/m² et 3,03 €/m² au 01/01/2026, *vérifié 17/10/2026*) ; « compte agence / compte gestion » gardés comme libellés de la fiche [Arno], avec leur sens (honoraires / mandant) écrit dans l'aide |
| I4 | Autres diagnostics, DPE avant 07/2021 invalide, 9 m² | Importante | **R** — `gestion_lot_diagnostic`, blocage à la signature ; G interdit depuis le 01/01/2025, F à partir de 2028 (*vérifié 17/10/2026*), dates en **réglage daté** |
| I5 | Baux hors loi 1989 (personne morale, résidence secondaire) | Importante | **R** — types Code civil |
| I6 | Dissocier exige un avenant ; vente séparée ; TVA parking | Importante | **R** — avenant dans le geste ; motif « vente séparée » ; TVA facultative sur le bail de stationnement |
| I7 | Assurance habitation annuelle, PNO | Importante | **R** — échéance + tâche Gestion automatique ; case PNO |
| I8 | Charges et EDL absents | Importante | **P** — EDL minimal retenu ; charges hors v1 (WIPPIMMO), écrit noir sur blanc |
| I9 | Identité insuffisante pour signer | Importante | **R** — champs facultatifs, exigés à la signature |
| I10 | RGPD : anonymisation contredite par les mails conservés | Importante | **R** — limite assumée et documentée (§4.8) |
| I11 | Mandat incomplet (rétractation 14 j, rémunération…) | Importante | **R** |
| I12 | Visale = caution, GLI : critères et agrément | Importante | **R** — Visale dans `gestion_caution` ; GLI : assureur, contrat, date d'agrément du dossier |
| C1 | SIREN, quote-part, surface extérieure, escalier superflus | Confort | **P** — surface extérieure gardée [Arno] ; quote-part gardée facultative (indivisions) ; SIREN et escalier reportés |
| C2 | Fausses alertes sur 317 baux repris | Confort | **R** — statut « repris, à compléter », hors contrôles |
| C3 | Faux positifs du dédoublonnage | Confort | **R** — suggestion seulement, liste d'adresses intermédiaires |
| C4 | Méthode du prorata | Confort | **R** — jours réels, à aligner sur WIPPIMMO (lot 7) |
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
| 16 | Mandat signé sur le terrain | Importante | **P** — mandat pré-rempli en PDF ; signature électronique = service tiers payant, hors v1 (Q5) |
| 17 | Accueil mobile « Aujourd'hui » | Confort | **R** |
| 18 | Menu « + » élargi | Confort | **R** |
| 19 | « Ici » (géolocalisation) | Confort | **R** |
| 20 | Codes d'accès, gardien | Confort | **R** — `gestion_lot_acces`, digicode masqué par défaut |

### 7.3 D3 — Compteur de clics

| # | Objection | Gravité | Décision |
|---|---|---|---|
| 1 | Parcours 5 impossible : rien ne sort le parking du bail 1 | Bloquante | **R** — avenant intégré à « Louer séparément » + contrainte d'exclusion |
| 2 | Tableau v1 = estimation (73 contre 110/129) | Bloquante | **R** — tableau refait geste par geste ; critère d'acceptation 42 / 50 |
| 3 | P1 crée un bien invisible (« biens à louer » exige un mandat) | Bloquante | **R** — mandat compact facultatif ; sans mandat, le bien est en « prospection » et visible dans « Mes prospects » |
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
| B1 | L'import marquera « disparu » tout ce que l'application crée | Bloquante | **R** — colonne `origine` (import / app), `marquerDisparus` limité à l'import ; **lot 0**, avant tout le reste (défaut actuel) |
| B2 | Aucun rapprochement avec le ré-export WIPPIMMO → doublons | Bloquante | **R** — `gestion_annuaire_correspondance` + file « candidat au rapprochement » validée par un humain ; jamais de fusion automatique |
| B3 | Bail et occupation : deux vérités que l'import réécrit | Bloquante | **R** — occupation = projection du bail, trigger, import tenu à l'écart |
| B4 | Regroupement des baux repris faux par construction | Bloquante | **R** — regroupement par (locataire, date d'entrée), tous lots confondus, en **proposition** validée une par une |
| B5 | Registre « continu » contredit « à compléter » et « ajout seul » | Bloquante | **R** — compteur FOR UPDATE, registre en ajout seul, événements correctifs, numéro historique hors série |
| B6 | Clés étrangères impossibles (polymorphes, 14 occupations sans lot) | Bloquante | **R** — `bail_lot.lot_id` NOT NULL FK ; parties avec FK typées + CHECK ; pas de bail repris sur un lot hors annuaire sans créer le lot |
| B7 | Rien n'empêche un lot dans deux baux en cours | Bloquante | **R** — contrainte d'exclusion ; 11 cas existants en liste à trancher |
| I1 | Les verrous ne savent pas verrouiller un lot | Importante | **R** |
| I2 | Coordonnées à la personne = double vérité | Importante | **R** — coordonnées sur les rôles ; la fiche personne lit l'union (inverse de la v1) |
| I3 | Fusion : chaînes, cycles | Importante | **R** — table de fusion, profondeur 1, vue active |
| I4 | Trois vérités de propriété | Importante | **R** — vue unique « propriétaire à date » |
| I5 | `parent_lot_id` sans historique | Importante | **R** — `gestion_lot_annexe` datée |
| I6 | Logements fusionnés ou scindés | Importante | **R** — `gestion_lot_filiation` |
| I7 | Annuaire hors verrou anti-suppression ; CASCADE | Importante | **R** — trigger anti-DELETE étendu, FK en NO ACTION (lot 0) |
| I8 | Biens prospectés dans la table des biens gérés | Importante | **R** — `perimetre` + inventaire des lecteurs avant d'ouvrir la création |
| I9 | Fiches « couple » contre signature individuelle | Importante | **R** — nature `groupe`, séparation exigée à la signature |
| I10 | Faux positifs mesurés du dédoublonnage | Importante | **R** — formulation « cette coordonnée est déjà sur… » |
| I11 | Anonymisation impossible si courrier | Importante | **R** — clés opaques, limite documentée |
| I12 | Loyer sans historique | Importante | **R** — `gestion_bail_loyer` en ajout seul |
| I13 | Calcul et saisie mélangés | Importante | **R** — colonnes `_calcule` / `_saisi`, `numeric` sans échelle |
| I14 | Statut du bail redondant | Importante | **R** — statut limité, « en cours / terminé » dérivés |
| C1-C5 | Vrais noms de tables ; journal ; clé `app-` faible ; 27 parkings ; contrôle de reprise permanent | Confort | **R** (clé `app-<uuid>` en base ; contrôle « 100 % des rattachements résolus » en test permanent) |

### 7.5 Relance des critiques ?

**Les 25 objections bloquantes sont retenues** (24 entièrement, 1 en partie : réseau faible, avec une solution
légère). Aucune ne subsiste sans réponse ; la relance prévue « si une bloquante subsiste » n'a donc pas été
déclenchée. Deux bloquantes dépendent d'une **information** qu'Arno seul peut donner (dernier numéro du registre,
rôle futur de WIPPIMMO) : elles sont traitées dans le modèle et posées en questions 1 et 2.

---

## 8. Plan de reprise des données Gestion (sans perte)

Ordre impératif ; chaque étape est rejouable et journalisée ; rien n'est supprimé.

1. **Lot 0 d'abord** : `origine` posée (`app` pour les clés `app-…`, `import` sinon) ; `marquerDisparus` limité à
   `import` ; verrou anti-DELETE sur l'annuaire ; FK de l'occupation en NO ACTION. Contrôle : 0 ligne `app` marquée
   absente après un import d'essai sur une base jetable.
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
5. **Mandats repris** : un par bien géré (dates WIPPIMMO), `numero_historique` = numéro du registre actuel s'il est
   fourni, hors série continue.
6. **Contrôle final et permanent** : 100 % des rattachements de mails se résolvent toujours (0 non résolu aujourd'hui) ;
   test d'intégration conservé.

Volume : environ 1 400 lignes à reprendre — faible ; le risque n'est pas le volume mais les clés (§10).

---

## 9. Lots de développement et migrations (numérotées à la suite de 368)

| Lot | Migration | Contenu | Pourquoi dans cet ordre |
|---|---|---|---|
| **L0** | **369** | `origine` sur les 4 tables de l'annuaire ; `marquerDisparus` limité ; `gestion_annuaire_correspondance` + file de rapprochement ; verrous `lot` et `occupation` ; anti-DELETE sur l'annuaire ; CASCADE → NO ACTION | Corrige un défaut **actuel** de la Gestion ; préalable à toute création par la Location |
| **L1** | **370** | `perm_location`, tuile, menu, comptes, routes `/api/admin/location/*` gardées ; entités du journal | Socle des droits |
| **L2** | **371** | Champs du bien, `perimetre`, `gestion_lot_annexe`, `gestion_lot_filiation`, `gestion_lot_piece`, `gestion_lot_diagnostic`, `gestion_lot_acces`, `gestion_lot_photo` ; fiche bien enrichie (arbre) dans les **deux** tuiles ; rattachement proposé des 27 parkings | La demande la plus visible d'Arno ; utile à la Gestion seule |
| **L3** | **372** | `gestion_personne`, `personne_id`, `gestion_annuaire_tiers`, `gestion_personne_fusion` ; reprise 1-1 ; dédoublonnage à la saisie ; fiche personne commune | Unicité des personnes avant les rôles nouveaux |
| **L4** | **373** | `gestion_affaire`, `gestion_estimation`, `gestion_candidature`, `gestion_note` ; `gestion_tache.sorte` ; référentiel d'encadrement versionné ; accueil Location (Aujourd'hui, prospects) | Prospection et estimation : le cœur du métier location |
| **L5** | **374** | `gestion_mandat`, mandant/signataire, lots, compteur, registre en ajout seul, événements ; reprise des mandats ; PDF du mandat | Le pont vers la Gestion ; préalable au bail |
| **L6** | **375** | `gestion_bail`, `gestion_bail_lot` (exclusion), `gestion_bail_partie`, `gestion_caution`, `gestion_bail_loyer` ; occupation = projection ; reprise proposée des baux | Le bail |
| **L7** | **376** | `gestion_bail_entree` (calculé / saisi), réglages agence, PDF de la fiche, alignement du prorata sur WIPPIMMO | La fiche papier numérique |
| **L8** | **377** | `gestion_conge`, `gestion_etat_des_lieux`, `gestion_restitution_dg`, échéances d'assurance ; « Clore et relouer », « Louer séparément » (avenant) | Sortie et changement de locataire |
| **L9** | **378** | Contrôles à la signature (plafonds d'honoraires et dates d'interdiction DPE lus dans des réglages datés : valeur + date d'effet, modifiables sans code) ; anonymisation des candidats ; journal des purges ; recomptage des clics sur l'écran réel (critère 42 / 50) | Conformité et réception |

Chaque lot : une modification logique, un commit ; suite complète `npm test` verte ; itests nommés uniquement ;
preuve curl pour les composants client ; captures avant/après dans `.captures/`.

---

## 10. Risques

1. **Clé nominative des locataires** (`cle_personne` = nom + e-mail, 17 172 liens inaltérables) : ne jamais la modifier
   lors d'une fusion ou d'une correction ; la fusion passe par `personne_id`, jamais par la clé.
2. **Import WIPPIMMO actif** : sans le lot 0, chaque création de la Location serait marquée « absente » puis dupliquée
   au ré-export. Le lot 0 est un préalable strict.
3. **Double saisie WIPPIMMO** tant qu'il reste maître du quittancement (Q1) : la table de correspondance rapproche,
   mais l'équipe saisit deux fois.
4. **Deux identifiants de bien** (`id` interne / numéro WIPPIMMO) : l'API Location n'expose que le numéro ; les tests
   vérifient qu'aucune route ne mélange les deux.
5. **Références juridiques non vérifiées** (recherche web refusée) : aucun contrôle bloquant n'est codé avant
   vérification de sa source (§11).
6. **Encadrement des loyers** : expérimentation jusqu'au 25/11/2026 sauf prorogation — le référentiel est versionné et
   le contrôle désactivable par réglage.
7. **RGPD** : l'anonymisation ne couvre pas les personnes qui ont du courrier ; limite écrite au registre des
   traitements.
8. **Migrations 365-368 non appliquées en base locale** : aligner avant de tester la 369.

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
délibération) ; durée de conservation du registre des mandats (décret 72-678) ; encadrement des loyers à Paris (arrêté
en vigueur, échéance du 25/11/2026) ; délai du commandement de payer (loi 2023-668). Logiciels (B2) : modèles annexe /
bail multi-lots de Rentila, Buildium, Ublo, Crypto ; avis réels Capterra / Appvizer ; documentation WIPPIMMO sur
l'indivision et les garants. Ergonomie (B3) : sources NN/g, Baymard, GOV.UK citées dans le rapport B3.

---

## 12. Questions pour Arno

1. **WIPPIMMO garde-t-il le quittancement et la comptabilité ?**
   - Si **oui** (proposition de l'étude) : la Location crée le dossier complet dans l'outil, puis l'équipe saisit le
     nouveau locataire et son bail dans WIPPIMMO pour qu'il soit quittancé — environ 5 minutes par dossier ; l'outil
     les rapproche ensuite tout seul, sans doublon.
   - Si **vous comptez le quitter** : il faudra un gros chantier « quittances et comptabilité des propriétaires »
     dans l'outil, à planifier après ces 10 lots.
2. **Où tenez-vous aujourd'hui le registre des mandats, et quel est son dernier numéro ?** Le registre de l'outil doit
   continuer exactement votre numérotation : sans ce numéro, aucun mandat ne peut y être inscrit. Les mandats en cours
   garderont leur numéro actuel.
3. **Voulez-vous que l'équipe range les pièces des candidats (bulletins de salaire, avis d'imposition…) dans l'outil ?**
   - **Non** (proposition) : on suit les candidats et leur statut, les pièces restent dans le courrier ; rien à purger.
   - **Oui** : plus pratique pour comparer les dossiers, mais l'outil devra détruire les dossiers des candidats non
     retenus au bout de 3 mois, et cela ajoute un lot.
4. **Vos honoraires de location : appliquez-vous toujours le plafond légal, ou un barème à vous ?** Le dossier d'entrée
   les calcule tout seul : il faut savoir s'il prend le maximum autorisé (12,10 €/m² + 3,03 €/m² pour l'état des
   lieux à Paris, depuis le 01/01/2026) ou votre propre grille, et qui paie quoi entre locataire et propriétaire.
5. **Signature électronique des mandats et des baux sur le téléphone, dès le départ ?**
   - **Oui** : l'agent fait signer chez le propriétaire ou en visite, sans revenir au bureau ; abonnement à un service
     de signature (quelques dizaines d'euros par mois) et un lot de plus.
   - **Non pour l'instant** : l'outil produit le mandat et le bail en PDF à imprimer ou à envoyer ; on l'ajoutera plus
     tard sans rien changer au reste.
