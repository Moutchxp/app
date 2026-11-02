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

## ❓ Question ouverte à Arno (lot 6)

- **Un co-négociateur sur un côté déjà tenu.** La répartition actuelle porte UN négociateur par côté (entrée, sortie) : l'écran reconstruit les
  parties en ne gardant que la première de chaque côté, et la ventilation, la commission par côté et l'espace par négociateur lisent une seule
  partie par côté. Ajouter un 2ᵉ négociateur au même côté sans changer ces calculs ferait perdre sa part à la modification suivante et fausserait
  les montants. Aujourd'hui : « Rejoindre » ne propose que le côté libre ; deux côtés tenus → « demandez à un administrateur ». Le permettre
  demande un lot dédié (parties multiples par côté, partage de la part du côté, une commission par négociateur), à décider.

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

Les cinq questions de la recon sont tranchées : voir « Décisions métier » ci-dessus (02/11/2026).
