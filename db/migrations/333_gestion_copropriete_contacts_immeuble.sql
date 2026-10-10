-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 333 — LOT COPRO-CONTACTS-IMMEUBLE : UN CARNET DE CONTACTS PROPRE À CHAQUE IMMEUBLE (gardien, conseil syndical…)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « à côté des contacts du syndic, un petit carnet de contacts PROPRE À CHAQUE IMMEUBLE (gardien, conseil
-- syndical…), totalement indépendant du syndic ».
--
-- MIGRATION D'AJOUT UNIQUEMENT : deux tables neuves, AUCUNE donnée existante touchée.
--   ① `gestion_copropriete_contact` — rattaché à la COPROPRIÉTÉ (l'adresse d'immeuble), JAMAIS au syndic : il reste
--      à l'immeuble si le syndic est retiré ou change. Catégorie « gardien » / « conseil_syndical » / « personnalise »
--      (alors un libellé libre OBLIGATOIRE : « Habitant », « Femme de ménage »…), civilité (M. / Mme / rien), prénom,
--      nom, note ; créé / modifié (quand, qui) ; 🔴 RETRAIT HISTORISÉ (`retire_le`, qui) — jamais effacé.
--   ② `gestion_copropriete_contact_coordonnee` — ses téléphones et e-mails, avec libellés (même format que les
--      contacts de syndic). Retirées, jamais effacées.
-- L'anti-doublon (même NOM + prénom, ou même e-mail, DANS LE MÊME IMMEUBLE) est tenu par l'application : un même
-- e-mail peut exister dans deux immeubles, ou chez un syndic — aucun index d'unicité global ici, exprès.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_copropriete_contact (
  id                 bigserial PRIMARY KEY,
  copropriete_id     bigint NOT NULL REFERENCES gestion_copropriete(id),
  categorie          text NOT NULL CHECK (categorie IN ('gardien', 'conseil_syndical', 'personnalise')),
  libelle            text,
  civilite           text CHECK (civilite IN ('M.', 'Mme')),
  prenom             text,
  nom                text,
  note               text,
  rang               integer NOT NULL DEFAULT 0,
  cree_le            timestamptz NOT NULL DEFAULT now(),
  cree_par           bigint,
  cree_par_libelle   text NOT NULL,
  maj_le             timestamptz,
  maj_par_libelle    text,
  retire_le          timestamptz,
  retire_par_libelle text,
  CONSTRAINT gestion_copropriete_contact_libelle_personnalise
    CHECK (categorie <> 'personnalise' OR btrim(coalesce(libelle, '')) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_copropriete_contact_par_copro ON gestion_copropriete_contact (copropriete_id);
COMMENT ON TABLE gestion_copropriete_contact IS
  'Lot COPRO-CONTACTS-IMMEUBLE (333) — les contacts PROPRES à un immeuble (gardien, conseil syndical, personnalisé), indépendants du syndic. Retrait historisé (retire_le), jamais effacé.';

CREATE TABLE IF NOT EXISTS gestion_copropriete_contact_coordonnee (
  id         bigserial PRIMARY KEY,
  contact_id bigint NOT NULL REFERENCES gestion_copropriete_contact(id),
  sorte      text NOT NULL CHECK (sorte IN ('email', 'telephone')),
  libelle    text,
  valeur     text NOT NULL CHECK (btrim(valeur) <> ''),
  rang       integer NOT NULL DEFAULT 0,
  cree_le    timestamptz NOT NULL DEFAULT now(),
  retire_le  timestamptz
);
CREATE INDEX IF NOT EXISTS gestion_copropriete_contact_coordonnee_par_contact ON gestion_copropriete_contact_coordonnee (contact_id);

COMMIT;
