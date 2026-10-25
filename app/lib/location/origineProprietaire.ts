import { LIBELLE_ORIGINE_CONTACT, PRECISION_ORIGINE_MAX, type OrigineContact } from './suivi/suivi';

/**
 * ══ 🔴 Arno (25/10/2026, migration 425) — L'ORIGINE DU CONTACT PORTÉE PAR LE PROPRIÉTAIRE ═══════════════════════════════════════════
 * Saisie à la création du propriétaire (OBLIGATOIRE dans les écrans de saisie manuelle), puis PRÉREMPLIE sur chaque nouvelle location de
 * ses biens (« reprise du propriétaire <nom> »), modifiable sur la location sans toucher le propriétaire. Les règles des cases
 * « Relocation » / « Nouvelle gestion » priment. « Origine inconnue — à compléter » satisfait l'obligation mais n'est pas héritée.
 * Copropriétaires : l'origine du TITULAIRE du bien, et la mention « origines différentes entre copropriétaires ». PUR.
 */
export const ORIGINES_PROPRIETAIRE = ['collegue', 'apporteur', 'internet', 'recommandation', 'passage_agence', 'campagne', 'personnalise', 'inconnue'] as const;
export type OrigineProprietaireContact = typeof ORIGINES_PROPRIETAIRE[number];
export const LIBELLE_ORIGINE_INCONNUE = 'Origine inconnue — à compléter';
export const libelleOrigineProprietaire = (o: OrigineProprietaireContact): string =>
  (o === 'inconnue' ? LIBELLE_ORIGINE_INCONNUE : LIBELLE_ORIGINE_CONTACT[o]);

/** L'origine d'un propriétaire (ou d'une location, pour la comparer). */
export interface OrigineProprietaire {
  origine: OrigineProprietaireContact;
  precision: string | null;
  apporteurId: number | null;
  collegueId: number | null;
  collegueLibelle?: string | null;
}

/** Les champs d'origine d'une location (bloc 4, bloc 9). */
export interface ChampsOrigineLocation {
  origineContact: OrigineContact | '';
  origineContactPrecision: string;
  apporteurId: string;
  collegueId: string;
}

const entier = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Vérifie l'origine saisie pour un propriétaire : obligatoire (jamais vide : « Origine inconnue » est un choix), « Collègue » exige le
 * collègue, « Apporteur » l'apporteur, « Personnalisé » son texte (80 caractères au plus). PUR.
 */
export function verifierOrigineProprietaire(b: unknown): { ok: true; valeur: OrigineProprietaire } | { ok: false; motif: string } {
  const o = (b ?? {}) as Record<string, unknown>;
  const origine = typeof o.origine === 'string' && (ORIGINES_PROPRIETAIRE as readonly string[]).includes(o.origine) ? o.origine as OrigineProprietaireContact : null;
  if (origine === null) return { ok: false, motif: 'L’origine du contact du propriétaire est obligatoire (ou « Origine inconnue — à compléter »).' };
  const precision = origine === 'personnalise' && typeof o.precision === 'string' ? o.precision.replace(/\s+/g, ' ').trim() : '';
  if (origine === 'personnalise' && precision === '') return { ok: false, motif: 'Origine « Personnalisé » : saisissez l’origine du contact.' };
  if (precision.length > PRECISION_ORIGINE_MAX) return { ok: false, motif: `Origine personnalisée : ${PRECISION_ORIGINE_MAX} caractères au plus.` };
  const collegueId = entier(o.collegueId);
  if (origine === 'collegue' && collegueId === null) return { ok: false, motif: 'Choisissez le collègue (origine « Collègue directement »).' };
  const apporteurId = entier(o.apporteurId);
  if (origine === 'apporteur' && apporteurId === null) return { ok: false, motif: 'Choisissez l’apporteur d’affaires dans l’annuaire.' };
  return { ok: true, valeur: {
    origine, precision: origine === 'personnalise' ? precision : null,
    apporteurId: origine === 'apporteur' ? apporteurId : null, collegueId: origine === 'collegue' ? collegueId : null,
    collegueLibelle: origine === 'collegue' && typeof o.collegueLibelle === 'string' && o.collegueLibelle.trim() !== '' ? o.collegueLibelle.trim() : null,
  } };
}

/** Une origine HÉRITABLE : une vraie origine (« Origine inconnue » et l'absence ne le sont pas). PUR. */
export const heritable = (o: OrigineProprietaire | null | undefined): o is OrigineProprietaire => o !== null && o !== undefined && o.origine !== 'inconnue';

