-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LOT 5e — LA FENÊTRE « ANNULER L'ENVOI », EN BASE.
--
-- 🔴 LIVRÉE NON APPLIQUÉE. Tant qu'elle ne l'est pas, le délai vaut 10 secondes (le DEFAUT du code) : la fonction
-- marche, elle n'est simplement pas réglable. Aucun écran ne casse.
--
-- POURQUOI EN BASE ET PAS EN DUR : c'est un réglage d'usage, pas une constante d'architecture. Dix secondes conviennent
-- à qui relit ; trente à qui écrit vite et se ravise. Le changer ne doit pas demander une livraison de code.
--
-- BORNES : de 0 (envoi immédiat, pour qui ne veut pas de fenêtre) à 60 secondes. Au-delà, ce n'est plus une fenêtre
-- d'annulation mais une file d'attente — et un mail qu'on croit parti depuis deux minutes et qui dort encore est un
-- piège pire que l'absence de délai.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_config
  ADD COLUMN IF NOT EXISTS annulation_envoi_secondes integer NOT NULL DEFAULT 10;

ALTER TABLE gestion_config
  DROP CONSTRAINT IF EXISTS gestion_config_annulation_envoi_secondes_check;
ALTER TABLE gestion_config
  ADD CONSTRAINT gestion_config_annulation_envoi_secondes_check
  CHECK (annulation_envoi_secondes BETWEEN 0 AND 60);

COMMENT ON COLUMN gestion_config.annulation_envoi_secondes IS
  'LOT 5e — secondes pendant lesquelles « Annuler l''envoi » reste possible après le clic. 0 = départ immédiat.';
