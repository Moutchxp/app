/**
 * ══ 🔴🔴 MON ESPACE — LE COMPROMIS COMMUN À DEUX COLLABORATEURS (Arno, 05/11/2026). MODULE PUR : ni base, ni réseau (écran ET serveur). ════════
 *
 * À LA CRÉATION (« + Nouveau compromis » de « Mon espace »), CE QUI EST OBLIGATOIRE POUR LE CRÉATEUR :
 *   · il tient les DEUX côtés → les clients des deux côtés (au moins un vendeur ET un acquéreur renseignés) ;
 *   · il tient UN côté → les clients de SON côté ; l'autre côté est facultatif, mais il choisit le COLLABORATEUR de l'autre côté et le PARTAGE ;
 *   · il ne tient AUCUN côté (« Pour un collègue ») → le collaborateur de chaque côté et le partage ; les clients sont facultatifs.
 * Un client est RENSEIGNÉ : nom ET prénom (particulier) ou raison sociale (société), ET au moins un téléphone ou un e-mail.
 * Entrée du mandat = côté VENDEUR ; sortie du mandat = côté ACQUÉREUR.
 *
 * APRÈS : un mail à chaque collaborateur présent sur un côté, sauf le créateur ; et, dans SON espace, tant qu'aucun client valide de son côté
 * n'est saisi, la ligne du compromis est en ROUGE et n'entre pas dans ses grandes cases (compromis créés à partir de ce lot seulement).
 */

export type CoteVente = 'entree' | 'sortie';
export const ROLE_DU_COTE = { entree: 'vendeur', sortie: 'acquereur' } as const;
export const MOT_COTE: Record<CoteVente, string> = { entree: 'entrée du mandat (côté vendeur)', sortie: 'sortie du mandat (côté acquéreur)' };

/** Ce qu'il faut d'un client pour le juger (une ligne du formulaire, une saisie, une fiche lue). */
export interface ClientLu { role: 'vendeur' | 'acquereur'; type?: 'particulier' | 'societe' | null; nom: string | null; prenom?: string | null; telephone?: string | null; email?: string | null }

const rempli = (x: string | null | undefined): boolean => typeof x === 'string' && x.trim() !== '';

/** Le client est-il renseigné ? (nom + prénom, ou raison sociale ; et un téléphone ou un e-mail). PUR. */
export function clientRenseigne(p: ClientLu): boolean {
  const identite = p.type === 'societe' ? rempli(p.nom) : rempli(p.nom) && rempli(p.prenom);
  return identite && (rempli(p.telephone) || rempli(p.email));
}

/** Le nombre de clients renseignés de ce côté. PUR. */
export const clientsRenseignes = (personnes: readonly ClientLu[], cote: CoteVente): number =>
  personnes.filter((p) => p.role === ROLE_DU_COTE[cote] && clientRenseigne(p)).length;

/** Les côtés que tient ce compte (le négociateur d'entrée / de sortie du dossier). PUR. */
export function cotesDuCompte(s: { entreeId: number | null; sortieId: number | null }, compteId: number): CoteVente[] {
  return [...(s.entreeId === compteId ? ['entree' as const] : []), ...(s.sortieId === compteId ? ['sortie' as const] : [])];
}

export interface Manque { bloc: 'vendeurs' | 'acquereurs' | 'repartition'; message: string }

const BLOC_DU_COTE = { entree: 'vendeurs', sortie: 'acquereurs' } as const;
const MANQUE_CLIENT: Record<CoteVente, string> = {
  entree: 'Renseignez au moins un vendeur : nom et prénom (ou raison sociale), et un téléphone ou un e-mail.',
  sortie: 'Renseignez au moins un acquéreur : nom et prénom (ou raison sociale), et un téléphone ou un e-mail.',
};
export const MANQUE_PARTAGE = 'Définissez le partage de la commission entre les deux côtés (il doit faire exactement 100 %).';
const manqueCollaborateur = (c: CoteVente): string => `Choisissez le collaborateur rattaché à ${c === 'entree' ? 'l’entrée du mandat (côté vendeur)' : 'la sortie du mandat (côté acquéreur)'}.`;

/**
 * LES OBLIGATIONS DU CRÉATEUR (vide : l'enregistrement peut partir). `partageDefini` : la répartition entre les deux côtés est posée et fait
 * 100 % (l'écran le sait par `etatSomme`, le serveur par les parties). PUR.
 */
