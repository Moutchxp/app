import type { LigneExcel, MoisExcel } from './lectureExcel';
import { categoriePrimeImport, modePrimeDe, origineDeTexte, retrocessionDuMois, typeDeLigne, type ApporteurLu, type OrigineLue } from './repriseExcel';
import { LIBELLE_ORIGINE_CONTACT } from './suivi';
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
 *   · déjà importée (même clé) : rien ne change (rejouable) ; bail déjà suivi dans l'outil : la ligne n'est pas doublée ;
 *   · 407 (Arno, 23/10/2026) — la colonne G devient l'ORIGINE DU CONTACT (`origineDeTexte`) ; les partenaires sont créés dans
 *     l'annuaire « à rattacher » (leur collègue n'est jamais deviné) ; « X ( Y) » est à arbitrer ; la prime devient un choix
 *     (150 → « 150 € », 15 → « Personnalisé : 15 € », 0 → « Aucune »).
 * Le CONTRÔLE : les totaux de chaque mois, recalculés par le tableau de bord sur les lignes du plan, face à ceux du fichier.
 * PUR.
 */

export const SOURCE_IMPORT = 'CA_JBP_2026';
/** La source d'un fichier de suivi : « CA_JBP_<année du fichier> » (l'historique 2019 → 2025, Arno, 23/10/2026). */
export const sourceDe = (anneeFichier: number): string => `CA_JBP_${anneeFichier}`;
export type EtatLigne = 'a_importer' | 'deja_importee' | 'deja_suivie';

export interface LignePlan {
  ligne: LigneExcel;
  importCle: string;
  /** Le compte du collègue (« collègue directement »), quand il en a un. */
  collegueId?: number | null;
  rapprochement: Rapprochement;
  type: ActiviteCalcul['type'];
  origine: OrigineLue;
  apporteur: ApporteurLu | null;
  avecGestion: boolean;
  gestionSource: 'fichier' | 'bien' | 'inconnue';
  bailId: number | null;
  etat: EtatLigne;
  commentaire: string[];
}

export interface ContextePlan {
  collaborateurs: readonly string[];
  /** Les comptes (pour l'id du collègue nommé dans le fichier). */
  comptes?: readonly { id: number; libelle: string }[];
  /** Les clés d'import déjà en base (rejouer ne double rien). */
  dejaImportees: ReadonlySet<string>;
  /** Les baux déjà suivis dans l'outil (saisie, reprise des TTC) : leur ligne n'est pas doublée. */
  bauxSuivis: ReadonlySet<number>;
  /** La source des clés d'import (« CA_JBP_2020 ») ; par défaut celle de 2026. */
  source?: string;
}

const euros = (x: number): string => `${x.toFixed(2).replace('.', ',')} €`;

