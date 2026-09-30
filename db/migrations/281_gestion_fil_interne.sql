-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 281 — « INTERNE » : UN ÉCHANGE ENTRE COLLÈGUES, SANS BIEN À RATTACHER (lot RATTACHER-EN-ECRIVANT, 30/09/2026)
--
-- 🔴🔴 MIGRATION LIVRÉE NON APPLIQUÉE. La règle du module : une migration se livre, elle ne s'applique pas toute
-- seule. Je demande avant.
--
--    Pour l'appliquer :  psql "$DATABASE_URL" -f db/migrations/281_gestion_fil_interne.sql
--
-- ═══ CE QUE ÇA RÉPARE ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- Demande d'Arno : « un bouton “Interne” : échange entre collègues sans bien à rattacher ». Ces échanges-là
-- restaient rouges « À classer » pour toujours — un reproche permanent sur un courrier qui n'a rien à se
-- reprocher. C'est la même famille de problème que « Hors gestion » (migration 266), et volontairement la même
-- forme de table : une ligne posée à la main, datée, signée, et réversible sans jamais rien effacer.
--
-- ═══ 🔴🔴 POURQUOI SUR L'ÉCHANGE, ET NON SUR LE MAIL ════════════════════════════════════════════════════════════
--
-- C'est LA différence avec `gestion_hors_gestion`, et elle vient d'un constat d'Arno : quand on marque « Interne »
-- un mot envoyé à un collègue et que celui-ci répond, SA réponse arrive en Réception et s'affiche « À classer ».
-- Le statut n'aurait alors tenu que le temps d'un aller simple, et il faudrait le reposer à chaque réponse.
--
-- « Interne » qualifie donc la CONVERSATION : `fil_id`, jamais `message_id`. Tout message de l'échange — celui
-- qu'on a écrit comme celui qu'on reçoit demain — porte la capsule verte, sans aucun geste de plus.
--
-- ⚠️ CONSÉQUENCE ASSUMÉE : si un échange marqué interne dérivait un jour vers un vrai sujet de gestion, la marque
-- se lèverait d'un clic (« Visualiser / Modifier »), ou d'elle-même en rattachant un bien — la capsule « Classé »
-- passe AVANT « Interne » dans l'ordre de priorité. Rien ne se bloque, rien ne se perd.
--
-- ═══ 🔴 « INTERNE » N'EST JAMAIS POSÉ AUTOMATIQUEMENT ═══════════════════════════════════════════════════════════
--
-- L'écran le PROPOSE en premier quand tous les destinataires sont en @sansvisavis.com ou @criterimmo.fr — mais
-- c'est une proposition, jamais une décision. Un moteur qui classerait tout seul un échange « interne » le
-- retirerait de la file de quelqu'un sans que personne ne sache lequel. La contrainte l'interdit EN BASE : un
-- garde applicatif se contourne au prochain script, une contrainte non.
--
-- ═══ CE QUE CETTE MIGRATION NE FAIT PAS ════════════════════════════════════════════════════════════════════════
--
-- Elle ne touche NI `gestion_rattachement`, NI `gestion_message`, NI `gestion_fil`, NI `gestion_hors_gestion`.
-- Aucune colonne n'est ajoutée à une table existante, aucune contrainte existante n'est relâchée, aucune donnée
-- n'est lue ni réécrite. C'est une table neuve, vide, et rien d'autre.
--
-- 🔒 LES 🔴🔴 « Documents clients scannés » ne sont concernés à aucun titre : cette table ne décrit que des
-- échanges de courrier.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_fil_interne (
  id                 bigserial PRIMARY KEY,
  -- 🔴 L'ÉCHANGE, PAS LE MESSAGE. Voir l'encadré ci-dessus : c'est tout l'objet de cette table.
  fil_id             bigint      NOT NULL REFERENCES gestion_fil(id) ON DELETE CASCADE,
  pose_le            timestamptz NOT NULL DEFAULT now(),
  pose_par           bigint      REFERENCES admin_utilisateur(id),
  -- 🔴 LE NOM DU COLLABORATEUR, TOUJOURS. Jamais 'automatique' : voir la contrainte plus bas.
  pose_par_libelle   text        NOT NULL,
  -- Le retrait : la ligne RESTE, elle est seulement datée et signée comme annulée.
  retire_le          timestamptz,
  retire_par         bigint      REFERENCES admin_utilisateur(id),
  retire_par_libelle text,
  retire_motif       text,
  -- 🔴 JAMAIS AUTOMATIQUE. Un libellé vide, ou le mot que le moteur de rattachement signe, sont refusés EN BASE.
  CONSTRAINT gestion_fil_interne_humain_chk
    CHECK (btrim(pose_par_libelle) <> '' AND lower(btrim(pose_par_libelle)) <> 'automatique'),
  -- Un retrait est daté ET signé, ou n'existe pas : une moitié de retrait ne se lit pas.
  CONSTRAINT gestion_fil_interne_retrait_chk
    CHECK ((retire_le IS NULL AND retire_par_libelle IS NULL)
        OR (retire_le IS NOT NULL AND btrim(coalesce(retire_par_libelle, '')) <> ''))
);

-- ⚠️ UNICITÉ **PARTIELLE** : une seule marque VIVANTE par échange, mais autant de lignes retirées qu'on veut.
--    Sans le « WHERE », une marque annulée bloquerait sa propre remise — et l'historique deviendrait un obstacle
--    au lieu d'être une mémoire. Même forme que l'index de `gestion_hors_gestion`.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_fil_interne_vivante_idx
  ON gestion_fil_interne (fil_id) WHERE retire_le IS NULL;

-- La lecture courante : « cet échange est-il marqué interne ? », pour une page de vingt-cinq lignes d'un coup.
CREATE INDEX IF NOT EXISTS gestion_fil_interne_fil_idx
  ON gestion_fil_interne (fil_id, retire_le);

COMMENT ON TABLE gestion_fil_interne IS
  'Lot RATTACHER-EN-ECRIVANT — un échange entre collègues, sans bien à rattacher. Posé À LA MAIN, jamais par un '
  'moteur (contrainte gestion_fil_interne_humain_chk). Porte sur l''ÉCHANGE et non sur le message, pour que la '
  'réponse d''un collègue hérite du statut au lieu de revenir « à classer ». Réversible : retire_le date et signe '
  'l''annulation, la ligne reste.';

COMMIT;
