-- LOT 118 — OUVERTURE du périmètre d'ingestion Sitadel aux 3 DERNIERS départements d'Île-de-France : 77 (Seine-et-Marne),
-- 91 (Essonne) et 95 (Val-d'Oise). Termine la couverture Sitadel IDF (5/8 -> 8/8). Décision de SCOPE/veille assumée par le
-- porteur, sur le motif EXACT de la 198 (LOT 108, ouverture du 94) : le filtre d'ingestion Sitadel est au DÉPARTEMENT (actif dès
-- une ligne actif=true dans `commune_perimetre`, lue par `app/lib/sitadel/ingestionMillesime.ts:209` via le SELECT DISTINCT
-- departement WHERE actif). Ajouter ces 3 ancres fait entrer leurs dossiers dans le VIVIER (`sitadel_dossier`) au prochain
-- `sitadel:ingest` — puis rend possibles le rapprochement cadastral et l'état des lieux daté sur ces départements.
--
-- ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS (garde-fou reconfirmé par fichier:ligne, inchangé depuis le LOT 108) : elle n'a AUCUN
-- chemin automatique vers la création d'une demande ou l'envoi d'un e-mail. La seule création de demande est `creerDemandes`
-- (`app/lib/sitadel/demandeRepo.ts:757`), appelée UNIQUEMENT par le handler POST manuel
-- `app/(admin)/api/admin/permis/demandes/route.ts:46` (geste humain, sélection de lots). `executerVeille` (launchd
-- `com.sansvisavis.veille` -> `npm run veille:run` -> executerVeille) NE référence JAMAIS `creerDemandes` ; son seul point
-- d'écriture vers un tiers (`envoiAuto` -> envoyerRelances/envoyerSaisinesCada) reste sous interrupteurs explicites
-- (relance_auto_active / saisine_cada_auto_active, défauts false — `executerVeille.ts:6,159`, migration `128:30`). Un vivier plus
-- grand est INERTE jusqu'à un geste manuel ; de surcroît, ces 3 départements n'ont AUCUN contact mairie ni aucune demande.
--
-- ═══ CORRECTION DE LIBELLÉS (au passage) ══════════════════════════════════════════════════════════════════════════════════════
-- 78000 et 93000 portent encore le `nom` gelé de la migration 047 « INACTIF : ouvrir par UPDATE actif=true », alors qu'ils sont
-- actif=true depuis le 26/07/2026. Ce texte affirme le CONTRAIRE de la réalité : on le remplace par un libellé juste. Réalisé via
-- le MÊME ON CONFLICT DO UPDATE (idempotent) : ces deux lignes existent déjà -> branche UPDATE (nom corrigé, actif reste true).
--
-- Convention d'ancre : `<dep>000` — aucune commune Sitadel réelle n'a ce code (les INSEE communaux commencent à xxx001 ;
-- Paris = 75056, cas à part) ; elle ne sert qu'à porter l'état actif du département (cf. migration 047).
--
-- Livrée NON APPLIQUÉE ; le porteur l'applique et confirme AVANT l'ingestion (Phase 2). Idempotente (ON CONFLICT DO UPDATE ->
-- l'état actif et les libellés sont garantis à chaque rejeu). Retour arrière borné aux 3 départements : voir le pied de fichier.
BEGIN;

INSERT INTO commune_perimetre (code_insee, departement, nom, actif) VALUES
  ('77000', '77', 'Seine-et-Marne — ancre de département (LOT 118 : ouverture du périmètre Sitadel)', true),
  ('91000', '91', 'Essonne — ancre de département (LOT 118 : ouverture du périmètre Sitadel)', true),
  ('95000', '95', 'Val-d''Oise — ancre de département (LOT 118 : ouverture du périmètre Sitadel)', true),
  -- Corrections de libellé (lignes déjà actives depuis le 26/07/2026 ; le texte « INACTIF » de la 047 était faux) :
  ('78000', '78', 'Yvelines — ancre de département (active depuis le 26/07/2026)', true),
  ('93000', '93', 'Seine-Saint-Denis — ancre de département (active depuis le 26/07/2026)', true)
ON CONFLICT (code_insee) DO UPDATE SET actif = true, departement = EXCLUDED.departement, nom = EXCLUDED.nom;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — LECTURE SEULE) :
\echo '>>> Périmètre après migration (attendu : 8 ancres, toutes actif=t ; libellés 78000/93000 sans « INACTIF ») :'
SELECT code_insee, departement, actif, nom FROM commune_perimetre ORDER BY code_insee;
\echo '>>> Départements actifs vus par l''ingestion (doit lister 75,77,78,91,92,93,94,95) :'
SELECT DISTINCT departement FROM commune_perimetre WHERE actif ORDER BY departement;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 RETOUR ARRIÈRE borné aux 3 départements ouverts par ce lot (retire les ancres 77/91/95 du périmètre ; ne touche PAS aux
--    dossiers déjà ingérés dans sitadel_dossier — les retirer du vivier est un geste distinct si souhaité). Les corrections de
--    libellé de 78000/93000 ne sont PAS annulées (elles ne font que dire la vérité) :
--   psql "$DATABASE_URL" -c "DELETE FROM commune_perimetre WHERE code_insee IN ('77000','91000','95000');"
-- (Variante non destructive : UPDATE commune_perimetre SET actif=false WHERE code_insee IN ('77000','91000','95000'); )
