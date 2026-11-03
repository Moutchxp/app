'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { EnteteAide, eur, MOT_UNITE, useAffichage } from '../transaction/commun';
import { estMontantSaisi } from '../../../../lib/mon-espace/couts';
import { coutsDuPoint } from '../../../../lib/mon-espace/couts';
import { completude, libelleMois, moisProposes, postesSaisis, type MoisAn, type PosteDuMois, type Validation } from '../../../../lib/mon-espace/saisieMois';
import { profilsPourSalaire, type ProfilCout } from '../../../../lib/admin/fonctionsCompteModele';
import { mentionProrata } from '../../../../lib/admin/activitePrincipale';
import { partDuSalaire, type CoutLigne, type FamilleCout } from '../../../../lib/transaction/coutsSaisis';
import type { EntreesCoutsGlobaux } from '../../../../lib/transaction/coutsGlobal';
import type { MontantC } from '../../../../lib/transaction/partAgence';
import type { Societe } from '../../../../lib/transaction/modele';
import { LIBELLE_AGENCE } from '../../../../lib/mon-espace/agence';
import { lireMontant, posterCout } from './EditionCouts';

/**
 * ══ 🔴 « LES COÛTS », LOT 3 (Arno, 03/11/2026, C15 / C16 / C17) — LA PAGE « SAISIR LES COÛTS DU MOIS » ═════════════════════════════════════════════
 * Ouverte par le bouton (ou le rappel) de l'onglet « Les coûts ». En tête : le mois (le mois précédent par défaut, les 6 derniers mois révolus) et la
 * structure (CRITERIMMO ou MACJ ; FUSION ne se saisit pas). Trois blocs Vente / Location / Gestion listent TOUS les postes du mois :
 *   · les postes saisis : des champs (salariés et leurs profils, lignes « Autres », ADHOC, MONGA) et la case « complet pour ce mois » (0 compris) ;
 *   · les postes automatiques : leur montant, en lecture, et « corriger à la source » (C4).
 * « Enregistrer » écrit LES MÊMES enregistrements que la saisie dans les tableaux (lot 2 : mêmes gestes, journal, garde de version — un conflit
 * arrête tout et le dit), puis les validations, et revient à l'onglet sur l'année du mois saisi. Utilisable au téléphone (390 px).
 */
export interface DonneesPageSaisie {
  lignes: readonly CoutLigne[]; profils: readonly ProfilCout[]; validations: readonly Validation[] | null;
  versionsGestion: Readonly<Record<string, { version: number; origine: string }>>; monga: boolean;
  gestionDuMois: (m: MoisAn) => { adhoc: number | null; monga: number | null };
}
interface Brouillon { id: number | null; version: number; compte: string; libelle: string; montant: string;
  /** R2 — « Autres » : TVA 20 % (défaut) ou sans TVA. */
  tva: boolean; retirer: boolean; initial: string }
const MOT_FAMILLE: Record<FamilleCout, string> = { vente: 'Vente', location: 'Location', gestion: 'Gestion' };
const ecrireMontant = (x: number | null): string => (x === null ? '' : x.toFixed(2).replace('.', ','));
const cle = (p: Pick<PosteDuMois, 'famille' | 'poste'>): string => `${p.famille}-${p.poste}`;

