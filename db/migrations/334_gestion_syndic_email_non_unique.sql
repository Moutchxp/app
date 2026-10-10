-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 334 — LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT : UN E-MAIL DÉJÀ UTILISÉ N'EST PLUS UN BLOCAGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO (décision) : « e-mail ou téléphone déjà utilisé = AVERTISSEMENT, plus blocage ». Une même adresse peut être
-- partagée (standard d'un cabinet, boîte d'une loge…) ; l'écran prévient précisément, le serveur exige une confirmation
-- explicite. L'index d'unicité posé par la 327 sur l'e-mail des contacts de syndic contredirait cette décision : il est
-- RETIRÉ (accord d'Arno). AUCUNE donnée n'est touchée — seul l'index disparaît. Idempotente (IF EXISTS).
-- Ce qui reste BLOQUANT (même Prénom + NOM dans un même syndic / un même immeuble) est tenu par l'application.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS gestion_syndic_coordonnee_email_unique;
