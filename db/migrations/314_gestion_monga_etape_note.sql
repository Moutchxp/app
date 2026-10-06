-- ══ 🔴🔴 LOT FRISE-HORIZONTALE — « SIMPLE INFORMATION » POSÉE À LA MAIN ══════════════════════════════════════════
--
-- DEMANDE D'ARNO (06/10/2026) : « Un clic ouvre […] le formulaire existant “Ajouter une étape” […] avec en plus
-- le choix “Étape” ou “Simple information”. Une étape s'affiche en carré, une information en point. »
--
-- ═══ POURQUOI UNE MIGRATION, ET POURQUOI ELLE EST MINUSCULE ═════════════════════════════════════════════════════
--
-- Une « information » doit s'afficher en POINT, donc son type doit être un REPÈRE (`estRepere`). Les quatre
-- repères existants viennent tous de Monga — commentaire, rappel de devis, facture, contact injoignable — et
-- aucun ne convient à une note écrite par un collaborateur :
--   · `commentaire` est ce que MONGA dit ; en laisser poser à la main brouillerait l'origine d'une information
--     que l'on relit justement pour savoir qui l'a dite ;
--   · `facture`, `rappel_devis`, `contact_injoignable` nomment des faits précis, pas une note libre.
--
-- 🔴 D'OÙ UN SEIZIÈME TYPE, `note`, ET RIEN D'AUTRE. La contrainte de la migration 313 énumère les types ; on
-- l'étend d'une valeur. Aucune colonne ajoutée, aucune ligne modifiée, aucune ligne existante invalidée : une
-- contrainte `CHECK` élargie accepte tout ce qu'elle acceptait.
--
-- ⚠️ `note` N'ENTRE PAS DANS `ETAPES_MAJEURES` NI DANS `ETAPES_ATTENDUES` : elle ne s'affiche jamais en carré, et
-- jamais en pointillé. Elle rejoint `REPERES`, c'est-à-dire les points posés sur le trait.
--
-- ⚠️ APPLIQUÉE À LA MAIN, comme toutes les migrations de ce dépôt :
--     psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/314_gestion_monga_etape_note.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_monga_etape DROP CONSTRAINT IF EXISTS gestion_monga_etape_type_chk;

ALTER TABLE gestion_monga_etape ADD CONSTRAINT gestion_monga_etape_type_chk CHECK (type = ANY (ARRAY[
  'ouverture','prise_rdv','rdv_eu_lieu','devis_recu','devis_accepte',
  'rdv_intervention','intervention','cloture',
  'facture','rappel_devis','contact_injoignable','commentaire',
  'assurance','expertise','relance','autre',
  -- 🔴 LOT FRISE-HORIZONTALE : la « simple information » posée à la main. Un POINT, jamais un carré.
  'note']));

COMMIT;
