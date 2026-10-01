-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 291 — LOT DOCUMENTS-AUTO-PAR-FICHE : UN DOCUMENT AUTOMATIQUE SE RANGE CHEZ UNE PERSONNE, PAS DANS UN LOGEMENT
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴🔴 ⚠️ LIVRÉE NON APPLIQUÉE, PUIS **APPLIQUÉE LE 01/10/2026 SUR ACCORD EXPLICITE D'ARNO**. Elle desserre une
-- contrainte posée après un incident réel, et c'est pourquoi son application a été demandée, jamais décidée ici.
-- Rien dans le code ne l'exige pour fonctionner : sans elle, la sonde `documentsAutoDisponible()` rend « non »,
-- aucune section ne s'affiche, et tout se comporte comme avant.
--
-- ⚠️ ET ELLE A ÉTÉ APPLIQUÉE **DEUX FOIS**, parce que la première écriture de son verrou ne tenait pas : lire le
-- bloc « coalesce » du point ② — c'est la leçon la plus importante de ce fichier.
--
-- ═══ DÉCISION D'ARNO (01/10/2026) ═══════════════════════════════════════════════════════════════════════════════
--
-- « Les documents automatiques ne se rangent PAS par bien mais par PERSONNE : une fiche propriétaire (quel que
-- soit le nombre de personnes dedans) ou une fiche locataire. »
--
-- Mesuré sur la base : 28 275 documents « Document CRITERIMMO » partent de chez nous ; 23 510 (83 %) ont une fiche
-- destinataire CERTAINE — 16 165 locataires, 5 616 propriétaires mono-bien, 1 729 propriétaires multi-biens. Pour
-- ces derniers, le document couvre le COMPTE et non un logement : le contenu est derrière un lien WIPPIMMO qu'on
-- n'ouvre pas, et aucun lot n'est nommé dans le mail.
--
-- ═══ 🔴🔴 CE QUE LE VERROU DU 28/09 PROTÉGEAIT, ET POURQUOI ON NE LE LÈVE PAS ════════════════════════════════════
--
-- La migration 273 a interdit tout lien VIVANT vers autre chose qu'un bien ou un événement. Elle a été posée après
-- un incident précis : la relève continue tournait avec l'ANCIEN moteur chargé en mémoire et a recréé 17 liens
-- « propriétaire » malgré un garde-fou écrit en TypeScript. La leçon est inscrite dans cette migration-là : un
-- garde-fou en code ne protège que le code qu'on vient de charger ; la base, elle, vaut pour tout le monde.
--
-- 🔴 ON NE REVIENT DONC PAS EN ARRIÈRE. La contrainte n'est pas retirée : elle gagne UNE porte, étroite et nommée.
-- Un lien vivant vers une fiche reste interdit — SAUF s'il porte la règle `document_auto`. Autrement dit :
--
--     · « rattacher ce mail à M. DUPONT »            → TOUJOURS REFUSÉ par la base, comme depuis le 28/09 ;
--     · « ce document automatique est dans le dossier de M. DUPONT » → permis, et seulement sous ce nom.
--
-- ⚠️ ET CES LIENS NE SONT PAS DES RATTACHEMENTS. Ils n'alimentent pas l'historique d'un bien, n'entrent dans
-- aucune fenêtre de conversation, et ne comptent dans aucun compteur de classement : tout le code qui lit les
-- rattachements filtre déjà sur `cible_sorte = 'lot'`. C'est ce qui rend cette porte sûre.
--
-- ═══ CE QUE LA MIGRATION FAIT, EXACTEMENT ═══════════════════════════════════════════════════════════════════════
--
--   ① `locataire` rejoint les sortes de cible reconnues (elle manquait : seules `lot`, `proprietaire` et
--      `evenement` existaient, et aucun historique de fiche locataire n'était donc possible) ;
--   ② la contrainte « cible bien » gagne son exception nommée `document_auto` ;
--   ③ un index pour lire les documents d'une fiche sans parcourir les 147 000 lignes.
--
-- 🔴 AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE. Les 19 538 liens « propriétaire » retirés le 28/09 restent retirés,
-- avec leur date, leur auteur et leur motif. On n'écrit rien : on ouvre une possibilité.
--
-- RÉVERSIBLE : les trois instructions inverses sont écrites en commentaire au pied de ce fichier.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① LA SORTE « locataire » ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_sorte_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_sorte_chk
  CHECK (cible_sorte = ANY (ARRAY['lot'::text, 'proprietaire'::text, 'locataire'::text, 'evenement'::text]));

-- Une fiche se désigne par sa CLÉ (comme un lot), jamais par un identifiant interne : la clé survit à un
--   réimport de l'annuaire, l'identifiant non.
ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_cible_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_cible_chk
  CHECK (
    (cible_sorte = 'evenement' AND cible_id IS NOT NULL AND cible_cle IS NULL)
    OR (cible_sorte = ANY (ARRAY['lot'::text, 'proprietaire'::text, 'locataire'::text])
        AND btrim(COALESCE(cible_cle, ''::text)) <> ''::text)
  );

-- ── ② LA PORTE ÉTROITE ET NOMMÉE ────────────────────────────────────────────────────────────────────────────────
-- 🔴 LIRE CETTE CONTRAINTE COMME UNE PHRASE : « un lien vivant vise un bien ou un événement ; sauf s'il est mort ;
--    sauf s'il vise une fiche ET qu'il est, explicitement, un document automatique ».
--
-- 🔴🔴 `coalesce(regle, '')` ET NON `regle = …` — LE PIÈGE QUI A FAIT PASSER LE VERROU À L'ESSAI.
--
-- MESURÉ À L'APPLICATION (01/10/2026) : la première écriture de cette contrainte employait `regle =
-- 'document_auto'`. Un essai d'intrusion — insérer un lien vivant vers un propriétaire SANS règle — EST PASSÉ.
-- La cause est la logique à TROIS valeurs de SQL : avec `regle` à NULL, la comparaison rend NULL, donc
-- `false OR false OR NULL` rend NULL — et une contrainte CHECK ACCEPTE la ligne quand elle rend NULL. Autrement
-- dit, il suffisait d'OMETTRE la règle pour contourner la seule serrure du verrou.
--
-- ⚠️ C'EST LE DÉFAUT LE PLUS DANGEREUX DE TOUTE CETTE MIGRATION, et il ne se voit pas à la lecture : la
-- contrainte se LIT juste. `coalesce` la rend bivalente, et l'essai d'intrusion ci-dessous est devenu un test.
ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_cible_bien_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_cible_bien_chk
  CHECK (
    cible_sorte = ANY (ARRAY['lot'::text, 'evenement'::text])
    OR statut = ANY (ARRAY['rejete'::text, 'retire'::text])
    OR (cible_sorte = ANY (ARRAY['proprietaire'::text, 'locataire'::text])
        AND coalesce(regle, '') = 'document_auto')
  );

-- ── ③ LIRE LES DOCUMENTS D'UNE FICHE ────────────────────────────────────────────────────────────────────────────
-- Partiel : il ne porte QUE les documents automatiques vivants — quelques dizaines de milliers de lignes au plus,
--   là où la table en compte 147 000. Un index complet coûterait de l'écriture à chaque rattachement ordinaire.
CREATE INDEX IF NOT EXISTS gestion_rattachement_doc_auto_idx
  ON gestion_rattachement (cible_sorte, cible_cle)
  WHERE regle = 'document_auto' AND statut = ANY (ARRAY['propose'::text, 'confirme'::text]);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POUR REVENIR EN ARRIÈRE (à n'exécuter qu'après avoir retiré les liens `document_auto`) :
--
--   BEGIN;
--   DROP INDEX IF EXISTS gestion_rattachement_doc_auto_idx;
--   ALTER TABLE gestion_rattachement DROP CONSTRAINT gestion_rattachement_cible_bien_chk;
--   ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_cible_bien_chk
--     CHECK (cible_sorte = ANY (ARRAY['lot'::text,'evenement'::text])
--            OR statut = ANY (ARRAY['rejete'::text,'retire'::text]));
--   ALTER TABLE gestion_rattachement DROP CONSTRAINT gestion_rattachement_sorte_chk;
--   ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_sorte_chk
--     CHECK (cible_sorte = ANY (ARRAY['lot'::text,'proprietaire'::text,'evenement'::text]));
--   COMMIT;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
