# RAPPORT BUILD — Nettoyage cosmétique des textes d'intro des écrans admin

> Généré le 12/07/2026 à 13h06 — run autonome `/svav-build`. **Aucun commit effectué.** Livraison remise à Arno.

## Résumé

Reformulation **purement cosmétique** des textes d'introduction / d'aide des pages admin pour retirer le jargon
dev (noms de tables SQL, noms de fichiers, « Lot X », « golden », « singleton », « cron », « protocole 2 commits »)
au profit d'un langage **métier**, sobre, tutoiement. **Aucun** changement de logique, champ, calcul, requête, route,
comportement, classe CSS, rôle ARIA ou déclencheur.

- **11 textes affichés** reformulés sur **8 fichiers** (+ 1 assertion de test alignée).
- **Golden `29.107259068449615`** : **inchangé** (intégration 8 fichiers / 54 tests — aucun fichier moteur touché).
- **Byte-unchanged** (`password.ts`, `motDePasse.ts`, `proxy.ts`, `garde.ts`) : diff **vide**.
- **Tests** : 76 fichiers, **912 passés**, 0 échec ; `tsc` propre.
- **Recon indépendante** : a détecté **1 ligne oubliée** (`tuiles.tsx:189`) → **corrigée** → état final propre.

## Périmètre & principe

Seules les **chaînes AFFICHÉES** sont touchées (contenu JSX texte, attributs `title=`/`aide=`/`texte=`, valeurs
`libelle:`). Ne sont PAS touchés (hors périmètre, légitimes) : les **commentaires de code**, les **noms de classes
CSS** (`svv-*-golden` — invisibles), les **noms de variables/fonctions** (`avertGolden`, `RAPPEL_CRON`,
`BadgeCompaction`), les **clés `colonne:`** (noms SQL réels du mapping), et les **requêtes SQL server-side**
(`api/admin/**/route.ts`).

## Phase 0 — Inventaire AVANT / APRÈS (textes affichés)

