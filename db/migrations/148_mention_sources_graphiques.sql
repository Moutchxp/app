-- 148_mention_sources_graphiques.sql — Module VEILLE PERMIS (lot S-DWG) : TROISIÈME tiret OPTIONNEL du corps des demandes
-- CRPA — les FICHIERS SOURCES des pièces graphiques (DWG, DXF). Suite mesurée de l'échec de la projection d'emprise sur 5
-- sources PDF (un PDF est un format d'impression : chaque producteur y perd soit la fermeture des polygones, soit le
-- nommage des calques, soit l'ancrage d'échelle ; les sources DWG/DXF portent tout cela). La GED ne contient à ce jour
-- que des PDF, aucun fichier source — on ne les a jamais demandés.
--
-- FRONTIÈRE JURIDIQUE (verrouillée) : les plans d'architecte au dossier sont communicables (unité du dossier, CRPA
-- L. 311-1) et l'architecte ne peut s'y opposer. MAIS ① l'administration communique dans le FORMAT dont elle DISPOSE
-- (elle n'a pas à produire ce qu'elle n'a pas) ② les fichiers sources ne sont PAS une pièce Cerfa réglementaire. D'où :
-- AUCUNE référence d'article pour ce tiret (contrairement à PC2/R.431-9 et PC3), et une formulation qui N'OBLIGE À RIEN.
--
-- MODÈLE : identique aux mentions S40 (migration 072) — un booléen d'activation + un texte éditable, pilotables sans code
-- (Arno peut couper la mention depuis Réglages). ⚠️ SEULE DIFFÉRENCE : ici le défaut est ACTIF (opt-out) et le texte est
-- PRÉ-RÉDIGÉ (le porteur a arbitré le libellé mot pour mot), là où S40 posait des défauts « désactivé / vide ».
--
-- FRONTIÈRE D'INSERTION : ce tiret rejoint la LISTE des pièces (après PC3), dans genererTexte, POUR LES DEMANDES
-- (variantes e-mail « entreprise » et « personne »). Il n'entre NI dans le corps du canal 'formulaire' (validé au mot
-- près, comme les mentions S40 qui en sont déjà absentes), NI dans les RELANCES (qui rappellent la SEULE demande
-- initiale), NI dans les SAISINES CADA (qui portent sur un REFUS — une mention jamais refusée y serait incohérente).
--
-- SÛR : DDL ADDITIVE (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucune écriture de données autre que le défaut de colonne.
-- GOLDEN-SAFE (ne touche ni au verdict, ni au score, ni au golden). Idempotent. Un seul BEGIN/COMMIT. AUCUN ENVOI, aucun
-- octet ne part. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/148_mention_sources_graphiques.sql
-- Vérification : voir le bloc en fin de fichier.
--
-- ⚠️ Le DEFAULT du texte ci-dessous DOIT rester byte-identique à la constante applicative
--    `MENTION_SOURCES_TEXTE_DEFAUT` (app/lib/sitadel/veilleConfig.ts) — un test statique le verrouille.

BEGIN;

-- Tiret OPTIONNEL « fichiers sources des pièces graphiques » — 3e item de la liste des pièces (après PC3), DEMANDES seules.
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_sources_active boolean NOT NULL DEFAULT true;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS mention_sources_texte  text    NOT NULL DEFAULT '— si le dossier en comporte, les fichiers sources des pièces graphiques (DWG, DXF) ; leur communication nous serait précieuse, mais leur absence ne doit en rien retarder l’envoi des pièces ci-dessus.';

COMMENT ON COLUMN config_veille.mention_sources_active IS 'S-DWG — active/désactive le 3e tiret « fichiers sources des pièces graphiques » dans la liste des pièces des DEMANDES (variantes e-mail). Défaut true (opt-out). Absent des relances et des saisines CADA.';
COMMENT ON COLUMN config_veille.mention_sources_texte  IS 'S-DWG — texte ÉDITABLE du 3e tiret « fichiers sources ». Formulation qui N''OBLIGE À RIEN (les sources ne sont pas une pièce Cerfa, aucune référence d''article). Doit rester un tiret cadratin cohérent avec la liste. Vide = rien ajouté même si actif.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT mention_sources_active, mention_sources_texte FROM config_veille WHERE id = 1;
--   -- attendu : true / '— si le dossier en comporte, les fichiers sources des pièces graphiques (DWG, DXF) ; …'
