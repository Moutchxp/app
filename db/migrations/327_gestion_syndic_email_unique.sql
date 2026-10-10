-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 327 — LOT SYNDIC-CONTACTS-ANTI-DOUBLON : UNE ADRESSE E-MAIL N'APPARTIENT QU'À UN SEUL CONTACT DE SYNDIC
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- MIGRATION D'AJOUT UNIQUEMENT : un index d'unicité, rien d'autre. Aucune ligne n'est écrite, fusionnée ni supprimée.
--
-- La règle (Arno) : une même adresse e-mail ne peut appartenir qu'à UN contact de syndic, tous syndics confondus
-- (adresse en minuscules, sans espaces). La vérification serveur (`enregistrerSyndic`) la tient déjà ; cet index en
-- est le filet EN BASE, valable aussi pour un processus qui contournerait l'application.
--
-- « Non supprimé » = coordonnée non retirée. Depuis ce lot, retirer un contact (ou supprimer un syndic) retire aussi
-- ses coordonnées : son e-mail redevient libre.
--
-- 🔴 RECENSEMENT FAIT EN LECTURE SEULE AVANT CRÉATION (10/10/2026) : AUCUN doublon d'e-mail ni de nom en base.
-- Si cette migration est rejouée sur une base qui en contiendrait, la création échouera : on ne fusionne RIEN
-- automatiquement — les doublons se règlent à la main, puis on relance.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS gestion_syndic_coordonnee_email_unique
  ON gestion_syndic_coordonnee (lower(regexp_replace(valeur, '\s+', '', 'g')))
  WHERE sorte = 'email' AND retire_le IS NULL;
