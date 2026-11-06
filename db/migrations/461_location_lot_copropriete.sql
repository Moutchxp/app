-- 461_location_lot_copropriete.sql — LOCATION (Arno, 06/11/2026) : LE BIEN EST-IL EN COPROPRIÉTÉ ?
--
-- LE BESOIN (Arno) : le paragraphe de la provision de 20 % (article 22 de la loi de 1989) de l'accusé de préavis et du mail de sortie aux
-- locataires dépend d'une information RÉELLEMENT SAISIE sur le bien — jamais déduite du type de logement ni de l'adresse.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · une colonne `copropriete` sur le lot — Oui (true) / Non (false) / Non renseigné (NULL). Tous les biens existants restent « Non renseigné »
--     (NULL) : AUCUNE ligne existante n'est modifiée ;
--   · le journal des mails de préavis et de sortie (457) accepte une sorte de plus, `sortie_locataires` (le mail de départ aux locataires) :
--     la liste autorisée s'ÉLARGIT (les trois sortes d'avant restent valides ; aucune ligne touchée).
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le choix n'est pas proposé et les mails prennent la phrase « non renseigné ».

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS copropriete boolean;

COMMENT ON COLUMN gestion_annuaire_lot.copropriete IS
  'Le bien est-il dans un immeuble en copropriété ? true = Oui, false = Non, NULL = non renseigné (saisi, jamais déduit) — migration 461.';

DO $$ BEGIN
  IF to_regclass('public.gestion_location_mail_avis') IS NOT NULL THEN
    ALTER TABLE gestion_location_mail_avis DROP CONSTRAINT IF EXISTS gestion_location_mail_avis_sorte_check;
    ALTER TABLE gestion_location_mail_avis ADD CONSTRAINT gestion_location_mail_avis_sorte_check
      CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc', 'sortie_locataires'));
  END IF;
END $$;
