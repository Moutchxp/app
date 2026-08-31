-- 182_config_relance_multi_adresse.sql — LOT 20 : adresser les 2 DERNIÈRES relances d'un parcours à TOUTES les adresses connues de
-- la commune (dest_email ∪ mairie_contact confirmé ∪ prada ∪ répondants réels), au lieu du seul destinataire figé.
--
-- ⚠️ RÈGLE MÉTIER (Arno) : pour la mise sous pression finale, une relance doit toucher toutes les adresses connues de la mairie ;
-- la réponse peut alors revenir de n'importe laquelle (le rattachement est par IDENTIFIANT, jamais par l'expéditeur — vérifié).
--
-- 🔴 GARDE — LE DÉPLOIEMENT NE DOIT RIEN CHANGER : `relance_multi_adresse_active` DÉFAUT FALSE (opt-in). Tant qu'inactif, les
--    relances partent au seul destinataire figé, EXACTEMENT comme avant. N'affecte NI le moteur SVAV, NI le verdict, NI le golden
--    Asnières (29.107259068449615). AUCUN envoi. Deux colonnes ADDITIVES sur config_veille (singleton id=1), avec CHECK.
--
-- SÛR : ADD COLUMN IF NOT EXISTS uniquement. Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une transaction.
-- Requiert config_veille. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/182_config_relance_multi_adresse.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_multi_adresse_active boolean NOT NULL DEFAULT false;
  -- défaut FALSE : opt-in strict. Actif → les 2 dernières relances (ordinaire : avis + saisine ; partiel : dernière relance + annonce) partent à toutes les adresses.

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_multi_adresse_nb_dernieres integer NOT NULL DEFAULT 2
  CHECK (relance_multi_adresse_nb_dernieres BETWEEN 0 AND 10);
  -- nombre des DERNIÈRES relances du parcours servies en multi-adresse (défaut 2). 0 = jamais.

COMMENT ON COLUMN config_veille.relance_multi_adresse_active IS
  'LOT 20 — envoyer les N dernières relances (nb_dernieres) à TOUTES les adresses connues de la commune (dest_email + mairie_contact confirmé + prada + répondants réels) au lieu du seul destinataire figé. DÉFAUT FALSE (opt-in). Rattachement des réponses inchangé (par identifiant).';
COMMENT ON COLUMN config_veille.relance_multi_adresse_nb_dernieres IS
  'LOT 20 — nombre des DERNIÈRES relances du parcours servies en multi-adresse (défaut 2 : ordinaire avis + saisine ; partiel dernière relance + annonce CADA). 0 = jamais.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonnes + valeurs par défaut :'
SELECT relance_multi_adresse_active, relance_multi_adresse_nb_dernieres FROM config_veille WHERE id = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK :
--   ALTER TABLE config_veille DROP COLUMN IF EXISTS relance_multi_adresse_active, DROP COLUMN IF EXISTS relance_multi_adresse_nb_dernieres;
