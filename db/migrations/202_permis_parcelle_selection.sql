-- 202_permis_parcelle_selection.sql — LOT PL-C1 : table de SUPERPOSITION de la sélection de parcelles validée à la main sur la
-- planche cadastrale. Additive et idempotente. Ne touche NI `permis_parcelle`, NI `permis_empreinte`, NI figerEmpreinte, NI aucun
-- lecteur (c'est PL-C2). Ne crée AUCUN déclencheur, AUCune contrainte sur les tables existantes.
--
-- ═══ POURQUOI UNE TABLE DÉDIÉE (et pas origine='saisie' dans permis_parcelle) ═══════════════════════════════════════════════════
-- Écrire la sélection dans `permis_parcelle` avec origine='saisie' PROTÈGE la ligne (la purge automatique ne vise que 'extraite',
-- l'insertion ignore les conflits) : c'est CE mécanisme qui a GELÉ « DI 649 » pour toujours sur le dossier 468. On veut l'inverse :
-- une SUPERPOSITION qui vit À CÔTÉ du résultat automatique, jamais à sa place.
--
-- ═══ RÈGLE DE LECTURE (mise en œuvre en PL-C2, énoncée ici pour l'auditeur) ═════════════════════════════════════════════════════
--   · 0 ligne pour un dossier  → 100 % AUTOMATIQUE : l'empreinte et tout l'aval se dérivent de `permis_parcelle` comme aujourd'hui.
--   · ≥ 1 ligne pour un dossier → SÉLECTION VALIDÉE par un humain : l'empreinte effective sera l'union de CES parcelles (PL-C2).
--   · RETRAIT = un simple DELETE des lignes du dossier. `permis_parcelle` n'ayant JAMAIS bougé, l'automatique réapparaît INTACT,
--     sans rien recalculer (l'empreinte automatique se re-dérive byte-identique de l'union des geom_snapshot d'origine — mesuré).
--
-- geom_snapshot + snapshot_millesime : la géométrie choisie est GELÉE sur la ligne de sélection (comme `permis_parcelle`) pour
-- SURVIVRE au réimport DELETE+append du cadastre (`cadastre:ingest`) — sans ça, un retrait/recompute divergerait si le cadastre
-- bouge entre la validation et le retrait. La RÉSOLUTION de l'IDU sur `parcelle` et le calcul de l'empreinte effective sont PL-C2.
--
-- SÛR : un seul BEGIN/COMMIT ; CREATE TABLE/INDEX IF NOT EXISTS → idempotente (re-jeu = no-op). FK ON DELETE CASCADE (une sélection
-- disparaît avec son dossier). Requiert `sitadel_dossier` (id bigint) et PostGIS. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/202_permis_parcelle_selection.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (attente de confirmation avant PL-C2).

BEGIN;

CREATE TABLE IF NOT EXISTS permis_parcelle_selection (
  id                 bigserial PRIMARY KEY,
  dossier_id         bigint NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  idu                text NOT NULL,                          -- parcelle choisie (référence cadastre à 14 car., résolue sur `parcelle` en PL-C2)
  section            text,
  numero             text,
  prefixe            text,
  geom_snapshot      geometry(MultiPolygon, 2154),          -- géométrie GELÉE (survit au réimport cadastre, comme permis_parcelle.geom_snapshot)
  snapshot_millesime text,
  valide_le          timestamptz NOT NULL DEFAULT now(),
  valide_par         text,
  UNIQUE (dossier_id, idu)                                  -- une parcelle au plus une fois par sélection de dossier
);

COMMENT ON TABLE permis_parcelle_selection IS
  'PL-C — SUPERPOSITION de la sélection de parcelles validée à la main (planche cadastrale). 0 ligne pour un dossier = 100% automatique (empreinte dérivée de permis_parcelle) ; >=1 ligne = sélection humaine (empreinte effective = union de ces parcelles, PL-C2). Le retrait est un DELETE : permis_parcelle n''ayant jamais bougé, l''automatique réapparaît intact sans recalcul. geom_snapshot gelé pour survivre au réimport cadastre.';

CREATE INDEX IF NOT EXISTS permis_parcelle_selection_dossier_idx ON permis_parcelle_selection (dossier_id);
CREATE INDEX IF NOT EXISTS permis_parcelle_selection_gix ON permis_parcelle_selection USING gist (geom_snapshot);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — LECTURE SEULE) :
\echo '>>> Colonnes (attendu : id, dossier_id, idu, section, numero, prefixe, geom_snapshot, snapshot_millesime, valide_le, valide_par) :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'permis_parcelle_selection' ORDER BY ordinal_position;
\echo '>>> Contraintes (attendu : PK, FK dossier_id ON DELETE CASCADE, UNIQUE(dossier_id, idu)) :'
SELECT conname, contype FROM pg_constraint WHERE conrelid = 'permis_parcelle_selection'::regclass ORDER BY contype;
\echo '>>> SRID de geom_snapshot (attendu : 2154) :'
SELECT Find_SRID('public', 'permis_parcelle_selection', 'geom_snapshot') AS srid;
\echo '>>> Index (attendu : pkey, dossier_idx, gix GiST, unique dossier_id/idu) :'
SELECT indexname FROM pg_indexes WHERE tablename = 'permis_parcelle_selection' ORDER BY indexname;
\echo '>>> Table VIDE au départ (aucune sélection = tout automatique) :'
SELECT count(*) AS lignes FROM permis_parcelle_selection;
\echo '>>> permis_parcelle INTACT (cette migration n''y touche pas) :'
SELECT count(*) AS permis_parcelle FROM permis_parcelle;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 RETOUR ARRIÈRE (la table est neuve et vide ; aucune donnée existante affectée) :
--   psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS permis_parcelle_selection;"
