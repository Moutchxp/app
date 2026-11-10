-- 463_gestion_monga_traduction.sql — GESTION (Arno, 10/11/2026) : LA TRADUCTION EN FRANÇAIS DES COMMENTAIRES MONGA ÉCRITS DANS UNE AUTRE LANGUE.
--
-- LE BESOIN (Arno) : un commentaire Monga rédigé en espagnol, en anglais… s'affiche traduit, sous « Traduit automatiquement de l'… »,
-- avec « Voir l'original ». LE TEXTE D'ORIGINE N'EST JAMAIS MODIFIÉ NI REMPLACÉ : la traduction vit dans une table À CÔTÉ de l'étape,
-- et rien ici ne touche `gestion_monga_etape`. La traduction est seulement affichée : elle ne crée, ne modifie ni ne valide aucune étape.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · une table `gestion_monga_traduction`, une ligne au plus par étape : la langue détectée, le texte traduit, le service utilisé, la date ;
--     `statut` = 'traduite' (traduction disponible), 'francais' (le service a répondu « déjà en français » : rien à afficher de plus),
--     'echec' (le service n'a pas répondu : l'original s'affiche avec « Traduction indisponible », une nouvelle tentative a lieu plus tard).
--   · AUCUNE ligne existante n'est modifiée ; aucune traduction n'est créée par la migration (les commentaires déjà enregistrés passent par
--     le script `gestion:monga-commentaires:traduire`, lancé à la main).
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, aucun commentaire n'est traduit et la frise affiche les textes comme avant.

CREATE TABLE IF NOT EXISTS gestion_monga_traduction (
  etape_id             bigint PRIMARY KEY REFERENCES gestion_monga_etape(id) ON DELETE CASCADE,
  statut               text NOT NULL CHECK (statut IN ('traduite', 'francais', 'echec')),
  langue               text,
  texte_traduit        text,
  service              text,
  traduit_le           timestamptz,
  tentatives           integer NOT NULL DEFAULT 1 CHECK (tentatives >= 1),
  derniere_tentative_le timestamptz NOT NULL DEFAULT now(),
  erreur               text,
  CHECK (statut <> 'traduite' OR (texte_traduit IS NOT NULL AND langue IS NOT NULL AND service IS NOT NULL AND traduit_le IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gestion_monga_traduction_echec_idx
  ON gestion_monga_traduction (derniere_tentative_le) WHERE statut = 'echec';

COMMENT ON TABLE gestion_monga_traduction IS
  'Traduction en français d''un commentaire Monga écrit dans une autre langue (affichage seul, jamais à la place de gestion_monga_etape.texte, qui reste l''original ; aucune étape n''en dépend) — migration 463.';
COMMENT ON COLUMN gestion_monga_traduction.statut IS
  'traduite = texte_traduit affiché sous « Traduit automatiquement de … » ; francais = déjà en français, rien à afficher ; echec = « Traduction indisponible », nouvelle tentative plus tard.';
COMMENT ON COLUMN gestion_monga_traduction.service IS 'Service de traduction utilisé (ex. « mistral:mistral-small-latest »).';
