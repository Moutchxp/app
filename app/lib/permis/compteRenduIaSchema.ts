/**
 * CR-2b1 — SCHÉMA de la sortie IA vision + VALIDATION (Zod) + PROMPT. PUR. La sortie du fournisseur est VALIDÉE : non conforme →
 * REJETÉE (jamais rattrapée au jugé). Le modèle A LE DROIT DE NE PAS SAVOIR : chaque champ factuel peut valoir ABSENT (`valeur: null`)
 * ; une valeur AFFIRMÉE doit CITER la page où elle a été lue (leçon P2 : fermeté ≠ justesse — une certitude sans appui est une faute).
 */
import { z } from 'zod';

const CONFIANCE = z.enum(['haute', 'moyenne', 'faible']);

/** Champ FACTUEL : une valeur (ou null = ABSENT), une confiance, et la page citée. La règle « valeur affirmée ⇒ page citée » est
 *  vérifiée en post-validation (`validerSortieIa`) — un `.refine` sur un objet générique casse l'inférence Zod. */
const champFactuel = <V extends z.ZodTypeAny>(valeur: V) =>
  z.object({ valeur: valeur.nullable(), confiance: CONFIANCE, page: z.number().int().positive().nullable() });

/** Les champs FACTUELS (ceux qui doivent citer une page dès qu'ils affirment une valeur). */
export const CHAMPS_FACTUELS_IA = ['natureProjet', 'recoursArchitecte', 'demolition', 'travauxParTranches', 'typeOperationSvav'] as const;

/** Ce que l'IA doit lire, et RIEN d'autre (cadre CR-2b1 §3). Enums FERMÉS ; hors enum → rejet. */
export const SchemaCompteRenduIa = z.object({
  // Cases cochées du Cerfa (ce que le texte ne sait pas lire) :
  natureProjet: champFactuel(z.enum(['nouvelle_construction', 'travaux_sur_existant'])),
  recoursArchitecte: champFactuel(z.boolean()),
  demolition: champFactuel(z.boolean()),
  travauxParTranches: champFactuel(z.boolean()),
  // Type d'opération au sens SVAV (la surélévation ne se lit que dans la description/les plans) :
  typeOperationSvav: champFactuel(z.enum(['immeuble', 'maison', 'extension', 'surelevation', 'demolition'])),
  // Résumé du texte libre — piloté par l'orchestrateur (uniquement si le texte dépasse le seuil ; sinon null) :
  resumeDescription: z.string().nullable(),
});

export type CompteRenduIa = z.infer<typeof SchemaCompteRenduIa>;

/** Seuil (caractères) au-dessus duquel on demande un résumé du texte libre. En dessous : pas de résumé (le texte intégral suffit). */
export const SEUIL_RESUME_DESCRIPTION = 800;

export type ResultatValidationIa = { ok: true; valeur: CompteRenduIa } | { ok: false; erreur: string };

/** Valide une sortie brute du fournisseur. Non conforme → { ok:false, erreur } (jamais une valeur devinée). */
export function validerSortieIa(brut: unknown): ResultatValidationIa {
  const r = SchemaCompteRenduIa.safeParse(brut);
  if (!r.success) {
    const premier = r.error.issues[0];
    return { ok: false, erreur: `sortie IA non conforme : ${premier ? `${premier.path.join('.')} — ${premier.message}` : 'schéma invalide'}` };
  }
  // RÈGLE P2 : une valeur AFFIRMÉE sans page citée est une faute → rejet (jamais une certitude sans appui).
  for (const k of CHAMPS_FACTUELS_IA) {
    const c = r.data[k];
    if (c.valeur !== null && c.page === null) return { ok: false, erreur: `sortie IA non conforme : ${k} — valeur affirmée sans page citée` };
  }
  return { ok: true, valeur: r.data };
}

/**
 * PROMPT unique multi-champs. `pagesEnvoyees` = pages ORIGINALES (1-based) transmises, dans l'ordre des images ; le modèle DOIT citer
 * ces numéros. `avecResume` = on demande un résumé (texte libre long) ; sinon on exige `resumeDescription: null`.
 */
export function construirePromptIa(pagesEnvoyees: readonly number[], avecResume: boolean): string {
  const correspondance = pagesEnvoyees.map((p, i) => `image ${i + 1} = page ${p}`).join(', ');
  return [
    "Tu lis des pages d'un formulaire Cerfa de permis de construire (France). Réponds UNIQUEMENT par un objet JSON conforme au schéma ci-dessous, rien d'autre.",
    `Les images fournies correspondent à : ${correspondance}. Pour toute valeur affirmée, cite le NUMÉRO DE PAGE (champ \"page\") où tu l'as lue.`,
    'RÈGLE ABSOLUE : si une information n\'est PAS lisible sur les pages fournies, réponds valeur=null et confiance="faible". N\'INVENTE JAMAIS une certitude. Mieux vaut null qu\'une valeur affirmée sans appui.',
    'Champs à renseigner :',
    '- natureProjet : la CASE COCHÉE — "nouvelle_construction" ou "travaux_sur_existant" (regarde la marque de sélection, pas seulement le libellé).',
    '- recoursArchitecte : la case "recours à un architecte" est-elle cochée ? true/false.',
    '- demolition : le projet comporte-t-il une démolition (case/section démolition cochée) ? true/false.',
    '- travauxParTranches : les travaux sont-ils réalisés par tranches ? true/false.',
    '- typeOperationSvav : le type d\'opération réel : "immeuble", "maison", "extension", "surelevation" (surélévation), ou "demolition". La surélévation se déduit de la description/les plans, pas de la seule case Cerfa.',
    avecResume
      ? '- resumeDescription : un résumé COURT et fidèle de la description libre du projet (2-3 phrases), sans rien inventer.'
      : '- resumeDescription : réponds null (le texte est court, pas de résumé).',
    'Chaque champ factuel a la forme {"valeur":…, "confiance":"haute|moyenne|faible", "page":<n° de page ou null>}.',
  ].join('\n');
}