/** Deux origines égales : même origine, même apporteur, même collègue, même précision. PUR. */
export function memeOrigine(a: OrigineProprietaire | null, b: OrigineProprietaire | null): boolean {
  if (a === null || b === null) return a === b;
  // Un collègue sans compte (repris du fichier) se reconnaît à son nom.
  const memeCollegue = (a.collegueId ?? null) === (b.collegueId ?? null)
    && (a.collegueId !== null || (a.collegueLibelle ?? '').trim().toLowerCase() === (b.collegueLibelle ?? '').trim().toLowerCase());
  return a.origine === b.origine && (a.apporteurId ?? null) === (b.apporteurId ?? null) && memeCollegue && (a.precision ?? null) === (b.precision ?? null);
}

/** L'origine d'une location, lue comme une origine de propriétaire (null : à renseigner, ou une origine propre à une location). PUR. */
export function origineDeLocation(c: { origineContact: string | null | undefined; origineContactPrecision?: string | null; apporteurId?: number | string | null;
  collegueId?: number | string | null; collegueLibelle?: string | null }): OrigineProprietaire | null {
  const o = c.origineContact ?? '';
  if (!(ORIGINES_PROPRIETAIRE as readonly string[]).includes(o) || o === 'inconnue') return null;
  return { origine: o as OrigineProprietaireContact, precision: o === 'personnalise' ? (c.origineContactPrecision ?? null) || null : null,
    apporteurId: o === 'apporteur' ? entier(c.apporteurId) : null, collegueId: o === 'collegue' ? entier(c.collegueId) : null,
    ...(o === 'collegue' && (c.collegueLibelle ?? '').trim() !== '' ? { collegueLibelle: (c.collegueLibelle as string).trim() } : {}) };
}

/** Les champs d'une location, préremplis depuis l'origine (héritable) d'un propriétaire. PUR. */
export const champsDepuisProprietaire = (p: OrigineProprietaire): ChampsOrigineLocation => ({
  origineContact: p.origine as OrigineContact, origineContactPrecision: p.precision ?? '',
  apporteurId: p.apporteurId === null ? '' : String(p.apporteurId), collegueId: p.collegueId === null ? '' : String(p.collegueId),
});

/** Ce que reçoit une location : l'origine du titulaire de son bien (et la divergence entre copropriétaires en cours). */
export interface OrigineDuBien { proprietaireId: number; nom: string; origine: OrigineProprietaire | null; coproprietairesDifferents: boolean }

/**
 * 🔴 Arno — LE PRÉREMPLISSAGE D'UNE LOCATION : les règles des cases d'abord (« Relocation » impose son origine ; « Nouvelle gestion »
 * d'un propriétaire déjà client met « Propriétaire déjà client ») ; si elles laissent l'origine VIDE, l'origine (héritable) du
 * propriétaire. Une origine déjà saisie n'est jamais remplacée. `reprise` : l'origine vient du propriétaire. PUR.
 */
export function prerempliOrigine(actuelle: ChampsOrigineLocation, bien: OrigineDuBien | null): { champs: ChampsOrigineLocation; reprise: boolean } {
  if (actuelle.origineContact !== '' || bien === null || !heritable(bien.origine)) return { champs: actuelle, reprise: false };
  return { champs: champsDepuisProprietaire(bien.origine), reprise: true };
}

/**
 * La mention sous l'origine d'une location : « reprise du propriétaire <nom> » (égale à celle du propriétaire), « différente de l'origine
 * du propriétaire » (une autre, saisie ou validée à la main), rien sinon ; et « origines différentes entre copropriétaires ». PUR.
 */
export function mentionsOrigine(champs: ChampsOrigineLocation, bien: OrigineDuBien | null): string[] {
  if (bien === null) return [];
  const m: string[] = [];
  const loc = origineDeLocation({ origineContact: champs.origineContact || null, origineContactPrecision: champs.origineContactPrecision,
    apporteurId: champs.apporteurId, collegueId: champs.collegueId });
  if (heritable(bien.origine) && champs.origineContact !== '' && champs.origineContact !== 'relocation' && champs.origineContact !== 'proprietaire_deja_client') {
    m.push(memeOrigine(loc, bien.origine) ? `reprise du propriétaire ${bien.nom}` : 'différente de l’origine du propriétaire');
  }
  if (bien.coproprietairesDifferents) m.push('origines différentes entre copropriétaires');
  return m;
}

/**
 * 🔴 LES PROPRIÉTAIRES EXISTANTS (script) : l'origine proposée d'après ses locations. « Relocation » et « Propriétaire déjà client » sont
 * ignorées (imposées par les cases, elles ne disent pas d'où vient le propriétaire) ; une location vide n'apporte rien. Toutes les
 * origines restantes identiques → proposée ; plusieurs → divergente ; aucune → vide. PUR.
 */
export function origineProposeeDesLocations(locations: readonly Parameters<typeof origineDeLocation>[0][]):
  { sorte: 'proposee'; origine: OrigineProprietaire; nb: number; vides: number } | { sorte: 'divergente'; origines: OrigineProprietaire[] } | { sorte: 'vide' } {
  const origines = locations.map(origineDeLocation);
  const pleines = origines.filter((o): o is OrigineProprietaire => o !== null);
  if (pleines.length === 0) return { sorte: 'vide' };
  const distinctes = pleines.filter((o, i) => pleines.findIndex((x) => memeOrigine(x, o)) === i);
  if (distinctes.length > 1) return { sorte: 'divergente', origines: distinctes };
  return { sorte: 'proposee', origine: distinctes[0], nb: pleines.length, vides: origines.length - pleines.length };
}

