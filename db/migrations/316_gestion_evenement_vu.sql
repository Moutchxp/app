-- ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — QUAND CE COLLABORATEUR A VU CET ÉVÉNEMENT ══════════════════════════
--
-- DEMANDE D'ARNO (06/10/2026) : « Quand l'automatisation Monga AJOUTE ou MODIFIE une étape d'un événement
-- (jamais pour un geste manuel), la vignette est mise en avant […] L'effet reste PAR COLLABORATEUR jusqu'à ce que
-- CE collaborateur clique sur la vignette, OU ouvre la fiche du bien concerné (par n'importe quel chemin), OU
-- ouvre la vue de l'événement. Il ne s'éteint pas chez un autre collaborateur. Il se rallume à la prochaine mise
-- à jour Monga. […] Données : table additive “dernière vue de l'événement par collaborateur” comparée à la date
-- de la dernière étape Monga. »
--
-- ═══ 🔴🔴 CE QUE CETTE TABLE EST, ET CE QU'ELLE N'EST PAS ═══════════════════════════════════════════════════════
--
-- Elle ne dit PAS « vu / non vu ». Elle dit QUAND, et c'est tout l'intérêt : l'effet est la COMPARAISON de cette
-- date avec celle de la dernière étape Monga. Un drapeau booléen aurait demandé de l'éteindre chez tout le monde
-- à chaque mise à jour — c'est-à-dire d'écrire autant de lignes qu'il y a de collaborateurs, à chaque relève.
-- Ici, une mise à jour Monga n'écrit RIEN dans cette table : elle rallume l'effet d'elle-même, parce que la date
-- de l'étape repasse devant celle de la dernière vue.
--
-- 🔴 ADDITIVE, ET SANS AUCUN EFFET SI ELLE N'EST PAS APPLIQUÉE. Aucune table existante n'est touchée, aucune
-- colonne ajoutée ailleurs, aucune donnée réécrite. La lecture qui s'en sert la contourne proprement quand elle
-- n'existe pas (voir `evenementVuDisponible`) : l'écran est alors exactement celui d'avant ce lot.
--
-- ⚠️ LA CLÉ DU COLLABORATEUR EST DU **TEXTE**, et non une référence vers les comptes. Trois raisons, dans
-- l'ordre : la voie de secours (mot de passe partagé) n'a PAS d'identifiant de compte et doit pouvoir éteindre
-- son propre effet ; une clé étrangère ferait disparaître l'historique de vue d'un compte supprimé, au moment
-- précis où l'on voudrait savoir qui avait vu quoi ; et cette table n'est pas une donnée de référence — c'est un
-- marque-page, il peut survivre seul.
--
-- ⚠️ AUCUNE DONNÉE PERSONNELLE N'Y ENTRE : la clé est l'identifiant de connexion déjà écrit dans le journal de
-- gestion (`gestion_journal.auteur_libelle`), pas un nom, pas une adresse de locataire.
--
-- SAUVEGARDE PRISE AVANT APPLICATION (règle du dépôt) :
--   pg_dump -t gestion_evenement -t gestion_monga_etape → /tmp/sauvegarde-avant-316-<horodatage>.sql
--
-- APPLICATION MANUELLE (règle du dépôt) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/316_gestion_evenement_vu.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_evenement_vu (
  evenement_id bigint      NOT NULL REFERENCES gestion_evenement (id) ON DELETE CASCADE,
  -- La clé du collaborateur : son identifiant de connexion, ou « acces de secours » pour la voie partagée.
  compte_cle   text        NOT NULL CHECK (btrim(compte_cle) <> ''),
  vu_le        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evenement_id, compte_cle)
);

COMMENT ON TABLE gestion_evenement_vu IS
  'Lot VIGNETTE-EVENEMENT : quand chaque collaborateur a vu chaque evenement. Comparee a la date de la derniere '
  'etape Monga, elle decide de l''effet « mis a jour par Monga » sur la vignette. Additive, et sans effet si '
  'absente.';

COMMENT ON COLUMN gestion_evenement_vu.compte_cle IS
  'Identifiant de connexion du collaborateur (jamais un nom ni une adresse). Texte et non cle etrangere : la voie '
  'de secours n''a pas de compte, et un marque-page doit survivre a la suppression d''un compte.';

-- ⚠️ L'INDEX SUR LE COLLABORATEUR : la lecture de l'écran demande « toutes mes vues », pas « qui a vu cet
-- événement ». La clé primaire commence par l'événement et ne sert donc pas cette question-là.
CREATE INDEX IF NOT EXISTS gestion_evenement_vu_compte_idx
  ON gestion_evenement_vu (compte_cle, evenement_id);

COMMIT;
