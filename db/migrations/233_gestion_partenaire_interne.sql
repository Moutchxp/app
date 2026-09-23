-- 233_gestion_partenaire_interne.sql — MODULE « GESTION » : la TROISIÈME catégorie d'expéditeur. LOT 4d.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — LA FILE SE TROMPAIT SUR « QUI PARLE ».
--
-- Jusqu'ici le module ne connaissait que DEUX sortes d'expéditeurs (`capture.ts:241`) : `adresse_gestion` = nous, et TOUT LE RESTE
-- = un demandeur extérieur. Or 168 messages viennent de gestion.criterimmo@gmail.com, sous le nom « Service Gestion » :
--   · elle n'écrit JAMAIS à un propriétaire, un locataire ou un artisan — les 168 sont adressés à gestion@criterimmo.fr, et à
--     personne d'autre (mesuré en base le 23/09/2026) ;
--   · nous lui adressons 414 messages ;
--   · seuls 66 de ces 168 messages sont suivis d'un envoi réel vers l'extérieur.
-- C'est la COMPTABILITÉ DE LA GESTION, externalisée à la société ADHOC Gestion. Par principe, elle n'est jamais en contact direct
-- avec les clients : seulement avec nous.
--
-- Elle n'est donc NI « nous » NI un correspondant extérieur — d'où cette table, et deux règles (tenues dans `attente.ts`) :
--   ① fil comportant AU MOINS UN correspondant extérieur → les messages du partenaire sont TRANSPARENTS pour l'attente : ils ne
--      valent ni réponse au client, ni nouvelle demande. L'attente se calcule sur le dernier message entre nous et l'extérieur.
--   ② fil où il n'y a QUE nous et le partenaire → le partenaire est un demandeur ORDINAIRE : sa question attend notre réponse.
--      (Définition d'Arno : « une demande qui attend une réponse de notre part, QUEL QU'EN SOIT L'AUTEUR ».)
--
-- ⚠️ CE QUI N'EST PAS DANS CETTE TABLE, ET NE DOIT PAS Y ENTRER : les adresses des COLLÈGUES (jb.pons@, a.dasilva@, c.jullien@,
-- m.cohen@, p.thevenin@, a.jorel@, administration@ …). Un collègue du service location qui transfère le mail d'un locataire pose
-- une VRAIE demande — c'est déjà la raison pour laquelle la migration 229 a éteint les deux règles « domaine interne ». Les y
-- mettre ferait disparaître de vraies demandes de la file.
--
-- Réglable sans code : une adresse s'ajoute, se renomme ou s'éteint par un UPDATE, jamais par un déploiement.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL strictement ADDITIVE — une table NOUVELLE et une ligne de graine. Aucune colonne modifiée, aucun DROP, aucun DELETE,
--   aucune donnée existante réécrite (le `sens` des 168 messages reste 'recu' : ils SONT bien reçus par notre boîte — ce qui
--   change n'est pas ce qui est stocké, c'est ce que l'écran en DÉDUIT). Ne touche NI le module Permis, NI le moteur SVAV, NI le
--   verdict, NI le golden Asnières (29.107259068449615). Une seule transaction. Idempotente, rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/233_gestion_partenaire_interne.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_partenaire_interne (
  id       bigserial   PRIMARY KEY,
  -- Toujours en minuscules et sans espaces : la comparaison avec `gestion_message.de_adresse` se fait sur `lower(btrim(...))`,
  --   et une casse qui diverge ferait échouer la reconnaissance EN SILENCE — le pire des défauts.
  adresse  text        NOT NULL,
  -- Ce que l'écran AFFICHE à la place du nom d'expéditeur du mail. « Service Gestion » ne dit rien à personne ;
  --   « Comptabilité (ADHOC Gestion) » dit qui parle et à quel titre.
  libelle  text        NOT NULL,
  actif    boolean     NOT NULL DEFAULT true,
  note     text,
  cree_le  timestamptz NOT NULL DEFAULT now(),
  maj_le   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gestion_partenaire_interne_adresse_key UNIQUE (adresse),
  CONSTRAINT gestion_partenaire_interne_adresse_chk CHECK (adresse = lower(btrim(adresse)) AND adresse <> '' AND adresse LIKE '%@%'),
  CONSTRAINT gestion_partenaire_interne_libelle_chk CHECK (btrim(libelle) <> '')
);

COMMENT ON TABLE gestion_partenaire_interne IS
  'LOT 4d — TROISIÈME catégorie d''expéditeur : ni nous (gestion_config.adresse_gestion), ni un correspondant extérieur. Un partenaire interne travaille AVEC nous et n''est jamais en contact direct avec les clients. Ses messages sont transparents pour « attend une réponse » dans un fil qui comporte un correspondant extérieur, et comptent comme une demande ordinaire dans un fil où il n''y a que nous et lui. ⚠️ N''y mettre AUCUNE adresse de collègue : un collègue qui transfère le mail d''un locataire pose une vraie demande (cf. migration 229).';

-- GRAINE : la comptabilité externalisée. `ON CONFLICT DO NOTHING` → rejouable sans écraser un libellé qu'Arno aurait corrigé.
INSERT INTO gestion_partenaire_interne (adresse, libelle, note)
VALUES ('gestion.criterimmo@gmail.com', 'Comptabilité (ADHOC Gestion)',
        'Comptabilité de la gestion, externalisée à ADHOC Gestion. Mesuré le 23/09/2026 : 168 messages, tous adressés à gestion@criterimmo.fr et à personne d''autre ; jamais de contact direct avec un propriétaire, un locataire ou un artisan.')
ON CONFLICT (adresse) DO NOTHING;

-- Le journal du module n'acceptait que sept sortes d'entités (migration 228) ; il en connaît une huitième. On ÉLARGIT la
--   contrainte nommée — un sur-ensemble ne peut invalider aucune ligne déjà écrite, et le journal reste append-only.
--   (Défaut trouvé en rejouant cette migration sur un cluster jetable AVANT livraison : sans ça, elle échouait.)
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite IN ('message','fil','evenement','affectation','regle','config','releve','partenaire'));

