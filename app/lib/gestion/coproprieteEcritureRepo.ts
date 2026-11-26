import { majusculesBatiment } from '../location/digicodeImmeuble';
import { conflitDeLAdresse, deplacerAdresse, type ConflitAdresse } from './adresseCoproExclusiviteRepo';
import { motifConflitNonConfirme, motifPrincipaleAilleurs, motifExclusiviteAdresse } from './adresseCoproExclusivite';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { detacherContactsDeLAncienSyndic } from './contactsSyndicCoproRepo';
import { registreParAdresse, reprendreSiRetire, retirerBatiment } from './batimentRetraitRepo';
import type { Auteur } from './gestes';
import { enregistrerContactsImmeuble } from './contactsImmeubleRepo';
import { conflitsDuRattachement, conflitsNonConfirmes, motifConflitParcelle, noterConflitParcelle, type ConflitAConfirmer } from './conflitParcelleRepo';
import { adresseImmeuble, cleImmeuble, nomAvecVille, validerContactsImmeuble, type AdresseSaisie, type ContactImmeubleSaisi } from './syndics';
import { ficheCopropriete, fiche476Disponible } from './coproprieteRepo';
import { adresseSansNumero, immeubleDuBien, motifSansNumero, type FicheCopropriete } from './copropriete';
import { adressesIndependantes, avertissementsDesBatiments, batimentDe, connusPourAdresse, nomenclatureDeLAdresse, refusDesBatiments, type BatimentConnu } from './batimentsCopropriete';
import { verifierAdresses } from './verificationAdresseRepo';
import { banIdDeLAdresse, formatUniqueDisponible } from '../adresse/adresseSaisieRepo';
import { noterRetraitDAdressesRegroupees } from './regroupementCoproprietesRepo';
import { journaliserLienSyndic } from './journalSyndicCopro';
import { annulerChangement, digicodesUnifiesDisponibles, ecrireDigicode, RefusDigicode, retirerDigicode } from './digicodesRepo';
import { validerChangements } from './digicodes';
import { depuisCoproprieteDisponible, enregistrerDigicodeDans } from '../location/digicodeImmeubleRepo';
import { verifierDigicode } from '../location/digicodeImmeuble';
import { agOfficiellesValides, ajouterAgOfficiellesDans } from '../location/agCoproprieteRepo';
import { arreteDisponible, ecrireArreteDans } from '../location/arreteComptesRepo';
import { verifierArrete, type ArreteComptes } from '../location/arreteComptes';

/**
 * ══ 🔴🔴 LA FICHE COPROPRIÉTÉ — L'ÉCRITURE (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 2). IMPUR (base). ═════════════════════════════
 *
 * La fiche se crée au PREMIER enregistrement (une copropriété connue seulement par ses biens). En UNE transaction, et TOUS LES REFUS AVANT TOUTE
 * ÉCRITURE (piège du dépôt : `withTransaction` valide au retour normal) :
 *   · le nom, « hors copropriété » (l'immeuble entier ; migration 476) ;
 *   · les adresses SECONDAIRES (liste entière) : les nouvelles ajoutées, les absentes RETIRÉES (`retire_le`, jamais effacées) ; une adresse qui est
 *     déjà une autre copropriété, ou l'adresse d'une autre, est REFUSÉE (même règle que la fiche syndic) ;
 *   · les habitants et gardiens (le carnet de l'immeuble, 333 — mêmes règles que la fiche syndic) ;
 *   · le SYNDIC (rattacher ou changer, depuis cette fiche comme depuis la fiche syndic) : le lien en cours est FERMÉ (« changement de syndic »),
 *     les gestionnaires de l'ancien syndic cessent de suivre la copropriété, le nouveau lien est ouvert ; un conflit de parcelle confirmé est noté ;
 *   · l'alerte « autres adresses de la même parcelle » marquée vue (une seule fois par copropriété).
 * Le digicode (par adresse, 396/399) et les AG (475) gardent leurs propres enregistrements.
 */

export interface SaisieCopropriete {
  immeuble: string;
  nom: string | null;
  horsCopropriete: boolean | null;
  adresses: AdresseSaisie[];
  contacts: ContactImmeubleSaisi[] | null;
  syndicId: number | null;
  /** 🔴 (Arno, 20/11/2026) « Retirer le syndic » (préparé) : à la validation, sans nouveau syndic, le lien en cours est fermé (« syndic retiré »). */
  retirerSyndic?: boolean;
  alerteParcelleVue: boolean;
  conflitsParcelle: { autre: string; parcelle: string | null }[];
  /** 🔴 (lot 3) les digicodes MODIFIÉS, par adresse de la copropriété : le commun (`undefined` : inchangé ; `''` : retiré) et ceux des bâtiments */
  digicodes: { cle: string; commun?: CodeSaisi; batiments: (CodeSaisi & { libelle: string; confirme: boolean })[] }[];
  /** 🔴 (16/11/2026, lot 6) « Même syndic : regrouper ? » — la copropriété (immeuble) que celle-ci REJOINT ; `null` : aucune */
  regrouperAvec: string | null;
  /** 🔴 (16/11/2026) les adresses SANS NUMÉRO confirmées à l'écran (« Confirmer »), par clé */
  sansNumeroConfirmees: string[];
  /** 🔴 (Arno, 26/11/2026, 11h58) les adresses secondaires « à vérifier » CONFIRMÉES à l'écran (« Confirmer cette adresse »), par clé — journalisées */
  adressesConfirmees?: string[];
  /** 🔴 (Arno, 26/11/2026, 12h50, point 2) les adresses d'une AUTRE copropriété dont le déplacement ici a été confirmé à l'écran (« Oui, la rattacher ici
   *  et la retirer de … »), par clé */
  deplacementsConfirmes?: string[];
}
/** Un code saisi : le code, ou « pas de digicode » (le « Non » d'avant). */
export interface CodeSaisi { code: string; aucun: boolean }

/** La saisie → la valeur du digicode : « pas de digicode » = Non ; un code = Oui + le code ; vide = rien de connu. PUR. */
export const valeurDuCode = (c: CodeSaisi): { digicode: boolean | null; code: string | null } =>
  (c.aucun ? { digicode: false, code: null } : c.code.trim() === '' ? { digicode: null, code: null } : { digicode: true, code: c.code.trim() });

const texte = (v: unknown, max = 300): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const nul = (s: string | null | undefined): string | null => ((s ?? '').trim() === '' ? null : (s ?? '').trim());

