-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 266 — « HORS GESTION » : CE MAIL NE CONCERNE AUCUN BIEN (lot STATUT-HORS-GESTION, 28/09/2026)
--
-- ═══ LA RÈGLE MÉTIER QUE CETTE TABLE SERT ═══════════════════════════════════════════════════════════════════════
-- ① Un mail de gestion doit être rattaché à un BIEN précis — ou à plusieurs (un propriétaire en possède souvent
--    six). C'est `gestion_rattachement`, et cette table-ci n'y touche pas.
-- ② CERTAINS MAILS NE CONCERNENT AUCUN BIEN : une prospection, un mot d'un collègue, un divers. Jusqu'ici ils
--    restaient rouges « À classer » pour toujours — un reproche permanent pour un courrier parfaitement traité.
--    Ils reçoivent désormais un statut PROPRE, « Hors gestion », posé À LA MAIN.
-- ③ Le rattachement à un ÉVÉNEMENT est FACULTATIF. Un mail sans événement n'est jamais « à classer » pour cette
--    seule raison — ni ici, ni dans une capsule, ni dans un compteur, ni dans un texte d'aide.
--
-- ═══ 🔴 « HORS GESTION » N'EST JAMAIS POSÉ AUTOMATIQUEMENT ══════════════════════════════════════════════════════
-- C'est une DÉCISION, pas une déduction. Un moteur qui déciderait qu'un mail ne concerne aucun bien retirerait
-- silencieusement du travail de la file de quelqu'un — et personne ne saurait jamais lequel. La colonne
-- `pose_par_libelle` porte donc le nom d'un collaborateur, et rien d'autre : la contrainte l'exige (voir ci-dessous).
--
-- ═══ 🔴 RIEN N'EST JAMAIS SUPPRIMÉ, ET TOUT EST RÉVERSIBLE ══════════════════════════════════════════════════════
-- Annuler un « hors gestion » écrit `retire_le` sur la ligne : elle reste, datée et signée, et une nouvelle pose
-- crée une NOUVELLE ligne. L'historique d'un mail se lit donc en entier, dans l'ordre, sans jamais qu'un fait ait
-- disparu — c'est ce qui permet de répondre, des mois après, à « pourquoi ce mail est-il sorti de la file ? ».
-- L'index d'unicité est PARTIEL (les lignes vivantes seulement) : une ligne retirée ne bloque pas sa propre remise.
--
-- ═══ CE QUE CETTE MIGRATION NE FAIT PAS ════════════════════════════════════════════════════════════════════════
-- Elle ne touche NI `gestion_rattachement` (ni sa table, ni ses contraintes, ni ses index), NI `gestion_message`,
-- NI `gestion_fil`. Faire passer « hors gestion » par une sorte de cible supplémentaire de `gestion_rattachement`
-- aurait demandé de RELÂCHER deux CHECK qui gardent le sens de `cible_sorte` sur 43 000 lignes, pour y loger un
-- fait qui n'est justement PAS un rattachement : « hors gestion » ne désigne aucune cible.
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Le code tourne sans elle : la sonde `horsGestionDisponible()`
--    (`app/lib/gestion/schema.ts`) ne nomme cette table nulle part tant qu'elle n'existe pas, et l'écran grise
--    l'option en disant pourquoi.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/266_gestion_hors_gestion.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_hors_gestion (
  id                 bigserial PRIMARY KEY,
  message_id         bigint      NOT NULL REFERENCES gestion_message(id) ON DELETE CASCADE,
  -- Le motif est FACULTATIF (NULL = « non précisé ») : exiger une justification ferait cocher n'importe quoi.
  motif              text,
  pose_le            timestamptz NOT NULL DEFAULT now(),
  pose_par           bigint      REFERENCES admin_utilisateur(id),
  -- 🔴 LE NOM DU COLLABORATEUR, TOUJOURS. Jamais 'automatique' : voir la contrainte plus bas.
  pose_par_libelle   text        NOT NULL,
  -- Le retrait : la ligne reste, elle est seulement datée et signée comme annulée.
  retire_le          timestamptz,
  retire_par         bigint      REFERENCES admin_utilisateur(id),
  retire_par_libelle text,
  retire_motif       text,
  CONSTRAINT gestion_hors_gestion_motif_chk
    CHECK (motif IS NULL OR motif = ANY (ARRAY['prospection'::text, 'interne'::text, 'autre'::text])),
  -- 🔴 JAMAIS AUTOMATIQUE. Un libellé vide, ou le mot que le moteur de rattachement signe, sont refusés EN BASE :
  --    un garde applicatif se contourne au prochain script, une contrainte non.
  CONSTRAINT gestion_hors_gestion_humain_chk
    CHECK (btrim(pose_par_libelle) <> '' AND lower(btrim(pose_par_libelle)) <> 'automatique'),
  -- Un retrait est daté ET signé, ou n'existe pas : une moitié de retrait ne se lit pas.
  CONSTRAINT gestion_hors_gestion_retrait_chk
    CHECK ((retire_le IS NULL AND retire_par_libelle IS NULL)
        OR (retire_le IS NOT NULL AND btrim(coalesce(retire_par_libelle, '')) <> ''))
);

COMMENT ON TABLE gestion_hors_gestion IS
  'Mails qui ne concernent AUCUN bien (prospection, interne, divers), marqués À LA MAIN par un collaborateur. '
  'Statut « Hors gestion » (gris), de priorité inférieure à un rattachement réel : rattacher un bien le lève. '
  'Rien n''est supprimé — annuler écrit retire_le, et une nouvelle pose crée une nouvelle ligne.';

COMMENT ON COLUMN gestion_hors_gestion.motif IS
  'prospection | interne | autre. FACULTATIF : NULL = non précisé. Exiger un motif ferait cocher n''importe lequel.';

COMMENT ON COLUMN gestion_hors_gestion.pose_par_libelle IS
  'Le nom du collaborateur qui a décidé. JAMAIS ''automatique'' : la contrainte le refuse en base.';

-- UNE SEULE MARQUE VIVANTE PAR MAIL. Partiel : une marque retirée ne bloque pas sa propre remise en place.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_hors_gestion_vivant_idx
  ON gestion_hors_gestion (message_id) WHERE retire_le IS NULL;

-- La lecture de l'écran : « ce mail (ou ces 30 mails) est-il hors gestion ? », toujours sur les lignes vivantes.
CREATE INDEX IF NOT EXISTS gestion_hors_gestion_message_idx
  ON gestion_hors_gestion (message_id, retire_le);

COMMIT;
