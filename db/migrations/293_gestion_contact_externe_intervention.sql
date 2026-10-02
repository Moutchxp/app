-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 293 — LOT CONTACTS-EXTERNES : UN MAIL D'UNE ADRESSE INCONNUE PEUT CONCERNER UNE PERSONNE, *AVEC* SON BIEN
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴🔴 ⚠️ MIGRATION LIVRÉE **NON APPLIQUÉE**. Elle DESSERRE un verrou posé après un incident réel (le même que la
-- 291 a desserré d'un cran) : elle ne s'applique que sur accord explicite d'Arno. Rien dans le code ne l'exige —
-- la sonde `interventionsDisponibles()` répond « non », la 2ᵉ étape de la modale ne s'affiche nulle part, aucune
-- requête ne nomme une table ni une colonne nouvelle, et TOUT se comporte exactement comme avant ce lot.
--
-- ═══ EN FRANÇAIS SIMPLE : CE QU'ELLE PERMET, ET CE QU'ELLE CONTINUE D'INTERDIRE ═════════════════════════════════
--
-- Aujourd'hui, un mail se classe dans un BIEN, et dans un bien seulement. C'est la règle du 28/09/2026, et elle
-- est bonne : « on ne range pas un litige chez un propriétaire ».
--
-- Mais il arrive qu'un mail arrive d'une adresse que personne ne connaît — l'avocat d'un locataire, le syndic de
-- l'immeuble, l'artisan qui a fait le devis, le garant qu'on relance. Le mail concerne bien un logement ; il
-- concerne AUSSI, souvent, une personne précise du dossier. Aujourd'hui cette seconde information se perd : on
-- classe le mail dans le bien, et six mois plus tard on ne sait plus de quel locataire l'avocat parlait.
--
-- CETTE MIGRATION OUVRE DONC UNE SECONDE PORTE, ÉTROITE ET NOMMÉE :
--
--     · « rattacher ce mail à M. DUPONT »                              → TOUJOURS REFUSÉ (verrou du 28/09) ;
--     · « ce document automatique est dans le dossier de M. DUPONT »    → permis depuis la 291, sous ce nom ;
--     · « ce mail, rattaché au logement X, concerne aussi M. DUPONT »   → permis ICI, sous le nom `intervention`,
--       🔴 ET SEULEMENT TANT QUE LE MAIL EST RATTACHÉ AU LOGEMENT X. C'est la différence avec la 291 : un
--       document automatique se range chez une personne SANS bien ; une intervention ne vit JAMAIS sans son bien.
--
-- 🔴 LE VERROU DE LA 273 N'EST PAS RETIRÉ. Il gagne une exception de plus, nommée, et bornée par un refus en base.
-- Les 19 538 liens « propriétaire » retirés le 28/09 restent retirés, avec leur date, leur auteur et leur motif.
--
-- ═══ CE QU'ELLE CRÉE, EXACTEMENT ════════════════════════════════════════════════════════════════════════════════
--
--   ① `gestion_contact_externe` — la mémoire des adresses extérieures : e-mail (obligatoire, unique, en
--      minuscules), nom, téléphone et type, tous FACULTATIFS. ⚠️ Ce n'est PAS une fiche de l'annuaire : un contact
--      externe ne devient jamais propriétaire ni locataire, et aucune vue de l'annuaire ne le lit ;
--   ② deux colonnes sur `gestion_rattachement` : `role_instantane` (le rôle FIGÉ à la date du mail) et
--      `contact_externe_id` (par qui le mail est passé) ;
--   ③ la contrainte « cible bien » gagne `intervention` à côté de `document_auto` ;
--   ④ 🔴 UN TRIGGER qui REFUSE une intervention vivante sans lien vivant vers un bien sur le MÊME mail ;
--   ⑤ `gestion_fil_periode_personne` et `gestion_message_exception_personne` — les personnes que porte une
--      FENÊTRE de conversation (migration 290), pour que les mails suivants en héritent ;
--   ⑥ un index pour lire les interventions d'une fiche sans parcourir les 172 000 lignes de la table.
--
-- 🔴 AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE. On n'écrit rien : on ouvre une possibilité.
--
-- ═══ 🔴🔴 POURQUOI UN TRIGGER AU POINT ④, ET NON UNE CONTRAINTE CHECK ═══════════════════════════════════════════
--
-- Même raison qu'à la 292, et elle vaut d'être relue : la question porte sur une AUTRE LIGNE de la même table
-- (« ce mail a-t-il, par ailleurs, un lien vivant vers un bien ? »). Un `CHECK` ne voit que sa propre ligne —
-- PostgreSQL l'interdit, et avec raison. Le trigger est donc la seule forme possible du MÊME esprit : un refus EN
-- BASE, qui vaut pour tout le monde, y compris pour un processus qui tournerait depuis la veille avec l'ancien
-- moteur chargé en mémoire. C'est exactement l'incident qui a motivé la 273 : 17 liens « propriétaire » créés
-- malgré un garde-fou écrit en TypeScript, parce que la relève continue n'avait pas été redémarrée.
--
-- ⚠️ `coalesce` PARTOUT, ET CE N'EST PAS UN ORNEMENT. La première écriture du verrou de la 291 employait
-- `regle = 'document_auto'` : un essai d'intrusion est PASSÉ, parce qu'avec un NULL la comparaison rend NULL et
-- qu'une contrainte CHECK accepte ce qu'elle ne sait pas réfuter. Toutes les comparaisons de `regle` ci-dessous
-- sont donc bivalentes.
--
-- ═══ 🔴🔴 CE QUE CE TRIGGER NE PEUT PAS FAIRE, ET QUI EST DIT PLUTÔT QUE CACHÉ ══════════════════════════════════
--
-- Il refuse de CRÉER (ou de faire revivre) une intervention sans bien. Il ne refuse PAS qu'on retire le bien plus
-- tard. Ce second refus a été écrit, essayé, puis ABANDONNÉ volontairement : il casserait quatre gestes déjà
-- validés — « Valider — aucun bien », la fenêtre « Modifier », la file à trier, et la projection des périodes
-- (`projeterLeFil`), qui retire des liens « bien » en masse.
--
-- 🔴 C'EST DONC L'ÉCRITURE QUI FAIT LA CASCADE : quand le dernier lien vivant d'un mail vers un bien s'en va, le
-- dépôt RETIRE les interventions de ce mail (`MOTIF_INTERVENTION_SANS_BIEN`, `contactExterneRepo.ts`), datées et
-- signées. Une intervention orpheline créée par une autre voie resterait VISIBLE (la lecture joint les biens du
-- mail et n'en trouverait aucun) : elle serait réparable, jamais silencieuse. C'est le prix assumé de ne rien
-- casser, et il est inscrit ici pour qu'on ne le redécouvre pas.
--
-- RÉVERSIBLE : toutes les instructions inverses sont écrites en commentaire au pied de ce fichier.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① LA MÉMOIRE DES ADRESSES EXTÉRIEURES ───────────────────────────────────────────────────────────────────────
-- ⚠️ L'E-MAIL EST STOCKÉ EN MINUSCULES, et la contrainte l'exige. Sans cela « Contact@Belmonts.fr » et
--    « contact@belmonts.fr » feraient deux contacts pour une seule personne, et l'index unique ne verrait rien.
--    La normalisation est faite par le dépôt ; la base la VÉRIFIE, parce qu'une règle qui n'est pas vérifiée finit
--    par ne plus être vraie.
CREATE TABLE IF NOT EXISTS gestion_contact_externe (
  id               bigserial PRIMARY KEY,
  email            text NOT NULL,
  nom              text,
  telephone        text,
  type             text,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  cree_par         bigint REFERENCES admin_utilisateur(id),
  cree_par_libelle text NOT NULL,
  maj_le           timestamptz,
  maj_par_libelle  text,
  CONSTRAINT gestion_contact_externe_email_chk
    CHECK (btrim(email) <> '' AND email = lower(email) AND position('@' in email) > 1),
  -- ⚠️ LA LISTE EST FERMÉE, ET ELLE EST CELLE D'ARNO. `NULL` reste permis : le type est FACULTATIF.
  CONSTRAINT gestion_contact_externe_type_chk
    CHECK (type IS NULL OR type = ANY (ARRAY['avocat'::text, 'garant'::text, 'artisan'::text, 'syndic'::text,
                                             'expert'::text, 'assurance'::text, 'notaire'::text, 'autre'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS gestion_contact_externe_email_key
  ON gestion_contact_externe (email);

-- ── ② CE QUE PORTE UN LIEN D'INTERVENTION ───────────────────────────────────────────────────────────────────────
-- 🔴 `role_instantane` EST UNE PHOTO, PAS UNE LECTURE. « Locataire occupant » le jour du mail reste « Locataire
--    occupant » pour toujours, même quand la personne a quitté le logement — c'est la demande explicite d'Arno, et
--    c'est la seule façon de relire un courrier d'avocat de 2025 sans le faire mentir.
ALTER TABLE gestion_rattachement ADD COLUMN IF NOT EXISTS role_instantane text;
ALTER TABLE gestion_rattachement ADD COLUMN IF NOT EXISTS contact_externe_id bigint
  REFERENCES gestion_contact_externe(id);

ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_role_instantane_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_role_instantane_chk
  CHECK (role_instantane IS NULL
         OR role_instantane = ANY (ARRAY['proprietaire'::text, 'locataire_occupant'::text,
                                         'locataire_sortant'::text, 'locataire_a_venir'::text]));

-- 🔴 UN RÔLE INSTANTANÉ N'A DE SENS QUE SUR UNE INTERVENTION VIVANTE. L'écrire ailleurs serait une donnée que
--    personne ne lirait et que tout le monde croirait — exactement ce qui fait vieillir mal une table.
-- ⚠️ LES LIENS MORTS SONT ÉPARGNÉS : 172 000 lignes existent, aucune ne porte ces colonnes, et une contrainte qui
--    les viserait échouerait à la validation sur une seule ligne historique mal formée.
ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_role_place_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_role_place_chk
  CHECK (role_instantane IS NULL
         OR statut = ANY (ARRAY['rejete'::text, 'retire'::text])
         OR coalesce(regle, '') = 'intervention');

-- ── ③ LA CONTRAINTE « CIBLE BIEN » GAGNE SA SECONDE PORTE NOMMÉE ────────────────────────────────────────────────
-- 🔴 LIRE CETTE CONTRAINTE COMME UNE PHRASE : « un lien vivant vise un bien ou un événement ; sauf s'il est mort ;
--    sauf s'il vise une fiche ET qu'il est, explicitement, un document automatique OU une intervention ».
--
-- 🔴🔴 `coalesce(regle, '') = ANY (…)` ET NON `regle = ANY (…)` — LE PIÈGE DE LA 291, QUI A LAISSÉ PASSER UN ESSAI
--    D'INTRUSION. Avec `regle` à NULL, `regle = ANY(…)` rend NULL, donc `false OR false OR NULL` rend NULL — et une
--    contrainte CHECK ACCEPTE la ligne quand elle rend NULL. Il suffisait d'OMETTRE la règle pour contourner la
--    seule serrure du verrou. La contrainte se LIT juste dans les deux écritures : seul `coalesce` la rend sûre.
ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_cible_bien_chk;
ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_cible_bien_chk
  CHECK (
    cible_sorte = ANY (ARRAY['lot'::text, 'evenement'::text])
    OR statut = ANY (ARRAY['rejete'::text, 'retire'::text])
    OR (cible_sorte = ANY (ARRAY['proprietaire'::text, 'locataire'::text])
        AND coalesce(regle, '') = ANY (ARRAY['document_auto'::text, 'intervention'::text]))
  );

-- ── ④ 🔴🔴 LE REFUS EN BASE : PAS D'INTERVENTION SANS LE BIEN DU MÊME MAIL ──────────────────────────────────────
CREATE OR REPLACE FUNCTION gestion_exiger_le_bien_sous_l_intervention() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  avec_bien boolean;
BEGIN
  -- Un lien mort est de l'HISTOIRE : on ne touche jamais à ce qui est déjà retiré ou rejeté.
  IF NEW.statut NOT IN ('propose', 'confirme') THEN RETURN NEW; END IF;
  IF coalesce(NEW.regle, '') <> 'intervention' THEN RETURN NEW; END IF;
  IF NEW.cible_sorte NOT IN ('proprietaire', 'locataire') THEN RETURN NEW; END IF;

  -- ⚠️ `piece_id IS NULL` : un rattachement de PIÈCE JOINTE classe un fichier, pas le mail. Il ne vaut donc pas
  --    « ce mail concerne ce bien », et s'appuyer sur lui laisserait passer une intervention sans bien.
  -- ⚠️ `id <> NEW.id` : sur un UPDATE, la ligne qu'on modifie est déjà dans la table — sans cette exclusion, une
  --    ligne pourrait se porter garante d'elle-même (elle ne le pourrait pas ici, `cible_sorte` étant une fiche,
  --    mais la condition est écrite pour que le raisonnement ne dépende pas de ce détail).
  SELECT EXISTS (
    SELECT 1 FROM gestion_rattachement r
     WHERE r.message_id = NEW.message_id
       AND r.cible_sorte = 'lot'
       AND r.statut IN ('propose', 'confirme')
       AND r.piece_id IS NULL
       AND r.id <> NEW.id
  ) INTO avec_bien;

  IF NOT coalesce(avec_bien, false) THEN
    RAISE EXCEPTION
      'une intervention ne se pose pas sans le bien du même mail (message %) : rattachez d''abord le logement, règle du lot CONTACTS-EXTERNES',
      NEW.message_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ⚠️ SUR INSERT **ET** SUR UPDATE : sans l'UPDATE, il suffirait d'insérer la ligne en « retire » puis de la passer
--    en « confirme » pour contourner le refus — exactement la porte de service que la 292 a fermée, et pour la
--    même raison. `OF` liste les colonnes qui peuvent faire basculer la réponse.
DROP TRIGGER IF EXISTS gestion_rattachement_intervention_trg ON gestion_rattachement;
CREATE TRIGGER gestion_rattachement_intervention_trg
  BEFORE INSERT OR UPDATE OF statut, cible_sorte, message_id, regle ON gestion_rattachement
  FOR EACH ROW EXECUTE FUNCTION gestion_exiger_le_bien_sous_l_intervention();

-- ── ⑤ LES PERSONNES QUE PORTE UNE FENÊTRE DE CONVERSATION ───────────────────────────────────────────────────────
-- 🔴 MÊME FORME QUE `gestion_fil_periode_bien` (migration 290), au mot près : c'est le MÊME mécanisme, étendu aux
--    personnes. Un second mécanisme de mémoire aurait divergé du premier au premier ajustement.
CREATE TABLE IF NOT EXISTS gestion_fil_periode_personne (
  id                 bigserial PRIMARY KEY,
  periode_id         bigint NOT NULL REFERENCES gestion_fil_periode(id) ON DELETE CASCADE,
  cible_sorte        text NOT NULL,
  cible_cle          text NOT NULL,
  cible_libelle      text,
  contact_externe_id bigint REFERENCES gestion_contact_externe(id),
  CONSTRAINT gestion_fil_periode_personne_sorte_chk
    CHECK (cible_sorte = ANY (ARRAY['proprietaire'::text, 'locataire'::text])),
  CONSTRAINT gestion_fil_periode_personne_cle_chk CHECK (btrim(cible_cle) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_fil_periode_personne_unique
  ON gestion_fil_periode_personne (periode_id, cible_sorte, cible_cle);

CREATE TABLE IF NOT EXISTS gestion_message_exception_personne (
  id                 bigserial PRIMARY KEY,
  exception_id       bigint NOT NULL REFERENCES gestion_message_exception(id) ON DELETE CASCADE,
  cible_sorte        text NOT NULL,
  cible_cle          text NOT NULL,
  cible_libelle      text,
  contact_externe_id bigint REFERENCES gestion_contact_externe(id),
  CONSTRAINT gestion_message_exception_personne_sorte_chk
    CHECK (cible_sorte = ANY (ARRAY['proprietaire'::text, 'locataire'::text])),
  CONSTRAINT gestion_message_exception_personne_cle_chk CHECK (btrim(cible_cle) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_message_exception_personne_unique
  ON gestion_message_exception_personne (exception_id, cible_sorte, cible_cle);

-- ── ⑥ LIRE LES INTERVENTIONS D'UNE FICHE ────────────────────────────────────────────────────────────────────────
-- Partiel, comme celui de la 291 : il ne porte QUE les interventions vivantes — quelques milliers de lignes au
--   plus, là où la table en compte 172 000. Un index complet coûterait de l'écriture à chaque rattachement
--   ordinaire, c'est-à-dire sur le geste le plus fréquent du module.
CREATE INDEX IF NOT EXISTS gestion_rattachement_intervention_idx
  ON gestion_rattachement (cible_sorte, cible_cle)
  WHERE regle = 'intervention' AND statut = ANY (ARRAY['propose'::text, 'confirme'::text]);

-- Lire les interventions d'un MAIL (la mention « via … » dans « Vie du bien » et dans la conversation).
CREATE INDEX IF NOT EXISTS gestion_rattachement_intervention_message_idx
  ON gestion_rattachement (message_id)
  WHERE regle = 'intervention' AND statut = ANY (ARRAY['propose'::text, 'confirme'::text]);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴🔴 APRÈS APPLICATION, TROIS ESSAIS D'INTRUSION SONT OBLIGATOIRES — la leçon de la 291, où le verbe de la
-- contrainte se lisait juste et où seule la tentative RÉELLE a montré qu'il ne tenait pas :
--
--   -- ① doit être REFUSÉ : intervention vers une fiche, sur un mail SANS lien vivant vers un bien
--   INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, regle, statut, cree_par_libelle)
--   SELECT m.id, 'proprietaire', 'ESSAI-293', 'manuel', 'intervention', 'confirme', 'essai'
--     FROM gestion_message m
--    WHERE NOT EXISTS (SELECT 1 FROM gestion_rattachement r
--                       WHERE r.message_id = m.id AND r.cible_sorte = 'lot'
--                         AND r.statut IN ('propose','confirme') AND r.piece_id IS NULL)
--    LIMIT 1;
--
--   -- ② doit être REFUSÉ AUSSI : la même ligne insérée en « retire », puis passée en « confirme »
--   --    (c'est la porte de service que la 292 a fermée ; on vérifie qu'elle est fermée ici aussi)
--
--   -- ③ doit être REFUSÉ : un lien vivant vers une fiche SANS règle (le piège exact de la 291 — `regle` à NULL)
--   INSERT INTO gestion_rattachement (message_id, cible_sorte, cible_cle, origine, statut, cree_par_libelle)
--   SELECT id, 'proprietaire', 'ESSAI-293-NULL', 'manuel', 'confirme', 'essai' FROM gestion_message LIMIT 1;
--
--   -- … et un essai qui doit PASSER : intervention sur un mail qui A un lien vivant vers un bien.
--
-- ⚠️ CES TROIS ESSAIS SONT ÉGALEMENT JOUÉS PAR `app/lib/gestion/contactExterneRepo.itest.ts` (scénarios C12 à
-- C14), sur une base jetable. Les rejouer À LA MAIN après application reste utile : l'épreuve tourne sur une base
-- vierge, la vraie base porte 172 000 lignes dont certaines sont historiques.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POUR REVENIR EN ARRIÈRE (à n'exécuter qu'après avoir retiré les liens `intervention`) :
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS gestion_rattachement_intervention_trg ON gestion_rattachement;
--   DROP FUNCTION IF EXISTS gestion_exiger_le_bien_sous_l_intervention();
--   DROP INDEX IF EXISTS gestion_rattachement_intervention_message_idx;
--   DROP INDEX IF EXISTS gestion_rattachement_intervention_idx;
--   DROP TABLE IF EXISTS gestion_message_exception_personne;
--   DROP TABLE IF EXISTS gestion_fil_periode_personne;
--   ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_role_place_chk;
--   ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_role_instantane_chk;
--   -- La contrainte « cible bien » revient à sa forme de la 291 (document_auto seul) :
--   ALTER TABLE gestion_rattachement DROP CONSTRAINT IF EXISTS gestion_rattachement_cible_bien_chk;
--   ALTER TABLE gestion_rattachement ADD CONSTRAINT gestion_rattachement_cible_bien_chk
--     CHECK (cible_sorte = ANY (ARRAY['lot'::text, 'evenement'::text])
--            OR statut = ANY (ARRAY['rejete'::text, 'retire'::text])
--            OR (cible_sorte = ANY (ARRAY['proprietaire'::text, 'locataire'::text])
--                AND coalesce(regle, '') = 'document_auto'));
--   ALTER TABLE gestion_rattachement DROP COLUMN IF EXISTS contact_externe_id;
--   ALTER TABLE gestion_rattachement DROP COLUMN IF EXISTS role_instantane;
--   DROP TABLE IF EXISTS gestion_contact_externe;
--   COMMIT;
--
-- ⚠️ L'ORDRE DU RETOUR EN ARRIÈRE COMPTE : `gestion_contact_externe` est référencée par trois clés étrangères
-- (les deux colonnes de `gestion_rattachement` et les deux tables de personnes). La supprimer en premier
-- échouerait, et l'on croirait la migration irréversible.
--
-- 🔴 ET IL NE PERD RIEN D'AUTRE QUE LES INTERVENTIONS : les rattachements aux BIENS, les périodes, les exceptions,
-- les documents automatiques et le journal ne sont pas touchés par ce retour en arrière.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
