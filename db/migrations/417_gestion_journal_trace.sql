-- ══ 417 — LA TRAÇABILITÉ DES FICHES MODIFIÉES DEPUIS « SUIVI DU MOIS » (Arno, 24/10/2026) ═══════════════════════════════
--
-- Le journal des modifications EXISTANT (`gestion_journal` : qui — `auteur_id`, `auteur_libelle` —, quand, entité, avant, après)
-- reçoit quatre colonnes FACULTATIVES, remplies par les modifications faites depuis un écran qui le demande (« Suivi du mois ») :
--   · `sujet`      : « locataire » / « proprietaire » / « lot » — l'entité `annuaire` sert aux propriétaires ET aux locataires,
--                    son identifiant seul ne dit pas de qui il s'agit ;
--   · `champ`      : le champ modifié (une ligne par champ) ;
--   · `session_id` : l'identifiant de la session de connexion (le `jti` du jeton de session) ;
--   · `ecran`      : l'écran d'origine (« Suivi du mois »).
-- Les lignes existantes ne changent pas (colonnes vides). Le journal reste en AJOUT SEUL (son déclencheur est inchangé).
-- Ajout seul, rejouable (IF NOT EXISTS), sans BEGIN/COMMIT (le lanceur l'enveloppe).

ALTER TABLE gestion_journal ADD COLUMN IF NOT EXISTS sujet text;
ALTER TABLE gestion_journal ADD COLUMN IF NOT EXISTS champ text;
ALTER TABLE gestion_journal ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE gestion_journal ADD COLUMN IF NOT EXISTS ecran text;

-- L'historique d'une fiche se lit par entité, du plus récent.
CREATE INDEX IF NOT EXISTS gestion_journal_entite_recent_idx ON gestion_journal (entite, entite_id, survenu_le DESC);
