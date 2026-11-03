-- 451_couts_saisis.sql — MON ESPACE « LES COÛTS », LOT 2 (Arno, 03/11/2026, décisions C3, C5, C9, C15) : LES COÛTS SAISIS ET LA FONCTION DES PROFILS.
--
-- LE BESOIN : les salaires chargés se saisissent PAR SALARIÉ et par mois (C3), chacun rattaché à un profil ; « Autres » : plusieurs lignes par mois
-- (libellé + montant) dans chaque famille (C5) ; chaque profil a une ou plusieurs FONCTIONS (vente / location / gestion), cochées dans la page
-- Comptes (C9), pour proposer d'abord les bons profils à la saisie d'un salaire.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `transaction_cout_ligne` : une ligne = un salarié d'un mois (poste « salaires », `compte_id`) ou un frais « Autres » (libellé) ; structure
--     (C7 : location et gestion = CRITERIMMO seulement), famille, année, mois, montant HT ; jamais effacée (`retire_le`, déclencheurs anti-DELETE /
--     TRUNCATE) ; un salarié UNE fois par (structure, famille, mois) ; la TVA de chaque ligne (R2 : « Autres » 20 % ou sans TVA ; salaires : jamais) ;
--   · `admin_compte_fonction` : la fonction d'un profil (plusieurs possibles), retirée par `retire_le` ; PRÉ-COCHÉE d'après les données existantes
--     (origine « deduite ») : service gestion → gestion ; négociateur de la Location (activités, alias) → location ; structure de vente ou
--     négociateur d'une vente → vente ;
--   · le journal de la Transaction accepte l'entité « cout_ligne » (chaque ajout, modification, retrait : avant / après / qui / quand).
-- AUCUNE ligne existante n'est modifiée. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
-- Suppose la 433 (Transaction), la 434 (structures des comptes), la 406 / 432 (Location) et la 341 (service gestion).
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, « Les coûts » reste en lecture et dit « disponible après la mise à jour (migration 451) ».

CREATE TABLE IF NOT EXISTS transaction_cout_ligne (
  id                  bigserial      PRIMARY KEY,
  societe             text           NOT NULL CHECK (societe IN ('criterimmo', 'macj')),
  famille             text           NOT NULL CHECK (famille IN ('vente', 'location', 'gestion')),
  poste               text           NOT NULL CHECK (poste IN ('salaires', 'autres')),
  annee               integer        NOT NULL CHECK (annee BETWEEN 2000 AND 2100),
  mois                integer        NOT NULL CHECK (mois BETWEEN 1 AND 12),
  compte_id           bigint         REFERENCES admin_utilisateur(id),
  libelle             text,
  montant_ht          numeric(14, 2) NOT NULL CHECK (montant_ht >= 0),
  -- R2 d'Arno (03/11/2026) : la TVA PAR LIGNE — « TVA 20 % » (TTC = HT × 1,20) ou « sans TVA » (TTC = HT) ; les salaires chargés : jamais de TVA
  tva                 boolean        NOT NULL DEFAULT false,
  cree_le             timestamptz    NOT NULL DEFAULT now(),
  cree_par_libelle    text           NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le          timestamptz,
  retire_le           timestamptz,
  retire_par_libelle  text,
  -- un salaire : un profil, pas de libellé ; « Autres » : un libellé, pas de profil
  CONSTRAINT transaction_cout_ligne_forme CHECK ((poste = 'salaires' AND compte_id IS NOT NULL AND libelle IS NULL)
                                              OR (poste = 'autres' AND compte_id IS NULL AND btrim(coalesce(libelle, '')) <> '')),
  CONSTRAINT transaction_cout_ligne_tva CHECK (poste = 'autres' OR tva = false),
  -- C7 : la location et la gestion sont à CRITERIMMO
  CONSTRAINT transaction_cout_ligne_structure CHECK (famille = 'vente' OR societe = 'criterimmo')
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_cout_ligne_un_salaire_idx
  ON transaction_cout_ligne (societe, famille, annee, mois, compte_id) WHERE poste = 'salaires' AND retire_le IS NULL;
CREATE INDEX IF NOT EXISTS transaction_cout_ligne_mois_idx ON transaction_cout_ligne (annee, mois) WHERE retire_le IS NULL;
COMMENT ON TABLE transaction_cout_ligne IS
  'Coûts saisis de « Les coûts » (migration 451) : salaires chargés par salarié, frais « Autres » ; montants HT ; jamais effacés (retire_le), journalisés (transaction_journal, entité cout_ligne).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_cout_ligne_sans_effacement') THEN
    CREATE TRIGGER transaction_cout_ligne_sans_effacement BEFORE DELETE ON transaction_cout_ligne FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_cout_ligne_sans_vidage') THEN
    CREATE TRIGGER transaction_cout_ligne_sans_vidage BEFORE TRUNCATE ON transaction_cout_ligne FOR EACH STATEMENT EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
