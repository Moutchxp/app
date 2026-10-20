/**
 * ══ 🔴🔴 TUILE LOCATION — SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026). MODULE PUR. ═══════════════════════════
 *
 * « Faire sortir un ou plusieurs locataires d'un logement » :
 *   · UN BAIL = une entrée d'un ou plusieurs locataires sur un même lot à une même date (les occupations de ce lot qui
 *     partagent la date d'entrée) ;
 *   · une case par locataire du bail, TOUTES COCHÉES par défaut, décochables (rupture de couple : un seul reste) ;
 *   · une date de sortie OBLIGATOIRE, vide par défaut, une seule pour la sortie validée : jamais avant l'entrée d'un
 *     sortant, jamais dans le futur (le futur relève du préavis), jamais plus d'un an en arrière (décision du 18/10/2026) ;
 *   · « Le logement deviendra VACANT » si tous sortent (et que personne d'autre n'occupe le lot), sinon « Le logement
 *     reste loué à : … » ;
 *   · les annexes liées au même bail (cave, parking) SUIVENT le logement : l'occupation de l'annexe par un sortant est
 *     close à la même date.
 * 🔴 RIEN N'EST EFFACÉ : un sortant garde sa ligne, datée — il devient « locataire sortant » dans l'historique du bien.
 *
 * Ce module ne lit rien et n'écrit rien : règles, phrases et composition du mail (objet, texte, HTML).
 */

/** Un résultat de la recherche des occupants (en place à la date du jour). */
export interface OccupantTrouve {
  occupationId: number; locataireId: number; nom: string; telephone: string | null; email: string | null;
  lotId: number; adresse: string | null; etage: string | null; porte: string | null; proprietaire: string | null;
  /** En préavis : la date maximale de sortie (AAAA-MM-JJ) ; `null` sinon (ou sans la migration 383). */
  preavisDateMax?: string | null;
}

export interface LocataireDuBail {
  occupationId: number;
  locataireId: number;
  nom: string;
  /** AAAA-MM-JJ ou `null` (date d'entrée inconnue). */
  entree: string | null;
}

export interface AnnexeDuBail {
  lotId: number;
  libelle: string;
  /** Les occupations EN COURS de cette annexe par des locataires du bail (elles suivent le logement). */
  occupations: { occupationId: number; locataireId: number }[];
}

export interface BailLogement {
  lotId: number;
  adresse: string | null;
  type: string | null;
  etage: string | null;
  porte: string | null;
  proprietaire: string | null;
  /** Date d'entrée commune du bail (AAAA-MM-JJ) ou `null`. */
  entree: string | null;
  /** Les locataires EN PLACE de ce bail (sortie absente ou à venir). */
  locataires: LocataireDuBail[];
  annexes: AnnexeDuBail[];
  /** Les occupants en place du MÊME lot sous un AUTRE bail (rare) : le logement n'est alors jamais vacant. */
  autresOccupants: string[];
}

/** Une sortie enregistrée, corrigeable ou annulable par un geste dédié. */
export interface SortieEnregistree {
  lotId: number;
  adresse: string | null;
  /** AAAA-MM-JJ */
  sortie: string;
  entree: string | null;
  /** Les occupations closes ensemble (logement ET annexes), et les noms des sortants. */
  occupationIds: number[];
  noms: string[];
}

