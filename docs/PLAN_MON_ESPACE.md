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
| 2 | N° de mandat : migration 449 (colonne + unicité n° + société, hors retirées/annulées), normalisation et recherche pures, champ FACULTATIF dans le formulaire de la Transaction, affiché sur la carte | « N° de mandat » dans le formulaire existant et la ligne dépliée | Le n° saisi d'un côté se lit de l'autre |
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

## Questions ouvertes à Arno

1. « Mon CA » = ma part des honoraires (les espaces s'additionnent en CA agence) ou ma commission ?
2. Sur une vente à deux, qui fixe le partage (50/50, 60/40…) et que faire en cas de désaccord ?
3. N° de mandat obligatoire aussi dans la tuile Transaction ?
4. Apporteur déjà connu d'un collègue : le signaler et le partager, ou permettre un homonyme ?
5. « Revenir en compromis » / « Annuler » ouverts aux collaborateurs ou réservés aux administrateurs ?
