-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 252 — LOT 5-PJ-ENVOI : DES PIÈCES JOINTES DANS L'ÉDITEUR.
--
-- CE QUI MANQUAIT, MESURÉ AU LOT PRÉCÉDENT : `gestion_brouillon` n'avait aucune colonne pour une pièce,
-- `construireRfc822` n'émettait qu'un `text/plain` sans partie multipart, et `voie` ne connaissait que quatre
-- valeurs. « Transférer en tant que pièce jointe » ne pouvait donc pas exister sans ce socle.
--
-- 🔴 UNE PIÈCE DE BROUILLON A DEUX ORIGINES, ET UNE SEULE EST UN FICHIER NEUF :
--   · `piece_id` renseigné  — c'est une pièce DU MESSAGE D'ORIGINE, reprise par un transfert. Ses octets sont DÉJÀ
--     chez nous (`gestion_piece.cle_stockage`) : on les RÉFÉRENCE, on ne les recopie pas. Recopier doublerait le
--     stockage à chaque transfert, et ferait diverger deux exemplaires du même fichier ;
--   · `cle_stockage` renseignée — c'est un fichier AJOUTÉ depuis l'ordinateur, déposé sur le stockage objet.
-- Exactement l'une des deux, jamais les deux, jamais aucune : une contrainte le tient.
--
-- ⚠️ LA 5ᵉ VOIE N'A PAS DE LIGNE ICI. « Transfert en pièce jointe » joint l'original COMPLET (.eml), tiré de Gmail
-- AU MOMENT DE L'ENVOI (`lireOriginalGmail`) : rien n'est stocké chez nous, donc rien à écrire. C'est la voie du
-- brouillon qui porte l'information, et elle suffit.
--
-- 🔴 RETIRER UNE PIÈCE N'EFFACE PAS SA LIGNE : `retire_le` est posé, et l'envoi ignore les pièces retirées. C'est la
-- règle du module (« rien n'est jamais supprimé ») et c'est aussi ce qui rend le geste réversible tant que le
-- brouillon n'est pas parti.
--
-- 🔒 AUCUNE URL DE STOCKAGE NE SORT JAMAIS VERS LE NAVIGATEUR. Il ne voit que le nom, le type et la taille ; les
-- octets ne sont lus que par le serveur, au moment de fabriquer le message.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/252_gestion_brouillon_piece.sql
--
-- POUR REVENIR EN ARRIÈRE (l'éditeur redevient texte seul ; aucun envoi passé n'est touché) :
--   DROP TABLE IF EXISTS gestion_brouillon_piece;
--   (et, si l'on y tient, remettre la contrainte `voie` telle qu'elle était en 239.)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_brouillon') IS NULL THEN
    RAISE EXCEPTION 'La migration 239 (brouillons) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gestion_brouillon_piece (
  id             bigserial   PRIMARY KEY,
  brouillon_id   bigint      NOT NULL REFERENCES gestion_brouillon(id) ON DELETE CASCADE,
  -- Ce que l'écran affiche, et ce que le destinataire verra. Le NOM D'ORIGINE est conservé tel quel.
  nom_fichier    text        NOT NULL,
  type_mime      text,
  taille_octets  bigint      NOT NULL,
  -- ① fichier AJOUTÉ : ses octets sont sur le stockage objet, sous cette clé.
  cle_stockage   text,
  -- ② pièce REPRISE d'un message d'origine : on référence la pièce existante, on ne recopie pas ses octets.
  piece_id       bigint      REFERENCES gestion_piece(id),
  -- Retirée avant l'envoi. La ligne RESTE : le geste est réversible, et la trace ne coûte rien.
  retire_le      timestamptz,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_brouillon_piece_nom_chk CHECK (btrim(nom_fichier) <> ''),
  CONSTRAINT gestion_brouillon_piece_taille_chk CHECK (taille_octets >= 0),
  -- EXACTEMENT une origine. Ni les deux (on ne saurait pas laquelle lire), ni aucune (il n'y aurait rien à joindre).
  CONSTRAINT gestion_brouillon_piece_origine_chk
    CHECK ((cle_stockage IS NOT NULL AND piece_id IS NULL) OR (cle_stockage IS NULL AND piece_id IS NOT NULL))
);

-- « Quelles pièces porte CE brouillon ? » — la seule question posée, à l'affichage comme à l'envoi.
CREATE INDEX IF NOT EXISTS gestion_brouillon_piece_brouillon_idx
  ON gestion_brouillon_piece (brouillon_id) WHERE retire_le IS NULL;

COMMENT ON TABLE gestion_brouillon_piece IS
  'LOT 5-PJ-ENVOI — les pièces jointes d''un brouillon. Deux origines, exactement une par ligne : un fichier AJOUTÉ '
  '(cle_stockage) ou une pièce du message d''origine REPRISE par un transfert (piece_id, dont les octets sont déjà '
  'chez nous — on ne les recopie pas). Retirer une pièce pose retire_le : la ligne reste, le geste est réversible.';
COMMENT ON COLUMN gestion_brouillon_piece.piece_id IS
  'Pièce du message d''origine, reprise telle quelle par un transfert. Ses octets vivent dans gestion_piece : les '
  'recopier doublerait le stockage à chaque transfert et ferait diverger deux exemplaires du même fichier.';

-- ── LA 5ᵉ VOIE ──────────────────────────────────────────────────────────────────────────────────────────────────
-- « Transfert en pièce jointe » : l'original COMPLET est joint en message/rfc822, tiré de Gmail à l'envoi.
-- ⚠️ LE NOM DE LA CONTRAINTE EST CELUI QUE POSTGRESQL A CHOISI, pas celui qu'on aurait écrit. La migration 239 l'a
--   laissée se nommer toute seule : `gestion_brouillon_voie_check` (avec « check », pas « chk »). Écrire le nom
--   attendu plutôt que le nom RÉEL ajoutait une seconde contrainte à côté de la première, qui continuait de refuser
--   la cinquième voie — défaut trouvé par l'épreuve sur cluster jetable, et invisible autrement.
--   Les DEUX noms sont retirés : celui qui existe, et celui qu'une reprise antérieure aurait pu créer.
ALTER TABLE gestion_brouillon DROP CONSTRAINT IF EXISTS gestion_brouillon_voie_check;
ALTER TABLE gestion_brouillon DROP CONSTRAINT IF EXISTS gestion_brouillon_voie_chk;
ALTER TABLE gestion_brouillon
  ADD CONSTRAINT gestion_brouillon_voie_check
  CHECK (voie = ANY (ARRAY['repondre', 'repondre_tous', 'transferer', 'nouveau', 'transferer_piece']));

COMMIT;