export function SaisieMoisCouts({ d, eC, jour, societeInitiale, onRetour, onEcrit }: { d: DonneesPageSaisie; eC: EntreesCoutsGlobaux; jour: string; societeInitiale: Societe;
  onRetour: (m: MoisAn | null) => void; onEcrit: () => void }) {
  const u = useAffichage();
  const k = u === 'ht' ? 'htC' : 'ttcC';
  const choix = moisProposes(jour);
  const [mois, setMois] = useState<MoisAn>(choix[0]);
  const [societe, setSociete] = useState<Societe>(societeInitiale);
  const cleMois = `${mois.annee}-${String(mois.mois).padStart(2, '0')}`;
  const adhocImporte = d.versionsGestion[cleMois]?.origine === 'import';
  const postes = postesSaisis(societe, { adhocImporte, monga: d.monga });
  const validations = d.validations ?? [];
  // les brouillons : repris à chaque mois / structure (la clé du composant enfant)
  // 🔴 D24 — l'en-tête collant, sur UNE ligne : mois · structure · (état global, posé par le formulaire) · « Retour aux coûts »
  const tete = <>
    <label className="mes-saisie-champ"><span>Mois</span>
      <select value={cleMois} onChange={(e) => { const [a, m] = e.target.value.split('-').map(Number); setMois({ annee: a, mois: m }); }} data-choix-mois>
        {choix.map((m) => { const v = `${m.annee}-${String(m.mois).padStart(2, '0')}`; return <option key={v} value={v}>{libelleMois(m)}</option>; })}
      </select></label>
    <div className="trx-unites mes-saisie-structures" role="group" aria-label="Structure" data-choix-structure>
      {(['criterimmo', 'macj'] as const).map((s) => <button key={s} type="button" className="trx-unite" aria-pressed={societe === s} onClick={() => setSociete(s)} data-structure={s}>{LIBELLE_AGENCE[s]}</button>)}
    </div>
  </>;
  return (
    <section className="tdb-section mes-saisie-mois" aria-labelledby="mes-saisie-titre" data-saisie-mois={`${societe}-${cleMois}`}>
      <style>{CSS_SAISIE_MOIS}</style>
      <h3 id="mes-saisie-titre" className="mes-saisie-titre">Saisir les coûts du mois</h3>
      <FormulaireMois key={`${societe}-${cleMois}`} d={d} eC={eC} mois={mois} societe={societe} postes={postes} validations={validations} k={k} unite={MOT_UNITE[u]} tete={tete}
        retour={<button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => onRetour(null)} data-retour-couts>Retour aux coûts</button>}
        onFini={() => { onEcrit(); onRetour(mois); }} onEcrit={onEcrit} />
    </section>
  );
}

