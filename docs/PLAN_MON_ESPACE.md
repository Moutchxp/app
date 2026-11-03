# PLAN — Tuile « Mon espace » (chantier en lots)

> Recon en lecture seule du 02/11/2026. Un lot = un prompt = un commit. Migrations livrées NON APPLIQUÉES, code compatible avec
> l'ancien schéma (colonne absente → comportement d'avant, message « disponible après la mise à jour »).

## Objectif d'Arno

Une tuile personnelle, ouverte à chaque collaborateur qui a un compte ET le droit « Mon espace » : ses ventes, ses compromis en
cours, son prévisionnel, la création d'un compromis avec le formulaire existant (structure → n° de mandat obligatoire → vérification
« rejoindre » plutôt que doublonner), l'acte signé, ses statistiques (N-1, cumul, par apporteur, HT/TTC), son annuaire d'apporteurs ;
pour les administrateurs, un « mode agence » (CRITERIMMO, MACJ, fusion).

Défauts retenus (sauf contre-ordre d'Arno) : sur une vente partagée, chacun voit toute la vente mais seulement SA commission et SON
apporteur (les administrateurs voient tout) ; apporteurs : chacun voit/crée les siens, les admins tous, doublon détecté à la saisie ;
unicité du mandat par structure (n° + société).

---

## 🔴 Décisions métier (Arno, 02/11/2026, 20h16) — à respecter dans TOUS les lots

1. **« Mon CA » = les honoraires rattachés au titulaire de l'espace** (le côté qu'il porte). Sa commission est affichée à part.
2. **Chaque collaborateur de la vente peut remplir LES DEUX côtés** (parties, honoraires). Garde de version obligatoire (lot 6) et
   traçabilité de chaque modification (qui, quand, quoi). Par défaut, le taux de commission personnel de l'AUTRE collègue reste masqué.
3. **N° de mandat OBLIGATOIRE pour toute CRÉATION de compromis** (depuis « Mon espace » comme depuis la tuile Suivi CA / Transaction).
   Facultatif pour les compromis et ventes existants (on peut l'ajouter ou le corriger).
4. **Aucun doublon** : ni de vente (même mandat), ni d'apporteur.
5. **Acte signé, retour en compromis, annulation** : autorisés aux collaborateurs présents sur au moins un côté (vendeur ou acquéreur) de la
   vente, et aux administrateurs. Tous les autres : refus côté serveur (403), bouton absent.
6. **Prévisionnel de « Mon espace » = MA PART des compromis en cours** (pas la commission entière) : validé par Arno (02/11/2026). Ne plus reposer.
7. **Co-négociateur : UN SEUL négociateur par côté.** « Rejoindre » ne propose que le côté libre ; pas de lot dédié (Arno, 02/11/2026). Ne plus reposer.
8. **Les deux compteurs « Mes compromis en cours » et « Mes ventes actées cette année » sont RETIRÉS** de « Mon espace » (accord explicite d'Arno,
   02/11/2026) : les tuiles de l'accueil les remplacent, avec le même clic vers la liste (« Mes compromis en cours », « Mes ventes » de l'année).
