-- 491_gestion_copropriete_rattachement_refus.sql — 🔴🔴 « NON, C'EST UNE AUTRE COPROPRIÉTÉ », MÉMORISÉ (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 5).
--
-- LA DÉCISION (Arno, 17/11/2026) : « 3. À la création ou modification d'un bien dont l'adresse n'appartient à aucune copropriété mais tombe sur la parcelle
-- d'une copropriété existante, le système PROPOSE « Rattacher à la copropriété <nom> — <adresses> ? » ; rattacher ajoute cette adresse (avec son propre bloc
-- digicode mère + filles, vide au départ) après confirmation, jamais automatiquement » ; « La réponse « Non, c'est une autre copropriété » est mémorisée pour
-- cette adresse et la question ne revient plus. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la table des réponses « Non » — une adresse (sa clé), la copropriété proposée, qui et quand ; une seule par couple.
-- Aucune ligne existante touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, la proposition s'affiche quand même ; « Non » la masque pour la saisie en cours seulement (rien n'est mémorisé) — l'écran le dit.

CREATE TABLE IF NOT EXISTS gestion_copropriete_rattachement_refus (
  id bigserial PRIMARY KEY,
  adresse_cle text NOT NULL CHECK (btrim(adresse_cle) <> ''),
  copropriete_id bigint NOT NULL REFERENCES gestion_copropriete(id),
  refuse_le timestamptz NOT NULL DEFAULT now(),
  par bigint,
  par_libelle text NOT NULL CHECK (btrim(par_libelle) <> ''),
  CONSTRAINT gestion_copropriete_rattachement_refus_unique UNIQUE (adresse_cle, copropriete_id)
);
COMMENT ON TABLE gestion_copropriete_rattachement_refus IS 'Réponses « Non, c''est une autre copropriété » à la proposition de rattachement par parcelle (adresse, copropriété) — migration 491.';
