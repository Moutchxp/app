-- 406_location_suivi_activite.sql — LOCATION (Arno, 22/10/2026) : « OUTILS DE SUIVI », LE TABLEAU DE BORD DE L'ACTIVITÉ.
--
-- Modèle : le suivi mensuel d'Arno (CA_JBP_2026.xlsx) — une ligne = un bail signé dans le mois : honoraires propriétaire et
-- locataire HT, prime de nouvelle gestion, apporteur d'affaires et sa commission ; en bas : CA, CA net d'apporteurs, commission
-- brute du négociateur = taux × (CA − apporteurs) + primes − rétrocessions ; ventilation avec / sans gestion.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · `gestion_location_apporteur` + `gestion_location_apporteur_bareme` : le référentiel des apporteurs (partenaire externe,
--     agence, Internet, collaborateur) et ses taux / coûts fixes DATÉS — la ligne la plus récente à la date de signature fait foi,
--     jamais rétroactif ;
--   · `gestion_location_commission_regle` : la règle de commission du négociateur, datée (15 %, primes 150 / 15 au départ) ;
--   · `gestion_location_retrocession` : les rétrocessions saisies à la main (ex. « Alex Coms », 200 € en août 2026) ;
--   · `gestion_location_activite` : UNE LIGNE PAR BAIL SIGNÉ (ou avenant, ou mandat de gestion seul) — date de signature,
--     honoraires HT propriétaire et locataire, négociateur, apporteur et taux appliqué, prime, avec / sans gestion, loyers,
--     origine client (déduite + correction), provenance (saisie, import) et rapprochement ;
--   · `admin_utilisateur.perm_commissions` : le droit « Voir les commissions » (administrateur : implicite) ;
--   · les honoraires TTC DÉJÀ saisis dans les conditions d'entrée sont RECOPIÉS en HT (÷ 1,2) dans une ligne d'activité par
--     bail — les montants TTC d'origine restent tels quels dans `gestion_location_conditions_entree`.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.

-- ── Référentiel des apporteurs ──────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_location_apporteur (
  id                 bigserial PRIMARY KEY,
  nom                text NOT NULL CHECK (btrim(nom) <> ''),
  type               text NOT NULL CHECK (type IN ('partenaire', 'agence', 'internet', 'collaborateur')),
  cree_le            timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle   text,
  archive_le         timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_apporteur_nom_uniq
  ON gestion_location_apporteur (lower(btrim(nom))) WHERE archive_le IS NULL;

CREATE TABLE IF NOT EXISTS gestion_location_apporteur_bareme (
  id                 bigserial PRIMARY KEY,
  apporteur_id       bigint NOT NULL REFERENCES gestion_location_apporteur(id),
  depuis             date NOT NULL,
  taux               numeric(7,4) NOT NULL CHECK (taux >= 0 AND taux <= 1),
  cout_fixe_mensuel  numeric(12,2) NOT NULL DEFAULT 0 CHECK (cout_fixe_mensuel >= 0),
  saisi_le           timestamptz NOT NULL DEFAULT now(),
  saisi_par_libelle  text,
  UNIQUE (apporteur_id, depuis)
);

-- ── Règle de commission du négociateur ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_location_commission_regle (
  id                       bigserial PRIMARY KEY,
  depuis                   date NOT NULL UNIQUE,
  taux_negociateur         numeric(7,4) NOT NULL CHECK (taux_negociateur >= 0 AND taux_negociateur <= 1),
  prime_gestion_logement   numeric(12,2) NOT NULL CHECK (prime_gestion_logement >= 0),
  prime_gestion_parking    numeric(12,2) NOT NULL CHECK (prime_gestion_parking >= 0),
  saisi_le                 timestamptz NOT NULL DEFAULT now(),
  saisi_par_libelle        text
);
INSERT INTO gestion_location_commission_regle (depuis, taux_negociateur, prime_gestion_logement, prime_gestion_parking, saisi_par_libelle)
VALUES ('2026-01-01', 0.15, 150, 15, 'migration 406 (suivi d’Arno 2026)')
ON CONFLICT (depuis) DO NOTHING;

CREATE TABLE IF NOT EXISTS gestion_location_retrocession (
  id                   bigserial PRIMARY KEY,
  negociateur_id       bigint,
  negociateur_libelle  text NOT NULL CHECK (btrim(negociateur_libelle) <> ''),
  mois                 date NOT NULL CHECK (extract(day FROM mois) = 1),
  montant              numeric(12,2) NOT NULL CHECK (montant > 0),
  libelle              text NOT NULL CHECK (btrim(libelle) <> ''),
  saisi_le             timestamptz NOT NULL DEFAULT now(),
  saisi_par_libelle    text,
  annule_le            timestamptz,
  annule_par_libelle   text
);

-- ── L'activité : une ligne par bail signé ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_location_activite (
  id                              bigserial PRIMARY KEY,
  type                            text NOT NULL DEFAULT 'bail' CHECK (type IN ('bail', 'avenant', 'gestion_seule')),
  date_signature                  date NOT NULL,
  date_signature_supposee         boolean NOT NULL DEFAULT false,
  bail_id                         bigint REFERENCES gestion_bail(id),
  lot_id                          bigint REFERENCES gestion_annuaire_lot(id),
  proprietaire_id                 bigint REFERENCES gestion_annuaire_proprietaire(id),
  locataire_id                    bigint REFERENCES gestion_annuaire_locataire(id),
  libelle_proprietaire            text NOT NULL DEFAULT '',
  libelle_locataire               text NOT NULL DEFAULT '',
  hono_proprietaire_ht            numeric(12,2) NOT NULL DEFAULT 0 CHECK (hono_proprietaire_ht >= 0),
  hono_locataire_ht               numeric(12,2) NOT NULL DEFAULT 0 CHECK (hono_locataire_ht >= 0),
  negociateur_id                  bigint,
  negociateur_libelle             text NOT NULL DEFAULT '',
  apporteur_id                    bigint REFERENCES gestion_location_apporteur(id),
  apporteur_taux                  numeric(7,4) CHECK (apporteur_taux IS NULL OR (apporteur_taux >= 0 AND apporteur_taux <= 1)),
  apporteur_commission_saisie     numeric CHECK (apporteur_commission_saisie IS NULL OR apporteur_commission_saisie >= 0),
  mandat_gestion                  boolean NOT NULL DEFAULT false,
  categorie_prime                 text CHECK (categorie_prime IS NULL OR categorie_prime IN ('logement', 'parking')),
  prime_gestion_saisie            numeric CHECK (prime_gestion_saisie IS NULL OR prime_gestion_saisie >= 0),
  avec_gestion                    boolean NOT NULL DEFAULT false,
  loyer_hc                        numeric(12,2) CHECK (loyer_hc IS NULL OR loyer_hc >= 0),
  charges                         numeric(12,2) CHECK (charges IS NULL OR charges >= 0),
  origine_proprietaire_deduite    text CHECK (origine_proprietaire_deduite IS NULL OR origine_proprietaire_deduite IN ('nouveau', 'deja')),
  origine_proprietaire_saisie     text CHECK (origine_proprietaire_saisie IS NULL OR origine_proprietaire_saisie IN ('nouveau', 'deja')),
  origine_locataire_deduite       text CHECK (origine_locataire_deduite IS NULL OR origine_locataire_deduite IN ('nouveau', 'deja')),
  origine_locataire_saisie        text CHECK (origine_locataire_saisie IS NULL OR origine_locataire_saisie IN ('nouveau', 'deja')),
  source                          text NOT NULL CHECK (source IN ('saisie', 'saisie_existante', 'import')),
  rattachement                    text NOT NULL DEFAULT 'rattache' CHECK (rattachement IN ('rattache', 'douteux', 'non_rattache')),
  import_cle                      text UNIQUE,
  import_score                    numeric(5,4),
  commentaire                     text,
  cree_le                         timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle                text,
  modifie_le                      timestamptz,
  modifie_par_libelle             text,
  annule_le                       timestamptz,
  annule_par_libelle              text
);
-- La commission d'apporteur et la prime SAISIES (reprise du suivi d'Arno) gardent leur valeur exacte (ex. 64,387 = 643,87 × 10 %) :
-- aucun arrondi, les totaux du mois retombent au centime sur ceux du fichier.
CREATE INDEX IF NOT EXISTS gestion_location_activite_date_idx ON gestion_location_activite (date_signature) WHERE annule_le IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_activite_bail_uniq
  ON gestion_location_activite (bail_id) WHERE bail_id IS NOT NULL AND type = 'bail' AND annule_le IS NULL;

