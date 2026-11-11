/**
 * ══ 🔴🔴 LA FICHE D'INTERVENTION D'UN PRÉAVIS — LOCATAIRES, PROPRIÉTAIRES, LOGEMENT ET ANNEXES (spec d'Arno du 11/11/2026). MODULE PUR. ══════
 *
 * Trois blocs, dans un ordre fixe, lus dans l'encart du logement du bail (`encartDuBail`) :
 *   ① LOCATAIRES — nom, prénom, téléphone, e-mail, DATE D'ENTRÉE (mise en avant) ;
 *   ② PROPRIÉTAIRES — nom, téléphone, e-mail de chacun (celui de la fiche, puis les copropriétaires) ;
 *   ③ LOGEMENT ET ANNEXES — adresse, digicode, type, étage, n° de lot, n° de porte, informations d'accès, « N lots concernés par ce
 *      préavis », puis chaque annexe (type, étage, n° de lot, numéro propre). Une information absente : « non renseigné ».
 * Les autres informations déjà connues du logement (bâtiment, surfaces, DPE, syndic…) restent, à la suite du bloc ③ : rien n'est retiré.
 *
 * 🔴 CONFIDENTIALITÉ : cette fiche est INTERNE (écran de l'agence, mails et agendas des COLLÈGUES). Elle n'entre JAMAIS dans un mail ou un
 * .ics envoyé à un locataire ou à un propriétaire. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
import { lignesEncart, type EncartLogement, type LigneEncart } from './sortieLocataires';
import { dateFrPreavis } from './preavis';

export const NON_RENSEIGNE = 'non renseigné';

export interface PersonneFiche { nom: string; prenom: string | null; telephones: string[]; emails: string[] }
export interface LocataireFiche extends PersonneFiche { entree: string | null }
/** Une ligne du bloc ③ : `valeur` null = « non renseigné » (avec le lien vers la fiche du bien pour la compléter). */
export interface LigneFiche { cle: string; libelle: string; valeur: string | null }
export interface AnnexeFiche { type: string; etage: string | null; numeroLot: string | null; numero: string | null; place: boolean }

export interface FicheIntervention {
  lotId: number;
  locataires: LocataireFiche[];
  proprietaires: (PersonneFiche & { id: number | null })[];
  logement: LigneFiche[];
  nombreLots: number;
  annexes: AnnexeFiche[];
  /** Les autres informations connues du logement (rien n'est retiré de l'encart d'avant). */
  autres: LigneEncart[];
}

const present = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== '';
const etageLisible = (e: string | null): string | null => {
  if (!present(e)) return null;
  const t = e.trim();
  if (/^(0|rdc|rez[- ]de[- ]chauss[ée]e)$/i.test(t)) return 'rez-de-chaussée';
  if (/^-?\d+$/.test(t)) { const n = Number(t); return n < 0 ? `sous-sol ${-n}` : n === 1 ? '1er étage' : `${n}e étage`; }
  return t;
};

/** Le digicode tel qu'on le dit au pied de l'immeuble. PUR. */
function digicodeLisible(e: Pick<EncartLogement, 'digicode' | 'digicodeCode'>): string | null {
  if (e.digicode === false) return 'aucun';
  if (present(e.digicodeCode)) return e.digicodeCode.trim();
  return e.digicode === true ? 'oui (code non renseigné)' : null;
}

/** Les clés de l'encart d'avant reprises dans le bloc ③ (les autres restent dans « Autres informations »). */
const CLES_REPRISES = new Set(['etage', 'porte', 'copro', 'lot', 'digicode', 'acces']);

