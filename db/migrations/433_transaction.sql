-- 433_transaction.sql — TUILE « TRANSACTION » (Arno, 27/10/2026) : LE CHIFFRE D'AFFAIRES DE LA VENTE DE CRITERIMMO ET DE MACJ.
--
-- DÉCISIONS D'ARNO : une tuile « Transaction » (droit dédié, comme les autres tuiles) qui ouvre « Transaction CRITERIMMO »,
-- « Transaction MACJ » et « CA global transaction et gestion ». Une vente = société, négociateur(s) et leurs parts, libellé
-- vendeur / acquéreur, honoraires TTC et HT, statut (compromis en cours → vendue), date du compromis, mois de l'acte (le mois du
-- CA), apporteur et rétrocession, paye du négociateur, reste à l'agence, origine (saisie / import d'un fichier) avec l'onglet et
-- la ligne d'origine. La gestion se saisit mois par mois (nombre de lots, honoraires HT, ADHOC, salarié, reste).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · la colonne `admin_utilisateur.perm_transaction`, À FAUX POUR TOUS LES COMPTES (un administrateur a le droit implicitement ;
--     un collaborateur le reçoit par la case « Transaction » de la page Comptes) ;
--   · six TABLES NEUVES `transaction_*` : ventes, leurs lignes d'origine et parts, rétrocessions d'apporteurs, montants mensuels
--     « à rattacher », gestion du mois, et le journal ;
--   · 🔴 RIEN NE S'EFFACE : aucune de ces tables n'accepte DELETE ni TRUNCATE (déclencheurs). Retirer une ligne importée se fait par
--     `retire_le` (réversible) ; le journal n'accepte ni modification ni effacement (chaque geste y laisse sa valeur avant / après).
-- AUCUNE ligne existante n'est lue ni modifiée ; aucune donnée n'est posée (la reprise de l'historique est un script à part,
-- `transaction:importer`, à blanc par défaut).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la tuile n'apparaît qu'aux administrateurs, ses pages disent « disponible
-- après la mise à jour (migration 433) » et n'écrivent rien ; la case « Transaction » de la page Comptes n'écrit rien.

ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_transaction boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN admin_utilisateur.perm_transaction IS
  'Accès au module « Transaction » (tuile de l''accueil, /admin/transaction). Administrateur : implicite (migration 433).';

-- ── Le refus d'effacer (DELETE, TRUNCATE) — et, pour le journal, de modifier ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transaction_refuser_effacement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : rien ne s''efface dans la Transaction (migration 433) — une ligne se retire par retire_le, réversible', TG_TABLE_NAME;
END $$;
CREATE OR REPLACE FUNCTION transaction_journal_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transaction_journal : journal en ajout seul (migration 433) — rien ne s''y modifie ni ne s''y efface';
END $$;

