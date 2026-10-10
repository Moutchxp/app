-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 336 — LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ① ARNO : « l'alerte “Cette copropriété possède peut-être d'autres adresses postales…” ne s'affiche plus qu'UNE fois
--    par copropriété ». `gestion_copropriete.alerte_parcelle_le` / `_par_libelle` : la date et l'auteur de ce premier
--    passage. Les copropriétés EXISTANTES qui ont DÉJÀ des propositions (d'autres adresses BAN sur la parcelle de l'une
--    de leurs adresses, même règle que l'application : parcelle la plus proche à 3 m) sont considérées comme déjà
--    alertées — c'est la SEULE écriture de cette migration (auteur « migration »), aucune autre donnée réécrite.
-- ② ARNO : « deux syndics sur une même parcelle » confirmés à la main ⇒ `gestion_copropriete_conflit` : les deux
--    copropriétés, leurs syndics AU MOMENT de la confirmation (le conflit cesse si l'un change), la parcelle, qui et
--    quand ; « Vérifié, pas d'erreur » ⇒ verifie_le / verifie_par (historisé, jamais effacé).
--
-- MIGRATION D'AJOUT. Idempotente (IF NOT EXISTS ; l'UPDATE ne touche que les lignes encore NULL).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_copropriete
  ADD COLUMN IF NOT EXISTS alerte_parcelle_le timestamptz,
  ADD COLUMN IF NOT EXISTS alerte_parcelle_par_libelle text;

WITH adr AS (
  SELECT c.id AS copro, c.cle_immeuble AS cle, c.code_postal AS cp, c.commune FROM gestion_copropriete c
  UNION ALL
  SELECT a.copropriete_id, a.cle_immeuble, coalesce(a.code_postal, c.code_postal), coalesce(a.commune, c.commune)
    FROM gestion_copropriete_adresse a JOIN gestion_copropriete c ON c.id = a.copropriete_id WHERE a.retire_le IS NULL
), pts AS (
  SELECT DISTINCT ON (adr.copro, adr.cle) adr.copro, adr.cle, b.geom
    FROM adr JOIN adresse_ban b
      ON b.numero = nullif(substring(adr.cle from '^[0-9]+'), '')::int
     AND (CASE WHEN adr.cp ~ '^75[0-9]{3}$' THEN b.insee_commune = '751' || right(adr.cp, 2)
               ELSE btrim(regexp_replace(lower(unaccent(b.nom_commune)), '[^a-z0-9]+', ' ', 'g'))
                  = btrim(regexp_replace(lower(unaccent(coalesce(adr.commune, ''))), '[^a-z0-9]+', ' ', 'g')) END)
     AND btrim(regexp_replace(lower(unaccent(b.numero::text || ' ' || coalesce(b.suffixe, '') || ' ' || b.nom_voie)), '[^a-z0-9]+', ' ', 'g')) = adr.cle
), parc AS (
  SELECT pts.copro, pp.fid FROM pts
   CROSS JOIN LATERAL (SELECT q.fid FROM parcelle q WHERE ST_DWithin(q.geom, pts.geom, 3) ORDER BY q.geom <-> pts.geom LIMIT 1) pp
), avec_propositions AS (
  SELECT DISTINCT parc.copro FROM parc
    JOIN parcelle p ON p.fid = parc.fid
    JOIN adresse_ban b2 ON ST_DWithin(p.geom, b2.geom, 3)
   CROSS JOIN LATERAL (SELECT q.fid FROM parcelle q WHERE ST_DWithin(q.geom, b2.geom, 3) ORDER BY q.geom <-> b2.geom LIMIT 1) pp2
   WHERE pp2.fid = parc.fid
     AND btrim(regexp_replace(lower(unaccent(b2.numero::text || ' ' || coalesce(b2.suffixe, '') || ' ' || b2.nom_voie)), '[^a-z0-9]+', ' ', 'g'))
         NOT IN (SELECT cle FROM adr WHERE adr.copro = parc.copro)
)
UPDATE gestion_copropriete c SET alerte_parcelle_le = now(), alerte_parcelle_par_libelle = 'migration'
  FROM avec_propositions x WHERE c.id = x.copro AND c.alerte_parcelle_le IS NULL;

CREATE TABLE IF NOT EXISTS gestion_copropriete_conflit (
  id                  bigserial PRIMARY KEY,
  copropriete_a       bigint NOT NULL REFERENCES gestion_copropriete(id),
  syndic_a            bigint NOT NULL REFERENCES gestion_syndic(id),
  copropriete_b       bigint NOT NULL REFERENCES gestion_copropriete(id),
  syndic_b            bigint NOT NULL REFERENCES gestion_syndic(id),
  parcelle            text,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  cree_par            bigint,
  cree_par_libelle    text NOT NULL,
  verifie_le          timestamptz,
  verifie_par         bigint,
  verifie_par_libelle text,
  CHECK (copropriete_a <> copropriete_b)
);
CREATE INDEX IF NOT EXISTS gestion_copropriete_conflit_a ON gestion_copropriete_conflit (copropriete_a);
CREATE INDEX IF NOT EXISTS gestion_copropriete_conflit_b ON gestion_copropriete_conflit (copropriete_b);
COMMENT ON TABLE gestion_copropriete_conflit IS
  'Lot COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS (336) — deux copropriétés de syndics différents sur une même parcelle, confirmées distinctes à la main. En cours tant que non vérifié et que les deux syndics sont ceux d''alors.';

COMMIT;
