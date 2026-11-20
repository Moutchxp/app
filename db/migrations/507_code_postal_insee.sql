-- 507_code_postal_insee.sql — 🔴🔴 LA CORRESPONDANCE CODE POSTAL → COMMUNE (INSEE) (Arno, 20/11/2026, « Adresse officielle BAN », lot 3 bis).
--
-- LE DÉFAUT : la commune d'une adresse était retrouvée par le NOM saisi ; « 5 rue Georges Courteline 92110 CLICHY LA GARENNE » sortait « commune absente »
-- alors que c'est Clichy (INSEE 92024), que la Base Adresse locale nomme « Clichy ». La BAN locale (extrait BD TOPO) ne porte PAS de code postal.
-- LA RÈGLE (Arno) : la commune se retrouve par le CODE POSTAL puis l'INSEE, jamais par le libellé saisi.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la table code_postal_insee (code postal, INSEE, nom de la commune, libellé d'acheminement, source, millésime),
-- remplie par le script app/scripts/codes-postaux-import.ts depuis le fichier de la « Base officielle des codes postaux » (La Poste, Licence Ouverte)
-- déposé à la main. Une ligne par couple (code postal, INSEE). Vide, elle ne change rien : le code garde le repli d'avant (le nom, contrôlé par le
-- département). Aucune autre table touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE (IF NOT EXISTS) : rejouable.

CREATE TABLE IF NOT EXISTS code_postal_insee (
  code_postal          text NOT NULL CHECK (code_postal ~ '^[0-9]{5}$'),
  insee                text NOT NULL CHECK (insee ~ '^[0-9][0-9AB][0-9]{3}$'),
  nom_commune          text NOT NULL,
  libelle_acheminement text,
  source               text NOT NULL,
  millesime            text,
  importe_le           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code_postal, insee)
);
CREATE INDEX IF NOT EXISTS code_postal_insee_par_insee ON code_postal_insee (insee);
COMMENT ON TABLE code_postal_insee IS
  'Correspondance code postal → INSEE (Base officielle des codes postaux, La Poste) : la commune d''une adresse se retrouve par son code postal, jamais par le nom saisi — migration 507.';
