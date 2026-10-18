-- 383_location_preavis.sql — TUILE LOCATION / GESTION (Arno, 18/10/2026) : LE PRÉAVIS DU LOCATAIRE.
--
-- LE BESOIN (Arno) : « nouveau statut EN PRÉAVIS : on saisit la date de réception du recommandé (obligatoire) ; l'outil en
-- déduit la date maximale de sortie = réception + durée de préavis. Durée proposée : meublé → 1 mois ; vide → 1 mois si la
-- commune du bien est en zone tendue, sinon 3 mois ; modifiable préavis par préavis (1 ou 3 mois, ou date maximale saisie à
-- la main), motif libre facultatif. La liste des communes en zone tendue est une DONNÉE EN BASE (table éditable). »
-- Pendant le préavis le locataire OCCUPE toujours le logement : le préavis ne touche JAMAIS `gestion_annuaire_occupation`.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : deux tables neuves. AUCUNE ligne existante n'est modifiée.
--   · `gestion_zone_tendue` — les règles « zone tendue » : un DÉPARTEMENT entier (code postal qui commence par son numéro)
--     ou une COMMUNE (code postal + nom). Amorce : Paris (75), Hauts-de-Seine (92), Seine-Saint-Denis (93), Val-de-Marne (94),
--     toutes marquées « à vérifier ». SOURCE DE L'AMORCE : décret n° 2013-392 du 10 mai 2013 (liste des communes de la taxe
--     sur les logements vacants), annexe, agglomération de Paris, modifié par le décret n° 2023-822 du 25 août 2023 — dont
--     l'unité urbaine de Paris comprend, à notre connaissance, toutes les communes de Paris et des trois départements de la
--     petite couronne. À VÉRIFIER contre le texte en vigueur avant de s'y fier.
--   · `gestion_location_preavis` — un préavis par occupation (un par locataire du bail). 🔴 RIEN N'EST JAMAIS EFFACÉ : une
--     correction AJOUTE une ligne et clôt l'ancienne (`remplace_le`, `remplace_par_id`) ; une annulation clôt la ligne
--     (`annule_le`). Verrou EN BASE : ni DELETE, ni TRUNCATE ; un UPDATE ne peut que CLORE une ligne encore ouverte, sans
--     toucher à son contenu. Un seul préavis OUVERT par occupation (index unique partiel). Auteur figé en texte.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_zone_tendue (
  id bigserial PRIMARY KEY,
  portee text NOT NULL CONSTRAINT gestion_zone_tendue_portee_chk CHECK (portee IN ('departement', 'commune')),
  -- Département : son numéro (« 75 », « 92 »…). Commune : son code postal (« 95100 »).
  code text NOT NULL CONSTRAINT gestion_zone_tendue_code_chk CHECK (btrim(code) <> ''),
  -- Commune : son nom (comparé sans accents ni casse). Département : NULL.
  commune text,
  libelle text NOT NULL CONSTRAINT gestion_zone_tendue_libelle_chk CHECK (btrim(libelle) <> ''),
  source text NOT NULL,
  a_verifier boolean NOT NULL DEFAULT true,
  actif boolean NOT NULL DEFAULT true,
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle text NOT NULL DEFAULT 'migration 383',
  CONSTRAINT gestion_zone_tendue_commune_chk CHECK ((portee = 'commune') = (commune IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_zone_tendue_unique ON gestion_zone_tendue (portee, code, coalesce(lower(commune), ''));

INSERT INTO gestion_zone_tendue (portee, code, commune, libelle, source, a_verifier) VALUES
  ('departement', '75', NULL, 'Paris', 'Décret n° 2013-392 (annexe, agglomération de Paris), modifié par le décret n° 2023-822 — amorce, à vérifier', true),
  ('departement', '92', NULL, 'Hauts-de-Seine (toutes les communes)', 'Décret n° 2013-392 (annexe, agglomération de Paris), modifié par le décret n° 2023-822 — amorce, à vérifier', true),
  ('departement', '93', NULL, 'Seine-Saint-Denis (toutes les communes)', 'Décret n° 2013-392 (annexe, agglomération de Paris), modifié par le décret n° 2023-822 — amorce, à vérifier', true),
  ('departement', '94', NULL, 'Val-de-Marne (toutes les communes)', 'Décret n° 2013-392 (annexe, agglomération de Paris), modifié par le décret n° 2023-822 — amorce, à vérifier', true)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE gestion_zone_tendue IS 'Règles « zone tendue » (préavis d''un logement vide : 1 mois au lieu de 3) : un département entier ou une commune ; table de configuration éditable, amorce à vérifier — migration 383.';

CREATE TABLE IF NOT EXISTS gestion_location_preavis (
  id bigserial PRIMARY KEY,
  occupation_id bigint NOT NULL REFERENCES gestion_annuaire_occupation(id),
  -- La date de réception du recommandé (obligatoire).
  recu_le date NOT NULL,
  -- « mois » (1 ou 3 mois après la réception) ou « date_manuelle » (date maximale saisie à la main).
  mode text NOT NULL CONSTRAINT gestion_location_preavis_mode_chk CHECK (mode IN ('mois', 'date_manuelle')),
  duree_mois integer CONSTRAINT gestion_location_preavis_duree_chk CHECK (duree_mois IS NULL OR duree_mois IN (1, 3)),
  date_max date NOT NULL,
  -- Ce que l'outil proposait au moment de la saisie (pour l'audit) : durée, et les deux faits qui la fondent.
  duree_proposee_mois integer,
  meuble boolean,
  zone_tendue boolean,
  motif text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par bigint,
  cree_par_libelle text NOT NULL,
  remplace_le timestamptz,
  -- Vérifiée en fin de transaction : la ligne remplaçante prend l'identifiant réservé APRÈS la clôture de l'ancienne.
  remplace_par_id bigint REFERENCES gestion_location_preavis(id) DEFERRABLE INITIALLY DEFERRED,
  annule_le timestamptz,
  annule_par_libelle text,
  CONSTRAINT gestion_location_preavis_mode_duree_chk CHECK ((mode = 'mois') = (duree_mois IS NOT NULL)),
  CONSTRAINT gestion_location_preavis_dates_chk CHECK (date_max >= recu_le)
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_preavis_un_ouvert
  ON gestion_location_preavis (occupation_id) WHERE remplace_le IS NULL AND annule_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_location_preavis_par_occupation ON gestion_location_preavis (occupation_id, cree_le DESC);

-- Le verrou : une ligne ne se CLÔT qu'une fois (remplacée OU annulée), et rien d'autre ne change ; jamais d'effacement.
CREATE OR REPLACE FUNCTION gestion_location_preavis_cloture_seule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'gestion_location_preavis : ajout seul (% refusé) — migration 383', TG_OP;
  END IF;
  IF OLD.remplace_le IS NOT NULL OR OLD.annule_le IS NOT NULL THEN
    RAISE EXCEPTION 'gestion_location_preavis : ligne déjà close — migration 383';
  END IF;
  IF (NEW.occupation_id, NEW.recu_le, NEW.mode, NEW.duree_mois, NEW.date_max, NEW.duree_proposee_mois, NEW.meuble,
      NEW.zone_tendue, NEW.motif, NEW.cree_le, NEW.cree_par, NEW.cree_par_libelle)
     IS DISTINCT FROM (OLD.occupation_id, OLD.recu_le, OLD.mode, OLD.duree_mois, OLD.date_max, OLD.duree_proposee_mois, OLD.meuble,
      OLD.zone_tendue, OLD.motif, OLD.cree_le, OLD.cree_par, OLD.cree_par_libelle) THEN
    RAISE EXCEPTION 'gestion_location_preavis : le contenu d''un préavis ne se modifie pas (une correction ajoute une ligne) — migration 383';
  END IF;
  IF (NEW.remplace_le IS NULL) = (NEW.annule_le IS NULL) THEN
    RAISE EXCEPTION 'gestion_location_preavis : une ligne se clôt par remplacement OU par annulation — migration 383';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_location_preavis_verrou ON gestion_location_preavis;
CREATE TRIGGER gestion_location_preavis_verrou BEFORE UPDATE OR DELETE ON gestion_location_preavis
  FOR EACH ROW EXECUTE FUNCTION gestion_location_preavis_cloture_seule();
DROP TRIGGER IF EXISTS gestion_location_preavis_no_truncate ON gestion_location_preavis;
-- ⚠️ Sa PROPRE fonction (et non `gestion_ajout_seul_refuser`, née en 372) : la migration s'applique aussi sur une base sans 372.
CREATE TRIGGER gestion_location_preavis_no_truncate BEFORE TRUNCATE ON gestion_location_preavis
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_preavis_cloture_seule();

COMMENT ON TABLE gestion_location_preavis IS 'Préavis de départ d''un locataire (par occupation) : réception du recommandé, durée (1 ou 3 mois, ou date maximale saisie), motif ; une correction ajoute une ligne et clôt l''ancienne, une annulation clôt la ligne ; jamais effacé — migration 383.';
