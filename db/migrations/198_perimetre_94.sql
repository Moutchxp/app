-- LOT 108 — OUVERTURE du périmètre d'ingestion Sitadel au 94 (Val-de-Marne). Décision de SCOPE/veille assumée par le porteur :
-- le filtre d'ingestion Sitadel est au DÉPARTEMENT (actif dès une ligne actif=true dans `commune_perimetre`, lue par
-- `app/lib/sitadel/ingestionMillesime.ts:209` via `dansPerimetre`). Ajouter le 94 fait entrer ses dossiers dans le VIVIER
-- (`sitadel_dossier`) au prochain `sitadel:ingest` — puis rend possibles le rapprochement cadastral et l'état des lieux daté du 94.
--
-- ⚠️ CE QUE CETTE LIGNE NE FAIT PAS : elle n'a AUCUN chemin automatique vers la création d'une demande ou l'envoi d'un e-mail.
-- La seule création de demande est `creerDemandes` (`app/lib/sitadel/demandeRepo.ts:757`), appelée UNIQUEMENT par le handler POST
-- manuel `app/(admin)/api/admin/permis/demandes/route.ts:46` (geste humain, sélection de lots). `executerVeille` (launchd
-- `com.sansvisavis.veille`, toutes les 15 min) ne la référence jamais ; ses étapes d'envoi vers un tiers restent sous
-- interrupteurs (relance_auto_active / saisine_cada_auto_active, défauts false). Un vivier plus grand est INERTE jusqu'à un geste manuel.
--
-- Le 77 reste HORS périmètre (décision distincte). Convention d'ancre : `<dep>000` — aucune commune Sitadel réelle n'a ce code
-- (les INSEE communaux commencent à xxx001), il ne sert qu'à porter l'état actif du département (cf. migration 047).
--
-- Livrée NON APPLIQUÉE ; le porteur l'applique et confirme. Idempotente (ON CONFLICT DO UPDATE → l'état actif est garanti à chaque rejeu).
BEGIN;

INSERT INTO commune_perimetre (code_insee, departement, nom, actif) VALUES
  ('94000', '94', 'Val-de-Marne — ancre de département (LOT 108 : ouverture du périmètre Sitadel)', true)
ON CONFLICT (code_insee) DO UPDATE SET actif = true, departement = EXCLUDED.departement, nom = EXCLUDED.nom;

COMMIT;