export function planifier(mois: readonly MoisExcel[], rapprochements: readonly Rapprochement[], ctx: ContextePlan): LignePlan[] {
  const parCle = new Map(rapprochements.map((r) => [r.cle, r]));
  return mois.flatMap((m) => m.lignes.map((l) => {
    const r = parCle.get(l.cle) ?? { cle: l.cle, candidat: null, score: 0, statut: 'non_rattache' as const };
    const importCle = `${ctx.source ?? SOURCE_IMPORT}#${l.cle}`;
    const commentaire: string[] = [];
    const rattache = r.statut === 'rattache' && r.candidat !== null;
    if (r.statut === 'douteux' && r.candidat !== null) commentaire.push(`rapprochement douteux (score ${r.score.toFixed(2)}) : bail ${r.candidat.bailId} — ${r.candidat.proprietaire} / ${r.candidat.locataires}`);
    const avecGestion = l.avecGestion ?? (rattache ? r.candidat!.avecGestion : null);
    const gestionSource: LignePlan['gestionSource'] = l.avecGestion !== null ? 'fichier' : avecGestion !== null ? 'bien' : 'inconnue';
    if (gestionSource === 'bien') commentaire.push('avec / sans gestion : absent de la ventilation du fichier, repris du statut du bien');
    if (gestionSource === 'inconnue') commentaire.push('avec / sans gestion : absent de la ventilation du fichier, compté « sans »');
    const suivi = rattache && r.candidat !== null && ctx.bauxSuivis.has(r.candidat.bailId) && typeDeLigne(l) === 'bail';
    const etat: EtatLigne = ctx.dejaImportees.has(importCle) ? 'deja_importee' : suivi ? 'deja_suivie' : 'a_importer';
    const origine = origineDeTexte(l.apporteurTexte, ctx.collaborateurs);
    if (origine.aArbitrer) commentaire.push(`origine à arbitrer : « ${l.apporteurTexte} »`);
    const nrm = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const collegueId = origine.collegue === null ? null : ctx.comptes?.find((c) => nrm(c.libelle) === nrm(origine.collegue as string))?.id ?? null;
    return {
      ligne: l, importCle, rapprochement: r, type: typeDeLigne(l), origine, collegueId, apporteur: origine.apporteur,
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
    categoriePrime: categoriePrimeImport({ prime: l.prime, libelleParking: l.parking, lotParking: p.bailId !== null ? (p.rapprochement.candidat?.parking ?? null) : null }),
    apporteurId: null, apporteurNom: p.apporteur?.nom ?? null, apporteurTaux: l.tauxCommission, commissionSaisie: l.commission,
    negociateurId: negociateur.id, negociateurLibelle: negociateur.libelle, avecGestion: p.avecGestion,
    origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null, parking: l.parking || (p.rapprochement.candidat?.parking ?? false),
    vacanceJours: null, rattachement: p.bailId !== null ? 'rattache' : p.rapprochement.statut === 'douteux' ? 'douteux' : 'non_rattache',
    origineContact: p.origine.origine, collegueId: p.collegueId ?? null, collegueLibelle: p.origine.collegue, primeMode: modePrimeDe(l.prime),
  };
}

const PRIMES_REGLE = { primeLogement: 150, primeParking: 15 };

/** L'année d'un fichier de suivi, lue dans son nom (« CA_JBP_2025_3.xlsx », « CA JBP 2025 (3).xlsx » → 2025). PUR. */
export function anneeDuFichier(nom: string): number | null {
  const m = (nom.split('/').pop() ?? nom).match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}

/** Les règles de commission que disent les fichiers : une version datée à chaque changement de taux (12,5 % → 15 %). PUR. */
export function reglesDesFichiers(mois: readonly MoisExcel[]): RegleCommission[] {
  const regles: RegleCommission[] = [];
  for (const m of [...mois].sort((a, b) => a.mois.localeCompare(b.mois))) {
    const t = m.totaux.tauxNegociateur;
    if (t === null || regles.at(-1)?.tauxNegociateur === t) continue;
    regles.push({ depuis: `${m.mois}-01`, tauxNegociateur: t, ...PRIMES_REGLE });
  }
  return regles;
}

/** Les rétrocessions d'un mois : celle du fichier (`-F24`), et la ligne que la formule retire de la base (« hors commission »). PUR. */
export function retrocessionsDuMois(m: MoisExcel, negociateur: { id: number | null; libelle: string }): Retrocession[] {
  const r = retrocessionDuMois(m, { negociateurId: negociateur.id, negociateurLibelle: negociateur.libelle });
  const toutes: Retrocession[] = m.totaux.retrocessions === undefined ? (r === null ? [] : [r])
    : m.totaux.retrocessions.filter((x) => x.montant > 0).map((x) => ({ negociateurId: negociateur.id, negociateurLibelle: negociateur.libelle, mois: `${m.mois}-01`, montant: x.montant, libelle: x.libelle }));
  const taux = m.totaux.tauxNegociateur ?? 0;
  const hors: Retrocession[] = (m.totaux.horsCommission ?? []).map((h) => {
    const l = m.lignes.find((x) => x.rang === h.rang);
    return { negociateurId: negociateur.id, negociateurLibelle: negociateur.libelle, mois: `${m.mois}-01`, montant: taux * h.montant,
      libelle: `Hors commission (formule du fichier) : ligne ${h.rang}${l ? ` — ${l.proprietaire}` : ''}` };
  });
  return [...toutes, ...hors];
}

export interface ControleMois {
  mois: string; lignesFichier: number; lignesOutil: number;
  caFichier: number; caOutil: number; apporteursFichier: number; apporteursOutil: number; primesFichier: number; primesOutil: number;
  caNetFichier: number; caNetOutil: number; commissionFichier: number; commissionOutil: number;
  avecFichier: number | null; avecOutil: number; sansFichier: number | null; sansOutil: number; auCentime: boolean;
  /** « Avec gestion » contrôlé : seulement quand la ventilation du fichier classe TOUTES les lignes (sinon : non contrôlable). */
  avecControle: boolean;
  /** Les écarts expliqués du mois (formule de total qui oublie des lignes, commission de vente) : l'outil vaut « fichier + écarts ». */
  ecarts: string[];
}

/** Le contrôle mois par mois : les lignes de l'outil (`activites`) recalculées, face aux totaux du fichier. PUR. */
export function controler(mois: readonly MoisExcel[], activites: readonly ActiviteCalcul[], regles: readonly RegleCommission[], retrocessions: readonly Retrocession[]): ControleMois[] {
  // Au centime : moins d'un demi-centime d'écart (comparer deux arrondis ferait tomber 1 753,375 d'un côté ou de l'autre).
  const egal = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;
  return mois.map((m) => {
    const t = totauxPeriode(activites, { regles: [...regles], apporteurs: [], retrocessions: [...retrocessions] }, { annee: Number(m.mois.slice(0, 4)), mois: Number(m.mois.slice(5, 7)) });
    const f = m.totaux;
    const avecControle = f.ventilationAvec !== null && m.lignes.every((l) => l.avecGestion !== null || l.caFichier === 0);
    const e = (f.ecarts ?? []).reduce((x, y) => ({ ca: x.ca + y.ca, apporteurs: x.apporteurs + y.apporteurs, primes: x.primes + y.primes, commission: x.commission + y.commission }),
      { ca: 0, apporteurs: 0, primes: 0, commission: 0 });
    const auCentime = [[f.caHt + e.ca, t.ca], [f.apporteurs + e.apporteurs, t.apporteurs], [f.primes + e.primes, t.primes], [f.caNet + e.ca - e.apporteurs, t.caNet],
      [f.commissionBrute + e.commission, t.commission], ...(avecControle ? [[f.ventilationAvec as number, t.avecGestion]] : [])].every(([a, b]) => egal(a, b));
    return {
      mois: m.mois, lignesFichier: m.lignes.length, lignesOutil: t.nb, caFichier: f.caHt, caOutil: t.ca, apporteursFichier: f.apporteurs, apporteursOutil: t.apporteurs,
      primesFichier: f.primes, primesOutil: t.primes, caNetFichier: f.caNet, caNetOutil: t.caNet, commissionFichier: f.commissionBrute, commissionOutil: t.commission,
      avecFichier: f.ventilationAvec, avecOutil: t.avecGestion, sansFichier: f.ventilationSans, sansOutil: t.sansGestion, auCentime, avecControle,
      ecarts: (f.ecarts ?? []).map((x) => x.libelle),
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
  const nomMois = (m: string): string => (lignes.some((x) => x.mois.slice(0, 4) !== lignes[0].mois.slice(0, 4)) ? `${NOMS[Number(m.slice(5)) - 1]}${m.slice(2, 4)}` : NOMS[Number(m.slice(5)) - 1]);
  const total = (k: keyof ControleMois) => lignes.reduce((s, l) => s + (l[k] as number ?? 0), 0);
  return [
    ligne(tete),
    ...lignes.map((l) => ligne([nomMois(l.mois), `${l.lignesFichier}/${l.lignesOutil}`, euros(l.caFichier), euros(l.caOutil), euros(l.apporteursFichier), euros(l.apporteursOutil),
      euros(l.primesFichier), euros(l.primesOutil), euros(l.commissionFichier), euros(l.commissionOutil), l.avecFichier === null ? '—' : `${euros(l.avecFichier)}${l.avecControle ? '' : '*'}`, euros(l.avecOutil), l.auCentime ? (l.ecarts.length ? '✓²' : '✓') : '✗'])),
    ligne(['TOTAL', `${total('lignesFichier')}/${total('lignesOutil')}`, euros(total('caFichier')), euros(total('caOutil')), euros(total('apporteursFichier')), euros(total('apporteursOutil')),
      euros(total('primesFichier')), euros(total('primesOutil')), euros(total('commissionFichier')), euros(total('commissionOutil')), '', '', lignes.every((l) => l.auCentime) ? '✓' : '✗']),
  ].join('\n');
}

/** Le rapport complet (à blanc ou réel). PUR. */
export function texteRapportImport(o: {
  reel: boolean; base: string; fichier: string; plan: readonly LignePlan[]; mois: readonly MoisExcel[]; controle: readonly ControleMois[];
  negociateur: { id: number | null; libelle: string }; apporteursACreer: readonly ApporteurLu[]; retrocessions: readonly Retrocession[]; disponible: boolean;
  /** « IMPORT DU SUIVI LOCATION 2026 » par défaut. */
  titre?: string;
}): string {
  const p = o.plan;
  const desc = (x: LignePlan): string => `  · ${x.ligne.mois} ligne ${x.ligne.rang} — ${x.ligne.proprietaire} / ${x.ligne.locataire} — CA ${euros(x.ligne.honoProprietaireHt + x.ligne.honoLocataireHt)}`;
  const avec = (x: LignePlan): string => x.rapprochement.candidat ? ` → bail ${x.rapprochement.candidat.bailId} (bien ${x.rapprochement.candidat.lotId}, entrée ${x.rapprochement.candidat.entree ?? '?'}) : ${x.rapprochement.candidat.proprietaire} / ${x.rapprochement.candidat.locataires} — score ${x.rapprochement.score.toFixed(2)}` : ` — meilleur score ${x.rapprochement.score.toFixed(2)}`;
  const rat = p.filter((x) => x.rapprochement.statut === 'rattache');
  const dou = p.filter((x) => x.rapprochement.statut === 'douteux');
  const non = p.filter((x) => x.rapprochement.statut === 'non_rattache');
  return [
    `${o.titre ?? 'IMPORT DU SUIVI LOCATION 2026'} — ${o.reel ? 'RÉEL' : 'À BLANC (aucune écriture)'}`,
    `base : ${o.base} · fichier : ${o.fichier} · négociateur des lignes : ${o.negociateur.libelle}${o.negociateur.id === null ? ' (aucun compte trouvé : nom seul)' : ` (compte ${o.negociateur.id})`}`,
    ...(o.disponible ? [] : ['⚠ migration 406 non appliquée sur cette base : rien ne peut être écrit (le plan et le contrôle sont calculés quand même).']),
    '',
    `${p.length} lignes · rapprochées ${rat.length} · douteuses ${dou.length} · non trouvées ${non.length} · avenants ${p.filter((x) => x.type === 'avenant').length} · gestion seule ${p.filter((x) => x.type === 'gestion_seule').length}`,
    `à importer ${p.filter((x) => x.etat === 'a_importer').length} · déjà importées ${p.filter((x) => x.etat === 'deja_importee').length} · bail déjà suivi dans l'outil (non doublées) ${p.filter((x) => x.etat === 'deja_suivie').length}`,
    `seuils : rapprochée ≥ ${SEUIL_RATTACHE.toFixed(2)} ; douteuse ≥ ${SEUIL_DOUTEUX.toFixed(2)} (importée non rattachée, bail proposé noté) ; sinon « historique non rattaché ».`,
    '',
    'CONTRÔLE MOIS PAR MOIS (fichier / outil recalculé, commission = taux du mois × CA net + primes − rétrocession) :',
    tableauControle(o.controle),
    ...(o.controle.some((x) => x.avecFichier !== null && !x.avecControle) ? ['  * « avec gestion » non contrôlable ce mois-là : la ventilation du fichier ne classe pas toutes les lignes.'] : []),
    ...(o.controle.some((x) => x.ecarts.length) ? ['  ✓² juste au centime une fois l’écart expliqué du fichier compté (détail dans « CE QUE LE FICHIER A D’ÉTRANGE »).'] : []),
    '',
    `APPORTEURS CRÉÉS « À RATTACHER » (${o.apporteursACreer.length}) — dans l'annuaire, sans collègue (jamais deviné) : ${o.apporteursACreer.map((a) => a.nom).join(', ') || 'aucun'}`,
    `ORIGINES DU CONTACT : ${Object.entries(p.reduce<Record<string, number>>((acc, x) => { const k = x.origine.origine === null ? (x.origine.aArbitrer ? 'à arbitrer' : 'non renseignée') : LIBELLE_ORIGINE_CONTACT[x.origine.origine]; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    `PRIMES : « 150 € » ${p.filter((x) => modePrimeDe(x.ligne.prime) === 'regle').length} · « Personnalisé » ${p.filter((x) => modePrimeDe(x.ligne.prime) === 'personnalise').map((x) => `${euros(x.ligne.prime)} (${x.ligne.mois} ligne ${x.ligne.rang})`).join(', ') || 'aucune'} · « Aucune » ${p.filter((x) => x.ligne.prime === 0).length}`,
    `RÉTROCESSIONS : ${o.retrocessions.map((r) => `${r.libelle} ${euros(r.montant)} (${r.mois.slice(0, 7)})`).join(', ') || 'aucune'}`,
    '',
    `RAPPROCHÉES (${rat.length}) :`, ...(rat.length ? rat.map((x) => `${desc(x)}${avec(x)}${x.etat === 'deja_suivie' ? ' — BAIL DÉJÀ SUIVI : non doublée' : ''}`) : ['  (aucune)']),
    '',
    `DOUTEUSES (${dou.length}) — importées NON rattachées, le bail proposé est noté sur la ligne :`, ...(dou.length ? dou.map((x) => `${desc(x)}${avec(x)}`) : ['  (aucune)']),
    '',
    `NON TROUVÉES (${non.length}) — « historique non rattaché » :`, ...(non.length ? non.map((x) => `${desc(x)}${avec(x)}`) : ['  (aucune)']),
    '',
    `ORIGINE À ARBITRER (${p.filter((x) => x.origine.aArbitrer).length}) — l'origine reste vide, à choisir dans la feuille du mois :`,
    ...(p.some((x) => x.origine.aArbitrer) ? p.filter((x) => x.origine.aArbitrer).map((x) => `${desc(x)} — colonne G : « ${x.ligne.apporteurTexte} » (apporteur gardé : ${x.apporteur?.nom}, commission ${euros(x.ligne.commission)})`) : ['  (aucune)']),
    '',
    'CE QUE LE FICHIER A D’ÉTRANGE (rien n’est corrigé) :',
    ...o.mois.flatMap((m) => m.anomalies.map((a) => `  · ${m.nomFeuille.trim()} : ${a}`)),
    ...p.filter((x) => x.gestionSource !== 'fichier').map((x) => `  · ${x.ligne.mois} ligne ${x.ligne.rang} : ${x.commentaire.filter((c) => c.startsWith('avec / sans')).join('')}`),
    '',
  ].join('\n');
}
