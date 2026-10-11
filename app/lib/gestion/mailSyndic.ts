/**
 * ══ 🔴🔴 LOT MAIL-SYNDIC-PREREMPLI — LE MAIL AU SYNDIC, DÉJÀ ÉCRIT. PUR. ═════════════════════════════════════════════
 *
 * ARNO (11/10/2026) : « Écrire depuis gestion@ » (fiche syndic, contacts du syndic, carnet de l'immeuble, e-mail
 * générique) ouvre la rédaction DÉJÀ PRÉ-REMPLIE quand on part d'une fiche bien. Rien n'est envoyé.
 *
 *   · l'OBJET : « XXXXXXXX / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie » — « XXXXXXXX »
 *     est sélectionné à l'ouverture, pour être remplacé à la première frappe ;
 *   · le CORPS : la formule d'appel (selon la civilité des destinataires en « À »), l'annonce, les propriétaires,
 *     le bien, l'occupation, puis deux lignes vides où Arno écrit la suite.
 *
 * Hors fiche bien (écran « Syndics ») : l'objet sans la résidence, et la formule d'appel seule.
 *
 * ⚠️ AUCUNE E/S : la route lit la base au moment du clic, ce module écrit le texte. Le texte reste entièrement
 * modifiable : c'est un brouillon pré-rempli, jamais un modèle verrouillé.
 *
 * ⚠️ CE QUE LA BASE NE PORTE PAS (mesuré le 11/10/2026 sur `gestion_annuaire_lot`) : ni étage, ni surface, ni nombre
 * de pièces explicite, ni numéros de lots de COPROPRIÉTÉ. Le « numéro de lot » de l'application est celui de
 * WIPPIMMO, qui n'est PAS un lot de copropriété : on ne l'écrit donc jamais comme tel au syndic. Les champs existent
 * ici pour le jour où la fiche les portera ; d'ici là chacun est omis, comme le veut la règle « n'apparaît que s'il
 * est renseigné ».
 */
import { formuleAppel, type Civilite } from './syndics';

// ══ D'OÙ L'ON ÉCRIT ════════════════════════════════════════════════════════════════════════════════════════════════

/** Le syndic dont on a cliqué une adresse, et le bien d'où l'on vient (`null` = écran « Syndics »). */
export interface ContexteEcritureSyndic { syndicId: number; lotId: number | null }

/** « Écrire depuis gestion@ » : l'adresse cliquée, et — depuis une fiche syndic — de quoi pré-remplir le message. */
export type EcrireDepuisGestionFn = (email: string, syndic?: ContexteEcritureSyndic) => void;

/** Ce que l'écran transmet à la boîte : une adresse seule (comme avant ce lot), ou une adresse et son syndic. */
export type DemandeEcriture = string | { email: string; syndic: ContexteEcritureSyndic };

// ══ LA FORMULE D'APPEL, SELON LES DESTINATAIRES EN « À » ═══════════════════════════════════════════════════════════

/**
 * Un destinataire en « À » : un contact connu (sa civilité, son nom de famille) ou `null` — une adresse qui n'est
 * celle d'aucun contact (l'e-mail générique du syndic, une adresse tapée à la main).
 */
export type DestinataireAppel = { civilite: Civilite | null | undefined; nom: string | null | undefined } | null;

/**
 * « Bonjour …, » selon les destinataires en « À » — Cc et Cci n'y entrent jamais. PUR.
 *   · un seul homme / une seule femme      → « Bonjour Monsieur NOM, » / « Bonjour Madame NOM, »
 *   · plusieurs hommes / plusieurs femmes  → « Bonjour Messieurs, » / « Bonjour Mesdames, »
 *   · un homme et une femme                → « Bonjour Madame, Monsieur, »
 *   · un homme et plusieurs femmes         → « Bonjour Mesdames, Monsieur, »
 *   · une femme et plusieurs hommes        → « Bonjour Madame, Messieurs, »
 *   · plusieurs de chaque                  → « Bonjour Mesdames, Messieurs, »
 *   · au moins un contact sans civilité, une adresse non-contact, ou personne → « Bonjour Madame, Monsieur, »
 * Le NOM est le nom de famille enregistré, en capitales (`formuleAppel` du lot civilité, réutilisée telle quelle).
 */
