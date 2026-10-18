-- 384_location_etat_des_lieux.sql — TUILE LOCATION (Arno, 18/10/2026) : LA DATE D'ÉTAT DES LIEUX DE SORTIE PRÉVUE.
--
-- LE BESOIN (Arno) : sur le bloc « Locataires en préavis » de l'accueil, « Date d'état des lieux de sortie prévue : saisie
-- manuelle, modifiable, effaçable (journalisé) ». Elle vit dans la MÊME base que le préavis et la sortie — sur l'OCCUPATION
-- (le bail du locataire), jamais dans une table propre à l'accueil — et s'affiche aussi sur la fiche locataire et l'écran de
-- sortie.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne FACULTATIVE `etat_des_lieux_prevu_le` sur
-- `gestion_annuaire_occupation`. AUCUNE ligne existante n'est modifiée (aucune valeur par défaut posée). Chaque saisie,
-- modification ou effacement est écrit au journal append-only (`gestion_journal`, valeur avant / après, auteur) : rien
-- n'est perdu. La date de SORTIE, elle, n'est jamais touchée par ce geste.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_occupation ADD COLUMN IF NOT EXISTS etat_des_lieux_prevu_le date;

COMMENT ON COLUMN gestion_annuaire_occupation.etat_des_lieux_prevu_le IS 'Date de l''état des lieux de sortie prévu (préavis en cours) : saisie à la main, modifiable, effaçable ; chaque geste au journal — migration 384.';
