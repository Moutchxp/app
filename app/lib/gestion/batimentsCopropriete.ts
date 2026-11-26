/**
 * ══ 🔴🔴 LES BÂTIMENTS D'UNE COPROPRIÉTÉ (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 3). MODULE PUR. ══════════════════════════════
 *
 * Une nomenclature COMMUNE à toute la copropriété et à toutes ses adresses : le premier bâtiment créé en LETTRE impose les lettres (A, B, C…),
 * le premier en CHIFFRE impose les chiffres (1, 2, 3…) ; le mélange est refusé avec un message clair. Les intitulés LIBRES (« Côté cour »,
 * « Côté rue »…) sont permis en plus, ne fixent pas la règle, et sont proposés dans le menu. « Bât. B » = « B » = « bâtiment b ».
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
import { cleBatiment, libelleBatiment, majusculesBatiment } from '../location/digicodeImmeuble';

export type SorteBatiment = 'lettre' | 'chiffre' | 'libre';
export type Nomenclature = 'lettres' | 'chiffres';
export interface BatimentConnu { cle: string; libelle: string; sorte: SorteBatiment;
  /** 🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété ») l'adresse du bâtiment (clé d'une adresse de sa copropriété) ; absente / `null` : inconnue
   *  (à préciser, ou un bâtiment connu par un bien ou une valeur d'avant) */
  adresseCle?: string | null }

/** La sorte d'un intitulé : une lettre seule, un nombre seul, ou un intitulé libre. PUR. */
export function sorteBatiment(brut: string | null | undefined): SorteBatiment | null {
  const k = cleBatiment(brut);
  if (k === '') return null;
  if (/^[a-z]$/.test(k)) return 'lettre';
  if (/^\d{1,3}$/.test(k)) return 'chiffre';
  return 'libre';
}

/** Un bâtiment propre (clé, libellé affiché, sorte), ou `null` (vide). PUR. */
export function batimentDe(brut: string | null | undefined): BatimentConnu | null {
  const sorte = sorteBatiment(brut);
  const libelle = libelleBatiment(brut);
  return sorte === null || libelle === null ? null : { cle: cleBatiment(brut), libelle, sorte };
}

/**
 * La règle de la copropriété : celle qui est enregistrée ; à défaut, celle des bâtiments déjà connus s'ils sont tous lettres ou tous chiffres
 * (des bâtiments anciens mélangés ne fixent rien). PUR.
 */
export function nomenclatureDe(enregistree: Nomenclature | null, connus: readonly Pick<BatimentConnu, 'sorte'>[]): Nomenclature | null {
  if (enregistree !== null) return enregistree;
  const l = connus.some((b) => b.sorte === 'lettre');
  const c = connus.some((b) => b.sorte === 'chiffre');
  return l && !c ? 'lettres' : c && !l ? 'chiffres' : null;
}

export const MOTIF_LETTRES = 'Cette copropriété nomme ses bâtiments par des LETTRES (A, B, C…) : utilisez une lettre, ou un intitulé libre (« Côté cour »).';
export const MOTIF_CHIFFRES = 'Cette copropriété numérote ses bâtiments par des CHIFFRES (1, 2, 3…) : utilisez un chiffre, ou un intitulé libre (« Côté cour »).';
export const MOTIF_TOUS_LIBRES = 'Les autres bâtiments de cette copropriété ont des intitulés personnalisés : confirmez cet intitulé en lettre ou en chiffre dans la fenêtre d’avertissement.';

/**
 * ══ 🔴🔴 Arno (16/11/2026, lot D) — LE MÉLANGE N'EST PLUS REFUSÉ, IL EST AVERTI ════════════════════════════════════════════════════════════════
 * On peut mettre le nom de bâtiment qu'on veut. Un NOUVEAU bâtiment en lettre ou en chiffre qui ne suit pas la numérotation en place (un chiffre
 * parmi des lettres, ou l'inverse), ou qui arrive alors que tous les autres ont des intitulés personnalisés, demande une CONFIRMATION (fenêtre
 * « Confirmer cet intitulé » / « Corriger ») ; un intitulé personnalisé, ou un nom qui suit la numérotation, n'en demande pas. La référence reste
 * celle déjà enregistrée (le premier bâtiment en lettre ou en chiffre) : une exception confirmée ne la change pas.
 */
export type RaisonAvertissement = 'autre_numerotation' | 'tous_libres';
export interface AvertissementBatiment { libelle: string; sorte: 'lettre' | 'chiffre'; raison: RaisonAvertissement; reference: Nomenclature | null; intitules: string[]; motif: string }

