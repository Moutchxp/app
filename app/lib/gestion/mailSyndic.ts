/**
 * ══ 🔴🔴 LOT MAIL-SYNDIC-PREREMPLI — LE MAIL AU SYNDIC, DÉJÀ ÉCRIT. PUR. ═════════════════════════════════════════════
 *
 * ARNO (11/10/2026) : « Écrire depuis gestion@ » (fiche syndic, contacts du syndic, carnet de l'immeuble, e-mail
 * générique) ouvre la rédaction DÉJÀ PRÉ-REMPLIE quand on part d'une fiche bien. Rien n'est envoyé.
 *
 *   · l'OBJET : « Arnaud JOREL / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie » — le nom du
 *     compte CONNECTÉ, surligné en rouge à l'écran (jamais sélectionné : taper ne l'efface pas) ;
 *   · le CORPS : la formule d'appel (selon la civilité des destinataires en « À »), l'annonce (adresse du bien), les
 *     propriétaires, le bien et son occupation, puis deux lignes vides où Arno écrit la suite.
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

/**
 * D'où vient l'adresse cliquée : le bien d'où l'on écrit (`null` = d'aucun bien, écran « Syndics ») et, depuis une
 * fiche syndic, ce syndic. LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS : le bien voyage aussi depuis une carte
 * client de la fiche bien, sans syndic.
 */
export interface ContexteEcriture { lotId: number | null; syndicId?: number }

/** « Écrire depuis gestion@ » : l'adresse cliquée, et ce qu'on sait d'où l'on vient. */
export type EcrireDepuisGestionFn = (email: string, contexte?: ContexteEcriture) => void;

/** Ce que l'écran transmet à la boîte : une adresse seule (comme avant), ou une adresse et son contexte. */
export type DemandeEcriture = string | { email: string; contexte: ContexteEcriture };

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

/**
 * 🔴 LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE — LE NOM DE NOTRE CABINET, EN DUR. C'est NOUS qui écrivons : l'objet
 * porte notre nom, jamais celui du syndic à qui l'on écrit (CE QU'IL FAISAIT AVANT : « XXXXXXXX / TEST ARNAUD / … »,
 * le nom du syndic). Texte fixe voulu par Arno.
 */
export const NOM_NOTRE_CABINET = 'Cabinet Criterimmo';

/**
 * ══ 🔴🔴 LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET — LE NOM DU COLLÈGUE CONNECTÉ, À LA PLACE DE « XXXXXXXX » ══════
 * « Prénom NOM » du compte administrateur CONNECTÉ (« Arnaud JOREL »), le nom en capitales. Un compte sans nom ⇒ `null`
 * (l'objet commence alors par « Cabinet Criterimmo », sans préfixe). Un seul des deux renseigné : celui-là. PUR.
 */
export function nomDuCompte(prenom: string | null | undefined, nom: string | null | undefined): string | null {
  const texte = [(prenom ?? '').trim(), (nom ?? '').trim().toLocaleUpperCase('fr-FR')].filter((x) => x !== '').join(' ');
  return texte === '' ? null : texte;
}

/** « Arnaud JOREL / Cabinet Criterimmo[ / résidence 25 rue Edith Cavell, 92400 Courbevoie] ». PUR. */
export function objetMailSyndic(residence: string | null | undefined, nomCompte: string | null = null): string {
  const r = (residence ?? '').trim();
  return [(nomCompte ?? '').trim(), NOM_NOTRE_CABINET, r === '' ? '' : `résidence ${r}`].filter((x) => x !== '').join(' / ');
}

/**
 * La plage de l'objet à SURLIGNER à l'écran : le nom du compte, en tête. Ce n'est PAS une sélection (taper ne l'efface
 * pas) et l'objet envoyé reste du texte brut. Aucun nom, ou objet qui ne commence pas par lui ⇒ `null`. PUR.
 */
export function surlignageObjet(objet: string, nomCompte: string | null): [number, number] | null {
  const n = (nomCompte ?? '').trim();
  return n !== '' && objet.startsWith(n) ? [0, n.length] : null;
}

/**
 * Le surlignage SUIT la frappe. Entre l'objet d'avant et celui d'après, une seule zone a changé (préfixe et suffixe
 * communs) : avant la plage ⇒ elle glisse ; dedans ou à son bord ⇒ elle s'étire ou se resserre ; après ⇒ intacte.
 * Le nom entièrement effacé ⇒ `null` (le surlignage disparaît). PUR.
 */
