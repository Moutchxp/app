import 'server-only';

/**
 * M2 — Analytics, LOT 2. Helpers de RÉDUCTION à l'émission : transforment une entrée brute (User-Agent,
 * Referer, paramètre UTM, commune) en un TOKEN non ré-identifiant, OU renvoient `null`. Principe d'Arno :
 * « anonymat À L'ÉMISSION, pas de nettoyage après coup » — ce qui n'est pas réduit ici n'est jamais émis.
 *
 * Fonctions PURES (aucune I/O, aucune DB) → entièrement testables. Chaque sortie respecte, par
 * construction, le CHECK de la colonne cible dans `018` (device enum, charset source/medium/campagne,
 * host sans `/?#`, commune INSEE 5 car) : une valeur non conforme devient `null`, jamais une exception.
 *
 * ⚠️ Ce module NE capte JAMAIS l'UA brut, le referer complet, ni un click-id : il n'en garde qu'un dérivé
 * grossier (device/famille/host) — anti-fingerprint (SPEC_M2_rgpd §B.5, SPEC_M2_evenements §4).
 */

export type DeviceType = 'mobile' | 'desktop' | 'tablette' | 'inconnu';

/**
 * Classe un User-Agent en famille d'appareil grossière (jamais l'UA brut). Ordre important : on teste
 * tablette AVANT mobile (un iPad ne dit pas « Mobile » ; un Android tablette n'a pas « Mobile »), puis
 * mobile, sinon desktop si l'UA ressemble à un navigateur, sinon inconnu.
 */
export function deviceType(ua: string | null | undefined): DeviceType {
  if (!ua) return 'inconnu';
  const u = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|android(?!.*mobile)/.test(u)) return 'tablette';
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(u)) return 'mobile';
  if (/mozilla|chrome|safari|firefox|edg|opera|webkit/.test(u)) return 'desktop';
  return 'inconnu';
}

/**
 * Famille de navigateur GROSSIÈRE (jamais la version exacte → anti-fingerprint). Sortie conforme au CHECK
 * `navigateur_famille ~ '^[A-Za-z0-9 ._-]{1,32}$'` ou `null`. Ordre : les UA dérivés (Edge/Samsung/Opera
 * contiennent « Chrome/Safari ») sont testés AVANT Chrome/Safari.
 */
export function navigateurFamille(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const u = ua.toLowerCase();
  if (u.includes('edg')) return 'Edge';
  if (u.includes('opr') || u.includes('opera')) return 'Opera';
  if (u.includes('samsungbrowser')) return 'Samsung';
  if (u.includes('firefox') || u.includes('fxios')) return 'Firefox';
  if (u.includes('chrome') || u.includes('crios') || u.includes('chromium')) return 'Chrome';
  if (u.includes('safari')) return 'Safari';
  return 'Autre';
}

/**
 * Hôte du referer SEUL (jamais le chemin/la requête → pas de PII smuggling : un referer de webmail peut
 * contenir un token/nom dans le path). Renvoie `null` si absent, illisible, ou = notre propre hôte
 * (auto-référence → « Direct / inconnu », SPEC_M2_statistiques M-1). Sortie conforme au CHECK
 * `referer_hote` (≤ 253, sans `/?#`, sans espace/contrôle). Le tiret reste licite (mon-site.fr).
 */
export function refererHote(referer: string | null | undefined, hoteSoi: string | null = null): string | null {
  if (!referer) return null;
  let hote: string;
  try {
    hote = new URL(referer).hostname.toLowerCase();
  } catch {
    return null; // referer non parsable → on jette (jamais de valeur douteuse)
  }
  if (!hote || hote.length > 253) return null;
  // Auto-référence (notre propre site, sous-domaines inclus) → Direct/inconnu.
  if (hoteSoi) {
    const soi = hoteSoi.toLowerCase();
    if (hote === soi || hote.endsWith('.' + soi)) return null;
  }
  // Garde-fou : un hostname n'a ni /?#, ni espace, ni contrôle (mais le tiret et le point sont licites).
  if (/[/?#]/.test(hote) || /\s/.test(hote)) return null;
  return hote;
}

/**
 * Bucket d'un paramètre d'acquisition (utm_source/medium/campaign) : minuscule, tronqué à 64, réduit au
 * charset autorisé `[a-z0-9._-]` (bannit @, espace, =, etc. → aucun email/requête ne passe). `null` si
 * vide après nettoyage. Les paramètres HORS allowlist (term, content, gclid/fbclid/msclkid…) ne sont
 * jamais passés à cette fonction : ils sont IGNORÉS en amont (l'appelant ne lit que source/medium/campagne).
 */
export function bucketUtm(v: string | null | undefined): string | null {
  if (!v) return null;
  const nettoye = v.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64);
  return nettoye.length > 0 ? nettoye : null;
}

/**
 * Réduit un score /100 en une TRANCHE grossière 1-4 (jamais le score EXACT → un score précis + commune +
 * verdict redeviendrait un quasi-identifiant, SPEC_M2_evenements §3). Quartiles : <25→1, <50→2, <75→3,
 * ≥75→4 (borné au CHECK `score_tranche BETWEEN 1 AND 4` de 018). `null` si score absent/non fini.
 */
export function scoreTranche(total: number | null | undefined): number | null {
  if (typeof total !== 'number' || !Number.isFinite(total)) return null;
  if (total < 25) return 1;
  if (total < 50) return 2;
  if (total < 75) return 3;
  return 4;
}

/** Valide un code commune INSEE (5 car : dept 2 chiffres ou 2A/2B Corse + 3). Sinon `null`. */
export function communeInsee(v: string | null | undefined): string | null {
  if (!v) return null;
  return /^(2[AB]|[0-9]{2})[0-9]{3}$/.test(v) ? v : null;
}

/** Vrai si l'User-Agent correspond au motif de bots (regex, insensible casse). Motif vide → jamais bot. */
export function estBot(ua: string | null | undefined, motif: string | null | undefined): boolean {
  if (!ua || !motif) return false;
  try {
    return new RegExp(motif, 'i').test(ua);
  } catch {
    return false; // motif de config invalide → on ne bloque personne (fail-open : ne jamais perdre une vraie visite)
  }
}
