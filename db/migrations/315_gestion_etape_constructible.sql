-- ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — CE QU'UNE FRISE QUI SE CONSTRUIT DEMANDE À LA TABLE ═════════════════════════
--
-- DEMANDE D'ARNO (06/10/2026) : « la frise d'avancement n'impose plus aucune suite d'étapes. Elle se CONSTRUIT
-- avec les vraies étapes, dans l'ordre réel (ex. rendez-vous → devis refusé → nouveau rendez-vous → nouveau
-- devis…). » Le réservoir qu'il décrit nomme deux cartes que la table ne connaît pas encore — « Devis refusé »
-- et « Rapport » — et une carte LIBRE dont le TITRE se saisit.
--
-- ═══ 🔴 CE QUE CETTE MIGRATION NE FAIT PAS ══════════════════════════════════════════════════════════════════════
--
-- Elle ne touche AUCUNE ligne existante, ne retire aucun type, ne change aucune valeur par défaut. Les 127 étapes
-- vives du lot MONGA-2 sont intactes, et la règle de permanence d'Arno (« ce qu'un mail Monga apporte est
-- permanent ») n'est pas effleurée : on élargit ce que la colonne ACCEPTE, on ne réécrit rien.
--
-- ⚠️ `devis_refuse` ET `rapport` NE SONT PRODUITS PAR AUCUN MOTIF DE LECTURE MONGA, et c'est mesuré :
-- l'audit du 06/10 a compté **0 mail** annonçant un refus de devis (Monga ne notifie pas la validation, c'est
-- nous qui validons chez eux), et le rapport arrive sous « rapport de visite / d'intervention », déjà rangé en
-- `rdv_eu_lieu` / `intervention`. Les deux nouveaux types sont donc des cartes que seule une MAIN pose — ce qui
-- est exactement ce qu'Arno demande du réservoir.
--
-- ⚠️ `titre` EST NULLABLE, ET LE RESTERA : il ne vaut que pour la carte LIBRE (« carré LIBRE (titre à saisir) »).
-- Partout ailleurs, le mot de la carte vient du TYPE, écrit une seule fois dans `motEtape` — un titre recopié sur
-- chaque carte aurait fini par contredire le type.
--
-- APPLICATION MANUELLE (règle du dépôt) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/315_gestion_etape_constructible.sql
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① LES DEUX NOUVEAUX TYPES ────────────────────────────────────────────────────────────────────────────────
-- Le CHECK est remplacé par une liste ÉLARGIE : tout ce qu'il acceptait, il l'accepte encore.
--
-- 🔴🔴 LE NOM DE LA CONTRAINTE EST `…_type_chk`, ET NON `…_type_check` — PIÈGE RENCONTRÉ EN L'APPLIQUANT.
-- La migration 313 l'a nommée à la main, en `_chk`. Un premier jet de ce fichier écrivait
-- `DROP CONSTRAINT IF EXISTS gestion_monga_etape_type_check` : PostgreSQL a répondu « does not exist, skipping »
-- — un NOTICE, pas une erreur — puis a ajouté une SECONDE contrainte à côté de l'ancienne. Les deux s'appliquent
-- en même temps, et l'ancienne refusait toujours `devis_refuse` : la migration aurait été « appliquée » sans rien
-- débloquer. Les deux noms sont donc retirés ici, et le NOTICE sur celui qui n'existe pas est sans conséquence.
ALTER TABLE gestion_monga_etape DROP CONSTRAINT IF EXISTS gestion_monga_etape_type_chk;
ALTER TABLE gestion_monga_etape DROP CONSTRAINT IF EXISTS gestion_monga_etape_type_check;
ALTER TABLE gestion_monga_etape ADD CONSTRAINT gestion_monga_etape_type_chk CHECK (type = ANY (ARRAY[
  'ouverture', 'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_refuse', 'devis_accepte',
  'rdv_intervention', 'intervention', 'rapport', 'cloture',
  'facture', 'rappel_devis', 'contact_injoignable', 'commentaire',
  'assurance', 'expertise', 'relance', 'autre', 'note'
]));

-- ── ② LE TITRE D'UNE CARTE LIBRE ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_monga_etape ADD COLUMN IF NOT EXISTS titre text;

COMMENT ON COLUMN gestion_monga_etape.titre IS
  'Lot FRISE-CONSTRUCTIBLE : le titre saisi d''une carte LIBRE (type = autre). NULL partout ailleurs — le mot de '
  'la carte vient alors du type.';

COMMIT;
