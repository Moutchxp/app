import { normaliserMandat } from '../transaction/mandat';
import { LIBELLE_MANDAT, type Mandat, type SorteMandat } from './mandatBien';
import { cleEnsemble } from './mandatParBien';

/**
 * ══ 🔴🔴 LA REPRISE DES N° DE MANDAT SUR LES BIENS — LE PLAN (Arno, 18/11/2026, « Mandat par bien », lot 3). MODULE PUR. ══════════════════════════
 * Pour chaque propriétaire qui porte un n° de mandat sur sa fiche (372 / 379, et sa date 397) : ses biens qui le recevraient, ceux qui en ont déjà un
 * autre, et les n° qui seraient partagés entre propriétaires différents (conflits à arbitrer). Décision d'Arno : « Rien n'est effacé. » ; « Le script de
 * reprise reste à blanc par défaut » ; et la règle : un même n° ne couvre que les biens d'EXACTEMENT le même ensemble de propriétaires.
 * Un bien reçoit le n° de la sorte de son statut (en gestion → mandat de gestion ; location seule → mandat de transaction locative) ; une annexe
 * rattachée n'en reçoit pas (elle lit celui de son logement) ; un bien qui a déjà un n° de cette sorte le garde. La fiche du propriétaire n'est
 * jamais touchée.
 */
export interface ProprietaireLu { id: number; nom: string; gestion: Mandat; transaction: Mandat }
export interface BienLu { lotId: number; adresse: string; statut: string | null; annexeRattachee: boolean; proprietaires: number[]; gestion: Mandat; transaction: Mandat }

export interface Affectation { lotId: number; adresse: string; sorte: SorteMandat; numero: string; signeLe: string | null; depuis: number[] }
export interface PlanReprise {
  affectations: Affectation[];
  /** le bien porte déjà ce même n° : rien à faire */
  deja: { lotId: number; adresse: string; sorte: SorteMandat; numero: string }[];
  /** le bien porte déjà un AUTRE n° : gardé, signalé */
  autres: { lotId: number; adresse: string; sorte: SorteMandat; sien: string; fiche: string }[];
  /** ses copropriétaires portent des n° différents : rien n'est écrit, à arbitrer */
  plusieurs: { lotId: number; adresse: string; sorte: SorteMandat; numeros: string[] }[];
  /** un même n° chez des ensembles de propriétaires différents : rien n'est écrit pour ce n°, à arbitrer */
  conflits: { sorte: SorteMandat; numero: string; biens: { lotId: number; adresse: string; proprietaires: number[] }[] }[];
  /** un n° de fiche qu'aucun bien ne reçoit (aucun bien de ce statut) : il reste sur la fiche */
  restentSurLaFiche: { proprietaireId: number; nom: string; sorte: SorteMandat; numero: string }[];
}

const STATUT_DE: Record<SorteMandat, string> = { gestion: 'en_gestion', transaction: 'location_seule' };

/** LE PLAN. PUR. */
export function planRepriseMandats(proprietaires: readonly ProprietaireLu[], biens: readonly BienLu[]): PlanReprise {
  const plan: PlanReprise = { affectations: [], deja: [], autres: [], plusieurs: [], conflits: [], restentSurLaFiche: [] };
  for (const sorte of ['gestion', 'transaction'] as const) {
    const parId = new Map(proprietaires.filter((p) => normaliserMandat(p[sorte].numero) !== null).map((p) => [p.id, p]));
    const candidats: Affectation[] = [];
    const recus = new Set<string>();
    for (const b of biens) {
      if (b.annexeRattachee || b.statut !== STATUT_DE[sorte]) continue;
      const siens = b.proprietaires.map((id) => parId.get(id)).filter((p): p is ProprietaireLu => p !== undefined);
      if (siens.length === 0) continue;
      const numeros = [...new Map(siens.map((p) => [normaliserMandat(p[sorte].numero)!, p[sorte].numero!.trim()])).values()];
      for (const p of siens) recus.add(`${p.id}`);
      const actuel = normaliserMandat(b[sorte].numero);
      if (numeros.length > 1) { plan.plusieurs.push({ lotId: b.lotId, adresse: b.adresse, sorte, numeros }); continue; }
      const numero = numeros[0];
      if (actuel !== null) {
        if (actuel === normaliserMandat(numero)) plan.deja.push({ lotId: b.lotId, adresse: b.adresse, sorte, numero });
        else plan.autres.push({ lotId: b.lotId, adresse: b.adresse, sorte, sien: b[sorte].numero!, fiche: numero });
        continue;
      }
      const date = siens.map((p) => p[sorte].signeLe).find((d) => d !== null) ?? null;
      candidats.push({ lotId: b.lotId, adresse: b.adresse, sorte, numero, signeLe: b[sorte].signeLe ?? date, depuis: siens.map((p) => p.id) });
    }
    // un même n° (forme de comparaison) chez des ensembles de propriétaires différents — biens déjà numérotés compris : conflit, rien n'est écrit
    const porteurs = new Map<string, { lotId: number; adresse: string; proprietaires: number[]; candidat: boolean }[]>();
    for (const b of biens) {
      const f = normaliserMandat(b[sorte].numero);
      if (f !== null) porteurs.set(f, [...(porteurs.get(f) ?? []), { lotId: b.lotId, adresse: b.adresse, proprietaires: b.proprietaires, candidat: false }]);
    }
    for (const c of candidats) {
      const f = normaliserMandat(c.numero)!;
      const b = biens.find((x) => x.lotId === c.lotId)!;
      porteurs.set(f, [...(porteurs.get(f) ?? []), { lotId: c.lotId, adresse: c.adresse, proprietaires: b.proprietaires, candidat: true }]);
    }
    const enConflit = new Set<string>();
    for (const [f, l] of porteurs) {
      if (!l.some((x) => x.candidat)) continue;
      if (new Set(l.map((x) => cleEnsemble(x.proprietaires))).size > 1) {
        enConflit.add(f);
        plan.conflits.push({ sorte, numero: candidats.find((c) => normaliserMandat(c.numero) === f)!.numero, biens: l.map(({ lotId, adresse, proprietaires: p }) => ({ lotId, adresse, proprietaires: p })) });
      }
    }
    plan.affectations.push(...candidats.filter((c) => !enConflit.has(normaliserMandat(c.numero)!)));
    for (const p of parId.values()) if (!recus.has(`${p.id}`)) plan.restentSurLaFiche.push({ proprietaireId: p.id, nom: p.nom, sorte, numero: p[sorte].numero!.trim() });
  }
  return plan;
}

