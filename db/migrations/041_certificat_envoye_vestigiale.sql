-- 041_certificat_envoye_vestigiale.sql — Module INTERNAUTE : marque `internaute_projet.certificat_envoye` VESTIGIALE.
--
-- POURQUOI : le flag `certificat_envoye` (migration 029) NE REFLÈTE PAS l'envoi réel du certificat. Il est posé AVANT
-- l'acte d'envoi (à la validation de l'Écran B, en fire-and-forget avant l'appel à /api/certificat) et il n'est JAMAIS
-- posé en CAS 2 (e-mail déjà en base → `getOrCreateInternaute` ON CONFLICT DO NOTHING → `creeInternaute=false`). La fiche
-- admin ne le lit donc plus : la SOURCE DE VÉRITÉ de l'envoi est `certificat_acheminement.statut`
-- (en_attente | genere | envoye | echec) + `envoye_le`, reliée par `certificat.projet_id`.
--
-- Vocabulaire projet (VIVE / VESTIGIALE / DE GARDE) → cette colonne est VESTIGIALE : conservée, plus lue à l'affichage.
-- Les chemins d'ÉCRITURE restent inchangés dans ce chantier (aucun DROP, aucune modification de code d'écriture).
-- Ce fichier ne fait qu'un COMMENT — AUCUNE écriture de données.

BEGIN;

COMMENT ON COLUMN internaute_projet.certificat_envoye IS
  'VESTIGIALE (migration 041) — ne reflète PAS l''envoi réel. Posé à la validation de l''Écran B (AVANT l''acte, '
  'fire-and-forget) et JAMAIS posé en CAS 2 (e-mail déjà en base). Source de vérité de l''envoi : '
  'certificat_acheminement.statut (en_attente|genere|envoye|echec) + envoye_le, via certificat.projet_id. '
  'N''alimente plus l''affichage admin (fiche internaute).';

COMMIT;