END $$;

ALTER TABLE transaction_journal DROP CONSTRAINT IF EXISTS transaction_journal_entite_check;
ALTER TABLE transaction_journal ADD CONSTRAINT transaction_journal_entite_check
  CHECK (entite = ANY (ARRAY['vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois', 'personne', 'negociateur_statut', 'location_salaires_mois',
                             'cout_ligne']));

CREATE TABLE IF NOT EXISTS admin_compte_fonction (
  id                  bigserial    PRIMARY KEY,
  compte_id           bigint       NOT NULL REFERENCES admin_utilisateur(id),
  fonction            text         NOT NULL CHECK (fonction IN ('vente', 'location', 'gestion')),
  origine             text         NOT NULL DEFAULT 'saisie' CHECK (origine IN ('saisie', 'deduite')),
  pose_le             timestamptz  NOT NULL DEFAULT now(),
  pose_par_libelle    text,
  retire_le           timestamptz,
  retire_par_libelle  text
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_compte_fonction_vivante_idx ON admin_compte_fonction (compte_id, fonction) WHERE retire_le IS NULL;
COMMENT ON TABLE admin_compte_fonction IS
  'Les fonctions d''un profil (vente / location / gestion, plusieurs possibles) — page Comptes, migration 451 ; jamais effacées : retire_le.';

-- Le pré-cochage (C9), une seule fois : seulement pour un profil qui n'a encore AUCUNE fonction (une fonction retirée à la main ne revient pas).
-- Chaque source n'est lue que si sa table existe (une base sans la 432 ou la 434 garde les autres sources).
DO $$
DECLARE sources text[] := ARRAY['SELECT u.id AS compte_id, ''gestion''::text AS fonction FROM admin_utilisateur u WHERE u.service_gestion IS TRUE'];
BEGIN
  IF to_regclass('gestion_location_activite') IS NOT NULL THEN
    sources := array_append(sources, 'SELECT a.negociateur_id, ''location'' FROM gestion_location_activite a JOIN admin_utilisateur u ON u.id = a.negociateur_id WHERE a.annule_le IS NULL');
  END IF;
  IF to_regclass('gestion_location_negociateur_alias') IS NOT NULL THEN
    sources := array_append(sources, 'SELECT x.compte_id, ''location'' FROM gestion_location_negociateur_alias x WHERE x.retire_le IS NULL');
  END IF;
  IF to_regclass('transaction_societe_compte') IS NOT NULL THEN
    sources := array_append(sources, 'SELECT s.compte_id, ''vente'' FROM transaction_societe_compte s WHERE s.retire_le IS NULL');
    sources := array_append(sources, 'SELECT v.negociateur_entree_id, ''vente'' FROM transaction_vente v WHERE v.negociateur_entree_id IS NOT NULL AND v.retire_le IS NULL');
    sources := array_append(sources, 'SELECT v.negociateur_sortie_id, ''vente'' FROM transaction_vente v WHERE v.negociateur_sortie_id IS NOT NULL AND v.retire_le IS NULL');
  END IF;
  EXECUTE format('INSERT INTO admin_compte_fonction (compte_id, fonction, origine, pose_par_libelle)
    SELECT DISTINCT d.compte_id, d.fonction, ''deduite'', ''migration 451'' FROM (%s) d
     WHERE NOT EXISTS (SELECT 1 FROM admin_compte_fonction f WHERE f.compte_id = d.compte_id)', array_to_string(sources, ' UNION '));
END $$;

-- Le journal des comptes accepte l'action « changement_fonctions » (avant / après, auteur, date).
ALTER TABLE admin_utilisateur_log DROP CONSTRAINT IF EXISTS admin_utilisateur_log_action_check;
ALTER TABLE admin_utilisateur_log ADD CONSTRAINT admin_utilisateur_log_action_check
  CHECK (action = ANY (ARRAY['creation', 'desactivation', 'reactivation', 'changement_role', 'changement_permissions', 'reinitialisation_mot_de_passe',
                             'changement_mot_de_passe', 'changement_identite', 'changement_service_gestion', 'changement_statut', 'changement_commissionne',
                             'changement_fonctions']));