9. **La liste déroulante « Année » au-dessus de la rangée des mois est RETIRÉE** (accord explicite d'Arno, 02/11/2026) : la rangée des années de
   l'onglet « Année(s) » la remplace. Aucun autre retrait.
10. **La phrase « Le montant est votre CA : … » est RETIRÉE** de « Mon espace » (accord explicite d'Arno, 02/11/2026) ; celle du mode agence reste.
11. **Les onglets « Mes compromis en cours », « Mes ventes », « Mes statistiques » sont à RETIRER** (doublons de Compromis / Mois / Année(s)) ;
    « Mes apporteurs » reste. Inventaire fait avant (02/11/2026) : « Mes compromis en cours » = l'onglet « Compromis » (même liste, mêmes gestes)
    → RETIRÉ. « Mes ventes » (la liste des ventes actées par année, cartes dépliables, gestes, historique) et « Mes statistiques » (par apporteur ;
    en mode agence, par négociateur) n'ont PAS d'autre accès → GARDÉS, en attente de la réponse d'Arno sur leur nouvel emplacement.
12. **Nouveau compromis : « Pour quelle structure ? » n'est posée qu'aux collaborateurs rattachés aux DEUX structures.** Source : le rattachement du
    profil (`transaction_societe_compte`, daté). Rattaché à une seule : étape sautée, « Structure : … (celle de votre profil) » en lecture seule,
    imposée aussi par le serveur (création et vérification du n° : 403 pour l'autre structure ; un administrateur et le mode agence : inchangés).
    Sans rattachement enregistré (au 02/11/2026 : Augustin Jorel, actif ; Test Test, inactif) : la question reste, en attente d'Arno.
13. **« CA net » en vue « Mon espace » = mon CA moins ma commission déduite, moins les rétrocessions de mon côté** : la colonne « CA net » de MA ligne
    dans l'Espace par négociateur du Suivi CA (`monCaNet` → `espaceNegociateurs`, options de la page FUSION), calculée côté serveur ; mesure
    « CA net » des graphiques Mois / Année(s) et carte « Mon CA net » (comme la carte « CA net » du mode agence).
14. **Les tableaux « Par apporteur d'affaires » (et, en mode agence, « Par négociateur ») passent SOUS le graphique de « Mois » et « Année(s) »**,
    après la liste des affaires, sur la même sélection ; puis les onglets « Mes ventes » et « Mes statistiques » sont RETIRÉS (accord explicite
    d'Arno, 02/11/2026 ; inventaire fait : ventes actées, gestes et historique → la liste ; N / N−1, cumul, HT/TTC, prévisionnel → cartes et
    graphique ; tableaux → sous le graphique). « Par négociateur » : LE tableau de l'« Espace par négociateur » du Suivi CA (`TableNegociateurs`) ;
    « Par apporteur » : le tableau en lecture seule de l'ancien onglet (`parApporteur`, règle de « L'année ») — le bloc du Suivi CA porte des gestes
    d'écriture (saisie, rattachement de rétrocessions) qui n'ont pas leur place ici. Une adresse ?vue=ventes / ?vue=statistiques ouvre « Mois ».
15. **Onglet « Mois » : la liste ne montre plus que les « Vendus »** (accord explicite d'Arno, 02/11/2026) ; « Année(s) » garde Vendus + Compromis.
16. **La rangée des ANNÉES revient au format du Suivi CA** (celui d'avant e83e882) ; la rangée des MOIS garde sa répartition sur toute la largeur.
    Le profil « Augustin Jorel » est un profil de test : aucune action (Arno, 02/11/2026).

Navigation (après le lot 10, 02/11/2026 ; mise à jour le même jour : la barre d'onglets JUSTE SOUS la ligne « Voir … », HT | TTC sous les
onglets ; décisions 10 et 11 : plus de phrase du CA, plus d'onglet « Mes compromis en cours » ; la rangée des mois entière, sans troncature,
par une taille fluide selon sa largeur — la même règle au Suivi CA) : en tête, la ligne « Voir … » + « + Nouveau compromis », puis les onglets du Suivi CA
(`OngletsVues`, le même composant que la Transaction : « Compromis | Mois | Année(s) », « Compromis » par défaut, l'adresse ?vue= / ?vue-mois= /
?vue-annee= comme la Transaction) suivis, dans la même barre, des onglets « Mes compromis en cours | Mes ventes | Mes statistiques | Mes apporteurs »
(inchangés). « Mois » = l'accueil au format « Le mois » ; « Année(s) » = le format de « L'année » (rangée des années, Année | Période | Tout, tuiles,
« Année par année » cliquable, « Mois par mois » de l'année, Annuel / Cumul). Chiffres : « Mon espace » = « Mes statistiques » ; mode agence = les
expressions des écrans du Suivi CA (`accueil.ts`). GRAPHIQUES : ceux de la page du Suivi CA eux-mêmes (`GrapheMois`, `GrapheAnnees`, en « Vendu + compromis »), avec une source facultative
(`app/lib/transaction/sourceGraphe.ts`) : sans elle le Suivi CA calcule comme avant (captures avant / après identiques au pixel) ; « Mon espace »
leur passe MES chiffres (le vendu de « Mes statistiques », mes compromis en cours placés par la règle du Suivi CA, ma part : `sourceMoisPerso`,
`sourceAnneesPerso`). « CA net » d'un espace personnel : décision 13 (mon CA net).
MISE EN PAGE (02/11/2026) : les onglets et « Montants en HT | TTC » sur UNE ligne (au téléphone : HT | TTC dessous) ; dans « Mois » / « Année(s) »,
la rangée a la largeur du graphique et ses mois (années) se répartissent sur toute la largeur, entiers ; les cartes : des colonnes égales selon la
largeur du CONTENEUR (requêtes de conteneur), jamais coupées. LA LISTE SOUS LE GRAPHIQUE (`ListeAffairesPeriode`, `affairesPerso` /
`affairesAgence`) : les affaires des cartes et du graphique pour la sélection — « Vendus » (total = la carte « CA », nombre = « Ventes », au centime ;
« Mon espace » : ma part, `maPart` calculée par le serveur sur la vente entière) puis « Compromis » (placés comme le graphique) ; chaque affaire :
la carte de l'onglet « Compromis » (mêmes gestes) ; tri par date décroissante.
L'écart entre les blocs : `tdb loc-page`, les classes de la page d'une structure du Suivi CA (`.tdb` : 18 px, mesuré au banc sur les deux pages).

Mise en œuvre du lot 2 (n° de mandat, migration 449) :
- la comparaison passe par UNE fonction, `normaliserMandat` (`app/lib/transaction/mandat.ts`) : sans accents, majuscules, lettres et
  chiffres seuls (espaces, tirets, points ignorés), sans zéros de tête (« m-0042 » = « M42 ») ; la recherche « ce mandat existe-t-il déjà
  dans cette structure ? » est `venteDuMandat` (`app/lib/transaction/mandatRepo.ts`) — réutilisées telles quelles par les lots 5 et 6 ;
- la « structure » est la société PORTEUSE de la vente (colonne `societe`, celle du négociateur d'entrée) ;
- un n° posé ne s'efface pas (on le corrige) ; un n° annulé ou retiré redevient libre ; « Rétablir » un compromis dont le n° a été repris
  est refusé avec le résumé de la vente qui le porte ;
- la création d'un compromis par l'ancienne action « vente-saisir » (aucun écran ne l'ouvre plus) suit la même règle.

Mise en œuvre du lot 3 (« mes affaires », lecture seule, aucune migration) :
- `GET /api/admin/mon-espace/affaires` (droit « Mon espace », relu en base) lit les ventes du Suivi CA (`lireVentes(null)`, vue FUSION) et les
  filtre côté serveur (`app/lib/mon-espace/mesAffaires.ts`) : une vente est « à moi » si mon compte est l'entrée, la sortie ou une partie, ou si
  un libellé des fichiers m'est rattaché par la règle existante (`comptesRapprochesDesLibelles`) ;
- un collaborateur reçoit ses ventes SANS les lignes « paye du négociateur » d'un autre (commission, taux, mode retirés de la réponse) ; un
  administrateur reçoit toutes les ventes telles quelles, chacune marquée des côtés qu'il tient (`mesCotes`) ; ses compteurs restent les siens ;
- « Mon CA » = la somme de mes lignes de l'« Espace par négociateur » (`espaceNegociateurs`, vue FUSION) ; les ventes notées chez les deux
  sociétés et non attribuées sont écartées comme partout (`pourLaVue`) ;
- limite connue, héritée de la règle existante : un libellé des fichiers rattaché par le seul PRÉNOM (« ANTOINE ») va au seul compte qui porte
  ce prénom — un futur collaborateur homonyme d'un ancien hériterait de son historique tant qu'un alias n'est pas posé.

Mise en œuvre du lot 4 (mes listes, lecture seule) :
- « Mes compromis en cours » et « Mes ventes » (toutes années, sélecteur, total) affichent EXACTEMENT les ventes que le serveur compte pour moi
  (`compteurs.compromis.ids`, `compteurs.parAnnee`), avec `CarteAffaire` / `DetailAffaire` de la tuile Suivi CA ;
- option `personnel` (`VuePersonnelle` : mes côtés, commission d'un autre retirée) sur ces composants : pour le côté d'un autre, ni com négo,
  ni reste, ni taux, ni cadre de commission, ni part de l'agence (au lieu de « 0 € » ou d'un calcul refait sur un taux par défaut) ; aucun geste
  (ils arrivent aux lots 5 à 7). Sans l'option, la tuile Suivi CA est inchangée (épreuve de non-régression).

Mise en œuvre du lot 5 (créer un compromis, aucune migration) :
- parcours : structure → n° (obligatoire) → vérification (`GET /api/admin/mon-espace/mandat`, `venteDuMandat` du lot 2) → libre : mon côté
  (entrée / sortie ; un administrateur : « pour un collègue ») puis `FormulaireDossier` (n° figé) ; pris : la transaction existante et
  « Rejoindre » (écran d'attente jusqu'au lot 6) ;
- `POST /api/admin/mon-espace/compromis` : `lireDossier` puis `enregistrerDossier`, les fonctions de la tuile ; en plus (`refusCreation`) :
  création de compromis seulement, n° obligatoire (et 449 appliquée), collaborateur sur un côté (403 sinon) ; doublon → 422 ;
- le formulaire propose les négociateurs actifs et MES apporteurs (rattachés à moi ou mon compte interne ; administrateur : tous) ; aucune fiche
  de client de l'agence (pas d'annuaire des personnes hors de la Transaction) ; la création d'un apporteur arrive au lot 9 ;
- la structure choisie est vérifiée à l'étape ③ ; si le négociateur d'entrée travaille pour l'autre structure, la vente est portée par elle
  (règle existante) et le serveur revérifie le n° dans CETTE structure à l'enregistrement.

Mise en œuvre du lot 6 (rejoindre, modifier, garde de version, journal ; aucune migration) :
- GARDE DE VERSION, pour toutes les écritures d'une vente (tuile Suivi CA et « Mon espace ») : la version = le dernier n° du journal
  (`transaction_journal`, en ajout seul, verrouillé en base) qui concerne la vente et ses lignes (`sqlVersionVente`) ; lue avec chaque vente,
  renvoyée avec chaque geste ; contrôlée la vente verrouillée, avant toute écriture → 409 « Un collègue vient de modifier cette affaire — rechargez
  pour voir ses changements avant d'enregistrer. » ; sans version envoyée (écran d'avant) : pas de contrôle. Aucune migration 450 nécessaire ;
- MODIFIER depuis « Mon espace » : négociateur présent (son compte, ou un libellé des fichiers rattaché) ou administrateur (403 sinon) ; il reste
  sur un côté ; même écriture que la tuile (`enregistrerDossier`) ; les commissions ne se voient ni ne s'envoient : le serveur reprend celles qui
  sont enregistrées côté par côté (`commissionsConservees`) — jamais écrasées ; « calculée » suit la répartition, « manuelle » reste ;
- REJOINDRE : preuve = le n° de mandat de l'affaire ; un côté LIBRE seulement ; les négociateurs présents restent ; aucune vente créée ;
- JOURNAL : celui de la tuile (qui figé, quand, avant → après), en lecture dans « Mon espace » ; un collaborateur n'y lit pas les entrées
  « commissions » (montants et taux des deux côtés).

Mise en œuvre du lot 7 (gestes, rafraîchissement ; aucune migration) :
- GESTES (décision 5) : « Acte signé » (date, confirmation dans la page), « Annuler le compromis » (la fenêtre de la tuile : motif, date, note),
  « Revenir en compromis » ; `POST /api/admin/mon-espace/geste` → `acteSigne` / `annulerCompromis` / `retourCompromis` de la tuile (journal,
  inter-cabinet, garde de version : 409) ; négociateur de l'affaire ou administrateur (403 sinon, bouton absent) ;
- RAFRAÎCHISSEMENT : l'empreinte de « mes affaires » (affaires visibles + leur version, `empreinteDe`, `GET /api/admin/mon-espace/empreinte`)
  relue toutes les 15 s et au retour sur l'onglet ; relecture seulement si elle a changé, jamais pendant une saisie ou une confirmation
  (`peutBattre` de la Gestion) ; la RÉFÉRENCE est l'empreinte des affaires réellement chargées (aucun changement perdu entre le chargement et
  le premier battement) ; « Marc a mis à jour « X » » et la ligne éclairée (sans animation si prefers-reduced-motion) quand l'auteur de la
  dernière écriture n'est pas moi ; 401 → « reconnectez-vous » ; autre panne → nouvel essai silencieux.

Mise en œuvre du lot 8 (statistiques ; aucune migration) :
- le cumul des graphiques : UNE fonction (`app/lib/transaction/cumul.ts`), utilisée par les cinq écrans qui le recopiaient et par « Mon espace »
  (commit à part, non-régression prouvée : `cumul.test.ts` + les tests des écrans du Suivi CA, inchangés) ;
- « Mes statistiques » (`app/lib/mon-espace/statistiques.ts`) : mon CA mois par mois par année (`monCa`, sur mes ventes actées, `pourLaVue`),
  la vente au mois à confirmer dans son année ; Mois / Période / Année / Tout et N−1 sur les MÊMES mois (`moisSoulignes`) ; par apporteur :
  `parApporteur` du Suivi CA sur les rétrocessions liées à mes ventes ; le prévisionnel = mon CA sur mes compromis en cours (la même sélection que
  `totalCompromisEnCours`, mais MA part : sinon une vente partagée compterait deux fois entre deux espaces) ; projection = acté + prévisionnel ;
- la somme des statistiques de tous les collaborateurs = le CA de l'agence, au centime (épreuve `statistiques.itest.ts`).

Mise en œuvre du lot 9 (« Mes apporteurs » ; migration 450, livrée NON appliquée, code compatible sans elle) :
- UN SEUL ANNUAIRE : `gestion_location_apporteur` (la Location) ; création = `creerApporteur`, fiche = `enregistrerFicheApporteur` (journal,
  garde de version de la fiche), telles quelles ; le formulaire = `NouvelApporteur.tsx` (le même), qui reçoit de « Mon espace » sa façon de créer
  par un contexte facultatif (`ContexteNouvelApporteur`) — sans ce contexte (tuile, Location) rien ne change ;
- JE VOIS (`mesApporteursAnnuaire`, pur) : mon compte d'apporteur interne, ceux dont je suis le collègue de rattachement aujourd'hui, ceux de mes
  ventes (fiche, nom écrit, rétrocession), ceux que j'« utilise » (450) ; administrateur : tous. Chiffres : `parApporteur` du Suivi CA sur mes
  ventes actées (= celui du Suivi CA pour un apporteur de mes seules ventes, épreuve `apporteurs.itest.ts`). Le formulaire de compromis propose
  la même liste, avec « + Ajouter un nouvel apporteur » (la saisie du compromis reste ouverte) ;
- ZÉRO DOUBLON (décision 4) : dès la saisie, sur TOUT l'annuaire côté serveur (`/apporteurs/doublons`) : homonyme (`homonymes`, la règle
  existante, déplacée dans `app/lib/transaction/homonymesApporteur.ts`), même téléphone (chiffres, +33 → 0, 9 derniers), même e-mail (principal
  et autres) → « Cet apporteur existe déjà, rattaché à … » + « L'utiliser » (aucune création ; rattachement et règles inchangés) ; création
  bloquée ; le serveur refuse tout doublon par 409 (file d'attente d'une création à la fois + l'index unique du nom en base) ;
- MODIFIER la fiche : son collègue de rattachement, l'interne lui-même, un administrateur (403 sinon) ; « Passer en interne » n'est pas proposé
  depuis « Mon espace » (il reste dans la Location) ;
- 450 (`mon_espace_apporteur`) : le lien « ce collaborateur utilise cet apporteur », la seule chose qu'aucune table ne portait ; sans elle,
  « L'utiliser » choisit l'apporteur pour la vente en cours, et l'onglet le dit.

## ✅ Question du lot 6, tranchée (décision 7)

- **Un co-négociateur sur un côté déjà tenu** — tranché : un seul négociateur par côté (décision 7). Le constat d'origine : La répartition actuelle porte UN négociateur par côté (entrée, sortie) : l'écran reconstruit les
  parties en ne gardant que la première de chaque côté, et la ventilation, la commission par côté et l'espace par négociateur lisent une seule
  partie par côté. Ajouter un 2ᵉ négociateur au même côté sans changer ces calculs ferait perdre sa part à la modification suivante et fausserait
  les montants. Aujourd'hui : « Rejoindre » ne propose que le côté libre ; deux côtés tenus → « demandez à un administrateur ». Le permettre
  demanderait un lot dédié (parties multiples par côté, partage de la part du côté, une commission par négociateur) : écarté par Arno.

Mise en œuvre du lot 10 (mode agence, administrateurs ; aucune migration) :
- SÉLECTEUR « Mon espace / Agence : CRITERIMMO / MACJ / FUSION » en tête de l'espace, pour les administrateurs seulement (défaut : « Mon espace ») ;
  `GET /api/admin/mon-espace/affaires?agence=criterimmo|macj|tous` et `/empreinte?agence=…` : 403 pour un non-administrateur (le rôle est relu en
  base par `agenceRepo.ts`), 400 pour une structure inconnue ;
- UNE LECTURE : les données de la page de la structure du Suivi CA (`lireDonneesSociete`, `app/lib/transaction/donneesSociete.ts` : le corps de
  `GET /api/admin/transaction?vue=societe`, déplacé tel quel et appelé par la route du Suivi CA ET par « Mon espace ») — chaque vente une fois en
  FUSION, lignes miroir de l'inter-cabinet comprises pour CRITERIMMO et MACJ ;
- LES CHIFFRES (`app/lib/mon-espace/agence.ts`, pur) : CA et nombre = la somme des cartes (`resultatDesCartes`) des ventes signées de la période
  (`ventesDuMois`, `ventesPeriode`, `ventesDesAnnees`), la tuile « CA » de « Le mois » / « L'année » ; compromis en cours = `totalCompromisEnCours` ;
  par négociateur = `espaceNegociateurs` ; par apporteur = `parApporteur` (le bloc de « L'année ») ; égalité au centime prouvée par
  `agence.test.ts` et `agence.itest.ts` (CRITERIMMO, MACJ, FUSION ; HT et TTC ; Mois / Période / Année / Tout) ; la somme des espaces personnels
  de tous les collaborateurs = le CA de FUSION ;
- LES ONGLETS : les mêmes (« Compromis en cours », « Ventes », « Statistiques », « Apporteurs ») ; la carte et la fiche COMPLÈTES (commissions
  des deux côtés) ; filtre « Négociateur » (une personne) et tri du Suivi CA (`trierListe`) sur les compromis ; les gestes, « Modifier » et
  l'historique restent (garde de version, journal) ; le rafraîchissement lit l'empreinte de la structure entière.

## ✅ Fin du chantier (02/11/2026) — 10 lots livrés

| Lot | Commit |
|---|---|
| 1 droit et tuile | 9a3b3b8a |
| 2 n° de mandat | a4683950 |
| 3 mes affaires | 279d7d70 |
| 4 mes listes | 719d370b |
| 5 créer un compromis | c46ffef7 |
| 6 rejoindre, modifier, garde de version | 0850b8bb |
| 7 gestes, rafraîchissement | 8353eff8 |
| 8 statistiques (et le cumul unique : 4cb574a9) | da33ecb7 |
| 9 mes apporteurs | ce3a2108 |
| 10 mode agence | (ce commit) |

Migrations du chantier :

| N° | Objet | État au 02/11/2026 |
|---|---|---|
| 448 `mon_espace_droit` | le droit « Mon espace » (`perm_mon_espace`) | appliquée par Arno sur la base de dev |
| 449 `transaction_numero_mandat` | n° de mandat + unicité par structure | appliquée par Arno sur la base de dev |
| 450 `mon_espace_apporteur_utilise` | « L'utiliser » un apporteur | livrée, NON appliquée (code compatible sans elle) |

Toutes les trois sont dans `db/migrations/` et partent à la prochaine mise à jour de production (registre `migrationsEnAttente.test.ts`).

Limites connues :
- **Rattachement par prénom des ventes importées** : un libellé des fichiers rattaché par le seul prénom (« ANTOINE ») va au seul compte qui
  porte ce prénom ; un futur collaborateur homonyme d'un ancien hériterait de son historique tant qu'un alias n'est pas posé (règle existante).
- **10 compromis anciens sans n° de mandat** : le n° n'est obligatoire qu'à la création ; ils restent sans n° jusqu'à ce qu'on l'ajoute (on ne
  peut pas les « rejoindre » par leur n° d'ici là).
- **20 ventes notées deux fois « à attribuer »** (41 fiches) : écartées de tous les chiffres (personnels, agence, Suivi CA) tant qu'elles ne
  sont pas attribuées dans la tuile ; la somme des espaces = le CA de la structure HORS ces ventes.

---

## 🔴 RÈGLE TRANSVERSE — À VÉRIFIER À CHAQUE LOT 2 → 10 (exigence d'Arno, 02/11/2026)

Tout compromis créé, complété, passé en « acte signé » (vente actée), annulé ou remis en compromis depuis « Mon espace » se
propage IMMÉDIATEMENT et au bon endroit dans TOUTE l'application, exactement comme s'il avait été saisi dans la tuile Transaction :

- Suivi Chiffre d'affaires : CRITERIMMO, MACJ, FUSION VENTES CRITERIMMO & MACJ (onglets Compromis, Mois, Année(s), cartes,
  graphiques, tableaux mois par mois, espaces négociateurs, variable, commissions) ;
- CA global ;
- inter-cabinet (ligne miroir, registre `transaction_inter_cabinet`) ;
- « Mon espace » de TOUS les collègues concernés (entrée et sortie) et mode agence des administrateurs ;
- et l'inverse : une saisie ou une modification faite dans la tuile Transaction apparaît dans « Mon espace » des collègues concernés.

### Comment (non négociable)

1. **Une seule source de vérité.** « Mon espace » ne crée aucune table, aucune copie, aucun cache propre des ventes. Il écrit via les
   MÊMES fonctions métier que la Transaction (`app/lib/transaction/repo.ts` : `enregistrerDossier`, `acteSigne`, `retourCompromis`,
   `annulerCompromis`, `retablirCompromis`, `enregistrerCommissionCote`, `synchroniserInterCabinet`…) et lit les mêmes données
   (`lireVentes`), simplement filtrées par collaborateur CÔTÉ SERVEUR. Une écriture « ma partie seulement » (lot 6) est une nouvelle
   fonction du même `repo.ts`, appelée par les deux tuiles — jamais un second chemin d'écriture.
2. **Aucune règle de calcul dupliquée.** Statistiques personnelles = les mêmes fonctions que le Suivi CA (`periodeMois.ts`,
   `periodeAnnees.ts`, `compromisEnCours.ts`, `lignesNegociateur.ts`, `modele.ts`…) avec un filtre ; ce qui vit encore dans un écran
   (`filtrer`, `cumuler` recopié 5 fois, `previsionnelEnCours`) est d'abord EXTRAIT en fonction pure unique, puis appelé des deux côtés.
3. **Écrans ouverts à jour par le rafraîchissement à empreinte (lot 7).** L'empreinte doit bouger à CHAQUE geste (création,
   complétion, signature, annulation, retour en compromis) : soit `modifie_le` de la vente posé par chacun de ces gestes (à vérifier
   geste par geste : `ecrire(…, avecModifie)` ne le pose que sur demande), soit le dernier n° de `transaction_journal` (append-only,
   alimenté par tous les gestes) — choix tranché au lot 7, prouvé par test.

### Preuve exigée à chaque lot concerné — test d'intégration « propagation »

Pour chaque geste disponible à ce lot (créer, rejoindre, compléter sa partie, acte signé, annuler, revenir en compromis) :

- fait depuis « Mon espace » → visible avec les MÊMES montants dans le Suivi CA (société concernée + FUSION), le CA global,
  l'inter-cabinet si applicable, et l'espace de l'autre collègue ;
- fait depuis la Transaction → visible dans « Mon espace » des collègues concernés ;
- aucun double comptage (« des honoraires ne sont jamais comptés deux fois ») ;
- annulation → la vente disparaît des compromis en cours et des prévisionnels PARTOUT ;
- acte signé → elle passe des compromis aux ventes actées PARTOUT, dans le bon mois.

Le test d'intégration est nommé dans le lot et lancé seul (`npx vitest run --config vitest.integration.config.ts <fichier>`),
sur une base d'essai ou en transaction annulée — jamais `npm run test:integration` en entier, jamais d'écriture dans la vraie base.

---

## Les lots

| Lot | Contenu | À l'écran | Règle transverse |
|---|---|---|---|
| 1 | Droit et tuile : migration 448 `perm_mon_espace` (non appliquée), `session.ts`, `menuAdmin.ts`, `proxy.ts` (refus par défaut), Comptes (case + repli `schemaDroits.ts`), page vide protégée | Tuile « Mon espace », case dans la fiche d'un compte, page d'accueil de l'espace | Non concerné (ne touche pas aux ventes) |
| 2 | N° de mandat : migration 449 (colonne + unicité n° + société, hors retirées/annulées), normalisation et recherche pures, champ OBLIGATOIRE à la création d'un compromis et facultatif pour une fiche existante (décision 3), affiché sur la ligne dépliée et la ligne miroir | « N° de mandat » dans les formulaires existants et la ligne dépliée | Le n° saisi apparaît partout où la vente est affichée (société, FUSION, ligne miroir) |
| 3 | Lire « mes affaires » : adresse de données dédiée `/api/admin/mon-espace`, filtrée côté serveur (côtés, parties, libellés rattachés), commission de l'autre retirée ; tests de sécurité | Compteurs « mes compromis / mes ventes » | Une saisie Transaction apparaît dans l'espace des concernés |
| 4 | Mes listes : même `CarteAffaire` / `DetailAffaire` (option « vue personnelle », tuile Transaction inchangée), historique des ventes | Liste dépliable identique à la Transaction | Idem lot 3, sur les listes |
| 5 | Créer : ① structure ② n° de mandat obligatoire ③ vérification ④ `FormulaireDossier` pré-rempli | Parcours de création | Créer → Suivi CA, FUSION, CA global, inter-cabinet, autre collègue |
| 6 | Rejoindre / compléter sa partie : description de l'affaire existante, écriture « ma partie seulement » + garde de version | « Ce mandat existe déjà — Rejoindre » | Rejoindre, compléter → partout |
| 7 | Acte signé, annuler, revenir en compromis depuis l'espace ; rafraîchissement à empreinte (modèle `app/lib/gestion/rafraichir.ts`) | La vente bascule chez l'autre collègue sans recharger | Les trois gestes → partout, bon mois, prévisionnels |
| 8 | Mes statistiques : CA N / N-1, cumul, par apporteur, HT/TTC, prévisionnel — extraction préalable des calculs recopiés | Tuiles et graphiques personnels | Mêmes montants que le Suivi CA filtré |
| 9 | Mes apporteurs : annuaire filtré, création, alerte de doublon (homonymes, téléphone, e-mail) | « Mes apporteurs », « Nouvel apporteur » | Apporteur choisi → mêmes rétrocessions partout |
| 10 | Mode agence (admins) : CRITERIMMO / MACJ / Fusion, tous les compromis en cours | Sélecteur réservé aux administrateurs | Vision agence = Suivi CA |

Contrôle de fin de chaque lot : `npm test` complet vert + `tsc` + preuve curl (statut ET absence de « Module not found » /
« Build Error ») + captures dans `.captures/mon-espace-lot-N/`.

## Risques relevés à la recon

- **Concurrence** : l'enregistrement d'une affaire remplace toute la fiche (`repo.ts`, répartition remplacée en bloc) — le dernier
  qui enregistre gagne en silence. Bloquant avant d'ouvrir une vente à deux collègues (lot 6).
- **Fuite** : `GET /api/admin/transaction` renvoie toutes les ventes à tout titulaire du droit — « Mon espace » ne doit jamais s'y
  brancher (précédent du filtre serveur : `api/admin/location/suivi/route.ts`, `negociateurPropre`).
- **Historique** : aucune vente n'a de n° de mandat ; 20 ventes (41 fiches) notées chez les deux sociétés restent « à attribuer »
  et fausseraient des statistiques personnelles ; les 10 compromis en cours doivent recevoir leur n° avant l'ouverture.
- **Annuaire des apporteurs** commun avec la Location, nom unique pour toute l'agence.

## Questions à Arno

Les cinq questions de la recon sont tranchées : voir « Décisions métier » ci-dessus (02/11/2026), ainsi que les décisions 6 (prévisionnel = ma
part) et 7 (un négociateur par côté). Aucune question ouverte.


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

## 🔴 D25 (Arno, 03/11/2026) — Suivi CA › CA global : filtres du graphique des coûts classés par famille

- Le graphique du CA global est le MÊME composant que celui de Mon espace › « Les coûts » (`GrapheGlobal`) : la décision D25 s'y applique (ligne
  « Famille » Vente | Location | Gestion avec case d'inclusion et compteur, liste des coûts par famille, « Tout / Aucun » par famille, plus de
  « Tout / Aucun » global, ligne « Activité » fusionnée). Aucun calcul touché. Détail : `docs/PLAN_MON_ESPACE_COUTS.md`, section D25.

## 🔴 D26 (Arno, 03/11/2026) — Fiche apporteur : rattachement modifiable, formulaire refait, tout modifiable

- **Constat** (fiche BEAUCOURT Mme) : « Modifier la fiche » de « Mes apporteurs » s'affichait cassé (libellés collés à leur valeur, aucune case
  visible, l'aide mêlée aux libellés, « Autres téléphones+ Ajouter » collés). **Cause** : le formulaire posé dans la carte (`PanneauFiche`) est stylé
  par la feuille de la Location (`.plo-champ`, `.plo-grille`… dans `CSS_PARAMETRES` / `CSS_ONGLETS_SUIVI`), jamais chargée dans « Mon espace ».
  **Correction** : la nouvelle fenêtre charge ces feuilles (la cause, pas un rapiéçage champ par champ). Mesuré au banc : avant, cinq champs sans case
  et des libellés AU MÊME NIVEAU que leur valeur ; après, chaque libellé 4 px au-dessus de sa case, aucun débordement à 390 px.
- **Une fenêtre, la même pour créer et pour modifier** (`mon-espace/FicheApporteurFenetre.tsx`), hors de la carte (plein écran au téléphone), sections
  titrées, grille 2 colonnes (1 à 390 px), libellé au-dessus de chaque champ :
  1. Identité : Externe / Interne (création ; en modification d'un externe, « Passer en interne » pour un administrateur — le geste de la Location) ·
     Civilité · Catégorie (partenaire, agence…) · Nom · Prénom (aide courte + picto « i ») · Société ;
  2. Contact : téléphone et e-mail principaux, autres téléphones et e-mails (« + Ajouter » sur sa ligne), adresse ;
  3. Rattachement et rémunération : le collègue rattaché (collaborateurs actifs ; création : moi par défaut, modifiable) ; s'il change : « À partir
     du » (ou « Depuis toujours » pour un « à rattacher ») et la question OBLIGATOIRE « touche-t-il des honoraires ? » (règle de la Location du
     24/10/2026) ; le taux de l'apporteur et la rémunération du collègue EN VIGUEUR, et les panneaux de la Location pour les modifier ;
  4. Notes.
  Pied : « Annuler » + « Enregistrer » (actif dès qu'un champ change), puis le récapitulatif des champs modifiés (gardé : rien ne disparaît) et
  « Confirmer » ; message d'erreur ou de succès lisible ; un 409 propose « Recharger ».
- **Une seule source** : l'annuaire de la Location (`gestion_location_apporteur`), aucune copie ; les mêmes fonctions serveur (`creerApporteur`,
  `enregistrerFicheApporteur`, `enregistrerRattachement`, `ajouterBaremeApporteur`, `ajouterRemunerationCollegue`) : même journal, même garde de
  version (409) pour la fiche ; pour le rattachement, garde 409 ajoutée côté « Mon espace » (le collègue lu à l'ouverture doit être celui
  d'aujourd'hui). Une modification ici se voit partout (carte, Location, compromis).
- **Création** : tous les champs partent avec la création (civilité, adresse, notes… enregistrés aussitôt par `enregistrerFicheApporteur`) ; si ce
  complément était refusé, l'apporteur existe quand même et un avertissement le dit. Zéro doublon et « L'utiliser » : inchangés.
- **Droits — vérifiés, NON élargis** : l'identité : son collègue de rattachement, l'apporteur interne lui-même, un administrateur (inchangé) ; le
  collègue rattaché, la rémunération du collègue et le taux : un ADMINISTRATEUR (comme dans la Location, où ces gestes sont réservés aux
  administrateurs) — un non-administrateur les voit en lecture, avec la mention. Conséquence à connaître : un apporteur « à rattacher » ne se
  rattache que par un administrateur (il n'a pas de collègue, donc personne d'autre ne peut modifier sa fiche). À la création, chacun choisit le
  collègue (comme avant).
- Aucune migration : tous les champs existent (406, 407, 414, 419-422).
- Le formulaire « Nouvel apporteur » de la Transaction (choix de l'apporteur d'un compromis) et la fiche de la Location : inchangés.
- Captures avant / après (1 440 × 900 et 390 px, clair et sombre ; modifier, « à rattacher », création) : `.captures/fiche-apporteur-fenetre/`.

## 🔴 D27 / D28 (Arno, 03/11/2026) — Onglet « Compromis » : 4 cartes en tête, apporteurs des compromis en cours ; « Mois » / « Année(s) » : ventes actées

**D27 — 4 cartes en tête de l'onglet « Compromis »** (les tuiles grises de « Mois » / « Année(s) », mêmes classes ; deux colonnes au téléphone),
sur les compromis en cours AFFICHÉS dans la liste, à la date du jour (aucune période), HT / TTC selon le sélecteur, relues avec la liste (empreinte, 15 s) :
1. « Volume d'affaires » : la commission des affaires, ENTIÈRES (la somme des cartes, `resultatDesCartes`) ;
2. « Compromis en cours » : leur nombre (= les lignes de la liste) ;
3. « Reversé » : ce qui part à d'autres, avec « dont collègues · dont négociateurs · dont apporteurs » :
   - collègues : le côté tenu par un autre collaborateur, la part d'un co-négociateur (MARMONIER), le côté de l'autre structure en inter-cabinet
     (HEIDIDON, sortie MACJ), les agences extérieures ;
   - négociateurs : les commissions déduites des lignes (🔴 **réponse A d'Arno** à l'écart constaté : sans elles, la carte 4 ne tombait pas sur la
     somme des « reste » en FUSION et MACJ — 11 166,67 € HT, les commissions de Pierre Thevenin sur FABARRO et HEIDIDON) ;
   - apporteurs : l'apporteur de la répartition et les rétrocessions rattachées ;
4. « Chiffre d'affaires net » = 1 − 3 = la somme des « reste » (mode agence), au centime ; « Mon espace » : MA PART NETTE (`maPart.net`, sans ma propre
   commission — inchangé : 17 291,68 € HT pour Arno au 03/11/2026).
- Une seule comptabilité (`compromisCartes.ts`) : chaque terme de la carte 3 est calculé pour lui-même par les fonctions des cartes d'affaire
  (`lignesCarteAffaire`, `espaceNegociateurs`, `resultatDesCartes`) ; l'égalité 1 − 3 = 4 est un CONTRÔLE des épreuves, jamais forcée.
- Mode agence (CRITERIMMO / MACJ / FUSION) : la structure ; 1 = ses compromis en cours (= Suivi CA au centime) ; 3 = ce qui sort de la structure
  (apporteurs, agences extérieures, côté de l'autre structure en inter-cabinet, commissions des négociateurs) ; en FUSION l'inter-cabinet entre nos
  deux sociétés n'est pas reversé. Le filtre « Négociateur » s'applique aux cartes comme à la liste.
- Confidentialité (décision 2) : en « Mon espace », le serveur calcule sur la vente ENTIÈRE et n'envoie, par affaire, que ses totaux (`verse` : volume,
  collègues, négociateurs, apporteurs et le détail par apporteur) — « dont collègues » est la part d'honoraires du côté de l'autre (déjà sur la ligne),
  jamais sa commission ; « dont négociateurs » est ma propre commission.
- Mesuré au 03/11/2026 (HT) : Arno 28 750,00 · 4 · 11 458,32 (9 791,66 · 0 · 1 666,66) · 17 291,68 ; FUSION 99 133,33 · 10 · 12 833,33
  (0 · 11 166,67 · 1 666,66) · 86 300,00 ; CRITERIMMO 73 300,00 · 8 · 2 916,66 · 70 383,34 ; MACJ 27 083,33 · 3 · 11 166,67 · 15 916,66.
- À savoir : sur MARMONIER (ligne importée commune « CEDRIC, ARNAUD »), le « reste » affiché est celui de l'affaire entière ; en « Mon espace », la
  carte 4 se compare donc à « ma part nette », pas à ce « reste ».

**D28 — « Par apporteur d'affaires »** (le même composant, `TableauParApporteur`, avec un total en bas) :
- onglet « Compromis » : sous la liste, « Par apporteur d'affaires — compromis en cours » : Apporteur | Compromis | Honoraires des compromis apportés |
  Commissions à verser ; seulement les compromis affichés ; total « Commissions à verser » = « dont apporteurs » de la carte 3, au centime ;
- « Mois » et « Année(s) » : « … — ventes actées » : une rétrocession rattachée à une affaire non signée (compromis en cours, affaire annulée) n'y
  figure plus (`surVenteActee`) ; les rétrocessions « à répartir » (sans affaire) restent, comme avant. Les compromis restent visibles dans
  l'onglet « Compromis ». (Au 03/11/2026, aucune rétrocession n'est rattachée à un compromis : rien ne change à l'écran.)
- Suivi CA : son bloc « Apporteurs de l'année » est un AUTRE composant ; il suit le mode choisi (« Vendu », « Compromis », « Vendu + compromis ») :
  il mêle compromis et ventes actées seulement quand on le demande (« Vendu + compromis »). Non modifié — signalé à Arno.
- « Apporteur non nommé » : 50 affaires actées (87 505,00 € TTC de rétrocessions sans nom) et 83 rétrocessions « à répartir » ; liste remise à Arno
  (`.captures/compromis-cartes-apporteurs/apporteur-non-nomme.md`) ; aucune donnée modifiée.
- Aucune migration, aucune écriture en base. Captures (1 440 × 900 et 390 px, clair et sombre ; perso et FUSION) : `.captures/compromis-cartes-apporteurs/`.
