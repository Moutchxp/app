-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 294 — LOT URGENT-VERIF-SUIVI-ET-76-BIENS : LE TYPE D'UN CONTACT EXTERNE PEUT S'ÉCRIRE À LA MAIN
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴🔴 ⚠️ MIGRATION LIVRÉE **NON APPLIQUÉE**. Elle DESSERRE une contrainte, et une contrainte ne se desserre que
-- sur accord explicite d'Arno. Rien dans le code ne l'exige : tant qu'elle n'est pas là, la sonde
-- `typesLibresDisponibles()` rend « non », le choix « Personnaliser… » ne s'affiche NULLE PART, et les neuf types
-- de la liste — « Diagnostiqueur » compris — fonctionnent exactement comme aujourd'hui.
--
-- ═══ DEMANDE D'ARNO (02/10/2026) ════════════════════════════════════════════════════════════════════════════════
--
-- « Ajoute "Personnaliser…" : quand on le choisit, un champ texte apparaît pour écrire le type librement
-- (enregistré tel quel, puis proposé dans la liste aux prochaines fois). »
--
-- ═══ POURQUOI UNE MIGRATION EST NÉCESSAIRE, EN FRANÇAIS SIMPLE ══════════════════════════════════════════════════
--
-- La migration 293 (appliquée le 02/10/2026) a écrit la liste des types DANS LA BASE, sous forme de contrainte :
-- « le type est vide, ou bien c'est l'un de ces huit mots ». C'était juste au moment où la liste était fermée.
-- Elle ne l'est plus : « huissier », « diagnostiqueur amiante », « maître d'œuvre » doivent pouvoir s'écrire.
-- Tant que cette contrainte-là est en place, la base REFUSE le type écrit à la main — et le refus serait
-- silencieux à l'écran, puisque les trois champs du contact ne bloquent jamais le classement.
--
-- ═══ 🔴 CE QU'ELLE NE FAIT PAS : ELLE NE RETIRE PAS LE GARDE-FOU ════════════════════════════════════════════════
--
-- La contrainte ne disparaît pas, elle CHANGE DE NATURE : elle ne vérifie plus une LISTE, elle vérifie une FORME.
--
--     AVANT : « c'est l'un de ces huit mots »       (une liste, qu'il faut migrer à chaque nouveau métier)
--     APRÈS : « c'est un mot, en minuscules, non vide, d'au plus 40 caractères, sans blanc de bord »
--
-- Ce qui reste interdit : la chaîne vide (elle ne dit rien et se confond avec « aucun type »), les majuscules
-- (sans quoi « Syndic » et « syndic » feraient deux types dans la liste des prochaines fois), les blancs de bord,
-- et tout ce qui dépasse 40 caractères. Le dépôt normalise déjà de son côté (`typeLibreRecu`) ; la base VÉRIFIE,
-- parce qu'une règle qui n'est pas vérifiée finit par ne plus être vraie — c'est la leçon de la 273.
--
-- ⚠️ AUCUNE LIGNE EXISTANTE N'EST MODIFIÉE, et il n'y en a aucune à modifier : `gestion_contact_externe` compte
-- 0 ligne (mesuré le 02/10/2026). Les neuf types de la liste de départ satisfont tous la nouvelle forme.
--
-- 🔴 LA LISTE DES NEUF NE DISPARAÎT PAS POUR AUTANT. Elle vit dans le module PUR (`contactExterne.ts`,
-- `TYPES_CONTACT_EXTERNE`) et reste ce que l'écran PROPOSE d'avance. Ce que la base cesse de dire, c'est « et
-- rien d'autre ».
--
-- RÉVERSIBLE : l'instruction inverse est écrite en commentaire au pied de ce fichier.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_contact_externe DROP CONSTRAINT IF EXISTS gestion_contact_externe_type_chk;
ALTER TABLE gestion_contact_externe ADD CONSTRAINT gestion_contact_externe_type_chk
  CHECK (
    type IS NULL
    OR (
      btrim(type) <> ''
      AND type = lower(type)
      AND type = btrim(type)
      AND length(type) <= 40
    )
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴 APRÈS APPLICATION, DEUX ESSAIS — la leçon de la 291 : une contrainte se LIT juste, et seule la tentative
-- réelle montre ce qu'elle laisse passer.
--
--   -- doit PASSER (un type écrit à la main)
--   INSERT INTO gestion_contact_externe (email, type, cree_par_libelle)
--   VALUES ('essai294@exemple.test', 'huissier de justice', 'essai');
--
--   -- doit être REFUSÉ (majuscule : sinon « Syndic » et « syndic » feraient deux types)
--   INSERT INTO gestion_contact_externe (email, type, cree_par_libelle)
--   VALUES ('essai294b@exemple.test', 'Huissier', 'essai');
--
--   -- … puis : DELETE FROM gestion_contact_externe WHERE email LIKE 'essai294%';
--
-- ⚠️ CES DEUX ESSAIS SONT AUSSI JOUÉS PAR `app/lib/gestion/contactsExternes.itest.ts` (scénario C-10), sur une
-- base jetable.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POUR REVENIR EN ARRIÈRE (à n'exécuter qu'après avoir retiré les types hors liste) :
--
--   BEGIN;
--   -- ⚠️ D'ABORD REGARDER CE QUI SERAIT REFUSÉ, et le décider — ne jamais écraser en aveugle :
--   --   SELECT email, type FROM gestion_contact_externe
--   --    WHERE type IS NOT NULL AND type NOT IN ('avocat','garant','artisan','diagnostiqueur','syndic',
--   --                                            'expert','assurance','notaire','autre');
--   ALTER TABLE gestion_contact_externe DROP CONSTRAINT gestion_contact_externe_type_chk;
--   ALTER TABLE gestion_contact_externe ADD CONSTRAINT gestion_contact_externe_type_chk
--     CHECK (type IS NULL OR type = ANY (ARRAY['avocat'::text, 'garant'::text, 'artisan'::text, 'syndic'::text,
--                                              'expert'::text, 'assurance'::text, 'notaire'::text, 'autre'::text]));
--   COMMIT;
--
-- ⚠️ LA FORME D'ORIGINE NE CONTENAIT PAS « diagnostiqueur » : il est arrivé avec ce lot-ci, côté code. Revenir en
-- arrière sans l'ajouter refuserait un type que l'écran propose — d'où son absence volontaire ci-dessus, et cette
-- phrase pour qu'on le sache.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