export function suivreSurlignage(avant: string, apres: string, plage: [number, number] | null): [number, number] | null {
  if (plage === null || avant === apres) return plage;
  let debut = 0;
  const max = Math.min(avant.length, apres.length);
  while (debut < max && avant[debut] === apres[debut]) debut += 1;
  let fin = 0;
  while (fin < max - debut && avant[avant.length - 1 - fin] === apres[apres.length - 1 - fin]) fin += 1;
  const finAvant = avant.length - fin;          // la zone remplacée : [debut, finAvant) dans `avant`
  const delta = apres.length - avant.length;
  const [s, e] = plage;
  let ns: number; let ne: number;
  if (finAvant <= s) { ns = s + delta; ne = e + delta; }                    // tout AVANT le nom : il glisse
  else if (debut > e || (debut === e && finAvant > e)) { ns = s; ne = e; }  // tout APRÈS : intact
  else { ns = Math.min(s, debut); ne = Math.max(e, finAvant) + delta; }    // DANS le nom (ou tapé à sa fin) : il suit
  ns = Math.max(0, ns); ne = Math.min(apres.length, ne);
  return ne > ns ? [ns, ne] : null;
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
    /**
     * LOT MAIL-PREREMPLI-TEXTE-B — l'adresse du bien d'où l'on écrit (« 25 rue Edith Cavell, 92400 Courbevoie »), telle
     * que la carte du bien l'affiche, adresse secondaire comprise. Absente ⇒ « …dans la résidence dont vous êtes… ».
     */
    adresse?: string | null;
    /** « NOM Prénom » tels qu'en base, un par propriétaire. */
    proprietaires: readonly string[];
    descriptif: BienDuMail;
    locataires: readonly LocataireDuMail[];
  };
}

const propre = (x: string | null | undefined): string => (x ?? '').trim();

/** « un appartement meublé de 2 pièces de 62 m² », sans rien d'inventé. PUR. */
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
  // LOT MAIL-PREREMPLI-TEXTE-B — sans nature, le bien se dit « un logement » (le mot d'Arno quand rien n'est connu).
  if (pieces !== null && pieces > 0) morceaux.push(`${nom === '' ? 'un logement ' : ''}de ${pieces} pièce${pieces > 1 ? 's' : ''}`);
  if (d.surfaceM2 != null && d.surfaceM2 > 0) {
    morceaux.push(`${morceaux.length === 0 ? 'un logement ' : ''}de ${String(d.surfaceM2).replace('.', ',')} m²`);
  }
  return { texte: morceaux.join(' '), feminin };
}

/** « 4e étage », « 1er étage », « rez-de-chaussée ». PUR. */
export function etageLisible(etage: number): string {
  if (etage === 0) return 'rez-de-chaussée';
  return `${etage}${etage === 1 ? 'er' : 'e'} étage`;
}

/**
 * ══ LOT MAIL-PREREMPLI-TEXTE-B — CE QUI SUIT « Il s'agit d' » ══════════════════════════════════════════════════════════
 * « un appartement de 3 pièces de 62 m², situé au 4e étage, lots de copropriété n° 219, 220 » : mêmes règles que la
 * phrase d'avant (type en minuscules, pièces, surface, étage, lots ; chaque élément absent omis, sans virgule
 * orpheline). Rien du tout ⇒ « un logement ». `feminin` accorde la suite (« une maison…, actuellement occupée »). PUR.
 */
export function descriptionDuBien(d: BienDuMail): { texte: string; feminin: boolean } {
  const { texte, feminin } = designationDuBien(d);
  const suite: string[] = [];
  if (d.etage != null && Number.isInteger(d.etage) && d.etage >= 0) {
    const ou = etageLisible(d.etage);
    suite.push(`situé${feminin ? 'e' : ''} au ${ou}`);
  }
  const lots = (d.lotsCopropriete ?? []).map(propre).filter((x) => x !== '');
  if (lots.length > 0) suite.push(`lot${lots.length > 1 ? 's' : ''} de copropriété n° ${lots.join(', ')}`);
  return { texte: [texte === '' ? 'un logement' : texte, ...suite].join(', '), feminin };
}

/** « NOM Prénom · téléphone · e-mail », éléments absents omis. PUR. */
export function ligneLocataire(l: LocataireDuMail): string {
  return [propre(l.nom), propre(l.telephone), propre(l.email)].filter((x) => x !== '').join(' · ');
}

