import type { LigneExcel, MoisExcel } from './lectureExcel';
import { apporteurDeTexte, typeDeLigne, type ApporteurLu } from './repriseExcel';
import type { CandidatBail, Rapprochement } from './rapprochementImport';
import { SEUIL_DOUTEUX, SEUIL_RATTACHE } from './rapprochementImport';
import type { RegleCommission } from './suivi';
import { type ActiviteCalcul, type Retrocession, totauxPeriode } from './tableauBord';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : LE PLAN D'IMPORT DU SUIVI D'ARNO, ET SON CONTRÔLE AU CENTIME (Arno, 22/10/2026) ════════════
 * Ce que `importer-suivi-location-2026` écrirait (à blanc) ou écrit (`--reel`), ligne par ligne :
 *   · rapprochée (score ≥ 0,80) → rattachée à son bail ; douteuse (≥ 0,50) → importée NON rattachée, le bail proposé est noté ;
 *     non trouvée → « historique non rattaché ». Aucune ligne n'est perdue ;
 *   · « (Avenant) » → type avenant ; honoraires nuls et prime seule → mandat de gestion seul ;
 *   · commission d'apporteur et prime : celles du fichier, telles quelles ; date de signature : le 1er du mois, « supposée » ;
 *   · avec / sans gestion : la ventilation du fichier ; à défaut, le statut du bien rapproché ; à défaut, « sans » et c'est dit ;
 *   · déjà importée (même clé) : rien ne change (rejouable) ; bail déjà suivi dans l'outil : la ligne n'est pas doublée.
 * Le CONTRÔLE : les totaux de chaque mois, recalculés par le tableau de bord sur les lignes du plan, face à ceux du fichier.
 * PUR.
 */

export const SOURCE_IMPORT = 'CA_JBP_2026';
export type EtatLigne = 'a_importer' | 'deja_importee' | 'deja_suivie';

export interface LignePlan {
  ligne: LigneExcel;
  importCle: string;
  rapprochement: Rapprochement;
  type: ActiviteCalcul['type'];
  apporteur: ApporteurLu | null;
  avecGestion: boolean;
  gestionSource: 'fichier' | 'bien' | 'inconnue';
  bailId: number | null;
  etat: EtatLigne;
  commentaire: string[];
}

export interface ContextePlan {
  collaborateurs: readonly string[];
  /** Les clés d'import déjà en base (rejouer ne double rien). */
  dejaImportees: ReadonlySet<string>;
  /** Les baux déjà suivis dans l'outil (saisie, reprise des TTC) : leur ligne n'est pas doublée. */
  bauxSuivis: ReadonlySet<number>;
}

const euros = (x: number): string => `${x.toFixed(2).replace('.', ',')} €`;

export function planifier(mois: readonly MoisExcel[], rapprochements: readonly Rapprochement[], ctx: ContextePlan): LignePlan[] {
  const parCle = new Map(rapprochements.map((r) => [r.cle, r]));
  return mois.flatMap((m) => m.lignes.map((l) => {
    const r = parCle.get(l.cle) ?? { cle: l.cle, candidat: null, score: 0, statut: 'non_rattache' as const };
    const importCle = `${SOURCE_IMPORT}#${l.cle}`;
    const commentaire: string[] = [];
    const rattache = r.statut === 'rattache' && r.candidat !== null;
    if (r.statut === 'douteux' && r.candidat !== null) commentaire.push(`rapprochement douteux (score ${r.score.toFixed(2)}) : bail ${r.candidat.bailId} — ${r.candidat.proprietaire} / ${r.candidat.locataires}`);
    const avecGestion = l.avecGestion ?? (rattache ? r.candidat!.avecGestion : null);
    const gestionSource: LignePlan['gestionSource'] = l.avecGestion !== null ? 'fichier' : avecGestion !== null ? 'bien' : 'inconnue';
    if (gestionSource === 'bien') commentaire.push('avec / sans gestion : absent de la ventilation du fichier, repris du statut du bien');
    if (gestionSource === 'inconnue') commentaire.push('avec / sans gestion : absent de la ventilation du fichier, compté « sans »');
    const suivi = rattache && r.candidat !== null && ctx.bauxSuivis.has(r.candidat.bailId) && typeDeLigne(l) === 'bail';
    const etat: EtatLigne = ctx.dejaImportees.has(importCle) ? 'deja_importee' : suivi ? 'deja_suivie' : 'a_importer';
    return {
      ligne: l, importCle, rapprochement: r, type: typeDeLigne(l), apporteur: apporteurDeTexte(l.apporteurTexte, ctx.collaborateurs),
      avecGestion: avecGestion === true, gestionSource, bailId: rattache ? r.candidat!.bailId : null, etat, commentaire,
    };
  }));
}