export function formuleAppelDestinataires(destinataires: readonly DestinataireAppel[]): string {
  const neutre = 'Bonjour Madame, Monsieur,';
  if (destinataires.length === 0) return neutre;
  if (destinataires.some((d) => d === null || (d.civilite !== 'M.' && d.civilite !== 'Mme'))) return neutre;
  const connus = destinataires as ReadonlyArray<{ civilite: Civilite; nom: string | null | undefined }>;
  if (connus.length === 1) return `Bonjour ${formuleAppel(connus[0].civilite, connus[0].nom)},`;
  const h = connus.filter((d) => d.civilite === 'M.').length;
  const f = connus.length - h;
  const dames = f === 0 ? '' : f === 1 ? 'Madame' : 'Mesdames';
  const messieurs = h === 0 ? '' : h === 1 ? 'Monsieur' : 'Messieurs';
  return `Bonjour ${[dames, messieurs].filter((x) => x !== '').join(', ')},`;
}

/**
 * Une civilité écrite n'importe comment (« M », « M. », « Monsieur », « Mme », « Madame », « Mlle ») → l'une des deux,
 * ou `null`. PUR. Les fiches importées de WIPPIMMO portent « M » sans point.
 */
export function civiliteDeTexte(brut: string | null | undefined): Civilite | null {
  const t = (brut ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (t === 'm' || t === 'mr' || t === 'monsieur') return 'M.';
  if (t === 'mme' || t === 'madame' || t === 'mlle' || t === 'mademoiselle') return 'Mme';
  return null;
}

// ══ L'OBJET ════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Ce qu'Arno remplace à la première frappe. Sélectionné à l'ouverture. */
export const OBJET_A_REMPLACER = 'XXXXXXXX';

/** « XXXXXXXX / Cabinet Criterimmo[ / résidence 25 rue Edith Cavell, 92400 Courbevoie] ». PUR. */
export function objetMailSyndic(syndic: string, residence: string | null | undefined): string {
  const r = (residence ?? '').trim();
  return [OBJET_A_REMPLACER, syndic.trim(), r === '' ? '' : `résidence ${r}`].filter((x) => x !== '').join(' / ');
}

/** La plage à sélectionner dans l'objet : « XXXXXXXX », toujours en tête. PUR. */
export function selectionObjet(objet: string): [number, number] | null {
  const i = objet.indexOf(OBJET_A_REMPLACER);
  return i < 0 ? null : [i, i + OBJET_A_REMPLACER.length];
}

// ══ LE CORPS ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** Ce qu'on sait du bien. Tout est facultatif : chaque élément n'apparaît que s'il est renseigné. */
export interface BienDuMail {
  /** La nature de la fiche (« Appartement meublé », « Local commercial »…). */
  nature?: string | null;
  /** Le type de la fiche (« Type 2 », « Studio », « Garage »…). « Type N » donne le nombre de pièces. */
  typeBien?: string | null;
  /** Le nombre de pièces, quand la fiche le porte en propre (il l'emporte sur « Type N »). */
  pieces?: number | null;
  surfaceM2?: number | null;
  /** 0 = rez-de-chaussée. */
  etage?: number | null;
  /** Les numéros de lots DE COPROPRIÉTÉ (jamais le numéro WIPPIMMO). */
  lotsCopropriete?: readonly string[] | null;
}

/** Un locataire en place : « NOM Prénom · téléphone · e-mail ». */
export interface LocataireDuMail { nom: string; telephone?: string | null; email?: string | null }

export interface DonneesMailSyndic {
  /** Les destinataires en « À » au moment de l'ouverture. */
  destinataires: readonly DestinataireAppel[];
  /** `null` = hors fiche bien (écran « Syndics ») : la formule d'appel seule. */
  bien: null | {
    /** « NOM Prénom » tels qu'en base, un par propriétaire. */
    proprietaires: readonly string[];
    descriptif: BienDuMail;
    locataires: readonly LocataireDuMail[];
  };
}

const propre = (x: string | null | undefined): string => (x ?? '').trim();

/** Ce qui suit « Concernant » : « un appartement meublé de 2 pièces de 62 m² », sans rien d'inventé. PUR. */
function designationDuBien(d: BienDuMail): { texte: string; feminin: boolean } {
  let nature = propre(d.nature);
  if (/^a renseigner$/i.test(nature)) nature = '';
  const type = propre(d.typeBien);
  const typeN = /^type\s*(\d+)$/i.exec(type);
  // « Studio » dit mieux le bien qu'« appartement » : on le substitue au nom, en gardant « meublé ».
  if (/^studio$/i.test(type) && /^appartement/i.test(nature)) nature = nature.replace(/^appartement/i, 'studio');
  else if (nature === '' && /^studio$/i.test(type)) nature = 'studio';
  const nom = nature.toLowerCase();
  const pieces = d.pieces != null && d.pieces > 0 ? d.pieces : typeN ? Number(typeN[1]) : null;
  const feminin = /^maison/.test(nom);
  const morceaux: string[] = [];
  if (nom !== '') morceaux.push(`${feminin ? 'une' : 'un'} ${nom}`);
  if (pieces !== null && pieces > 0) morceaux.push(`${nom === '' ? 'un bien ' : ''}de ${pieces} pièce${pieces > 1 ? 's' : ''}`);
  if (d.surfaceM2 != null && d.surfaceM2 > 0) {
    morceaux.push(`${morceaux.length === 0 ? 'un bien ' : ''}de ${String(d.surfaceM2).replace('.', ',')} m²`);
  }
  return { texte: morceaux.join(' '), feminin };
}

/** « 4e étage », « 1er étage », « rez-de-chaussée ». PUR. */
export function etageLisible(etage: number): string {
  if (etage === 0) return 'rez-de-chaussée';
  return `${etage}${etage === 1 ? 'er' : 'e'} étage`;
}

/**
 * « Concernant un appartement de 3 pièces de 62 m², situé au 4e étage, lots de copropriété n° 219, 220. » PUR.
 * Chaque élément absent est omis, sans virgule orpheline. Rien du tout ⇒ `null` (la ligne n'est pas écrite).
 */
export function phraseDuBien(d: BienDuMail): string | null {
  const { texte, feminin } = designationDuBien(d);
  const suite: string[] = [];
  if (d.etage != null && Number.isInteger(d.etage) && d.etage >= 0) {
    const ou = etageLisible(d.etage);
    suite.push(`situé${feminin ? 'e' : ''} au ${ou}`);
  }
  const lots = (d.lotsCopropriete ?? []).map(propre).filter((x) => x !== '');
  if (lots.length > 0) suite.push(`lot${lots.length > 1 ? 's' : ''} de copropriété n° ${lots.join(', ')}`);
  if (texte === '' && suite.length === 0) return null;
  return `Concernant ${[texte === '' ? 'le bien' : texte, ...suite].join(', ')}.`;
}

/** « NOM Prénom · téléphone · e-mail », éléments absents omis. PUR. */
export function ligneLocataire(l: LocataireDuMail): string {
  return [propre(l.nom), propre(l.telephone), propre(l.email)].filter((x) => x !== '').join(' · ');
}

/**
 * LE CORPS, EN TEXTE BRUT. PUR. Une ligne vide entre deux blocs ; DEUX après la formule d'appel ; et le texte finit
 * par deux lignes vides — c'est là qu'Arno écrit la suite (la signature, s'il y en a une, vient dessous).
 */
export function corpsMailSyndic(d: DonneesMailSyndic): string {
  const formule = formuleAppelDestinataires(d.destinataires);
  if (d.bien === null) return `${formule}\n\n\n`;
  const proprios = d.bien.proprietaires.map(propre).filter((x) => x !== '');
  const blocs: string[] = [];
  const annonce = 'Je prends contact auprès de vous concernant la résidence dont vous êtes le syndic, en qualité de '
    + 'gestionnaire locatif pour le compte ';
  blocs.push(proprios.length === 1 ? `${annonce}du copropriétaire suivant :` : `${annonce}des copropriétaires suivants :`);
  blocs.push(proprios.length === 0 ? '(propriétaire non renseigné)' : proprios.join('\n'));
  const bien = phraseDuBien(d.bien.descriptif);
  if (bien !== null) blocs.push(bien);
  const locs = d.bien.locataires.map(ligneLocataire).filter((x) => x !== '');
  if (locs.length === 0) blocs.push('Logement actuellement vacant.');
  else {
    blocs.push(locs.length === 1
      ? 'Il est actuellement occupé par le locataire suivant :'
      : 'Il est actuellement occupé par les locataires suivants :');
    blocs.push(locs.join('\n'));
  }
  return `${formule}\n\n\n${blocs.join('\n\n')}\n\n\n`;
}

// ══ CE QUE L'ÉDITEUR REÇOIT ════════════════════════════════════════════════════════════════════════════════════════

const echapper = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Le corps en HTML, UNE LIGNE = UN PARAGRAPHE, et une ligne vide = un paragraphe vide. PUR.
 * ⚠️ `texteVersHtml` (htmlMail) fond les lignes vides consécutives en un seul saut de paragraphe : il perdrait les
 * « deux lignes vides » qu'Arno demande. On écrit donc chaque ligne telle quelle — c'est aussi la forme que
 * l'éditeur produit lui-même (`<p><br /></p>` pour une ligne vide).
 */
export function lignesVersHtml(texte: string): string {
  return texte.split('\n').map((l) => (l === '' ? '<p><br /></p>' : `<p>${echapper(l)}</p>`)).join('');
}

/**
 * LE BROUILLON PRÉ-REMPLI : objet, corps texte et corps HTML, signature dessous, et la plage de l'objet à sélectionner.
 * PUR. Le corps se termine par deux lignes vides ; la signature (s'il y en a une) commence juste après.
 */
export function brouillonMailSyndic(
  pret: { objet: string; selection: [number, number] | null; corps: string },
  signature: { texte?: string | null; html?: string | null },
): { objet: string; corps: string; corpsHtml: string; selectionObjet: [number, number] | null } {
  const sigTexte = (signature.texte ?? '').trim();
  const sigHtml = (signature.html ?? '').trim();
  // Le dernier morceau vide de « …\n\n\n » est la ligne où commence la signature : on ne l'écrit pas deux fois.
  const lignes = pret.corps.endsWith('\n') ? pret.corps.slice(0, -1) : pret.corps;
  const html = lignesVersHtml(lignes);
  return {
    objet: pret.objet,
    corps: `${pret.corps}${sigTexte}`,
    corpsHtml: sigHtml !== '' ? `${html}${sigHtml}` : sigTexte !== '' ? `${html}${lignesVersHtml(sigTexte)}` : html,
    selectionObjet: pret.selection,
  };
}

/**
 * LA DEMANDE D'ÉCRITURE → LE BROUILLON À OUVRIR. `base` est le « Nouveau message » adressé, tel qu'il s'ouvrait
 * avant ce lot. Une adresse seule le rend tel quel ; une adresse avec son syndic le pré-remplit par la route (lecture
 * seule). Lecture impossible ⇒ `base`, inchangé : on n'ouvre jamais un message vide d'adresse pour une panne.
 */
export async function preremplirDemande<B extends { objet: string; corps: string; corpsHtml?: string | null }>(
  demande: DemandeEcriture, base: B, signature: { texte?: string | null; html?: string | null },
  lire: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<B & { selectionObjet?: [number, number] | null }> {
  if (typeof demande === 'string') return base;
  const { syndicId, lotId } = demande.syndic;
  const params = new URLSearchParams({ a: demande.email });
  if (lotId !== null) params.set('lot', String(lotId));
  try {
    const res = await lire(`/api/admin/gestion/syndics/${syndicId}/mail?${params.toString()}`, { cache: 'no-store' });
    const j = (await res.json()) as { etat?: string; objet?: unknown; selection?: [number, number] | null; corps?: unknown };
    if (!res.ok || j.etat !== 'ok' || typeof j.objet !== 'string' || typeof j.corps !== 'string') return base;
    return { ...base, ...brouillonMailSyndic({ objet: j.objet, selection: j.selection ?? null, corps: j.corps }, signature) };
  } catch {
    return base;
  }
}
