-- 362_permis_cerfa_ia_reveil.sql — réveille la migration 216, jamais appliquée (préparée la nuit du 16/10/2026).
-- svav:remplace 216_permis_cerfa_ia.sql
--
-- DÉCIDÉE PAR ARNO le 16/10/2026 : déplacée de db/migrations-en-attente/ vers db/migrations/, donc appliquée à la
-- prochaine mise à jour de la prod. Analyse complète : docs/RAPPORT_NUIT_2026-10-16.md, lot 2.
-- ⚠️ La 361 (réveil de 212) reste en attente : une fois 362 appliquée, la mise à jour refuse toute migration numérotée
-- en dessous ; le jour où la 361 sera décidée, elle devra prendre un numéro libre au-dessus du dernier appliqué.
--
-- POURQUOI : la lecture IA du Cerfa (Mistral, payante, lancée à la main par npm run permis:lire-cerfa-ia) n'est pas
-- gardée sans cette table : ni le compte rendu (relancer = repayer), ni la preuve de ce qui a été transmis au prestataire
-- (pages envoyées ou refusées), et la fiche permis de l'admin n'affiche jamais de lecture IA. Le garde-fou « GED
-- inchangée → ne pas rejouer » ne peut pas jouer non plus (il relit la dernière passe enregistrée).
--
-- CONTENU : celui de 216, à l'identique. Table NEUVE et VIDE : rien ne change pour personne tant qu'aucune passe n'est
-- lancée avec --appliquer. Aucune donnée existante touchée, aucun envoi, aucun appel IA. IDEMPOTENTE (IF NOT EXISTS).
-- Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS permis_cerfa_ia (
  id            bigserial   PRIMARY KEY,
  dossier_id    bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  transmission  jsonb       NOT NULL,                         -- JournalTransmissionPiece[] (selectionPagesCerfaIa.ts) : preuve d'envoi
  lecture       jsonb,                                        -- compte rendu structuré IA (null si abstention / échec)
  modele        text,                                         -- modèle IA utilisé (ex. mistral-medium-latest)
  cout_usd      numeric,                                      -- coût de la passe (usage × tarifs liste)
  empreinte_ged text,                                         -- empreinte GED au moment de la passe (péremption / gate anti-rejeu)
  statut        text        NOT NULL,                         -- 'transmis' | 'lu' | 'abstention' | 'echec'
  motif         text,                                         -- motif si 'echec' / 'abstention'
  passe_le      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permis_cerfa_ia_dossier_passe_idx ON permis_cerfa_ia (dossier_id, passe_le DESC);

COMMENT ON TABLE permis_cerfa_ia IS 'CR-2b1 — passes de lecture IA du Cerfa (append-only, une ligne/passe). `transmission` = preuve RGPD de ce qui est sorti de la machine ; `lecture` = compte rendu structuré (informatif, jamais un champ instruit). Réveil de 216 par 362.';