/** Une ligne du plan → la ligne d'activité que le tableau de bord recalcule (la même que celle écrite en base). PUR. */
export function versActivite(p: LignePlan, negociateur: { id: number | null; libelle: string }): ActiviteCalcul {
  const l = p.ligne;
  return {
    id: p.importCle, type: p.type, dateSignature: `${l.mois}-01`, dateSupposee: true, libelleProprietaire: l.proprietaire, libelleLocataire: l.locataire,
    honoProprietaireHt: l.honoProprietaireHt, honoLocataireHt: l.honoLocataireHt, primeSaisie: l.prime, mandatGestion: l.prime > 0,
    categoriePrime: l.prime > 0 ? (l.parking || l.prime < 150 ? 'parking' : 'logement') : null,
    apporteurId: null, apporteurNom: p.apporteur?.nom ?? null, apporteurTaux: l.tauxCommission, commissionSaisie: l.commission,
    negociateurId: negociateur.id, negociateurLibelle: negociateur.libelle, avecGestion: p.avecGestion,
    origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: l.parking || (p.rapprochement.candidat?.parking ?? false),
    vacanceJours: null, rattachement: p.bailId !== null ? 'rattache' : p.rapprochement.statut === 'douteux' ? 'douteux' : 'non_rattache',
  };
}

export interface ControleMois {
  mois: string; lignesFichier: number; lignesOutil: number;
  caFichier: number; caOutil: number; apporteursFichier: number; apporteursOutil: number; primesFichier: number; primesOutil: number;
  caNetFichier: number; caNetOutil: number; commissionFichier: number; commissionOutil: number;
  avecFichier: number | null; avecOutil: number; sansFichier: number | null; sansOutil: number; auCentime: boolean;
}

/** Le contrôle mois par mois : les lignes de l'outil (`activites`) recalculées, face aux totaux du fichier. PUR. */
export function controler(mois: readonly MoisExcel[], activites: readonly ActiviteCalcul[], regles: readonly RegleCommission[], retrocessions: readonly Retrocession[]): ControleMois[] {
  const c = (x: number): number => Math.round(x * 100) / 100;
  return mois.map((m) => {
    const t = totauxPeriode(activites, { regles: [...regles], apporteurs: [], retrocessions: [...retrocessions] }, { annee: Number(m.mois.slice(0, 4)), mois: Number(m.mois.slice(5, 7)) });
    const f = m.totaux;
    const auCentime = [[f.caHt, t.ca], [f.apporteurs, t.apporteurs], [f.primes, t.primes], [f.caNet, t.caNet], [f.commissionBrute, t.commission]].every(([a, b]) => c(a) === c(b));
    return {
      mois: m.mois, lignesFichier: m.lignes.length, lignesOutil: t.nb, caFichier: f.caHt, caOutil: t.ca, apporteursFichier: f.apporteurs, apporteursOutil: t.apporteurs,
      primesFichier: f.primes, primesOutil: t.primes, caNetFichier: f.caNet, caNetOutil: t.caNet, commissionFichier: f.commissionBrute, commissionOutil: t.commission,
      avecFichier: f.ventilationAvec, avecOutil: t.avecGestion, sansFichier: f.ventilationSans, sansOutil: t.sansGestion, auCentime,
    };
  });
}

const NOMS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const colonne = (t: string, n: number): string => (t.length >= n ? t : `${' '.repeat(n - t.length)}${t}`);

/** Le tableau de contrôle, en texte (rapport) : une ligne par mois, ✓ quand tout tombe au centime. PUR. */
export function tableauControle(lignes: readonly ControleMois[]): string {
  const tete = ['mois', 'lignes', 'CA fichier', 'CA outil', 'apporteurs f.', 'apporteurs o.', 'primes f.', 'primes o.', 'coms f.', 'coms o.', 'avec gestion f.', 'avec gestion o.', ''];
  const larg = [8, 9, 13, 13, 13, 13, 10, 10, 12, 12, 15, 15, 2];
  const ligne = (v: string[]) => v.map((x, i) => colonne(x, larg[i])).join(' ');
  const total = (k: keyof ControleMois) => lignes.reduce((s, l) => s + (l[k] as number ?? 0), 0);
  return [
    ligne(tete),
    ...lignes.map((l) => ligne([`${NOMS[Number(l.mois.slice(5)) - 1]}`, `${l.lignesFichier}/${l.lignesOutil}`, euros(l.caFichier), euros(l.caOutil), euros(l.apporteursFichier), euros(l.apporteursOutil),
      euros(l.primesFichier), euros(l.primesOutil), euros(l.commissionFichier), euros(l.commissionOutil), l.avecFichier === null ? '—' : euros(l.avecFichier), euros(l.avecOutil), l.auCentime ? '✓' : '✗'])),
    ligne(['TOTAL', `${total('lignesFichier')}/${total('lignesOutil')}`, euros(total('caFichier')), euros(total('caOutil')), euros(total('apporteursFichier')), euros(total('apporteursOutil')),
      euros(total('primesFichier')), euros(total('primesOutil')), euros(total('commissionFichier')), euros(total('commissionOutil')), '', '', lignes.every((l) => l.auCentime) ? '✓' : '✗']),
  ].join('\n');
}

