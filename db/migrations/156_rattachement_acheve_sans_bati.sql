-- 156_rattachement_acheve_sans_bati.sql — ÉTAGE 1 : sortir les surélévations du faux état « en attente du bâti ».
--
-- CONTEXTE : une surélévation (ou une transformation à surface constante) ne modifie pas l'emprise au sol → la détection
-- géométrique ne produira JAMAIS de signal (recon établie). La porte DAACT l'ouvrait pourtant en `en_attente_bati`, avec un
-- motif mensonger (« en attente du bâti dans BD TOPO »), et le dossier s'y figeait. On route désormais ces achèvements vers un
-- état HONNÊTE, décidable par un humain, puis clôturable.
--
-- CE LOT AJOUTE DEUX ÉTATS à la liste autorisée de `permis_rattachement.etat` (élargissement du CHECK — strictement PLUS permissif,
-- aucune ligne existante ne le viole) :
--   · `acheve_sans_bati` — achèvement déclaré sur un permis SANS signal géométrique possible : décision humaine attendue
--     (« confirmer l'achèvement et clore »). Compté par la pastille « Rattachement » (groupe « à faire »).
--   · `clos_sans_bati`   — TERMINAL, après confirmation par l'exploitant. Préservé au rejeu (jamais rouvert).
--
-- 🔴 GARDE : AUCUNE injection d'altitude, AUCUN contact moteur/verdict/altitude/certificat. Ne touche NI `batiment`, NI le golden
--   Asnières, NI la préséance « le LiDAR écrase le permis », NI aucun invariant. C'est un état de WORKFLOW.
--
-- SÛR : un seul DROP/ADD de CHECK (élargissement), aucune donnée touchée, aucune autre table. GOLDEN-SAFE. Idempotente (DROP IF
-- EXISTS puis ADD). Une seule transaction. AUCUN ENVOI. Requiert permis_rattachement (116). Application MANUELLE (Arno), arrêt au
-- 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/156_rattachement_acheve_sans_bati.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_rattachement DROP CONSTRAINT IF EXISTS permis_rattachement_etat_chk;
ALTER TABLE permis_rattachement ADD CONSTRAINT permis_rattachement_etat_chk
  CHECK (etat IN ('en_attente_bati', 'arbitrage_demande', 'acheve_sans_bati', 'clos_sans_bati', 'valide', 'refuse', 'annule_par_lidar'));

COMMENT ON COLUMN permis_rattachement.etat IS
  'FUS-3a — état du dossier de rattachement (réévalué en place). en_attente_bati / arbitrage_demande / acheve_sans_bati (ÉTAGE 1 : achèvement sans signal géométrique, à confirmer/clore) / clos_sans_bati (terminal) / valide / refuse / annule_par_lidar. Historique dans permis_rattachement_evenement.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='permis_rattachement_etat_chk';
--     -- doit contenir 'acheve_sans_bati' ET 'clos_sans_bati'
