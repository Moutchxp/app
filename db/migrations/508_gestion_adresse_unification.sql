-- 508_gestion_adresse_unification.sql — 🔴🔴 UNE SEULE ADRESSE OFFICIELLE PAR ADRESSE RÉELLE : LA TRACE DE L'UNIFICATION DU STOCK (Arno, 20/11/2026, lot 5).
--
-- LA DÉCISION D'ARNO (20/11/2026) : « il ne faut qu'une seule adresse, celle de l'auto-complétion unifiée ; on unifie toutes les adresses identiques en une
-- seule adresse officielle ». L'unification du stock (script adresses-officielles-unifier, « --appliquer » après validation du rapport d'essai) écrit en
-- base : elle doit être JOURNALISÉE et RÉVERSIBLE, sans rien supprimer.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · gestion_adresse_operation — une passe d'unification : sa nature, la base, le plan (résumé, conflits « à trancher »), qui et quand ; son annulation
--     (annulee_le, qui) ;
--   · gestion_adresse_operation_trace — CHAQUE écriture de la passe : la table, la ligne, la colonne, la valeur avant et après, le geste (insertion,
--     modification) — ce que l'annulation rejoue à l'envers (une insertion est retirée ou fermée, jamais effacée ; une modification reprend sa valeur) ;
--   · operation_id sur gestion_lot_adresse_ban et gestion_copropriete_adresse — les lignes posées par une passe ;
--   · gestion_copropriete_regroupement.absorbe_le / absorbe_operation_id — un regroupement 504 ABSORBÉ par l'unification (ses adresses sont devenues des
--     écritures d'origine) : il n'est plus proposé au « Dégrouper », il reste en base, son historique intact.
-- Aucune donnée touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE (IF NOT EXISTS) : rejouable.

CREATE TABLE IF NOT EXISTS gestion_adresse_operation (
  id                  bigserial PRIMARY KEY,
  nature              text NOT NULL CHECK (nature IN ('unification_stock')),
  base                text NOT NULL,
  plan                jsonb NOT NULL,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  cree_par            bigint,
  cree_par_libelle    text NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  annulee_le          timestamptz,
  annulee_par_libelle text
);
COMMENT ON TABLE gestion_adresse_operation IS 'Une passe d''unification des adresses officielles (508) : le plan, qui, quand ; son annulation éventuelle.';

CREATE TABLE IF NOT EXISTS gestion_adresse_operation_trace (
  id           bigserial PRIMARY KEY,
  operation_id bigint NOT NULL REFERENCES gestion_adresse_operation(id),
  table_nom    text NOT NULL,
  ligne_id     text NOT NULL,
  colonne      text,
  avant        text,
  apres        text,
  geste        text NOT NULL CHECK (geste IN ('insertion', 'modification')),
  cree_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gestion_adresse_operation_trace_par_operation ON gestion_adresse_operation_trace (operation_id);
COMMENT ON TABLE gestion_adresse_operation_trace IS 'Chaque écriture d''une passe d''unification (508) : table, ligne, colonne, avant, après — ce que l''annulation rejoue à l''envers.';

ALTER TABLE gestion_lot_adresse_ban ADD COLUMN IF NOT EXISTS operation_id bigint REFERENCES gestion_adresse_operation(id);
ALTER TABLE gestion_copropriete_adresse ADD COLUMN IF NOT EXISTS operation_id bigint REFERENCES gestion_adresse_operation(id);
ALTER TABLE gestion_copropriete_regroupement ADD COLUMN IF NOT EXISTS absorbe_le timestamptz;
ALTER TABLE gestion_copropriete_regroupement ADD COLUMN IF NOT EXISTS absorbe_operation_id bigint REFERENCES gestion_adresse_operation(id);
COMMENT ON COLUMN gestion_copropriete_regroupement.absorbe_le IS 'Regroupement 504 absorbé par l''unification des adresses officielles (508) : ses adresses sont des écritures d''origine.';
