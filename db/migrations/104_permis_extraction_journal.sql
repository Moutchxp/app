-- 104_permis_extraction_journal.sql — Module VEILLE PERMIS (chantier N5-C) : JOURNAL de l'extraction automatique des
-- caractéristiques depuis le TEXTE de la GED.
-- ⚠️ POURQUOI une TABLE À PART (et AUCUNE colonne ajoutée à permis_corps_batiment) : question de CARDINALITÉ. Le journal porte
-- PLUSIEURS lignes par décision — la valeur RETENUE, les CANDIDATS qui l'expliquent (« niveau fini »…), les cotes ÉCARTÉES —
-- avec pour chacune sa pièce/page/extrait. Ces lignes n'ont aucun logement possible dans la table des corps (1 valeur par champ).
--   DEUX TABLES, DEUX RÔLES :
--     • permis_corps_batiment = la valeur qui FAIT FOI (ce que l'on retient, 1 par champ) ;
--     • permis_extraction_journal (ici) = ce qui a été VU et POURQUOI on a retenu cette valeur-là (audit de la décision).
--
-- FK = dossier_id BIGINT → sitadel_dossier(id) (id technique), comme les autres tables permis ; corps_id → permis_corps_batiment
-- quand la ligne concerne un corps écrit, NULL sinon (candidat non attribué, ou attribution ambiguë ≥2 corps). La colonne
-- `methode` existe DÈS MAINTENANT ('motifs' | 'ia') : seul 'motifs' est produit aujourd'hui, 'ia' est la couture prévue pour le
-- repli IA — on ne migrera pas deux fois.
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE/INDEX IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun trigger, aucun backfill. Ne
-- touche NI le moteur de score (golden 29.107259068449615 intact), NI la migration 103, NI aucune table existante. Idempotente.
-- Un seul BEGIN/COMMIT. Requiert 047 (sitadel_dossier) et 103 (permis_corps_batiment). Application MANUELLE (Arno), arrêt au 1er
-- échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/104_permis_extraction_journal.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.

BEGIN;

CREATE TABLE IF NOT EXISTS permis_extraction_journal (
  id           bigserial   PRIMARY KEY,
  dossier_id   bigint      NOT NULL REFERENCES sitadel_dossier(id)     ON DELETE CASCADE,
  corps_id     bigint      REFERENCES permis_corps_batiment(id)        ON DELETE CASCADE, -- corps écrit concerné ; NULL sinon

  champ        text        NOT NULL,                                   -- quel champ de mesure (« altitude_sommet_ngf », « niveau_fini »…)
  valeur       numeric,                                               -- valeur mesurée (NULL possible pour une trace sans valeur)
  unite        text        CONSTRAINT permis_journal_unite_chk    CHECK (unite    IN ('ngf','m')),   -- 'ngf' = altitude absolue | 'm' = hauteur

  role         text        NOT NULL CONSTRAINT permis_journal_role_chk     CHECK (role     IN ('retenue','candidat','ecartee')),
  methode      text        NOT NULL CONSTRAINT permis_journal_methode_chk  CHECK (methode  IN ('motifs','ia')),
  confiance    text        CONSTRAINT permis_journal_confiance_chk CHECK (confiance IN ('confirmee','a_verifier')), -- sur 'retenue' ; NULL sinon

  reserve      text,                                                  -- phrase de réserve portée AVEC la valeur (affichée avec elle)
  piece        text,                                                  -- nom de fichier de la pièce d'où vient l'extrait
  page         integer,                                               -- page (1-based) dans la pièce
  extrait      text,                                                  -- texte BRUT capté (« NGF +89.46 »)
  extrait_le   timestamptz
);

COMMENT ON TABLE permis_extraction_journal IS
  'N5-C — JOURNAL de l''extraction automatique (audit de la DÉCISION, jamais la valeur qui fait foi — celle-ci vit dans permis_corps_batiment). Plusieurs lignes par décision : la valeur RETENUE, les CANDIDATS qui l''expliquent, les cotes ÉCARTÉES ; chacune avec pièce/page/extrait. Table à part pour la CARDINALITÉ (1 corps ne peut porter qu''une valeur par champ).';
COMMENT ON COLUMN permis_extraction_journal.corps_id IS 'Corps écrit concerné (retenue). NULL si aucun corps (candidat non attribué) ou attribution ambiguë (≥2 corps → n''attribue à aucun).';
COMMENT ON COLUMN permis_extraction_journal.champ IS 'Champ de mesure concerné : « altitude_sommet_ngf » (le sommet), « niveau_fini » (candidat journalisé, jamais promu)…';
COMMENT ON COLUMN permis_extraction_journal.role IS 'retenue = valeur écrite qui fait foi (corps_id renseigné) | candidat = mesuré et explicatif, jamais écrit (ex. niveau fini) | ecartee = valeur de sommet NON écrite : corps_id NON NULL ⇒ une saisie manuelle occupe déjà le champ (invariant), corps_id NULL ⇒ attribution ambiguë (≥2 corps).';
COMMENT ON COLUMN permis_extraction_journal.methode IS 'motifs = extraction par motifs (N5-A/B) — seule produite aujourd''hui | ia = couture prévue pour le repli IA (colonne créée d''avance).';
COMMENT ON COLUMN permis_extraction_journal.confiance IS 'confirmee | a_verifier. Portée sur la ligne ''retenue'' ; NULL sur candidat/ecartee (non pertinent).';
COMMENT ON COLUMN permis_extraction_journal.reserve IS 'Réserve explicite portée avec la valeur (« la cote la plus haute peut appartenir à un bâtiment voisin… »). À afficher partout où la valeur est montrée.';

CREATE INDEX IF NOT EXISTS permis_extraction_journal_dossier_idx ON permis_extraction_journal (dossier_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   \d permis_extraction_journal
--   SELECT count(*) FROM permis_extraction_journal;  -- 0 au départ
--   SELECT indexname FROM pg_indexes WHERE tablename = 'permis_extraction_journal';  -- ..._dossier_idx présent
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'permis_extraction_journal'::regclass AND contype='c';
--
--   -- Choisir un dossier réel : SELECT id FROM sitadel_dossier LIMIT 1;  (remplacer <DID>)
--   -- POSITIF (une ligne 'retenue' avec confiance + réserve) :
--   -- BEGIN;
--   --   INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, piece, page, extrait, extrait_le)
--   --                                  VALUES (<DID>, NULL, 'altitude_sommet_ngf', 89.46, 'ngf', 'retenue', 'motifs', 'a_verifier', 'réserve…', 'PC3.pdf', 2, 'NGF +89.46', now());
--   --   SELECT champ, role, confiance FROM permis_extraction_journal WHERE dossier_id=<DID>;
--   -- ROLLBACK;
--
--   -- NÉGATIFS (doivent ÉCHOUER, transaction annulée) :
--   -- BEGIN; INSERT INTO permis_extraction_journal (dossier_id, champ, role, methode) VALUES (<DID>, 'x', 'X', 'motifs'); ROLLBACK; -- role_chk
--   -- BEGIN; INSERT INTO permis_extraction_journal (dossier_id, champ, role, methode) VALUES (<DID>, 'x', 'retenue', 'gpt'); ROLLBACK; -- methode_chk
--   -- BEGIN; INSERT INTO permis_extraction_journal (dossier_id, champ, role, methode, unite) VALUES (<DID>, 'x', 'retenue', 'motifs', 'cm'); ROLLBACK; -- unite_chk
--   -- BEGIN; INSERT INTO permis_extraction_journal (dossier_id, champ, role, methode, confiance) VALUES (<DID>, 'x', 'retenue', 'motifs', 'sûr'); ROLLBACK; -- confiance_chk
--   -- BEGIN; INSERT INTO permis_extraction_journal (champ, role, methode) VALUES ('x', 'retenue', 'motifs'); ROLLBACK; -- dossier_id NOT NULL
--
--   -- CASCADE (corps supprimé → ses lignes de journal disparaissent ; annulé) :
--   -- BEGIN;
--   --   -- <CID> = un id de permis_corps_batiment du dossier ; INSERT une ligne role='retenue' corps_id=<CID> ; DELETE ce corps ; count = 0.
--   -- ROLLBACK;
