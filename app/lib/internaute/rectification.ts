/**
 * Module INTERNAUTE — LOT 4 : validation PURE de la rectification d'identité (bloc A).
 *
 * Pur, sans accès base, AUCUN import `app/lib/analytics/*` ni moteur → cloisonnement M2 trivial. La rectification
 * ne touche QUE l'identité (A) : jamais les preuves de consentement (B, append-only), jamais le moteur.
 */

/** Champs d'identité rectifiables. Seuls les champs FOURNIS sont mis à jour (patch partiel). `telephone: null` efface le numéro. */
export interface ChampsRectification {
  prenom?: string;
  nom?: string;
  email?: string;
  telephone?: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valide un patch de rectification. Renvoie `{ ok, champs }` (uniquement les champs présents et valides, trimés)
 * ou `{ ok: false, erreurs }`. Exige AU MOINS un champ. Ne throw jamais.
 */
export function validerRectification(
  body: unknown,
): { ok: true; champs: ChampsRectification } | { ok: false; erreurs: string[] } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, erreurs: ['corps invalide'] };
  const b = body as Record<string, unknown>;
  const erreurs: string[] = [];
  const champs: ChampsRectification = {};

  if ('prenom' in b) {
    if (typeof b.prenom === 'string' && b.prenom.trim() !== '') champs.prenom = b.prenom.trim();
    else erreurs.push('prenom invalide');
  }
  if ('nom' in b) {
    if (typeof b.nom === 'string' && b.nom.trim() !== '') champs.nom = b.nom.trim();
    else erreurs.push('nom invalide');
  }
  if ('email' in b) {
    if (typeof b.email === 'string' && EMAIL.test(b.email.trim())) champs.email = b.email.trim();
    else erreurs.push('email invalide');
  }
  if ('telephone' in b) {
    if (b.telephone === null) champs.telephone = null;
    else if (typeof b.telephone === 'string' && b.telephone.trim() !== '') champs.telephone = b.telephone.trim();
    else erreurs.push('telephone invalide');
  }

  if (erreurs.length > 0) return { ok: false, erreurs };
  if (Object.keys(champs).length === 0) return { ok: false, erreurs: ['aucun champ à rectifier'] };
  return { ok: true, champs };
}
