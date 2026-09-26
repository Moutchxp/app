-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 257 — LOT RATTACHEMENT-1 : À QUOI CE MAIL SE RAPPORTE-T-IL ?
--
-- ═══ CE QUE CE LOT AJOUTE, ET CE QU'IL NE TOUCHE PAS ════════════════════════════════════════════════════════════
-- Le module sait déjà POSER UN ÉCHANGE SUR UNE CARTE : c'est `gestion_affectation`, une affectation active par
-- échange (ou par mail depuis la 234). Ce lot n'y touche PAS — ni la table, ni ses index, ni ses gestes. Il ajoute
-- un axe DIFFÉRENT, qui répond à une autre question :
--
--   · `gestion_affectation`  → « SUR QUELLE CARTE cet échange est-il posé ? »   UNE réponse active. Flux de travail.
--   · `gestion_rattachement` → « DE QUOI ce mail parle-t-il ? »                PLUSIEURS réponses. Archivage.
--
-- Les deux coexistent sans se contredire : un mail posé sur la carte GES-2026-000123 peut parfaitement documenter
-- le logement 495 ET son propriétaire 339 — et c'est le cas le plus courant. Confondre les deux axes obligerait à
-- choisir, et l'historique d'un logement serait amputé de tout ce qui a été traité sur une carte voisine.
--
-- ═══ 🔴 CE QUE LA TABLE DES RATTACHEMENTS DOIT PERMETTRE ═════════════════════════════════════════════════════════
-- ① PLUSIEURS LIENS PAR MAIL. Un mail qui annonce un dégât des eaux touchant deux appartements se rattache aux
--   deux. Aucun index ne l'en empêche : l'unicité ne porte que sur le COUPLE (ce mail, cette cible), pas sur le mail.
-- ② LES PIÈCES HÉRITENT DE LEUR MAIL. Une ligne dont `piece_id` est NULL vaut pour le mail ET pour toutes ses
--   pièces. Une ligne avec `piece_id` AJOUTE de la précision pour cette pièce-là ; elle ne retire jamais celle du
--   mail. ⚠️ Retirer un lien pour UNE SEULE pièce en le gardant sur le mail n'est pas possible dans ce lot, et c'est
--   dit ici plutôt que découvert : le geste à faire est de retirer le lien du mail, puis de le poser sur les pièces
--   qui le méritent.
-- ③ RIEN N'EST JAMAIS SUPPRIMÉ. Un lien retiré passe au statut `retire`, daté et signé ; il reste lisible. C'est ce
--   qui permet de répondre, des mois après, à « pourquoi ce mail n'est plus dans ce dossier ? ».
-- ④ TOUT EST RÉVERSIBLE. Retirer, rejeter, confirmer sont des CHANGEMENTS D'ÉTAT, donc réversibles par un autre
--   changement d'état. L'index d'unicité est PARTIEL (statuts vivants seulement) : un lien retiré ne bloque donc
--   pas sa propre remise en place, et les deux faits restent tous les deux en base.
--
-- ═══ 🔴 POURQUOI UNE TABLE D'EXAMEN, ALORS QUE L'ÉTAT SE DÉRIVE D'ORDINAIRE ══════════════════════════════════════
-- Un mail SANS aucun candidat ne produit aucune ligne de rattachement. Sans mémoire de son examen, on ne pourrait
-- pas distinguer « examiné, l'annuaire ne connaît personne » de « pas encore examiné » — deux états qu'une file de
-- tri doit absolument séparer, et la commande aussi : sans cela son curseur repasserait éternellement sur les mêmes
-- mails. `gestion_rattachement_examen` est donc le MÉMO DU DERNIER EXAMEN, entièrement recalculable, jamais une
-- source de vérité concurrente.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE N'EST ÉCRITE PAR CETTE MIGRATION : elle crée des tables vides.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/257_gestion_rattachement.sql
--
-- POUR REVENIR EN ARRIÈRE (les écrans redisent « pas encore installé » ; aucun mail, aucune pièce n'est touché) :
--   DROP TABLE IF EXISTS gestion_rattachement, gestion_rattachement_examen;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_message_adresse') IS NULL THEN
    RAISE EXCEPTION 'La migration 256 (trace des adresses) doit être appliquée AVANT celle-ci : le moteur de '
                    'proposition ne lit rien d''autre.';
  END IF;
  IF to_regclass('public.gestion_annuaire_lot') IS NULL THEN
    RAISE EXCEPTION 'La migration 253 (annuaire) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

-- ── ① LES RATTACHEMENTS ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_rattachement (
  id             bigserial   PRIMARY KEY,
  message_id     bigint      NOT NULL REFERENCES gestion_message(id) ON DELETE CASCADE,
  -- 🔴 NULL = LE MAIL ENTIER, pièces comprises (l'héritage). Renseigné = cette pièce EN PLUS du mail.
  piece_id       bigint      REFERENCES gestion_piece(id) ON DELETE CASCADE,

  -- LA CIBLE. 'lot' et 'proprietaire' sont désignés par leur clé WIPPIMMO, qui survit à un ré-import de l'annuaire ;
  -- 'evenement' par l'identifiant de sa carte.
  cible_sorte    text        NOT NULL,
  cible_cle      text,
  cible_id       bigint,
  -- Le nom lisible AU MOMENT DU RATTACHEMENT. Figé exprès, comme `auteur_libelle` du journal : il doit rester
  -- lisible des années après, même si le lot change d'adresse ou sort de la gestion.
  cible_libelle  text,

  -- QUI A DÉCIDÉ. 'automatique' = le moteur ; 'manuel' = quelqu'un, à l'écran.
  origine        text        NOT NULL,
  -- La règle qui a conclu : 'a' = les adresses DU MAIL, 'b' = celles de tout l'échange. Même vocabulaire que le tri.
  regle          text,
  confiance      text,
  -- 🔴 LES ADRESSES QUI JUSTIFIENT LE LIEN. Sans elles, on ne peut pas juger si le moteur a eu raison — et c'est
  --   exactement ce que la file de tri demande de faire, mail par mail.
  adresses       text,
  motif          text,

  -- L'ÉTAT. 'propose' = candidat soumis au tri ; 'confirme' = lien vivant ; 'rejete' = candidat écarté ;
  -- 'retire' = lien vivant décroché. Les quatre restent en base, aucun n'efface l'autre.
  statut         text        NOT NULL DEFAULT 'propose',

  cree_le        timestamptz NOT NULL DEFAULT now(),
  cree_par       bigint      REFERENCES admin_utilisateur(id),
  cree_par_libelle   text    NOT NULL DEFAULT 'automatique',
  statut_le      timestamptz,
  statut_par     bigint      REFERENCES admin_utilisateur(id),
  statut_par_libelle text,
  statut_motif   text,

  CONSTRAINT gestion_rattachement_sorte_chk
    CHECK (cible_sorte IN ('lot', 'proprietaire', 'evenement')),
  CONSTRAINT gestion_rattachement_origine_chk
    CHECK (origine IN ('automatique', 'manuel')),
  CONSTRAINT gestion_rattachement_statut_chk
    CHECK (statut IN ('propose', 'confirme', 'rejete', 'retire')),
  -- UNE CIBLE SANS IDENTITÉ N'EST PAS UNE CIBLE : un événement se désigne par son identifiant, un lot ou un
  -- propriétaire par sa clé WIPPIMMO. La base le tient, pour qu'aucun chemin d'écriture ne puisse l'oublier.
  CONSTRAINT gestion_rattachement_cible_chk CHECK (
    (cible_sorte = 'evenement' AND cible_id IS NOT NULL AND cible_cle IS NULL)
    OR (cible_sorte IN ('lot', 'proprietaire') AND btrim(coalesce(cible_cle, '')) <> '')),
  -- 🔴 UN LIEN DÉFAIT DIT TOUJOURS QUAND. « rejete » et « retire » sont des SORTIES d'un état antérieur : sans date,
  --   on ne pourrait pas répondre à « depuis quand ce mail n'est-il plus dans ce dossier ? ». Une création — posée
  --   par le moteur ou à la main — n'a, elle, que `cree_le` à renseigner ; exiger `statut_le` en double serait deux
  --   vérités pour une seule date.
  CONSTRAINT gestion_rattachement_statut_date_chk
    CHECK (statut IN ('propose', 'confirme') OR statut_le IS NOT NULL)
);

-- 🔴 L'UNICITÉ PORTE SUR (mail, pièce, cible), ET SEULEMENT SUR LES STATUTS VIVANTS.
--   · Elle rend la commande IDEMPOTENTE : relancer met à jour, ne double pas.
--   · Étant PARTIELLE, elle n'empêche PAS de remettre un lien retiré : les deux lignes coexistent, l'ancienne
--     gardant sa date de retrait. Un index total aurait rendu le retrait irréversible — l'inverse du but.
--   · `coalesce` partout : un NULL ne s'égale pas à lui-même dans un index unique, et deux lignes « mail entier,
--     même lot » passeraient toutes les deux.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_rattachement_vivant_idx
  ON gestion_rattachement (
    message_id, coalesce(piece_id, 0), cible_sorte, coalesce(cible_cle, ''), coalesce(cible_id, 0))
  WHERE statut IN ('propose', 'confirme');

-- « Quels liens porte ce mail ? » — la question du bandeau, posée à chaque ouverture de message.
CREATE INDEX IF NOT EXISTS gestion_rattachement_message_idx
  ON gestion_rattachement (message_id) WHERE statut IN ('propose', 'confirme');
-- « Quels mails parlent de ce logement ? » — la question du lot RATTACHEMENT-2, qui lira cet index.
CREATE INDEX IF NOT EXISTS gestion_rattachement_cible_idx
  ON gestion_rattachement (cible_sorte, cible_cle, cible_id) WHERE statut = 'confirme';
-- Les liens propres à une pièce : rares, mais interrogés pièce par pièce.
CREATE INDEX IF NOT EXISTS gestion_rattachement_piece_idx
  ON gestion_rattachement (piece_id) WHERE piece_id IS NOT NULL;

COMMENT ON TABLE gestion_rattachement IS
  'LOT RATTACHEMENT-1 — ce dont un mail (et, au besoin, une pièce précise) PARLE : lots, propriétaires, '
  'événements. PLUSIEURS liens par mail. Ne remplace pas gestion_affectation, qui dit sur quelle CARTE un échange '
  'est posé : ce sont deux axes distincts. Rien n''est supprimé — un lien retiré change de statut.';
COMMENT ON COLUMN gestion_rattachement.piece_id IS
  'NULL = le mail entier, ses pièces comprises (héritage par défaut). Renseigné = cette pièce EN PLUS du mail ; '
  'une ligne de pièce n''annule jamais celle du mail.';
COMMENT ON COLUMN gestion_rattachement.adresses IS
  'Les adresses qui ont fondé le lien. Sans elles, la file de tri ne pourrait pas être jugée mail par mail.';
COMMENT ON COLUMN gestion_rattachement.cible_libelle IS
  'Le nom lisible au moment du rattachement, FIGÉ : il doit rester compréhensible même si le lot change d''adresse '
  'ou sort de la gestion. Même raison que auteur_libelle dans gestion_journal.';

-- ── ② LE MÉMO DU DERNIER EXAMEN ─────────────────────────────────────────────────────────────────────────────────
-- Une ligne par mail examiné. C'est le CURSEUR de la commande et, pour la file de tri, la seule façon de savoir
-- qu'un mail sans aucun lien a bien été regardé.
CREATE TABLE IF NOT EXISTS gestion_rattachement_examen (
  message_id     bigint      PRIMARY KEY REFERENCES gestion_message(id) ON DELETE CASCADE,
  examine_le     timestamptz NOT NULL DEFAULT now(),
  -- 'automatique' = une seule cible certaine, le lien est vivant ; 'a_trier' = plusieurs candidats, il faut
  -- choisir ; 'sans_candidat' = aucune adresse de l'échange n'est connue de l'annuaire.
  issue          text        NOT NULL,
  candidats      integer     NOT NULL DEFAULT 0,
  -- Combien d'adresses de ce mail l'annuaire a reconnues (hors les nôtres). Zéro explique l'issue sans rien relire.
  adresses_utiles integer    NOT NULL DEFAULT 0,
  motif          text,
  CONSTRAINT gestion_rattachement_examen_issue_chk
    CHECK (issue IN ('automatique', 'a_trier', 'sans_candidat'))
);

-- La file de tri se lit par cet index : les mails à trier, les plus récents d'abord.
CREATE INDEX IF NOT EXISTS gestion_rattachement_examen_issue_idx
  ON gestion_rattachement_examen (issue, message_id DESC);

COMMENT ON TABLE gestion_rattachement_examen IS
  'LOT RATTACHEMENT-1 — mémo du dernier examen d''un mail par le moteur de proposition. ENTIÈREMENT RECALCULABLE : '
  'jamais une vérité concurrente. Il existe parce qu''un mail sans candidat ne produit aucune ligne de '
  'rattachement — sans lui, « examiné, rien trouvé » et « pas encore examiné » seraient indiscernables, et le '
  'curseur de la commande repasserait éternellement sur les mêmes mails.';

-- ── ③ LE JOURNAL DU MODULE ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi', 'piece_drive', 'compte_google', 'annuaire', 'drive_arbre', 'copie_piece',
    'adresses_messages', 'production_drive',
    'rattachement'   -- 257 : un lien posé, confirmé, rejeté ou retiré, et les passes du moteur
  ]));

COMMIT;
