-- 030_ordre_modules.sql — Ordre PERSONNALISÉ des modules admin (tableau de bord + menu latéral), par compte.
--
-- ADDITIVE / IDEMPOTENTE / NON DESTRUCTIVE : ADD COLUMN IF NOT EXISTS, colonne NULLABLE.
-- `ordre_modules` = liste ordonnée de slugs de modules (jsonb array, ex. ["/admin/curation","/admin/pilotage",…]).
-- Sémantique du NULL : « aucun ordre personnalisé » → l'interface applique l'ORDRE PAR DÉFAUT (celui de
-- `menuAdmin.ts`). Un compte n'a donc jamais besoin d'être initialisé ; il « adopte » un ordre au 1er réordonnancement.
-- Le rendu reste toujours borné par le RÔLE (liensVisibles) : cette liste ne fait que RÉORDONNER, jamais élargir
-- (garde de sécurité portée par le helper `ordonner`, règle (c)). Voie de secours (sub=null) : aucune ligne compte
-- → pas de stockage possible → ordre par défaut (acté, pas un bug).
-- Golden-safe : sans rapport avec le moteur de score. Application MANUELLE (Arno) :
--   psql "$DATABASE_URL" -f db/migrations/030_ordre_modules.sql

ALTER TABLE admin_utilisateur
  ADD COLUMN IF NOT EXISTS ordre_modules jsonb;
