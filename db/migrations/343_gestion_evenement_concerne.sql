-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 343 — LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT : LE OU LES LOCATAIRES CONCERNÉS PAR UN ÉVÉNEMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « Choisir le ou les locataires concernés par l'événement » — les locataires ACTUELS, un ANCIEN locataire
-- (litige d'un sortant), ou une AUTRE personne (de l'annuaire, ou saisie libre enregistrée sur l'événement SANS créer
-- de fiche). Par défaut : les locataires actuels, comme aujourd'hui.
--
-- 🔴 MIGRATION D'AJOUT, ET SEULEMENT D'AJOUT : une table neuve. Aucune ligne existante n'est lue, modifiée ni
-- supprimée ; `gestion_evenement_partie` (migration 268) n'est pas touchée, et les événements déjà créés gardent
-- EXACTEMENT leurs parties. Une ligne n'est écrite ici que lorsqu'un humain a MODIFIÉ le choix par défaut : un
-- événement sans ligne garde l'affichage d'avant (les locataires en place, recalculés).
--
--   · `sorte` : `locataire` (en place, vert), `ancien_locataire` (violet), `annuaire` (une personne de l'annuaire,
--     gris), `libre` (une partie libre, gris : nom, e-mail ou téléphone facultatifs, AUCUNE fiche créée), `aucun`
--     (le choix VIDE, dit explicitement : bien vacant, ou personne de concerné) ;
--   · le nom (et les dates d'entrée / de sortie) est FIGÉ au moment du choix, comme `libelle` des parties.
-- Rien n'est supprimé : un choix remplacé est daté (`retire_le`) et signé.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_evenement_concerne (
  id                 bigserial   PRIMARY KEY,
  evenement_id       bigint      NOT NULL REFERENCES gestion_evenement(id),
  sorte              text        NOT NULL,
  locataire_id       bigint      REFERENCES gestion_annuaire_locataire(id),
  sujet              text,
  sujet_id           bigint,
  nom                text        NOT NULL DEFAULT '',
  email              text,
  telephone          text,
  entree             date,
  sortie             date,
  cree_le            timestamptz NOT NULL DEFAULT now(),
  cree_par           bigint      REFERENCES admin_utilisateur(id),
  cree_par_libelle   text        NOT NULL,
  retire_le          timestamptz,
  retire_par         bigint      REFERENCES admin_utilisateur(id),
  retire_par_libelle text,
  CONSTRAINT gestion_evenement_concerne_sorte_chk
    CHECK (sorte = ANY (ARRAY['locataire','ancien_locataire','annuaire','libre','aucun'])),
  CONSTRAINT gestion_evenement_concerne_locataire_chk
    CHECK ((sorte IN ('locataire','ancien_locataire')) = (locataire_id IS NOT NULL)),
  CONSTRAINT gestion_evenement_concerne_sujet_chk
    CHECK ((sorte = 'annuaire') = (sujet IS NOT NULL AND sujet_id IS NOT NULL)
           AND (sujet IS NULL OR sujet IN ('proprietaire','locataire'))),
  CONSTRAINT gestion_evenement_concerne_nom_chk CHECK (sorte = 'aucun' OR btrim(nom) <> ''),
  CONSTRAINT gestion_evenement_concerne_auteur_chk CHECK (btrim(cree_par_libelle) <> '')
);

COMMENT ON TABLE gestion_evenement_concerne IS
  '343 — Les personnes CONCERNÉES par un événement, quand le choix par défaut (les locataires en place) a été '
  'modifié : locataires en place, anciens locataires, une personne de l''annuaire, ou une partie libre (aucune fiche '
  'créée). Une ligne « aucun » dit le choix vide. Sans ligne vivante : l''affichage d''avant. Rien n''est supprimé.';

CREATE INDEX IF NOT EXISTS gestion_evenement_concerne_evenement_idx
  ON gestion_evenement_concerne (evenement_id) WHERE retire_le IS NULL;

COMMIT;