/**
 * Le REPORT proposé après une modification : seulement les locations encore « à renseigner » (origine vide, et aucun apporteur déjà
 * noté — une ligne reprise du fichier avec son apporteur n'est pas « vide »). PUR.
 */
export const locationsAReporter = <T extends { origineContact: string | null | undefined; apporteurId?: number | null }>(locations: readonly T[]): T[] =>
  locations.filter((l) => (l.origineContact === null || l.origineContact === undefined || l.origineContact === '') && (l.apporteurId ?? null) === null);

// ── 🔴 LE SCRIPT DES PROPRIÉTAIRES EXISTANTS (`location:origine-proprietaires`) ─────────────────────────────────────────────────────────

export interface ProprietaireExamine { id: number; nom: string; origineActuelle: string | null; locations: Parameters<typeof origineDeLocation>[0][] }
export type DecisionOrigine =
  | { sorte: 'proposee'; p: ProprietaireExamine; origine: OrigineProprietaire; nb: number; vides: number }
  | { sorte: 'divergente'; p: ProprietaireExamine; origines: OrigineProprietaire[] }
  | { sorte: 'vide'; p: ProprietaireExamine }
  | { sorte: 'deja'; p: ProprietaireExamine };

/**
 * Le PLAN : un propriétaire dont l'origine est déjà saisie n'est plus examiné (REJOUABLE) ; sinon l'origine de ses locations si elles
 * sont toutes identiques (les vides et « Relocation » / « Propriétaire déjà client » ignorées) ; divergentes ou vides : listées à part,
 * jamais touchées. PUR.
 */
export function planOrigineProprietaires(proprietaires: readonly ProprietaireExamine[]): DecisionOrigine[] {
  return proprietaires.map((p): DecisionOrigine => {
    if (p.origineActuelle !== null) return { sorte: 'deja', p };
    const r = origineProposeeDesLocations(p.locations);
    if (r.sorte === 'proposee') return { sorte: 'proposee', p, origine: r.origine, nb: r.nb, vides: r.vides };
    if (r.sorte === 'divergente') return { sorte: 'divergente', p, origines: r.origines };
    return { sorte: 'vide', p };
  });
}

/** Le rapport du script (essai ou réel). `mot` : le libellé d'une origine (noms d'apporteurs et de collègues résolus). PUR. */
export function texteOrigineProprietaires(plan: readonly DecisionOrigine[], o: { reel: boolean; base: string; ecrits: number; mot: (x: OrigineProprietaire) => string }): string {
  const de = <S extends DecisionOrigine['sorte']>(s: S) => plan.filter((d): d is Extract<DecisionOrigine, { sorte: S }> => d.sorte === s);
  const proposees = de('proposee'); const divergentes = de('divergente'); const vides = de('vide'); const deja = de('deja');
  const l: string[] = [];
  l.push(`ORIGINE DU CONTACT DES PROPRIÉTAIRES EXISTANTS — ${o.reel ? 'RÉEL' : 'ESSAI (aucune écriture)'} — base ${o.base}`);
  l.push(`Propriétaires examinés : ${plan.length} · déjà renseignés (non examinés) : ${deja.length}`);
  l.push(`Origine proposée (locations toutes identiques) : ${proposees.length}${o.reel ? ` · écrites : ${o.ecrits}` : ''}`);
  l.push(`  dont avec aussi des locations sans origine : ${proposees.filter((d) => d.vides > 0).length}`);
  l.push(`Origines DIVERGENTES (non touchés) : ${divergentes.length}`);
  l.push(`Aucune origine sur leurs locations, ou aucune location (non touchés, restent « à renseigner ») : ${vides.length}`);
  l.push('', '── PROPOSÉES ──');
  for (const d of proposees) l.push(`  n° ${d.p.id} ${d.p.nom} → ${o.mot(d.origine)} (${d.nb} location(s)${d.vides > 0 ? `, ${d.vides} sans origine` : ''})`);
  l.push('', '── DIVERGENTES (à trancher dans la fiche du propriétaire) ──');
  for (const d of divergentes) l.push(`  n° ${d.p.id} ${d.p.nom} : ${d.origines.map(o.mot).join(' / ')}`);
  l.push('', '── SANS ORIGINE ──');
  for (const d of vides) l.push(`  n° ${d.p.id} ${d.p.nom}${d.p.locations.length === 0 ? ' (aucune location)' : ` (${d.p.locations.length} location(s) sans origine)`}`);
  return `${l.join('\n')}\n`;
}