export const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Une date AAAA-MM-JJ VALIDE (le 31/02 n'existe pas). */
export function dateValide(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_ISO.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** La date la plus tardive acceptée : un an après aujourd'hui (AAAA-MM-JJ). PUR. */
/**
 * 🔴 DÉCISION D'ARNO DU 18/10/2026 : une date de sortie dans le FUTUR n'est plus possible — la sortie se saisit le jour où
 * elle est effective, ou après ; le futur relève du PRÉAVIS. Bornes : jamais après aujourd'hui, jamais plus d'un an en
 * arrière, jamais avant l'entrée. `dateMinSortie` = un an avant aujourd'hui.
 */
export function dateMinSortie(aujourdhui: string): string {
  const d = new Date(`${aujourdhui}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Un an après aujourd'hui — sert encore à borner un PRÉAVIS saisi à la main (jamais une sortie). */
export function dateMaxSortie(aujourdhui: string): string {
  const d = new Date(`${aujourdhui}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** « 19/10/2026 » depuis « 2026-10-19 ». */
export function dateFr(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m === null ? 'date inconnue' : `${m[3]}/${m[2]}/${m[1]}`;
}

/** Les cases cochées par défaut : TOUS les locataires du bail. */
export const casesParDefaut = (bail: Pick<BailLogement, 'locataires'>): number[] => bail.locataires.map((l) => l.occupationId);

/** Ce que la sortie laisse derrière elle : vacant, ou loué aux restants (et aux occupants d'un autre bail du lot). */
export function issueSortie(bail: Pick<BailLogement, 'locataires' | 'autresOccupants'>, sortants: readonly number[]): { vacant: boolean; restants: string[] } {
  const s = new Set(sortants);
  const restants = [...bail.locataires.filter((l) => !s.has(l.occupationId)).map((l) => l.nom), ...bail.autresOccupants];
  return { vacant: restants.length === 0, restants };
}

/** La phrase en clair, mise à jour selon les cases. */
export function phraseIssue(bail: Pick<BailLogement, 'locataires' | 'autresOccupants'>, sortants: readonly number[]): string {
  const i = issueSortie(bail, sortants);
  return i.vacant ? 'Le logement deviendra VACANT' : `Le logement reste loué à : ${i.restants.join(', ')}`;
}

export type VerdictSortie = { ok: true } | { ok: false; motif: string };

/** Le contrôle d'une sortie (le même à l'écran et dans la transaction). PUR. */
export function verifierSortie(
  bail: Pick<BailLogement, 'locataires'>, sortants: readonly number[], date: unknown, aujourdhui: string,
): VerdictSortie {
  if (sortants.length === 0) return { ok: false, motif: 'Cochez au moins un locataire qui sort.' };
  const parOcc = new Map(bail.locataires.map((l) => [l.occupationId, l]));
  if (sortants.some((o) => !parOcc.has(o))) {
    return { ok: false, motif: 'Un des locataires cochés n’est plus en place dans ce logement : rechargez la page.' };
  }
  if (date === null || date === undefined || date === '') return { ok: false, motif: 'La date de sortie est obligatoire.' };
  if (!dateValide(date)) return { ok: false, motif: 'La date de sortie n’est pas une date valide.' };
  if (date > aujourdhui) {
    return { ok: false, motif: 'La date de sortie ne peut pas être dans le futur : enregistrez plutôt un préavis.' };
  }
  if (date < dateMinSortie(aujourdhui)) {
    return { ok: false, motif: `La date de sortie ne peut pas remonter à plus d’un an (au plus tôt le ${dateFr(dateMinSortie(aujourdhui))}).` };
  }
  for (const o of sortants) {
    const l = parOcc.get(o)!;
    if (l.entree !== null && date < l.entree) {
      return { ok: false, motif: `La date de sortie ne peut pas être antérieure à la date d’entrée de ${l.nom} (${dateFr(l.entree)}).` };
    }
  }
  return { ok: true };
}

/** Le contrôle d'une CORRECTION de date (mêmes bornes : après l'entrée, au plus un an après aujourd'hui). PUR. */
export function verifierCorrection(entrees: readonly (string | null)[], date: unknown, aujourdhui: string): VerdictSortie {
  if (date === null || date === undefined || date === '') return { ok: false, motif: 'La nouvelle date de sortie est obligatoire.' };
  if (!dateValide(date)) return { ok: false, motif: 'La date de sortie n’est pas une date valide.' };
  if (date > aujourdhui) return { ok: false, motif: 'La date de sortie ne peut pas être dans le futur : enregistrez plutôt un préavis.' };
  if (date < dateMinSortie(aujourdhui)) return { ok: false, motif: 'La date de sortie ne peut pas remonter à plus d’un an.' };
  const max = entrees.filter((e): e is string => e !== null).sort().pop();
  if (max !== undefined && date < max) return { ok: false, motif: `La date de sortie ne peut pas être antérieure à la date d’entrée (${dateFr(max)}).` };
  return { ok: true };
}

/** La ligne d'un logement : « Appartement · 3e étage · porte G ». */
export function descriptionLogement(b: Pick<BailLogement, 'type' | 'etage' | 'porte'>): string {
  const etage = b.etage === null ? null : (/^-?\d+$/.test(b.etage)
    ? (Number(b.etage) === 0 ? 'rez-de-chaussée' : Number(b.etage) < 0 ? `sous-sol ${-Number(b.etage)}` : Number(b.etage) === 1 ? '1er étage' : `${b.etage}e étage`)
    : b.etage);
  return [b.type, etage, b.porte ? `porte ${b.porte}` : null].filter((x) => x !== null && x !== '').join(' · ') || 'Logement';
}

// ══ LE MAIL DE CONFIRMATION ══════════════════════════════════════════════════════════════════════════════════════════

export interface DonneesMailSortie {
  adresse: string | null;
  lotId: number;
  type: string | null; etage: string | null; porte: string | null;
  annexes: string[];
  proprietaire: string | null;
  sortants: { nom: string; entree: string | null; sortie: string }[];
  vacant: boolean;
  restants: string[];
  auteur: { nom: string; email: string | null };
  /** Instant de l'opération (ISO). */
  quand: string;
}

export function objetMailSortie(d: Pick<DonneesMailSortie, 'adresse' | 'lotId'>): string {
  return `Sortie de locataire — ${d.adresse ?? `Bien ${d.lotId}`}`;
}

/** La phrase mise en évidence. */
export function phraseMail(d: Pick<DonneesMailSortie, 'vacant' | 'restants'>): string {
  return d.vacant ? 'Le logement sera VACANT après ce départ' : `Le logement reste loué à ${d.restants.join(', ')}`;
}

function quandFr(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

export function texteMailSortie(d: DonneesMailSortie): string {
  const t: string[] = [objetMailSortie(d), '', phraseMail(d), ''];
  t.push('LOGEMENT', `- ${descriptionLogement(d)}`, `- Adresse : ${d.adresse ?? `Bien ${d.lotId}`}`);
  t.push(`- Annexes : ${d.annexes.length === 0 ? 'aucune' : d.annexes.join(', ')}`);
  t.push(`- Propriétaire : ${d.proprietaire ?? 'non renseigné'}`, '');
  t.push(d.sortants.length > 1 ? 'LOCATAIRES SORTANTS' : 'LOCATAIRE SORTANT');
  for (const s of d.sortants) t.push(`- ${s.nom} — entrée le ${dateFr(s.entree)} — sortie le ${dateFr(s.sortie)}`);
  t.push('', `Sortie enregistrée par ${d.auteur.nom}${d.auteur.email ? ` <${d.auteur.email}>` : ''} — ${quandFr(d.quand)}`);
  t.push('Mail automatique de l’application Sans Vis-à-Vis® — rien n’a été effacé : les sortants restent dans l’historique du bien.');
  return t.join('\n');
}

const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Le HTML : tableaux simples, styles en ligne, lisible au téléphone.
 * ⚠️ Couleurs écrites en clair : un mail n'a pas accès aux variables du thème de l'application (même règle que
 * `mailPortefeuille.ts`).
 */
export function htmlMailSortie(d: DonneesMailSortie): string {
  const rouge = '#a30402'; const encre = '#1a1f26'; const gris = '#5b6472'; const fond = '#f4f5f7'; const ligne = '#e3e6ea';
  const bloc = (titre: string, corps: string): string =>
    `<tr><td style="padding:14px 20px 4px"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${rouge}">${echapper(titre)}</div>${corps}</td></tr>`;
  const p = (s: string): string => `<div style="margin:6px 0 0;font-size:15px;line-height:1.45;color:${encre}">${s}</div>`;
  const petit = (s: string): string => `<div style="margin:2px 0 0;font-size:13px;line-height:1.45;color:${gris}">${s}</div>`;
  const evidence = `<div style="margin:8px 0 0;padding:12px;border-radius:8px;border:2px solid ${d.vacant ? rouge : '#1f7a45'};background:${d.vacant ? '#fdeceb' : '#e9f6ee'}">`
    + `<div style="font-size:18px;font-weight:800;color:${d.vacant ? rouge : '#1f7a45'}">${echapper(phraseMail(d))}</div></div>`;
  const sortants = d.sortants.map((s) => `<div style="margin:8px 0 0;padding:8px 12px;border:1px solid ${ligne};border-left:4px solid ${rouge};border-radius:8px">`
    + `<div style="font-size:15px;font-weight:700;color:${encre}">${echapper(s.nom)}</div>`
    + petit(`Entrée le ${echapper(dateFr(s.entree))} · sortie le <strong>${echapper(dateFr(s.sortie))}</strong>`) + '</div>').join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(objetMailSortie(d))}</title></head>`
    + `<body style="margin:0;padding:0;background:${fond};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${fond}"><tr><td align="center" style="padding:16px 8px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">`
    + `<tr><td style="background:${rouge};padding:16px 20px;color:#ffffff"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">Sans Vis-à-Vis® · Gestion locative</div>`
    + `<div style="margin-top:4px;font-size:20px;font-weight:800;line-height:1.25">Sortie de locataire</div>`
    + `<div style="margin-top:2px;font-size:15px">${echapper(d.adresse ?? `Bien ${d.lotId}`)}</div></td></tr>`
    + `<tr><td style="padding:14px 20px 0">${evidence}</td></tr>`
    + bloc('Logement', p(`<strong>${echapper(descriptionLogement(d))}</strong>`)
      + petit(`Adresse : ${echapper(d.adresse ?? `Bien ${d.lotId}`)}`)
      + petit(`Annexes : ${d.annexes.length === 0 ? 'aucune' : echapper(d.annexes.join(', '))}`)
      + petit(`Propriétaire : ${echapper(d.proprietaire ?? 'non renseigné')}`))
    + bloc(d.sortants.length > 1 ? 'Locataires sortants' : 'Locataire sortant', sortants)
    + bloc('Opération', petit(`Sortie enregistrée par <strong>${echapper(d.auteur.nom)}</strong>${d.auteur.email ? ` · ${echapper(d.auteur.email)}` : ''}`)
      + petit(echapper(quandFr(d.quand))))
    + `<tr><td style="padding:8px 20px 18px"></td></tr></table>`
    + `<div style="padding:10px;font-size:12px;color:${gris}">Mail automatique de l’application Sans Vis-à-Vis® — rien n’a été effacé : les sortants restent dans l’historique du bien.</div>`
    + `</td></tr></table></body></html>`;
}

// ══ L'ENCART « LE LOGEMENT » de l'écran de sortie (Arno, 19/10/2026) ═════════════════════════════════════════════════

/** Un lot concerné par le bail : le logement, puis ses annexes (cave, parking…). */
export interface LotEncart {
  lotId: number;
  role: 'logement' | 'annexe';
  /** Type lisible (« Appartement T3 », « Cave », « Parking intérieur »…). */
  type: string | null;
  etage: string | null;
  numLotCopro: string | null;
  /** N° de lot WIPPIMMO (jamais une clé `app-…`). */
  numeroLot: string | null;
  porte: string | null;
  /** Parking / box : la « porte » est une PLACE. */
  place: boolean;
}

/** Tout ce que la base sait d'un logement et de son bail ; `null` = absent (et alors NON affiché). */
export interface EncartLogement {
  lotId: number;
  adresse: string | null;
  type: string | null;
  meuble: boolean | null;
  etage: string | null;
  porte: string | null;
  numLotCopro: string | null;
  numeroLot: string | null;
  batiment: string | null;
  escalier: string | null;
  surfaceCarrez: number | null;
  surfaceHabitable: number | null;
  surface: number | null;
  surfaceExterieure: number | null;
  nombrePieces: number | null;
  ascenseur: boolean | null;
  digicode: boolean | null;
  digicodeCode: string | null;
  precisionAcces: string | null;
  dpeClasse: string | null;
  dpeDate: string | null;
  dpeNonSoumis: boolean | null;
  chauffage: string | null;
  epoqueConstruction: string | null;
  lots: LotEncart[];
  proprietaire: { id: number; nom: string } | null;
  syndic: string | null;
  bail: { entree: string | null; loyerHc: number | null; provisions: number | null; taux: number | null; base: string | null };
  /**
   * Arno (19/10/2026) — LES COORDONNÉES (téléphones, e-mails en vigueur) du propriétaire et des locataires du bail, pour le
   * bloc « Locataires en préavis » de l'accueil et le récapitulatif de l'état des lieux de sortie. Absent : non lues.
   */
  coordonnees?: {
    proprietaire: { telephones: string[]; emails: string[] } | null;
    locataires: { occupationId: number; locataireId: number; nom: string; telephones: string[]; emails: string[];
      /** Chaque téléphone avec son libellé (« Portable », « Fixe »…) quand il existe. */
      telephonesDetail?: { valeur: string; libelle: string | null }[] }[];
  };
}

const nombreFr = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const eurosFr = (n: number): string => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const present = (s: string | null | undefined): s is string => s !== null && s !== undefined && s.trim() !== '';

/** « 3e étage » / « rez-de-chaussée » / tel que saisi. */
export function etageFr(etage: string | null): string | null {
  if (!present(etage)) return null;
  if (!/^-?\d+$/.test(etage)) return etage;
  const n = Number(etage);
  return n === 0 ? 'rez-de-chaussée' : n < 0 ? `sous-sol ${-n}` : n === 1 ? '1er étage' : `${n}e étage`;
}

/** Une ligne lisible pour un lot du bail, sans aucune information absente. PUR. */
export function libelleLotEncart(l: LotEncart): string {
  return [
    l.type ?? (l.role === 'logement' ? 'Logement' : 'Annexe'),
    etageFr(l.etage),
    present(l.porte) ? `${l.place ? 'place' : 'porte'} ${l.porte}` : null,
    present(l.numLotCopro) ? `lot de copro n° ${l.numLotCopro}` : null,
    present(l.numeroLot) ? `lot n° ${l.numeroLot}` : null,
  ].filter((x): x is string => x !== null).join(' · ');
}

export interface LigneEncart { cle: string; libelle: string; valeur: string }

/**
 * Les lignes de l'encart, dans l'ordre de lecture — UNIQUEMENT celles dont la valeur est présente en base. Ni « — », ni
 * « non renseigné » : une information absente n'apparaît pas. (Les lots et le propriétaire, qui portent un lien ou une
 * liste, sont rendus à part.) PUR.
 */
export function lignesEncart(e: EncartLogement): LigneEncart[] {
  const l: (LigneEncart | null)[] = [];
  const bail = e.bail ?? { entree: null, loyerHc: null, provisions: null, taux: null, base: null };
  const ajouter = (cle: string, libelle: string, valeur: string | null): void => { l.push(valeur === null ? null : { cle, libelle, valeur }); };
  const type = [e.type, e.meuble === true ? 'meublé' : e.meuble === false ? 'nu (non meublé)' : null].filter(present).join(' · ');
  ajouter('type', 'Type', type === '' ? null : type);
  ajouter('etage', 'Étage', etageFr(e.etage));
  ajouter('porte', 'Porte', present(e.porte) ? e.porte : null);
  ajouter('batiment', 'Bâtiment', present(e.batiment) ? e.batiment : null);
  ajouter('escalier', 'Escalier', present(e.escalier) ? e.escalier : null);
  ajouter('copro', 'Lot de copropriété', present(e.numLotCopro) ? `n° ${e.numLotCopro}` : null);
  ajouter('lot', 'N° de lot', present(e.numeroLot) ? e.numeroLot : null);
  ajouter('carrez', 'Surface Carrez/Boutin m²', e.surfaceCarrez === null ? null : `${nombreFr(e.surfaceCarrez)} m²`);
  ajouter('habitable', 'Surface habitable', e.surfaceHabitable === null ? null : `${nombreFr(e.surfaceHabitable)} m²`);
  ajouter('surface', 'Surface', e.surface === null ? null : `${nombreFr(e.surface)} m²`);
  ajouter('exterieure', 'Surface extérieure', e.surfaceExterieure === null ? null : `${nombreFr(e.surfaceExterieure)} m²`);
  ajouter('pieces', 'Pièces', e.nombrePieces === null ? null : String(e.nombrePieces));
  ajouter('ascenseur', 'Ascenseur', e.ascenseur === null ? null : e.ascenseur ? 'oui' : 'non');
  ajouter('digicode', 'Digicode', e.digicode === null ? (present(e.digicodeCode) ? e.digicodeCode : null)
    : e.digicode ? (present(e.digicodeCode) ? e.digicodeCode : 'oui') : 'non');
  ajouter('acces', 'Accès', present(e.precisionAcces) ? e.precisionAcces : null);
  ajouter('dpe', 'DPE', e.dpeNonSoumis === true ? 'non soumis'
    : present(e.dpeClasse) ? `classe ${e.dpeClasse}${present(e.dpeDate) ? ` (${dateFr(e.dpeDate)})` : ''}` : null);
  ajouter('chauffage', 'Chauffage', present(e.chauffage) ? e.chauffage : null);
  ajouter('epoque', 'Construction', present(e.epoqueConstruction) ? e.epoqueConstruction : null);
  ajouter('syndic', 'Syndic', present(e.syndic) ? e.syndic : null);
  ajouter('entree', 'Entrée dans les lieux', present(bail.entree) ? dateFr(bail.entree) : null);
  ajouter('loyer', 'Loyer d’origine', bail.loyerHc === null ? null : `${eurosFr(bail.loyerHc)} / mois hors charges`);
  ajouter('provisions', 'Provisions sur charges', bail.provisions === null ? null : `${eurosFr(bail.provisions)} / mois`);
  // Arno (18/10/2026) : le TAUX DE GESTION n'est PAS affiché dans cet encart (écran de sortie). Il reste en base et sur les
  // écrans qui le montrent (fiche bien / locataire — `LocationCarte`, « Honoraires de gestion »).
  return l.filter((x): x is LigneEncart => x !== null);
}

// ══ LA CONFIRMATION RÉDUITE de l'écran de sortie (Arno, 18/10/2026) ═════════════════════════════════════════════════

/**
 * Pourquoi « Confirmer la sortie » est désactivé — `null` quand la date est acceptable. Les MÊMES bornes que
 * `verifierSortie` (que le serveur applique toujours) : obligatoire, jamais avant l'entrée d'un sortant, au plus un an. PUR.
 */
export function messageDateSortie(sortants: readonly Pick<LocataireDuBail, 'entree'>[], date: string, aujourdhui: string): string | null {
  if (date.trim() === '') return 'Saisissez la date de sortie';
  if (!dateValide(date)) return 'Saisissez une date de sortie valide';
  const entree = sortants.map((l) => l.entree).filter((e): e is string => e !== null).sort().pop();
  if (entree !== undefined && date < entree) return `La date ne peut pas précéder l’entrée du ${dateFr(entree)}`;
  if (date > aujourdhui) return 'La date ne peut pas être dans le futur : enregistrez un préavis';
  if (date < dateMinSortie(aujourdhui)) return 'La date ne peut pas remonter à plus d’un an';
  return null;
}

/** « Il restera 1 locataire dans le logement » / « Il restera 2 locataires dans le logement ». PUR. */
export const phraseRestants = (n: number): string => `Il restera ${n} locataire${n > 1 ? 's' : ''} dans le logement`;
