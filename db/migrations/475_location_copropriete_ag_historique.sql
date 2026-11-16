-- 475_location_copropriete_ag_historique.sql — L'HISTORIQUE DES ASSEMBLÉES GÉNÉRALES D'UNE COPROPRIÉTÉ (Arno, 16/11/2026).
--
-- LE BESOIN : « Valider la sortie » avec la « Retenue de 20 % du dépôt de garantie » demande la DERNIÈRE AG tenue et la PROCHAINE AG
-- (projetée ou officielle). Règle d'Arno : les AG appartiennent à la COPROPRIÉTÉ (le syndicat des copropriétaires), jamais au syndic — un
-- changement de syndic ne fait rien perdre (le syndic est relié à la copropriété par `gestion_copropriete_syndic`, à part). Une copropriété
-- peut couvrir plusieurs adresses (335) : elles partagent ses AG. Le digicode reste sur l'immeuble de l'adresse (396), inchangé.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · une table d'HISTORIQUE, une ligne par date saisie (jamais d'écrasement, ni UPDATE, ni DELETE, ni TRUNCATE) : type « dernière AG
--     tenue » / « prochaine AG », statut « officielle » / « projetée », qui, quand, d'où (sortie n° …, fiche du bien, création du bien,
--     reprise) ;
--   · la copropriété est désignée par son identifiant ; un bien encore relié à AUCUNE copropriété garde sa date sous la clé de son immeuble
--     (`cle_immeuble`, la clé de la 377) et son bien : elle est « à rattacher à une copropriété », et rejoint d'elle-même la copropriété dès
--     que cette clé en devient une adresse ;
--   · REPRISE : chaque date unique de la 377 (`gestion_immeuble_ag`) devient la PREMIÈRE entrée de l'historique (origine « reprise », même
--     auteur, même date de saisie). La table 377 reste en place, intacte (rien n'est supprimé ni déplacé).
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE (reprise : une seule fois par clé).
-- Suppose 324 (copropriétés), 377 (dernière AG), 468 (sortie validée).
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la dernière AG reste lue et écrite comme avant (377), et la fenêtre « Valider la
-- sortie » dit que l'historique des AG reste à installer (la sortie reste possible).

CREATE TABLE IF NOT EXISTS gestion_copropriete_ag (
  id                  bigserial PRIMARY KEY,
  copropriete_id      bigint NULL REFERENCES gestion_copropriete (id),
  -- la clé de l'immeuble du bien (377) : celle d'un bien sans copropriété, et la trace de la reprise
  cle_immeuble        text NULL CHECK (cle_immeuble IS NULL OR btrim(cle_immeuble) <> ''),
  lot_id              bigint NULL REFERENCES gestion_annuaire_lot (id),
  sortie_validee_id   bigint NULL REFERENCES gestion_location_sortie_validee (id),
  type_ag             text NOT NULL CHECK (type_ag IN ('derniere', 'prochaine')),
  statut              text NOT NULL CHECK (statut IN ('officielle', 'projetee')),
  -- NULL : la date a été RETIRÉE (le champ « Date de la dernière AG » vidé sur la fiche du bien)
  date_ag             date NULL,
  -- « Confirmer cette date comme référence » (fenêtre de sortie) : la même date, reconfirmée
  confirmation        boolean NOT NULL DEFAULT false,
  origine             text NOT NULL CHECK (origine IN ('reprise', 'sortie', 'fiche_bien', 'creation_bien')),
  saisie_le           timestamptz NOT NULL DEFAULT now(),
  saisie_par          bigint NULL,
  saisie_par_libelle  text NOT NULL CHECK (btrim(saisie_par_libelle) <> ''),
  CONSTRAINT gestion_copropriete_ag_cible_chk CHECK (copropriete_id IS NOT NULL OR cle_immeuble IS NOT NULL OR lot_id IS NOT NULL),
  CONSTRAINT gestion_copropriete_ag_sortie_chk CHECK ((origine = 'sortie') = (sortie_validee_id IS NOT NULL)),
  CONSTRAINT gestion_copropriete_ag_derniere_chk CHECK (type_ag = 'prochaine' OR statut = 'officielle')
);

CREATE INDEX IF NOT EXISTS gestion_copropriete_ag_copro_idx ON gestion_copropriete_ag (copropriete_id, saisie_le DESC) WHERE copropriete_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestion_copropriete_ag_cle_idx ON gestion_copropriete_ag (cle_immeuble, saisie_le DESC) WHERE cle_immeuble IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestion_copropriete_ag_lot_idx ON gestion_copropriete_ag (lot_id) WHERE lot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION gestion_copropriete_ag_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : % refusé — l''historique des AG d''une copropriété s''écrit en ajout seul (migration 475)', TG_TABLE_NAME, TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_copropriete_ag_ajout_seul ON gestion_copropriete_ag;
CREATE TRIGGER gestion_copropriete_ag_ajout_seul BEFORE UPDATE OR DELETE ON gestion_copropriete_ag
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_copropriete_ag_refuser();
DROP TRIGGER IF EXISTS gestion_copropriete_ag_no_truncate ON gestion_copropriete_ag;
CREATE TRIGGER gestion_copropriete_ag_no_truncate BEFORE TRUNCATE ON gestion_copropriete_ag
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_copropriete_ag_refuser();

-- LA REPRISE de la 377 : la date unique de chaque immeuble devient la première entrée de son historique (copropriété retrouvée par sa clé
-- principale ou par une de ses adresses en cours ; sinon la clé seule, « à rattacher »).
INSERT INTO gestion_copropriete_ag (copropriete_id, cle_immeuble, type_ag, statut, date_ag, origine, saisie_le, saisie_par, saisie_par_libelle)
SELECT (SELECT c.id FROM gestion_copropriete c
         WHERE c.cle_immeuble = ag.cle_immeuble
            OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = ag.cle_immeuble AND a.retire_le IS NULL ORDER BY a.id LIMIT 1)
         ORDER BY (c.cle_immeuble = ag.cle_immeuble) DESC, c.id LIMIT 1),
       ag.cle_immeuble, 'derniere', 'officielle', ag.derniere_ag, 'reprise', ag.maj_le, ag.maj_par,
       coalesce(nullif(btrim(ag.maj_par_libelle), ''), 'reprise')
  FROM gestion_immeuble_ag ag
 WHERE ag.derniere_ag IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM gestion_copropriete_ag h WHERE h.origine = 'reprise' AND h.cle_immeuble = ag.cle_immeuble);

COMMENT ON TABLE gestion_copropriete_ag IS
  'Historique des AG d''une copropriété (475, Arno 16/11/2026) : dernière tenue / prochaine, officielle / projetée, qui, quand, d''où ; ajout seul ; sans copropriété : clé de l''immeuble (« à rattacher ») ; reprise des dates de la 377.';
COMMENT ON COLUMN gestion_copropriete_ag.cle_immeuble IS 'Clé de l''immeuble du bien (règle de la 377) : rattache d''elle-même l''entrée à la copropriété dont elle est (ou devient) la clé ou une adresse — migration 475.';
COMMENT ON COLUMN gestion_copropriete_ag.sortie_validee_id IS 'La sortie (« Valider la sortie », 468) où la date a été saisie — migration 475.';