/** La saisie propre, ou le motif du refus. PUR. */
export function validerSaisieCopropriete(brut: unknown): { ok: true; saisie: SaisieCopropriete } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const immeuble = texte(b.immeuble);
  if (cleImmeuble(immeuble) === '') return { ok: false, motif: 'Copropriété non désignée.' };
  const adresses: AdresseSaisie[] = [];
  const vues = new Set<string>();
  for (const x of (Array.isArray(b.adresses) ? b.adresses.slice(0, 30) : [])) {
    const a = (x ?? {}) as Record<string, unknown>;
    const libelle = texte(a.libelle);
    const cle = cleImmeuble(libelle);
    if (cle === '' || vues.has(cle)) continue;
    vues.add(cle);
    // 🔴 (lot 7d) l'identifiant BAN du choix dans la liste, quand l'écran l'envoie (il n'est retenu que si la vérification le confirme)
    const banId = typeof a.banId === 'string' && /^[0-9A-Za-z_]{5,40}$/.test(a.banId) ? a.banId : null;
    adresses.push({ libelle, codePostal: texte(a.codePostal, 10), commune: texte(a.commune, 120), ...(banId !== null ? { banId } : {}) });
  }
  let contacts: ContactImmeubleSaisi[] | null = null;
  if (Array.isArray(b.contacts)) {
    const v = validerContactsImmeuble({ immeuble, contacts: b.contacts });
    if (!v.ok) return v;
    contacts = v.carnet.contacts;
  }
  const syndicId = typeof b.syndicId === 'number' && Number.isSafeInteger(b.syndicId) && b.syndicId > 0 ? b.syndicId : null;
  const conflitsParcelle = (Array.isArray(b.conflitsParcelle) ? b.conflitsParcelle.slice(0, 20) : [])
    .map((x) => (x ?? {}) as Record<string, unknown>).map((k) => ({ autre: texte(k.autre), parcelle: nul(texte(k.parcelle, 40)) })).filter((k) => cleImmeuble(k.autre) !== '');
  // 🔴🔴 (décision d'Arno, 26/11/2026) jamais coupé : un code de plus de MAX_CODE_DIGICODE caractères est REFUSÉ (verifierDigicode, plus bas)
  const code = (y: Record<string, unknown>): CodeSaisi => ({ code: typeof y.code === 'string' ? y.code.trim() : '', aucun: y.aucun === true });
  const digicodes = (Array.isArray(b.digicodes) ? b.digicodes.slice(0, 30) : []).map((x) => (x ?? {}) as Record<string, unknown>).map((d) => ({
    cle: cleImmeuble(texte(d.cle)), ...(typeof d.commun === 'object' && d.commun !== null ? { commun: code(d.commun as Record<string, unknown>) } : {}),
    batiments: (Array.isArray(d.batiments) ? d.batiments.slice(0, 40) : []).map((y) => (y ?? {}) as Record<string, unknown>)
      // 🔴 (Arno, 26/11/2026, 12h23) l'intitulé du bâtiment / de la cage en MAJUSCULES à l'enregistrement, accents gardés (la clé ne change pas)
      .map((y) => ({ libelle: majusculesBatiment(texte(y.libelle, 60)), ...code(y), confirme: y.confirme === true })) })).filter((d) => d.cle !== '');
  for (const d of digicodes) {
    for (const v of [...(d.commun !== undefined ? [d.commun] : []), ...d.batiments]) {
      const r = verifierDigicode(valeurDuCode(v));
      if (!r.ok) return r;
    }
    if (d.batiments.some((y) => batimentDe(y.libelle) === null)) return { ok: false, motif: 'Donnez un nom au bâtiment ou à la cage d’escalier.' };
  }
  return { ok: true, saisie: { immeuble, nom: nul(texte(b.nom, 200)), horsCopropriete: typeof b.horsCopropriete === 'boolean' ? b.horsCopropriete : null,
    adresses, contacts, syndicId, retirerSyndic: b.retirerSyndic === true, alerteParcelleVue: b.alerteParcelleVue === true, conflitsParcelle, digicodes,
    regrouperAvec: cleImmeuble(texte(b.regrouperAvec)) === '' ? null : texte(b.regrouperAvec),
    sansNumeroConfirmees: (Array.isArray(b.sansNumeroConfirmees) ? b.sansNumeroConfirmees.slice(0, 30) : []).map((x) => cleImmeuble(texte(x))).filter((x) => x !== ''),
    adressesConfirmees: (Array.isArray(b.adressesConfirmees) ? b.adressesConfirmees.slice(0, 30) : []).map((x) => cleImmeuble(texte(x))).filter((x) => x !== ''),
    deplacementsConfirmes: (Array.isArray(b.deplacementsConfirmes) ? b.deplacementsConfirmes.slice(0, 30) : []).map((x) => cleImmeuble(texte(x))).filter((x) => x !== '') } };
}

/** La copropriété (principale) d'une clé : la sienne, ou celle dont elle est une adresse en cours. */
async function coproDeCle(q: RequeteTx, cle: string): Promise<{ id: string; cle: string; libelle: string } | null> {
  const { rows } = await q<{ id: string; cle: string; libelle: string }>(
    `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle FROM gestion_copropriete c
      WHERE c.cle_immeuble = $1 OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL ORDER BY a.id LIMIT 1)
      ORDER BY (c.cle_immeuble <> $1) DESC, c.id LIMIT 1`, [cle]);
  return rows[0] ?? null;
}