export function manquesCreateur(s: { entreeId: number | null; sortieId: number | null; personnes: readonly ClientLu[]; partageDefini: boolean }, createurId: number): Manque[] {
  const mes = cotesDuCompte(s, createurId);
  const manques: Manque[] = [];
  for (const c of mes) if (clientsRenseignes(s.personnes, c) === 0) manques.push({ bloc: BLOC_DU_COTE[c], message: MANQUE_CLIENT[c] });
  if (mes.length === 2) return manques;
  const autres = (['entree', 'sortie'] as const).filter((c) => !mes.includes(c));
  for (const c of autres) {
    const id = c === 'entree' ? s.entreeId : s.sortieId;
    if (id === null) manques.push({ bloc: 'repartition', message: manqueCollaborateur(c) });
  }
  if (!s.partageDefini) manques.push({ bloc: 'repartition', message: MANQUE_PARTAGE });
  return manques;
}

/**
 * 🔴 Arno (07/11/2026) — LE TAUX DE COMMISSION EST OBLIGATOIRE à la création : aucun 50 % par défaut. Les côtés tenus par un négociateur commissionné
 * dont le taux n'est pas saisi (« Les deux côtés » : une seule ligne « entrée et sortie », le taux de l'entrée seulement). Sans commissions dans la
 * saisie (avant la 437) : rien n'est exigé (rien ne s'écrit). PUR.
 */
export function tauxManquants(s: { entreeId: number | null; sortieId: number | null; parties: readonly { sorte: string }[];
  commissions?: { taux?: { entree: number | null; sortie: number | null } } }, commissionne: (compteId: number) => boolean): CoteVente[] {
  if (s.commissions === undefined) return [];
  const deuxCotes = s.parties.some((p) => p.sorte === 'entree_sortie');
  return (['entree', 'sortie'] as const).filter((c) => {
    const id = c === 'entree' ? s.entreeId : s.sortieId;
    if (id === null || !commissionne(id) || (c === 'sortie' && deuxCotes)) return false;
    return (s.commissions?.taux?.[c] ?? null) === null;
  });
}
export const MANQUE_TAUX = (c: CoteVente): string => `Saisissez le taux de commission (entre 0 et 100 %) du collaborateur de ${MOT_COTE[c]}.`;

/** Les collaborateurs à prévenir : ceux d'un côté, sauf le créateur, chacun une fois. PUR. */
export function collaborateursAPrevenir(s: { entreeId: number | null; sortieId: number | null }, createurId: number): number[] {
  return [...new Set([s.entreeId, s.sortieId].filter((x): x is number => x !== null && x !== createurId))];
}

/** Les côtés d'un compromis COMMUN (marqué) où ce compte n'a encore AUCUN client renseigné. PUR. */
export function cotesARenseigner(v: { statut: string; dossier?: { entree?: { id: number | null } | null; sortie?: { id: number | null } | null; personnes?: readonly ClientLu[] } | null },
  compteId: number, commun: boolean): CoteVente[] {
  if (!commun || v.statut !== 'compromis') return [];
  const personnes = v.dossier?.personnes ?? [];
  const mes = cotesDuCompte({ entreeId: v.dossier?.entree?.id ?? null, sortieId: v.dossier?.sortie?.id ?? null }, compteId);
  return mes.filter((c) => clientsRenseignes(personnes, c) === 0);
}

// ══ LE MAIL À L'AUTRE COLLABORATEUR ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export interface DonneesMailCommun {
  destinataire: { prenom: string | null; nom: string };
  createur: string;
  quand: string; // AAAA-MM-JJ
  structure: string;
  mandat: string;
  adresse: string | null;
  prixVente: number | null;
  honorairesTtc: number;
  sesCotes: CoteVente[];
  /** 🔴 Arno (05/11/2026) — le partage du compromis ENREGISTRÉ, une ligne par côté (`lignePartage`) ; jamais une valeur par défaut. */
  partage: string[];
  /** Les fiches client renseignées de SES côtés. */
  clientsSaisis: number;
  lien: string;
}

const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
const jourFr = (d: string): string => d.split('-').reverse().join('/');

export const objetMailCommun = (d: Pick<DonneesMailCommun, 'mandat' | 'adresse'>): string =>
  `Nouveau compromis commun — mandat ${d.mandat}${d.adresse !== null && d.adresse.trim() !== '' ? ` — ${d.adresse.trim()}` : ''}`;

export const PHRASE_CLIENTS_A_SAISIR = 'Les coordonnées de vos clients ne sont pas encore saisies. Merci de les renseigner : tant qu’elles manquent, ce compromis n’est pas comptabilisé dans votre total.';
/** 🔴 Arno (05/11/2026) — accordé : « 1 fiche client créée » / « 2 fiches clients créées ». PUR. */
export const phraseClientsSaisis = (n: number): string =>
  `Les coordonnées de vos clients ont été saisies : ${n} ${n > 1 ? 'fiches clients créées' : 'fiche client créée'}.`;
