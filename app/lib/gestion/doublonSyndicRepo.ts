import { query } from '../db/client';
import type { Auteur } from './gestes';
import { adressesDeLaParcelle } from './parcelleRepo';
import { ficheSyndic, enregistrerSyndic, syndicsComparables } from './syndicRepo';
import { cleImmeuble, validerSyndic, versFormulaire, versSaisie, type ImmeubleSaisi } from './syndics';
import { cleAdressePostale, memeAdressePostale } from './doublonSyndic';
import { contactsDeLImmeuble } from './contactsImmeubleRepo';
import { biensDeLaCopropriete, type ResumeRattachement } from './partageSyndic';

/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — LE DÉPÔT ═════════════════════════════════════════════
 *
 *   · `syndicsComparables` — l'annuaire des syndics tel que la comparaison anti-doublon le voit (LECTURE SEULE) ;
 *   · `syndicsConnusPourAdresse` — les syndics déjà rattachés à la MÊME adresse postale (un autre bien du portefeuille,
 *     une autre adresse de la même copropriété, la même parcelle) — LECTURE SEULE ;
 *   · `propositionPourBien` — le bandeau « Syndic connu pour cette adresse » de la fiche d'un bien (LECTURE SEULE) ;
 *   · `rattacherBienAuSyndic` — le rattachement, UNIQUEMENT sur un clic, par la porte unique `enregistrerSyndic` ;
 *   · `ignorerProposition` — « Ignorer », mémorisé pour ce bien au journal (ajout seul, entité `annuaire_lot`).
 *
 * 🔒 AUCUNE MIGRATION : le journal accepte déjà `annuaire` (trace « créé quand même », précédent de la suppression d'un
 * syndic) et `annuaire_lot` (précédent du retrait d'un syndic). ⚠️ PAS DE `import 'server-only'` (convention du module).
 */

/** L'action du journal qui mémorise « Ignorer » pour un bien (entité `annuaire_lot`, valeur = le syndic écarté). */
export const ACTION_PROPOSITION_IGNOREE = 'syndic_proposition_ignoree';
/** L'action du journal qui trace une création malgré l'avertissement (entité `annuaire`, id = le syndic créé). */
export const ACTION_CREE_MALGRE_DOUBLON = 'syndic_cree_malgre_doublon';

/* `syndicsComparables` vit dans `syndicRepo` (la porte d'écriture s'en sert au « Valider ») ; il est réexporté ici. */
export { syndicsComparables };

/** Un syndic déjà connu pour une adresse, et par où on le sait. */
export interface SyndicConnu {
  syndic: { id: number; nom: string; ville: string | null };
  /** La copropriété de ce syndic qui porte l'adresse (sa clé et son libellé). */
  copro: { cle: string; libelle: string };
  /** `bien` : un autre bien du portefeuille à la même adresse ; `copropriete` : une adresse de la copropriété ;
   *  `parcelle` : une adresse de la même parcelle cadastrale. */
  via: Array<'bien' | 'copropriete' | 'parcelle'>;
  /** Les biens du portefeuille rattachés à ce syndic par cette copropriété (numéro WIPPIMMO et adresse). */
  biens: Array<{ id: number; numero: string; adresse: string }>;
}

interface EntreeAdresse {
  cle: string; via: 'bien' | 'copropriete';
  syndic: SyndicConnu['syndic']; copro: SyndicConnu['copro'];
  bien: { id: number; numero: string; adresse: string } | null;
}

interface LotLu { id: number; numero: string; immeuble: string | null; adresse: string | null; codePostal: string | null; commune: string | null }

/** Les lots du portefeuille (non absents). LECTURE SEULE. */
async function lots(): Promise<LotLu[]> {
  const { rows } = await query<{ id: string; numero: string; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null }>(
    `SELECT lo.id::text, lo.wippimmo_id AS numero, lo.immeuble, lo.adresse, lo.code_postal, lo.commune
       FROM gestion_annuaire_lot lo WHERE lo.absent_le IS NULL ORDER BY lo.id`);
  return rows.map((r) => ({ id: Number(r.id), numero: r.numero, immeuble: r.immeuble, adresse: r.adresse, codePostal: r.code_postal, commune: r.commune }));
}

/** Les clés d'adresse d'un lot : son adresse, et son « Immeuble » (souvent la même, parfois écrite autrement). */
function clesDuLot(l: LotLu): string[] {
  return [...new Set([cleAdressePostale(l.adresse, l.codePostal, l.commune), cleAdressePostale(l.immeuble, l.codePostal, l.commune)]
    .filter((k) => k !== ''))];
}

/**
 * L'INDEX : chaque adresse connue d'une copropriété QUI A UN SYNDIC EN COURS — ses adresses (principale et
 * secondaires) et celles des biens du portefeuille qui en relèvent (par la clé de leur « Immeuble », la règle du
 * dépôt). Rend aussi, pour chaque lot, le syndic qui le couvre déjà. LECTURE SEULE.
 */
async function indexDesAdresses(): Promise<{ entrees: EntreeAdresse[]; couvert: Map<number, number>; lots: LotLu[] }> {
  const [{ rows: copros }, { rows: secondaires }, tous] = await Promise.all([
    query<{ id: string; cle: string; libelle: string; code_postal: string | null; commune: string | null; sid: string; snom: string; sville: string | null }>(
      `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle, c.code_postal, c.commune,
              s.id::text AS sid, s.nom AS snom, s.ville AS sville
         FROM gestion_copropriete c
         JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
         JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL`),
    query<{ copro: string; cle: string; libelle: string; code_postal: string | null; commune: string | null }>(
      `SELECT a.copropriete_id::text AS copro, a.cle_immeuble AS cle, a.libelle, a.code_postal, a.commune
         FROM gestion_copropriete_adresse a WHERE a.retire_le IS NULL`),
    lots(),
  ]);
  const entrees: EntreeAdresse[] = [];
  const parCle = new Map<string, { syndic: SyndicConnu['syndic']; copro: SyndicConnu['copro'] }>();
  for (const c of copros) {
    const syndic = { id: Number(c.sid), nom: c.snom, ville: c.sville };
    const copro = { cle: c.cle, libelle: c.libelle };
    parCle.set(cleImmeuble(c.cle), { syndic, copro });
    const k = cleAdressePostale(c.libelle, c.code_postal, c.commune);
    if (k !== '') entrees.push({ cle: k, via: 'copropriete', syndic, copro, bien: null });
    for (const a of secondaires.filter((x) => x.copro === c.id)) {
      parCle.set(cleImmeuble(a.cle), { syndic, copro });
      const ka = cleAdressePostale(a.libelle, a.code_postal, a.commune);
      if (ka !== '') entrees.push({ cle: ka, via: 'copropriete', syndic, copro, bien: null });
    }
  }
  const couvert = new Map<number, number>();
  for (const l of tous) {
    const s = parCle.get(cleImmeuble(l.immeuble));
    if (s === undefined) continue;
    couvert.set(l.id, s.syndic.id);
    const bien = { id: l.id, numero: l.numero, adresse: (l.adresse ?? l.immeuble ?? '').trim() };
    for (const k of clesDuLot(l)) entrees.push({ cle: k, via: 'bien', syndic: s.syndic, copro: s.copro, bien });
  }
  return { entrees, couvert, lots: tous };
}

/** Regroupe des entrées par syndic (et copropriété). PUR. */
function regrouper(trouvees: readonly EntreeAdresse[]): SyndicConnu[] {
  const m = new Map<string, SyndicConnu>();
  for (const e of trouvees) {
    const cle = `${e.syndic.id}|${e.copro.cle}`;
    const s = m.get(cle) ?? { syndic: e.syndic, copro: e.copro, via: [], biens: [] };
    if (!s.via.includes(e.via)) s.via.push(e.via);
    if (e.bien !== null && !s.biens.some((b) => b.id === e.bien?.id)) s.biens.push(e.bien);
    m.set(cle, s);
  }
  return [...m.values()];
}

/**
 * ══ PARTIE 2 — LES SYNDICS DÉJÀ CONNUS POUR CETTE ADRESSE ══ (un autre bien du portefeuille à la même adresse, une
 * adresse de la même copropriété, la même parcelle cadastrale). `lotId` : le bien d'où l'on vient (écarté des biens
 * cités) ; `exclureSyndic` : le syndic qu'on vient de retirer de cette copropriété (jamais reproposé). LECTURE SEULE.
 */
export async function syndicsConnusPourAdresse(
  adresse: ImmeubleSaisi, o: { lotId?: number | null; exclureSyndic?: number | null; parcelle?: boolean } = {},
): Promise<SyndicConnu[]> {
  const { entrees, lots: tous } = await indexDesAdresses();
  const lot = o.lotId == null ? undefined : tous.find((l) => l.id === o.lotId);
  const cles = [...new Set([cleAdressePostale(adresse.libelle, adresse.codePostal, adresse.commune), ...(lot ? clesDuLot(lot) : [])]
    .filter((k) => k !== ''))];
  const trouvees = entrees.filter((e) => e.syndic.id !== o.exclureSyndic && (e.bien === null || e.bien.id !== o.lotId)
    && cles.some((k) => memeAdressePostale(k, e.cle)));
  const connus = regrouper(trouvees);
  if (o.parcelle !== false) {
    try {
      const p = await adressesDeLaParcelle([{ libelle: adresse.libelle, codePostal: adresse.codePostal, commune: adresse.commune }]);
      const voisines = new Set(p.adresses.map((a) => cleImmeuble(a.cle || a.libelle)));
      const parcelle = entrees.filter((e) => e.via === 'copropriete' && e.syndic.id !== o.exclureSyndic
        && (voisines.has(cleImmeuble(e.copro.cle)) || voisines.has(cleImmeuble(e.copro.libelle))));
      for (const e of parcelle) {
        const deja = connus.find((c) => c.syndic.id === e.syndic.id && c.copro.cle === e.copro.cle);
        if (deja !== undefined) { if (!deja.via.includes('parcelle')) deja.via.push('parcelle'); continue; }
        const biens = entrees.filter((x) => x.via === 'bien' && x.copro.cle === e.copro.cle && x.bien !== null && x.bien.id !== o.lotId)
          .map((x) => x.bien as NonNullable<EntreeAdresse['bien']>);
        connus.push({ syndic: e.syndic, copro: e.copro, via: ['parcelle'], biens: [...new Map(biens.map((b) => [b.id, b])).values()] });
      }
    } catch (e) {
      /* La parcelle est un indice de plus : sans BAN ni cadastre, les deux autres voies suffisent. */
      console.error('[gestion/doublonSyndic] parcelle illisible', e);
    }
  }
  return connus.sort((a, b) => a.syndic.nom.localeCompare(b.syndic.nom, 'fr'));
}

/** Les syndics « Ignorés », par bien (journal, ajout seul). LECTURE SEULE. */
async function ignores(lotIds: readonly number[]): Promise<Map<number, Set<number>>> {
  const m = new Map<number, Set<number>>();
  if (lotIds.length === 0) return m;
  const { rows } = await query<{ lot: string; syndic: string | null }>(
    `SELECT j.entite_id::text AS lot, j.valeur_apres AS syndic FROM gestion_journal j
      WHERE j.entite = 'annuaire_lot' AND j.entite_id = ANY($1::bigint[]) AND j.action = $2`, [[...lotIds], ACTION_PROPOSITION_IGNOREE]);
  for (const r of rows) {
    const n = Number(r.syndic);
    if (!Number.isSafeInteger(n) || n <= 0) continue;
    const s = m.get(Number(r.lot)) ?? new Set<number>();
    s.add(n);
    m.set(Number(r.lot), s);
  }
  return m;
}

type Index = Awaited<ReturnType<typeof indexDesAdresses>>;

/** La proposition d'un bien, l'index et les « Ignorer » déjà lus. PUR. */
function propositionDepuis(index: Index, lotId: number, ignoresDuBien: ReadonlySet<number>): { lot: LotLu; syndics: SyndicConnu[] } | null {
  const lot = index.lots.find((l) => l.id === lotId);
  if (lot === undefined || index.couvert.has(lot.id) || cleImmeuble(lot.immeuble) === '') return null;
  const cles = clesDuLot(lot);
  if (cles.length === 0) return null;
  const syndics = regrouper(index.entrees.filter((e) => !ignoresDuBien.has(e.syndic.id)
    && (e.bien === null || e.bien.id !== lotId) && cles.some((k) => memeAdressePostale(k, e.cle))));
  return syndics.length === 0 ? null : { lot, syndics };
}

/**
 * ══ PARTIE 3 — LE BANDEAU « SYNDIC CONNU POUR CETTE ADRESSE » D'UN BIEN ══
 * Un bien QUI N'A PAS DE SYNDIC (sa copropriété n'en a pas, ou il n'en a pas) mais dont l'adresse est la même qu'un
 * bien du portefeuille rattaché à un syndic (ou qu'une adresse de sa copropriété) : ce syndic est proposé, sauf s'il a
 * été « Ignoré » pour ce bien. Un bien sans « Immeuble » ne peut pas recevoir de syndic (règle du dépôt) : rien.
 * Jamais de rattachement automatique. LECTURE SEULE.
 */
export async function propositionPourBien(lotId: number): Promise<{ lot: LotLu; syndics: SyndicConnu[] } | null> {
  const index = await indexDesAdresses();
  const ig = await ignores([lotId]);
  return propositionDepuis(index, lotId, ig.get(lotId) ?? new Set());
}

/** Le décompte de la Partie 3 : les biens actuels qui afficheraient le bandeau aujourd'hui. LECTURE SEULE. */
export async function biensAvecProposition(): Promise<Array<{ lot: LotLu; syndics: SyndicConnu[] }>> {
  const index = await indexDesAdresses();
  const ig = await ignores(index.lots.map((l) => l.id));
  return index.lots.map((l) => propositionDepuis(index, l.id, ig.get(l.id) ?? new Set()))
    .filter((p): p is { lot: LotLu; syndics: SyndicConnu[] } => p !== null);
}

/**
 * ══ LE RÉSUMÉ DU PARTAGE, APRÈS UN RATTACHEMENT ══ (lot FICHE-SYNDIC-UNIQUE-ET-PARTAGEE) : la copropriété que le bien a
 * rejointe (ou qui vient de naître), ses contacts syndic et ses habitants / gardien, les AUTRES biens qui la partagent,
 * et — copropriété nouvelle — les contacts du cabinet qui ne la suivent pas encore (proposés par lien, jamais copiés).
 * Les habitants d'un AUTRE immeuble ne sont jamais proposés : le carnet appartient à sa copropriété. LECTURE SEULE.
 */
export async function resumePartage(syndicId: number, cleCopro: string, lotId: number | null, nouvelleCopro: boolean): Promise<ResumeRattachement | null> {
  const fiche = await ficheSyndic(syndicId);
  if (fiche === null) return null;
  const cle = cleImmeuble(cleCopro);
  const copro = fiche.coproprietes.find((c) => c.cle === cle || (c.adresses ?? []).some((a) => a.cle === cle));
  if (copro === undefined) return null;
  const habitants = await contactsDeLImmeuble(copro.libelle);
  const suivent = fiche.contacts.filter((c) => c.immeubles.includes(copro.cle));
  return {
    syndic: { id: fiche.id, nom: fiche.nom, ville: fiche.ville },
    copro: { cle: copro.cle, libelle: copro.libelle },
    nouvelleCopro,
    contactsSyndic: suivent.length,
    habitants: habitants.length,
    autresBiens: biensDeLaCopropriete(fiche, copro.cle).filter((b) => b.id !== lotId).length,
    contactsProposables: nouvelleCopro ? fiche.contacts.filter((c) => !c.immeubles.includes(copro.cle))
      .map((c) => ({ id: c.id, nom: [c.civilite, c.prenom, (c.nom ?? '').toLocaleUpperCase('fr')].filter((x) => (x ?? '').trim() !== '').join(' '), titre: c.titre })) : [],
  };
}

/**
 * ══ LE RATTACHEMENT, SUR UN CLIC ══ — par la porte unique `enregistrerSyndic`, exactement comme le « Valider » de la
 * fiche : la fiche du syndic est relue, l'immeuble du bien y est ajouté, et la saisie repasse par `validerSyndic`.
 *   · le bien est dans le MÊME immeuble qu'une copropriété de ce syndic (`coproCle` donné, ou retrouvée ici par la
 *     même adresse postale, une adresse de la copropriété ou la même parcelle) : il REJOINT cette copropriété, et son
 *     adresse en devient une adresse SECONDAIRE si elle est nouvelle — il hérite de tout (contacts, carnet) ;
 *   · sinon (un AUTRE immeuble du même cabinet) : l'immeuble du bien devient une copropriété de ce syndic, et les
 *     coordonnées du cabinet sont partagées.
 * Les coordonnées déjà enregistrées du syndic ne changent pas : leurs avertissements ont été confirmés quand elles ont
 * été saisies (`confirmeDoublons`).
 */
export async function rattacherBienAuSyndic(
  syndicId: number, immeuble: ImmeubleSaisi, coproCle: string | null, auteur: Auteur, lotId: number | null = null,
): Promise<{ ok: true; id: number; resume: ResumeRattachement | null } | { ok: false; motif: string }> {
  const libelle = immeuble.libelle.trim();
  if (libelle === '') return { ok: false, motif: 'Ce bien n’a pas d’« Immeuble » : il ne peut recevoir un syndic que par son immeuble.' };
  const fiche = await ficheSyndic(syndicId);
  if (fiche === null) return { ok: false, motif: 'Ce syndic n’existe pas ou a été supprimé.' };
  const f = versFormulaire(fiche);
  const cle = cleImmeuble(libelle);
  /* La copropriété de CE syndic qui porte déjà l'adresse du bien, si on ne l'a pas donnée (critère « adresse »). */
  let coproVisee = coproCle;
  if (coproVisee === null) {
    const connus = await syndicsConnusPourAdresse(immeuble, { lotId });
    coproVisee = connus.find((c) => c.syndic.id === syndicId)?.copro.cle ?? null;
  }
  const dejaLa = f.immeubles.find((im) => cleImmeuble(im.libelle) === cle
    || (im.adresses ?? []).some((a) => cleImmeuble(a.libelle) === cle));
  const cible = coproVisee === null ? undefined : f.immeubles.find((im) => cleImmeuble(im.libelle) === cleImmeuble(coproVisee as string));
  if (dejaLa === undefined) {
    f.immeubles = cible === undefined
      ? [...f.immeubles, { libelle, codePostal: immeuble.codePostal, commune: immeuble.commune }]
      : f.immeubles.map((im) => (im === cible
        ? { ...im, adresses: [...(im.adresses ?? []), { libelle, codePostal: immeuble.codePostal, commune: immeuble.commune }] } : im));
  }
  const v = validerSyndic(JSON.parse(JSON.stringify({ ...versSaisie(f), confirmeDoublons: true })));
  if (!v.ok) return { ok: false, motif: v.motif };
  const r = await enregistrerSyndic(syndicId, v.syndic, auteur);
  if (!r.ok) return { ok: false, motif: r.motif };
  const finale = dejaLa !== undefined ? dejaLa.libelle : cible !== undefined ? cible.libelle : libelle;
  const resume = await resumePartage(syndicId, finale, lotId, dejaLa === undefined && cible === undefined).catch(() => null);
  return { ok: true, id: r.id, resume };
}

/**
 * « AJOUTER » UN CONTACT DU CABINET À UNE COPROPRIÉTÉ — la personne EXISTANTE suit désormais aussi cette copropriété
 * (une affectation de plus), jamais une copie. Par la porte unique `enregistrerSyndic`, uniquement sur un clic.
 */
export async function affecterContact(syndicId: number, contactId: number, coproCle: string, auteur: Auteur):
Promise<{ ok: true } | { ok: false; motif: string }> {
  const fiche = await ficheSyndic(syndicId);
  if (fiche === null) return { ok: false, motif: 'Ce syndic n’existe pas ou a été supprimé.' };
  const cle = cleImmeuble(coproCle);
  if (!fiche.coproprietes.some((c) => c.cle === cle)) return { ok: false, motif: 'Cette copropriété n’est pas celle de ce syndic.' };
  const f = versFormulaire(fiche);
  const c = f.contacts.find((x) => x.id === contactId);
  if (c === undefined) return { ok: false, motif: 'Ce contact n’est pas (ou plus) un contact de ce syndic.' };
  if (!c.immeubles.includes(cle)) c.immeubles = [...c.immeubles, cle];
  const v = validerSyndic(JSON.parse(JSON.stringify({ ...versSaisie(f), confirmeDoublons: true })));
  if (!v.ok) return { ok: false, motif: v.motif };
  const r = await enregistrerSyndic(syndicId, v.syndic, auteur);
  return r.ok ? { ok: true } : { ok: false, motif: r.motif };
}

/** « Ignorer » : mémorisé pour CE bien et CE syndic, au journal (ajout seul). Écrit UNIQUEMENT sur un clic. */
export async function ignorerProposition(lotId: number, syndicId: number, auteur: Auteur): Promise<{ ok: true } | { ok: false; motif: string }> {
  const { rows } = await query<{ id: string }>(`SELECT id::text FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
  if (rows.length === 0) return { ok: false, motif: 'Ce bien n’existe pas.' };
  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6)`,
    [lotId, ACTION_PROPOSITION_IGNOREE, String(syndicId), 'Syndic connu pour cette adresse : proposition ignorée pour ce bien',
      auteur.id, auteur.libelle]);
  return { ok: true };
}
