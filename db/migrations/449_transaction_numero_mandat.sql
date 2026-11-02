-- 449_transaction_numero_mandat.sql — MON ESPACE, LOT 2 (Arno, 02/11/2026) : LE NUMÉRO DE MANDAT D'UNE VENTE.
--
-- DÉCISIONS D'ARNO (docs/PLAN_MON_ESPACE.md, « Décisions métier ») :
--   · le n° de mandat est OBLIGATOIRE pour toute CRÉATION de compromis (tuile Suivi CA comme « Mon espace ») ; facultatif pour les compromis
--     et ventes existants (on peut l'ajouter ou le corriger) ;
--   · AUCUN doublon de vente : un même n° n'existe qu'une fois par structure (CRITERIMMO / MACJ), hors fiches annulées et retirées.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `numero_mandat` : le n° tel que saisi ; `numero_mandat_normalise` : sa forme de comparaison, écrite par le serveur (une seule règle,
--     `app/lib/transaction/mandat.ts` — sans accents, majuscules, lettres et chiffres seuls, sans zéros de tête) ;
--   · un index UNIQUE (société, n° normalisé) sur les ventes vivantes et non annulées : un n° annulé ou retiré redevient libre.
-- AUCUNE ligne existante n'est modifiée ; aucune donnée n'est posée (les compromis et l'historique restent sans n°, rien n'est inventé).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction. Suppose la 433.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le champ « N° de mandat » est absent des formulaires (mention « disponible après la
-- mise à jour ») et la création d'un compromis fonctionne comme avant.

ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS numero_mandat text CHECK (numero_mandat IS NULL OR btrim(numero_mandat) <> '');
ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS numero_mandat_normalise text CHECK (numero_mandat_normalise IS NULL OR numero_mandat_normalise <> '');

CREATE UNIQUE INDEX IF NOT EXISTS transaction_vente_mandat_unique ON transaction_vente (societe, numero_mandat_normalise)
  WHERE numero_mandat_normalise IS NOT NULL AND retire_le IS NULL AND statut <> 'annulee';

COMMENT ON COLUMN transaction_vente.numero_mandat IS
  'Le n° de mandat tel que saisi (migration 449) ; obligatoire à la création d''un compromis, facultatif pour les fiches d''avant.';
COMMENT ON COLUMN transaction_vente.numero_mandat_normalise IS
  'La forme de comparaison du n° de mandat (normaliserMandat, mandat.ts) ; unique par société hors fiches annulées et retirées (migration 449).';