/** L'avertissement d'UN nouveau bâtiment (`null` : aucun). `reference` : la règle en place (enregistrée, ou fixée par le premier). PUR. */
export function avertissementBatiment(brut: string, reference: Nomenclature | null, connus: readonly BatimentConnu[]): AvertissementBatiment | null {
  const b = batimentDe(brut);
  if (b === null || b.sorte === 'libre' || connus.some((x) => x.cle === b.cle)) return null;
  const intitules = menuBatiments(connus).map((x) => x.libelle);
  if (reference !== null) {
    const suit = (reference === 'lettres' && b.sorte === 'lettre') || (reference === 'chiffres' && b.sorte === 'chiffre');
    return suit ? null : { libelle: b.libelle, sorte: b.sorte, raison: 'autre_numerotation', reference, intitules, motif: reference === 'lettres' ? MOTIF_LETTRES : MOTIF_CHIFFRES };
  }
  // aucune référence : les autres sont tous des intitulés personnalisés → on le dit ; rien du tout → le premier fixe la règle, sans fenêtre
  return connus.length > 0 && connus.every((x) => x.sorte === 'libre')
    ? { libelle: b.libelle, sorte: b.sorte, raison: 'tous_libres', reference: null, intitules, motif: MOTIF_TOUS_LIBRES } : null;
}

/**
 * Les nouveaux bâtiments d'une saisie, dans l'ordre : chacun avec son avertissement éventuel. Le PREMIER en lettre ou en chiffre fixe la
 * référence s'il n'y en avait pas (et s'il n'est pas lui-même une exception) ; une exception confirmée ne la change pas. PUR.
 */
