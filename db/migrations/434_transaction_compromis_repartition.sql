-- 434_transaction_compromis_repartition.sql — TUILE « TRANSACTION », LOT D (Arno, 27/10/2026) : L'ONGLET « COMPROMIS », LA SOCIÉTÉ DE
-- CHAQUE COLLABORATEUR ET LA RÉPARTITION DE LA COMMISSION.
--
-- DÉCISIONS D'ARNO :
--   · un compromis porte ses vendeurs et acquéreurs (nom, téléphone, e-mail, adresse — jamais deux fiches pour une personne), l'adresse
--     du bien, la date du compromis et la date prévue de l'acte, le négociateur d'ENTRÉE et celui de SORTIE du mandat, l'apporteur
--     (annuaire des apporteurs de la Location) et sa rétrocession ; « Acte signé » le fait passer en vente au mois de l'acte ;
--   · chaque collaborateur a une SOCIÉTÉ (CRITERIMMO / MACJ), datée : un changement ne réécrit pas le passé ;
--   · la commission NETTE (commission − rétrocession de l'apporteur) se répartit entre des PARTIES : entrée, sortie, et une éventuelle
--     partie EXTÉRIEURE (hors CA) ; chaque part interne va au CA de la société de son négociateur au moment de la vente.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `transaction_societe_compte` : la société d'un compte À COMPTER d'une date (une ligne par changement, signée) ;
--   · `transaction_personne` et `transaction_vente_personne` : les fiches des vendeurs / acquéreurs et leur place dans une vente ;
--   · sur `transaction_vente`, des colonnes NEUVES et vides (adresse du bien, dates, négociateurs d'entrée et de sortie, apporteur,
--     rétrocession, et `repartition` À FAUX : l'historique importé garde sa règle, sa société et ses « ventes à attribuer ») ;
--   · `transaction_partie` : les parties de la répartition d'une vente, avec la société FIGÉE au moment de la vente ;
--   · le journal accepte l'entité « personne » ; « partie » et « vente_personne » se journalisent sur la vente.
--   · 🔴 RIEN NE S'EFFACE : ni DELETE ni TRUNCATE sur les tables neuves (mêmes déclencheurs que la 433) ; une ligne se retire par
--     `retire_le`, réversible.
-- AUCUNE ligne existante n'est modifiée ; aucune donnée n'est posée (la société des comptes existants : script à part,
-- `transaction:societes`, à blanc par défaut).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction. Suppose la 433.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la tuile fonctionne comme avant (onglet « Compromis » en lecture, avec la
-- mention « disponible après la mise à jour (migration 434) ») ; la page Comptes montre la société sans l'exiger ni l'écrire.

-- ── La société de chaque collaborateur, datée ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_societe_compte (
  id                 bigserial     PRIMARY KEY,
  compte_id          bigint        NOT NULL REFERENCES admin_utilisateur(id),
  societe            text          NOT NULL CHECK (societe IN ('criterimmo', 'macj')),
  -- La société vaut À COMPTER de ce jour ; la précédente vaut jusqu'à la veille.
  depuis             date          NOT NULL,
  -- 'saisie' : page Comptes ; 'deduction' : lue dans les fichiers importés (script `transaction:societes`).
  origine            text          NOT NULL CHECK (origine IN ('saisie', 'deduction')),
  motif              text,
  pose_le            timestamptz   NOT NULL DEFAULT now(),
  pose_par           bigint        REFERENCES admin_utilisateur(id),
  pose_par_libelle   text          NOT NULL CHECK (btrim(pose_par_libelle) <> ''),
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_societe_compte_vivant_idx ON transaction_societe_compte (compte_id, depuis) WHERE retire_le IS NULL;
COMMENT ON TABLE transaction_societe_compte IS
  'La société (CRITERIMMO / MACJ) d''un compte collaborateur à compter d''une date (434). Un changement ajoute une ligne ; le passé ne change pas. Jamais effacée : retire_le.';

-- ── Les vendeurs et acquéreurs (une fiche par personne) ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_personne (
  id                 bigserial     PRIMARY KEY,
  nom                text          NOT NULL CHECK (btrim(nom) <> ''),
  telephone          text,
  email              text,
  adresse            text,
  note               text,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le         timestamptz,
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE INDEX IF NOT EXISTS transaction_personne_email_idx ON transaction_personne (lower(btrim(email))) WHERE email IS NOT NULL AND retire_le IS NULL;

CREATE TABLE IF NOT EXISTS transaction_vente_personne (
  id                 bigserial     PRIMARY KEY,
  vente_id           bigint        NOT NULL REFERENCES transaction_vente(id),
  personne_id        bigint        NOT NULL REFERENCES transaction_personne(id),
  role               text          NOT NULL CHECK (role IN ('vendeur', 'acquereur')),
  rang               integer       NOT NULL DEFAULT 0,
  cree_le            timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle   text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_vente_personne_vivant_idx ON transaction_vente_personne (vente_id, personne_id, role) WHERE retire_le IS NULL;

-- ── Les colonnes neuves de la vente (vides pour l'historique) ────────────────────────────────────────────────────────────────
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS adresse_bien          text;
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS date_acte_prevue      date;
-- Le jour de l'acte (« Acte signé ») ; le mois du CA reste `mois_acte`.
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS date_acte             date;
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS negociateur_entree_id bigint REFERENCES admin_utilisateur(id);
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS negociateur_sortie_id bigint REFERENCES admin_utilisateur(id);
-- L'apporteur, choisi dans l'annuaire des apporteurs de la Location (même source), et sa rétrocession TTC saisie à la main.
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS apporteur_id          bigint;
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS retro_apporteur_ttc   numeric CHECK (retro_apporteur_ttc IS NULL OR retro_apporteur_ttc >= 0);
-- VRAI : la vente suit la répartition entre parties (saisies à partir du lot D) ; FAUX : l'historique, inchangé.
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS repartition           boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF to_regclass('gestion_location_apporteur') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_vente_apporteur_id_fkey') THEN
    ALTER TABLE transaction_vente ADD CONSTRAINT transaction_vente_apporteur_id_fkey FOREIGN KEY (apporteur_id) REFERENCES gestion_location_apporteur(id);
  END IF;
END $$;

-- ── Les parties de la répartition (la dernière table créée : sa présence dit « 434 appliquée ») ─────────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_partie (
  id                  bigserial     PRIMARY KEY,
  vente_id            bigint        NOT NULL REFERENCES transaction_vente(id),
  -- 'entree' / 'sortie' du mandat ; 'entree_sortie' : le même négociateur des deux côtés ; 'exterieure' : autre agence, confrère…
  sorte               text          NOT NULL CHECK (sorte IN ('entree', 'sortie', 'entree_sortie', 'exterieure')),
  compte_id           bigint        REFERENCES admin_utilisateur(id),
  negociateur_libelle text,
  -- La société du négociateur AU MOMENT DE LA VENTE, figée ; NULL pour une partie extérieure (hors CA).
  societe             text          CHECK (societe IS NULL OR societe IN ('criterimmo', 'macj')),
  nom                 text,
  coordonnees         text,
  -- La part : un pourcentage de la commission nette, OU un montant HT (l'autre se calcule) ; aucun arrondi.
  pourcentage         numeric       CHECK (pourcentage IS NULL OR (pourcentage >= 0 AND pourcentage <= 100)),
  montant_ht          numeric       CHECK (montant_ht IS NULL OR montant_ht >= 0),
  rang                integer       NOT NULL DEFAULT 0,
  cree_le             timestamptz   NOT NULL DEFAULT now(),
  cree_par_libelle    text          NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le           timestamptz,
  retire_par_libelle  text,
  CHECK ((pourcentage IS NULL) <> (montant_ht IS NULL)),
  CHECK ((sorte = 'exterieure' AND societe IS NULL AND compte_id IS NULL AND btrim(coalesce(nom, '')) <> '')
      OR (sorte <> 'exterieure' AND societe IS NOT NULL AND compte_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS transaction_partie_vente_idx ON transaction_partie (vente_id) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS transaction_partie_societe_idx ON transaction_partie (societe) WHERE retire_le IS NULL;

-- ── Le journal : l'entité « personne » ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE transaction_journal DROP CONSTRAINT IF EXISTS transaction_journal_entite_check;
ALTER TABLE transaction_journal ADD CONSTRAINT transaction_journal_entite_check
  CHECK (entite IN ('vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois', 'personne'));

-- ── Ni DELETE ni TRUNCATE sur les tables neuves (la fonction de la 433) ───────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transaction_societe_compte', 'transaction_personne', 'transaction_vente_personne', 'transaction_partie'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_sans_effacement') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement()',
                     t || '_sans_effacement', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_sans_vidage') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION transaction_refuser_effacement()',
                     t || '_sans_vidage', t);
    END IF;
  END LOOP;
END $$;