-- ── Les ventes (et compromis) ────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_vente (
  id                 bigserial     PRIMARY KEY,
  societe            text          NOT NULL CHECK (societe IN ('criterimmo', 'macj')),
  libelle            text          NOT NULL CHECK (btrim(libelle) <> ''),
  -- Les honoraires de l'agence, TTC (comme les fichiers) ; le HT en découle (÷ 1,2), sans arrondi.
  honoraires_ttc     numeric       NOT NULL CHECK (honoraires_ttc >= 0),
  honoraires_ht      numeric       GENERATED ALWAYS AS (honoraires_ttc / 1.2) STORED,
  statut             text          NOT NULL CHECK (statut IN ('compromis', 'vendue', 'annulee')),
  -- L'année de rattachement (celle du fichier pour une ligne importée) ; le mois de l'acte (1er du mois) = le mois du CA.
  -- Une vente sans mois = « mois à confirmer » : elle compte dans son année, dans aucun mois.
  annee              integer       NOT NULL CHECK (annee BETWEEN 2000 AND 2100),
  mois_acte          date          CHECK (mois_acte IS NULL OR (extract(day FROM mois_acte) = 1 AND extract(year FROM mois_acte) = annee)),
  date_compromis     date,
  apporteur          text,
  note               text,
  origine            text          NOT NULL CHECK (origine IN ('saisie', 'import')),
  -- L'import : la marque (« import fichier transaction du JJ/MM »), la clé de la ligne d'origine (fichier|onglet|ligne), la source.
  import_marque      text,
  import_cle         text          UNIQUE,
  source_fichier     text,
  source_onglet      text,
  source_ligne       integer,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par           bigint        REFERENCES admin_utilisateur(id),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le         timestamptz,
  retire_le          timestamptz,
  retire_par_libelle text,
  CHECK (origine = 'saisie' OR import_cle IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS transaction_vente_societe_annee_idx ON transaction_vente (societe, annee) WHERE retire_le IS NULL;
COMMENT ON TABLE transaction_vente IS
  'Une vente (ou un compromis) de CRITERIMMO ou de MACJ (433) : honoraires TTC (HT = TTC ÷ 1,2), mois de l''acte = mois du CA (NULL : mois à confirmer). Jamais effacée : retire_le.';

-- ── Les lignes d'origine d'une vente et les parts de rémunération (un négociateur, sa paye ou sa part) ───────────────────────────
CREATE TABLE IF NOT EXISTS transaction_vente_ligne (
  id                 bigserial     PRIMARY KEY,
  vente_id           bigint        NOT NULL REFERENCES transaction_vente(id),
  negociateur        text          NOT NULL CHECK (btrim(negociateur) <> ''),
  -- 'negociateur' : sa paye (MACJ, colonne « paye ») ; 'part' : sa part des honoraires (MACJ, onglets en parts) ; 'vendeur' : la
  -- vente portée par son onglet, sans paye connue (CRITERIMMO).
  role               text          NOT NULL CHECK (role IN ('negociateur', 'part', 'vendeur')),
  montant_ttc        numeric,
  -- Ce que la ligne d'origine disait (« vente » ou « compromis »), et si elle compte dans les honoraires de la vente.
  nature             text          NOT NULL CHECK (nature IN ('vente', 'compromis')),
  compte             boolean       NOT NULL DEFAULT true,
  origine            text          NOT NULL CHECK (origine IN ('saisie', 'import')),
  import_marque      text,
  import_cle         text          UNIQUE,
  source_fichier     text,
  source_onglet      text,
  source_ligne       integer,
  note               text,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE INDEX IF NOT EXISTS transaction_vente_ligne_vente_idx ON transaction_vente_ligne (vente_id);

-- ── Les rétrocessions d'apporteurs (saisies par mois dans les fichiers ; rattachées à une vente, ou « à répartir ») ──────────────
CREATE TABLE IF NOT EXISTS transaction_retrocession (
  id                 bigserial     PRIMARY KEY,
  societe            text          NOT NULL CHECK (societe IN ('criterimmo', 'macj')),
  annee              integer       NOT NULL CHECK (annee BETWEEN 2000 AND 2100),
  mois               integer       NOT NULL CHECK (mois BETWEEN 1 AND 12),
  negociateur        text          NOT NULL CHECK (btrim(negociateur) <> ''),
  montant_ttc        numeric       NOT NULL,
  apporteur          text,
  -- NULL : « à répartir » (le mois du négociateur a plusieurs ventes, ou aucune).
  vente_id           bigint        REFERENCES transaction_vente(id),
  libelle            text,
  origine            text          NOT NULL CHECK (origine IN ('saisie', 'import')),
  import_marque      text,
  import_cle         text          UNIQUE,
  source_fichier     text,
  source_onglet      text,
  source_cellule     text,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le         timestamptz,
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE INDEX IF NOT EXISTS transaction_retrocession_mois_idx ON transaction_retrocession (societe, annee, mois) WHERE retire_le IS NULL;

-- ── Les montants mensuels saisis en dur sans vente (« à rattacher ») : montrés, jamais ajoutés au CA ──────────────────────────
CREATE TABLE IF NOT EXISTS transaction_ca_a_rattacher (
  id                 bigserial     PRIMARY KEY,
  societe            text          NOT NULL CHECK (societe IN ('criterimmo', 'macj')),
  annee              integer       NOT NULL CHECK (annee BETWEEN 2000 AND 2100),
  mois               integer       NOT NULL CHECK (mois BETWEEN 1 AND 12),
  negociateur        text          NOT NULL CHECK (btrim(negociateur) <> ''),
  montant_ttc        numeric       NOT NULL,
  libelle            text,
  origine            text          NOT NULL CHECK (origine IN ('saisie', 'import')),
  import_marque      text,
  import_cle         text          UNIQUE,
  source_fichier     text,
  source_onglet      text,
  source_cellule     text,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le          timestamptz,
  retire_par_libelle text
);

-- ── La gestion, saisie mois par mois (CRITERIMMO) ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_gestion_mois (
  id                 bigserial     PRIMARY KEY,
  annee              integer       NOT NULL CHECK (annee BETWEEN 2000 AND 2100),
  mois               integer       NOT NULL CHECK (mois BETWEEN 1 AND 12),
  nb_lots            integer       CHECK (nb_lots IS NULL OR nb_lots >= 0),
  honoraires_ht      numeric,
  adhoc_ht           numeric,
  salarie_ht         numeric,
  reste_ht           numeric,
  note               text,
  origine            text          NOT NULL CHECK (origine IN ('saisie', 'import')),
  import_marque      text,
  import_cle         text          UNIQUE,
  source_fichier     text,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le         timestamptz,
  retire_le          timestamptz,
  retire_par_libelle text
);
-- Un seul mois actif par (année, mois) : une ligne retirée laisse la place.
CREATE UNIQUE INDEX IF NOT EXISTS transaction_gestion_mois_unique ON transaction_gestion_mois (annee, mois) WHERE retire_le IS NULL;

-- ── Le journal (ajout seul) : chaque saisie, modification, rattachement, retrait ou retour en arrière ──────────────────────────
CREATE TABLE IF NOT EXISTS transaction_journal (
  id                 bigserial     PRIMARY KEY,
  entite             text          NOT NULL CHECK (entite IN ('vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois')),
  entite_id          bigint        NOT NULL,
  action             text          NOT NULL CHECK (btrim(action) <> ''),
  avant              jsonb,
  apres              jsonb,
  commentaire        text,
  -- Le geste dont celui-ci est le retour en arrière (« Annuler cette modification »).
  annule_journal_id  bigint        REFERENCES transaction_journal(id),
  auteur_id          bigint        REFERENCES admin_utilisateur(id),
  auteur_libelle     text          NOT NULL CHECK (btrim(auteur_libelle) <> ''),
  le                 timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transaction_journal_entite_idx ON transaction_journal (entite, entite_id, id DESC);

-- ── Les déclencheurs : ni DELETE ni TRUNCATE nulle part ; le journal, en plus, ni UPDATE ───────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transaction_vente', 'transaction_vente_ligne', 'transaction_retrocession', 'transaction_ca_a_rattacher',
                           'transaction_gestion_mois'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_sans_effacement') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement()',
                     t || '_sans_effacement', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_sans_vidage') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION transaction_refuser_effacement()',
                     t || '_sans_vidage', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_journal_ajout_seul') THEN
    CREATE TRIGGER transaction_journal_ajout_seul BEFORE UPDATE OR DELETE ON transaction_journal
      FOR EACH ROW EXECUTE FUNCTION transaction_journal_refuser();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_journal_sans_vidage') THEN
    CREATE TRIGGER transaction_journal_sans_vidage BEFORE TRUNCATE ON transaction_journal
      FOR EACH STATEMENT EXECUTE FUNCTION transaction_journal_refuser();
  END IF;
END $$;
