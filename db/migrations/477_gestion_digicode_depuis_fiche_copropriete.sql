-- 477_gestion_digicode_depuis_fiche_copropriete.sql — LE JOURNAL DES DIGICODES DIT « DEPUIS LA FICHE COPROPRIÉTÉ » (Arno, 16/11/2026, chantier
-- « Fiche Copropriété », lot 3).
--
-- LE BESOIN : les digicodes (commun et par bâtiment) se saisissent désormais aussi dans la fiche Copropriété. Le journal des digicodes
-- (`gestion_immeuble_digicode_journal`, 396) dit d'où vient chaque changement ; sa liste fermée ne connaissait que la fiche syndic, la fiche
-- du bien, le nouveau bien et la reprise. Écrire « fiche_syndic » pour une saisie faite dans la fiche Copropriété serait FAUX.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la valeur « fiche_copropriete » s'ajoute aux origines permises ; les quatre d'avant restent valables ; aucune
-- ligne n'est touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose la 396.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la fiche Copropriété dit que la saisie des digicodes y attend la mise à jour de la
-- base, et rien n'est écrit ; les autres saisies du digicode sont inchangées.

ALTER TABLE gestion_immeuble_digicode_journal DROP CONSTRAINT IF EXISTS gestion_immeuble_digicode_journal_depuis_check;
ALTER TABLE gestion_immeuble_digicode_journal ADD CONSTRAINT gestion_immeuble_digicode_journal_depuis_check
  CHECK (depuis IN ('fiche_syndic', 'fiche_bien', 'nouveau_bien', 'reprise', 'fiche_copropriete'));

COMMENT ON COLUMN gestion_immeuble_digicode_journal.depuis IS 'D''où vient le changement : fiche_syndic, fiche_bien, nouveau_bien, reprise, fiche_copropriete (477).';