export function ficheDepuisEncart(e: EncartLogement, o: { occupationIds?: readonly number[] } = {}): FicheIntervention {
  const lots = Array.isArray(e.lots) ? e.lots : [];
  const c = e.coordonnees;
  // Un état des lieux de sortie partiel : seuls les locataires concernés (sortants) ; sans filtre, tous ceux du bail.
  const dansLeFiltre = (occ: number) => o.occupationIds === undefined || o.occupationIds.length === 0 || o.occupationIds.includes(occ);
  const proprietaires = c?.proprietaires && c.proprietaires.length > 0
    ? c.proprietaires.map((p) => ({ id: p.id, nom: p.nom, prenom: null, telephones: p.telephones, emails: p.emails }))
    : e.proprietaire ? [{ id: e.proprietaire.id, nom: e.proprietaire.nom, prenom: null, telephones: c?.proprietaire?.telephones ?? [], emails: c?.proprietaire?.emails ?? [] }] : [];
  return {
    lotId: e.lotId,
    locataires: (c?.locataires ?? []).filter((l) => dansLeFiltre(l.occupationId)).map((l) => ({ nom: l.nom, prenom: l.prenom ?? null, telephones: l.telephones, emails: l.emails, entree: l.entree ?? e.bail?.entree ?? null })),
    proprietaires,
    logement: [
      { cle: 'adresse', libelle: 'Adresse', valeur: present(e.adresse) ? e.adresse : null },
      { cle: 'digicode', libelle: 'Digicode', valeur: digicodeLisible(e) },
      { cle: 'type', libelle: 'Type de bien', valeur: present(e.type) ? e.type : null },
      { cle: 'etage', libelle: 'Étage', valeur: etageLisible(e.etage) },
      { cle: 'lot', libelle: 'N° de lot', valeur: present(e.numLotCopro) ? e.numLotCopro : present(e.numeroLot) ? e.numeroLot : null },
      { cle: 'porte', libelle: 'N° de porte', valeur: present(e.porte) ? e.porte : null },
      { cle: 'acces', libelle: 'Informations d’accès', valeur: present(e.precisionAcces) ? e.precisionAcces : null },
    ],
    nombreLots: Math.max(lots.length, 1),
    annexes: lots.filter((l) => l.role === 'annexe').map((l) => ({
      type: present(l.type) ? l.type : 'Annexe', etage: etageLisible(l.etage), numeroLot: present(l.numLotCopro) ? l.numLotCopro : present(l.numeroLot) ? l.numeroLot : null,
      numero: present(l.porte) ? l.porte : null, place: l.place,
    })),
    autres: lignesEncart(e).filter((l) => !CLES_REPRISES.has(l.cle) && l.cle !== 'type'),
  };
}

/** « Prénom NOM » d'une personne de la fiche (le prénom s'il est saisi). PUR. */
export const nomFiche = (p: Pick<PersonneFiche, 'nom' | 'prenom'>): string => (present(p.prenom) && !p.nom.includes(p.prenom) ? `${p.prenom} ${p.nom}` : p.nom);

/**
 * La fiche en TEXTE, pour le mail et l'événement d'agenda des COLLÈGUES (lot 2) — titres en capitales, une ligne par information, lisible
 * sur un téléphone au pied de l'immeuble. PUR.
 */
export function texteFicheIntervention(f: FicheIntervention): string {
  const v = (x: string | null) => x ?? NON_RENSEIGNE;
  const coords = (p: PersonneFiche) => [
    ...(p.telephones.length > 0 ? p.telephones.map((t) => `  Tél. : ${t}`) : [`  Tél. : ${NON_RENSEIGNE}`]),
    ...(p.emails.length > 0 ? p.emails.map((m) => `  E-mail : ${m}`) : [`  E-mail : ${NON_RENSEIGNE}`]),
  ];
  const l: string[] = ['━━ LOCATAIRES ━━'];
  if (f.locataires.length === 0) l.push(NON_RENSEIGNE);
  for (const p of f.locataires) l.push(`• ${nomFiche(p)}`, `  Entré(e) dans le logement le ${p.entree ? dateFrPreavis(p.entree) : NON_RENSEIGNE}`, ...coords(p));
  l.push('', '━━ PROPRIÉTAIRES ━━');
  if (f.proprietaires.length === 0) l.push(NON_RENSEIGNE);
  for (const p of f.proprietaires) l.push(`• ${nomFiche(p)}`, ...coords(p));
  l.push('', '━━ LOGEMENT ET ANNEXES ━━', ...f.logement.map((x) => `${x.libelle} : ${v(x.valeur)}`));
  l.push(`${f.nombreLots} lot${f.nombreLots > 1 ? 's' : ''} concerné${f.nombreLots > 1 ? 's' : ''} par ce préavis`);
  for (const a of f.annexes) {
    l.push(`• ${a.type} — étage : ${v(a.etage)} · n° de lot : ${v(a.numeroLot)} · ${a.place ? 'n° de place' : 'n°'} : ${v(a.numero)}`);
  }
  if (f.autres.length > 0) l.push('', 'Autres informations :', ...f.autres.map((x) => `${x.libelle} : ${x.valeur}`));
  return l.join('\n');
}

/**
 * 🔴 Arno (11/11/2026, lot 2) — LE TEXTE DE LA MISSION d'un collègue (note de la tâche de pré-visite ou d'état des lieux de sortie, donc
 * le mail du module de tâches ET l'événement d'agenda) : la mission, la fiche d'intervention en trois blocs, les dates du préavis, le
 * commentaire. Réservé aux COLLÈGUES. PUR.
 */
export function texteMission(o: { mission: string; fiche: FicheIntervention; preavis?: { recuLe: string; dateMax: string } | null; commentaire?: string | null }): string {
  return [`Mission : ${o.mission}.`, '', texteFicheIntervention(o.fiche),
    ...(o.preavis ? ['', `Préavis : recommandé reçu le ${dateFrPreavis(o.preavis.recuLe)} — fin du préavis le ${dateFrPreavis(o.preavis.dateMax)}`] : []),
    ...(o.commentaire && o.commentaire.trim() !== '' ? ['', `Commentaire : ${o.commentaire.trim()}`] : [])].join('\n');
}
