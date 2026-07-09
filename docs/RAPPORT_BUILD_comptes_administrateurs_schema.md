# RAPPORT — build « M3 Lot 1/5 : schéma des comptes administrateurs (SQL seulement) »

> Un seul livrable : `db/migrations/014_comptes_administrateurs.sql` (nouveau). Migration ÉCRITE, **NON appliquée**.
> Aucun code TS touché. Golden bit-identique. **Non committé.**

## Livrable
`db/migrations/014_comptes_administrateurs.sql` — additif/idempotent, conforme au modèle arbitré :
1. **`admin_utilisateur`** : `id`, `identifiant` (UNIQUE + index `lower()` = unicité insensible à la casse),
   `mot_de_passe` (text = HASH, algo choisi au Lot 2), `role` CHECK (`administrateur`|`collaborateur`), `actif`
   (défaut true), **6 permissions** `perm_*` (défaut false), `cree_a`, `derniere_connexion_a` (nullable).
2. **`curation_patrimoine_log.utilisateur_id`** : `ADD COLUMN IF NOT EXISTS bigint REFERENCES admin_utilisateur(id)`,
   **NULLABLE** (les ~248 lignes existantes → NULL = « utilisateur inconnu ») + index.
3. **`admin_utilisateur_log`** : journal d'audit append-only (`action` CHECK sur les 6 actions, `cible_id` NOT NULL,
   `auteur_id` nullable, `avant`/`apres` jsonb).

## A. DÉCISIONS HORS-SPECS
- **Aucune.** La DDL était entièrement spécifiée. Le fichier la reproduit fidèlement, avec commentaires explicatifs
  (NULL sur `utilisateur_id` = entrée antérieure aux comptes ; désactivation remplace la suppression ; FK empêche la
  suppression d'un compte référencé ; hash au Lot 2 ; aucun compte créé ici).

## B. DOUTES
- **B1 (mineur, signalé)** — **redondance `UNIQUE` inline + index `lower(identifiant)`** : la contrainte `UNIQUE`
  sur `identifiant` est sensible à la casse, l'index fonctionnel `lower(identifiant)` est insensible (plus strict).
  Les deux coexistent comme demandé dans la spec. L'index insensible est la contrainte binding ; l'inline est
  redondant mais inoffensif. Conservé tel que spécifié.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` **bit-identique** (aucun TS modifié ; ces tables
    ne sont lues par aucun chemin de score).
  - **DDL non exécutée** : `014_*.sql` est un LIVRABLE ; aucune commande psql/ALTER/CREATE lancée en base.
  - **Relecture ligne-à-ligne (hors commentaires)** : **zéro DROP, zéro DELETE, zéro UPDATE, zéro TRUNCATE**. Le seul
    « hit » du grep initial était la ligne de commentaire « AUCUN DROP… ».
  - **Zéro NOT NULL rétroactif** : `utilisateur_id` (ajouté à une table peuplée) est NULLABLE ; les autres NOT NULL
    portent sur des colonnes de tables NEUVES (créées vides).
  - **Idempotence** : `IF NOT EXISTS` sur les 5 objets DDL (2 CREATE TABLE, 2 INDEX, 1 ADD COLUMN).
  - **Isolation** : ce chantier n'ajoute QUE `014_*.sql`. Aucun autre fichier modifié (les `M` du working tree
    appartiennent au chantier 013 « session journal », non committé, hors périmètre).
  - **INTERDITS non touchés** : moteur, config_scoring, pipeline.itest.ts, page.tsx, session.ts, routes de curation,
    Gemini — intacts.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **461** · `next build` ✓.

## Recon de validation (Phase 8) → **VERDICT : VALIDER**
Migration additive/idempotente/non destructive, fidèle au modèle arbitré, non appliquée (livrable), golden
inchangé (aucun TS, tables hors moteur). Le seul doute (B1) est une redondance inoffensive héritée de la spec.

## Fichiers touchés
- `db/migrations/014_comptes_administrateurs.sql` (nouveau, NON appliqué)
- `docs/RAPPORT_BUILD_comptes_administrateurs_schema.md` (ce rapport)

## ⚠️ RAPPEL À ARNO — application manuelle
Prérequis : **013 doit être appliquée d'abord** (014 ajoute `utilisateur_id` sur `curation_patrimoine_log`, table
déjà en place ; 013 est indépendante mais du même flux — les appliquer dans l'ordre est le plus sûr).
Dans un terminal (après avoir re-exporté `DATABASE_URL` depuis `.env` si nouveau terminal) :
```
source .env   # ou : export DATABASE_URL="…"   (re-exporter depuis .env dans un nouveau terminal)
psql "$DATABASE_URL" -f db/migrations/014_comptes_administrateurs.sql
```
Aucun compte n'est créé par cette migration : le bootstrap du 1er administrateur est le **Lot 2**.
