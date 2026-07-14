# RAPPORT DE BUILD — Module Internaute, LOT A-2 : moteur de recherche de contacts

> Run `/svav-build` autonome. Aucun commit (livraison à Arno). Golden `29.107259068449615` NON concerné (aucun fichier
> moteur/ingestion/tunnel/banc/migration touché). Front + routes existantes + extraction. Pré-requis : LOT A-1
> committé (extension `unaccent`, migration 027).

## Fichiers touchés (5)
- `app/lib/internaute/extraction.ts` — clause `q` tokenisée dans `construireFiltres` (unaccent ILIKE, OR interne au
  nom, LIÉE + échappée LIKE) ; nouveau `ordreListe(filtres)` (tri conditionnel) ; `q` dans `lireFiltres`.
- `app/lib/internaute/extractionRepo.ts` — `ORDER BY i.cree_a DESC` → `${ordreListe(filtres)}` (liste + export).
- `app/(admin)/admin/(protected)/internautes/InternautesVue.tsx` — état `statutsMiroir` + `q`/`qDebounced` ;
  `toggleStatut` (source → reset miroir + q) ; `toggleMiroir` (sens unique) ; effet debounce 250 ms ; fetch piloté par
  `statutsMiroir` + `qDebounced` (≥2 car) ; bloc « moteur de recherche » (miroirs + champ) ; scroll 6 lignes.
- `extraction.test.ts` (+7) et `extractionRepo.test.ts` (+1) — voir preuves.

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — L'EXPORT reste piloté par la SOURCE (`statuts`), la LISTE par le MIROIR (`statutsMiroir`).** La spec dit que
les miroirs + `q` pilotent « la requête de CE bloc » (la liste). Elle ne parle pas de l'export. Choix : ne PAS toucher
la sémantique de l'export (il continue d'exporter la sélection source, sans `q`). Alternative écartée : faire suivre
l'export au miroir/`q` (cohérence liste=export, mais scope + change une fonctionnalité existante). Impact : quand le
miroir diverge de la source (l'admin affine sa recherche), la liste montre le miroir mais l'export reflète la source.
En état par défaut (miroir = source, réinitialisé à chaque action source), liste et export coïncident.

**A2 — `q` en dessous de 2 caractères → PAS de filtre (liste = statutsMiroir complet), pas « pas de fetch du tout ».**
La spec dit « minimum 2 caractères avant d'émettre la requête ». Interprétation : le fetch tourne toujours (piloté par
le miroir/page), mais le paramètre `q` n'est ENVOYÉ qu'à partir de 2 car (sinon la liste affiche le miroir sans filtre
nom). Alternative écartée : bloquer tout fetch < 2 car (la liste disparaîtrait au 1er caractère). Impact : à 0-1 car,
la liste montre l'intersection des statuts miroir (sans recherche nom) — comportement attendu.

**A3 — Scroll : cap ~6 lignes LEVÉ quand un dossier est ouvert (`detailId`).** La spec dit « 6 lignes max, le bloc ne
grandit pas ». Le détail (fiche riche) étant rendu INLINE dans la liste, le comprimer dans un scroll de 460 px serait
illisible. Choix : cap (460 px ≈ 6 lignes compactes, `overflow-y:auto`) en navigation ; cap levé à l'ouverture d'un
dossier. Alternative écartée : cap toujours (fiche comprimée). Impact : hauteur du bloc légèrement variable à
l'ouverture ; les 6 lignes sont respectées en navigation. La valeur 460 px est une APPROXIMATION (lignes de hauteur
variable selon le wrapping email).

**A4 — Tri alphabétique par collation SQL brute (`ORDER BY i.nom`), pas `unaccent`/`lower`.** La spec dit « tri
alphabétique (nom, prénom) ». Choix : tri sur les colonnes brutes (collation par défaut) + `NULLS LAST` + `i.id`
stable. Alternative écartée : `ORDER BY unaccent(lower(i.nom))` (normalisé). Impact : ordre selon la collation de la
base ; suffisant pour un usage admin.

