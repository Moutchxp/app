-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 326 — LOT SYNDIC-CONTACTS-PAR-COPROPRIETE : LE CATALOGUE DES CONTACTS, ET QUI SUIT QUEL IMMEUBLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « Un grand syndic (Foncia, Citya…) a PLUSIEURS responsables de copropriété et comptables. Les contacts du
-- syndic forment un CATALOGUE ; chaque copropriété se voit AFFECTER ses propres contacts pris dans ce catalogue. »
--
-- MIGRATION D'AJOUT UNIQUEMENT :
--   ① `gestion_syndic_contact.tous_immeubles` — le contact suit TOUS les immeubles du syndic. DÉFAUT VRAI : les
--      contacts existants le deviennent par la valeur par défaut de la colonne, et c'est la seule « écriture » sur
--      l'existant (aucune autre donnée réécrite). C'est aussi ce qu'ils étaient de fait jusqu'ici.
--   ② `gestion_syndic_contact_copropriete` — l'affectation d'un contact à une copropriété (rôle facultatif, date,
--      auteur). Un contact peut suivre plusieurs copropriétés. 🔴 HISTORISÉE : une affectation retirée reçoit
--      `retire_le` (+ qui, pourquoi) ; rien n'est effacé. Un index unique partiel interdit deux affectations EN COURS
--      du même contact au même immeuble.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_syndic_contact ADD COLUMN IF NOT EXISTS tous_immeubles boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS gestion_syndic_contact_copropriete (
  id                  bigserial PRIMARY KEY,
  contact_id          bigint NOT NULL REFERENCES gestion_syndic_contact(id),
  copropriete_id      bigint NOT NULL REFERENCES gestion_copropriete(id),
  role                text,
  affecte_le          timestamptz NOT NULL DEFAULT now(),
  affecte_par         bigint,
  affecte_par_libelle text NOT NULL,
  retire_le           timestamptz,
  retire_par_libelle  text,
  retire_motif        text
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_syndic_contact_copropriete_en_cours
  ON gestion_syndic_contact_copropriete (contact_id, copropriete_id) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_syndic_contact_copropriete_par_copro
  ON gestion_syndic_contact_copropriete (copropriete_id);
COMMENT ON TABLE gestion_syndic_contact_copropriete IS
  'Lot SYNDIC-CONTACTS-PAR-COPROPRIETE (326) — quel contact du catalogue d''un syndic suit quelle copropriété. Historisée : on retire (retire_le), on n''efface jamais.';
