-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LOT 5e — LES BROUILLONS DE LA BOÎTE GESTION.
--
-- 🔴 LIVRÉE NON APPLIQUÉE. Tant qu'elle ne l'est pas, les boutons de rédaction ne s'affichent pas et l'écran DIT
-- « mise à jour de la base à appliquer » (sonde de schéma hors transaction, cf. app/lib/gestion/schemaEnvoi.ts).
-- Aucun écran ne casse, aucune fonctionnalité existante ne change.
--
-- 🔴 UN BROUILLON N'EST JAMAIS SUPPRIMÉ. Abandonné, il est DATÉ (`abandonne_le`) et reste en base. Quelqu'un qui écrit
-- trois paragraphes, ferme la fenêtre et revient doit les retrouver — et quelqu'un qui abandonne doit pouvoir revenir
-- sur sa décision. Un DELETE ici serait une perte silencieuse de travail humain.
--
-- ADDITIVE, réversible, sans effet sur l'existant : une table neuve, aucune colonne touchée ailleurs.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gestion_brouillon (
  id                 bigserial PRIMARY KEY,

  -- L'échange visé. NULL = nouveau message hors de tout fil (bouton « Nouveau message »).
  fil_id             bigint REFERENCES gestion_fil(id) ON DELETE SET NULL,
  -- Le message auquel on répond, pour In-Reply-To / References à l'envoi. NULL pour un nouveau message.
  repond_a_message_id bigint REFERENCES gestion_message(id) ON DELETE SET NULL,

  voie               text NOT NULL CHECK (voie IN ('repondre', 'repondre_tous', 'transferer', 'nouveau')),

  -- Les destinataires, tels que la personne les a posés. `jsonb` d'un tableau de chaînes : autant d'adresses que voulu,
  --   et l'ordre de saisie conservé (c'est celui qu'on relit).
  dest_a             jsonb NOT NULL DEFAULT '[]'::jsonb,
  dest_cc            jsonb NOT NULL DEFAULT '[]'::jsonb,
  dest_cci           jsonb NOT NULL DEFAULT '[]'::jsonb,

  objet              text NOT NULL DEFAULT '',
  corps              text NOT NULL DEFAULT '',
  -- Le message d'origine cité, figé à l'ouverture : le fil peut bouger, la citation d'un brouillon ne doit pas.
  citation           text,

  -- QUI écrit. Lu dans la SESSION côté serveur, jamais envoyé par le navigateur (invariant du lot 5-DROITS).
  auteur_id          integer,
  auteur_libelle     text NOT NULL,

  cree_le            timestamptz NOT NULL DEFAULT now(),
  maj_le             timestamptz NOT NULL DEFAULT now(),
  -- Daté quand on abandonne, daté quand l'envoi part : dans les deux cas le brouillon quitte la liste sans disparaître.
  abandonne_le       timestamptz,
  envoye_le          timestamptz
);

-- Retrouver le brouillon d'un échange en rouvrant la conversation : c'est la lecture la plus fréquente de la table.
CREATE INDEX IF NOT EXISTS gestion_brouillon_fil_idx
  ON gestion_brouillon (fil_id, maj_le DESC)
  WHERE abandonne_le IS NULL AND envoye_le IS NULL;

-- La liste du libellé « Brouillons » : les vivants, du plus récemment touché au plus ancien.
CREATE INDEX IF NOT EXISTS gestion_brouillon_vivants_idx
  ON gestion_brouillon (maj_le DESC)
  WHERE abandonne_le IS NULL AND envoye_le IS NULL;

COMMENT ON TABLE gestion_brouillon IS
  'LOT 5e — brouillons de la boîte gestion. Jamais supprimés : abandonnés ou envoyés, ils sont datés et conservés.';
