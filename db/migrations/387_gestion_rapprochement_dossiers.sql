-- 387_gestion_rapprochement_dossiers.sql — RAPPROCHEMENT DES DOSSIERS CLIENTS (Arno, 19/10/2026).
--
-- LE BESOIN : la copie de « Documents clients scannés » est terminée (19/10/2026). Chaque dossier propriétaire COPIÉ doit être
-- rattaché à sa fiche propriétaire de l'annuaire, ou à aucune. Le calcul PROPOSE (niveaux SÛR / PROBABLE / AMBIGU / AUCUN),
-- Arno DÉCIDE à l'écran « Rapprochement des dossiers clients » (Valider, Corriger, Aucun rattachement).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : deux tables neuves. AUCUNE table existante n'est modifiée.
--   · `gestion_rapprochement_proposition` : une ligne par dossier copié (ou par client sans dossier), telle que le calcul l'a
--     produite. Chargée une fois par calcul (`app/scripts/gestion-rapprochement-charger.ts`), jamais modifiée.
--   · `gestion_rapprochement_decision` : LE JOURNAL des décisions — datées, attribuées, jamais effacées. Une décision se
--     « modifie » en en posant une nouvelle : la plus récente fait foi, les précédentes restent lisibles.
--   · 🔴 AUCUNE DÉCISION N'ÉCRIT DANS LE DRIVE NI DANS L'ANNUAIRE : elles ne servent qu'au lot suivant (déplacements, repointage
--     de `drive_dossier_id`, corbeille de l'ancienne arborescence), qui les lira et les figera.
--   · Verrou EN BASE : ni UPDATE, ni DELETE, ni TRUNCATE sur les deux tables.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_rapprochement_proposition (
  id bigserial PRIMARY KEY,
  -- L'étiquette du calcul (ex. « 2026-10-19 ») : l'écran lit le plus récent.
  calcul text NOT NULL,
  -- « dossier » : un dossier propriétaire copié ; « client_sans_dossier » : une fiche qu'aucun dossier ne désigne.
  sorte text NOT NULL CONSTRAINT gestion_rapprochement_proposition_sorte_chk CHECK (sorte IN ('dossier', 'client_sans_dossier')),
  -- Identifiant Drive du dossier COPIÉ (sous « Import Documents clients scannés – copie du 18-10-2026 »).
  copie_dossier_id text,
  -- Identifiant du dossier d'origine dans « Documents clients scannés » (lu, jamais écrit).
  archive_dossier_id text,
  nom_dossier text,
  -- « 1 actifs » | « 2 vendus » | « 3 perdus ».
  branche text,
  nb_fichiers integer,
  niveau text NOT NULL CONSTRAINT gestion_rapprochement_proposition_niveau_chk
    CHECK (niveau IN ('SUR', 'PROBABLE', 'AMBIGU', 'AUCUN', 'SANS_DOSSIER')),
  motif text NOT NULL,
  -- La raison en clair, telle que l'écran l'affiche (« même nom + locataire DUPONT connu »).
  raison text NOT NULL,
  proprietaire_id bigint REFERENCES gestion_annuaire_proprietaire(id),
  -- Les fiches candidates (identifiants), pour un AMBIGU ou des homonymes.
  candidats bigint[] NOT NULL DEFAULT '{}',
  controle_oeil boolean NOT NULL DEFAULT false,
  vendu_en_gestion boolean NOT NULL DEFAULT false,
  -- Plusieurs dossiers SÛRS pour une même fiche : la clé du groupe, et le dossier principal proposé.
  groupe_plusieurs text,
  principal boolean NOT NULL DEFAULT false,
  -- Le dossier actuel de la fiche (ancienne arborescence), pour le plan du lot suivant.
  ancien_dossier_id text,
  dernier_fichier_le timestamptz,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_rapprochement_proposition_dossier_chk CHECK (sorte <> 'dossier' OR copie_dossier_id IS NOT NULL),
  CONSTRAINT gestion_rapprochement_proposition_client_chk CHECK (sorte <> 'client_sans_dossier' OR proprietaire_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_rapprochement_proposition_dossier_uniq
  ON gestion_rapprochement_proposition (calcul, copie_dossier_id) WHERE sorte = 'dossier';
CREATE UNIQUE INDEX IF NOT EXISTS gestion_rapprochement_proposition_client_uniq
  ON gestion_rapprochement_proposition (calcul, proprietaire_id) WHERE sorte = 'client_sans_dossier';

CREATE TABLE IF NOT EXISTS gestion_rapprochement_decision (
  id bigserial PRIMARY KEY,
  proposition_id bigint NOT NULL REFERENCES gestion_rapprochement_proposition(id),
  -- « valider » (la fiche proposée), « corriger » (une autre fiche, choisie par recherche), « aucun » (aucun rattachement).
  geste text NOT NULL CONSTRAINT gestion_rapprochement_decision_geste_chk CHECK (geste IN ('valider', 'corriger', 'aucun')),
  proprietaire_id bigint REFERENCES gestion_annuaire_proprietaire(id),
  -- Posée par « Valider tous les SÛRS ».
  en_masse boolean NOT NULL DEFAULT false,
  decide_le timestamptz NOT NULL DEFAULT now(),
  decide_par bigint,
  decide_par_libelle text NOT NULL,
  CONSTRAINT gestion_rapprochement_decision_fiche_chk CHECK ((geste = 'aucun') = (proprietaire_id IS NULL))
);
CREATE INDEX IF NOT EXISTS gestion_rapprochement_decision_par_proposition ON gestion_rapprochement_decision (proposition_id, id DESC);

-- Le verrou : ajout seul, sur les deux tables.
CREATE OR REPLACE FUNCTION gestion_rapprochement_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : ajout seul (% refusé) — migration 387', TG_TABLE_NAME, TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_rapprochement_proposition_verrou ON gestion_rapprochement_proposition;
CREATE TRIGGER gestion_rapprochement_proposition_verrou BEFORE UPDATE OR DELETE ON gestion_rapprochement_proposition
  FOR EACH ROW EXECUTE FUNCTION gestion_rapprochement_ajout_seul();
DROP TRIGGER IF EXISTS gestion_rapprochement_proposition_no_truncate ON gestion_rapprochement_proposition;
CREATE TRIGGER gestion_rapprochement_proposition_no_truncate BEFORE TRUNCATE ON gestion_rapprochement_proposition
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rapprochement_ajout_seul();
DROP TRIGGER IF EXISTS gestion_rapprochement_decision_verrou ON gestion_rapprochement_decision;
CREATE TRIGGER gestion_rapprochement_decision_verrou BEFORE UPDATE OR DELETE ON gestion_rapprochement_decision
  FOR EACH ROW EXECUTE FUNCTION gestion_rapprochement_ajout_seul();
DROP TRIGGER IF EXISTS gestion_rapprochement_decision_no_truncate ON gestion_rapprochement_decision;
CREATE TRIGGER gestion_rapprochement_decision_no_truncate BEFORE TRUNCATE ON gestion_rapprochement_decision
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rapprochement_ajout_seul();

COMMENT ON TABLE gestion_rapprochement_proposition IS 'Proposition de rattachement d''un dossier client copié à une fiche propriétaire, telle que le calcul l''a produite ; ajout seul — migration 387.';
COMMENT ON TABLE gestion_rapprochement_decision IS 'Journal des décisions d''Arno sur le rapprochement des dossiers clients (la plus récente fait foi) ; aucune écriture Drive ; ajout seul — migration 387.';
