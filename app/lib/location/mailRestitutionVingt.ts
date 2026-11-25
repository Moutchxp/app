import { libelleEtage } from './locationBien';
import { montantFr } from './vingtPourcent';

/**
 * ══ 🔴🔴 LES MAILS DE LA RESTITUTION DES 20 % (Arno, 25/11/2026, 22h06). PUR. ═══════════════════════════════════════════════════════════════════════
 * Au LOCATAIRE (un mail par locataire) et au PARTENAIRE (un mail par partenaire), remplis avec les vraies données. Règles d'Arno : une ligne absente si
 * la donnée manque, aucune répétition. Le texte est celui demandé mot pour mot ; la signature habituelle du Service Gestion est ajoutée par l'écran.
 */

export interface PersonneRestitution {
  /** « Mme », « M. »… (civilité de personne de la fiche) ; `null` : inconnue */
  civilite: string | null;
  /** le nom affiché de la fiche (« BENOÎT Sarah », « M. Didier PERRIN »…) */
  nom: string;
  /** le NOM de famille (« BENOÎT ») ; `null` : incertain */
  nomFamille: string | null;
  telephone: string | null;
  email: string | null;
  /** l'adresse postale de la fiche ; `null` : inconnue */
  adresse: string | null;
}

export interface DonneesRestitution {
  /** « 63 rue de la Convention, 75015 Paris » */
  logement: string;
  /** le lot principal d'abord, puis ses annexes */
  numLots: readonly string[];
  batiment: string | null;
  etage: string | null;
  coproNom: string | null;
  syndic: string | null;
  dateSortie: string;
  locataires: readonly PersonneRestitution[];
  proprietaires: readonly PersonneRestitution[];
  /** la clôture annuelle des comptes de la copropriété */
  arrete: { jour: number; mois: number } | null;
  /** la dernière AGO OFFICIELLE (AAAA-MM-JJ) ; `null` : aucune confirmée */
  derniereAgo: string | null;
  montantVingt: number;
  montantRestitue: number;
  /** le motif de la différence (obligatoire si elle n'est pas nulle) */
  motif: string | null;
  /** la date de validation de la restitution (AAAA-MM-JJ) */
  dateValidation: string;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateFr = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const present = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== '';
const liste = (x: readonly string[]): string => (x.length <= 1 ? x.join('') : `${x.slice(0, -1).join(', ')} et ${x[x.length - 1]}`);
const lotsPropres = (d: Pick<DonneesRestitution, 'numLots'>): string[] => [...new Set(d.numLots.map((x) => x.trim()).filter((x) => x !== ''))];

/** La différence entre les 20 % retenus et le montant restitué (au centime) ; 0 : restitution totale. PUR. */
export const differenceRestitution = (montantVingt: number, montantRestitue: number): number => Math.round((montantVingt - montantRestitue) * 100) / 100;

/** « Madame » / « Monsieur » / « Mademoiselle » d'après la civilité de la fiche ; `null` : inconnue (« Madame, Monsieur »). PUR. */
export function appellation(civilite: string | null): string | null {
  if (civilite === 'Mme') return 'Madame';
  if (civilite === 'M.') return 'Monsieur';
  if (civilite === 'Mlle') return 'Mademoiselle';
  return null;
}

/** « lot n° 58, bâtiment D, 6e étage » (seulement ce qui est renseigné) ; `null` : rien. PUR. */
function precisionsDuLot(d: Pick<DonneesRestitution, 'numLots' | 'batiment' | 'etage'>): string | null {
  const lots = lotsPropres(d);
  const morceaux = [lots.length === 0 ? null : lots.length === 1 ? `lot n° ${lots[0]}` : `lots n° ${liste(lots)}`,
    present(d.batiment) ? `bâtiment ${d.batiment.trim()}` : null, present(d.etage) ? libelleEtage(d.etage.trim()) : null].filter(present);
  return morceaux.length === 0 ? null : morceaux.join(', ');
}

/** Une adresse de la fiche qui n'est PAS le logement quitté (la « nouvelle adresse ») ; `null` sinon. PUR. */
export function nouvelleAdresse(p: Pick<PersonneRestitution, 'adresse'>, logement: string): string | null {
  if (!present(p.adresse)) return null;
  const n = (s: string) => s.toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const a = n(p.adresse); const l = n(logement);
  return a === '' || l.startsWith(a) || a.startsWith(l) ? null : p.adresse.trim();
}

/** MAIL AU LOCATAIRE (un par locataire) — objet et texte, mot pour mot ceux d'Arno ; la ligne du lot n'apparaît que si elle est renseignée. PUR. */
export function mailRestitutionLocataire(d: DonneesRestitution, p: PersonneRestitution): { objet: string; texte: string } {
  const civ = appellation(p.civilite);
  const salut = civ !== null && present(p.nomFamille) ? `${civ} ${p.nomFamille.trim()}` : civ ?? 'Madame, Monsieur';
  const politesse = civ ?? 'Madame, Monsieur';
  const lot = precisionsDuLot(d);
  const diff = differenceRestitution(d.montantVingt, d.montantRestitue);
  const resultat = diff === 0
    ? `Les comptes ayant été approuvés, nous avons le plaisir de vous confirmer que la restitution de ce solde, soit ${montantFr(d.montantRestitue)}, a été validée.`
    : `Les comptes ayant été approuvés, nous vous confirmons que la restitution d’un montant de ${montantFr(d.montantRestitue)} a été validée. La somme de ${montantFr(diff)} a été conservée pour le motif suivant : ${(d.motif ?? '').trim()}.`;
  const texte = [
    `Bonjour ${salut},`,
    `Nous revenons vers vous à la suite de votre départ, le ${dateFr(d.dateSortie)}, du logement situé ${d.logement}${lot !== null ? `, ${lot}` : ''}.`,
    `Lors de votre sortie, 20 % de votre dépôt de garantie, soit ${montantFr(d.montantVingt)}, avaient été conservés dans l’attente de l’approbation des comptes de la copropriété, comme le prévoit l’article 22 de la loi n° 89-462 du 6 juillet 1989.`,
    resultat,
    'La demande de virement a été transmise à notre service comptabilité ; le montant vous sera versé dans les meilleurs délais.',
    'Nous restons à votre disposition pour toute question.',
    `Nous vous prions d’agréer, ${politesse}, l’expression de nos salutations distinguées.`,
  ].join('\n\n');
  return { objet: `Restitution du solde de votre dépôt de garantie — ${d.logement}`, texte };
}

/** Les rubriques du mail au partenaire : un titre, des lignes (absentes si la donnée manque). PUR. */
export function rubriquesPartenaire(d: DonneesRestitution): Array<{ titre: string; lignes: string[] }> {
  const lots = lotsPropres(d);
  const plusieurs = d.locataires.length > 1;
  const personne = (p: PersonneRestitution, avecNouvelle: boolean): string => [
    present(p.civilite) && !p.nom.startsWith(p.civilite) ? `${p.civilite} ${p.nom}` : p.nom,
    present(p.telephone) ? `téléphone ${p.telephone}` : null, present(p.email) ? `e-mail ${p.email}` : null,
    avecNouvelle ? (() => { const a = nouvelleAdresse(p, d.logement); return a !== null ? `nouvelle adresse : ${a}` : null; })() : (present(p.adresse) ? `adresse : ${p.adresse.trim()}` : null),
  ].filter(present).join(' — ');
  const diff = differenceRestitution(d.montantVingt, d.montantRestitue);
  const cloture = d.arrete === null ? null : `${d.arrete.jour === 1 ? '1er' : d.arrete.jour} ${MOIS[d.arrete.mois - 1] ?? ''}`.trim();
  return [
    { titre: 'Le bien', lignes: [
      `Adresse : ${d.logement}`,
      lots.length === 0 ? null : `${lots.length > 1 ? 'Lots loués' : 'Lot loué'} : n° ${lots[0]} (lot principal)${lots.length > 1 ? `, ${lots.slice(1).map((x) => `n° ${x}`).join(', ')}` : ''}`,
      present(d.batiment) ? `Bâtiment : ${d.batiment.trim()}` : null,
      present(d.etage) ? `Étage : ${libelleEtage(d.etage.trim())}` : null,
      present(d.coproNom) ? `Copropriété : ${d.coproNom.trim()}` : null,
      present(d.syndic) ? `Syndic : ${d.syndic.trim()}` : null,
    ].filter(present) },
    { titre: plusieurs ? 'Les locataires sortants' : 'Le locataire sortant', lignes: [
      ...d.locataires.map((p) => personne(p, true)),
      `Date de sortie : ${dateFr(d.dateSortie)}`,
    ] },
    ...(d.proprietaires.length === 0 ? [] : [{ titre: d.proprietaires.length > 1 ? 'Les propriétaires' : 'Le propriétaire', lignes: d.proprietaires.map((p) => personne(p, false)) }]),
    { titre: 'La copropriété (lot principal)', lignes: [
      cloture !== null ? `Date de clôture annuelle des comptes : ${cloture}` : null,
      `Dernière AGO officielle : ${d.derniereAgo !== null ? dateFr(d.derniereAgo) : 'date de l’AGO non confirmée'}`,
    ].filter(present) },
    { titre: 'La restitution', lignes: [
      `20 % retenus à la sortie : ${montantFr(d.montantVingt)}`,
      `Montant restitué : ${montantFr(d.montantRestitue)}`,
      diff !== 0 ? `Différence : ${montantFr(diff)} — motif : ${(d.motif ?? '').trim()}` : null,
      `Date de validation : ${dateFr(d.dateValidation)}`,
      'Demande de virement transmise à notre service comptabilité.',
    ].filter(present) },
  ];
}

const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** MAIL AU PARTENAIRE (un par partenaire) — objet, texte (titres en capitales) et HTML (titres en gras), lisibles dans une boîte ordinaire. PUR. */
export function mailRestitutionPartenaire(d: DonneesRestitution): { objet: string; texte: string; html: string } {
  const noms = d.locataires.map((p) => (present(p.nomFamille) ? p.nomFamille.trim() : p.nom)).filter(present);
  const plusieurs = d.locataires.length > 1;
  const intro = `Nous vous informons que la restitution du solde du dépôt de garantie retenu à la sortie ${plusieurs ? 'des locataires' : 'du locataire'} ci-dessous a été validée ce jour. Vous trouverez ci-après l’ensemble des éléments du dossier.`;
  const r = rubriquesPartenaire(d);
  const texte = ['Bonjour,', intro, ...r.map((x) => `${x.titre.toLocaleUpperCase('fr-FR')}\n${x.lignes.map((l) => `- ${l}`).join('\n')}`),
    'Nous restons à votre disposition pour tout complément.', 'Bien cordialement,'].join('\n\n');
  const html = [`<p>Bonjour,</p>`, `<p>${echapper(intro)}</p>`,
    ...r.map((x) => `<p><strong>${echapper(x.titre)}</strong></p><ul>${x.lignes.map((l) => `<li>${echapper(l)}</li>`).join('')}</ul>`),
    '<p>Nous restons à votre disposition pour tout complément.</p>', '<p>Bien cordialement,</p>'].join('');
  return { objet: `Restitution du solde du dépôt de garantie — ${d.logement} — ${liste(noms)}`, texte, html };
}

/** La saisie de la restitution vérifiée : restitué ≤ 20 % retenus ; une différence demande un MOTIF. PUR. */
export function verifierDifference(montantVingt: number, montantRestitue: number, motif: unknown):
  { ok: true; motif: string | null } | { ok: false; motif: string; champ: 'montantRestitue' | 'motifDifference' } {
  if (montantRestitue > montantVingt) return { ok: false, motif: `Le montant restitué ne peut pas dépasser les 20 % retenus (${montantFr(montantVingt)}).`, champ: 'montantRestitue' };
  const m = typeof motif === 'string' ? motif.trim() : '';
  if (differenceRestitution(montantVingt, montantRestitue) !== 0 && m === '') return { ok: false, motif: 'Indiquez le motif de la différence (ex. « régularisation de charges défavorable de 30,00 € »).', champ: 'motifDifference' };
  if (m.length > 500) return { ok: false, motif: 'Le motif de la différence dépasse 500 caractères.', champ: 'motifDifference' };
  return { ok: true, motif: differenceRestitution(montantVingt, montantRestitue) === 0 ? null : m };
}