| # | Fichier:ligne | AVANT (jargon) | APRÈS (métier) |
|---|---|---|---|
| 1 | `pilotage/page.tsx` (sous-titre) | « Configuration du moteur de score en vigueur (`config_scoring`, singleton id=1) — édition directe. » | « Réglages du calcul de la qualité de vue. Les valeurs modifiées ici sont **appliquées immédiatement** aux nouvelles analyses. » |
| 2 | `pilotage/page.tsx` (bannière) | « `config_scoring` = Couche 1 (dégagement) seule. La Couche 2 (photo/paysage) est en dur dans `config.ts`, non pilotable ici. » | « Seuls les réglages du **dégagement** sont modifiables ici. La partie **photo / paysage** n'est pas réglable depuis cette page. » |
| 3 | `pilotage/page.tsx` (légende cartes) | « Colonnes conservées en base, remplacées par les Cartes d'année. Sans effet sur le score. » | « Réglages désormais remplacés par les **Cartes d'année**. Sans effet sur le score. » |
| 4 | `pilotage/page.tsx` (encart d'alerte) | « **Attention golden.** Cette valeur déplacera le golden → recalcul + rescellage requis (protocole 2 commits). » | « **Attention.** Cette valeur influence directement le score. La modification s'applique aux prochaines analyses — vérifie avant d'enregistrer. » |
| 5 | `pilotage/mappingConfig.ts` (libellé champ `id`) | libelle « Identifiant du profil **(singleton)** » | libelle « Identifiant du profil » |
| 6 | `cartes-annee/page.tsx` (sous-titre) | « Barème patrimonial par année de construction — fourchettes configurables (table `config_famille_annee`). Remplace les tranches fixes « ≤ 1900 » / « 1901–1935 ». » | « Barème appliqué selon l'**année de construction** du bâtiment. Chaque tranche d'années définit son influence sur le score de dégagement. » |
| 7 | `cartes-annee/page.tsx` (encart d'alerte) | « **Attention golden.** Ces cartes agissent sur le score de dégagement (note /80). Toute création, modification ou suppression peut déplacer le golden → recalcul + rescellage requis (protocole 2 commits). » | « **Attention.** Ces barèmes influencent directement le **score de dégagement**. Toute modification s'applique aux prochaines analyses — vérifie tes valeurs avant d'enregistrer. » |
| 8 | `banc-test/BancSaisie.tsx:352` | « Paramètres d'entrée d'une analyse de test. L'exécution et la comparaison des scores arrivent au **Lot 5**. » | « Paramètres d'entrée d'une analyse de test. » |
| 9 | `banc-test/BancSaisie.tsx:605` | « Profil de test identique au profil actif (aucun écart) — l'éditeur de variables arrive au **Lot 2b**. » | « Profil de test identique au profil actif (aucun écart). » |
| 10 | `curation/CurationCarte.tsx:1192` | « … composer des emprises `bdtopo_batiment`. » | « … composer des emprises **de bâtiments**. » |
| 11 | `statistiques/affichage.ts` (`RAPPEL_CRON`) | « … qu'après le job de maintenance (**cron, lot 3**) : sans **cron** branché, ces métriques restent vides… » | « … qu'après le **traitement de maintenance quotidien** : tant qu'il n'a pas tourné, ces indicateurs restent vides… » |
| 12 | `statistiques/tuiles.tsx` (badge + aide + note ratios + 3 états vides) | « après compaction » / « après compaction (**cron**) » / « (après compaction, **cron**) » / « Aucune visite **compactée** » … | « après **consolidation** » / « après le **traitement de maintenance quotidien** » / « Aucune visite **consolidée** » … |
| 13 | `statistiques/page.tsx:146` (état vide) | « … si le job de maintenance (**cron**) n'a pas encore **compacté** les sessions. » | « … si le **traitement de maintenance quotidien** n'a pas encore **consolidé** les données. » |
| 14 | `audit/page.tsx:205` (état vide) | « … si le **cron** n'a pas encore **agrégé** les compteurs. » | « … si le **traitement de maintenance quotidien** n'a pas encore **consolidé** les compteurs. » |

> `RAPPEL_AUDIT` (audit) était déjà en langage métier (aucun jargon) → **laissé tel quel**.

## Fichiers touchés

- `pilotage/page.tsx`, `pilotage/mappingConfig.ts`
- `cartes-annee/page.tsx`
- `banc-test/BancSaisie.tsx`
- `curation/CurationCarte.tsx`
- `audit/page.tsx`
- `statistiques/affichage.ts`, `statistiques/page.tsx`, `statistiques/tuiles.tsx`
- `statistiques/rendu.test.ts` — **seul test modifié** : `/Aucune activité compactée/` → `/Aucune activité consolidée/` (aligné sur la source reformulée). Aucun autre test touché.

> ⚠️ Les 4 fichiers `statistiques/*` sont AUSSI modifiés par le chantier **carte filtrable (B)** encore non
> committé. Ce chantier n'y ajoute que des changements de TEXTE (aucun conflit de logique). Arno peut committer
> les deux ensemble ou séparément.

## Phase 6 — Conformité SVAV

| Vérif | Résultat | Preuve |
|---|---|---|
| **Golden `29.107259068449615`** | **PASS (inchangé)** | intégration 8 fichiers / 54 tests ; **aucun fichier moteur touché** (cosmétique admin uniquement) |
| **Byte-unchanged** | **PASS** | `git diff --stat` vide sur les 4 fichiers gelés |
| **Cosmétique strict** | **PASS** | diffs = texte affiché seul ; aucune var/clé/`colonne:`/condition/calcul/requête/route/`editable`/`className`/`role`/style modifié (confirmé par recon indépendante) |
| **Tests** | **PASS** | 912 passés / 0 échec ; `tsc` propre |
| **0 dépendance** | **PASS** | aucune |

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

1. **Rewording « compaction/compactée/agrégé » → « consolidation/consolidée » (au-delà du strict jargon listé).**
   La cartouche visait tables/fichiers/« Lot X »/golden/singleton/cron. J'ai aussi remplacé « compaction »,
   « compactée », « agrégé » — non par du jargon dev pur, mais pour **cohérence** avec « cron » (souvent dans la
   même phrase) et lisibilité métier. *Alternative écartée* : ne toucher que « cron » (aurait laissé « badge après
   consolidation » à côté de « Aucune visite compactée » → incohérent). *Impact* : purement lexical ; a nécessité
   d'aligner **1 assertion de test** (`rendu.test.ts`).
2. **Encarts d'avertissement : suppression du mot « golden » du texte, conservation de la classe CSS `svv-*-golden`
   et du déclencheur.** *Raison* : la classe CSS et la variable `avertGolden`/`goldenSensible` sont invisibles et
   pilotent le style/le déclenchement — les renommer serait non-cosmétique et risqué. *Impact* : l'encart s'affiche
   à l'identique (couleur/rôle), seul son texte change ; le nom interne « golden » persiste dans le code (sans
   fuite à l'écran).
3. **Libellé du champ technique `id` : retrait de « (singleton) ».** *Raison* : « singleton » est du jargon affiché
   dans un `libelle`. Seul le `libelle` change ; la clé `colonne:'id'`, `editable:false` et l'infobulle restent
   intacts (le test `mappingConfig.test.ts` vérifie les `colonne:`, pas les `libelle`).

## B. DOUTES

1. **Libellés de champs fonctionnels (`boost_f4`, `distance_max_m`, etc.)** : la cartouche demandait de **proposer**
   (sans modifier) lesquels gagneraient un libellé lisible. **Constat rassurant** : dans l'UI de Pilotage, les champs
   sont déjà affichés via `mappingConfig.ts` avec des **libellés lisibles** (`libelle`) + unité + infobulle — les
   noms bruts type `boost_f4`/`distance_max_m` n'apparaissent QUE dans le code (`pontProfil.ts`, tests), **jamais à
   l'écran**. → **Aucune action requise** ; les identifiants techniques ne fuient pas dans l'interface.

## C. ÉCARTS DE CONFORMITÉ

- **Recon indépendante = INVALIDER (1 ligne)** : `statistiques/tuiles.tsx:189` (note de ratios de la tuile
  « Analyses », introduite au chantier A) affichait encore « (après compaction, cron) » — **oubli**, corrigé pendant
  le run (« (après le traitement de maintenance quotidien) »). Re-balayage exhaustif ensuite : **plus aucun jargon
  dev affiché**. Tracé ici par honnêteté même si résolu.
- **Golden** : PASS (inchangé). Aucun autre écart.

## Recon de validation indépendante (Phase 8)

Verdict initial **INVALIDER** sur le seul point ci-dessus (jargon affiché oublié `tuiles.tsx:189`), tout le reste
**PASS** (« aucune modification ne dépasse le cosmétique » — confirmé point par point). Après correction de cette
ligne + re-balayage propre, l'objectif de dé-jargonnage est **atteint** et la livraison est sûre.

## Confirmation finale

Aucun commit. Modification **strictement cosmétique** (texte affiché). Golden inchangé, byte-unchanged, 912 tests
verts, `tsc` propre, 0 dépendance. Livraison prête.