/** L'enregistrement. Rend la fiche relue. */
export async function enregistrerCopropriete(brut: unknown, auteur: Auteur): Promise<{ ok: true; fiche: FicheCopropriete } | { ok: false; motif: string; conflitsParcelle?: ConflitAConfirmer[]; conflitAdresse?: ConflitAdresse }> {
  const v = validerSaisieCopropriete(brut);
  if (!v.ok) return v;
  const s = v.saisie;
  const lue = await ficheCopropriete(s.immeuble);
  if (lue === null) return { ok: false, motif: 'Cette copropriété n’est connue ni par un bien ni par une fiche : rechargez la page.' };
  const avec476 = await fiche476Disponible();
  if (s.horsCopropriete !== null && !avec476) return { ok: false, motif: '« Hors copropriété » demande la mise à jour de la base (migration 476) : rien n’est enregistré.' };
  // 🔴 (16/11/2026, option C) une NOUVELLE adresse doit être retrouvée dans la Base Adresse Nationale (locale, puis service national) : elle vient de
  // la parcelle ou des suggestions, jamais d'une saisie à la main ; sinon refus clair, AVANT toute écriture (les adresses déjà là ne sont pas revues)
  const deja = new Set([lue.cle, ...lue.adresses.map((a) => a.cle)]);
  const nouvelles = s.adresses.filter((a) => !deja.has(cleImmeuble(a.libelle)));
  // 🔴 (16/11/2026) une nouvelle adresse SANS NUMÉRO : seulement avec la confirmation de l'écran
  const sansNumero = nouvelles.find((a) => adresseSansNumero(a.libelle) && !s.sansNumeroConfirmees.includes(cleImmeuble(a.libelle)));
  if (sansNumero !== undefined) return { ok: false, motif: motifSansNumero(adresseImmeuble(sansNumero.libelle, sansNumero.codePostal || null, sansNumero.commune || null)) };
  // 🔴🔴 (Arno, 26/11/2026, 12h50, point 2) « une adresse ne doit pas pouvoir appartenir à 2 copropriétés différentes en même temps » : une NOUVELLE adresse
  // déjà portée par une autre copropriété — son adresse principale : refus ; sinon, sans la confirmation de l'écran : refus qui rend le conflit (la
  // fenêtre « Oui / Non ») ; confirmée : déplacée dans la transaction (contrôlé de nouveau plus bas, sous verrou)
  const deplacer = new Set(s.deplacementsConfirmes ?? []);
  for (const a of nouvelles) {
    const c = await conflitDeLAdresse(query, { coproId: lue.id ?? null, coproCle: lue.cle }, { libelle: a.libelle, codePostal: a.codePostal || null, banId: a.banId ?? null });
    if (c === null) continue;
    if (c.principale) return { ok: false, motif: motifPrincipaleAilleurs(c) };
    if (!deplacer.has(cleImmeuble(a.libelle))) return { ok: false, motif: motifConflitNonConfirme(c), conflitAdresse: { ...c, pour: cleImmeuble(a.libelle) } };
  }
  const verif = await verifierAdresses(nouvelles);
  if (!verif.ok) return verif;
  // 🔴🔴 (Arno, 20/11/2026, lot 7a) le format unique : l'identifiant BAN de chaque NOUVELLE adresse, seulement si le module la retrouve avec certitude
  // 🔴🔴 (lot 7d) le « + » n'accepte QU'UNE ADRESSE OFFICIELLE : l'identifiant de la Base locale, ou à défaut celui du choix dans la liste (l'adresse vient
  // d'être confirmée par le service national, juste au-dessus) ; sans identifiant : refus, AVANT toute écriture ; une adresse officielle déjà portée par
  // une AUTRE copropriété : refus, qui la nomme
  const banDesNouvelles = new Map<string, string>();
  const formatUnique = await formatUniqueDisponible();
  for (const a of nouvelles) {
    const ban = (await banIdDeLAdresse({ libelle: a.libelle, codePostal: a.codePostal || null, commune: a.commune || null })) ?? a.banId ?? null;
    if (ban !== null) banDesNouvelles.set(cleImmeuble(a.libelle), ban);
    else if (formatUnique) return { ok: false, motif: `${adresseImmeuble(a.libelle, a.codePostal || null, a.commune || null)} n’est pas une adresse officielle retrouvée avec certitude : choisissez-la dans la liste proposée (Base Adresse Nationale). Rien n’est ajouté.` };
  }
  if (formatUnique && banDesNouvelles.size > 0) {
    // 🔴 (26/11/2026) une adresse dont le déplacement est confirmé n'est pas un refus : elle quitte l'autre copropriété
    const autre = await coproprieteDeLAdresseOfficielle([...banDesNouvelles].filter(([k]) => !deplacer.has(k)).map(([, v]) => v), lue.id ?? null);
    if (autre !== null) {
      const a = nouvelles.find((x) => banDesNouvelles.get(cleImmeuble(x.libelle)) === autre.banId)!;
      return { ok: false, motif: `${adresseImmeuble(a.libelle, a.codePostal || null, a.commune || null)} est déjà l’adresse officielle de la copropriété « ${autre.libelle} » : elle ne peut pas être ajoutée ici. Rien n’est ajouté.` };
    }
  }
  // 🔴🔴 (Arno, 23/11/2026) une fiche NOUVELLE : la date d'arrêté des comptes et les AG officielles saisies avant son premier « Valider » partent AVEC
  // elle (tout ou rien) ; contrôlées ici, AVANT toute écriture. Une fiche déjà enregistrée les écrit tout de suite (ses propres gestes) : rien ici.
  const b = (brut ?? {}) as Record<string, unknown>;
  let arrete: ArreteComptes | null = null;
  if (!lue.declaree && b.arrete !== undefined && b.arrete !== null) {
    const a = b.arrete as Record<string, unknown>;
    const va = verifierArrete(a.jour, a.mois);
    if (!va.ok) return { ok: false, motif: va.motif };
    if (va.arrete !== null && !(await arreteDisponible())) return { ok: false, motif: 'La date d’arrêté des comptes demande la mise à jour de la base (migration 512) : rien n’est enregistré.' };
    arrete = va.arrete;
  }
  const ags = lue.declaree ? { ok: true as const, ags: [] } : await agOfficiellesValides(b.ags);
  if (!ags.ok) return ags;
  if (s.regrouperAvec !== null && (arrete !== null || ags.ags.length > 0)) return { ok: false, motif: 'Un regroupement ne reprend ni la date d’arrêté des comptes ni les AG saisies : retirez-les, ou validez sans regrouper. Rien n’est enregistré.' };
  if (s.regrouperAvec !== null) return regrouper(s, lue, auteur);
  // 🔴 le conflit de parcelle (la même règle que la fiche syndic) : une copropriété qui reçoit un syndic, une adresse de la parcelle gérée par un
  // AUTRE syndic — refusé sans la confirmation de l'écran, AVANT toute écriture ; confirmé, il est noté plus bas
  let conflits: ConflitAConfirmer[] = [];
  if (s.syndicId !== null && s.syndicId !== lue.syndic?.id) {
    conflits = await conflitsDuRattachement(lue.libelle, [{ libelle: lue.libelle, codePostal: lue.codePostal ?? '', commune: lue.commune ?? '' }, ...s.adresses], s.syndicId);
    const manquants = conflitsNonConfirmes(conflits, s.conflitsParcelle);
    if (manquants.length > 0) return { ok: false, motif: motifConflitParcelle(manquants), conflitsParcelle: manquants };
  }
  const unifie = await digicodesUnifiesDisponibles();
  // 🔴 (Arno, 26/11/2026, point 2) les adresses secondaires de la saisie, et celles qui n'ont pas encore de bloc de digicodes (rattachées à l'instant)
  const voulues0 = new Map(s.adresses.filter((a) => cleImmeuble(a.libelle) !== lue.cle).map((a) => [cleImmeuble(a.libelle), a]));
  const nouvellesDigi = new Map([...voulues0].filter(([k]) => !lue.digicodes.some((x) => x.cle === k)));
  const r = await withTransaction(async (q) => {
    // ── ① TOUS LES REFUS, AVANT TOUTE ÉCRITURE ─────────────────────────────────────────────────────────────────────────────────────────────
    // 🔴🔴 (Arno, 26/11/2026, 12h50) jamais d'adresse en double, même à deux personnes en même temps : le conflit relu DANS la transaction ; l'adresse
    // principale d'une autre copropriété : refus ; un déplacement non confirmé : refus qui rend le conflit ; confirmé : fait au ③, avant l'ajout ici
    const deplacements: ConflitAdresse[] = [];
    for (const a of s.adresses) {
      const cle = cleImmeuble(a.libelle);
      if (cle === lue.cle) continue;
      const c = await conflitDeLAdresse(q, { coproId: lue.id ?? null, coproCle: lue.cle }, { libelle: a.libelle, codePostal: nul(a.codePostal), banId: a.banId ?? null });
      if (c === null) continue;
      if (c.principale) return { ok: false as const, motif: motifPrincipaleAilleurs(c) };
      if (!deplacer.has(cle)) return { ok: false as const, motif: motifConflitNonConfirme(c), conflitAdresse: { ...c, pour: cle } };
      deplacements.push(c);
    }
    // les digicodes : chaque adresse est une adresse de la copropriété ; les NOUVEAUX bâtiments suivent la règle lettres OU chiffres
    if (s.digicodes.length > 0) {
      if (!(await depuisCoproprieteDisponible())) return { ok: false as const, motif: 'La saisie des digicodes dans la fiche copropriété demande la mise à jour de la base (migration 477) : rien n’est enregistré.' };
      // 🔴🔴 (Arno, 26/11/2026, 11h58, point 2) une adresse rattachée DANS CE MÊME « Valider » a ses digicodes aussi (avant : refusés, « rechargez la fiche »)
      for (const d of s.digicodes) {
        if (!lue.digicodes.some((x) => x.cle === d.cle) && !nouvellesDigi.has(d.cle)) return { ok: false as const, motif: 'Une adresse des digicodes n’est pas (ou plus) une adresse de cette copropriété : rechargez la fiche.' };
      }
      // 🔴 (lot D) le mélange n'est plus refusé : il est accepté s'il a été CONFIRMÉ à l'écran ; sinon, le même message clair qu'avant
      // 🔴 Arno (18/11/2026) — plusieurs adresses, bâtiments rangés par adresse : chaque adresse se numérote pour elle (la même règle que l'écran)
      // 🔴 (26/11/2026) les adresses de la SAISIE (celles rattachées dans ce même « Valider » comprises), comme l'écran
      const independantes = adressesIndependantes({ batimentsParAdresse: lue.batimentsParAdresse, adresses: [lue.cle, ...voulues0.keys()] });
      const groupes = independantes ? s.digicodes.map((d) => [d]) : [s.digicodes];
      for (const g of groupes) {
        const cle = g[0]?.cle ?? '';
        const refus = refusDesBatiments(g.flatMap((d) => d.batiments.map((y) => ({ libelle: y.libelle, confirme: y.confirme }))),
          nomenclatureDeLAdresse(lue.nomenclatureEffective, lue.batimentsConnus, cle, independantes), connusPourAdresse(lue.batimentsConnus, cle, independantes));
        if (refus !== null) return { ok: false as const, motif: refus };
      }
    }
    if (s.syndicId !== null) {
      const { rows } = await q<{ id: string }>('SELECT id::text FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL', [s.syndicId]);
      if (rows[0] === undefined) return { ok: false as const, motif: 'Ce syndic n’existe plus : choisissez-en un autre.' };
    }
    // ── ② la copropriété (créée au premier enregistrement), son nom, « hors copropriété » ──────────────────────────────────────────────────
    await q(
      `INSERT INTO gestion_copropriete (cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cle_immeuble) DO UPDATE SET code_postal = coalesce(gestion_copropriete.code_postal, EXCLUDED.code_postal),
                                                commune = coalesce(gestion_copropriete.commune, EXCLUDED.commune)`,
      [lue.cle, lue.libelle, lue.codePostal, lue.commune, auteur.id, auteur.libelle]);
    const { rows: c } = await q<{ id: string }>('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = $1', [lue.cle]);
    const coproId = c[0].id;
    if (avec476) {
      await q(`UPDATE gestion_copropriete SET nom = $2, hors_copropriete = coalesce($3, hors_copropriete), maj_le = now(), maj_par_libelle = $4 WHERE id = $1`,
        [coproId, s.nom, s.horsCopropriete, auteur.libelle]);
    }
    // ── ③ les adresses secondaires : ajoutées, retirées (jamais effacées) ───────────────────────────────────────────────────────────────────
    const { rows: enCours } = await q<{ id: string; cle: string; libelle: string }>(
      `SELECT id::text, cle_immeuble AS cle, libelle FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL FOR UPDATE`, [coproId]);
    const voulues = new Map(s.adresses.filter((a) => cleImmeuble(a.libelle) !== lue.cle).map((a) => [cleImmeuble(a.libelle), a]));
    const retirees = enCours.filter((x) => !voulues.has(x.cle));
    if (retirees.length > 0) {
      await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE id = ANY($1::bigint[])', [retirees.map((x) => x.id), auteur.libelle]);
      // 🔴 (Arno, 26/11/2026, 11h58) « chaque geste est journalisé dans l'historique de la copropriété » : le retrait d'une adresse aussi (« × » ou
      // « Retirer de la copropriété »), comme son ajout
      for (const x of retirees) {
        await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_retiree', $2, $3, $4, $5)`,
          [coproId, x.cle, `Adresse retirée de la copropriété : ${x.libelle}`, auteur.id, auteur.libelle]);
      }
      // 🔴 (Arno, 20/11/2026, lot 0) une adresse posée par un REGROUPEMENT (504) n'est plus jamais retirée en silence : l'Historique de ses biens le dit,
      // et le regroupement est clos s'il n'a plus d'adresse en cours
      await noterRetraitDAdressesRegroupees(q, retirees.map((x) => x.id), 'depuis la fiche copropriété', auteur);
      // comme la fiche syndic : chaque bien à l'adresse retirée perd le syndic de la copropriété — une ligne de journal par bien
      if (lue.syndic !== null) {
        const syndic = nomAvecVille(lue.syndic.nom, lue.syndic.ville);
        const { rows: lots } = await q<{ id: string; immeuble: string | null }>('SELECT id::text, immeuble FROM gestion_annuaire_lot WHERE absent_le IS NULL AND coalesce(btrim(immeuble), \'\') <> \'\'');
        for (const x of retirees) {
          for (const l of lots.filter((y) => cleImmeuble(y.immeuble) === x.cle)) {
            await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'syndic_retire', $2, $3, $4, $5)`,
              [l.id, syndic, `Syndic ${syndic} retiré de l’adresse ${x.libelle} (retirée de la copropriété ${lue.libelle}, depuis la fiche copropriété)`, auteur.id, auteur.libelle]);
          }
        }
      }
    }
    // 🔴 (26/11/2026) les déplacements confirmés : l'adresse quitte l'autre copropriété (les deux historiques le notent), puis elle est ajoutée ici
    for (const c of deplacements) await deplacerAdresse(q, c, { id: coproId, libelle: (s.nom ?? '').trim() !== '' ? (s.nom as string) : lue.libelle }, auteur);
    const deja = new Set(enCours.map((x) => x.cle));
    for (const [cle, a] of voulues) {
      if (deja.has(cle)) continue;
      const ban = banDesNouvelles.get(cle);
      await q(`INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle${ban === undefined ? '' : ', ban_id'}) VALUES ($1, $2, $3, $4, $5, $6, $7${ban === undefined ? '' : ', $8'})`,
        [coproId, cle, a.libelle, nul(a.codePostal), nul(a.commune), auteur.id, auteur.libelle, ...(ban === undefined ? [] : [ban])]);
      // 🔴 (lot 7d) chaque ajout est journalisé
      await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_ajoutee', $2, $3, $4, $5)`,
        [coproId, ban ?? null, `Adresse ajoutée à la copropriété : ${adresseImmeuble(a.libelle, nul(a.codePostal), nul(a.commune))}${ban ? ` (adresse officielle ${ban})` : ''}`, auteur.id, auteur.libelle]);
    }
    // 🔴🔴 (Arno, 26/11/2026, 11h58) « à vérifier » → « Confirmer cette adresse » : la confirmation (une adresse secondaire en cours après cet
    // enregistrement, pas déjà confirmée depuis son rattachement) entre dans l'historique de la copropriété ; la mention disparaît à la relecture
    if ((s.adressesConfirmees ?? []).length > 0) {
      const { rows: actuelles } = await q<{ cle: string; libelle: string; code_postal: string | null; commune: string | null; deja: boolean }>(
        `SELECT a.cle_immeuble AS cle, a.libelle, a.code_postal, a.commune,
                EXISTS (SELECT 1 FROM gestion_journal j WHERE j.entite = 'copropriete' AND j.entite_id = a.copropriete_id AND j.action = 'adresse_confirmee'
                         AND j.valeur_apres = a.cle_immeuble AND j.survenu_le >= a.cree_le) AS deja
           FROM gestion_copropriete_adresse a WHERE a.copropriete_id = $1 AND a.retire_le IS NULL`, [coproId]);
      // 🔴🔴 (Arno, 26/11/2026, 14h06) « Vérifier » sur TOUTES les adresses : une adresse déjà vérifiée se revoit et se confirme DE NOUVEAU (journalisé
      // aussi, « confirmée de nouveau ») ; l'adresse principale se vérifie et se confirme de la même façon
      for (const a of actuelles.filter((x) => (s.adressesConfirmees ?? []).includes(x.cle))) {
        await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_confirmee', $2, $3, $4, $5)`,
          [coproId, a.cle, `Adresse ${a.deja ? 'confirmée de nouveau (revue à l’écran)' : 'confirmée (vérifiée à l’écran)'} : ${adresseImmeuble(a.libelle, a.code_postal, a.commune)}`, auteur.id, auteur.libelle]);
      }
      if ((s.adressesConfirmees ?? []).includes(cleImmeuble(lue.libelle))) {
        await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('copropriete', $1, 'adresse_confirmee', $2, $3, $4, $5)`,
          [coproId, cleImmeuble(lue.libelle), `Adresse principale confirmée (vérifiée à l’écran) : ${adresseImmeuble(lue.libelle, lue.codePostal ?? null, lue.commune ?? null)}`, auteur.id, auteur.libelle]);
      }
    }
    // ── ④ les habitants et gardiens ──────────────────────────────────────────────────────────────────────────────────────────────────────
    if (s.contacts !== null) await enregistrerContactsImmeuble(q, { immeuble: lue.libelle, contacts: s.contacts }, auteur);
    // ── ⑤ le syndic : rattacher ou changer (le lien en cours est fermé, jamais effacé) ───────────────────────────────────────────────────
    if (s.syndicId !== null && s.syndicId !== lue.syndic?.id) {
      const { rows: liens } = await q<{ id: string; syndic_id: string }>(
        `SELECT id::text, syndic_id::text FROM gestion_copropriete_syndic WHERE copropriete_id = $1 AND fin IS NULL FOR UPDATE`, [coproId]);
      for (const l of liens) {
        await q(`UPDATE gestion_copropriete_syndic SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = 'changement de syndic' WHERE id = $1`, [l.id, auteur.id, auteur.libelle]);
        // 🔴 (Arno, 20/11/2026) les contacts de l'ancien syndic : détachés (journal), jamais supprimés de son annuaire
        await detacherContactsDeLAncienSyndic(q, { syndicId: Number(l.syndic_id), coproId, motif: 'changement de syndic', ecran: 'la fiche copropriété' }, auteur);
      }
      await q('INSERT INTO gestion_copropriete_syndic (copropriete_id, syndic_id, pose_par, pose_par_libelle) VALUES ($1, $2, $3, $4)', [coproId, s.syndicId, auteur.id, auteur.libelle]);
      // 🔴 (20/11/2026, journal des syndics) rattaché, ou remplacé (avec l'ancien syndic)
      const ancien = liens[0] === undefined ? null : Number(liens[0].syndic_id);
      await journaliserLienSyndic(q, { coproId, nature: ancien === null ? 'rattache' : 'remplace', syndicId: s.syndicId, ancienSyndicId: ancien, ecran: 'la fiche copropriété' }, auteur);
      // un conflit de parcelle CONFIRMÉ (une adresse de la parcelle est la copropriété d'un AUTRE syndic) : noté, comme depuis la fiche syndic
      for (const k of conflits) await noterConflitParcelle(q, coproId, s.syndicId, k, auteur);
    }
    // 🔴 (Arno, 20/11/2026) « Retirer le syndic » validé SANS nouveau syndic : le lien fermé (« retrait du syndic »), ses contacts détachés de la
    // copropriété (journal, jamais supprimés de son annuaire), « syndic retiré » au journal — la même fonction de détachement que partout.
    if (s.retirerSyndic === true && s.syndicId === null && lue.syndic !== null) {
      const { rows: liens } = await q<{ id: string; syndic_id: string }>(
        `SELECT id::text, syndic_id::text FROM gestion_copropriete_syndic WHERE copropriete_id = $1 AND fin IS NULL FOR UPDATE`, [coproId]);
      for (const l of liens) {
        await q(`UPDATE gestion_copropriete_syndic SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = 'retrait du syndic' WHERE id = $1`, [l.id, auteur.id, auteur.libelle]);
        await detacherContactsDeLAncienSyndic(q, { syndicId: Number(l.syndic_id), coproId, motif: 'syndic retiré de la copropriété', ecran: 'la fiche copropriété' }, auteur);
        await journaliserLienSyndic(q, { coproId, nature: 'retire', syndicId: Number(l.syndic_id), ecran: 'la fiche copropriété', motif: 'retrait du syndic' }, auteur);
      }
    }
    // ── ⑥ les digicodes (journal « depuis la fiche copropriété ») ; les nouveaux bâtiments entrent au registre de la copropriété ──────────────
    // 🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 3) un bâtiment est nouveau À SON ADRESSE (le « A » du 9 n'est pas celui du 7)
    const parAdr = await registreParAdresse(q);
    const nouveaux: (BatimentConnu & { adresseCle: string })[] = [];
    for (const d of s.digicodes) {
      // 🔴 (26/11/2026) une adresse rattachée dans ce même « Valider » : son libellé de la saisie (elle vient d'être ajoutée au ③)
      const n = nouvellesDigi.get(d.cle);
      const a = lue.digicodes.find((x) => x.cle === d.cle) ?? (n === undefined ? undefined : { voie: n.libelle, codePostal: nul(n.codePostal), commune: nul(n.commune) });
      if (a === undefined) throw new RefusCopro('Une adresse des digicodes n’est pas (ou plus) une adresse de cette copropriété : rechargez la fiche.');
      const adresse = { voie: a.voie, codePostal: a.codePostal, commune: a.commune };
      // 🔴🔴 (« Digicodes unifiés », lot 3) avec la 478 : la PREMIÈRE valeur d'une place passe par le chemin serveur unique (un code connu ne se change
      // que par « Corriger une erreur » ou « Modifier ») ; une place laissée vide n'écrit rien ; sans la 478 : comme avant
      const ecrire = async (valeur: { digicode: boolean | null; code: string | null }, batiment: string | null): Promise<void> => {
        if (unifie) {
          if (valeur.digicode === null) return;
          const w = await ecrireDigicode(q, { adresseCle: d.cle, adresseLibelle: a.voie, batiment, valeur, nature: 'saisie', origine: 'fiche_copropriete' }, auteur);
          if (!w.ok) throw new RefusCopro(w.motif);
          return;
        }
        const w = await enregistrerDigicodeDans(q, adresse, valeur, auteur, 'fiche_copropriete', null, batiment);
        if (!w.ok) throw new RefusCopro(w.motif);
      };
      if (d.commun !== undefined) await ecrire(valeurDuCode(d.commun), null);
      for (const y of d.batiments) {
        await ecrire(valeurDuCode(y), y.libelle);
        const b = batimentDe(y.libelle);
        const memeAdresse = (x: { adresseCle?: string | null }) => !parAdr || (x.adresseCle ?? null) === d.cle;
        if (b !== null && !lue.batimentsConnus.some((x) => x.cle === b.cle && memeAdresse(x)) && !nouveaux.some((x) => x.cle === b.cle && memeAdresse(x))) nouveaux.push({ ...b, adresseCle: d.cle });
      }
    }
    if (avec476 && nouveaux.length > 0) {
      for (const b of nouveaux) {
        if (parAdr) {
          await q(`INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle, adresse_cle) VALUES ($1, $2, $3, $4, $5, $6, $7)
                   ON CONFLICT (copropriete_id, adresse_cle, batiment_cle) WHERE adresse_cle IS NOT NULL DO NOTHING`, [coproId, b.cle, b.libelle, b.sorte, auteur.id, auteur.libelle, b.adresseCle]);
        } else {
          await q(`INSERT INTO gestion_copropriete_batiment (copropriete_id, batiment_cle, batiment_libelle, sorte, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (copropriete_id, batiment_cle) DO NOTHING`, [coproId, b.cle, b.libelle, b.sorte, auteur.id, auteur.libelle]);
        }
        // 🔴 (Arno, 17/11/2026, 488) un bâtiment retiré, recréé par « Ajouter nouveau bâtiment » : il est REPRIS (il reprend sa ligne) — à son adresse
        await reprendreSiRetire(q, coproId, b.cle, auteur, parAdr ? b.adresseCle : null);
      }
      // la référence : le premier nouveau bâtiment en lettre ou en chiffre qui n'est pas une exception (une exception confirmée ne la change pas)
      const avert = avertissementsDesBatiments(nouveaux.map((b) => b.libelle), lue.nomenclatureEffective, lue.batimentsConnus);
      const premier = nouveaux.find((b, i) => b.sorte !== 'libre' && avert[i].avertissement === null);
      if (lue.nomenclatureEffective === null && premier !== undefined) {
        await q('UPDATE gestion_copropriete SET nomenclature_batiments = $2 WHERE id = $1 AND nomenclature_batiments IS NULL', [coproId, premier.sorte === 'lettre' ? 'lettres' : 'chiffres']);
      } else if (lue.nomenclatureEffective !== null) {
        // la règle déjà connue (déduite des bâtiments existants) est enregistrée telle quelle, une fois
        await q('UPDATE gestion_copropriete SET nomenclature_batiments = $2 WHERE id = $1 AND nomenclature_batiments IS NULL', [coproId, lue.nomenclatureEffective]);
      }
    }
    // ── ⑦ 🔴 (Arno, 23/11/2026) fiche nouvelle : l'arrêté des comptes et les AG officielles saisis avant le premier « Valider » ──────────────
    await ecrireArreteDans(q, coproId, arrete, auteur);
    await ajouterAgOfficiellesDans(q, coproId, ags.ags, auteur);
    if (s.alerteParcelleVue) {
      await q('UPDATE gestion_copropriete SET alerte_parcelle_le = now(), alerte_parcelle_par_libelle = $2 WHERE id = $1 AND alerte_parcelle_le IS NULL', [coproId, auteur.libelle]);
    }
    return { ok: true as const };
  }).catch((e: unknown) => {
    if (e instanceof RefusCopro || e instanceof RefusDigicode) return { ok: false as const, motif: e.message };
    // 🔴🔴 (décision d'Arno du 26/11/2026, 520) la base refuse une adresse déjà à une autre copropriété (ajoutée ailleurs au même instant) : en mots
    const m = motifExclusiviteAdresse(e);
    if (m !== null) return { ok: false as const, motif: m };
    throw e;
  });
  if (!r.ok) return r;
  const relue = await ficheCopropriete(lue.cle);
  return relue === null ? { ok: false, motif: 'Enregistré, mais la fiche n’a pas pu être relue : rechargez la page.' } : { ok: true, fiche: relue };
}

/**
 * ══ 🔴🔴 (« Digicodes unifiés », lot 3) « CORRIGER UNE ERREUR » ET « GARDER CE CODE » (À ARBITRER), DEPUIS LA FICHE COPROPRIÉTÉ ═════════════
 * Deux gestes IMMÉDIATS, confirmés à l'écran, par le chemin serveur unique : la correction d'une faute de frappe (même date d'application que le
 * code corrigé, sans mail ; l'ancienne valeur reste dans l'historique) ; le choix d'une des valeurs d'avant différentes d'une place à arbitrer
 * (rien n'est jamais écrasé : la valeur choisie ENTRE dans la base unique, les anciennes tables ne bougent pas). Rend la fiche relue.
 */
/** Les gestes immédiats des digicodes, par action de route — les mêmes dans les trois routes (fiche Copropriété, Location, fiche du bien). */
export const ACTIONS_DIGICODE = { 'digicode-corriger': 'correction', 'digicode-arbitrer': 'arbitrage', 'digicode-planifier': 'planification',
  'digicode-annuler-changement': 'annulation',
  /** 🔴 (Arno, 17/11/2026, 487) le « − » d'un code de bâtiment enregistré : le code est RETIRÉ (jamais effacé) */
  'digicode-retirer': 'retrait',
  /** 🔴 (Arno, 17/11/2026, 488) le « − » d'un bâtiment enregistré SANS code : le bâtiment est retiré de la copropriété (jamais effacé) */
  'digicode-retirer-batiment': 'retrait_batiment' } as const;
export type GesteDigicode = (typeof ACTIONS_DIGICODE)[keyof typeof ACTIONS_DIGICODE];
export const gesteDeLAction = (a: unknown): GesteDigicode | null => (typeof a === 'string' && a in ACTIONS_DIGICODE ? ACTIONS_DIGICODE[a as keyof typeof ACTIONS_DIGICODE] : null);

/**
 * 🔴 (« Digicodes unifiés », lot 5) « MODIFIER » : un ou plusieurs codes de l'adresse changent à la MÊME date et heure d'application (commun et/ou
 * bâtiments) — tous ou aucun (une transaction ; un refus annule tout). Avant la date, l'ancien code reste en vigueur ; ensuite il reste dans
 * l'historique. « Annuler ce changement » : un changement encore à venir, marqué annulé (jamais effacé). Aucun envoi ici.
 */
/**
 * 🔴 (Arno, 17/11/2026 — « Annuler ce changement ») La RÉPONSE d'un geste de digicode, la même pour toutes les routes : `{ etat: 'ok', data }` ou
 * `{ etat: 'refus', motif }`. Les routes de la Location et de la fiche du bien (Gestion) renvoyaient le résultat brut (`{ ok, fiche }`) : l'écran,
 * qui lit `etat`, croyait le geste refusé (« Enregistrement refusé. ») alors qu'il était fait, et ne relisait pas les codes. PUR.
 */
export function reponseGesteDigicode(r: { ok: true; fiche: FicheCopropriete } | { ok: false; motif: string }): { etat: 'ok'; data: FicheCopropriete } | { etat: 'refus'; motif: string } {
  return r.ok ? { etat: 'ok', data: r.fiche } : { etat: 'refus', motif: r.motif };
}

export async function gesteDigicodeCopro(brut: unknown, nature: GesteDigicode, auteur: Auteur,
  /** 🔴 (Arno, 17/11/2026 : « Un retrait de code fait depuis la fiche du bien (« Nouveau bien », « Modifier le bien », fiche du bien Gestion) est noté avec
   *  l'origine « fiche du bien » ET écrit une ligne dans le journal propre du bien ») d'où vient le geste — dit par la ROUTE, jamais par le corps */
  depuis: 'fiche_copropriete' | 'fiche_bien' = 'fiche_copropriete'): Promise<{ ok: true; fiche: FicheCopropriete } | { ok: false; motif: string }> {
  const b = (brut ?? {}) as Record<string, unknown>;
  if (!(await digicodesUnifiesDisponibles())) return { ok: false, motif: 'La base unique des digicodes n’est pas encore installée (migration 478) : rien n’est enregistré.' };
  const lue = await ficheCopropriete(texte(b.immeuble));
  if (lue === null) return { ok: false, motif: 'Cette copropriété est introuvable : rechargez la page.' };
  const adresse = lue.adresses.find((a) => a.cle === cleImmeuble(texte(b.adresseCle)));
  if (adresse === undefined) return { ok: false, motif: 'Cette adresse n’est pas (ou plus) une adresse de cette copropriété : rechargez la fiche.' };
  const batiment = texte(b.batiment, 60) === '' ? null : texte(b.batiment, 60);
  const copropriete = { cle: lue.cle, libelle: lue.libelle, codePostal: lue.codePostal, commune: lue.commune };
  let planifies: ReturnType<typeof validerChangements> | null = null;
  if (nature === 'planification') { planifies = validerChangements(b); if (!planifies.ok) return planifies; }
  const r = await withTransaction(async (q): Promise<{ ok: true } | { ok: false; motif: string }> => {
    if (nature === 'annulation') return annulerChangement(q, adresse.cle, Number(b.ligneId), auteur);
    if (nature === 'retrait_batiment') {
      if (batiment === null) return { ok: false, motif: 'Bâtiment non désigné : rien n’est enregistré.' };
      return retirerBatiment(q, { coproprieteCle: lue.cle, adresseCles: lue.adresses.map((a) => a.cle), adresseCle: adresse.cle }, batiment, auteur);
    }
    if (nature === 'retrait') {
      // depuis la fiche d'un bien existant : le bien (de CETTE adresse) reçoit la ligne de son journal ; « Nouveau bien » : pas encore de bien, pas de journal
      const lotId = depuis === 'fiche_bien' && Number.isSafeInteger(Number(b.lotId)) && Number(b.lotId) > 0 ? Number(b.lotId) : null;
      if (lotId !== null) {
        const { rows } = await q<{ immeuble: string | null; adresse: string | null; cp: string | null; commune: string | null }>(
          'SELECT immeuble, adresse, code_postal AS cp, commune FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
        if (rows[0] === undefined || cleImmeuble(immeubleDuBien(rows[0])) !== adresse.cle) return { ok: false, motif: 'Ce bien n’est pas à cette adresse : rechargez la fiche. Rien n’est enregistré.' };
      }
      return retirerDigicode(q, { adresseCle: adresse.cle, adresseLibelle: adresse.libelle, batiment, origine: depuis, lotId }, auteur);
    }
    if (nature === 'planification' && planifies !== null && planifies.ok) {
      for (const c of planifies.saisie.changements) {
        const w = await ecrireDigicode(q, { adresseCle: adresse.cle, adresseLibelle: adresse.libelle, batiment: c.batiment, valeur: { digicode: c.digicode, code: c.code }, nature: 'changement',
          // 🔴 (Arno, 17/11/2026 : « Chaque code bascule à sa propre date. »)
          appliqueLe: c.appliqueLe, origine: 'fiche_copropriete', copropriete }, auteur);
        // tous ou aucun : un refus LEVÉ annule les changements déjà écrits de cette fenêtre
        if (!w.ok) throw new RefusDigicode(`${c.batiment === null ? 'Digicode copropriété' : `Bâtiment ${c.batiment}`} : ${w.motif}`);
      }
      return { ok: true };
    }
    return ecrireDigicode(q, { adresseCle: adresse.cle, adresseLibelle: adresse.libelle, batiment, valeur: { digicode: b.digicode, code: b.code },
      nature: nature === 'correction' ? 'correction' : 'arbitrage', origine: 'fiche_copropriete', copropriete }, auteur);
  }).catch((e: unknown) => { if (e instanceof RefusDigicode) return { ok: false as const, motif: e.message }; throw e; });
  if (!r.ok) return r;
  const relue = await ficheCopropriete(lue.cle);
  return relue === null ? { ok: false, motif: 'Enregistré, mais la fiche n’a pas pu être relue : rechargez la page.' } : { ok: true, fiche: relue };
}

/**
 * ══ 🔴🔴 « MÊME SYNDIC : REGROUPER ? » (déplacé de la fiche syndic, lot 6 ; Arno, 16/11/2026) ══════════════════════════════════════════════════
 * Une adresse de la même parcelle est la copropriété d'un MÊME syndic : cette copropriété la REJOINT — ses adresses (principale et secondaires)
 * deviennent des adresses de l'autre, son lien avec le syndic est fermé (« regroupement »), comme le faisait la fiche syndic. 🔴 AUCUNE DONNÉE
 * DÉPLACÉE : si cette copropriété a déjà ses propres habitants ou gardiens, un nom, des AG ou des bâtiments, le regroupement est REFUSÉ (à faire
 * à la main) — rien n'est ni déplacé ni masqué. Tous les refus avant toute écriture ; rien n'est effacé.
 */
async function regrouper(s: SaisieCopropriete, lue: FicheCopropriete, auteur: Auteur): Promise<{ ok: true; fiche: FicheCopropriete } | { ok: false; motif: string }> {
  const r = await withTransaction(async (q) => {
    const cible = await coproDeCle(q, cleImmeuble(s.regrouperAvec ?? ''));
    if (cible === null || cible.cle === lue.cle) return { ok: false as const, motif: 'La copropriété à rejoindre est introuvable : rechargez la fiche.' };
    const syndic = s.syndicId ?? lue.syndic?.id ?? null;
    const { rows: sc } = await q<{ syndic: string }>('SELECT syndic_id::text AS syndic FROM gestion_copropriete_syndic WHERE copropriete_id = $1 AND fin IS NULL LIMIT 1', [cible.id]);
    if (syndic === null || sc[0] === undefined || Number(sc[0].syndic) !== syndic) return { ok: false as const, motif: 'Le regroupement n’est possible qu’avec une copropriété du MÊME syndic.' };
    let aDesDonnees = lue.contacts.length > 0 || (s.contacts ?? []).length > 0 || (lue.nom ?? '').trim() !== '' || (s.nom ?? '').trim() !== '';
    if (!aDesDonnees && lue.id !== null) {
      const { rows } = await q<{ n: string }>(
        `SELECT (SELECT count(*) FROM gestion_copropriete_ag WHERE copropriete_id = $1) + (SELECT count(*) FROM gestion_copropriete_batiment WHERE copropriete_id = $1) AS n`, [lue.id])
        .catch(() => ({ rows: [{ n: '0' }] }));
      aDesDonnees = Number(rows[0]?.n ?? 0) > 0;
    }
    if (aDesDonnees) return { ok: false as const, motif: `La copropriété « ${lue.libelle} » a déjà ses propres habitants, gardiens, nom, AG ou bâtiments : le regroupement se fait à la main (rien n’est déplacé automatiquement).` };
    // les adresses de cette copropriété deviennent celles de l'autre (sans doublon) ; ses adresses secondaires en cours sont retirées
    const { rows: deja } = await q<{ cle: string }>('SELECT cle_immeuble AS cle FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL', [cible.id]);
    const vues = new Set([cible.cle, ...deja.map((x) => x.cle)]);
    const adresses = [{ libelle: lue.libelle, codePostal: lue.codePostal ?? '', commune: lue.commune ?? '' }, ...s.adresses];
    for (const a of adresses) {
      const k = cleImmeuble(a.libelle);
      if (k === '' || vues.has(k)) continue;
      vues.add(k);
      await q(`INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cible.id, k, a.libelle, nul(a.codePostal), nul(a.commune), auteur.id, auteur.libelle]);
    }
    if (lue.id !== null) {
      await q('UPDATE gestion_copropriete_adresse SET retire_le = now(), retire_par_libelle = $2 WHERE copropriete_id = $1 AND retire_le IS NULL', [lue.id, auteur.libelle]);
      const { rows: liens } = await q<{ id: string; syndic_id: string }>('SELECT id::text, syndic_id::text FROM gestion_copropriete_syndic WHERE copropriete_id = $1 AND fin IS NULL FOR UPDATE', [lue.id]);
      for (const l of liens) {
        await q(`UPDATE gestion_copropriete_syndic SET fin = now(), fin_par = $2, fin_par_libelle = $3, fin_motif = 'regroupement' WHERE id = $1`, [l.id, auteur.id, auteur.libelle]);
        await journaliserLienSyndic(q, { coproId: lue.id, nature: 'retire', syndicId: Number(l.syndic_id), ecran: 'la fiche copropriété (« Même syndic : regrouper ? »)',
          motif: `regroupement avec la copropriété ${cible.libelle}` }, auteur);
        await detacherContactsDeLAncienSyndic(q, { syndicId: Number(l.syndic_id), coproId: lue.id, motif: 'regroupement',
          ecran: 'la fiche copropriété (« Même syndic : regrouper ? »)' }, auteur);
      }
    }
    return { ok: true as const };
  });
  if (!r.ok) return r;
  const relue = await ficheCopropriete(lue.cle);
  return relue === null ? { ok: false, motif: 'Regroupée, mais la fiche n’a pas pu être relue : rechargez la page.' } : { ok: true, fiche: relue };
}

