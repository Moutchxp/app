-- 487_gestion_digicode_retrait.sql — 🔴🔴 RETIRER LE DIGICODE D'UN BÂTIMENT (Arno, 17/11/2026).
--
-- LE BESOIN (demande d'Arno du 17/11/2026) : « BOUTON ROND « − » au bout de chaque ligne de bâtiment […] code déjà enregistré : fenêtre de confirmation qui
-- dit clairement que le code est RETIRÉ (« Le bâtiment X n'aura plus de digicode à partir de maintenant ; l'ancien code reste dans l'historique ») ; il est
-- marqué retiré, avec la date et l'auteur, jamais effacé de la base ; les biens de ce bâtiment lisent alors le seul digicode copropriété ».
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la nature 'retrait' entre dans la liste des natures d'une ligne de la base unique des digicodes (gestion_digicode).
-- Une ligne 'retrait' (date = le moment du geste, auteur, sans code) dit : à partir de là, ce bâtiment n'a plus de code propre — ses biens lisent le
-- digicode copropriété. Les lignes d'avant ne bougent pas (la table reste en ajout seul : verrou existant). Aucune ligne touchée.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, le « − » d'un code enregistré est refusé clairement (rien n'est écrit).

ALTER TABLE gestion_digicode DROP CONSTRAINT IF EXISTS gestion_digicode_nature_check;
ALTER TABLE gestion_digicode ADD CONSTRAINT gestion_digicode_nature_check
  CHECK (nature = ANY (ARRAY['saisie'::text, 'correction'::text, 'changement'::text, 'reprise'::text, 'arbitrage'::text, 'retrait'::text]));
