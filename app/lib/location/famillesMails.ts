/**
 * ══ 🔴🔴 Arno (15/11/2026) — LES FAMILLES DE MAILS D'UN RÉCAPITULATIF ═══════════════════════════════════════════════════════════════════
 * « On ne comprend pas quel mail part aux locataires et lequel part en interne. » Chaque carte de mail d'un récapitulatif de la Location
 * porte en tête une ÉTIQUETTE de famille très visible, et sa barre latérale gauche prend la couleur de la famille — les couleurs déjà
 * portées par les familles dans l'application : locataire VERT, propriétaire ROUGE, interne GRIS, partenaires BLEU.
 * Ordre : interne d'abord, puis locataires, puis propriétaires (puis partenaires). Un rappel au-dessus : « 1 mail interne · 1 mail locataire ».
 * PUR, sans import : lu par l'écran comme par le serveur.
 */
export type FamilleMail = 'interne' | 'locataire' | 'proprietaire' | 'partenaires';

export const ETIQUETTE_FAMILLE_MAIL: Record<FamilleMail, string> = {
  interne: 'MAIL INTERNE À L’AGENCE',
  locataire: 'MAIL AUX LOCATAIRES',
  proprietaire: 'MAIL AUX PROPRIÉTAIRES',
  partenaires: 'MAIL À NOS PARTENAIRES',
};

const ORDRE_FAMILLE: Record<FamilleMail, number> = { interne: 0, locataire: 1, proprietaire: 2, partenaires: 3 };
const MOTS: Record<FamilleMail, [string, string]> = {
  interne: ['mail interne', 'mails internes'],
  locataire: ['mail locataire', 'mails locataires'],
  proprietaire: ['mail propriétaire', 'mails propriétaires'],
  partenaires: ['mail partenaires', 'mails partenaires'],
};

/** Les mails dans l'ordre des familles (interne, locataires, propriétaires, partenaires) ; dans une famille, l'ordre reçu. PUR. */
export function trierParFamille<T extends { famille: FamilleMail }>(mails: readonly T[]): T[] {
  return mails.map((m, i) => ({ m, i })).sort((x, y) => ORDRE_FAMILLE[x.m.famille] - ORDRE_FAMILLE[y.m.famille] || x.i - y.i).map((x) => x.m);
}

/** « 1 mail interne · 2 mails locataires » — les comptes RÉELS, dans l'ordre des familles ; aucun mail : chaîne vide. PUR. */
export function rappelFamilles(mails: readonly { famille: FamilleMail }[]): string {
  return (Object.keys(ORDRE_FAMILLE) as FamilleMail[])
    .map((f) => [f, mails.filter((m) => m.famille === f).length] as const)
    .filter(([, n]) => n > 0)
    .map(([f, n]) => `${n} ${MOTS[f][n > 1 ? 1 : 0]}`)
    .join(' · ');
}

/** L'objet d'une copie interne (les mails partis séparément à chaque locataire) : sa sorte reste celle du mail copié. */
export const PREFIXE_COPIE_INTERNE_MAIL = '[Copie interne] ';

const SORTES: Record<string, FamilleMail> = {
  preavis_locataires: 'locataire', sortie_locataires: 'locataire', previsite_locataires: 'locataire', previsite_locataires_modif: 'locataire',
  previsite_refus: 'locataire', sortie_edls_locataire: 'locataire',
  sortie_edls_proprietaire: 'proprietaire',
  preavis_adhoc: 'partenaires', sortie_adhoc: 'partenaires', nouvelle_location: 'partenaires',
  sortie_interne: 'interne', sortie_edls_interne: 'interne', previsite_invitation: 'interne', previsite_annulation: 'interne',
  previsite_alerte: 'interne', previsite_invitation_cr: 'interne', previsite_reponse: 'interne', previsite_compte_rendu: 'interne',
};

/**
 * La famille d'un mail d'après sa sorte et son objet — pour les récapitulatifs dont le serveur ne la dit pas (préavis, sortie). Une copie
 * interne (objet « [Copie interne] … ») est INTERNE quelle que soit sa sorte. Une famille donnée par le serveur l'emporte toujours. PUR.
 */
export function familleDuMail(m: { sorte: string; objet?: string | null; famille?: FamilleMail }): FamilleMail {
  if (m.famille !== undefined) return m.famille;
  if ((m.objet ?? '').startsWith(PREFIXE_COPIE_INTERNE_MAIL)) return 'interne';
  return SORTES[m.sorte] ?? 'interne';
}
