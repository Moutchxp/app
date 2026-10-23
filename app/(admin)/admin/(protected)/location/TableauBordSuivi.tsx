'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  type ActiviteLue, caLigne, commissionApporteurDe, type ContexteCalcul, type DonneesTableau, filtrer, type Filtre, filtreVersParams,
  lignesDePeriode, NOMS_MOIS, type Periode, primeDe, sectionApporteurs, sectionCumul, sectionGestion, sectionIndicateurs, sectionMois,
  sectionNegociateurs, type TotauxPeriode, tuilesAnnee,
  type AnneeHistorique,
} from '../../../../lib/location/suivi/tableauBord';
import { aujourdhuiParis, LIBELLE_TYPE_ACTIVITE } from '../../../../lib/location/suivi/suivi';
import { CSS_FEUILLE_MOIS, FeuilleDuMois } from './FeuilleDuMois';

/**
 * ══ 🔴 LOCATION — « OUTILS DE SUIVI » : LE TABLEAU DE BORD DE L'ACTIVITÉ (Arno, 22/10/2026) ═══════════════════════════════════
 * Le suivi mensuel d'Arno (CA_JBP_2026.xlsx), tenu par l'outil :
 *   · filtres : année, mois, négociateur, apporteur, avec / sans gestion, nouveau / déjà client ;
 *   · 4 grosses tuiles : CA du mois, baux signés, CA cumulé de l'année (chacun face à N−1), portefeuille en gestion ;
 *   · A le mois (et N−1) · B le cumul de l'année, en courbes · C les apporteurs · D la gestion récurrente sur 12 mois ·
 *     E les indicateurs (vacance, préavis, GLI / Visale, parkings) · F les négociateurs (droit « Voir les commissions ») ·
 *     G l'export .xlsx, un onglet par mois ;
 *   · 🔴 TOUT CHIFFRE S'OUVRE : la liste des baux (ou des biens) qui le font.
 * Les calculs sont ceux de `tableauBord.ts` (reproduction exacte des formules du fichier), sur les lignes de la base.
 */
const API = '/api/admin/location/suivi';
const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const eurRond = (x: number): string => `${Math.round(x).toLocaleString('fr-FR')} €`;
const pct = (x: number | null): string => (x === null ? '—' : `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const signe = (x: number | null): string => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${pct(Math.abs(x))}`);
const moisCourt = (m: string): string => `${NOMS_MOIS[Number(m.slice(5, 7)) - 1].slice(0, 4).replace(/\.$/, '')}. ${m.slice(0, 4)}`;
const dateFr = (iso: string): string => iso.split('-').reverse().join('/');
const ecartEur = (x: number): string => `${x >= 0 ? '+' : '−'}${eur(Math.abs(x))}`;
const COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** A — les lignes du tableau du mois ; `commission` : seulement avec « Voir les commissions ». */
const LIGNES_A: { k: 'nb' | 'caProprietaire' | 'caLocataire' | 'ca' | 'apporteurs' | 'caNet' | 'avecGestion' | 'sansGestion' | 'primes' | 'retrocessions' | 'commission'; mot: string; commission?: boolean }[] = [
  { k: 'nb', mot: 'Baux signés (avenants compris)' },
  { k: 'caProprietaire', mot: 'Honoraires propriétaires HT' },
  { k: 'caLocataire', mot: 'Honoraires locataires HT' },
  { k: 'ca', mot: 'TOTAL CA HT' },
  { k: 'apporteurs', mot: 'Commissions des apporteurs' },
  { k: 'caNet', mot: 'CA HT − apporteurs' },
  { k: 'avecGestion', mot: 'Location avec gestion' },
  { k: 'sansGestion', mot: 'Location sans gestion' },
  { k: 'primes', mot: 'Primes de nouvelle gestion', commission: true },
  { k: 'retrocessions', mot: 'Rétrocessions', commission: true },
  { k: 'commission', mot: 'Commission brute du négociateur', commission: true },
];

type Detail = { titre: string; ids?: (number | string)[]; lots?: { titre: string; ids: number[] }[] } | null;

/**
 * Arno (23/10/2026) — DEUX BRIQUES : `vue="mois"` (« Suivi du mois » : onglets des mois, section A et la feuille du mois) et
 * `vue="annee"` (« Suivi annuel » : sections B à G). Les filtres, les 4 tuiles et la liste qui s'ouvre sont dans les deux.
 */
