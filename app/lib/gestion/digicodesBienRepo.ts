import { query, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { colonneExisteMemo } from '../location/sondeLocation';
import { batimentDe, nomenclatureDe, refusDesBatiments, type BatimentConnu, type Nomenclature } from './batimentsCopropriete';
import { immeubleDuBien, type DigicodesAdresseFiche } from './copropriete';
import { etatPlace, ficheCopropriete } from './coproprieteRepo';
import { premiereValeur, type DigicodesBienSaisis, type OrigineDigicode } from './digicodes';
import { digicodesDesAdresses, digicodesUnifiesDisponibles, ecrireDigicode, RefusDigicode, relierBienAuBatiment, type CoproprieteDuCode } from './digicodesRepo';
import { cleImmeuble } from './syndics';

/**
 * ══ 🔴🔴 LES DIGICODES DEPUIS LA FICHE DU BIEN EN LOCATION (Arno, 16/11/2026, « Digicodes unifiés », lot 4). IMPUR (base). ══════════════════
 *
 * La fiche du bien (création ET modification) lit et écrit LA MÊME base que la fiche Copropriété, par le MÊME chemin serveur (`ecrireDigicode`,
 * `relierBienAuBatiment`) et le MÊME composant d'écran : la place du bien dans sa copropriété (son « Immeuble », sinon son adresse), les codes
 * déjà connus (lus, « Corriger une erreur »), les bâtiments de toute la copropriété (menu, règle lettres / chiffres, avertissement). Ce qu'on
 * change d'un côté se voit aussitôt de l'autre. SANS LA 478 : `null`, la fiche garde sa saisie d'avant.
 */

export interface DigicodesPourBien {
  /** la place (adresse de la copropriété) du bien */
  adresseCle: string;
  /** ses digicodes, comme la fiche Copropriété les montre (le code commun et ceux des bâtiments, chacun avec son état) */
  adresse: DigicodesAdresseFiche;
  /** les bâtiments connus de TOUTE la copropriété (menu) et la règle effective */
  connus: BatimentConnu[];
  nomenclature: Nomenclature | null;
  /** la copropriété (pour « Corriger une erreur » / « Garder ce code » : la même route que la fiche Copropriété) */
  copropriete: CoproprieteDuCode;
  /** le bâtiment du bien : celui du lien sûr, sinon son texte « Bâtiment » ; son « Escalier » (pour proposer le bon choix) */
  batiment: string | null;
  batimentLie: boolean;
  escalier: string | null;
}

/** Les digicodes d'un bien existant (`lotId`), ou de la place d'un bien à créer (son adresse). `null` : sans la 478, ou sans adresse. LECTURE SEULE. */
export async function digicodesPourBien(o: { lotId: number } | { adresse: string; codePostal: string | null; commune: string | null }): Promise<DigicodesPourBien | null> {
  if (!(await digicodesUnifiesDisponibles())) return null;
  let immeuble: string;
  let cp: string | null; let commune: string | null; let batiment: string | null = null; let batimentLie = false; let escalier: string | null = null;
  if ('lotId' in o) {
    const lie = (await colonneExisteMemo('gestion_annuaire_lot', 'copropriete_batiment_id'))
      ? '(SELECT cb.batiment_libelle FROM gestion_copropriete_batiment cb WHERE cb.id = l.copropriete_batiment_id)' : 'NULL::text';
    const { rows } = await query<{ immeuble: string | null; adresse: string | null; cp: string | null; commune: string | null; batiment: string | null; escalier: string | null; lie: string | null }>(
      `SELECT l.immeuble, l.adresse, l.code_postal AS cp, l.commune, l.batiment, l.escalier, ${lie} AS lie FROM gestion_annuaire_lot l WHERE l.id = $1`, [o.lotId]);
    const l = rows[0];
    if (l === undefined) return null;
    immeuble = immeubleDuBien(l); cp = l.cp; commune = l.commune; escalier = l.escalier;
    batiment = l.lie ?? (batimentDe(l.batiment)?.libelle ?? null); batimentLie = l.lie !== null;
  } else {
    immeuble = o.adresse.trim(); cp = o.codePostal; commune = o.commune;
  }
  const adresseCle = cleImmeuble(immeuble);
  /* 🔴 (Arno, 17/11/2026 — l'écart du lot 4 : « Nouveau bien » montrait encore « Bâtiment » libre, « Digicode » Oui / Non et « Code » tant que
     l'adresse n'était pas saisie) : SANS ADRESSE, une place VIDE — le composant unique s'affiche quand même ; `null` ne veut plus dire que
     « base sans la 478 ». Les codes connus arrivent dès l'adresse choisie. */
  if (adresseCle === '') {
    return { adresseCle: '', adresse: { cle: '', voie: '', codePostal: cp, commune, commun: { digicode: null, code: null }, batiments: [] }, connus: [], nomenclature: null,
      copropriete: { cle: '', libelle: '', codePostal: cp, commune }, batiment, batimentLie, escalier };
  }
  const fiche = await ficheCopropriete(immeuble);
  const [d] = await digicodesDesAdresses([adresseCle]);
  const v = (p: typeof d.commun) => ({ digicode: p.code?.valeur.digicode ?? null, code: p.code?.valeur.code ?? null, etat: etatPlace(p), nbBiens: p.nbBiens });
  const voie = fiche?.adresses.find((a) => a.cle === adresseCle)?.libelle ?? immeuble;
  const adresse: DigicodesAdresseFiche = { cle: adresseCle, voie, codePostal: fiche?.adresses.find((a) => a.cle === adresseCle)?.codePostal ?? cp, commune: fiche?.adresses.find((a) => a.cle === adresseCle)?.commune ?? commune,
    commun: v(d.commun), batiments: d.batiments.map((b) => ({ cle: b.cle, libelle: b.libelle as string, ...v(b) })) };
  const connus = fiche?.batimentsConnus ?? d.batiments.map((b) => batimentDe(b.libelle)).filter((b): b is BatimentConnu => b !== null);
  return { adresseCle, adresse, connus, nomenclature: fiche?.nomenclatureEffective ?? nomenclatureDe(null, connus),
    copropriete: { cle: fiche?.cle ?? adresseCle, libelle: fiche?.libelle ?? immeuble, codePostal: fiche?.codePostal ?? cp, commune: fiche?.commune ?? commune },
    batiment, batimentLie, escalier };
}

/**
 * L'ÉCRITURE depuis la fiche du bien, DANS LA TRANSACTION DE L'APPELANT (création ou modification) : le bâtiment choisi (lien sûr + texte
 * « Bâtiment » ; un NOUVEAU bâtiment qui ne suit pas la numérotation exige la confirmation de l'écran, sinon refus clair) et la PREMIÈRE valeur
 * des places sans code connu (« saisie »). Un code connu ne se change pas d'ici (« Corriger une erreur », ou « Modifier »). Rend le refus, ou `null`.
 */
export async function ecrireDigicodesDuBien(q: RequeteTx, lotId: number, d: DigicodesBienSaisis, origine: Extract<OrigineDigicode, 'nouveau_bien' | 'fiche_bien'>,
  auteur: Auteur): Promise<string | null> {
  const { rows } = await q<{ immeuble: string | null; adresse: string | null; cp: string | null; commune: string | null; batiment: string | null }>(
    'SELECT immeuble, adresse, code_postal AS cp, commune, batiment FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  const l = rows[0];
  if (l === undefined) return 'Ce bien n’existe pas.';
  const immeuble = immeubleDuBien(l);
  const adresseCle = cleImmeuble(immeuble);
  if (adresseCle === '') return 'Ce bien n’a ni immeuble ni adresse : son digicode ne peut pas être rangé.';
  const fiche = await ficheCopropriete(immeuble);
  const copropriete: CoproprieteDuCode = { cle: fiche?.cle ?? adresseCle, libelle: fiche?.libelle ?? immeuble, codePostal: fiche?.codePostal ?? l.cp, commune: fiche?.commune ?? l.commune };
  const connus = fiche?.batimentsConnus ?? [];
  // ① le bâtiment : un NOUVEAU qui ne suit pas la numérotation demande la confirmation de l'écran (le même avertissement que la fiche Copropriété)
  if (d.batiment !== null) {
    const b = batimentDe(d.batiment);
    if (b === null) return 'Donnez un nom au bâtiment ou à la cage d’escalier.';
    if (!connus.some((x) => x.cle === b.cle)) {
      const refus = refusDesBatiments([{ libelle: d.batiment, confirme: d.batimentConfirme }], fiche?.nomenclatureEffective ?? nomenclatureDe(null, connus), connus);
      if (refus !== null) return refus;
    }
  }
  const lien = await relierBienAuBatiment(q, lotId, copropriete, d.batiment, auteur);
  if (!lien.ok) return lien.motif;
  // ⚠️ à partir d'ici, un refus est LEVÉ (la transaction est annulée : le lien ci-dessus ne reste pas écrit — piège `withTransaction`)
  const texte = d.batiment === null ? null : batimentDe(d.batiment)?.libelle ?? d.batiment;
  if ((l.batiment ?? null) !== texte) await q('UPDATE gestion_annuaire_lot SET batiment = $2 WHERE id = $1', [lotId, texte]);
  // ② les premières valeurs (places sans code connu)
  const adresseLibelle = fiche?.adresses.find((a) => a.cle === adresseCle)?.libelle ?? immeuble;
  for (const [batiment, c] of [[null, d.commun], [d.batiment, d.codeBatiment]] as const) {
    const valeur = premiereValeur(c);
    if (valeur === null) continue;
    const r = await ecrireDigicode(q, { adresseCle, adresseLibelle, batiment, valeur, nature: 'saisie', origine, lotId, copropriete }, auteur);
    if (!r.ok) throw new RefusDigicode(r.motif);
  }
  return null;
}

/**
 * Un « Bâtiment » RETAPÉ en texte (l'encart du bien, qui n'a pas le menu) : le lien sûr suit le bâtiment du MÊME NOM au registre de la
 * copropriété ; un nom inconnu du registre RETIRE le lien (le texte est gardé tel quel) — jamais un bâtiment créé sans le menu et son
 * avertissement. Journalisé dans l'historique du bien.
 */
export async function realignerBatimentDuBien(q: RequeteTx, lotId: number, texte: string | null, auteur: Auteur): Promise<void> {
  if (!(await colonneExisteMemo('gestion_annuaire_lot', 'copropriete_batiment_id'))) return;
  const { rows } = await q<{ immeuble: string | null; adresse: string | null; cp: string | null; commune: string | null }>(
    'SELECT immeuble, adresse, code_postal AS cp, commune FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  const l = rows[0];
  if (l === undefined) return;
  const immeuble = immeubleDuBien(l);
  const fiche = await ficheCopropriete(immeuble);
  const b = batimentDe(texte);
  const connu = b !== null && (fiche?.batimentsConnus ?? []).some((x) => x.cle === b.cle);
  const copropriete: CoproprieteDuCode = { cle: fiche?.cle ?? cleImmeuble(immeuble), libelle: fiche?.libelle ?? immeuble, codePostal: fiche?.codePostal ?? l.cp, commune: fiche?.commune ?? l.commune };
  await relierBienAuBatiment(q, lotId, copropriete, connu ? texte : null, auteur);
}
