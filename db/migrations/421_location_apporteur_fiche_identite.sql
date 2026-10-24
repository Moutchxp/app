-- 421_location_apporteur_fiche_identite.sql — LOCATION, ANNUAIRE DES APPORTEURS (Arno, 24/10/2026) : LA FICHE D'IDENTITÉ D'UN
-- APPORTEUR EXTERNE. Suite de la 407 (qu'elle suppose appliquée).
--
-- DÉCISION D'ARNO : « Panneau “Fiche” — externe : civilité, nom, prénom, société éventuelle, téléphone(s), e-mail(s), adresse, notes —
-- éditables. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · `civilite`, `adresse`, `notes` (texte, vides pour l'existant) ;
--   · `telephones_autres`, `emails_autres` : les numéros et adresses EN PLUS du téléphone et de l'e-mail principaux (colonnes
--     `telephone` / `email` de la 407, inchangées) — listes vides pour l'existant.
-- (Le coût fixe mensuel, retiré de l'outil par Arno le 24/10/2026, reste en base — `cout_fixe_mensuel`, inutilisé : rien n'est détruit.)
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`ficheIdentiteDisponible`) : sans elle, ces champs ne sont pas proposés.

ALTER TABLE gestion_location_apporteur
  ADD COLUMN IF NOT EXISTS civilite text,
  ADD COLUMN IF NOT EXISTS adresse text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS telephones_autres text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emails_autres text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN gestion_location_apporteur.civilite IS 'Civilité de l''apporteur externe (421) : M., Mme, M. et Mme, ou vide.';
COMMENT ON COLUMN gestion_location_apporteur.telephones_autres IS 'Téléphones en plus du principal (421).';
COMMENT ON COLUMN gestion_location_apporteur.emails_autres IS 'E-mails en plus du principal (421).';