/** Un refus découvert APRÈS le début des écritures : levé, pour que la transaction soit ANNULÉE (rien n'est écrit). */
class RefusCopro extends Error {}

// 🔴 (16/11/2026) les adresses de la parcelle et le conflit de parcelle : une seule règle, partagée avec la fiche syndic
export { propositionsParcelle, type PropositionParcelle } from './conflitParcelleRepo';

/**
 * 🔴🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété » : « 1. Bâtiment dont l'adresse n'est pas déductible → « adresse à préciser » sur la fiche
 * Copropriété, choix par Arno ; jamais deviné. ») CHOISIR L'ADRESSE d'un bâtiment « à préciser » : l'adresse (une des adresses de SA copropriété) est
 * notée sur le bâtiment — seulement s'il n'en avait pas (jamais réécrite). Refus clairs, rien d'écrit : bâtiment inconnu ou déjà précisé ; adresse qui
 * n'est pas une adresse de la copropriété ; un bâtiment du même nom existe déjà à cette adresse (dit). Sans la 490 : refus.
 */
export async function preciserAdresseBatiment(brut: unknown, auteur: Auteur): Promise<{ ok: true; fiche: FicheCopropriete } | { ok: false; motif: string }> {
  const b = (brut ?? {}) as Record<string, unknown>;
  if (!(await registreParAdresse())) return { ok: false, motif: 'Les bâtiments par adresse demandent la mise à jour de la base (migration 490) : rien n’est enregistré.' };
  const lue = await ficheCopropriete(texte(b.immeuble));
  if (lue === null || lue.id === null) return { ok: false, motif: 'Cette copropriété est introuvable : rechargez la page.' };
  const id = Number(b.batimentId);
  const batiment = (lue.batimentsAPreciser ?? []).find((x) => x.id === id);
  if (batiment === undefined) return { ok: false, motif: 'Ce bâtiment n’est pas (ou plus) « à préciser » : rechargez la fiche. Rien n’est enregistré.' };
  const adresse = lue.adresses.find((a) => a.cle === cleImmeuble(texte(b.adresseCle)));
  if (adresse === undefined) return { ok: false, motif: 'Choisissez une adresse de cette copropriété. Rien n’est enregistré.' };
  const coproId = lue.id;
  const r = await withTransaction(async (q): Promise<{ ok: true } | { ok: false; motif: string }> => {
    const { rows: deja } = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_copropriete_batiment x JOIN gestion_copropriete_batiment b ON b.id = $1
        WHERE x.copropriete_id = $2 AND x.adresse_cle = $3 AND x.batiment_cle = b.batiment_cle`, [id, coproId, adresse.cle]);
    if ((deja[0]?.n ?? 0) > 0) return { ok: false, motif: `Le bâtiment ${batiment.libelle} existe déjà au ${adresseImmeuble(adresse.libelle, adresse.codePostal, adresse.commune)} : choisissez une autre adresse. Rien n’est enregistré.` };
    const u = await q('UPDATE gestion_copropriete_batiment SET adresse_cle = $3 WHERE id = $1 AND copropriete_id = $2 AND adresse_cle IS NULL', [id, coproId, adresse.cle]);
    if ((u as { rowCount?: number }).rowCount !== 1) return { ok: false, motif: 'Ce bâtiment a déjà son adresse : rechargez la fiche. Rien n’est enregistré.' };
    return { ok: true };
  });
  if (!r.ok) return r;
  const relue = await ficheCopropriete(lue.cle);
  return relue === null ? { ok: false, motif: 'Enregistré, mais la fiche n’a pas pu être relue : rechargez la page.' } : { ok: true, fiche: relue };
}


/** 🔴 (lot 7d) La copropriété (autre que `sauf`) qui porte déjà l'une de ces adresses officielles, ou null. LECTURE SEULE. */
async function coproprieteDeLAdresseOfficielle(bans: readonly string[], sauf: number | string | null): Promise<{ banId: string; libelle: string } | null> {
  const { rows } = await query<{ ban: string; libelle: string }>(
    `SELECT coalesce(a.ban_id, c.ban_id) AS ban, coalesce(nullif(btrim(c.nom), ''), c.libelle) AS libelle
       FROM gestion_copropriete c LEFT JOIN gestion_copropriete_adresse a ON a.copropriete_id = c.id AND a.retire_le IS NULL AND a.ban_id = ANY($1::text[])
      WHERE (c.ban_id = ANY($1::text[]) OR a.id IS NOT NULL) AND ($2::bigint IS NULL OR c.id <> $2::bigint)
      ORDER BY c.id LIMIT 1`, [[...bans], sauf === null ? null : Number(sauf)]);
  return rows[0] === undefined ? null : { banId: rows[0].ban, libelle: rows[0].libelle };
}
