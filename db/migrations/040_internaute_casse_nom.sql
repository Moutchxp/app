-- 040_internaute_casse_nom.sql — Module INTERNAUTE : NORMALISATION DE CASSE des prenom/nom EXISTANTS.
--
-- Reprise de l'existant pour la règle de casse appliquée désormais à l'écriture (ingestion Écran A + rectification,
-- via la fonction pure `app/lib/internaute/casseNom.ts`). Le SQL ci-dessous REPRODUIT EXACTEMENT cette règle :
--   majuscule sur la 1re lettre de CHAQUE segment (séparateurs : espace, tiret, apostrophe ' ou ’),
--   reste du segment LAISSÉ INTACT, SAUF si le segment est ENTIÈREMENT en majuscules → reste minusculisé.
--   (arnaud→Arnaud · jean-pierre→Jean-Pierre · JOREL→Jorel · d'artagnan→D'Artagnan · McDonald→McDonald · O'Brien→O'Brien)
--
-- SÛR : (1) IDEMPOTENT — le WHERE ne retient que les lignes dont la valeur DIFFÈRE de la normalisée (re-run = 0 ligne) ;
--       (2) ne touche JAMAIS un profil effacé (`efface_a IS NOT NULL`, PII déjà NULL) ; (3) NULL-safe (renvoie NULL) ;
--       (4) l'e-mail n'est PAS touché (casse insensible déjà réglée par l'index `lower(email)`). Aucune contrainte ni
--       index ne dépend de `prenom`/`nom`. Fonctions dans `pg_temp` → session-locales, aucun objet laissé en base.

BEGIN;

-- Normalisation d'UN segment (mirroir de casseNom.ts).
CREATE OR REPLACE FUNCTION pg_temp.svv_norm_segment(seg text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
      WHEN seg = '' THEN seg
      WHEN seg = upper(seg) AND seg <> lower(seg)            -- segment ENTIÈREMENT en majuscules
        THEN upper(left(seg, 1)) || lower(substr(seg, 2))
      ELSE upper(left(seg, 1)) || substr(seg, 2)             -- reste LAISSÉ INTACT
    END
  $$;

-- Découpe caractère par caractère (comme le split JS), en conservant les séparateurs.
CREATE OR REPLACE FUNCTION pg_temp.svv_norm_nom(v text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE AS $$
  DECLARE res text := ''; buf text := ''; ch text; i int;
  BEGIN
    IF v IS NULL THEN RETURN NULL; END IF;
    FOR i IN 1 .. length(v) LOOP
      ch := substr(v, i, 1);
      IF ch ~ '[[:space:]]' OR ch = '-' OR ch = '''' OR ch = '’' THEN
        res := res || pg_temp.svv_norm_segment(buf) || ch;
        buf := '';
      ELSE
        buf := buf || ch;
      END IF;
    END LOOP;
    RETURN res || pg_temp.svv_norm_segment(buf);
  END;
  $$;

UPDATE internaute
   SET prenom = pg_temp.svv_norm_nom(prenom),
       nom    = pg_temp.svv_norm_nom(nom),
       maj_a  = now()
 WHERE efface_a IS NULL
   AND ( prenom IS DISTINCT FROM pg_temp.svv_norm_nom(prenom)
      OR nom    IS DISTINCT FROM pg_temp.svv_norm_nom(nom) );

COMMIT;
