-- 377_location_immeuble_ag.sql — TUILE LOCATION (Arno, 18/10/2026) : DATE DE LA DERNIÈRE AG DE COPROPRIÉTÉ, PAR IMMEUBLE.
--
-- LE BESOIN (Arno) : « Date de la dernière AG (assemblée générale de copropriété), champ date facultatif, stockée au niveau
-- de la copropriété / de l'immeuble (même rattachement que le syndic : l'“Immeuble” du bien), pour que tous les lots du
-- même immeuble partagent la même date ; pré-remplie si déjà connue ; la modifier met à jour l'immeuble. »
--
-- POURQUOI UNE TABLE À PART : aucune colonne n'existait côté Gestion ; et une copropriété (`gestion_copropriete`) n'existe
-- que lorsqu'un syndic l'a déclarée — or un immeuble sans syndic connu a lui aussi une AG. La clé est donc celle de la
-- Gestion pour relier un bien à son immeuble (`cleImmeuble`, l'« Immeuble » du lot normalisé), la même que
-- `gestion_copropriete.cle_immeuble` : une adresse secondaire d'une copropriété se ramène à la clé de sa copropriété.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une table neuve, vide. AUCUNE ligne existante n'est lue ni modifiée.
-- Lue et écrite QUE par la tuile Location (formulaire du bien, section « Location » de la fiche commune).
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_immeuble_ag (
  cle_immeuble text PRIMARY KEY CONSTRAINT gestion_immeuble_ag_cle_chk CHECK (btrim(cle_immeuble) <> ''),
  libelle text NOT NULL,
  derniere_ag date,
  maj_le timestamptz NOT NULL DEFAULT now(),
  maj_par bigint,
  maj_par_libelle text NOT NULL
);

COMMENT ON TABLE gestion_immeuble_ag IS 'Date de la dernière AG de copropriété, partagée par tous les lots du même immeuble (clé cleImmeuble ; tuile Location, migration 377).';
