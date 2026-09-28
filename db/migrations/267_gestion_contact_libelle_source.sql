-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 267 — D'OÙ VIENT CETTE COORDONNÉE ? (lot CONTACTS-ET-EVENEMENT, 28/09/2026)
--
-- ═══ LE CONSTAT D'ARNO, ET CE QUE LA RECONNAISSANCE A ÉTABLI ════════════════════════════════════════════════════
-- Sur le fil 36488 (lot 494, « 2 Rue Mars et Roty »), la fiche affichait sous « MARS AVENIR » deux téléphones et
-- deux adresses e-mail en vrac : impossible de savoir à qui appartenait chaque coordonnée.
--
-- 🔴 RECONNAISSANCE EN LECTURE SEULE DES EXPORTS WIPPIMMO, le 28/09/2026 — LA RÉPONSE EST NON :
--   · `Bailleurs.xlsx` n'a que DIX colonnes : Id, Civilité, Nom prop., Prénom prop., Adresse, Commune, C.P.,
--     Télécoms, Mobile, Email. Aucune colonne « représentant », « contact secondaire », « raison sociale »,
--     aucune seconde personne.
--   · `Locataires.xlsx` n'en a que treize, dont un seul champ de nom (`Locataire`), un `Mobile`, un `Email`.
--   · Les coordonnées multiples viennent de CELLULES À PLUSIEURS VALEURS :
--        MARS AVENIR (344)  Mobile = « 06 69 14 28 07 / 07 60 20 10 10 »
--                           Email  = « a.jorel@sansvisavis.com;c.jullien@sansvisavis.com »
--     Mesuré : 18 bailleurs et 71 locataires ont plusieurs téléphones dans une cellule ; 45 et 134 pour l'e-mail.
--   · 🔴 ET L'ORDRE N'EST MÊME PAS STABLE D'UNE COLONNE À L'AUTRE : pour SARL MACJ (850), les deux mêmes
--     personnes apparaissent dans l'ordre INVERSE en Mobile et en Email. Apparier par position fabriquerait donc
--     des attributions FAUSSES — pas approximatives : fausses.
--
-- ⇒ On n'invente AUCUNE attribution. Chaque coordonnée porte désormais LE LIBELLÉ EXACT DE SA COLONNE D'ORIGINE
--   (« Mobile 1 », « Mobile 2 », « Email 1 », « Télécoms »…), pour qu'on sache d'où elle sort — et pour que
--   personne ne croie qu'on sait à qui elle est.
--
-- ═══ CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS ═════════════════════════════════════════════════════
-- UNE colonne, NULLABLE, sur une table de 1 793 lignes. Elle ne touche à rien d'autre : ni les valeurs, ni les
-- rangs, ni l'unicité (sujet, sujet_id, sorte, valeur), ni les autres tables de l'annuaire.
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Le code tourne sans elle : la sonde `libelleSourceContactDisponible()`
--    (`app/lib/gestion/schema.ts`) ne nomme la colonne nulle part tant qu'elle n'existe pas, et la fiche retombe
--    alors sur un libellé générique dérivé de la sorte et du rang (« E-mail », « E-mail 2 ») — jamais une
--    coordonnée orpheline, jamais une attribution inventée.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/267_gestion_contact_libelle_source.sql
--    Puis, pour remplir la colonne (idempotent, simulation d'abord) :
--        npm run gestion:annuaire:importer
--        npm run gestion:annuaire:importer -- --appliquer
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_annuaire_contact
  ADD COLUMN IF NOT EXISTS libelle_source text;

COMMENT ON COLUMN gestion_annuaire_contact.libelle_source IS
  'Le libellé EXACT de la colonne WIPPIMMO d''où vient cette coordonnée, numéroté quand la cellule en portait '
  'plusieurs : « Mobile 1 », « Mobile 2 », « Email », « Télécoms ». L''export ne permet PAS de relier une '
  'coordonnée à une personne nommée (une seule personne par ligne, cellules multi-valeurs, ordre non stable '
  'd''une colonne à l''autre) : ce libellé dit d''où elle sort, et rien de plus. NULL = import antérieur à la 267.';

COMMIT;
