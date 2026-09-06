/**
 * FILTRE de la liste de suivi du rattachement (les ~28 k permis avec empreinte) — module PUR, CLIENT-SAFE (aucun import `pg`) : la
 * liste fermée des types et le constructeur de `WHERE` sont partagés par le repo impur (`rechercherSuivi`) ET le panneau de recherche
 * (client). 🔴 FILTRAGE EN BASE : toute valeur d'utilisateur passe en PARAMÈTRE LIÉ ($1, $2…), jamais concaténée ; le `type` choisit un
 * prédicat CONSTANT via sa clé (validée contre la liste fermée) — aucun SQL utilisateur.
 */
export interface CriteresSuivi {
  numDau?: string;            // n° de permis (contient) ← s.num_dau
  dossierId?: number | null;  // n° interne (exact) ← e.dossier_id (= s.id)
  commune?: string;           // ville (contient) ← c.nom
  type?: string;              // liste FERMÉE (cf. TYPES_PERMIS_FILTRE) ← s.type + nature + i_extension/i_surelevation
  autorisationDe?: string; autorisationA?: string; // date d'autorisation (bornes AAAA-MM-JJ) ← s.date_reelle_autorisation
  entreeDe?: string; entreeA?: string;             // date d'ENTRÉE en suivi (bornes) ← COALESCE(r.detecte_le, e.maj_le) — la MÊME que « suivi depuis »
}

/** Liste FERMÉE des types de permis filtrables (valeurs réelles dérivées de type/nature/i_extension/i_surelevation). Vocabulaire d'écran. */
export const TYPES_PERMIS_FILTRE: { cle: string; libelle: string }[] = [
  { cle: 'pc_neuf', libelle: 'PC — construction neuve' },
  { cle: 'pc_ext_surel', libelle: 'PC — extension ou surélévation' },
  { cle: 'pc_autre', libelle: 'PC — autre' },
  { cle: 'pd', libelle: 'PD — démolition' },
];

// Prédicat SQL par clé — CONSTANTES (jamais du SQL utilisateur : seule la clé, validée contre la liste fermée, choisit le prédicat).
const PREDICAT_TYPE: Record<string, string> = {
  pc_neuf: "s.type = 'PC' AND s.nature_projet_completee = '1'",
  pc_ext_surel: "s.type = 'PC' AND (COALESCE(s.i_extension, false) OR COALESCE(s.i_surelevation, false))",
  pc_autre: "s.type = 'PC' AND s.nature_projet_completee IS DISTINCT FROM '1' AND NOT COALESCE(s.i_extension, false) AND NOT COALESCE(s.i_surelevation, false)",
  pd: "s.type = 'PD'",
};

const dateBornee = (v: string | undefined): string | null => { const t = (v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };

/**
 * PUR (testable sans base) — traduit des critères en FRAGMENTS `WHERE` + VALEURS liées ($1, $2…). `actif` = au moins un critère
 * retenu. Les fragments sont destinés à être joints par ` AND `. Les alias e/s/c/r correspondent au FROM commun de `rattachementSuiviRepo`.
 */
export function construireFiltreSuivi(c: CriteresSuivi): { fragments: string[]; valeurs: unknown[]; actif: boolean } {
  const fragments: string[] = []; const valeurs: unknown[] = [];
  const lier = (v: unknown): string => { valeurs.push(v); return `$${valeurs.length}`; };
  const num = (c.numDau ?? '').trim();
  if (num) fragments.push(`s.num_dau ILIKE '%' || ${lier(num)} || '%'`);
  if (typeof c.dossierId === 'number' && Number.isInteger(c.dossierId) && c.dossierId > 0) fragments.push(`e.dossier_id = ${lier(c.dossierId)}`);
  const com = (c.commune ?? '').trim();
  if (com) fragments.push(`c.nom ILIKE '%' || ${lier(com)} || '%'`);
  if (c.type && PREDICAT_TYPE[c.type]) fragments.push(`(${PREDICAT_TYPE[c.type]})`);
  const ad = dateBornee(c.autorisationDe); if (ad) fragments.push(`s.date_reelle_autorisation >= ${lier(ad)}`);
  const aa = dateBornee(c.autorisationA); if (aa) fragments.push(`s.date_reelle_autorisation <= ${lier(aa)}`);
  const ed = dateBornee(c.entreeDe); if (ed) fragments.push(`COALESCE(r.detecte_le, e.maj_le) >= ${lier(ed)}::date`);
  const ea = dateBornee(c.entreeA); if (ea) fragments.push(`COALESCE(r.detecte_le, e.maj_le) < (${lier(ea)}::date + 1)`); // borne haute INCLUSIVE sur le jour
  return { fragments, valeurs, actif: fragments.length > 0 };
}
