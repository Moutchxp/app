-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 347 — LOT TACHES-1-BIS : LES CONTACTS DU BIEN CHOISIS DANS UNE TÂCHE, AVEC LEURS COORDONNÉES COPIÉES
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (13/10/2026) : « choisir un ou plusieurs contacts liés à la fiche du bien (propriétaires,
-- locataires en place et anciens, syndic & immeuble, tiers indépendants, non affectés…), leurs coordonnées
-- intégrées directement au texte de la tâche. »
--
-- 🔴 LES COORDONNÉES SONT COPIÉES AU MOMENT DU CHOIX (état daté, `copie_le`). Une fiche qui change ensuite ne
-- modifie pas la tâche en silence : l'écran le signale et propose « Mettre à jour », qui réécrit la copie et la
-- date. Un contact retiré du bien (syndic changé, locataire sorti) garde dans la tâche ses coordonnées d'alors.
--
-- 🔴 RIEN NE S'EFFACE : décocher un contact le marque retiré (`retire_le`, `retire_par_libelle`), la ligne reste.
-- Le déclencheur refuse toute suppression (même exception pour les bases d'essai jetables que la 346).
--
-- 🔴 MIGRATION D'AJOUT, ET SEULEMENT D'AJOUT : une table neuve et ses déclencheurs. Aucune table existante n'est
-- modifiée — la trace des ajouts et retraits passe par `gestion_tache_action` (action « modification », déjà
-- permise par la 346), sans en toucher la contrainte.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_tache_contact (
  id                  bigserial   PRIMARY KEY,
  tache_id            bigint      NOT NULL REFERENCES gestion_tache(id),
  -- La clé STABLE du contact dans la fiche du bien (« proprietaire:12 », « carte:77 », « syndic_contact:9 »,
  --   « adresse:x@y.fr »…) : c'est elle qui retrouve la fiche pour dire « coordonnées modifiées depuis ».
  cle                 text        NOT NULL CHECK (btrim(cle) <> ''),
  -- La famille du bloc PARTIES (proprietaire, locataire, ancien_locataire, syndic_immeuble, independant, a_repartir).
  famille             text        NOT NULL CHECK (famille IN
                        ('proprietaire', 'locataire', 'ancien_locataire', 'syndic_immeuble', 'independant', 'a_repartir')),
  nom                 text        NOT NULL CHECK (btrim(nom) <> ''),
  qualite             text,
  organisation        text,
  adresse             text,
  -- [{ sorte: 'telephone'|'email', libelle, valeur, affichage }] — copiés tels quels.
  coordonnees         jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(coordonnees) = 'array'),
  rang                integer     NOT NULL DEFAULT 0,
  copie_le            timestamptz NOT NULL DEFAULT now(),
  ajoute_le           timestamptz NOT NULL DEFAULT now(),
  ajoute_par_libelle  text        NOT NULL CHECK (btrim(ajoute_par_libelle) <> ''),
  retire_le           timestamptz,
  retire_par_libelle  text,
  CONSTRAINT gestion_tache_contact_retire_chk CHECK ((retire_le IS NULL) = (retire_par_libelle IS NULL))
);

-- Un contact n'est qu'une fois ACTIF dans une tâche ; retiré puis recoché, il reprend une ligne neuve.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_tache_contact_actif_uq
  ON gestion_tache_contact (tache_id, cle) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_tache_contact_tache_idx ON gestion_tache_contact (tache_id);

DROP TRIGGER IF EXISTS gestion_tache_contact_no_delete ON gestion_tache_contact;
CREATE TRIGGER gestion_tache_contact_no_delete BEFORE DELETE ON gestion_tache_contact
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_tache_contact_no_truncate ON gestion_tache_contact;
CREATE TRIGGER gestion_tache_contact_no_truncate BEFORE TRUNCATE ON gestion_tache_contact
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_refuser_suppression();

COMMIT;