-- Trace au journal du module : pourquoi cette adresse a changé de catégorie, et quand. Le journal est append-only (trigger 228).
INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
SELECT 'partenaire', p.id, 'reglage', 'correspondant extérieur', 'partenaire interne',
       'gestion.criterimmo@gmail.com reconnue comme la comptabilité externalisée (ADHOC Gestion) : ses messages cessent de compter comme des demandes entrantes dans les fils qui ont un correspondant extérieur, et restent des demandes dans les fils où il n''y a que nous et elle.',
       'migration 233'
  FROM gestion_partenaire_interne p
 WHERE p.adresse = 'gestion.criterimmo@gmail.com'
   AND NOT EXISTS (SELECT 1 FROM gestion_journal j WHERE j.entite = 'partenaire' AND j.entite_id = p.id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① la graine est en place :'
--   SELECT adresse, libelle, actif FROM gestion_partenaire_interne ORDER BY adresse;
--
-- \echo '>>> ② l''attente AVANT et APRÈS, sur la file réelle (attendu : 138 puis 127) :'
--   WITH partenaires AS (SELECT array_agg(adresse) AS a FROM gestion_partenaire_interne WHERE actif),
--        nous AS (SELECT lower(btrim(adresse_gestion)) AS a FROM gestion_config WHERE id = 1),
--        d_tous AS (SELECT DISTINCT ON (m.fil_id) m.fil_id, m.sens, m.automatique, m.recu_le
--                     FROM gestion_message m WHERE m.exclu_le IS NULL ORDER BY m.fil_id, m.recu_le DESC, m.id DESC),
--        d_hors AS (SELECT DISTINCT ON (m.fil_id) m.fil_id, m.sens, m.automatique
--                     FROM gestion_message m WHERE m.exclu_le IS NULL
--                      AND lower(btrim(m.de_adresse)) <> ALL ((SELECT a FROM partenaires))
--                    ORDER BY m.fil_id, m.recu_le DESC, m.id DESC),
--        ext AS (SELECT DISTINCT m.fil_id FROM gestion_message m WHERE m.exclu_le IS NULL
--                  AND lower(btrim(m.de_adresse)) <> ALL ((SELECT a FROM partenaires))
--                  AND lower(btrim(m.de_adresse)) <> (SELECT a FROM nous))
--   SELECT count(*) FILTER (WHERE t.sens = 'recu' AND NOT t.automatique) AS attente_avant,
--          count(*) FILTER (WHERE CASE WHEN e.fil_id IS NOT NULL
--                                 THEN (h.sens = 'recu' AND NOT h.automatique)
--                                 ELSE (t.sens = 'recu' AND NOT t.automatique) END) AS attente_apres
--     FROM gestion_fil f
--     JOIN d_tous t ON t.fil_id = f.id
--     LEFT JOIN d_hors h ON h.fil_id = f.id
--     LEFT JOIN ext e ON e.fil_id = f.id
--    WHERE f.etat = 'a_classer' AND t.recu_le >= now() - interval '30 days';
--
-- \echo '>>> ③ AUCUNE adresse de collègue ne doit figurer dans la table (attendu : 0 ligne) :'
--   SELECT adresse FROM gestion_partenaire_interne
--    WHERE adresse LIKE '%@sansvisavis.com' OR adresse LIKE '%@criterimmo.fr';
--
-- \echo '>>> ④ la borne mord (les deux doivent ÉCHOUER, et rien ne doit rester) :'
--   BEGIN; INSERT INTO gestion_partenaire_interne (adresse, libelle) VALUES ('MAJUSCULE@x.fr', 'x'); ROLLBACK;  -- casse refusée
--   BEGIN; INSERT INTO gestion_partenaire_interne (adresse, libelle) VALUES ('sansarobase', 'x'); ROLLBACK;     -- adresse refusée
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (l'écran retombe sur son comportement d'avant : deux catégories, la compta redevient un demandeur) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "DROP TABLE IF EXISTS gestion_partenaire_interne;"
--   (la ligne de journal, elle, RESTE : le journal est append-only, et une trace ne se réécrit pas.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
