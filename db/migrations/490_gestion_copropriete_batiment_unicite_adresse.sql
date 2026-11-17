-- 490_gestion_copropriete_batiment_unicite_adresse.sql — 🔴🔴 UN NOM DE BÂTIMENT UNIQUE PAR ADRESSE (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 3).
--
-- LA DÉCISION (Arno, 17/11/2026) : « Lot 3 : la reprise réelle en recette selon le rapport (rien effacé), et les écritures par adresse ; l'unicité
-- (copropriété, nom) est remplacée par (copropriété, adresse, nom) : un « A » est accepté à une autre adresse de la même copropriété, refusé une seconde fois
-- à la même adresse. »
--
-- CE QU'ELLE FAIT : l'unicité (copropriété, nom) du registre des bâtiments (476) est REMPLACÉE — la contrainte qui la portait est retirée (aucune ligne n'est
-- touchée : un index n'est pas une donnée) ; l'unicité (copropriété, adresse, nom) posée par la 489 la remplace pour les bâtiments dont l'adresse est connue,
-- et une unicité (copropriété, nom) ne vaut plus que pour les bâtiments encore SANS adresse (« adresse à préciser » : jamais deux « A » à préciser).
-- Aucune ligne ajoutée, modifiée ni effacée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, l'application écrit comme avant (un nom unique dans toute la copropriété).

CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_batiment_adresse_unique
  ON gestion_copropriete_batiment (copropriete_id, adresse_cle, batiment_cle) WHERE adresse_cle IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_batiment_sans_adresse_unique
  ON gestion_copropriete_batiment (copropriete_id, batiment_cle) WHERE adresse_cle IS NULL;
ALTER TABLE gestion_copropriete_batiment DROP CONSTRAINT IF EXISTS gestion_copropriete_batiment_unique;