/** Le rapport complet (à blanc ou réel). PUR. */
export function texteRapportImport(o: {
  reel: boolean; base: string; fichier: string; plan: readonly LignePlan[]; mois: readonly MoisExcel[]; controle: readonly ControleMois[];
  negociateur: { id: number | null; libelle: string }; apporteursACreer: readonly ApporteurLu[]; retrocessions: readonly Retrocession[]; disponible: boolean;
}): string {
  const p = o.plan;
  const desc = (x: LignePlan): string => `  · ${x.ligne.mois} ligne ${x.ligne.rang} — ${x.ligne.proprietaire} / ${x.ligne.locataire} — CA ${euros(x.ligne.honoProprietaireHt + x.ligne.honoLocataireHt)}`;
  const avec = (x: LignePlan): string => x.rapprochement.candidat ? ` → bail ${x.rapprochement.candidat.bailId} (bien ${x.rapprochement.candidat.lotId}, entrée ${x.rapprochement.candidat.entree ?? '?'}) : ${x.rapprochement.candidat.proprietaire} / ${x.rapprochement.candidat.locataires} — score ${x.rapprochement.score.toFixed(2)}` : ` — meilleur score ${x.rapprochement.score.toFixed(2)}`;
  const rat = p.filter((x) => x.rapprochement.statut === 'rattache');
  const dou = p.filter((x) => x.rapprochement.statut === 'douteux');
  const non = p.filter((x) => x.rapprochement.statut === 'non_rattache');
  return [
    `IMPORT DU SUIVI LOCATION 2026 — ${o.reel ? 'RÉEL' : 'À BLANC (aucune écriture)'}`,
    `base : ${o.base} · fichier : ${o.fichier} · négociateur des lignes : ${o.negociateur.libelle}${o.negociateur.id === null ? ' (aucun compte trouvé : nom seul)' : ` (compte ${o.negociateur.id})`}`,
    ...(o.disponible ? [] : ['⚠ migration 406 non appliquée sur cette base : rien ne peut être écrit (le plan et le contrôle sont calculés quand même).']),
    '',
    `${p.length} lignes · rapprochées ${rat.length} · douteuses ${dou.length} · non trouvées ${non.length} · avenants ${p.filter((x) => x.type === 'avenant').length} · gestion seule ${p.filter((x) => x.type === 'gestion_seule').length}`,
    `à importer ${p.filter((x) => x.etat === 'a_importer').length} · déjà importées ${p.filter((x) => x.etat === 'deja_importee').length} · bail déjà suivi dans l'outil (non doublées) ${p.filter((x) => x.etat === 'deja_suivie').length}`,
    `seuils : rapprochée ≥ ${SEUIL_RATTACHE.toFixed(2)} ; douteuse ≥ ${SEUIL_DOUTEUX.toFixed(2)} (importée non rattachée, bail proposé noté) ; sinon « historique non rattaché ».`,
    '',
    'CONTRÔLE MOIS PAR MOIS (fichier / outil recalculé, commission = 15 % × CA net + primes − rétrocession) :',
    tableauControle(o.controle),
    '',
    `APPORTEURS À CRÉER (${o.apporteursACreer.length}) : ${o.apporteursACreer.map((a) => `${a.nom} (${a.type})`).join(', ') || 'aucun'}`,
    `RÉTROCESSIONS : ${o.retrocessions.map((r) => `${r.libelle} ${euros(r.montant)} (${r.mois.slice(0, 7)})`).join(', ') || 'aucune'}`,
    '',
    `RAPPROCHÉES (${rat.length}) :`, ...(rat.length ? rat.map((x) => `${desc(x)}${avec(x)}${x.etat === 'deja_suivie' ? ' — BAIL DÉJÀ SUIVI : non doublée' : ''}`) : ['  (aucune)']),
    '',
    `DOUTEUSES (${dou.length}) — importées NON rattachées, le bail proposé est noté sur la ligne :`, ...(dou.length ? dou.map((x) => `${desc(x)}${avec(x)}`) : ['  (aucune)']),
    '',
    `NON TROUVÉES (${non.length}) — « historique non rattaché » :`, ...(non.length ? non.map((x) => `${desc(x)}${avec(x)}`) : ['  (aucune)']),
    '',
    'CE QUE LE FICHIER A D’ÉTRANGE (rien n’est corrigé) :',
    ...o.mois.flatMap((m) => m.anomalies.map((a) => `  · ${m.nomFeuille.trim()} : ${a}`)),
    ...p.filter((x) => x.gestionSource !== 'fichier').map((x) => `  · ${x.ligne.mois} ligne ${x.ligne.rang} : ${x.commentaire.filter((c) => c.startsWith('avec / sans')).join('')}`),
    '',
  ].join('\n');
}
