-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 324 — LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN : L'ANNUAIRE DES SYNDICS DE COPROPRIÉTÉ
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- MIGRATION D'AJOUT UNIQUEMENT. Aucune colonne existante n'est retirée, renommée ni modifiée ; aucune ligne
-- existante n'est écrite. Cinq tables nouvelles :
--
--   ① `gestion_syndic`                — le cabinet : nom, adresse, standard, e-mail générique, note libre ;
--   ② `gestion_copropriete`           — un immeuble, désigné par sa CLÉ : la colonne « Immeuble » de l'export
--                                       WIPPIMMO (`gestion_annuaire_lot.immeuble`), normalisée par
--                                       `normaliserTexte` (minuscules, sans accent ni ponctuation) ;
--   ③ `gestion_copropriete_syndic`    — QUI gère l'immeuble, et depuis quand. 🔴 L'HISTORIQUE EST CONSERVÉ : un
--                                       changement de syndic ou un retrait FERME la ligne (`fin`), il ne l'efface
--                                       jamais. Un index unique partiel garantit UN SEUL syndic en cours par
--                                       immeuble ;
--   ④ `gestion_syndic_contact`        — les interlocuteurs du cabinet : titre, prénom, nom (au moins un des trois) ;
--   ⑤ `gestion_syndic_coordonnee`     — leurs e-mails et téléphones, avec un libellé, autant que voulu.
--
-- 🔴 LE LIEN LOT ↔ COPROPRIÉTÉ N'EST PAS UNE TABLE : il se lit par l'immeuble du lot. Tous les lots dont
-- l'« Immeuble » normalisé vaut la clé d'une copropriété en font partie — y compris ceux qu'un ré-import futur
-- ajoutera. Un syndic → plusieurs copropriétés → plusieurs lots.
--
-- ⚠️ CONTACTS ET COORDONNÉES SE RETIRENT PAR `retire_le`, jamais par DELETE : même règle que le reste du module.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gestion_syndic (
  id                bigserial PRIMARY KEY,
  nom               text NOT NULL CHECK (btrim(nom) <> ''),
  adresse           text,
  telephone         text,
  email             text,
  note              text,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint,
  cree_par_libelle  text NOT NULL,
  maj_le            timestamptz,
  maj_par           bigint,
  maj_par_libelle   text
);
COMMENT ON TABLE gestion_syndic IS
  'Lot ANNUAIRE-SYNDICS (324) — un cabinet syndic de copropriété : nom, adresse, standard, e-mail générique, note.';

CREATE TABLE IF NOT EXISTS gestion_copropriete (
  id                bigserial PRIMARY KEY,
  cle_immeuble      text NOT NULL UNIQUE CHECK (btrim(cle_immeuble) <> ''),
  libelle           text NOT NULL,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint,
  cree_par_libelle  text NOT NULL
);
COMMENT ON TABLE gestion_copropriete IS
  'Lot ANNUAIRE-SYNDICS (324) — un immeuble en copropriété. cle_immeuble = normaliserTexte(gestion_annuaire_lot.immeuble) : les lots s''y rattachent par leur immeuble.';

CREATE TABLE IF NOT EXISTS gestion_copropriete_syndic (
  id                 bigserial PRIMARY KEY,
  copropriete_id     bigint NOT NULL REFERENCES gestion_copropriete(id),
  syndic_id          bigint NOT NULL REFERENCES gestion_syndic(id),
  debut              timestamptz NOT NULL DEFAULT now(),
  fin                timestamptz,
  pose_par           bigint,
  pose_par_libelle   text NOT NULL,
  fin_par            bigint,
  fin_par_libelle    text,
  fin_motif          text,
  CHECK (fin IS NULL OR fin >= debut)
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_syndic_en_cours
  ON gestion_copropriete_syndic (copropriete_id) WHERE fin IS NULL;
CREATE INDEX IF NOT EXISTS gestion_copropriete_syndic_par_syndic
  ON gestion_copropriete_syndic (syndic_id);
COMMENT ON TABLE gestion_copropriete_syndic IS
  'Lot ANNUAIRE-SYNDICS (324) — qui gère quel immeuble, et depuis quand. Historique conservé : on ferme (fin), on n''efface jamais. Un seul syndic en cours par immeuble.';

CREATE TABLE IF NOT EXISTS gestion_syndic_contact (
  id                bigserial PRIMARY KEY,
  syndic_id         bigint NOT NULL REFERENCES gestion_syndic(id),
  titre             text,
  prenom            text,
  nom               text,
  rang              integer NOT NULL DEFAULT 0,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle  text NOT NULL,
  maj_le            timestamptz,
  maj_par_libelle   text,
  retire_le         timestamptz,
  retire_par_libelle text,
  CHECK (btrim(coalesce(titre, '')) <> '' OR btrim(coalesce(nom, '')) <> '' OR btrim(coalesce(prenom, '')) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_syndic_contact_par_syndic ON gestion_syndic_contact (syndic_id);

CREATE TABLE IF NOT EXISTS gestion_syndic_coordonnee (
  id                bigserial PRIMARY KEY,
  contact_id        bigint NOT NULL REFERENCES gestion_syndic_contact(id),
  sorte             text NOT NULL CHECK (sorte IN ('email', 'telephone')),
  libelle           text,
  valeur            text NOT NULL CHECK (btrim(valeur) <> ''),
  rang              integer NOT NULL DEFAULT 0,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  retire_le         timestamptz
);
CREATE INDEX IF NOT EXISTS gestion_syndic_coordonnee_par_contact ON gestion_syndic_coordonnee (contact_id);