-- ── Le droit « Voir les commissions » ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_commissions boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN admin_utilisateur.perm_commissions IS
  'Voir les commissions (négociateurs, apporteurs) dans « Outils de suivi » de la Location. Administrateur : implicite (migration 406).';

-- ── Les honoraires TTC déjà saisis → une ligne d'activité HT par bail (TTC ÷ 1,2) ──────────────────────────────────
-- Date de signature inconnue avant cette migration : la date d'entrée du bail, marquée « supposée ». Avec / sans gestion :
-- le statut du bien aujourd'hui. Les montants TTC d'origine ne sont pas touchés.
INSERT INTO gestion_location_activite
  (type, date_signature, date_signature_supposee, bail_id, lot_id, libelle_proprietaire, libelle_locataire,
   hono_proprietaire_ht, hono_locataire_ht, negociateur_libelle, avec_gestion, source, cree_par_libelle)
SELECT 'bail',
       coalesce(b.entree, (ce.saisi_le AT TIME ZONE 'Europe/Paris')::date), true,
       ce.bail_id, ce.lot_id,
       coalesce((SELECT p.nom_complet FROM gestion_annuaire_lot l JOIN gestion_annuaire_proprietaire p ON p.id = l.proprietaire_id
                 WHERE l.id = ce.lot_id), ''),
       coalesce((SELECT string_agg(coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom), ', ' ORDER BY lo.id)
                 FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire lo ON lo.id = o.locataire_id
                 WHERE o.bail_id = ce.bail_id), ''),
       round(coalesce(ce.hono_total_proprietaire, 0) / 1.2, 2),
       round(coalesce(ce.honoraires_agence_centimes, 0) / 100.0 / 1.2, 2),
       coalesce(ce.saisi_par_libelle, ''),
       coalesce((SELECT l.statut_bien = 'en_gestion' FROM gestion_annuaire_lot l WHERE l.id = ce.lot_id), false),
       'saisie_existante', 'migration 406 (TTC ÷ 1,2)'
FROM gestion_location_conditions_entree ce
JOIN gestion_bail b ON b.id = ce.bail_id
WHERE ce.bail_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM gestion_location_activite a WHERE a.bail_id = ce.bail_id AND a.type = 'bail' AND a.annule_le IS NULL)
  AND ce.id = (SELECT max(ce2.id) FROM gestion_location_conditions_entree ce2 WHERE ce2.bail_id = ce.bail_id);