/** LE RAPPORT lisible. PUR. */
export function texteRapportMandats(plan: PlanReprise, base: string, quand: string, reel: boolean): string {
  const M = (s: SorteMandat): string => LIBELLE_MANDAT[s];
  const l: string[] = [
    `${reel ? 'RAPPORT DE REPRISE' : 'RAPPORT À BLANC'} — LES N° DE MANDAT PORTÉS PAR CHAQUE BIEN (« Mandat par bien », lot 3)`,
    `Base : ${base} — le ${quand}. ${reel ? 'Écrit : seulement les biens sans n° de cette sorte ; la fiche des propriétaires n’est jamais touchée.' : 'AUCUNE ÉCRITURE : ce rapport dit ce que la reprise ferait.'} Rien n’est effacé.`,
    '', 'RÉSUMÉ',
    `  Biens qui recevraient le n° de leur(s) propriétaire(s) : ${plan.affectations.length}`,
    `  Biens qui portent déjà ce même n° : ${plan.deja.length}`,
    `  Biens qui portent déjà un AUTRE n° (gardé) : ${plan.autres.length}`,
    `  Biens dont les copropriétaires portent des n° différents (à arbitrer, rien d’écrit) : ${plan.plusieurs.length}`,
    `  N° partagés entre propriétaires différents (conflits à arbitrer, rien d’écrit) : ${plan.conflits.length}`,
    `  N° qui restent sur la fiche (aucun bien de ce statut) : ${plan.restentSurLaFiche.length}`,
    '', 'LES BIENS QUI RECEVRAIENT UN N°',
    ...(plan.affectations.length === 0 ? ['  (aucun)'] : plan.affectations.map((a) => `  · bien ${a.lotId} — ${a.adresse} → ${M(a.sorte)} n° ${a.numero}${a.signeLe ? `, signé le ${a.signeLe.split('-').reverse().join('/')}` : ''} (fiche des propriétaires ${a.depuis.join(', ')})`)),
    '', 'DÉJÀ LE MÊME N°', ...(plan.deja.length === 0 ? ['  (aucun)'] : plan.deja.map((d) => `  · bien ${d.lotId} — ${d.adresse} : ${M(d.sorte)} n° ${d.numero}`)),
    '', 'UN AUTRE N° DÉJÀ SUR LE BIEN (gardé)', ...(plan.autres.length === 0 ? ['  (aucun)'] : plan.autres.map((d) => `  · bien ${d.lotId} — ${d.adresse} : ${M(d.sorte)} n° ${d.sien} sur le bien ; n° ${d.fiche} sur la fiche`)),
    '', 'À ARBITRER — DES COPROPRIÉTAIRES AUX N° DIFFÉRENTS', ...(plan.plusieurs.length === 0 ? ['  (aucun)'] : plan.plusieurs.map((d) => `  · bien ${d.lotId} — ${d.adresse} : ${M(d.sorte)} n° ${d.numeros.join(' / ')}`)),
    '', 'À ARBITRER — UN MÊME N° CHEZ DES PROPRIÉTAIRES DIFFÉRENTS', ...(plan.conflits.length === 0 ? ['  (aucun)'] : plan.conflits.map((c) => `  · ${M(c.sorte)} n° ${c.numero} : ${c.biens.map((b) => `bien ${b.lotId} (${b.adresse} ; propriétaires ${b.proprietaires.join(', ')})`).join(' | ')}`)),
    '', 'RESTENT SUR LA FICHE DU PROPRIÉTAIRE', ...(plan.restentSurLaFiche.length === 0 ? ['  (aucun)'] : plan.restentSurLaFiche.map((r) => `  · ${r.nom} (${r.proprietaireId}) : ${M(r.sorte)} n° ${r.numero}`)),
  ];
  return `${l.join('\n')}\n`;
}
