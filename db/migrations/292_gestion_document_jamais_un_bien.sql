-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 292 — LOT DOCUMENTS-HORS-BIENS : UN « Document CRITERIMMO » QUE NOUS ENVOYONS N'EST JAMAIS DANS UN BIEN
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴🔴 ⚠️ MIGRATION LIVRÉE **NON APPLIQUÉE**. Elle pose un garde-fou qui REFUSE des écritures : elle ne s'applique
-- que sur accord explicite d'Arno. Rien dans le code ne l'exige — les gardes TypeScript du même lot suffisent au
-- fonctionnement normal, et sans elle tout se comporte comme après le lot, en un peu moins sûr.
--
-- ═══ CONSTAT D'ARNO (01/10/2026) ════════════════════════════════════════════════════════════════════════════════
--
-- Sur la fiche du bien lot 176 (25 rue Edith Cavell), le bloc « Vie du bien » affichait 77 mails, dont nos propres
-- « Document CRITERIMMO » — quittances, avis mensuels « Octobre 2026 », révisions — avec un badge « Auto ».
--
-- RÈGLE : « Les “Document CRITERIMMO” concernent des PERSONNES, pas le bien. Ils vont UNIQUEMENT dans le dossier
-- “Documents automatiques” de la fiche locataire ou propriétaire. JAMAIS dans la fiche d'un bien, ni dans “Vie du
-- bien”, ni dans aucun historique ou compteur de bien. »
--
-- Mesuré : 33 165 liens vivants « document → bien », dont 21 422 confirmés — soit les deux tiers du compteur des
-- rattachements aux biens. Tous retirés par le lot ; celui-ci empêche leur retour.
--
-- ═══ 🔴🔴 POURQUOI UN TRIGGER, ET NON UNE CONTRAINTE CHECK ══════════════════════════════════════════════════════
--
-- Les migrations 273 et 291 ont pu s'écrire en `CHECK` parce qu'elles ne regardaient QUE la ligne du lien. Ici la
-- question porte sur une AUTRE table : « le message de ce lien est-il un de nos envois automatiques ? ». Un `CHECK`
-- ne peut pas lire `gestion_message` — PostgreSQL l'interdit, et avec raison : une contrainte doit rester vraie
-- sans rien consulter d'autre.
--
-- Le trigger est donc la seule forme possible du MÊME esprit : un refus EN BASE, qui vaut pour tout le monde — y
-- compris pour un processus qui tournerait depuis la veille avec l'ancien moteur chargé en mémoire. C'est
-- exactement l'incident qui a motivé la 273 : 17 liens « propriétaire » créés malgré un garde-fou écrit en
-- TypeScript, parce que la relève continue n'avait pas été redémarrée.
--
-- ═══ CE QUE LE TRIGGER REFUSE, EXACTEMENT ═══════════════════════════════════════════════════════════════════════
--
--   REFUSÉ   : un lien VIVANT (`propose` ou `confirme`) vers un `lot`, porté par un message dont `sens = 'envoye'`
--              ET dont l'objet porte « Document CRITERIMMO » (ou que la règle d'exclusion n° 5 a écarté).
--   PERMIS   : tout le reste, et notamment —
--              · les mails REÇUS, réponses humaines à ces documents : ils gardent leurs biens (demande d'Arno) ;
--              · les liens MORTS (`retire`, `rejete`) : les 33 164 lignes retirées par ce lot restent lisibles,
--                avec leur date, leur auteur et leur motif, et le retrait reste réversible ;
--              · les liens vers une FICHE sous la règle `document_auto` (migration 291) : c'est leur place.
--
-- ⚠️ `coalesce` PARTOUT, ET CE N'EST PAS UN ORNEMENT. La première écriture du verrou de la migration 291 employait
-- `regle = 'document_auto'` : un essai d'intrusion est passé, parce qu'avec un NULL la comparaison rend NULL et
-- qu'une contrainte accepte ce qu'elle ne sait pas réfuter. Un trigger qui testerait `exclu_par_regle_id = 5` sur
-- un NULL aurait le même défaut : la condition serait NULL, donc ni vraie ni fausse, et le `IF` ne lèverait pas.
--
-- RÉVERSIBLE : les deux instructions inverses sont écrites en commentaire au pied de ce fichier.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION gestion_refuser_document_sur_un_bien() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  doc boolean;
BEGIN
  -- Un lien mort est de l'HISTOIRE : on ne touche jamais à ce qui est déjà retiré ou rejeté.
  IF NEW.statut NOT IN ('propose', 'confirme') THEN RETURN NEW; END IF;
  IF NEW.cible_sorte <> 'lot' THEN RETURN NEW; END IF;

  SELECT (m.sens = 'envoye'
          AND (coalesce(m.exclu_par_regle_id, 0) = 5
               OR coalesce(m.objet, '') ILIKE '%Document CRITERIMMO%'))
    INTO doc
    FROM gestion_message m WHERE m.id = NEW.message_id;

  -- ⚠️ `coalesce(doc, false)` : si le message n'existe pas (encore), `doc` est NULL — on laisse passer, la clé
  --    étrangère dira le reste. Jamais un refus sur une question qu'on n'a pas pu poser.
  IF coalesce(doc, false) THEN
    RAISE EXCEPTION
      'un « Document CRITERIMMO » envoyé par l''agence ne se rattache pas à un bien (message %) — il se range dans la fiche de la personne, règle du lot DOCUMENTS-HORS-BIENS',
      NEW.message_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ⚠️ SUR INSERT **ET** SUR UPDATE : sans l'UPDATE, il suffirait d'insérer la ligne en « retire » puis de la passer
--    en « confirme » pour contourner le refus — exactement la porte de service qu'on veut fermer.
DROP TRIGGER IF EXISTS gestion_rattachement_document_bien_trg ON gestion_rattachement;
CREATE TRIGGER gestion_rattachement_document_bien_trg
  BEFORE INSERT OR UPDATE OF statut, cible_sorte, message_id ON gestion_rattachement
  FOR EACH ROW EXECUTE FUNCTION gestion_refuser_document_sur_un_bien();

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POUR REVENIR EN ARRIÈRE :
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS gestion_rattachement_document_bien_trg ON gestion_rattachement;
--   DROP FUNCTION IF EXISTS gestion_refuser_document_sur_un_bien();
--   COMMIT;
--
-- ⚠️ APRÈS APPLICATION, UN ESSAI D'INTRUSION DOIT ÊTRE FAIT — la leçon de la 291, où le verrou ne tenait pas et où
-- seule la tentative réelle l'a montré :
--
--   -- doit être REFUSÉ (document envoyé → bien)
--   INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, statut, cree_par_libelle)
--   SELECT id, 'lot', 'TEST-VERROU', 'automatique', 'confirme', 'essai'
--     FROM gestion_message WHERE sens = 'envoye' AND objet ILIKE '%Document CRITERIMMO%' LIMIT 1;
--
--   -- doit être REFUSÉ aussi (insertion en « retire » puis passage en « confirme »)
--   -- doit être ACCEPTÉ (mail REÇU → bien) : une réponse humaine garde ses biens.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