/**
 * LE CORPS, EN TEXTE BRUT. PUR. Une ligne vide entre deux blocs ; DEUX après la formule d'appel ; et le texte finit
 * par deux lignes vides — c'est là qu'Arno écrit la suite (la signature, s'il y en a une, vient dessous).
 *
 * ══ 🔴🔴 LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET — LA VERSION B D'ARNO, À PARTIR DE LA DEUXIÈME LIGNE ════════════
 * ⛔ La première ligne (formule d'appel) et les deux lignes vides qui la suivent ne changent pas. Les contenus
 * automatiques (propriétaires, description, locataires et leurs coordonnées) sont les mêmes ; seuls les textes qui
 * les entourent changent :
 *   Le Cabinet Criterimmo assure la gestion locative d'un bien situé dans la résidence du <adresse>, dont vous êtes
 *   le syndic. Ce bien appartient à :
 *   <un propriétaire par ligne>
 *   Il s'agit d'<description>, actuellement occupé par :   |   Il s'agit d'<description>, actuellement vacant.
 *   <un locataire par ligne>
 */
export function corpsMailSyndic(d: DonneesMailSyndic): string {
  const formule = formuleAppelDestinataires(d.destinataires);
  if (d.bien === null) return `${formule}\n\n\n`;
  const proprios = d.bien.proprietaires.map(propre).filter((x) => x !== '');
  const adresse = propre(d.bien.adresse);
  const blocs: string[] = [];
  blocs.push(`Le ${NOM_NOTRE_CABINET} assure la gestion locative d'un bien situé dans la résidence `
    + `${adresse === '' ? '' : `du ${adresse}, `}dont vous êtes le syndic. Ce bien appartient à :`);
  blocs.push(proprios.length === 0 ? '(propriétaire non renseigné)' : proprios.join('\n'));
  const { texte, feminin } = descriptionDuBien(d.bien.descriptif);
  const locs = d.bien.locataires.map(ligneLocataire).filter((x) => x !== '');
  if (locs.length === 0) blocs.push(`Il s'agit d'${texte}, actuellement vacant${feminin ? 'e' : ''}.`);
  else {
    blocs.push(`Il s'agit d'${texte}, actuellement occupé${feminin ? 'e' : ''} par :`);
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
 * LE BROUILLON PRÉ-REMPLI : objet, corps texte et corps HTML, signature dessous, et la plage de l'objet à SURLIGNER
 * (le nom du compte — jamais sélectionnée). PUR. Le corps se termine par deux lignes vides ; la signature (s'il y en a
 * une) commence juste après.
 */
export function brouillonMailSyndic(
  pret: { objet: string; surlignage: [number, number] | null; corps: string },
  signature: { texte?: string | null; html?: string | null },
): { objet: string; corps: string; corpsHtml: string; surlignageObjet: [number, number] | null; curseurEnFinDObjet: true } {
  const sigTexte = (signature.texte ?? '').trim();
  const sigHtml = (signature.html ?? '').trim();
  // Le dernier morceau vide de « …\n\n\n » est la ligne où commence la signature : on ne l'écrit pas deux fois.
  const lignes = pret.corps.endsWith('\n') ? pret.corps.slice(0, -1) : pret.corps;
  const html = lignesVersHtml(lignes);
  return {
    objet: pret.objet,
    corps: `${pret.corps}${sigTexte}`,
    corpsHtml: sigHtml !== '' ? `${html}${sigHtml}` : sigTexte !== '' ? `${html}${lignesVersHtml(sigTexte)}` : html,
    surlignageObjet: pret.surlignage,
    // À l'ouverture : le curseur à la FIN de l'objet, rien de sélectionné (une fois, jamais rejoué).
    curseurEnFinDObjet: true,
  };
}

/** La formule écrite en tête du corps, et la civilité des contacts connus : de quoi la recalculer quand « À » change. */
export interface AppelAuto {
  /** La formule telle qu'elle est écrite (la première ligne du corps). */
  formule: string;
  /** adresse (minuscules) → civilité et nom de famille d'un contact connu. Absente = adresse non-contact. */
  civilites: Record<string, { civilite: Civilite | null; nom: string | null }>;
}

/** La formule d'appel pour ces destinataires en « À », d'après les civilités connues. PUR. */
export function formulePour(a: readonly string[], civilites: AppelAuto['civilites']): string {
  return formuleAppelDestinataires(a.map((x) => {
    const c = civilites[x.trim().toLowerCase()];
    return c === undefined ? null : { civilite: c.civilite, nom: c.nom };
  }));
}

/** Ce que le brouillon gagne à l'ouverture depuis une fiche (champs d'écran, jamais enregistrés tels quels). */
export interface Prerempli<G> {
  /** LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET — le nom du compte dans l'objet, surligné (champ d'écran). */
  surlignageObjet?: [number, number] | null;
  curseurEnFinDObjet?: boolean;
  /** Le bien d'origine, pré-coché dans le classement (même chemin que les biens cochés avant l'envoi). */
  cibles?: Array<{ sorte: 'lot'; cle: string | null; id: number | null; libelle: string; categorie?: 'logement' | 'parking' | 'cave' }>;
  /** Les adresses liées au bien, proposées dans À / Cc / Cci. */
  suggestionsBien?: G[] | null;
  appel?: AppelAuto | null;
  /** LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE — écrit depuis une fiche bien : le Drive s'ouvre sur son dossier. */
  depuisLeBien?: boolean;
  dossierDriveBien?: { id: string; nom: string } | null;
}

const lireJson = async (
  lire: (url: string, init?: RequestInit) => Promise<Response>, url: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const res = await lire(url, { cache: 'no-store' });
    const j = (await res.json()) as Record<string, unknown>;
    return res.ok && j.etat === 'ok' ? j : null;
  } catch {
    return null;
  }
};

/**
 * LA DEMANDE D'ÉCRITURE → LE BROUILLON À OUVRIR. `base` est le « Nouveau message » adressé, tel qu'il s'ouvrait
 * avant ces lots. Une adresse seule le rend tel quel. Avec un contexte, deux lectures (en lecture seule, en parallèle) :
 *   · depuis une fiche SYNDIC : objet, formule d'appel et corps pré-remplis (lot MAIL-SYNDIC-PREREMPLI) ;
 *   · depuis une fiche BIEN : le bien d'origine pré-coché et les adresses du bien proposées (lot
 *     MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS).
 * Une lecture impossible n'empêche jamais d'écrire : ce qu'elle aurait apporté manque, le reste est là.
 */
export async function preremplirDemande<B extends { objet: string; corps: string; corpsHtml?: string | null; cibles?: unknown[] }, G = unknown>(
  demande: DemandeEcriture, base: B, signature: { texte?: string | null; html?: string | null },
  lire: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<B & Prerempli<G>> {
  if (typeof demande === 'string') return base as B & Prerempli<G>;
  const { syndicId, lotId } = demande.contexte;
  const params = new URLSearchParams({ a: demande.email });
  if (lotId !== null) params.set('lot', String(lotId));
  const [s, b] = await Promise.all([
    syndicId === undefined ? null : lireJson(lire, `/api/admin/gestion/syndics/${syndicId}/mail?${params.toString()}`),
    lotId === null ? null : lireJson(lire, `/api/admin/gestion/biens/${lotId}/ecrire`),
  ]);
  // ⚠️ `B` est le brouillon de l'écran : ses champs d'écran (`cibles`, `suggestionsBien`, `appel`) sont ceux-ci.
  let out = { ...base } as B & Prerempli<G>;
  const civilites: AppelAuto['civilites'] = {};
  if (b !== null && Array.isArray(b.groupes)) {
    out.suggestionsBien = b.groupes as G[];
    out.depuisLeBien = true;
    const dd = b.dossierDrive as { id?: unknown; nom?: unknown } | null | undefined;
    out.dossierDriveBien = dd && typeof dd.id === 'string' && dd.id !== ''
      ? { id: dd.id, nom: typeof dd.nom === 'string' ? dd.nom : '' } : null;
    for (const g of b.groupes as Array<{ lignes?: Array<{ adresse: string; ton: string; civilite: Civilite | null; nomFamille: string | null }> }>) {
      for (const l of g.lignes ?? []) {
        // Une adresse sans personne derrière (e-mail général du syndic, « autre adresse ») n'est pas un contact.
        if (l.ton === 'neutre' || (l.civilite === null && l.nomFamille === null)) continue;
        civilites[l.adresse.trim().toLowerCase()] = { civilite: l.civilite, nom: l.nomFamille };
      }
    }
    const cible = b.cible as { cle: string; id: number; libelle: string; categorie?: 'logement' | 'parking' | 'cave' } | undefined;
    if (cible !== undefined && (base.cibles ?? []).length === 0) {
      out.cibles = [{ sorte: 'lot', cle: cible.cle, id: cible.id, libelle: cible.libelle, categorie: cible.categorie }];
    }
  }
  if (s !== null && typeof s.objet === 'string' && typeof s.corps === 'string') {
    Object.assign(civilites, (s.civilites ?? {}) as AppelAuto['civilites']);
    const rempli = brouillonMailSyndic(
      { objet: s.objet, surlignage: (s.surlignage as [number, number] | null) ?? null, corps: s.corps }, signature);
    out = { ...out, ...rempli, appel: { formule: s.corps.split('\n')[0], civilites } };
  }
  return out;
}
