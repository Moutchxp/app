-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 305 — LOT HISTORIQUE-BIEN-7 : UNE NOTE SUR UNE CARTE DE CONTACT
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (05/10/2026), sur le gabarit d'une carte de contact dans un carrousel du haut de fiche :
--   « Une carte de contact a le même gabarit que les cartes clients : nom, badge "CONTACT DU PROPRIÉTAIRE" /
--     "CONTACT DU LOCATAIRE", e-mail, téléphone avec "Copier", NOTE, "Créée automatiquement — à vérifier" avec
--     trame orange tant qu'elle n'est pas vérifiée, bouton "Vérifié", crayon pour modifier, "…" avec "Changer de
--     côté", "Passer en tiers indépendant" et "Retirer" (statut 'retire', jamais supprimée). »
--
-- 🔴 LA SEULE CHOSE QUI MANQUAIT AU GABARIT ÉTAIT LA NOTE. `gestion_contact_carte` (migration 304) porte déjà le
-- nom, le téléphone, l'origine, la vérification, la création et le retrait — tout le reste du gabarit se lit donc
-- sans toucher au schéma. La note, non : la colonne n'existe pas.
--
-- 🔴 POURQUOI UNE NOTE SUR UN CONTACT, ET PAS SEULEMENT SUR UN CLIENT. Les cartes clients en ont une depuis
-- l'annuaire (`gestion_annuaire_proprietaire.note`, `gestion_annuaire_locataire.note`), et c'est là qu'on écrit
-- « ne pas appeler avant 10 h », « passe par sa fille ». Un contact — un artisan, un syndic, un assureur — a
-- exactement les mêmes consignes à retenir, et les retenir ailleurs (dans un mail, dans une tête) est ce qu'un
-- annuaire existe pour éviter.
--
-- ⚠️ `text` NULLABLE, SANS CONTRAINTE DE LONGUEUR : même forme que les deux colonnes `note` de l'annuaire. Une
-- borne ici serait une seconde règle à tenir, et c'est l'écran qui borne déjà la saisie.
--
-- ⚠️ IDEMPOTENTE : `IF NOT EXISTS`. Une migration qu'on ne peut pas rejouer est une migration qu'on n'ose pas
-- rejouer — et c'est toujours au pire moment qu'on en a besoin.
--
-- ⚠️ AUCUNE DONNÉE TOUCHÉE : la colonne naît vide sur les 485 cartes existantes, et une carte sans note s'affiche
-- « non renseignée », exactement comme une carte client sans note.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_contact_carte
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN gestion_contact_carte.note IS
  'Note libre sur ce contact, saisie à la main. Même rôle que gestion_annuaire_*.note pour un client.';
