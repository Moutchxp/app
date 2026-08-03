-- 2026-08-03e_restauration_paris.sql — SEED (chantier S23) : RESTAURE l'adresse postale BASU de Paris (75056).
--
-- POURQUOI : l'adresse postale de Paris (Bureau Accueil et Service à l'Usager de la Direction de l'Urbanisme), posée par la
-- migration 051, a été effacée par une édition manuelle antérieure — la route /contact mettait `adresse_postale` à NULL dès
-- que le canal n'était plus 'courrier' (comportement supprimé en S23 : `champsCoordonnees`). On repose ici la valeur EXACTE
-- de db/migrations/051_mairie_canal.sql:59, sans rien d'autre changer.
--
-- GARDES :
--   • UPDATE ... FROM cible — JAMAIS d'INSERT (la ligne 75056 existe). Si elle manquait, la cible serait vide → no-op.
--   • NE TOUCHE NI au canal NI à l'e-mail NI à l'URL : seule `adresse_postale` (+ `maj_le`) est écrite. Le canal actuel de
--     Paris ('formulaire') reste valide — la contrainte de cohérence n'exige que l'URL pour 'formulaire', et autorise une
--     adresse postale non nulle en plus (cf. RECON S23).
--   • IDEMPOTENCE DE CONTENU : la cible ne retient la ligne QUE si `adresse_postale IS DISTINCT FROM` la valeur cible →
--     rejouer une fois restaurée ne fait RIEN (ni UPDATE, ni doublon de journal).
--   • JOURNALISÉ : une ligne de journal (e-mail INCHANGÉ : email_avant = email_apres) UNIQUEMENT si la restauration a lieu.
--   • Un seul BEGIN/COMMIT. Aucun DELETE/ALTER.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed/2026-08-03e_restauration_paris.sql

BEGIN;

-- Snapshot unique : la ligne Paris SI (et seulement si) son adresse diffère de la valeur cible (idempotence de contenu).
WITH cible AS (
  SELECT mc.code_insee, mc.email AS email_actuel
  FROM mairie_contact mc
  WHERE mc.code_insee = '75056'
    AND mc.adresse_postale IS DISTINCT FROM
        'Direction de l''Urbanisme — Bureau Accueil et Service à l''Usager (BASU), 6 promenade Claude-Lévi-Strauss, CS 51388, 75639 PARIS CEDEX 13'
),
-- Journal append-only piloté par le MÊME ensemble `cible` (e-mail inchangé → email_avant = email_apres).
journal AS (
  INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
  SELECT code_insee, email_actuel, email_actuel, 'saisie_manuelle',
         'S23 : restauration de l''adresse postale BASU (Direction de l''Urbanisme de Paris), effacée par une édition antérieure — canal et e-mail inchangés',
         NULL
  FROM cible
  RETURNING 1
)
UPDATE mairie_contact mc SET
  adresse_postale = 'Direction de l''Urbanisme — Bureau Accueil et Service à l''Usager (BASU), 6 promenade Claude-Lévi-Strauss, CS 51388, 75639 PARIS CEDEX 13',
  maj_le = now()
FROM cible c
WHERE mc.code_insee = c.code_insee;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- (a) l'adresse est restaurée, canal et e-mail inchangés :
--   SELECT code_insee, canal, email, adresse_postale FROM mairie_contact WHERE code_insee = '75056';
--
--   -- (b) exactement 1 ligne de journal de restauration (aucun doublon si on rejoue) :
--   SELECT count(*) FROM mairie_contact_journal
--    WHERE code_insee = '75056' AND motif LIKE 'S23 : restauration%';
