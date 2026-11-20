-- 505_gestion_adresse_officielle_ban.sql — 🔴🔴 L'ADRESSE OFFICIELLE (BAN) DE CHAQUE BIEN, À CÔTÉ DE L'ADRESSE WIPPIMMO (Arno, 20/11/2026, lot 2).
--
-- LA DÉCISION D'ARCHITECTURE (Arno, 20/11/2026) : une copropriété est identifiée par l'IDENTIFIANT BAN de son adresse (celui de l'auto-complétion,
-- `adresse_ban.cle_d_interoperabilite`, ex. « 92026_7184_00054 »), la parcelle en seconde sécurité — et non plus par le texte normalisé.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · gestion_lot_adresse_ban — le rapprochement de chaque bien avec la BAN, HISTORISÉ : identifiant, libellé officiel, numéro, indice, code postal,
--     INSEE, commune, parcelle, score (ressemblance de la voie), méthode, statut (certain / à vérifier / introuvable / validé / refusé), origine
--     (stock, import WIPPIMMO, saisie, file de vérification), le texte d'origine rapproché, le motif, qui et quand. Une seule ligne EN COURS par bien
--     (fin IS NULL) ; un nouveau rapprochement FERME la précédente (fin, qui, motif) — jamais de modification ni d'effacement ;
--   · gestion_copropriete.ban_id — l'identifiant BAN de l'adresse principale de la copropriété ;
--   · gestion_copropriete_adresse.sorte ('adresse' | 'ecriture') et .ban_id — une adresse secondaire est soit une AUTRE adresse officielle du même
--     immeuble (43 avenue Marceau + 74/76/80 rue de Normandie), soit une ÉCRITURE d'origine de la même adresse (« 54 Avneue Puvis de Chavannes »).
--     Toutes les lignes existantes restent des « adresses » (défaut) : rien ne change à l'écran tant que le code ne lit pas ces colonnes.
-- 🔴 L'ADRESSE WIPPIMMO DES BIENS (gestion_annuaire_lot.immeuble / adresse / code_postal / commune) N'EST NI MODIFIÉE NI SUPPRIMÉE.
-- Rien n'est encore lu par les écrans (lot 2). Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE (IF NOT EXISTS) : rejouable.

CREATE TABLE IF NOT EXISTS gestion_lot_adresse_ban (
  id               bigserial PRIMARY KEY,
  lot_id           bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  ban_id           text,
  libelle_officiel text,
  numero           integer,
  suffixe          text,
  code_postal      text,
  insee            text,
  commune          text,
  parcelle         text,
  score            double precision CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  methode          text NOT NULL CHECK (methode IN ('similarite_voie', 'choix_humain', 'auto_completion')),
  statut           text NOT NULL CHECK (statut IN ('certain', 'a_verifier', 'introuvable', 'valide', 'refuse')),
  origine          text NOT NULL CHECK (origine IN ('stock', 'import_wippimmo', 'saisie', 'file_verification')),
  texte_source     text,
  motif            text,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  cree_par         bigint,
  cree_par_libelle text NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  fin              timestamptz,
  fin_par          bigint,
  fin_par_libelle  text,
  fin_motif        text,
  CHECK (fin IS NULL OR fin >= cree_le),
  -- un rapprochement certain ou validé désigne toujours une adresse officielle
  CHECK (statut NOT IN ('certain', 'valide') OR ban_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_lot_adresse_ban_en_cours ON gestion_lot_adresse_ban (lot_id) WHERE fin IS NULL;
CREATE INDEX IF NOT EXISTS gestion_lot_adresse_ban_par_ban ON gestion_lot_adresse_ban (ban_id) WHERE fin IS NULL;
CREATE INDEX IF NOT EXISTS gestion_lot_adresse_ban_a_verifier ON gestion_lot_adresse_ban (statut) WHERE fin IS NULL AND statut IN ('a_verifier', 'introuvable');
COMMENT ON TABLE gestion_lot_adresse_ban IS
  'Adresse officielle BAN de chaque bien, à côté de l''adresse WIPPIMMO (505) : historisée (une ligne en cours par bien, les précédentes fermées par fin), jamais modifiée ni effacée.';

ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS ban_id text;
CREATE INDEX IF NOT EXISTS gestion_copropriete_ban_id ON gestion_copropriete (ban_id) WHERE ban_id IS NOT NULL;
COMMENT ON COLUMN gestion_copropriete.ban_id IS 'Identifiant BAN (cle_d_interoperabilite) de l''adresse principale de la copropriété — migration 505.';

ALTER TABLE gestion_copropriete_adresse ADD COLUMN IF NOT EXISTS sorte text NOT NULL DEFAULT 'adresse';
ALTER TABLE gestion_copropriete_adresse ADD COLUMN IF NOT EXISTS ban_id text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_copropriete_adresse_sorte_chk') THEN
    ALTER TABLE gestion_copropriete_adresse ADD CONSTRAINT gestion_copropriete_adresse_sorte_chk CHECK (sorte IN ('adresse', 'ecriture'));
  END IF;
END $$;
COMMENT ON COLUMN gestion_copropriete_adresse.sorte IS
  'adresse : une autre adresse officielle du même immeuble ; ecriture : une écriture d''origine de la même adresse (variante tapée) — migration 505.';
COMMENT ON COLUMN gestion_copropriete_adresse.ban_id IS 'Identifiant BAN (cle_d_interoperabilite) de cette adresse, quand il est connu — migration 505.';
