-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 274 — LE JOURNAL DES DÉPLACEMENTS ET DES COPIES DANS LE DRIVE (lot DRIVE-DEPLACER, 29/09/2026)
--
-- ═══ 🔴🔴 CE QUE CETTE MIGRATION ACCOMPAGNE, ET POURQUOI ELLE EST OBLIGATOIRE ═══════════════════════════════════
-- Décision d'Arno du 29/09/2026 : l'application peut désormais DÉPLACER et COPIER dans le Drive du cabinet, en
-- plus de créer des dossiers. Elle ne supprime, ne renomme, ne met à la corbeille et ne partage toujours RIEN.
--
-- La migration 272 avait posé la règle : on n'écrit pas dans le Drive ce qu'on ne saurait pas consigner. Un dossier
-- apparu sans ligne de journal est un dossier que personne ne peut expliquer. Un dossier DÉPLACÉ sans ligne de
-- journal est pire : il a disparu d'un endroit où quelqu'un le cherchera, et personne ne saura où il est parti.
--
-- 🔴 ET C'EST AUSSI CE QUI REND « ANNULER » POSSIBLE. Le bandeau « N élément(s) déplacé(s) vers X — Annuler »
-- relit le PARENT D'ORIGINE dans cette table : sans elle, « Annuler » devrait faire confiance à ce que l'écran
-- croit se rappeler, c'est-à-dire à la partie qu'on vérifie. Avec elle, on redéplace vers ce qui a été CONSIGNÉ.
--
-- ═══ 🔴 DEUX ACTIONS, ET DEUX SEULEMENT ════════════════════════════════════════════════════════════════════════
-- Contrairement à la 272, cette table porte une colonne `action` — parce qu'il y a VRAIMENT deux gestes, qui ne se
-- lisent pas de la même façon : un déplacement laisse l'original ailleurs, une copie en crée un second. La
-- contrainte les énumère, et elle est la garantie qu'aucun troisième ne s'y glissera : y ajouter « supprimer »
-- demanderait de modifier cette ligne, ce qui se voit dans une revue.
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Le code tourne sans elle : la sonde `journalMouvementDriveDisponible()`
--    (`app/lib/gestion/schema.ts`) ne nomme pas la table tant qu'elle n'existe pas. Sans elle :
--      · le glisser-déposer vers la zone « Pièces jointes » du mail fonctionne (il n'écrit rien dans le Drive) ;
--      · le déplacement et la copie sont DÉSACTIVÉS, avec leur motif écrit en toutes lettres ;
--      · la route les refuse aussi, même appelée directement.
--
--    Pour l'appliquer :  psql -v ON_ERROR_STOP=1 -d sansvisavis -f db/migrations/274_gestion_drive_mouvement.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_drive_mouvement (
  id              bigserial PRIMARY KEY,
  -- 🔴 DEUX ACTIONS, ET DEUX SEULEMENT. Voir l'encadré : la contrainte est la garantie.
  action          text        NOT NULL,
  -- L'élément déplacé ou copié, et son nom AU MOMENT DU GESTE (il peut être renommé ensuite, par quelqu'un).
  drive_id        text        NOT NULL,
  nom             text        NOT NULL DEFAULT '',
  est_dossier     boolean     NOT NULL DEFAULT false,
  /**
   * D'OÙ IL VENAIT ET OÙ IL EST ALLÉ. Les deux, toujours :
   *   · `parent_origine` est ce que relit « Annuler » — c'est la seule raison pour laquelle il est NOT NULL ;
   *   · `parent_cible` dit où chercher maintenant.
   */
  parent_origine  text        NOT NULL,
  parent_cible    text        NOT NULL,
  -- Pour une COPIE : l'identifiant de la copie créée. `NULL` pour un déplacement — il n'y a rien de neuf.
  copie_drive_id  text,
  -- Qui. L'auteur vient de la SESSION, jamais du navigateur — comme partout dans ce module.
  auteur_id       bigint      REFERENCES admin_utilisateur(id),
  auteur_libelle  text        NOT NULL DEFAULT 'inconnu',
  -- Le compte Google au nom duquel le geste a été fait (délégation) : c'est LUI que Google a autorisé.
  compte_google   text,
  fait_le         timestamptz NOT NULL DEFAULT now(),
  /**
   * 🔴 ANNULÉ, ET QUAND. Annuler un déplacement ne SUPPRIME pas sa ligne : il en écrit une nouvelle (le
   * re-déplacement) ET date celle-ci. Effacer la première ferait disparaître la trace du geste qu'on répare —
   * or c'est précisément celle-là qu'on relira le jour où l'on cherchera à comprendre.
   */
  annule_le       timestamptz,
  CONSTRAINT gestion_drive_mouvement_action_chk CHECK (action IN ('deplacer', 'copier')),
  CONSTRAINT gestion_drive_mouvement_drive_chk CHECK (btrim(drive_id) <> ''),
  CONSTRAINT gestion_drive_mouvement_parents_chk
    CHECK (btrim(parent_origine) <> '' AND btrim(parent_cible) <> ''),
  -- Une copie porte l'identifiant de ce qu'elle a créé ; un déplacement ne crée rien.
  CONSTRAINT gestion_drive_mouvement_copie_chk
    CHECK ((action = 'copier') = (copie_drive_id IS NOT NULL))
);

COMMENT ON TABLE gestion_drive_mouvement IS
  'Journal des déplacements et des copies faits dans le Google Drive par cette application. Elle ne supprime, ne '
  'renomme, ne met à la corbeille et ne partage rien : la contrainte sur « action » n''autorise que « deplacer » '
  'et « copier ». C''est aussi la source de « Annuler » — le parent d''origine y est consigné, et c''est lui '
  'qu''on relit pour remettre un élément là où il était.';

CREATE INDEX IF NOT EXISTS gestion_drive_mouvement_date_idx
  ON gestion_drive_mouvement (fait_le DESC);

CREATE INDEX IF NOT EXISTS gestion_drive_mouvement_drive_idx
  ON gestion_drive_mouvement (drive_id, fait_le DESC);

/**
 * ⚠️ AUCUN TRIGGER « APPEND-ONLY » ICI, contrairement à d'autres journaux du module, et c'est délibéré : la
 * colonne `annule_le` DOIT pouvoir être écrite après coup. Ce qui est interdit, c'est de SUPPRIMER une ligne ou de
 * réécrire ce qui s'est passé — et cela, aucune requête du code ne le fait : le seul UPDATE écrit `annule_le`.
 */

COMMIT;
