-- 364_internaute_residence.sql — LOT COORDONNEES-CONNU-REEL (16/10/2026) : l'adresse de résidence principale sur le
-- COMPTE de l'internaute.
--
-- POURQUOI : Arno — « quand un internaute CONNECTÉ indique dans une analyse que le bien analysé est sa résidence
-- principale, cette adresse devient l'adresse de résidence principale de son compte ; s'il répond “Non” et saisit son
-- adresse, c'est l'adresse saisie ; une déclaration plus récente remplace la précédente ; chaque changement est journalisé ».
-- L'adresse se modifie aussi dans « Mon compte » (Modifier). Elle préremplit la demande de certificat suivante.
--
-- TROIS COLONNES NEUVES, NULLES, sur `internaute` : aucune valeur posée, aucune ligne existante modifiée, aucun index.
--   adresse_residence        : l'adresse déclarée (texte, PII : effacée avec le reste de l'identité) ;
--   adresse_residence_maj_a  : quand elle a été déclarée pour la dernière fois ;
--   adresse_residence_source : d'où vient la dernière déclaration (liste fermée).
-- Le JOURNAL est celui de la rectification (`internaute_cycle_vie_log`, action 'rectification') : il trace QUEL champ a
-- changé et sa source, jamais l'adresse elle-même (même principe, aucune table de plus).
--
-- IDEMPOTENTE (IF NOT EXISTS). Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son
-- inscription.

ALTER TABLE internaute ADD COLUMN IF NOT EXISTS adresse_residence text;
ALTER TABLE internaute ADD COLUMN IF NOT EXISTS adresse_residence_maj_a timestamptz;
ALTER TABLE internaute ADD COLUMN IF NOT EXISTS adresse_residence_source text
  CONSTRAINT internaute_adresse_residence_source_check
  CHECK (adresse_residence_source IN ('tunnel_bien_analyse', 'tunnel_adresse_saisie', 'espace_client'));

COMMENT ON COLUMN internaute.adresse_residence IS 'Adresse de résidence principale déclarée par l''internaute connecté (tunnel ou Mon compte). PII : effacée à l''anonymisation. Lot COORDONNEES-CONNU-REEL, 16/10/2026.';
COMMENT ON COLUMN internaute.adresse_residence_maj_a IS 'Date de la dernière déclaration de l''adresse de résidence principale.';
COMMENT ON COLUMN internaute.adresse_residence_source IS 'Source de la dernière déclaration : tunnel_bien_analyse (« Oui », le bien analysé), tunnel_adresse_saisie (« Non » + adresse saisie), espace_client (Mon compte).';