export function avertissementsDesBatiments(bruts: readonly string[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): { libelle: string; avertissement: AvertissementBatiment | null }[] {
  let reference = nomenclature;
  const vus = [...connus];
  return bruts.map((brut) => {
    const avertissement = avertissementBatiment(brut, reference, vus);
    const b = batimentDe(brut);
    if (b !== null) {
      if (reference === null && avertissement === null && b.sorte !== 'libre') reference = b.sorte === 'lettre' ? 'lettres' : 'chiffres';
      if (!vus.some((x) => x.cle === b.cle)) vus.push(b);
    }
    return { libelle: brut, avertissement };
  });
}

/**
 * ══ 🔴🔴 Arno (18/11/2026) — LA NUMÉROTATION EST COMMUNE À UNE MÊME ADRESSE ══════════════════════════════════════════════════════════════════════
 * « Dans une copropriété, la nomenclature des bâtiments est commune à une même adresse, en lettres OU en chiffres. » ; « deux adresses différentes de
 * la même copropriété → numérotations indépendantes ». Quand les bâtiments sont rangés par adresse (490) et que la copropriété a PLUSIEURS adresses,
 * chaque adresse a sa référence, tirée de SES bâtiments (la règle enregistrée pour la copropriété, fixée par le premier bâtiment créé à n'importe
 * laquelle de ses adresses, ne s'impose plus aux autres). Une seule adresse, ou sans la 490 : la règle de la copropriété, comme avant. PUR.
 */
export const adressesIndependantes = (fiche: { batimentsParAdresse?: boolean; adresses?: readonly unknown[] } | null | undefined): boolean =>
  fiche?.batimentsParAdresse === true && (fiche.adresses?.length ?? 0) > 1;

/** Les bâtiments connus d'UNE adresse quand les adresses sont indépendantes ; sinon ceux de toute la copropriété. PUR. */
export const connusPourAdresse = (connus: readonly BatimentConnu[], adresseCle: string, independantes: boolean): BatimentConnu[] =>
  independantes ? connus.filter((c) => c.adresseCle === adresseCle) : [...connus];

/** La référence de numérotation d'une adresse (voir l'encadré). `effective` : la règle de la copropriété (enregistrée, ou tirée de ses bâtiments). PUR. */
export function nomenclatureDeLAdresse(effective: Nomenclature | null, connus: readonly BatimentConnu[], adresseCle: string, independantes: boolean): Nomenclature | null {
  return independantes ? nomenclatureDe(null, connusPourAdresse(connus, adresseCle, true)) : nomenclatureDe(effective, connus);
}

/**
 * ══ 🔴🔴 Arno (18/11/2026) — LES BÂTIMENTS CRÉÉS PENDANT LA SAISIE COMPTENT ══════════════════════════════════════════════════════════════════════
 * CONSTAT (recette, « Nouveau bien », 43 Avenue Marceau) : A et B créés pendant la saisie (« nouveau — enregistré avec le bien »), puis « 3 » tapé dans
 * « Bâtiment / cage d'escalier » : aucune fenêtre. CAUSE : le champ du bien jugeait le nouveau nom par la seule règle venue de la base (aucune ici) —
 * `avertissementBatiment` sans référence ne dit rien (« le premier fixe la règle »). DÉSORMAIS : l'avertissement d'un nouveau nom se calcule APRÈS les
 * bâtiments créés pendant la saisie, dans leur ordre de création : le premier d'entre eux fixe la règle s'il n'y en avait pas (comme dans la fiche
 * Copropriété), et « 3 » après A et B ouvre la fenêtre. PUR.
 */
export function avertissementApresSaisie(brut: string, reference: Nomenclature | null, connus: readonly BatimentConnu[], enAttente: readonly string[]): AvertissementBatiment | null {
  const cle = batimentDe(brut)?.cle;
  const vus = new Set<string>();
  const avant = enAttente.filter((x) => {
    const k = batimentDe(x)?.cle;
    if (k === undefined || k === cle || vus.has(k)) return false;
    vus.add(k); return true;
  });
  const av = avertissementsDesBatiments([...avant, brut], reference, connus);
  return av[av.length - 1].avertissement;
}

/**
 * Les nouveaux bâtiments d'une saisie, rangés dans l'ORDRE DE CRÉATION à l'écran (`ordre` : les intitulés créés, du premier au dernier) — l'ordre où
 * l'écran a jugé chacun ; un nom absent de l'ordre garde sa place, après. Sans ordre : la liste telle quelle (le comportement d'avant). PUR.
 */
export function selonOrdreDeCreation<T extends { libelle: string }>(nouveaux: readonly T[], ordre: readonly string[] | undefined): T[] {
  if (ordre === undefined || ordre.length === 0) return [...nouveaux];
  const rang = new Map<string, number>();
  ordre.forEach((x, i) => { const k = batimentDe(x)?.cle; if (k !== undefined && !rang.has(k)) rang.set(k, i); });
  const r = (x: T): number => rang.get(batimentDe(x.libelle)?.cle ?? '') ?? Number.MAX_SAFE_INTEGER;
  return nouveaux.map((x, i) => ({ x, i })).sort((a, b) => r(a.x) - r(b.x) || a.i - b.i).map((y) => y.x);
}

/** Le refus du SERVEUR (`null` : permis) : un nom vide, ou un avertissement que l'écran n'a pas fait confirmer. PUR. */
export function refusDesBatiments(nouveaux: readonly { libelle: string; confirme?: boolean }[], nomenclature: Nomenclature | null, connus: readonly BatimentConnu[]): string | null {
  if (nouveaux.some((x) => batimentDe(x.libelle) === null)) return 'Donnez un nom au bâtiment ou à la cage d’escalier.';
  const av = avertissementsDesBatiments(nouveaux.map((x) => x.libelle), nomenclature, connus);
  const manque = av.find((x, i) => x.avertissement !== null && nouveaux[i].confirme !== true);
  return manque?.avertissement?.motif ?? null;
}

/** Le menu sous le champ du bâtiment : lettres et chiffres dans l'ordre, puis les intitulés libres ; sans doublon. PUR. */
export function menuBatiments(connus: readonly BatimentConnu[]): BatimentConnu[] {
  // 🔴 (Arno, 26/11/2026, 12h23) un intitulé existant s'affiche en MAJUSCULES dans le menu (la base n'est corrigée qu'au prochain enregistrement)
  const uniques = [...new Map(connus.map((b) => [b.cle, { ...b, libelle: majusculesBatiment(b.libelle) }])).values()];
  const rang = (b: BatimentConnu): number => (b.sorte === 'libre' ? 1 : 0);
  return uniques.sort((a, b) => rang(a) - rang(b) || a.libelle.localeCompare(b.libelle, 'fr', { numeric: true, sensitivity: 'base' }));
}

/** 🔴 (Arno, 17/11/2026 : « « Bâtiment / cage » et « Escalier » traitent la même information ») le libellé du champ unique. */
export const LIBELLE_BATIMENT_CAGE = 'Bâtiment / cage d’escalier';

/**
 * Ce que les fiches, mails et documents AFFICHENT désormais à la place de « Bâtiment » et « Escalier » : le bâtiment / cage du bien (son texte
 * « Bâtiment », écrit avec le lien sûr vers le registre de la copropriété), avec repli sur l'ANCIEN escalier s'il n'y en a pas. PUR.
 */
export function batimentOuCage(b: { batiment?: string | null; escalier?: string | null }): string | null {
  const bat = (b.batiment ?? '').trim();
  if (bat !== '') return bat;
  const esc = (b.escalier ?? '').trim();
  return esc === '' ? null : esc;
}
