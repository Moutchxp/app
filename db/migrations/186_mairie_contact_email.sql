-- 186_mairie_contact_email.sql — LOT 29 : CARNET MULTI-ADRESSES d'une commune. `mairie_contact` a UNE ligne par commune (PK
-- code_insee) → il ne peut pas « enrichir la liste » sans écraser. Cette table ADDITIVE stocke PLUSIEURS e-mails confirmés par
-- commune, saisis délibérément par Arno depuis le sélecteur de destinataire (« ajouter une adresse absente de la liste »).
--
-- ⚠️ RÈGLE MÉTIER (Arno, LOT 29) : une adresse ajoutée à la main est CONFIRMÉE (saisie délibérée), donc elle rejoint le jeu
-- « toutes les adresses connues de la commune » (règle B, LOT 20/27) — et donc les 2 dernières relances multi-adresse. Assumé.
-- Ne touche AUCUNE donnée existante : `mairie_contact` reste la source annuaire (une ligne/commune), inchangée.
--
-- 🔴 CE QUE FAIT LA MIGRATION : crée `mairie_contact_email` (plusieurs e-mails confirmés/commune) + un index UNIQUE insensible à la
--    casse (code_insee, lower(email)) qui empêche tout doublon en base. Repli sûr côté code si la table manque (source vide → règle B
--    strictement inchangée). N'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). AUCUN envoi ici.
--
-- ADDITIVE PURE : CREATE TABLE/INDEX IF NOT EXISTS. Aucun DROP/UPDATE de données. Idempotente (relançable). GOLDEN-SAFE. Une transaction.
-- Requiert la table `commune` (FK code_insee). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/186_mairie_contact_email.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

CREATE TABLE IF NOT EXISTS mairie_contact_email (
  id         bigserial PRIMARY KEY,
  code_insee char(5) NOT NULL REFERENCES commune(code_insee),
  email      text NOT NULL,
  source     text NOT NULL DEFAULT 'saisie_manuelle' CHECK (source IN ('saisie_manuelle')),
  statut     text NOT NULL DEFAULT 'confirme'        CHECK (statut IN ('confirme','invalide')),
  ajoute_par text,                                   -- id admin qui a saisi l'adresse (traçabilité), NULL si inconnu
  cree_le    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mairie_contact_email IS
  'LOT 29 — carnet MULTI-ADRESSES confirmées d''une commune (plusieurs e-mails/commune, contrairement à mairie_contact qui en a un seul). Source « saisie_manuelle » : adresses ajoutées délibérément par l''exploitant au sélecteur de destinataire. Statut « confirme » → incluses dans le jeu règle B (LOT 20/27). Additive : n''écrase jamais mairie_contact.';

-- Dédoublonnage EN BASE, insensible à la casse : jamais deux fois la même adresse pour une commune (le composer dédoublonne aussi côté code).
CREATE UNIQUE INDEX IF NOT EXISTS mairie_contact_email_insee_email_uk ON mairie_contact_email (code_insee, lower(email));

-- Vérification (non bloquante) :
SELECT count(*) AS lignes_mairie_contact_email FROM mairie_contact_email;

COMMIT;
