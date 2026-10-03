-- ══ 🔴🔴 LOT FENETRES-INDEPENDANTES — « INTERNE » DEVIENT UNE FENÊTRE, COMME LES BIENS ═══════════════════════════
--
-- 🔴🔴 LIVRÉE, **NON APPLIQUÉE**. Arno : « Migration si nécessaire : livrée NON APPLIQUÉE, arrête-toi et demande
-- à Arno. » Tant qu'elle n'est pas passée, la sonde `interneDuMessageDisponible()` répond « non », la table n'est
-- NOMMÉE NULLE PART, et le module se comporte exactement comme aujourd'hui.
--
-- ═══ CE QU'ELLE RÉPARE, ET POURQUOI UNE TABLE DE PLUS ════════════════════════════════════════════════════════════
--
-- RÈGLE D'ARNO (03/10/2026) : « Interne et Hors gestion deviennent des fenêtres (ou des exceptions) comme les
-- biens, avec un début et une fin. Ouvrir une fenêtre au mail N ferme la fenêtre précédente à N-1 sans rien
-- changer aux mails 1…N-1. Statut d'un mail = celui de la fenêtre qui le couvre. »
--
-- OÙ EN EST-ON, TABLE PAR TABLE :
--
--   · LES BIENS sont déjà par MAIL (`gestion_rattachement.message_id`) — rien à faire ;
--   · « HORS GESTION » est déjà par MAIL (`gestion_hors_gestion.message_id`, migration 266) — rien à faire, et
--     la projection l'applique déjà mail par mail. Vérifié le 03/10/2026 : la table est VIDE (0 ligne), donc
--     aucun statut n'a jamais pu s'y perdre ;
--   · « INTERNE » est par ÉCHANGE (`gestion_fil_interne.fil_id`, migration 281). C'est le seul des trois qui ne
--     peut pas porter de début ni de fin — et c'est exactement le statut qu'Arno a vu disparaître.
--
-- 🔴 LA SORTE « interne » EXISTE DÉJÀ DANS LES FENÊTRES (`gestion_fil_periode.sorte`) : la fenêtre est donc
-- descriptible depuis la migration 290. Ce qui manque est l'endroit où PROJETER son effet, mail par mail. Cette
-- table est cet endroit, et elle est le jumeau exact de `gestion_hors_gestion` — même colonnes, même conventions,
-- même réversibilité.
--
-- ═══ 🔒 CE QU'ELLE NE FAIT PAS ═══════════════════════════════════════════════════════════════════════════════════
--
--   · elle ne TOUCHE PAS `gestion_fil_interne`, qui reste la marque de l'ÉCHANGE (la case « Interne » du bandeau).
--     Les deux cohabitent : la marque d'échange est le repli quand aucune fenêtre ne couvre le mail ;
--   · elle ne SUPPRIME rien, jamais : une marque retirée garde sa ligne, avec qui l'a retirée, quand et pourquoi —
--     même convention que `gestion_hors_gestion` et `gestion_fil_interne` ;
--   · elle n'a AUCUN défaut temporel : une marque naît du geste qui la pose, jamais de l'horloge d'un `DEFAULT`
--     posé sur une insertion qui ne la nommerait pas.
--
-- ⚠️ L'AUTEUR EST OBLIGATOIRE ET HUMAIN, comme pour les deux autres tables : un statut « interne » est une
-- décision, et une décision a un auteur. La contrainte le dit en base, pas seulement dans le code.

CREATE TABLE IF NOT EXISTS gestion_message_interne (
  id                  bigserial PRIMARY KEY,
  message_id          bigint      NOT NULL REFERENCES gestion_message(id) ON DELETE CASCADE,
  pose_le             timestamptz NOT NULL DEFAULT now(),
  pose_par            integer     REFERENCES admin_utilisateur(id),
  pose_par_libelle    text        NOT NULL,
  retire_le           timestamptz,
  retire_par          integer     REFERENCES admin_utilisateur(id),
  retire_par_libelle  text,
  retire_motif        text,
  CONSTRAINT gestion_message_interne_humain_chk
    CHECK (btrim(pose_par_libelle) <> '' AND lower(btrim(pose_par_libelle)) <> 'automatique')
);

-- ⚠️ UN SEUL MARQUAGE VIVANT PAR MAIL. Sans cet index, deux poses concurrentes laisseraient deux lignes ouvertes,
--    et retirer la marque n'en fermerait qu'une — le mail resterait « interne » sans que rien ne le dise.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_message_interne_vivante_idx
  ON gestion_message_interne (message_id) WHERE retire_le IS NULL;

-- La lecture courante : « ce mail est-il interne aujourd'hui ? », pour une page de trente lignes.
CREATE INDEX IF NOT EXISTS gestion_message_interne_message_idx
  ON gestion_message_interne (message_id, pose_le DESC);

COMMENT ON TABLE gestion_message_interne IS
  'LOT FENETRES-INDEPENDANTES : « interne » projeté MAIL PAR MAIL par les fenêtres de la conversation. '
  'Jumeau de gestion_hors_gestion. gestion_fil_interne reste la marque de l''ÉCHANGE, et sert de repli.';
