-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 345 — LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET : LE RÉGLAGE DES NOUVELLES RÈGLES
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DÉCISIONS D'ARNO (13/10/2026) : de nouvelles règles de rattachement automatique (R1 à R4, A, B), et la DÉCISION C :
-- « RIEN n'est appliqué aux mails DÉJÀ arrivés. Les nouvelles règles valent uniquement pour les mails reçus APRÈS la
-- mise en service. »
--
-- 🔴 MIGRATION D'AJOUT, ET SEULEMENT D'AJOUT : une table neuve, d'UNE ligne. Aucune ligne existante n'est lue,
-- modifiée ni supprimée ; aucune autre table n'est touchée.
--
--   · `mise_en_service` : l'instant où cette migration est APPLIQUÉE. Le moteur n'applique les nouvelles règles
--     qu'aux mails REÇUS à partir de cet instant ; tout mail plus ancien garde EXACTEMENT le traitement d'avant.
--     Sans cette table, le moteur se comporte exactement comme avant ce lot ;
--   · `ancien_locataire_mois` : la règle B — un ancien locataire qui écrit après son départ est rattaché
--     automatiquement à son DERNIER bien pendant ce nombre de mois après sa date de sortie (15 par défaut), puis
--     seulement proposé. Réglable (0 à 120) ;
--   · `modifie_le` / `modifie_par_libelle` : qui a changé le réglage, et quand.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_rattachement_reglage (
  id                     smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mise_en_service        timestamptz NOT NULL DEFAULT now(),
  ancien_locataire_mois  integer     NOT NULL DEFAULT 15 CHECK (ancien_locataire_mois BETWEEN 0 AND 120),
  modifie_le             timestamptz NOT NULL DEFAULT now(),
  modifie_par_libelle    text        NOT NULL DEFAULT 'migration 345' CHECK (btrim(modifie_par_libelle) <> '')
);

INSERT INTO gestion_rattachement_reglage (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