export function TableauBordSuivi({ vue = 'annee' }: { vue?: 'mois' | 'annee' }) {
  const jour = aujourdhuiParis();
  const [n, setN] = useState(0);
  const [annee, setAnnee] = useState(Number(jour.slice(0, 4)));
  const [mois, setMois] = useState(Number(jour.slice(5, 7)));
  const [portee, setPortee] = useState<'mois' | 'annee'>('mois');
  const [filtre, setFiltre] = useState<Filtre>({});
  const [lu, setLu] = useState<{ annee: number; d: DonneesTableau } | { annee: number; erreur: string } | null>(null);
  const [detail, setDetail] = useState<Detail>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?vue=tableau&annee=${annee}`, { cache: 'no-store' }).then((r) => (r.status === 403 ? { etat: 'refus' } : r.json()))
      .then((x: { etat?: string; data?: DonneesTableau; message?: string }) => {
        if (!vivant) return;
        if (x.etat === 'ok' && x.data && Array.isArray(x.data.activites)) setLu({ annee, d: x.data });
        else setLu({ annee, erreur: x.etat === 'refus' ? 'Accès refusé : droit « Location » requis.' : x.message ?? 'Lecture impossible.' });
      }).catch(() => { if (vivant) setLu({ annee, erreur: 'Lecture impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [annee, n]);
  useEffect(() => {
    if (detail === null) return;
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') setDetail(null); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [detail]);

  const d = lu !== null && lu.annee === annee && 'd' in lu ? lu.d : null;
  const ctx: ContexteCalcul = useMemo(() => ({ regles: d?.regles ?? [], apporteurs: d?.apporteurs ?? [], retrocessions: d?.retrocessions ?? [] }), [d]);
  const lignes = useMemo(() => (d === null ? [] : filtrer(d.activites, filtre)), [d, filtre]);
  const parId = useMemo(() => new Map((d?.activites ?? []).map((a) => [String(a.id), a])), [d]);

  if (lu === null || (lu.annee !== annee)) return <p className="gst-info" role="status">Chargement du tableau de bord…</p>;
  if ('erreur' in lu) return <p className="gst-erreur" role="alert">{lu.erreur}</p>;
  if (d === null) return null;

  const periodeMois: Periode = { annee, mois };
  const periode: Periode = portee === 'mois' ? periodeMois : { annee, mois: null };
  const libellePeriode = portee === 'mois' ? `${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}` : `l’année ${annee}`;
  const A = sectionMois(lignes, ctx, periodeMois, filtre.negociateur);
  const B = sectionCumul(lignes, ctx, annee);
  const cumul = B[mois - 1];
  const varCumul = cumul.caCumuleN1 === 0 ? null : (cumul.caCumule - cumul.caCumuleN1) / cumul.caCumuleN1;
  const idsCumul = B.slice(0, mois).flatMap((p) => p.ids);
  const moisEcoules = Array.from({ length: portee === 'mois' ? 1 : (annee === Number(jour.slice(0, 4)) ? Number(jour.slice(5, 7)) : 12) },
    (_, i) => `${annee}-${String(portee === 'mois' ? mois : i + 1).padStart(2, '0')}`);
  const C = sectionApporteurs(lignes, ctx, periode, moisEcoules);
  const moisFinGestion = `${annee}-${String(mois).padStart(2, '0')}`;
  const D = sectionGestion(d.gestion.transitions, d.gestion.stock, annee === Number(jour.slice(0, 4)) && mois > Number(jour.slice(5, 7)) ? jour.slice(0, 7) : moisFinGestion);
  const Dm = D.at(-1)!;
  const lignesPeriode = lignesDePeriode(lignes, periode);
  const preavis = portee === 'mois' ? d.preavis[moisFinGestion] ?? 0 : Object.entries(d.preavis).filter(([k]) => k.startsWith(`${annee}-`)).reduce((s, [, v]) => s + v, 0);
  const E = sectionIndicateurs(lignesPeriode, preavis);
  const F = d.voirCommissions ? sectionNegociateurs(lignes, ctx, periode) : [];
  const sansN1 = !d.activites.some((a) => a.dateSignature.startsWith(`${annee - 1}-`));
  // Arno (23/10/2026) — Suivi annuel : les tuiles montrent l'ANNÉE (en cours : du 1er janvier à la fin du mois choisi), face à N−1 sur la même période.
  const T = tuilesAnnee(lignes, ctx, annee, jour, mois, d.gestionLignes ?? []);
  const periodeT = T.complete ? String(annee) : `${COURT[0]} → ${COURT[T.moisFin - 1]}`;
  const periodeN1 = T.complete ? String(annee - 1) : `${COURT[0]} → ${COURT[T.moisFin - 1]} ${annee - 1}`;
  const reprises = d.activites.filter((a) => a.source === 'import' && a.dateSignature.startsWith(`${annee}-`));
  const nonRattachees = reprises.filter((a) => a.rattachement !== 'rattache').length;
  const ouvrir = (titre: string, ids: (number | string)[]) => () => setDetail({ titre, ids });
  const chiffre = (valeur: string, titre: string, ids: (number | string)[], attr?: string) => (
    <button type="button" className="tdb-chiffre" onClick={ouvrir(titre, ids)} disabled={ids.length === 0} data-chiffre={attr}
      title={ids.length === 0 ? 'Aucun bail' : `Voir les ${ids.length} ligne(s)`}>{valeur}</button>
  );
  const exportHref = `${API}/export?annee=${annee}${filtreVersParams(filtre) ? `&${filtreVersParams(filtre)}` : ''}`;
  const poser = (p: Partial<Filtre>): void => setFiltre((f) => ({ ...f, ...p }));

  return (
    <div className="tdb" data-tableau-de-bord>
      <style>{CSS_TABLEAU_BORD + CSS_FEUILLE_MOIS}</style>
      {!d.disponible && <p className="loc-alerte loc-alerte--orange" role="status" data-tdb-sans-migration>Mise à jour de la base à appliquer (migration 406) : le tableau de bord se remplira dès qu’elle le sera.</p>}

      {vue === 'mois' && (
        <div className="tdb-onglets" role="tablist" aria-label={`Mois de ${annee}`} data-onglets-mois>
          {NOMS_MOIS.map((m, i) => (
            <button key={m} type="button" role="tab" aria-selected={mois === i + 1} className="tdb-onglet" onClick={() => setMois(i + 1)} data-onglet-mois={i + 1}>
              {m}{lignes.some((a) => a.dateSignature.startsWith(`${annee}-${String(i + 1).padStart(2, '0')}`)) ? '' : <span className="tdb-onglet-vide" aria-hidden="true"> ·</span>}</button>
          ))}
        </div>
      )}
      <form className="tdb-filtres" aria-label="Filtres du tableau de bord" onSubmit={(e) => e.preventDefault()} data-filtres>
        <label className="tdb-champ">Année
          <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} data-filtre="annee">
            {d.annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select></label>
        {vue === 'annee' && (
          <label className="tdb-champ">Mois
            <select value={mois} onChange={(e) => setMois(Number(e.target.value))} data-filtre="mois">
              {NOMS_MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select></label>
        )}
        <label className="tdb-champ">Négociateur
          <select value={filtre.negociateur ?? ''} onChange={(e) => poser({ negociateur: e.target.value || null })} data-filtre="negociateur">
            <option value="">Tous</option>
            {d.negociateurs.map((n) => <option key={n.cle} value={n.cle}>{n.libelle}</option>)}
          </select></label>
        <label className="tdb-champ">Apporteur
          <select value={filtre.apporteur ?? ''} onChange={(e) => poser({ apporteur: e.target.value === '' ? null : e.target.value === 'aucun' ? 'aucun' : Number(e.target.value) })} data-filtre="apporteur">
            <option value="">Tous</option>
            <option value="aucun">Sans apporteur</option>
            {d.apporteurs.filter((a) => !a.archive).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select></label>
        <label className="tdb-champ">Gestion
          <select value={filtre.gestion ?? ''} onChange={(e) => poser({ gestion: e.target.value === 'avec' || e.target.value === 'sans' ? e.target.value : null })} data-filtre="gestion">
            <option value="">Avec et sans</option>
            <option value="avec">Avec gestion</option>
            <option value="sans">Sans gestion</option>
          </select></label>
        <label className="tdb-champ">Client
          <select value={filtre.origine ?? ''} onChange={(e) => poser({ origine: e.target.value === 'nouveau' || e.target.value === 'deja' ? e.target.value : null })} data-filtre="origine">
            <option value="">Nouveaux et déjà clients</option>
            <option value="nouveau">Nouveaux clients</option>
            <option value="deja">Déjà clients</option>
          </select></label>
      </form>

      {vue === 'annee' ? (
        <ul className="tdb-tuiles" aria-label={`L’essentiel de ${annee}`} data-tuiles-annee>
          <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA HT ${annee}${T.complete ? '' : ` (${periodeT})`}`, T.courant.ids)} data-tuile="ca-annee">
            <span className="tdb-tuile-mot">CA HT {annee}{T.complete ? '' : <small> ({periodeT})</small>}</span>
            <strong className="tdb-tuile-valeur">{eur(T.courant.ca)}</strong>
            <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${periodeN1} : ${eur(T.precedent.ca)} · ${ecartEur(T.ecartCa)} · ${signe(T.variationCa)}`}</span></button></li>
          <li><button type="button" className="tdb-tuile" onClick={ouvrir(`Baux signés en ${annee}${T.complete ? '' : ` (${periodeT})`}`, T.courant.ids)} data-tuile="baux-annee">
            <span className="tdb-tuile-mot">Baux signés en {annee}{T.complete ? '' : <small> ({periodeT})</small>}</span>
            <strong className="tdb-tuile-valeur">{T.courant.nbBaux}{T.courant.nbAvenants + T.courant.nbGestionSeule > 0 && <small> + {T.courant.nbAvenants + T.courant.nbGestionSeule} autre(s)</small>}</strong>
            <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${periodeN1} : ${T.precedent.nbBaux} · ${T.ecartNb >= 0 ? '+' : '−'}${Math.abs(T.ecartNb)} · ${signe(T.variationNb)}`}</span></button></li>
          <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA net d’apporteurs ${annee}${T.complete ? '' : ` (${periodeT})`}`, T.courant.ids)} data-tuile="ca-net-annee">
            <span className="tdb-tuile-mot">CA net d’apporteurs {annee}{T.complete ? '' : <small> ({periodeT})</small>}</span>
            <strong className="tdb-tuile-valeur">{eur(T.courant.caNet)}</strong>
            <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${periodeN1} : ${eur(T.precedent.caNet)} · ${ecartEur(T.ecartCaNet)} · ${signe(T.variationCaNet)}`}</span></button></li>
          <li><button type="button" className="tdb-tuile" data-tuile="gestion"
            onClick={() => setDetail({ titre: `Gestion — ${annee}${T.complete ? '' : ` (${periodeT})`}`, lots: [{ titre: 'Entrés en gestion', ids: T.gestion.lotsEntres }, { titre: 'Sortis de la gestion', ids: T.gestion.lotsSortis }] })}>
            <span className="tdb-tuile-mot">Biens en gestion</span>
            <strong className="tdb-tuile-valeur">{d.gestion.disponible ? d.gestion.stock : '—'}</strong>
            <span className="tdb-tuile-n1">{d.gestion.disponible
              ? `${annee}${T.complete ? '' : ` (${periodeT})`} : +${T.gestion.nouvelles} / −${T.gestion.perdues} · récurrent ${ecartEur(T.gestion.gagneMensuel)} / −${eur(T.gestion.perduMensuel)} par mois${T.gestion.sansLoyer > 0 ? ` (${T.gestion.sansLoyer} sans loyer saisi, non comptés)` : ''}`
              : 'statut du bien : migration 403'}</span></button></li>
        </ul>
      ) : (
      <ul className="tdb-tuiles" aria-label="L’essentiel">
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA HT — ${NOMS_MOIS[mois - 1]} ${annee}`, A.courant.ids)} data-tuile="ca-mois">
          <span className="tdb-tuile-mot">CA HT — {NOMS_MOIS[mois - 1].toLowerCase()}</span>
          <strong className="tdb-tuile-valeur">{eur(A.courant.ca)}</strong>
          <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${eur(A.precedent.ca)} en ${annee - 1} · ${signe(A.variationCa)}`}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`Baux signés — ${NOMS_MOIS[mois - 1]} ${annee}`, A.courant.ids)} data-tuile="baux-mois">
          <span className="tdb-tuile-mot">Baux signés — {NOMS_MOIS[mois - 1].toLowerCase()}</span>
          <strong className="tdb-tuile-valeur">{A.courant.nbBaux}{A.courant.nbAvenants + A.courant.nbGestionSeule > 0 && <small> + {A.courant.nbAvenants + A.courant.nbGestionSeule} autre(s)</small>}</strong>
          <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${A.precedent.nbBaux} en ${annee - 1} · ${signe(A.variationNb)}`}</span></button></li>
        <li><button type="button" className="tdb-tuile" onClick={ouvrir(`CA cumulé — janvier à ${NOMS_MOIS[mois - 1].toLowerCase()} ${annee}`, idsCumul)} data-tuile="ca-cumul">
          <span className="tdb-tuile-mot">CA cumulé {annee} (à fin {NOMS_MOIS[mois - 1].toLowerCase()})</span>
          <strong className="tdb-tuile-valeur">{eur(cumul.caCumule)}</strong>
          <span className="tdb-tuile-n1">{sansN1 ? `${annee - 1} : non importé` : `${eur(cumul.caCumuleN1)} en ${annee - 1} · ${signe(varCumul)}`}</span></button></li>
        <li><button type="button" className="tdb-tuile" data-tuile="gestion"
          onClick={() => setDetail({ titre: `Gestion — ${NOMS_MOIS[Number(Dm.mois.slice(5)) - 1].toLowerCase()} ${Dm.mois.slice(0, 4)}`, lots: [{ titre: 'Entrés en gestion', ids: Dm.lotsEntres }, { titre: 'Sortis de la gestion', ids: Dm.lotsSortis }] })}>
          <span className="tdb-tuile-mot">Biens en gestion</span>
          <strong className="tdb-tuile-valeur">{d.gestion.disponible ? Dm.stock : '—'}</strong>
          <span className="tdb-tuile-n1">{d.gestion.disponible ? `${moisCourt(Dm.mois)} : +${Dm.entrees} / −${Dm.sorties} (solde ${Dm.solde >= 0 ? '+' : '−'}${Math.abs(Dm.solde)})` : 'statut du bien : migration 403'}</span></button></li>
      </ul>
      )}

      {(sansN1 || reprises.length > 0) && (
        <p className="loc-muet tdb-note" data-tdb-note>
          {sansN1 && <>Aucune donnée pour {annee - 1} : les comparaisons N−1 apparaîtront une fois le suivi {annee - 1} importé. </>}
          {reprises.length > 0 && <>{reprises.length} ligne(s) de {annee} reprises du suivi mensuel (date de signature supposée au 1<sup>er</sup> du mois){nonRattachees > 0 ? `, dont ${nonRattachees} non rattachée(s) à un bail de l’outil` : ''}.</>}
        </p>
      )}

      {vue === 'mois' && <section className="tdb-section" aria-labelledby="tdb-a" data-section="A">
        <h3 id="tdb-a">Le mois — {NOMS_MOIS[mois - 1].toLowerCase()} {annee}, face à {annee - 1}</h3>
        <table className="tdb-table">
          <thead><tr><th scope="col">Indicateur</th><th scope="col">{NOMS_MOIS[mois - 1]} {annee}</th><th scope="col">{NOMS_MOIS[mois - 1]} {annee - 1}</th><th scope="col">Écart</th></tr></thead>
          <tbody>
            {LIGNES_A.filter((l) => !l.commission || d.voirCommissions).map((l) => {
              const c = A.courant[l.k];
              const p = A.precedent[l.k];
              const ids = (t: TotauxPeriode): (number | string)[] => (l.k === 'retrocessions' ? [] : t.ids.filter((i) => {
                const a = parId.get(String(i));
                if (a === undefined) return false;
                if (l.k === 'apporteurs') return a.apporteurNom !== null || a.apporteurId !== null;
                if (l.k === 'avecGestion') return a.avecGestion;
                if (l.k === 'sansGestion') return !a.avecGestion;
                if (l.k === 'primes') return primeDe(a, ctx.regles) > 0;
                return true;
              }));
              const valeur = (x: number): string => (l.k === 'nb' ? String(x) : eur(x));
              return (
                <tr key={l.k} className={l.k === 'ca' ? 'tdb-fort' : undefined} data-ligne-a={l.k}>
                  <th scope="row">{l.mot}</th>
                  <td data-mot={`${NOMS_MOIS[mois - 1]} ${annee}`}>{chiffre(valeur(c), `${l.mot} — ${NOMS_MOIS[mois - 1]} ${annee}`, ids(A.courant), `a-${l.k}`)}</td>
                  <td data-mot={`${NOMS_MOIS[mois - 1]} ${annee - 1}`}>{sansN1 ? <span className="loc-muet">—</span> : chiffre(valeur(p), `${l.mot} — ${NOMS_MOIS[mois - 1]} ${annee - 1}`, ids(A.precedent))}</td>
                  <td data-mot="Écart">{sansN1 || p === 0 ? '—' : l.k === 'nb' ? `${c - p >= 0 ? '+' : '−'}${Math.abs(c - p)}` : signe((c - p) / p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>}

      {vue === 'mois' && (
        <FeuilleDuMois d={d} lignes={lignes} ctx={ctx} annee={annee} mois={mois} negociateur={filtre.negociateur ?? null}
          onDetail={(titre, ids) => setDetail({ titre, ids })} onRelire={() => setN((x) => x + 1)} />
      )}

      {vue === 'annee' && <>
      {(d.historique ?? []).length > 1 && (
        <section className="tdb-section" aria-labelledby="tdb-h" data-section="H">
          <h3 id="tdb-h">Année par année <small className="loc-muet">(toutes les affaires, sans filtre — une année s’ouvre d’un clic)</small></h3>
          <CourbeAnnees lignes={d.historique ?? []} annee={annee} onAnnee={setAnnee} />
          <table className="tdb-table tdb-table--mois" data-historique-annees>
            <thead><tr><th scope="col">Année</th><th scope="col">Baux</th><th scope="col">CA HT</th><th scope="col">Apporteurs</th><th scope="col">CA net</th>
              {d.voirCommissions && <th scope="col">Commission brute</th>}<th scope="col">Évolution du CA</th></tr></thead>
            <tbody>
              {(d.historique ?? []).map((h, i, t) => {
                const avant = i > 0 ? t[i - 1] : null;
                const evol = avant === null || avant.ca === 0 ? null : (h.ca - avant.ca) / avant.ca;
                return (
                  <tr key={h.annee} className={h.annee === annee ? 'tdb-fort' : undefined} data-annee-historique={h.annee}>
                    <th scope="row"><button type="button" className="tdb-chiffre" onClick={() => setAnnee(h.annee)} aria-current={h.annee === annee ? 'true' : undefined}>{h.annee}</button></th>
                    <td data-mot="Baux">{h.nbBaux}</td><td data-mot="CA HT">{eur(h.ca)}</td><td data-mot="Apporteurs">{eur(h.apporteurs)}</td><td data-mot="CA net">{eur(h.caNet)}</td>
                    {d.voirCommissions && <td data-mot="Commission brute">{h.commission === null ? '—' : eur(h.commission)}</td>}
                    <td data-mot="Évolution du CA">{evol === null ? '—' : signe(evol)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <section className="tdb-section" aria-labelledby="tdb-b" data-section="B">
        <h3 id="tdb-b">Le cumul de {annee}, mois par mois</h3>
        <CourbeCumul points={B} annee={annee} sansN1={sansN1} moisSelectionne={mois} />
        <table className="tdb-table tdb-table--mois">
          <thead><tr><th scope="col">Mois</th><th scope="col">Baux</th><th scope="col">CA HT</th><th scope="col">Cumul {annee}</th><th scope="col">Cumul {annee - 1}</th></tr></thead>
          <tbody>
            {B.filter((p, i) => i < mois || p.nb > 0).map((p) => (
              <tr key={p.mois} className={p.mois === moisFinGestion ? 'tdb-fort' : undefined}>
                <th scope="row">{NOMS_MOIS[Number(p.mois.slice(5)) - 1]}</th>
                <td data-mot="Baux">{chiffre(String(p.nb), `Baux — ${NOMS_MOIS[Number(p.mois.slice(5)) - 1]} ${annee}`, p.ids)}</td>
                <td data-mot="CA HT">{chiffre(eur(p.ca), `CA HT — ${NOMS_MOIS[Number(p.mois.slice(5)) - 1]} ${annee}`, p.ids)}</td>
                <td data-mot={`Cumul ${annee}`}>{eur(p.caCumule)}</td>
                <td data-mot={`Cumul ${annee - 1}`}>{sansN1 ? '—' : eur(p.caCumuleN1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="tdb-portee" role="group" aria-label="Période des sections suivantes">
        <span className="loc-muet">Apporteurs, indicateurs{d.voirCommissions ? ', négociateurs' : ''} :</span>
        {(['mois', 'annee'] as const).map((p) => (
          <button key={p} type="button" className="tdb-pilule" aria-pressed={portee === p} onClick={() => setPortee(p)} data-portee={p}>
            {p === 'mois' ? `${NOMS_MOIS[mois - 1]} ${annee}` : `Année ${annee}`}</button>
        ))}
      </div>

      <section className="tdb-section" aria-labelledby="tdb-c" data-section="C">
        <h3 id="tdb-c">Les apporteurs — {libellePeriode}</h3>
        {C.length === 0 ? <p className="loc-muet">Aucun bail apporté sur la période.</p> : (
          <table className="tdb-table tdb-table--large">
            <thead><tr><th scope="col">Apporteur</th><th scope="col">Baux</th><th scope="col">CA apporté HT</th><th scope="col">Commissions</th><th scope="col">Coûts fixes</th><th scope="col">Reste à l’agence</th><th scope="col">Coût pour 1 € de CA</th></tr></thead>
            <tbody>
              {C.map((l) => (
                <tr key={`${l.apporteurId ?? l.nom}`} data-apporteur-ligne={l.apporteurId ?? l.nom}>
                  <th scope="row">{l.nom}{l.type && <small className="loc-muet"> · {l.type}</small>}</th>
                  <td data-mot="Baux">{chiffre(String(l.nb), `Baux apportés — ${l.nom}`, l.ids)}</td>
                  <td data-mot="CA apporté HT">{chiffre(eur(l.ca), `CA apporté — ${l.nom}`, l.ids)}</td>
                  <td data-mot="Commissions">{eur(l.commissions)}</td>
                  <td data-mot="Coûts fixes">{eur(l.coutsFixes)}</td>
                  <td data-mot="Reste à l’agence">{eur(l.net)}</td>
                  <td data-mot="Coût pour 1 € de CA">{l.coutParEuro === null ? '—' : `${l.coutParEuro.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="tdb-section" aria-labelledby="tdb-d" data-section="D">
        <h3 id="tdb-d">La gestion récurrente — 12 mois</h3>
        {!d.gestion.disponible ? <p className="loc-muet">Le statut du bien (migration 403) n’est pas encore en base.</p> : (
          <>
            <p className="tdb-ligne-chiffres">
              <span>Entrées : <strong>{Dm.entrees}</strong></span><span>Sorties : <strong>{Dm.sorties}</strong></span>
              <span>Solde : <strong>{Dm.solde >= 0 ? '+' : '−'}{Math.abs(Dm.solde)}</strong></span><span>Portefeuille : <strong>{Dm.stock}</strong> biens</span>
            </p>
            <CourbeGestion points={D} onMois={(p) => setDetail({ titre: `Gestion — ${NOMS_MOIS[Number(p.mois.slice(5)) - 1].toLowerCase()} ${p.mois.slice(0, 4)}`, lots: [{ titre: 'Entrés en gestion', ids: p.lotsEntres }, { titre: 'Sortis de la gestion', ids: p.lotsSortis }] })} />
          </>
        )}
      </section>

      <section className="tdb-section" aria-labelledby="tdb-e" data-section="E">
        <h3 id="tdb-e">Indicateurs — {libellePeriode}</h3>
        <ul className="tdb-indicateurs">
          <li><span className="tdb-tuile-mot">Vacance moyenne avant l’entrée</span>
            {chiffre(E.vacanceMoyenneJours === null ? '—' : `${Math.round(E.vacanceMoyenneJours)} j`, 'Baux dont la vacance est connue', E.vacanceIds, 'vacance')}
            <small className="loc-muet">{E.vacanceIds.length} bail(aux) dont la sortie précédente est connue</small></li>
          <li><span className="tdb-tuile-mot">Préavis reçus</span><strong className="tdb-indic">{E.preavis}</strong>
            <small className="loc-muet">{portee === 'mois' ? 'dans le mois' : 'dans l’année'}</small></li>
          <li><span className="tdb-tuile-mot">Part GLI / Visale</span>
            {chiffre(pct(E.partGaranties), 'Baux avec GLI ou Visale', E.garantiesIds, 'garanties')}
            <small className="loc-muet">parmi {E.assuranceConnue} bail(aux) renseigné(s)</small></li>
          <li><span className="tdb-tuile-mot">Part des parkings</span>
            {chiffre(pct(E.partParkingNb), 'Parkings et box', E.parkingIds, 'parkings')}
            <small className="loc-muet">{pct(E.partParkingCa)} du CA</small></li>
        </ul>
      </section>

      {d.voirCommissions && (
        <section className="tdb-section" aria-labelledby="tdb-f" data-section="F">
          <h3 id="tdb-f">Les négociateurs — {libellePeriode}</h3>
          <p className="loc-muet tdb-note">Commission brute = taux × (CA HT − commissions des apporteurs) + primes de nouvelle gestion − rétrocessions — la formule du suivi mensuel.</p>
          {F.length === 0 ? <p className="loc-muet">Aucune activité sur la période.</p> : (
            <table className="tdb-table tdb-table--large">
              <thead><tr><th scope="col">Négociateur</th><th scope="col">Mois</th><th scope="col">Baux</th><th scope="col">CA HT</th><th scope="col">Apporteurs</th><th scope="col">CA − apporteurs</th><th scope="col">Primes</th><th scope="col">Rétrocessions</th><th scope="col">Commission brute</th></tr></thead>
              <tbody>
                {F.map((l) => (
                  <tr key={`${l.cle}-${l.mois}`} data-negociateur-ligne={`${l.libelle}|${l.mois}`}>
                    <th scope="row">{l.libelle}</th>
                    <td data-mot="Mois">{NOMS_MOIS[Number(l.mois.slice(5)) - 1]}</td>
                    <td data-mot="Baux">{chiffre(String(l.totaux.nb), `${l.libelle} — ${NOMS_MOIS[Number(l.mois.slice(5)) - 1]} ${annee}`, l.totaux.ids)}</td>
                    <td data-mot="CA HT">{eur(l.totaux.ca)}</td>
                    <td data-mot="Apporteurs">{eur(l.totaux.apporteurs)}</td>
                    <td data-mot="CA − apporteurs">{eur(l.totaux.caNet)}</td>
                    <td data-mot="Primes">{eur(l.totaux.primes)}</td>
                    <td data-mot="Rétrocessions">{eur(l.totaux.retrocessions)}</td>
                    <td data-mot="Commission brute" className="tdb-fort">{eur(l.totaux.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="tdb-section tdb-export" aria-labelledby="tdb-g" data-section="G">
        <h3 id="tdb-g">Export</h3>
        <p className="loc-muet">Le suivi {annee}, un onglet par mois, avec les filtres ci-dessus : la mise en page du suivi mensuel (totaux et ventilation en formules).</p>
        <a className="svv-btn svv-btn-outline gst-btn tdb-bouton-export" href={exportHref} download data-export>Exporter en .xlsx</a>
      </section>
      </>}

      {detail !== null && <ListeDetail detail={detail} parId={parId} ctx={ctx} voirCommissions={d.voirCommissions} onFermer={() => setDetail(null)} />}
    </div>
  );
}

/** La liste des baux (ou des biens) derrière un chiffre. */
function ListeDetail({ detail, parId, ctx, voirCommissions, onFermer }: {
  detail: NonNullable<Detail>; parId: Map<string, ActiviteLue>; ctx: ContexteCalcul; voirCommissions: boolean; onFermer: () => void;
}) {
  const lignes = (detail.ids ?? []).map((i) => parId.get(String(i))).filter((x): x is ActiviteLue => x !== undefined);
  const total = lignes.reduce((s, a) => s + caLigne(a), 0);
  return (
    <div className="tdb-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="tdb-fenetre" role="dialog" aria-modal="true" aria-label={detail.titre} data-detail>
        <header className="tdb-fenetre-tete">
          <h3>{detail.titre}</h3>
          <button type="button" className="tdb-x" aria-label="Fermer" onClick={onFermer} autoFocus>×</button>
        </header>
        <div className="tdb-fenetre-corps">
          {detail.lots !== undefined ? detail.lots.map((g) => (
            <div key={g.titre}>
              <h4>{g.titre} ({g.ids.length})</h4>
              {g.ids.length === 0 ? <p className="loc-muet">Aucun.</p> : (
                <ul className="tdb-lots">{g.ids.map((id) => <li key={id}><a href={`/admin/location/bien/${id}`}>Bien n° {id}</a></li>)}</ul>
              )}
            </div>
          )) : (
            <>
              <p className="loc-muet">{lignes.length} ligne(s) · CA HT {eur(total)}</p>
              <ul className="tdb-baux">
                {lignes.map((a) => (
                  <li key={String(a.id)} data-ligne-detail={String(a.id)}>
                    <p className="tdb-bail-titre"><strong>{a.libelleProprietaire || '—'}</strong> → {a.libelleLocataire || '—'}
                      <span className="loc-pastille">{LIBELLE_TYPE_ACTIVITE[a.type]}</span>
                      {a.rattachement !== 'rattache' && <span className="loc-pastille" title="Ligne reprise du suivi mensuel, sans bail de l’outil">{a.rattachement === 'douteux' ? 'rapprochement douteux' : 'historique non rattaché'}</span>}</p>
                    <p className="tdb-bail-chiffres">
                      <span>{dateFr(a.dateSignature)}{a.dateSupposee ? ' (supposée)' : ''}</span>
                      <span>Propriétaire {eur(a.honoProprietaireHt)}</span><span>Locataire {eur(a.honoLocataireHt)}</span><span><strong>CA {eur(caLigne(a))}</strong></span>
                      {a.apporteurNom && <span>Apporteur {a.apporteurNom} ({eur(commissionApporteurDe(a, ctx.apporteurs))})</span>}
                      {voirCommissions && primeDe(a, ctx.regles) > 0 && <span>Prime {eur(primeDe(a, ctx.regles))}</span>}
                      <span>{a.avecGestion ? 'avec gestion' : 'sans gestion'}</span>
                      {a.negociateurLibelle && <span>{a.negociateurLibelle}</span>}
                    </p>
                    {a.lotId !== null && <a className="tdb-lien" href={`/admin/location/bien/${a.lotId}`}>Ouvrir la fiche du bien</a>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** B — le CA cumulé de l'année (trait plein) et de N−1 (pointillé), 12 mois. */
function CourbeCumul({ points, annee, sansN1, moisSelectionne }: { points: ReturnType<typeof sectionCumul>; annee: number; sansN1: boolean; moisSelectionne: number }) {
  const L = 640; const H = 220; const m = { g: 56, d: 12, h: 12, b: 28 };
  const max = Math.max(1, ...points.map((p) => Math.max(p.caCumule, sansN1 ? 0 : p.caCumuleN1)));
  const x = (i: number): number => m.g + (i * (L - m.g - m.d)) / 11;
  const y = (v: number): number => H - m.b - (v * (H - m.h - m.b)) / max;
  const trace = (vals: number[]): string => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const courant = points.slice(0, Math.max(moisSelectionne, points.reduce((k, p, i) => (p.nb > 0 ? i + 1 : k), 0)));
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <figure className="tdb-courbe" data-courbe="cumul">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`CA HT cumulé ${annee}${sansN1 ? '' : ` et ${annee - 1}`}, de janvier à décembre`}>
        {graduations.map((g) => (
          <g key={g}><line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} className="tdb-grille" />
            <text x={m.g - 6} y={y(g) + 4} textAnchor="end" className="tdb-axe">{eurRond(g)}</text></g>
        ))}
        {points.map((p, i) => <text key={p.mois} x={x(i)} y={H - 8} textAnchor="middle" className="tdb-axe">{COURT[i]}</text>)}
        {!sansN1 && <path d={trace(points.map((p) => p.caCumuleN1))} className="tdb-trait-n1" />}
        <path d={trace(courant.map((p) => p.caCumule))} className="tdb-trait" />
        {courant.map((p, i) => <circle key={p.mois} cx={x(i)} cy={y(p.caCumule)} r={i === moisSelectionne - 1 ? 5 : 3} className="tdb-point" />)}
      </svg>
      <figcaption className="loc-muet"><span className="tdb-legende tdb-legende--courant" /> {annee}{!sansN1 && <> · <span className="tdb-legende tdb-legende--n1" /> {annee - 1}</>}</figcaption>
    </figure>
  );
}

/** H — le CA HT de chaque année d'activité (barres) ; l'année affichée est en couleur ; une barre ouvre son année. */
function CourbeAnnees({ lignes, annee, onAnnee }: { lignes: readonly AnneeHistorique[]; annee: number; onAnnee: (a: number) => void }) {
  const L = 640; const H = 220; const m = { g: 56, d: 12, h: 18, b: 28 };
  const max = Math.max(1, ...lignes.map((l) => l.ca));
  const pas = (L - m.g - m.d) / lignes.length;
  const y = (v: number): number => H - m.b - (v * (H - m.h - m.b)) / max;
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <figure className="tdb-courbe" data-courbe="annees">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`CA HT par année, de ${lignes[0]?.annee} à ${lignes.at(-1)?.annee}`}>
        {graduations.map((g) => (
          <g key={g}><line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} className="tdb-grille" />
            <text x={m.g - 6} y={y(g) + 4} textAnchor="end" className="tdb-axe">{eurRond(g)}</text></g>
        ))}
        {lignes.map((l, i) => (
          <g key={l.annee} className="tdb-barre-annee" onClick={() => onAnnee(l.annee)} data-barre-annee={l.annee}>
            <title>{`${l.annee} : ${eur(l.ca)} HT, ${l.nbBaux} baux`}</title>
            <rect x={m.g + i * pas + pas * 0.18} y={y(l.ca)} width={pas * 0.64} height={Math.max(0, H - m.b - y(l.ca))}
              className={l.annee === annee ? 'tdb-barre tdb-barre--courante' : 'tdb-barre'} />
            <text x={m.g + i * pas + pas / 2} y={H - 8} textAnchor="middle" className="tdb-axe">{l.annee}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** D — le portefeuille en gestion (trait) et les entrées / sorties de chaque mois (barres), 12 mois ; un mois s'ouvre. */
function CourbeGestion({ points, onMois }: { points: ReturnType<typeof sectionGestion>; onMois: (p: ReturnType<typeof sectionGestion>[number]) => void }) {
  const L = 640; const H = 220; const m = { g: 40, d: 40, h: 26, b: 28 };
  const maxStock = Math.max(1, ...points.map((p) => p.stock));
  const minStock = Math.min(...points.map((p) => p.stock));
  const bas = Math.max(0, minStock - Math.ceil((maxStock - minStock) * 0.2) - 1);
  const maxMvt = Math.max(1, ...points.map((p) => Math.max(p.entrees, p.sorties)));
  const pas = (L - m.g - m.d) / 12;
  const xc = (i: number): number => m.g + pas * (i + 0.5);
  const yS = (v: number): number => H - m.b - ((v - bas) * (H - m.h - m.b)) / Math.max(1, maxStock - bas);
  const hB = (v: number): number => (v * (H - m.h - m.b) * 0.45) / maxMvt;
  return (
    <figure className="tdb-courbe" data-courbe="gestion">
      <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Biens en gestion sur 12 mois, entrées et sorties">
        <line x1={m.g} x2={L - m.d} y1={H - m.b} y2={H - m.b} className="tdb-grille" />
        {points.map((p, i) => (
          <g key={p.mois} className="tdb-mois-gestion" role="button" tabIndex={0} aria-label={`${NOMS_MOIS[Number(p.mois.slice(5)) - 1]} ${p.mois.slice(0, 4)} : ${p.entrees} entrée(s), ${p.sorties} sortie(s), ${p.stock} biens`}
            onClick={() => onMois(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMois(p); } }}>
            <rect x={xc(i) - pas / 2} y={m.h} width={pas} height={H - m.h - m.b} className="tdb-cible" />
            <rect x={xc(i) - 9} y={H - m.b - hB(p.entrees)} width={8} height={hB(p.entrees)} className="tdb-barre-entree" />
            <rect x={xc(i) + 1} y={H - m.b - hB(p.sorties)} width={8} height={hB(p.sorties)} className="tdb-barre-sortie" />
            <text x={xc(i)} y={H - 8} textAnchor="middle" className="tdb-axe">{COURT[Number(p.mois.slice(5)) - 1]}</text>
          </g>
        ))}
        <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xc(i).toFixed(1)},${yS(p.stock).toFixed(1)}`).join(' ')} className="tdb-trait" />
        {points.map((p, i) => <text key={`s${p.mois}`} x={xc(i)} y={yS(p.stock) - 8} textAnchor="middle" className="tdb-axe tdb-axe--fort">{p.stock}</text>)}
      </svg>
      <figcaption className="loc-muet"><span className="tdb-legende tdb-legende--courant" /> biens en gestion · <span className="tdb-legende tdb-legende--entree" /> entrées · <span className="tdb-legende tdb-legende--sortie" /> sorties</figcaption>
    </figure>
  );
}

/** Un tableau en cartes (une ligne = une carte, chaque valeur précédée de son intitulé) : au téléphone, et dès 1024 px pour les larges. */
const cartes = (t: string): string => `
  ${t} thead{display:none}
  ${t},${t} tbody,${t} tr,${t} th,${t} td{display:block;width:100%;box-sizing:border-box}
  ${t} tr{border:1px solid var(--color-svv-line);border-radius:12px;padding:6px 10px;margin-bottom:8px}
  ${t} th[scope=row]{border-bottom:0;padding:4px 0}
  ${t} td{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:0;padding:2px 0}
  ${t} td::before{content:attr(data-mot);color:var(--color-svv-muted);font-size:.8rem;font-weight:700;text-align:left}`;

export const CSS_TABLEAU_BORD = `
.tdb{display:flex;flex-direction:column;gap:18px}
.tdb-onglets{display:flex;gap:4px;overflow-x:auto;border-bottom:1px solid var(--color-svv-line);padding-bottom:0;scrollbar-width:thin}
.tdb-onglet{appearance:none;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--color-svv-muted);font:inherit;font-weight:800;padding:10px 12px;min-height:44px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.tdb-onglet[aria-selected="true"]{color:var(--color-svv-ink);border-bottom-color:var(--color-svv-red)}
.tdb-onglet:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.tdb-onglet-vide{color:var(--color-svv-line-strong)}
.tdb-filtres{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;padding:12px 14px;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.tdb-champ{display:flex;flex-direction:column;gap:4px;font-size:.8rem;font-weight:700;color:var(--color-svv-muted);min-width:0}
.tdb-champ select{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 8px;font:inherit;font-size:.92rem;font-weight:400;color:var(--color-svv-ink);background:var(--color-svv-surface);width:100%}
.tdb-tuiles{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.tdb-tuile{appearance:none;width:100%;height:100%;min-height:9rem;display:flex;flex-direction:column;gap:8px;align-items:flex-start;text-align:left;font:inherit;cursor:pointer;background:var(--color-svv-field);color:var(--color-svv-ink);border:1px solid var(--color-svv-line);border-radius:18px;padding:18px 20px;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.tdb-tuile:hover,.tdb-tuile:focus-visible{transform:translateY(-4px);border-color:var(--color-svv-line-strong-hover);box-shadow:0 18px 36px -14px color-mix(in srgb, var(--color-svv-ink) 35%, transparent)}
.tdb-tuile:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tdb-tuile-mot{font-size:.85rem;font-weight:700;color:var(--color-svv-muted);text-transform:none}
.tdb-tuile-valeur{font-size:1.65rem;font-weight:800;line-height:1.15;overflow-wrap:anywhere}
.tdb-tuile-valeur small{font-size:.85rem;font-weight:700;color:var(--color-svv-muted)}
.tdb-tuile-n1{font-size:.85rem;color:var(--color-svv-muted)}
.tdb-note{margin:0}
.tdb-section{border:1px solid var(--color-svv-line);border-radius:14px;padding:14px 16px;background:var(--color-svv-surface);min-width:0}
.tdb-section h3{margin:0 0 10px;font-size:1.05rem}
.tdb-table{width:100%;border-collapse:collapse;font-size:.92rem}
.tdb-table th,.tdb-table td{padding:6px 8px;border-bottom:1px solid var(--color-svv-line);text-align:right;vertical-align:middle}
.tdb-table th[scope=row],.tdb-table thead th:first-child{text-align:left}
.tdb-table thead th{font-size:.78rem;color:var(--color-svv-muted);font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.tdb-fort th,.tdb-fort td,td.tdb-fort{font-weight:800}
.tdb-chiffre{appearance:none;border:0;background:none;padding:6px 4px;min-height:36px;font:inherit;color:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:var(--color-svv-line-strong);text-underline-offset:3px;border-radius:6px}
.tdb-chiffre:hover{color:var(--color-svv-red);text-decoration-color:currentColor}
.tdb-chiffre:focus-visible{outline:2px solid var(--color-svv-red)}
.tdb-chiffre:disabled{cursor:default;text-decoration:none;color:inherit}
.tdb-portee{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tdb-pilule{appearance:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer}
.tdb-pilule[aria-pressed=true]{background:var(--color-svv-ink);color:var(--color-svv-surface);border-color:var(--color-svv-ink)}
.tdb-ligne-chiffres{display:flex;flex-wrap:wrap;gap:8px 22px;margin:0 0 8px}
.tdb-indicateurs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.tdb-indicateurs li{display:flex;flex-direction:column;gap:4px;align-items:flex-start;padding:12px 14px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-field)}
.tdb-indicateurs .tdb-chiffre,.tdb-indic{font-size:1.4rem;font-weight:800;padding:2px 0}
.tdb-courbe{margin:0 0 10px}
.tdb-courbe{max-width:860px}
.tdb-courbe svg{width:100%;height:auto;display:block}
.tdb-grille{stroke:var(--color-svv-line);stroke-width:1}
.tdb-axe{fill:var(--color-svv-muted);font-size:11px}
.tdb-axe--fort{fill:var(--color-svv-ink);font-weight:700}
.tdb-trait{fill:none;stroke:var(--color-svv-red);stroke-width:2.5}
.tdb-trait-n1{fill:none;stroke:var(--color-svv-muted);stroke-width:2;stroke-dasharray:6 5}
.tdb-point{fill:var(--color-svv-red)}
.tdb-barre{fill:var(--color-svv-line-strong)}
.tdb-barre--courante{fill:var(--color-svv-red)}
.tdb-barre-annee{cursor:pointer}
.tdb-barre-entree{fill:var(--color-svv-green-ink)}
.tdb-barre-sortie{fill:var(--color-svv-amber)}
.tdb-cible{fill:transparent;cursor:pointer}
.tdb-mois-gestion:hover .tdb-cible,.tdb-mois-gestion:focus-visible .tdb-cible{fill:color-mix(in srgb, var(--color-svv-ink) 6%, transparent)}
.tdb-mois-gestion:focus-visible{outline:none}
.tdb-legende{display:inline-block;width:18px;height:3px;vertical-align:middle;background:var(--color-svv-red)}
.tdb-legende--n1{background:repeating-linear-gradient(90deg,var(--color-svv-muted) 0 5px,transparent 5px 9px)}
.tdb-legende--entree{background:var(--color-svv-green-ink);height:8px;width:8px}
.tdb-legende--sortie{background:var(--color-svv-amber);height:8px;width:8px}
.tdb-bouton-export{width:auto !important;display:inline-flex;align-items:center;min-height:44px}
.tdb-voile{position:fixed;inset:0;z-index:80;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent);display:flex;align-items:center;justify-content:center;padding:24px}
.tdb-fenetre{background:var(--color-svv-surface);color:var(--color-svv-ink);border-radius:18px;width:min(860px,100%);max-height:calc(100vh - 48px);display:flex;flex-direction:column;overflow:hidden}
.tdb-fenetre-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--color-svv-line)}
.tdb-fenetre-tete h3{margin:0;font-size:1.05rem}
.tdb-x{width:44px;height:44px;border:0;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-ink);font-size:1.4rem;cursor:pointer;flex:0 0 auto}
.tdb-fenetre-corps{padding:12px 18px 18px;overflow-y:auto}
.tdb-baux,.tdb-lots{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.tdb-baux li{padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:12px}
.tdb-bail-titre{margin:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tdb-bail-chiffres{margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.88rem;color:var(--color-svv-muted)}
.tdb-bail-chiffres strong{color:var(--color-svv-ink)}
.tdb-lien{display:inline-block;margin-top:6px;color:var(--color-svv-red);font-weight:700;min-height:32px}
@media (prefers-reduced-motion:reduce){ .tdb-tuile{transition:none} .tdb-tuile:hover,.tdb-tuile:focus-visible{transform:none} }
@media (max-width:1024px){ ${cartes('.tdb-table--large')} }
@media (max-width:1100px){ .tdb-filtres{grid-template-columns:repeat(3,minmax(0,1fr))} .tdb-tuiles,.tdb-indicateurs{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media (max-width:640px){
  .tdb-filtres{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tdb-tuile{min-height:7rem;padding:14px 16px}
  .tdb-tuile-valeur{font-size:1.3rem}
  ${cartes('.tdb-table')}
  .tdb-voile{padding:0;align-items:stretch}
  .tdb-fenetre{max-height:none;height:100%;border-radius:0}
}
@media (max-width:420px){ .tdb-tuiles,.tdb-indicateurs{grid-template-columns:minmax(0,1fr)} }
`;