**A5 — Échappement des métacaractères LIKE (`%`, `_`, `\`) dans chaque mot.** Non demandé explicitement. Choix :
échapper pour que « 50% » cherche le littéral « 50% » (pas un joker). Orthogonal à l'anti-injection (déjà garantie par
le paramétrage `$n`). Impact : robustesse ; aucun effet négatif.

## B. DOUTES
**B1 — La recherche accent-insensible repose sur `unaccent()` (fonction SQL) — non testée en pur.** Les tests unitaires
prouvent la STRUCTURE de la clause (`unaccent(i.prenom) ILIKE unaccent($n)`) ; le comportement réel (« Thévenin » ↔
« thevenin ») a été prouvé au LOT A-1 par psql (`SELECT unaccent('Thévenin') = 'Thevenin'`, `… ILIKE … = true`).
Aucun harnais d'intégration internaute n'existe pour un test bout-en-bout ; à envisager si besoin.

## C. ÉCARTS DE CONFORMITÉ
Aucun.
- GOLDEN : `test:integration` 8/54 PASS, golden `29.107259068449615` inchangé (aucun fichier moteur touché).
- RGPD : recherche nominative par nom = exploitation admin (cadre existant) ; **fail-closed PRÉSERVÉ** (statuts vide →
  0 résultat même avec `q`, testé) ; **étanchéité par statut PRÉSERVÉE** (EXISTS en AND ; le OR de `q` est confiné au
  filtre nom) ; jamais toute la base sans finalité. Aucune persistance nouvelle. Debounce + min-2-car = limitation des
  requêtes nominatives.
- Ingestion/tunnel/banc/moteur : non touchés.

## Preuves (tests purs)
- **Fail-closed AVEC `q`** : `extractionRepo.test.ts` — `lireProfilsFiltres({q:'thevenin'}, …, [])` → `{total:0,
  lignes:[]}` et `query` JAMAIS appelé (le court-circuit `normaliserStatuts([]).length===0` précède `construireFiltres`).
- **Zéro OR entre statuts** : `clauseStatuts([F1,F2])` `not.toMatch(/\bOR\b/)` ; le `q` produit un OR **entre parenthèses**
  (prénom OU nom) par mot, ANDé ; total des OR de la requête = nombre de mots (aucun OR entre EXISTS).
- **`q` en AND** : chaque mot poussé dans `clauses[]`, assemblé via `clauseWhere` = ` AND …` ; ne peut qu'ajouter une
  contrainte (jamais élargir).
- **Injection impossible** : `q="x'; DROP TABLE internaute --"` → aucun `'` ni `DROP` dans le SQL (que des `$n`) ; la
  charge (tokenisée) vit dans les paramètres liés. Métacaractères LIKE échappés.
- **Tri conditionnel** : `ordreListe({q})` → alphabétique stable ; `ordreListe({})` → `cree_a DESC` (chaînes constantes).

## Self-review (a–e)
- **(a)** fail-closed tient avec `q` (court-circuit repo avant tout + garde front `statutsMiroir.size===0`). ✓
- **(b)** zéro OR entre statuts (EXISTS en AND ; OR de `q` confiné). ✓
- **(c)** `q` en AND, n'élargit jamais. ✓
- **(d)** miroir SENS UNIQUE : `toggleMiroir` ne touche que `statutsMiroir` ; `toggleStatut` (source) re-sync le miroir
  + vide `q`/`qDebounced` ; export = source, liste = miroir. ✓
- **(e)** injection impossible (paramétré + échappement LIKE ; `ordreListe` = chaînes constantes). ✓

## Vérifications (les 4)
- `npx tsc --noEmit` : PASS (exit 0).
- `npx eslint` (5 fichiers) : PASS (0 problème).
- `npm test` : PASS — 82 fichiers, 991 tests (+8), 21 skipped.
- `npm run test:integration` : PASS — 54 tests, golden bit-identique.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Revue adversariale indépendante (sous-agent, wiring vérifié bout-en-bout front → routes → extraction). 5 propriétés
+ bonus SÛRES, prouvées fichier:ligne :
- **(a) fail-closed avec `q`** : court-circuit `normaliserStatuts([]).length===0` = 1re instruction du repo, AVANT
  `construireFiltres` → `q` jamais compilé ; garde front `statutsMiroir.size===0`. Testé (repo).
- **(b) zéro OR entre statuts** : `clauseStatuts` sans OR ; le OR de `q` strictement parenthésé, ANDé.
- **(c) `q` en AND** : poussé dans `clauses[]`, ANDé via `clauseWhere` → contrainte monotone, jamais d'élargissement.
- **(d) miroir sens unique** : `toggleMiroir` ne touche que le miroir ; `toggleStatut` re-sync + vide `q` ; export=source,
  liste=miroir ; aucune boucle.
- **(e) injection impossible** : chaque mot LIÉ (`$n`) + métacaractères LIKE échappés ; `ordreListe` = chaînes constantes.

**4 notes non bloquantes du reviewer :**
1. **Export ignore `q`** (le CSV peut contenir plus de lignes que la liste recherchée) — **comportement INTENTIONNEL**
   (décision A1 : export piloté par la source), sûr (`q` ne fait que restreindre). Documenté, non corrigé.
2. **`toggleStatut` lit `statuts` par closure** (vs updater) — double-clic même frame théorique, non-RGPD. Laissé (permet
   le partage atomique de `next` avec le miroir ; un click flush entre deux).
3. **`unaccent(colonne)` non indexable** → scan séquentiel (perf uniquement, base admin petite ; index volontairement
   différé, cf. LOT A-1). Documenté (B1).
4. **`detailId` non remis à null après effacement** (le cap de scroll restait levé) — **CORRIGÉ** : ajout de
   `setDetailId(null)` dans `soumettreEffacement` (cohérent avec `fermerDetail`). Re-vérifié tsc/eslint/npm test/golden.

**Rien de bloquant** ; note 4 corrigée, notes 1-3 documentées (décisions/perf).
