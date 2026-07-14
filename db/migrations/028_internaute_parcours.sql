-- 028_internaute_parcours.sql — Module INTERNAUTE : STATUT DE COMPLÉTUDE DU TUNNEL (parcours 2 temps A→B).
--
-- MOTIF : le tunnel devient un parcours en DEUX temps.
--   • Écran A (saisie + consentement) : dès qu'AU MOINS UN consentement est coché → profil CRÉÉ, statut 'incomplet'
--     (les coordonnées de A peuvent être fausses : faute de frappe / anonymat volontaire).
--   • Écran B (« certificat prêt » : confirmation email/tél + F2) : à la validation → statut 'complet', coordonnées
--     mises à jour avec celles de B (qui FONT FOI), F2 enregistré si coché.
--   Cette colonne matérialise cette COMPLÉTUDE. Elle sert notamment à l'affichage admin (vert = complet / rouge =
--   incomplet, coordonnées confirmées ou non).
--
-- ⚠️ DISTINCT DU VERDICT : `parcours` = complétude du TUNNEL (bloc A, par personne). Le VERDICT (SANS_VIS_A_VIS…)
--   vit sur `internaute_projet.verdict` (bloc C, par analyse). NE JAMAIS confondre les deux.
--
-- PORTÉE : ALTER TABLE additif idempotent sur `internaute` UNIQUEMENT. Aucune autre table, aucun DROP/TRUNCATE/DELETE.
--   Les lignes EXISTANTES prennent le défaut 'incomplet' (elles n'ont jamais été confirmées via le nouvel Écran B —
--   marquage conservateur/honnête). Le moteur n'est ni rappelé ni modifié → golden 29.107259068449615 inchangé.
--
-- ROLLBACK (non destructif de données ; process validé uniquement) :
--   ALTER TABLE internaute DROP COLUMN IF EXISTS parcours;   -- (destructif de la colonne : à n'exécuter que sciemment)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/028_internaute_parcours.sql
-- Vérification : \d internaute (colonne `parcours`) ; SELECT parcours, count(*) FROM internaute GROUP BY parcours;

BEGIN;

ALTER TABLE internaute
  ADD COLUMN IF NOT EXISTS parcours text NOT NULL DEFAULT 'incomplet'
    CHECK (parcours IN ('incomplet', 'complet'));

COMMENT ON COLUMN internaute.parcours IS
  'Complétude du parcours tunnel : ''incomplet'' (créé à l''Écran A, coordonnées NON confirmées) | ''complet'' (validé à l''Écran B, coordonnées confirmées font foi). DISTINCT du verdict (bloc C).';

COMMIT;
