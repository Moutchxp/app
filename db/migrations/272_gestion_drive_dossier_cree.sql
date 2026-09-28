-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 272 — LE JOURNAL DES DOSSIERS CRÉÉS DANS LE DRIVE (lot DRIVE-VISUALISER-ET-DOSSIERS, 28/09/2026)
--
-- ═══ 🔴🔴 POURQUOI UN JOURNAL, ET POURQUOI IL EST OBLIGATOIRE ═══════════════════════════════════════════════════
-- C'est la PREMIÈRE écriture que cette application fait dans le Drive du cabinet. Jusqu'ici elle ne faisait que
-- lire — `files.list`, `files.get`, `alt=media` — et des tests statiques le vérifiaient sur le source des routes.
--
-- Une écriture, même la plus anodine, change la nature de ce qu'on peut affirmer. « L'app n'a rien touché » cesse
-- d'être une propriété du code pour devenir une question à laquelle il faut pouvoir RÉPONDRE. Ce journal est la
-- réponse : qui, quand, quel nom, quel identifiant, dans quel parent. Sans lui, un dossier apparu dans le Drive
-- resterait sans explication — et l'on soupçonnerait l'application de faire des choses qu'elle ne fait pas.
--
-- ═══ 🔴 CE QUE CE LOT N'ÉCRIT JAMAIS, ET CE JOURNAL LE DIT AUSSI ════════════════════════════════════════════════
-- L'application CRÉE des dossiers. Elle ne renomme pas, ne déplace pas, ne supprime pas, ne met pas à la corbeille,
-- ne partage pas, ne change aucun droit. Il n'y a donc PAS de colonne « action » : une seule action existe, et en
-- prévoir d'autres serait ouvrir la porte à celui qui, un jour, voudrait « juste ajouter un renommage ».
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Le code tourne sans elle : la sonde `journalDossierDriveDisponible()`
--    (`app/lib/gestion/schema.ts`) ne nomme pas la table tant qu'elle n'existe pas. Le bouton « + Nouveau dossier »
--    est alors DÉSACTIVÉ, avec son motif écrit en toutes lettres — on ne crée pas dans le Drive ce qu'on ne saurait
--    pas consigner. Tout le reste de l'écran est inchangé.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/272_gestion_drive_dossier_cree.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_drive_dossier_cree (
  id             bigserial PRIMARY KEY,
  -- L'identifiant Drive du dossier créé, et celui du parent où il l'a été. Les deux : sans le parent, on sait
  --   qu'un dossier a été créé mais pas où, et « où » est la moitié de la question.
  drive_id       text        NOT NULL,
  parent_id      text        NOT NULL,
  nom            text        NOT NULL,
  /**
   * LE CHEMIN LISIBLE AU MOMENT DE LA CRÉATION (« Mon Drive › GESTION LOCATIVE › … »), FIGÉ.
   *
   * ⚠️ FIGÉ EXPRÈS : un dossier parent peut être renommé ou déplacé plus tard, par quelqu'un, dans le Drive. Le
   * journal doit dire où l'on croyait créer CE JOUR-LÀ — c'est cela qu'on relit quand on cherche à comprendre.
   */
  chemin         text        NOT NULL DEFAULT '',
  -- Qui. L'auteur vient de la SESSION, jamais du navigateur — comme partout dans ce module.
  auteur_id      bigint      REFERENCES admin_utilisateur(id),
  auteur_libelle text        NOT NULL DEFAULT 'inconnu',
  -- Le compte Google au nom duquel la création a été faite (délégation) : c'est LUI que Google a autorisé.
  compte_google  text,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_drive_dossier_cree_nom_chk CHECK (btrim(nom) <> ''),
  CONSTRAINT gestion_drive_dossier_cree_drive_chk CHECK (btrim(drive_id) <> '')
);

COMMENT ON TABLE gestion_drive_dossier_cree IS
  'Journal des dossiers créés dans le Google Drive par cette application — la SEULE écriture Drive qu''elle '
  's''autorise. Elle ne renomme, ne déplace, ne supprime, ne partage et ne modifie aucun droit : il n''y a donc '
  'pas de colonne « action ». Un dossier apparu dans le Drive doit pouvoir être expliqué ; c''est ici qu''on lit '
  'qui l''a créé, quand, sous quel nom et dans quel parent.';

-- ⚠️ PAS D'INDEX UNIQUE SUR `drive_id` : Google pourrait, en théorie, rendre deux fois le même identifiant à deux
--    tentatives (une réponse perdue, une reprise). Le journal doit alors garder les DEUX lignes — c'est son rôle
--    de dire ce qui s'est passé, pas de le normaliser.
CREATE INDEX IF NOT EXISTS gestion_drive_dossier_cree_parent_idx
  ON gestion_drive_dossier_cree (parent_id, cree_le DESC);

CREATE INDEX IF NOT EXISTS gestion_drive_dossier_cree_date_idx
  ON gestion_drive_dossier_cree (cree_le DESC);

COMMIT;
