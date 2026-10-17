-- 374_location_bien_complet.sql — TUILE LOCATION (Arno, 17/10/2026) : LE FORMULAIRE COMPLET DU BIEN, « EN ENTONNOIR ».
--
-- LE BESOIN (Arno) : « Formulaire complet, logique ENTONNOIR : propriétaire(s) ; adresse et situation (bâtiment,
-- escalier, étage, n° de porte) ; le logement (type, nombre de pièces, meublé ou non, surface habitable, Carrez,
-- extérieure) ; copropriété (n° de lot, syndic choisi parmi les syndics connus de la Gestion) ; annexes ;
-- caractéristiques complémentaires (époque de construction, chauffage, DPE classe et date) ; commentaires. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : des colonnes FACULTATIVES sur `gestion_annuaire_lot`, pour les champs
-- qui n'avaient pas encore de place. Les champs déjà présents (adresse, étage, porte, n° de lot de copropriété, Carrez,
-- surface extérieure, catégorie) gardent leurs colonnes ; les co-propriétaires vont, comme dans la Gestion, dans
-- `gestion_annuaire_lot_proprietaire` (migration 278).
--   · `syndic_id` : le syndic DÉCLARÉ à la saisie du bien dans la Location. Il ne crée ni ne modifie AUCUNE copropriété
--     de la Gestion (qui rattache ses syndics par immeuble) : la Gestion n'en lit rien, son affichage ne change pas.
-- Elles ne sont lues QUE par la tuile Location. AUCUNE ligne existante n'est modifiée ; rien n'est supprimé.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS batiment text,
  ADD COLUMN IF NOT EXISTS escalier text,
  ADD COLUMN IF NOT EXISTS type_logement text
    CONSTRAINT gestion_annuaire_lot_type_logement_chk
    CHECK (type_logement IS NULL OR type_logement IN ('appartement', 'studio', 'maison', 'duplex', 'loft', 'chambre', 'autre')),
  ADD COLUMN IF NOT EXISTS nombre_pieces integer
    CONSTRAINT gestion_annuaire_lot_pieces_chk CHECK (nombre_pieces IS NULL OR (nombre_pieces >= 1 AND nombre_pieces <= 50)),
  ADD COLUMN IF NOT EXISTS meuble boolean,
  ADD COLUMN IF NOT EXISTS surface_habitable_m2 numeric
    CONSTRAINT gestion_annuaire_lot_habitable_chk CHECK (surface_habitable_m2 IS NULL OR surface_habitable_m2 >= 0),
  ADD COLUMN IF NOT EXISTS syndic_id bigint REFERENCES gestion_syndic(id),
  ADD COLUMN IF NOT EXISTS epoque_construction text,
  ADD COLUMN IF NOT EXISTS chauffage text,
  ADD COLUMN IF NOT EXISTS dpe_classe text
    CONSTRAINT gestion_annuaire_lot_dpe_classe_chk CHECK (dpe_classe IS NULL OR dpe_classe IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
  ADD COLUMN IF NOT EXISTS dpe_date date,
  ADD COLUMN IF NOT EXISTS commentaire text;

COMMENT ON COLUMN gestion_annuaire_lot.type_logement IS 'Type de logement saisi dans la tuile Location (appartement, studio, maison…) ; vide = non renseigné (migration 374).';
COMMENT ON COLUMN gestion_annuaire_lot.syndic_id IS 'Syndic déclaré à la saisie du bien dans la tuile Location ; ne crée ni ne modifie aucune copropriété de la Gestion (migration 374).';
COMMENT ON COLUMN gestion_annuaire_lot.commentaire IS 'Commentaire libre saisi dans la tuile Location (migration 374).';
