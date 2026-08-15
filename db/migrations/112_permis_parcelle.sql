-- 112_permis_parcelle.sql — Module VEILLE PERMIS (chantier N3-E) : PARCELLES CADASTRALES d'un permis, avec leur IDU.
-- ⚠️ POURQUOI : un permis porte sur une ou plusieurs parcelles (Cerfa : préfixe + section + numéro + superficie PAR parcelle ;
-- Sitadel : sec/num_cadastre1..3, plafonné à 3). On les stocke pour les afficher ET, plus tard, rattacher leur GÉOMÉTRIE via l'IDU
-- (`parcelle.id`). L'IDU est CALCULÉ à l'écriture (commune cadastrale = ARRONDISSEMENT dérivé du numéro de dossier, cf. garde
-- `communeCadastrale` — à Paris « DZ 9 » existe dans 5 arrondissements) et stocké tel quel ; NULL si la commune cadastrale n'a pas
-- pu être tranchée (jamais une parcelle fausse).
--
-- `role` : 'origine' = parcelle d'assiette déposée ; 'finale' = parcelle FUSIONNÉE résultante. ⚠️ Le rôle 'finale' est PRÉVU au
-- schéma mais N'EST PAS ALIMENTÉ aujourd'hui : la fusion est postérieure au dépôt (recon N3-E-A : aucun document d'arpentage / DMPC /
-- parcelle unifiée dans le corpus, 0 occurrence sur 43 pages). On le garde pour le jour où une parcelle fusionnée figurera dans une pièce.
-- `origine` : 'saisie' (à la main) | 'extraite' (auto), alignée sur 103/106.
--
-- SÛR : DDL strictement ADDITIVE (CREATE … IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucune colonne existante touchée. Idempotente.
-- Un seul BEGIN/COMMIT. Requiert `sitadel_dossier` (migration 047). Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/112_permis_parcelle.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

CREATE TABLE IF NOT EXISTS permis_parcelle (
  id                     serial      PRIMARY KEY,
  dossier_id             bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  prefixe                text,                                            -- ex. '000' (Cerfa)
  section                text        NOT NULL,                            -- ex. 'DZ' (tel que déclaré)
  numero                 text        NOT NULL,                            -- ex. '09' ou '9' (tel que déclaré)
  superficie_declaree_m2 numeric,                                          -- superficie PAR parcelle (Cerfa T2T·), non plafonnée
  role                   text        NOT NULL DEFAULT 'origine' CONSTRAINT permis_parcelle_role_chk CHECK (role IN ('origine','finale')),
  origine                text        CONSTRAINT permis_parcelle_origine_chk CHECK (origine IN ('saisie','extraite')),
  idu                    text,                                            -- IDU 14 car. calculé (commune cadastrale + préfixe + section + numéro, paddés) ; NULL si commune indéterminée
  -- confiance/réserve/provenance PORTÉES PAR LA LIGNE (et non par le journal per-champ scalaire) : une parcelle = une ligne, le
  -- journal ne sait pas distinguer plusieurs valeurs d'un même « champ ». Même sémantique que les autres champs, au grain parcelle.
  confiance              text        CONSTRAINT permis_parcelle_confiance_chk CHECK (confiance IN ('confirmee','a_verifier')),
  reserve                text,
  provenance             text,
  maj_le                 timestamptz NOT NULL DEFAULT now(),
  maj_par                text,
  UNIQUE (dossier_id, role, section, numero, prefixe)                     -- idempotence de l'écriture (ON CONFLICT)
);

CREATE INDEX IF NOT EXISTS permis_parcelle_dossier_idx ON permis_parcelle (dossier_id);
CREATE INDEX IF NOT EXISTS permis_parcelle_idu_idx     ON permis_parcelle (idu);

COMMENT ON TABLE permis_parcelle IS 'N3-E — parcelles cadastrales d''un permis (une ligne par parcelle). idu = clé de rattachement à parcelle.id (géométrie) ; NULL si commune cadastrale indéterminée. role=finale prévu mais non alimenté (fusion postérieure au dépôt).';
COMMENT ON COLUMN permis_parcelle.idu IS 'IDU 14 caractères calculé à l''écriture (versIdu) : commune cadastrale (arrondissement dérivé du numéro de dossier) + préfixe(3) + section(2) + numéro(4), zéros de tête paddés. NULL = commune cadastrale indéterminée (aucune parcelle fausse).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonnes de permis_parcelle :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'permis_parcelle' ORDER BY ordinal_position;
\echo '>>> CHECK role/origine + UNIQUE :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'permis_parcelle'::regclass AND contype IN ('c','u') ORDER BY conname;
\echo '>>> index :'
SELECT indexname FROM pg_indexes WHERE tablename = 'permis_parcelle' ORDER BY indexname;
