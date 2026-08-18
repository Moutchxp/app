<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Documents de référence à lire AVANT certains chantiers

- **Avant tout chantier touchant aux données, au verdict, au certificat ou aux permis** : lire
  `docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md` (fraîcheur LiDAR/BD TOPO, règle de contrôle mixte et
  ses deux régimes, sources externes de hauteur, cadre juridique des permis, chiffrage Sitadel,
  conformité/licences, prochain gros chantier). Corpus figé lors de la session des 25-26/07/2026 —
  ne pas redécouvrir ce qui y est déjà établi.

# Contrôle de fin de chantier (OBLIGATOIRE)

- **Le contrôle FINAL de tout chantier est la suite ENTIÈRE : `npm test` (= `vitest run`, 173 fichiers)
  doit être VERT.** Les suites filtrées par chemin (`vitest run app/lib/internaute`, `…/sitadel`,
  `…/permis`) sont des contrôles RAPIDES en cours de travail — **jamais** le contrôle de fin.
- **Pourquoi la règle** : **114 des 173 fichiers de test** vivent HORS de ces 3 sous-ensembles (curation,
  certificat, analytics, auth, comptes, email, pdf…). Précédent qui la justifie : `curation.test.ts` est
  resté **ROUGE du 14/07 au 03/08/2026** — invisible aux contrôles filtrés, chaque chantier le classant
  « pré-existant » sans jamais le voir dans un jeu de contrôle.
- Ne PAS créer d'alias `test:tout` : `npm test` fait déjà exactement ça ; un alias serait une 2e vérité à
  maintenir.

# Écriture des tests — ne jamais figer la FORME d'un SQL émis au runtime

- Un test de route/repo ne doit PAS asserter la forme EXACTE d'une requête SQL émise (regex sur le WHERE
  complet, etc.) : une assertion regex sur du SQL casse au premier reformatage ou ajout de branche.
- Asserter plutôt : **(1) le COMPORTEMENT** (réponse produite, paramètres LIÉS passés à la requête) ; **(2)
  au besoin, le SQL par FRAGMENTS sémantiques** sur une chaîne whitespace-normalisée
  (`sql.replace(/\s+/g, ' ')` puis `toContain(...)`).
- Exemple de la bonne forme : `app/(admin)/api/admin/curation/curation.test.ts` (cas « entité supprimée »).
- Règle pour les **NOUVEAUX** tests. Les ~24 tests existants qui figent encore la forme d'un SQL émis seront
  migrés au fil de l'eau, quand un chantier les touche (pas de chantier de masse).

# Écriture des requêtes spatiales — un KNN ne lit JAMAIS son point d'un CTE multi-référencé

- **Le piège** : un CTE (`WITH …`) produisant un point/une géométrie ET **référencé plusieurs fois** est
  MATÉRIALISÉ par PostgreSQL. Tout opérateur exigeant un opérande scalaire — au premier rang le **KNN `<->`**
  — perd alors son index **EN SILENCE** : ni erreur, ni warning, juste un seq scan de toute la table.
- **La règle** : pour un `<->`, **INLINER** l'expression du point dans le `ORDER BY`
  (`ORDER BY b.geom <-> ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154)`), jamais la lire d'un CTE
  multi-référencé (`pt.g`).
- **Nuance (évite le faux positif)** : les JOIN `ST_Intersects` / `ST_DWithin` ne sont **PAS** concernés — la
  géométrie du CTE pilote une nested loop paramétrée et l'index tient (cas `calageFacade`). N'inline pas par réflexe.
- **Vérification** : tout nouveau `<->` se contrôle par un `EXPLAIN (ANALYZE, BUFFERS)` sur la requête **RÉELLE
  telle qu'émise**, jamais une version simplifiée — une mesure sur un `SELECT id` réduit a fait conclure à tort.
- **Précédents** : `validerOrigine` 1919 ms → 310 ms ; `adressesProches` 629 ms → 125 ms.
