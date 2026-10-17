-- 376_location_bien_famille.sql — TUILE LOCATION (Arno, 17/10/2026) : FAMILLE DE BIEN, PARKING, ACCÈS, ANNEXE À UNE AUTRE ADRESSE.
--
-- LE BESOIN (Arno) : « Famille de bien : Logement · Un local (Local commercial / Bureaux) · Parking nu (Intérieur /
-- Extérieur ; Place simple · Place double · Box simple · Box double ; surface facultative). Pour toutes les familles :
-- Ascenseur oui / non, Digicode oui / non (+ Code), et une Précision d'accès. Les annexes parking ont les mêmes options ;
-- chaque annexe peut être à une AUTRE ADRESSE, enregistrée sur l'annexe. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : des colonnes FACULTATIVES sur `gestion_annuaire_lot`.
--   · LA FAMILLE N'A PAS DE COLONNE : elle se DÉDUIT de la catégorie existante (logement → Logement, local → Un local,
--     parking / box → Parking nu). Les biens existants gardent donc leurs données ; rien n'est réécrit.
--   · `adresse_autre` : vrai quand une ANNEXE est à une autre adresse que son logement / local (son adresse est alors la
--     sienne, dans les colonnes d'adresse habituelles). Le lien annexe → logement (`gestion_lot_annexe`) ne change pas.
-- Lues QUE par la tuile Location (et la section « Location » de la fiche commune). AUCUNE ligne existante n'est modifiée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS type_local text
    CONSTRAINT gestion_annuaire_lot_type_local_chk CHECK (type_local IS NULL OR type_local IN ('commercial', 'bureaux')),
  ADD COLUMN IF NOT EXISTS parking_situation text
    CONSTRAINT gestion_annuaire_lot_parking_situation_chk CHECK (parking_situation IS NULL OR parking_situation IN ('interieur', 'exterieur')),
  ADD COLUMN IF NOT EXISTS parking_type text
    CONSTRAINT gestion_annuaire_lot_parking_type_chk CHECK (parking_type IS NULL OR parking_type IN ('place_simple', 'place_double', 'box_simple', 'box_double')),
  ADD COLUMN IF NOT EXISTS surface_m2 numeric
    CONSTRAINT gestion_annuaire_lot_surface_chk CHECK (surface_m2 IS NULL OR surface_m2 >= 0),
  ADD COLUMN IF NOT EXISTS ascenseur boolean,
  ADD COLUMN IF NOT EXISTS digicode boolean,
  ADD COLUMN IF NOT EXISTS digicode_code text,
  ADD COLUMN IF NOT EXISTS precision_acces text,
  ADD COLUMN IF NOT EXISTS adresse_autre boolean;

COMMENT ON COLUMN gestion_annuaire_lot.parking_type IS 'Parking nu ou annexe parking (tuile Location) : place simple / double, box simple / double (migration 376).';
COMMENT ON COLUMN gestion_annuaire_lot.surface_m2 IS 'Surface d''un parking nu (facultative), saisie dans la tuile Location (migration 376).';
COMMENT ON COLUMN gestion_annuaire_lot.adresse_autre IS 'Annexe à une autre adresse que son logement / local : son adresse est la sienne (migration 376).';
