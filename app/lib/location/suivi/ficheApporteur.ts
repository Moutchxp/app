import { LIBELLE_TYPE_APPORTEUR, TYPES_APPORTEUR, nomEtPrenom, type Apporteur, type TypeApporteur } from './suivi';

/**
 * ══ 🔴 Arno (24/10/2026, migration 421) — LA FICHE D'IDENTITÉ D'UN APPORTEUR EXTERNE (panneau « Fiche ») ══════════════════════════
 * Civilité, nom, prénom, société, téléphone(s), e-mail(s), adresse, notes — et le type. Les champs, leur lecture, et la liste des
 * changements (le récapitulatif avant enregistrement, et une ligne de journal par champ). Un INTERNE n'a pas de fiche ici : son
 * identité est celle de son compte. PUR : le navigateur et le serveur en lisent la même chose.
 */
export const CIVILITES = ['M.', 'Mme', 'M. et Mme'] as const;

export interface FicheApporteur {
  civilite: string; nomFamille: string; prenom: string; societe: string; type: TypeApporteur;
  telephone: string; telephonesAutres: string[]; email: string; emailsAutres: string[]; adresse: string; notes: string;
}

const t = (v: unknown): string => (typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim() : '');
const liste = (v: unknown): string[] => (Array.isArray(v) ? v.map(t).filter((x) => x !== '') : []);
/** Les notes gardent leurs retours à la ligne. */
const notes = (v: unknown): string => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trimEnd()).join('\n').trim() : '');

/** La fiche telle qu'elle est en base (la séparation nom / prénom PROPOSÉE quand elle n'est pas encore faite). */
export function ficheDe(a: Apporteur): FicheApporteur {
  const np = nomEtPrenom(a);
  return {
    civilite: t(a.civilite), nomFamille: np?.nomFamille ?? '', prenom: np?.prenom ?? '', societe: t(a.societe), type: a.type,
    telephone: t(a.telephone), telephonesAutres: liste(a.telephonesAutres), email: t(a.email), emailsAutres: liste(a.emailsAutres),
    adresse: t(a.adresse), notes: notes(a.notes),
  };
}

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Vérifie une fiche reçue (navigateur ou serveur) : e-mails bien écrits, un prénom exige un nom, civilité de la liste. */
export function verifierFiche(brut: unknown): { ok: true; fiche: FicheApporteur } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const civ = t(b.civilite);
  if (civ !== '' && !(CIVILITES as readonly string[]).includes(civ)) return { ok: false, motif: 'Civilité : M., Mme, M. et Mme, ou aucune.' };
  const type = (TYPES_APPORTEUR as readonly string[]).includes(String(b.type)) ? b.type as TypeApporteur : null;
  if (type === null) return { ok: false, motif: 'Le type de l’apporteur : partenaire externe, agence, Internet ou collaborateur.' };
  const f: FicheApporteur = { civilite: civ, nomFamille: t(b.nomFamille), prenom: t(b.prenom), societe: t(b.societe), type,
    telephone: t(b.telephone), telephonesAutres: liste(b.telephonesAutres), email: t(b.email), emailsAutres: liste(b.emailsAutres), adresse: t(b.adresse), notes: notes(b.notes) };
  if (f.nomFamille === '' && f.prenom !== '') return { ok: false, motif: 'Un prénom sans nom de famille : saisissez le nom de famille (ou videz les deux pour une structure).' };
  for (const m of [f.email, ...f.emailsAutres]) if (m !== '' && !MAIL.test(m)) return { ok: false, motif: `L’e-mail « ${m} » est mal écrit (ex. nom@exemple.fr).` };
  return { ok: true, fiche: f };
}

export const LIBELLE_CHAMP_FICHE: Record<keyof FicheApporteur, string> = {
  civilite: 'Civilité', nomFamille: 'Nom de famille', prenom: 'Prénom', societe: 'Société', type: 'Type', telephone: 'Téléphone',
  telephonesAutres: 'Autres téléphones', email: 'E-mail', emailsAutres: 'Autres e-mails', adresse: 'Adresse', notes: 'Notes',
};
const texteChamp = (k: keyof FicheApporteur, v: FicheApporteur[keyof FicheApporteur]): string =>
  (Array.isArray(v) ? v.join(', ') : k === 'type' ? LIBELLE_TYPE_APPORTEUR[v as TypeApporteur] : String(v)) || '—';

/** Les SEULS champs modifiés, dans l'ordre de la fiche : le récapitulatif, et une ligne de journal chacun. PUR. */
export function changementsFiche(avant: FicheApporteur, apres: FicheApporteur): { cle: keyof FicheApporteur; champ: string; avant: string; apres: string }[] {
  return (Object.keys(LIBELLE_CHAMP_FICHE) as (keyof FicheApporteur)[])
    .filter((k) => JSON.stringify(avant[k]) !== JSON.stringify(apres[k]))
    .map((k) => ({ cle: k, champ: LIBELLE_CHAMP_FICHE[k], avant: texteChamp(k, avant[k]), apres: texteChamp(k, apres[k]) }));
}