/** 🔴 Arno (05/11/2026) — la formule de fin et la signature. */
export const SIGNATURE_MAIL_COMMUN = ['Bonne journée,', 'L’équipe Sans Vis-à-Vis'] as const;

/** Une part du partage, telle que le compromis ENREGISTRÉ la porte : le collaborateur, sa structure, son pourcentage, ses honoraires (centimes). */
export interface PartPartage { cote: 'entree' | 'sortie' | 'entree_sortie'; nom: string; structure: string | null; pourcentage: number | null; htC: number; ttcC: number }

const euros = (centimes: number): string => `${(centimes / 100).toLocaleString('fr-FR', { minimumFractionDigits: centimes % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })} €`;
const MOT_PART = { entree: 'entrée du mandat', sortie: 'sortie du mandat', entree_sortie: 'entrée et sortie du mandat' } as const;

/** « entrée du mandat — Arnaud Jorel (CRITERIMMO) : 60 % soit 12 000 € TTC (10 000 € HT) ». PUR. */
export function lignePartage(p: PartPartage): string {
  const pct = p.pourcentage === null ? '' : `${p.pourcentage.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % soit `;
  return `${MOT_PART[p.cote]} — ${p.nom}${p.structure === null ? '' : ` (${p.structure})`} : ${pct}${euros(p.ttcC)} TTC (${euros(p.htC)} HT)`;
}

/** Les lignes du mail (texte), dans l'ordre. PUR. */
export function lignesMailCommun(d: DonneesMailCommun): string[] {
  const cotes = d.sesCotes.map((c) => MOT_COTE[c]).join(' et ');
  return [
    `Bonjour ${d.destinataire.prenom ?? d.destinataire.nom},`,
    '',
    `${d.createur} a créé le ${jourFr(d.quand)} un compromis commun avec vous dans « Mon espace ».`,
    '',
    `Structure : ${d.structure}`,
    `N° de mandat : ${d.mandat}`,
    `Bien : ${d.adresse ?? 'adresse à renseigner'}`,
    `Prix de vente : ${d.prixVente === null ? 'non renseigné' : eur(d.prixVente)}`,
    `Honoraires : ${eur(d.honorairesTtc)} TTC (${eur(Math.round((d.honorairesTtc / 1.2) * 100) / 100)} HT)`,
    `Votre côté : ${cotes}`,
    'Partage des honoraires :',
    ...d.partage.map((x) => `– ${x}`),
    '',
    ...(d.clientsSaisis > 0 ? [phraseClientsSaisis(d.clientsSaisis)] : [PHRASE_CLIENTS_A_SAISIR, '', `Renseigner mes clients : ${d.lien}`]),
    '',
    ...SIGNATURE_MAIL_COMMUN,
  ];
}

const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Le mail complet : objet, texte, HTML (le lien en bouton quand les clients manquent). PUR. */
export function mailCommun(d: DonneesMailCommun): { objet: string; texte: string; html: string } {
  const lignes = lignesMailCommun(d);
  const ligneDuLien = lignes.findIndex((l) => l.startsWith('Renseigner mes clients : '));
  const bouton = `<p style="margin:16px 0"><a href="${echapper(d.lien)}" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#a30402;color:#ffffff;font-weight:700;text-decoration:none">Renseigner mes clients</a></p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1f26;max-width:640px">`
    + lignes.map((l, i) => (i === ligneDuLien ? bouton : l === '' ? '<br>' : `<div>${echapper(l)}</div>`)).join('')
    + '</div>';
  return { objet: objetMailCommun(d), texte: lignes.join('\n'), html };
}

/** Le lien qui ouvre CE compromis dans « Mon espace », sur le bloc de SON côté, en modification. PUR. */
export function lienCompromis(base: string, venteId: number, cote: CoteVente): string {
  return `${base.replace(/\/+$/, '')}/admin/mon-espace?affaire=${venteId}&cote=${cote}&modifier=1`;
}

/** Lit le lien à l'arrivée (« ?affaire=12&cote=sortie&modifier=1 ») ; null : pas un lien d'ouverture. PUR. */
export function lireLienCompromis(recherche: string): { venteId: number; cote: CoteVente } | null {
  const p = new URLSearchParams(recherche);
  const id = Number(p.get('affaire'));
  const cote = p.get('cote');
  if (p.get('modifier') !== '1' || !Number.isSafeInteger(id) || id <= 0 || (cote !== 'entree' && cote !== 'sortie')) return null;
  return { venteId: id, cote };
}
