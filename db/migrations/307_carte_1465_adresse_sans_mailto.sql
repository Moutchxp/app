-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 307 — LOT HISTORIQUE-BIEN-9, POINT 0 : LA CARTE 1465 RETROUVE SON ADRESSE, SANS LE SCHÉMA « mailto: »
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (05/10/2026), mot pour mot : « Carte 1465 : retire le préfixe “mailto:” de son adresse en
--   gardant le lien avec sa capsule (même identité normalisée), tracé. Puis empêche que cela se reproduise. »
--
-- 🔴 CE QUE C'ÉTAIT. La carte 1465 (bien 421, côté locataire) portait `mailto:a.bruneel@grospiron.com` comme
-- IDENTITÉ. Ce n'est pas une adresse : c'est un lien HTML, recopié tel quel depuis un en-tête
-- `<mailto:a.bruneel@grospiron.com>` par `adresseDe`, qui l'acceptait (ni espace, une arobase, un point après).
--
-- 🔴 MESURÉ AVANT D'ÉCRIRE, SUR LA VRAIE BASE (05/10/2026) :
--   · `gestion_message_adresse` : **98 adresses distinctes** en `mailto:` sur 3 083 — et **les 98 existent AUSSI
--     en clair**. Ce ne sont donc pas 98 correspondants de plus, mais 98 personnes comptées DEUX FOIS.
--   · sur le bien 421 : `a.bruneel@grospiron.com` porte **25 lignes dont 6 en expéditeur**, et
--     `mailto:a.bruneel@grospiron.com` **3 lignes, jamais en expéditeur**. La carte était accrochée au bruit.
--   · `gestion_contact_carte` : 35 cartes vivantes en `mailto:`, dont **UNE SEULE `manuel`** — celle-ci.
--   · `gestion_partie_categorie` : 51 lignes vivantes en `mailto:`.
--
-- ⚠️ CETTE MIGRATION NE CORRIGE QUE LA 1465, ET C'EST VOULU. Normaliser les 35 cartes ferait **5 COLLISIONS**
-- avec l'index unique des vivantes (une carte existe déjà sous l'adresse nue, même bien, même côté), et les 51
-- catégories en feraient **6**. Fusionner deux lignes vivantes est une décision — quelle date de création garder,
-- quelle vérification, quelle note — et elle appartient à Arno. La simulation lui est rendue ; rien d'autre n'est
-- touché.
--
-- 🔴 LE LIEN AVEC LA CAPSULE EST GARDÉ PAR LE CODE, PAS PAR LA DONNÉE. `cleAdresse` (module pur `annuaire.ts`)
-- retire le schéma des DEUX côtés au moment de rapprocher une carte de sa capsule : la capsule
-- `mailto:a.bruneel@…` du courrier et la carte `a.bruneel@…` tombent sur la même clé. Sans cela, cette migration
-- aurait détaché la carte de sa capsule, le « + » serait réapparu en face d'un contact qui a déjà sa fiche, et un
-- second clic aurait créé une carte en double.
--
-- ⚠️ IDEMPOTENTE, ET BORNÉE À UNE LIGNE NOMMÉE : le `WHERE` exige l'identifiant ET l'ancienne adresse. Rejouée
-- après coup, elle ne touche rien. Elle ne peut pas non plus « rattraper » une autre ligne par mégarde.
--
-- ⚠️ AUCUNE SUPPRESSION, AUCUN RETRAIT : la carte reste la même ligne, avec sa date de création, son auteur et sa
-- vérification. Seule son identité est écrite correctement.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

UPDATE gestion_contact_carte
   SET adresse = 'a.bruneel@grospiron.com'
 WHERE id = 1465
   AND adresse = 'mailto:a.bruneel@grospiron.com'
   AND retire_le IS NULL
   -- 🔒 Le garde de l'index unique des vivantes, écrit en toutes lettres : s'il existait déjà une carte vivante
   --    sous l'adresse nue pour ce bien et ce côté, la migration ne ferait rien plutôt que d'échouer à mi-chemin.
   AND NOT EXISTS (
     SELECT 1 FROM gestion_contact_carte c
      WHERE c.retire_le IS NULL AND c.lot_cle = gestion_contact_carte.lot_cle
        AND c.cote = gestion_contact_carte.cote AND c.adresse = 'a.bruneel@grospiron.com');