function FormulaireMois({ d, eC, mois, societe, postes, validations, k, unite, tete, retour, onFini, onEcrit }: { d: DonneesPageSaisie; eC: EntreesCoutsGlobaux; mois: MoisAn; societe: Societe;
  postes: readonly PosteDuMois[]; validations: readonly Validation[]; k: 'htC' | 'ttcC'; unite: string; tete: ReactNode; retour: ReactNode; onFini: () => void; onEcrit: () => void }) {
  const lignesDe = (p: PosteDuMois): CoutLigne[] => d.lignes.filter((l) => l.societe === societe && l.famille === p.famille && l.poste === p.poste && l.annee === mois.annee && l.mois === mois.mois);
  // 🔴 D35 — le mois d'un changement d'activité principale, le salaire est dans les deux activités : il se modifie (mois entier) dans la NOUVELLE,
  // l'autre montre sa part (« prorata 15/30 j »), en lecture
  const modifiableIci = (l: CoutLigne): boolean => l.prorata === undefined || l.prorata.derniere;
  const principalesDe = (compte: string) => d.profils.find((x) => String(x.id) === compte)?.principales;
  const g = d.gestionDuMois(mois);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon[]>>(() => Object.fromEntries(postes.filter((p) => p.poste === 'salaires' || p.poste === 'autres')
    .map((p) => [cle(p), lignesDe(p).filter(modifiableIci).map((l) => { const montant = ecrireMontant(l.montantSaisiHt ?? l.montantHt); const compte = String(l.compteId ?? ''); const libelle = l.libelle ?? '';
      return { id: l.id, version: l.version, compte, libelle, montant, tva: l.tva === true, retirer: false, initial: `${compte}|${libelle}|${montant}|${l.tva === true}` }; })])));
  const [gestion, setGestion] = useState<Record<'adhoc' | 'monga', string>>({ adhoc: ecrireMontant(g.adhoc), monga: ecrireMontant(g.monga) });
  const [complets, setComplets] = useState<Record<string, boolean>>(() => Object.fromEntries(postes.map((p) => [cle(p), validations.some((v) => v.societe === societe
    && v.famille === p.famille && v.poste === p.poste && v.annee === mois.annee && v.mois === mois.mois)])));
  const [message, setMessage] = useState<{ texte: string; conflit: boolean } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const p0 = useMemo(() => coutsDuPoint(eC, societe, mois.annee, mois.mois), [eC, societe, mois]);
  const vue: Validation[] = postes.filter((p) => complets[cle(p)]).map((p) => ({ societe, famille: p.famille, poste: p.poste, annee: mois.annee, mois: mois.mois }));
  const etat = completude(postes, vue, societe, mois);
  const changer = (c: string, i: number, x: Partial<Brouillon>) => setBrouillons((b) => ({ ...b, [c]: b[c].map((y, j) => (j === i ? { ...y, ...x } : y)) }));
  const ajouterLigne = (c: string) => setBrouillons((b) => ({ ...b, [c]: [...b[c], { id: null, version: 0, compte: '', libelle: '', montant: '', tva: true, retirer: false, initial: '|||' }] }));

  const enregistrer = async (): Promise<void> => {
    setMessage(null);
    // 1. tout vérifier avant d'écrire quoi que ce soit
    const gestes: unknown[] = [];
    for (const p of postes) {
      if (p.poste === 'adhoc' || p.poste === 'monga') {
        const v = lireMontant(gestion[p.poste]);
        if (v !== null && !estMontantSaisi(v)) { setMessage({ texte: `${p.libelle} : montant invalide (un nombre positif, deux décimales au plus).`, conflit: false }); return; }
        const avant = p.poste === 'adhoc' ? g.adhoc : g.monga;
        if (v !== avant) gestes.push({ action: 'gestion-poste', annee: mois.annee, mois: mois.mois, poste: p.poste, montantHt: v, version: d.versionsGestion[`${mois.annee}-${String(mois.mois).padStart(2, '0')}`]?.version ?? 0 });
        continue;
      }
      for (const b of brouillons[cle(p)] ?? []) {
        if (b.id !== null && b.retirer) { gestes.push({ action: 'ligne-retirer', id: b.id, version: b.version }); continue; }
        const vide = b.montant.trim() === '' && b.compte === '' && b.libelle.trim() === '';
        if (b.id === null && vide) continue;
        const m = lireMontant(b.montant);
        if (m === null || !estMontantSaisi(m)) { setMessage({ texte: `${MOT_FAMILLE[p.famille]} — ${p.libelle} : montant invalide (un nombre positif, deux décimales au plus).`, conflit: false }); return; }
        if (p.poste === 'salaires' && b.compte === '') { setMessage({ texte: `${MOT_FAMILLE[p.famille]} — salaires : choisissez le salarié de chaque ligne.`, conflit: false }); return; }
        if (p.poste === 'autres' && b.libelle.trim() === '') { setMessage({ texte: `${MOT_FAMILLE[p.famille]} — autres : donnez un libellé à chaque ligne.`, conflit: false }); return; }
        if (b.id === null) gestes.push({ action: 'ligne-ajouter', ligne: { societe, famille: p.famille, poste: p.poste, annee: mois.annee, mois: mois.mois,
          compteId: p.poste === 'salaires' ? Number(b.compte) : null, libelle: p.poste === 'autres' ? b.libelle.trim() : null, montantHt: m, tva: p.poste === 'autres' ? b.tva : false } });
        else if (`${b.compte}|${b.libelle}|${b.montant}|${b.tva}` !== b.initial) gestes.push({ action: 'ligne-modifier', id: b.id, version: b.version, montantHt: m,
          ...(p.poste === 'salaires' ? { compteId: Number(b.compte) } : { libelle: b.libelle.trim(), tva: b.tva }) });
      }
    }
    if (d.validations !== null) for (const p of postes) {
      const avant = validations.some((v) => v.societe === societe && v.famille === p.famille && v.poste === p.poste && v.annee === mois.annee && v.mois === mois.mois);
      if (avant !== complets[cle(p)]) gestes.push({ action: 'valider', validation: { societe, famille: p.famille, poste: p.poste, annee: mois.annee, mois: mois.mois }, valide: complets[cle(p)] });
    }
    // 2. écrire, geste par geste ; le premier refus arrête tout (ce qui est écrit l'est, journalisé ; le message le dit)
    setEnvoi(true);
    let faits = 0;
    for (const x of gestes) {
      const r = await posterCout(x);
      if (!r.ok) {
        setEnvoi(false); if (faits > 0) onEcrit();
        setMessage({ texte: `${r.motif ?? 'Enregistrement impossible.'}${faits > 0 ? ` (${faits} modification${faits > 1 ? 's' : ''} déjà enregistrée${faits > 1 ? 's' : ''})` : ''}`, conflit: r.statut === 409 });
        return;
      }
      faits += 1;
    }
    setEnvoi(false);
    onFini();
  };

  // ── 🔴 D24 — le rendu : compact, une bande de couleur par activité (les jetons du graphique), une grille Poste | Montant HT | TVA | ✓ ──
  const ka = k === 'htC' ? 'ttcC' : 'htC';
  const montant = (m: MontantC) => <>{eur(m[k] / 100)} <small className="loc-muet">({eur(m[ka] / 100)} {unite === 'HT' ? 'TTC' : 'HT'})</small></>;
  // les calculés de chaque activité (C4 : ils se corrigent à la source) ; la somme = ce que les tableaux comptent (le variable calculé : hors totaux)
  const auto = (famille: FamilleCout): { libelle: string; m: MontantC; info?: boolean }[] => (famille === 'vente'
    ? [{ libelle: 'Commissions des négociateurs', m: p0.vente.commissions }, { libelle: 'Apporteurs', m: p0.vente.apporteurs }, { libelle: 'Agences extérieures', m: p0.vente.exterieures }]
    : famille === 'location' && p0.location !== null ? [{ libelle: 'Apporteurs', m: p0.location.apporteurs },
      { libelle: 'Variable négociateur (primes incluses)', m: p0.location.variable }, { libelle: 'dont primes de gestion', m: p0.location.primes, info: true },
      { libelle: 'Part de gestion versée aux apporteurs', m: p0.location.partGestion }, { libelle: 'Rémunération des collègues apporteurs', m: p0.location.collegues },
      { libelle: 'Variable négo (calculé) — pour information, hors totaux', m: p0.location.variableCalcule, info: true }] : []);
  const somme = (xs: readonly MontantC[]): MontantC => xs.reduce((t, x) => ({ htC: t.htC + x.htC, ttcC: t.ttcC + x.ttcC }), { htC: 0, ttcC: 0 });
  const totalFamille = (f: FamilleCout): MontantC => (f === 'vente' ? p0.vente.total : f === 'location' ? p0.location?.total ?? { htC: 0, ttcC: 0 } : p0.gestion?.total ?? { htC: 0, ttcC: 0 });
  const familles = (['vente', 'location', 'gestion'] as const).filter((f) => f === 'vente' || societe === 'criterimmo');
  const COULEUR: Record<FamilleCout, number> = { vente: 1, location: 3, gestion: 5 };
  const lien = (f: FamilleCout) => (f === 'vente' ? `/admin/transaction/${societe}?vue=mois&annee=${mois.annee}&mois=${mois.mois}` : '/admin/location/outils/mois');
  const pastille = (complet: boolean | null, attr: string) => (complet === null ? null
    : <span className={`mes-saisie-etat${complet ? ' mes-saisie-etat--ok' : ''}`} data-etat-saisie={attr}>{complet ? 'complet' : 'à compléter'}</span>);
  // 🔴 D35 — un salaire compte pour SA part de cette activité (la même règle que les tableaux) ; une part en lecture (l'ancienne activité) : telle quelle
  const sousTotal = (c: string, p?: PosteDuMois): number => Math.round(((brouillons[c] ?? []).filter((b) => !b.retirer).reduce((t, b) => {
    const m = lireMontant(b.montant); if (m === null || !Number.isFinite(m)) return t;
    return t + (p?.poste === 'salaires' ? partDuSalaire(principalesDe(b.compte), mois.annee, mois.mois, m, p.famille) : m);
  }, 0) + (p === undefined ? 0 : lignesDe(p).filter((l) => !modifiableIci(l)).reduce((t, l) => t + l.montantHt, 0))) * 100) / 100;
  const caseComplet = (c: string, libelle: string) => (
    <label className="mes-saisie-complet" title="Complet pour ce mois (0 compris)"><input type="checkbox" checked={complets[c] === true} disabled={d.validations === null}
      onChange={(e) => setComplets((x) => ({ ...x, [c]: e.target.checked }))} aria-label={`${libelle} : complet pour ce mois`} data-complet={c} /></label>
  );
  const profilsDe = (f: FamilleCout) => ([1, 2, 3] as const).map((gp) => { const xs = profilsPourSalaire(f, d.profils, mois).filter((x) => x.groupe === gp); return xs.length === 0 ? null
    : <optgroup key={gp} label={gp === 1 ? `Fonction ${MOT_FAMILLE[f].toLowerCase()}` : gp === 2 ? 'Location ou gestion' : 'Autres profils'}>
      {xs.map((x) => <option key={x.profil.id} value={x.profil.id}>{x.profil.libelle}</option>)}</optgroup>; });
  return (
    <div className="mes-saisie-corps">
      <div className="mes-saisie-tete" data-saisie-tete>
        {tete}
        <span className="mes-saisie-global" data-etat-global><span className="mes-saisie-global-texte">{LIBELLE_AGENCE[societe]} · {libelleMois(mois)}</span> {pastille(etat.complet, 'global')}</span>
        {retour}
      </div>
      {d.validations === null && <p className="loc-muet mes-saisie-note" data-validation-indisponible>La validation des postes sera disponible après la mise à jour de la base (migration 452).</p>}
      {familles.map((f) => {
        const calc = auto(f);
        const totalCalc = somme(calc.filter((a) => a.info !== true).map((a) => a.m));
        return (
          <section key={f} className={`mes-saisie-bloc trx-serie--${COULEUR[f]}`} aria-label={MOT_FAMILLE[f]} data-bloc-saisie={f}>
            <header className="mes-saisie-bande">
              <strong>{MOT_FAMILLE[f]}</strong>{pastille(etat.familles[f], f)}
              <span className="mes-saisie-total" data-total-bloc={f}>{montant(totalFamille(f))}</span>
            </header>
            <div className="mes-saisie-grille" role="table" aria-label={`Postes — ${MOT_FAMILLE[f]}`}>
              <div className="mes-saisie-entete" role="row"><span role="columnheader">Poste</span><span role="columnheader">Montant HT</span><span role="columnheader">TVA</span>
                <span role="columnheader" className="mes-saisie-entete-complet"><EnteteAide libelle="✓" cible={`saisie-complet-${f}`} etiquette="Ce que veut dire « complet »"
                  texte="Cochez quand le poste est entièrement saisi pour ce mois — 0 compris : un poste sans dépense est complet une fois coché." /></span></div>
              {postes.filter((p) => p.famille === f).map((p) => {
                const c = cle(p);
                const multi = p.poste === 'salaires' || p.poste === 'autres';
                return (
                  <div key={c} className="mes-saisie-poste" data-poste-saisie={c}>
                    <div className="mes-saisie-ligne" role="row">
                      <span role="cell" className="mes-saisie-nom">{p.libelle}</span>
                      <span role="cell">{multi ? <span className="mes-saisie-sous-total" data-sous-total={c}>{eur(sousTotal(c, p))}</span>
                        : <input type="text" inputMode="decimal" value={gestion[p.poste as 'adhoc' | 'monga']} placeholder="vide : non saisi" aria-label={`${p.libelle} HT`}
                          onChange={(e) => setGestion((x) => ({ ...x, [p.poste]: e.target.value }))} data-montant-poste={c} />}</span>
                      <span role="cell" className="loc-muet mes-saisie-tva">{p.poste === 'autres' ? 'par ligne' : p.poste === 'salaires' ? '—' : '20 %'}</span>
                      <span role="cell">{caseComplet(c, p.libelle)}</span>
                    </div>
                    {multi && <div className="mes-saisie-sous" role="rowgroup">
                      {(brouillons[c] ?? []).map((b, i) => (
                        <div key={b.id ?? `n${i}`} className={`mes-saisie-sous-ligne${b.retirer ? ' mes-saisie-retiree' : ''}`} role="row" data-brouillon={`${c}-${i}`}>
                          {p.poste === 'salaires'
                            ? <select value={b.compte} onChange={(e) => changer(c, i, { compte: e.target.value })} aria-label="Salarié" disabled={b.retirer} data-profil-brouillon={`${c}-${i}`}>
                              <option value="">Salarié…</option>{profilsDe(p.famille)}</select>
                            : <input type="text" value={b.libelle} placeholder="Libellé" maxLength={120} disabled={b.retirer} onChange={(e) => changer(c, i, { libelle: e.target.value })} aria-label="Libellé" data-libelle-brouillon={`${c}-${i}`} />}
                          <input type="text" inputMode="decimal" value={b.montant} placeholder="Montant HT" disabled={b.retirer} onChange={(e) => changer(c, i, { montant: e.target.value })} aria-label="Montant HT" data-montant-brouillon={`${c}-${i}`} />
                          {p.poste === 'autres' ? <select value={b.tva ? '20' : '0'} disabled={b.retirer} onChange={(e) => changer(c, i, { tva: e.target.value === '20' })} aria-label="TVA de la ligne" data-tva-brouillon={`${c}-${i}`}>
                            <option value="20">20 %</option><option value="0">sans TVA</option></select> : <span className="loc-muet mes-saisie-tva">—</span>}
                          {b.id !== null ? <button type="button" className="mes-saisie-x" aria-label={b.retirer ? 'Garder la ligne' : 'Retirer la ligne'} title={b.retirer ? 'Garder' : 'Retirer'}
                            onClick={() => changer(c, i, { retirer: !b.retirer })} data-retirer-brouillon={`${c}-${i}`}>{b.retirer ? '↺' : '×'}</button> : <span />}
                          {(() => { const l = b.id === null ? undefined : lignesDe(p).find((x) => x.id === b.id);
                            return l?.prorata === undefined ? null : <small className="loc-muet mes-saisie-prorata" data-prorata-brouillon={`${c}-${i}`}>{mentionProrata(l.prorata)} — part {MOT_FAMILLE[p.famille].toLowerCase()} :
                              {' '}{eur(l.montantHt)} HT ; le montant tapé est le salaire du mois entier</small>; })()}
                        </div>))}
                      {/* 🔴 D35 — la part de l'ANCIENNE activité le mois d'un changement : en lecture (le salaire se modifie dans la nouvelle) */}
                      {p.poste === 'salaires' && lignesDe(p).filter((l) => !modifiableIci(l)).map((l) => (
                        <div key={`p${l.id}`} className="mes-saisie-sous-ligne mes-saisie-part" role="row" data-part-lecture={l.id}>
                          <span>{l.compteLibelle ?? 'Salarié'}</span><span>{eur(l.montantHt)}</span><span className="loc-muet mes-saisie-tva">—</span><span />
                          <small className="loc-muet mes-saisie-prorata">{l.prorata === undefined ? '' : mentionProrata(l.prorata)} — sur {eur(l.montantSaisiHt ?? l.montantHt)} (le mois entier) ;
                            {' '}il se modifie dans le bloc de sa nouvelle activité</small>
                        </div>))}
                      <button type="button" className="trx-bouton-lien mes-saisie-ajouter" onClick={() => ajouterLigne(c)} data-ajouter-brouillon={c}>+ ajouter</button>
                    </div>}
                  </div>
                );
              })}
              {calc.length > 0 && (
                <details className="mes-saisie-calcules" data-auto-saisie={f}>
                  <summary><span>Calculés automatiquement</span> <strong data-total-calcules={f}>{eur(totalCalc[k] / 100)}</strong></summary>
                  <ul>{calc.map((a) => <li key={a.libelle} className={a.info === true ? 'loc-muet' : undefined}><span>{a.libelle}</span> <span>{eur(a.m[k] / 100)}</span></li>)}</ul>
                  <a className="trx-bouton-lien" href={lien(f)} data-corriger-source={f}>Corriger à la source</a>
                </details>
              )}
            </div>
          </section>
        );
      })}
      {societe !== 'criterimmo' && <p className="loc-muet mes-saisie-note" data-saisie-macj>Location et gestion : {LIBELLE_AGENCE[societe]} : vente seulement.</p>}
      {message !== null && <p className={message.conflit ? 'loc-alerte loc-alerte--orange' : 'trx-erreur'} role="alert" data-message-saisie={message.conflit ? 'conflit' : 'refus'}>{message.texte}</p>}
      <div className="mes-saisie-pied" data-saisie-pied>
        <span className="mes-saisie-total-general" data-total-general>Total du mois ({unite}) : <strong>{montant(p0.total)}</strong></span>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void enregistrer()} data-enregistrer-mois>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
      <p className="loc-muet mes-couts-aide">Montants en euros HT (salaires : chargés, sans TVA ; « Autres » : TVA 20 % ou sans TVA, ligne par ligne ; ADHOC et MONGA : 20 %). Les totaux sont
        ceux déjà enregistrés, comme les tableaux, le Suivi CA et le résultat net.</p>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Mobile d'abord : une colonne ; les champs a 44 px ; les jetons de la charte. */
const CSS_SAISIE_MOIS = `
.mes-saisie-titre{margin:0 0 6px}
.mes-saisie-corps{display:flex;flex-direction:column;gap:14px}
.mes-saisie-tete{position:sticky;top:0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:10px;background:var(--color-svv-surface)}
.mes-saisie-tete .mes-saisie-global{flex:1 1 auto;font-weight:700;font-size:.92rem}
.mes-saisie-tete .gst-btn{width:auto;min-height:40px;padding:0 .9rem}
.mes-saisie-champ{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:.9rem}
.mes-saisie-champ select{min-height:40px;padding:0 .5rem;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:8px}
.mes-saisie-structures .trx-unite{min-height:40px}
.mes-saisie-etat{display:inline-block;margin-left:6px;padding:0 8px;border-radius:999px;font-size:.74rem;font-weight:700;background:var(--color-svv-amber-soft);color:var(--color-svv-ink);border:1px solid var(--color-svv-amber);vertical-align:middle}
.mes-saisie-etat--ok{background:color-mix(in srgb, var(--color-svv-green) 15%, transparent);border-color:var(--color-svv-green)}
.mes-saisie-bloc{border:1px solid var(--color-svv-line);border-left:4px solid var(--trx-serie);border-radius:10px;overflow:hidden;background:var(--color-svv-surface)}
.mes-saisie-bande{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:6px 10px;background:color-mix(in srgb, var(--trx-serie) 14%, transparent)}
.mes-saisie-bande strong{font-size:1rem}
.mes-saisie-total{margin-left:auto;font-weight:800;font-variant-numeric:tabular-nums}
.mes-saisie-total small{font-weight:500}
.mes-saisie-grille{display:flex;flex-direction:column;padding:2px 10px 6px}
.mes-saisie-entete,.mes-saisie-ligne{display:grid;grid-template-columns:minmax(8rem,1fr) 10rem 6rem 2.5rem;align-items:center;gap:8px}
.mes-saisie-entete{padding:4px 0;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--color-svv-muted);border-bottom:1px solid var(--color-svv-line)}
.mes-saisie-entete-complet{text-align:center}
.mes-saisie-entete .svv-pil-ib-bulle{text-transform:none;letter-spacing:normal;font-weight:400}
.mes-saisie-poste{border-bottom:1px solid var(--color-svv-line);padding:3px 0}
.mes-saisie-ligne{min-height:36px}
.mes-saisie-nom{font-weight:600}
.mes-saisie-sous-total{display:block;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.mes-saisie-tva{font-size:.82rem}
.mes-saisie-complet{display:flex;justify-content:center;align-items:center;min-height:36px;cursor:pointer}
.mes-saisie-complet input{width:20px;height:20px;accent-color:var(--color-svv-green)}
.mes-saisie-mois input[type=text],.mes-saisie-mois .mes-saisie-sous select{min-height:34px;padding:0 .5rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:6px;min-width:0;width:100%}
.mes-saisie-ligne input[inputmode=decimal],.mes-saisie-sous input[inputmode=decimal]{text-align:right}
.mes-saisie-sous{display:flex;flex-direction:column;gap:3px;margin:0 0 2px 1rem;padding-left:8px;border-left:2px solid var(--color-svv-line)}
.mes-saisie-sous-ligne{display:grid;grid-template-columns:minmax(8rem,1fr) 10rem 6rem 2.5rem;align-items:center;gap:8px}
.mes-saisie-x{min-width:32px;min-height:32px;font:inherit;font-size:1.1rem;line-height:1;background:none;border:1px solid var(--color-svv-line);border-radius:6px;color:var(--color-svv-ink);cursor:pointer}
.mes-saisie-ajouter{align-self:flex-start;font-size:.82rem;padding:0;min-height:26px}
.mes-saisie-retiree{opacity:.5;text-decoration:line-through}
.mes-saisie-prorata{grid-column:1/-1;font-size:.82rem}
.mes-saisie-part>span:nth-child(2){text-align:right;font-variant-numeric:tabular-nums}
.mes-saisie-calcules{margin:4px 0 0;padding:4px 0;font-size:.9rem}
.mes-saisie-calcules summary{display:flex;justify-content:space-between;gap:8px;cursor:pointer;min-height:32px;align-items:center;color:var(--color-svv-muted)}
.mes-saisie-calcules summary strong{color:var(--color-svv-ink);font-variant-numeric:tabular-nums}
.mes-saisie-calcules ul{margin:4px 0 6px;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.mes-saisie-calcules li{display:flex;justify-content:space-between;gap:8px;font-variant-numeric:tabular-nums}
.mes-saisie-note{margin:0;font-size:.88rem}
.mes-saisie-pied{position:sticky;bottom:0;z-index:3;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid var(--color-svv-line-strong);border-radius:10px;background:var(--color-svv-surface);box-shadow:0 -4px 12px rgba(0,0,0,.08)}
.mes-saisie-pied .gst-btn{width:auto;min-height:44px;padding:0 1.4rem}
.mes-saisie-total-general{font-variant-numeric:tabular-nums}
@media (max-width:640px){
  .mes-saisie-tete{gap:6px;padding:6px 8px}
  .mes-saisie-tete .mes-saisie-global{flex:0 0 auto;order:3}
  .mes-saisie-global-texte{display:none}
  .mes-saisie-tete .gst-btn{order:4;margin-left:auto;min-height:36px}
  .mes-saisie-entete{display:none}
  .mes-saisie-ligne{grid-template-columns:1fr auto 2.5rem;grid-template-areas:"nom montant ok" "tva tva tva"}
  .mes-saisie-ligne>:nth-child(1){grid-area:nom} .mes-saisie-ligne>:nth-child(2){grid-area:montant;min-width:7.5rem} .mes-saisie-ligne>:nth-child(4){grid-area:ok}
  .mes-saisie-ligne>:nth-child(3){display:none}
  .mes-saisie-sous{margin-left:0}
  .mes-saisie-sous-ligne{grid-template-columns:1fr 6.5rem 2.5rem;grid-template-areas:"qui qui qui" "montant tva x"}
  .mes-saisie-sous-ligne>:nth-child(1){grid-area:qui} .mes-saisie-sous-ligne>:nth-child(2){grid-area:montant} .mes-saisie-sous-ligne>:nth-child(3){grid-area:tva}
  .mes-saisie-sous-ligne>:nth-child(4){grid-area:x;justify-self:center}
  .mes-saisie-sous-ligne>.mes-saisie-prorata{grid-area:auto;grid-column:1/-1}
  .mes-saisie-pied .gst-btn{flex:1 1 auto}
}
`;
