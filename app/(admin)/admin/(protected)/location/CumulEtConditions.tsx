'use client';

import { Fragment, useEffect, useState } from 'react';
import { type Apporteur, baremeADate, estInterne, LIBELLE_MODE_APPORTEUR, libelleApporteur, TAUX_TVA } from '../../../../lib/location/suivi/suivi';
import {
  type AutresConditions, type BlocDu, detailDossier, type DetailDossier, type LigneDu, pctCourt, phraseAutresConditions,
} from '../../../../lib/location/suivi/detailDossier';
import { cascadeAuCentime, contributionsAnnees } from '../../../../lib/location/suivi/tableauBord';
import { API_SUIVI, aujourdhuiParis } from './suiviApi';
import { useDossiersApporteur } from './ReglageApporteur';
import { LIBELLE_SOURCE_LOYER, type LigneMois } from '../../../../lib/location/suivi/gestionMensuelle';

/**
 * ══ 🔴 Arno (24/10/2026) — LE BLOC « CONDITIONS » DE LA CARTE ET LE PANNEAU « CUMUL » ═══════════════════════════════════════════
 *   · CONDITIONS (à la place de la cascade sur la carte, accord d'Arno) : One shot / Récurrent en pastille, les taux en vigueur, la
 *     durée du récurrent, « depuis le … » ; les dossiers calculés à d'AUTRES conditions (version antérieure, saisie de l'import) ;
 *     pour un externe, son collègue et la rémunération de ce collègue.
 *   · CUMUL : une ligne par ANNÉE (+ « Depuis le début »), fermée par défaut ; un clic déplie les dossiers de l'année (ordre
 *     chronologique), chacun décomposé location / gestion, au centime (les lignes par mois ont disparu, accord d'Arno).
 */
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const ttc = (ht: number): number => ht * (1 + TAUX_TVA);
/**
 * 🔴 Arno (24/10/2026) — LE NET AGENCE HT = honoraires − dû à l'apporteur − dû au collègue, calculé EN CENTIMES à partir des montants
 * affichés : la carte de l'annuaire et la ligne « Depuis le début » du Cumul donnent le même chiffre, au centime.
 */
export const netAgence = (x: Pick<Chiffres, 'ca' | 'commission' | 'collegue'>): number => cascadeAuCentime({ ca: x.ca, apporteur: x.commission, collegue: x.collegue ?? 0 }).net;

/** Les chiffres d'une période (cumul) ou d'un apporteur (totaux de l'annuaire). */
export type Chiffres = { nb: number; avenants?: number; ca: number; commission: number; location?: number; gestion?: number; recurrente?: number; collegue?: number;
  autres?: AutresConditions[] };

/** « 3 ans » / « 1 an » / « durée indéterminée » (la durée d'un récurrent, sur la carte). */
const dureeCourte = (d: number | null | undefined): string => (d === null || d === undefined ? 'durée indéterminée' : `${d} an${d > 1 ? 's' : ''}`);

/**
 * 🔴 Arno (24/10/2026) — LES CONDITIONS FINANCIÈRES, EN GRAND : la pastille One shot / Récurrent, puis « Location x % · Gestion y % »
 * (et la durée d'un récurrent). Retirés de la carte avec l'accord d'Arno, et toujours au panneau : la date d'application et les dossiers
 * calculés à d'autres conditions (en tête du panneau « Taux »), la rémunération du collègue (résumé en tête du panneau « Rattachement »).
 */
export function BlocConditions({ a, jour }: { a: Apporteur; jour: string }) {
  const v = baremeADate(a, jour);
  const mode = v?.mode ?? 'one_shot';
  return (
    <div className="plo-conditions" data-conditions={a.id}>
      {v === null ? <p className="plo-conditions-ligne" data-conditions-apporteur>Aucune condition enregistrée.</p> : (
        <p className="plo-conditions-ligne" data-conditions-apporteur>
          <span className={`plo-pastille plo-pastille-mode plo-pastille-mode--${mode}`} data-mode-conditions={mode}>{LIBELLE_MODE_APPORTEUR[mode]}</span>
          <span className="plo-conditions-taux" data-conditions-texte>Location {pctCourt(v.taux)} · Gestion {pctCourt(v.tauxGestion ?? 0)}{mode === 'recurrent' ? ` · ${dureeCourte(v.dureeAnnees)}` : ''}</span>
        </p>
      )}
    </div>
  );
}

/** Les dossiers calculés à d'AUTRES conditions que celles en vigueur (version antérieure, montants importés) : en tête du panneau « Taux ». */
export function AutresConditionsTaux({ autres }: { autres: readonly AutresConditions[] }) {
  if (autres.length === 0) return null;
  return <>{autres.map((x) => <p key={`${x.sorte}-${x.libelle}`} className="plo-conditions-autres plo-petit-texte" data-autres-conditions={x.sorte}>{phraseAutresConditions(x)}</p>)}</>;
}

/**
 * Une ligne de dû : « sur la location (20 %) ». 🔴 Arno (24/10/2026, accord) — plus de ligne « taux utilisé … — source » (le taux est déjà
 * dans le libellé) : la source (version datée, montants importés) est en tête du panneau « Taux ».
 */
function LigneDuDossier({ quoi, l, cle }: { quoi: 'location' | 'gestion'; l: LigneDu; cle: string }) {
  const mot = quoi === 'location' ? `sur la location (${pctCourt(l.taux)})` : `sur la gestion (${pctCourt(l.taux)}, ${l.detail})`;
  return (
    <div className="dd-sous" data-ligne-dossier={cle}>
      <dt>{mot}</dt>
      <dd>{euros(l.montant)}</dd>
    </div>
  );
}

function BlocDuDossier({ titre, b, cle, dont }: { titre: string; b: BlocDu; cle: 'apporteur' | 'collegue'; dont?: { annee: number; montant: number; total: number } }) {
  const lignes = [b.location, b.gestion].filter((x) => x !== null).length;
  return (
    <>
      <div className="dd-tete" data-ligne-dossier={`${cle}-tete`}><dt>{titre}</dt>{lignes === 0 && <dd>{euros(0)}</dd>}</div>
      {b.location !== null && <LigneDuDossier quoi="location" l={b.location} cle={`${cle}-location`} />}
      {b.gestion !== null && <LigneDuDossier quoi="gestion" l={b.gestion} cle={`${cle}-gestion`} />}
      {lignes === 2 && <div className="dd-sous dd-total" data-ligne-dossier={`${cle}-total`}><dt>Total {cle === 'apporteur' ? 'apporteur' : 'collègue'}</dt><dd>{euros(b.total)}</dd></div>}
      {/* 🔴 Arno (24/10/2026) — SEULEMENT pour un récurrent étalé sur plusieurs années : la part de son dû versée l'année affichée (un one shot,
          ou un récurrent tout entier dans l'année, n'en a pas : son dû entier compte dans l'année). */}
      {dont !== undefined && <div className="dd-sous dd-dont" data-ligne-dossier={`${cle}-dont`}><dt>dont versé en {dont.annee} :</dt>
        <dd>{euros(dont.montant)} <span className="dd-dont-total">(sur un total de {euros(dont.total)})</span></dd></div>}
    </>
  );
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const libelleMois = (m: string): string => `${NOMS_MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const c100 = (x: number): number => Math.round((x + Number.EPSILON) * 100);

/**
 * 🔴 Arno (25/10/2026) — LE TABLEAU MENSUEL D'UN BIEN (commission récurrente sur la gestion), replié par défaut : mois, locataire, loyer CC,
 * source (réel / calculé / entrée), occupé ou vacant, honoraires, commission — puis le total de l'année. Recalculé à chaque lecture
 * (aucun bouton « recalculer ») ; un indice manquant ou un loyer inconnu est SIGNALÉ sous le tableau.
 */
export function TableauGestionMensuelle({ libelle, mois, annee, collegue }: { libelle: string; mois: readonly LigneMois[]; annee?: number; collegue?: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  const id = `gm-${libelle.length}-${mois[0]?.mois ?? ''}-${annee ?? 'tout'}`;
  const annees = [...new Set(mois.map((m) => Number(m.mois.slice(0, 4))))].filter((y) => annee === undefined || y === annee).sort((x, y) => y - x);
  const alertes = [...new Set(mois.filter((m) => annee === undefined || m.mois.startsWith(String(annee))).flatMap((m) => m.alertes))];
  const avecCollegue = mois.some((m) => m.collegue !== 0);
  const total = (l: readonly LigneMois[], k: 'honoraires' | 'commission' | 'collegue'): number => l.reduce((t, m) => t + c100(m[k]), 0) / 100;
  return (
    <div className="gm" data-tableau-mensuel={libelle}>
      <button type="button" className="gm-bouton" aria-expanded={ouvert} aria-controls={id} onClick={() => setOuvert((x) => !x)} data-deplier-mensuel>
        <span className="plo-chevron" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>Gestion mois par mois — {libelle}</button>
      {alertes.length > 0 && <p className="gm-alerte" role="status" data-alertes-bien>{alertes.join(' · ')} — le dernier loyer connu est gardé.</p>}
      {ouvert && (
        <div id={id} className="gm-corps">
          {annees.map((y) => {
            const lignes = mois.filter((m) => m.mois.startsWith(String(y)));
            return (
              <table key={y} className="gm-table" data-mensuel-annee={y}>
                <thead><tr><th scope="col" className="gm-g">Mois</th><th scope="col" className="gm-g">Locataire</th><th scope="col">Loyer CC</th><th scope="col" className="gm-g">Source</th><th scope="col" className="gm-g">Occupation</th>
                  <th scope="col">Honoraires HT</th><th scope="col">Commission HT</th>{avecCollegue && <th scope="col">Collègue HT</th>}</tr></thead>
                <tbody>
                  {lignes.map((m) => (
                    <tr key={m.mois} data-mois={m.mois} className={m.joursOccupes === 0 ? 'gm-vacant' : undefined}>
                      <th scope="row" data-mot="Mois" className="gm-g">{libelleMois(m.mois)}</th>
                      <td data-mot="Locataire" className="gm-g">{m.locataire ?? '—'}</td>
                      <td data-mot="Loyer CC">{m.loyerCc === null ? '—' : euros(m.loyerCc)}</td>
                      <td data-mot="Source" className="gm-g" data-source={m.source ?? ''}>{m.source === null ? '—' : LIBELLE_SOURCE_LOYER[m.source]}</td>
                      <td data-mot="Occupation" className="gm-g" data-occupation={m.joursOccupes === 0 ? 'vacant' : m.joursOccupes === m.joursDuMois ? 'occupe' : 'partiel'}>
                        {m.joursOccupes === 0 ? 'vacant' : m.joursOccupes === m.joursDuMois ? 'occupé' : `occupé ${m.joursOccupes} j / ${m.joursDuMois}`}</td>
                      <td data-mot="Honoraires HT">{euros(m.honoraires)}</td>
                      <td data-mot="Commission HT">{euros(m.commission)}</td>
                      {avecCollegue && <td data-mot={`Collègue HT${collegue ? ` (${collegue})` : ''}`}>{euros(m.collegue)}</td>}
                    </tr>
                  ))}
                  <tr className="gm-total" data-mensuel-total={y}>
                    <th scope="row" data-mot="Total" className="gm-g">Total {y}</th><td colSpan={4} className="gm-vide" />
                    <td data-mot="Honoraires HT">{euros(total(lignes, 'honoraires'))}</td>
                    <td data-mot="Commission HT">{euros(total(lignes, 'commission'))}</td>
                    {avecCollegue && <td data-mot="Collègue HT">{euros(total(lignes, 'collegue'))}</td>}
                  </tr>
                </tbody>
              </table>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Le bloc d'UN dossier : honoraires (location / gestion), dû à l'apporteur, dû au collègue, net agence — au centime. */
export function BlocDossier({ d, dont, anterieur = false, annee }: { d: DetailDossier; dont?: { annee: number; montant: number; total: number };
  /** Signé une année d'avant : il n'est sous cette année que pour son dû récurrent. */
  anterieur?: boolean;
  /** L'année dépliée du Cumul : le tableau mensuel n'en montre que les mois. */
  annee?: number }) {
  const h = d.honoraires;
  const lignesH = (h.location !== 0 ? 1 : 0) + (h.gestion !== 0 ? 1 : 0);
  return (
    <li data-dossier-detail={String(d.id)}>
      <span className="plo-dossier-titre">{dateFr(d.dateSignature)} — {d.libelle || 'dossier'}</span>
      {anterieur && dont !== undefined && <small className="dd-source" data-dossier-anterieur>Signé en {d.dateSignature.slice(0, 4)} : seul son dû récurrent de {dont.annee} compte dans cette année.</small>}
      <dl className="dd">
        <div className="dd-tete" data-ligne-dossier="honoraires-tete"><dt>Honoraires HT</dt>{lignesH === 0 && <dd>{euros(0)}</dd>}</div>
        {h.location !== 0 && <div className="dd-sous" data-ligne-dossier="honoraires-location"><dt>Transaction locative</dt><dd>{euros(h.location)}</dd></div>}
        {h.gestion !== 0 && (
          <div className="dd-sous" data-ligne-dossier="honoraires-gestion"><dt>Gestion<small className="dd-source">{h.baseGestion}</small></dt><dd>{euros(h.gestion)}</dd></div>
        )}
        {lignesH === 2 && <div className="dd-sous dd-total" data-ligne-dossier="honoraires-total"><dt>Total honoraires</dt><dd>{euros(h.total)}</dd></div>}
        <BlocDuDossier titre={`− Dû à l’apporteur (${d.apporteur.nom})`} b={d.apporteur} cle="apporteur" dont={dont} />
        {d.importRemplace !== null && (
          <div className="dd-sous" data-ligne-dossier="import-remplace"><dt><small className="dd-source" data-import-remplace>
            montant importé : {euros(d.importRemplace.montant)} — remplacé depuis toujours le {dateFr(d.importRemplace.le)}{d.importRemplace.par ? ` par ${d.importRemplace.par}` : ''}</small></dt></div>
        )}
        {d.collegue !== null && <BlocDuDossier titre={`− Dû au collègue (${d.collegue.nom})`} b={d.collegue} cle="collegue" />}
        <div className="dd-net" data-ligne-dossier="net"><dt>= Net agence HT</dt><dd>{euros(d.net)}</dd></div>
      </dl>
      {d.mensuel !== null && d.mensuel.mois.length > 0 && (
        <TableauGestionMensuelle libelle={d.mensuel.libelle} mois={d.mensuel.mois} annee={annee} collegue={d.collegue?.nom ?? null} />
      )}
    </li>
  );
}

type Cumul = { total?: Chiffres; parAnnee: (Chiffres & { annee: number; gestionRecurrente?: { honoraires: number; commission: number } })[] };

/**
 * Le cumul d'un apporteur (Arno, 23/10/2026) : « Total depuis le début » en 5 chiffres — dossiers (dont avenants), honoraires
 * apportés HT et TTC (TVA 20 %), DÛ à l'apporteur HT (l'outil n'enregistre pas les paiements : « dû », jamais « versé »), net
 * pour l'agence HT — puis le tableau : « Depuis le début », puis une ligne par ANNÉE, fermée ; un clic la déplie sur ses dossiers.
 */
export function CumulApporteur({ a, apporteurs, cle }: { a: Apporteur; apporteurs: readonly Apporteur[]; cle: unknown }) {
  const id = a.id;
  const [c, setC] = useState<Cumul | null | 'erreur'>(null);
  const [ouvertes, setOuvertes] = useState<ReadonlySet<number>>(() => new Set());
  const dossiers = useDossiersApporteur(id, cle);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_SUIVI}?vue=cumul-apporteur&id=${id}`, { cache: 'no-store' }).then((r) => r.json())
      .then((d: { etat?: string; data?: Cumul }) => { if (vivant) setC(d.etat === 'ok' && d.data && Array.isArray(d.data.parAnnee) ? d.data : 'erreur'); })
      .catch(() => { if (vivant) setC('erreur'); });
    return () => { vivant = false; };
  }, [id, cle]);
  if (c === null) return <p className="plo-muet plo-petit-texte" role="status">Lecture du cumul…</p>;
  if (c === 'erreur') return <p className="plo-muet plo-petit-texte">Cumul indisponible.</p>;
  if (c.parAnnee.length === 0) return <p className="plo-muet plo-petit-texte" data-cumul-vide>Aucune affaire apportée pour l’instant.</p>;
  const t: Chiffres = c.total ?? c.parAnnee.reduce((s, x) => ({ nb: s.nb + x.nb, avenants: (s.avenants ?? 0) + (x.avenants ?? 0), ca: s.ca + x.ca, commission: s.commission + x.commission }), { nb: 0, avenants: 0, ca: 0, commission: 0 });
  // 🔴 Arno (24/10/2026) — « Dû au collègue HT » : « — » pour un apporteur dont aucun collègue n'a jamais été rémunéré (ou un interne
  // depuis toujours). Ligne par ligne : honoraires − dû à l'apporteur − dû au collègue = net agence, au centime (`netAgence`).
  const sansCollegue = (estInterne(a) && !a.interneDepuis) || !(a.remunerations ?? []).some((r) => r.remunere);
  const cellules = (x: Chiffres) => (
    <><td data-mot="Dossiers">{x.nb}</td><td data-mot="Honoraires HT">{euros(x.ca)}</td><td data-mot="Honoraires TTC">{euros(ttc(x.ca))}</td>
      <td data-mot="Dû à l’apporteur HT">{euros(x.commission)}</td>
      <td data-mot="Dû au collègue HT" data-du-collegue-cumul>{sansCollegue ? '—' : euros(x.collegue ?? 0)}</td>
      <td data-mot="Net agence HT">{euros(netAgence(x))}</td></>
  );
  const jour = dossiers !== null && dossiers !== 'erreur' && dossiers.aujourdhui ? dossiers.aujourdhui : aujourdhuiParis();
  const nomApporteur = libelleApporteur(a);
  const basculer = (annee: number): void => setOuvertes((x) => { const n = new Set(x); if (n.has(annee)) n.delete(annee); else n.add(annee); return n; });
  return (
    <>
      <h4 className="plo-h4">Total depuis le début</h4>
      {/* 🔴 Arno (25/10/2026, accord) — chaque case : le libellé et le montant, RIEN D'AUTRE (plus de « TVA 20 % », ni de « dont location…
          » : la décomposition est dans les dossiers dépliés). Toutes les cases au même format (largeur, hauteur, centrage, taille). */}
      <ul className="plo-totaux" data-totaux-apporteur style={{ '--plo-cases': sansCollegue ? 5 : 6 } as React.CSSProperties}>
        {([['dossiers', 'Dossiers', String(t.nb)], ['ht', 'Honoraires apportés HT', euros(t.ca)], ['ttc', 'Honoraires apportés TTC', euros(ttc(t.ca))],
          ['du', 'Dû à l’apporteur HT', euros(t.commission)], ...(sansCollegue ? [] : [['collegue', 'Dû au collègue HT', euros(t.collegue ?? 0)]]),
          ['net', 'Net pour l’agence HT', euros(netAgence(t))]] as [string, string, string][]).map(([cle, mot, valeur]) => (
          <li key={cle} data-total-apporteur={cle}><span className="plo-total-mot">{mot}</span><strong>{valeur}</strong></li>
        ))}
      </ul>
      <h4 className="plo-h4">Cumul</h4>
      <table className="plo-cumul" data-cumul-apporteur>
        <thead><tr><th scope="col">Période</th><th scope="col">Dossiers</th><th scope="col">Honoraires HT</th><th scope="col">Honoraires TTC</th>
          <th scope="col">Dû à l’apporteur HT</th><th scope="col">Dû au collègue HT</th><th scope="col">Net agence HT</th></tr></thead>
        <tbody>
          <tr className="plo-cumul-total" data-cumul-ligne="total"><th scope="row">Depuis le début</th>{cellules(t)}</tr>
          {c.parAnnee.map((y) => {
            const ouverte = ouvertes.has(y.annee);
            // Les dossiers de l'année : ceux qui y apportent un dû (signés cette année, ou récurrents d'avant dus cette année) — leurs montants
            // affichés font la ligne de l'année, au centime (`contributionsAnnees`, la même règle qu'au serveur).
            const siens = dossiers === null || dossiers === 'erreur' ? null : dossiers.dossiers
              .map((d) => ({ d, parts: contributionsAnnees(d, apporteurs, jour) }))
              .filter((x) => x.parts.has(y.annee))
              .sort((p, q) => p.d.dateSignature.localeCompare(q.d.dateSignature) || String(p.d.id).localeCompare(String(q.d.id)))
              .flatMap((x) => {
                const det = detailDossier(x.d, apporteurs, jour, nomApporteur);
                if (det === null) return [];
                const etale = x.parts.size > 1;
                return [{ det, dont: etale ? { annee: y.annee, montant: (x.parts.get(y.annee) ?? 0) / 100, total: det.apporteur.total } : undefined,
                  anterieur: x.d.dateSignature.slice(0, 4) !== String(y.annee) }];
              });
            return (
              <Fragment key={y.annee}>
                <tr data-cumul-ligne={`Année ${y.annee}`} data-annee={y.annee} className="plo-cumul-annee">
                  <th scope="row">
                    <button type="button" className="plo-annee-bouton" aria-expanded={ouverte} aria-controls={`plo-annee-${id}-${y.annee}`} data-deplier-annee={y.annee}
                      onClick={() => basculer(y.annee)}><span className="plo-chevron" aria-hidden="true">{ouverte ? '▾' : '▸'}</span>Année {y.annee}</button>
                  </th>
                  {cellules(y)}
                </tr>
                {/* 🔴 Arno (25/10/2026) — la gestion récurrente de l'année : honoraires de gestion perçus et commission due (sous-lignes). */}
                {y.gestionRecurrente !== undefined && (y.gestionRecurrente.honoraires !== 0 || y.gestionRecurrente.commission !== 0) && (
                  <>
                    <tr className="plo-cumul-gestion" data-cumul-gestion={`honoraires-${y.annee}`}>
                      <th scope="row">Honoraires de gestion perçus HT</th><td colSpan={6} data-mot="Honoraires de gestion perçus HT">{euros(y.gestionRecurrente.honoraires)}</td></tr>
                    <tr className="plo-cumul-gestion" data-cumul-gestion={`commission-${y.annee}`}>
                      <th scope="row">Commission gestion due HT</th><td colSpan={6} data-mot="Commission gestion due HT">{euros(y.gestionRecurrente.commission)}</td></tr>
                  </>
                )}
                {ouverte && (
                  <tr className="plo-cumul-detail" id={`plo-annee-${id}-${y.annee}`} data-annee-detail={y.annee}>
                    <td colSpan={7}>
                      {siens === null ? <p className="plo-muet plo-petit-texte" role="status">{dossiers === 'erreur' ? 'Dossiers indisponibles.' : 'Lecture des dossiers…'}</p>
                        : siens.length === 0 ? <p className="plo-muet plo-petit-texte">Aucun dossier.</p>
                        : <ol className="plo-dossiers" data-dossiers-annee={y.annee}>{siens.map((x) => (
                          <BlocDossier key={String(x.det.id)} d={x.det} dont={x.dont} anterieur={x.anterieur} annee={y.annee} />))}</ol>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export const CSS_CUMUL_CONDITIONS = `
.plo-conditions{margin:8px 0;padding:10px 14px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-field);display:flex;flex-direction:column;gap:4px}
.plo-conditions p{margin:0;overflow-wrap:anywhere}
.plo-conditions-ligne{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;text-align:center;gap:8px 14px;color:var(--color-svv-ink);font-weight:800;font-variant-numeric:tabular-nums}
.plo-conditions .plo-pastille-mode{font-size:.95rem;padding:4px 12px;letter-spacing:.03em}
.plo-conditions-taux{font-size:1.3rem;line-height:1.25;font-weight:800;color:var(--color-svv-ink);font-variant-numeric:tabular-nums}
@media (max-width:640px){ .plo-conditions-taux{font-size:1.1rem} }
.plo-pastille-mode{border-color:transparent}
.plo-pastille-mode--one_shot{background:var(--color-svv-red-soft);color:var(--color-svv-red)}
.plo-pastille-mode--recurrent{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.plo-conditions-autres{color:var(--color-svv-amber);font-weight:700}
.plo-conditions-collegue{color:var(--color-svv-muted);font-weight:600}
.plo-annee-bouton{appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0;text-align:left}
.plo-annee-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:4px}
.plo-chevron{display:inline-block;width:1em;color:var(--color-svv-muted)}
.plo-cumul-detail>td{text-align:left !important;padding:8px 0 12px !important;white-space:normal !important}
.dd{margin:0;padding:8px 12px;border:1px solid var(--color-svv-line);border-radius:10px;background:var(--color-svv-field);font-size:.85rem;max-width:620px}
.dd>div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:2px 0}
.dd dt{color:var(--color-svv-muted);font-weight:600;min-width:0;overflow-wrap:anywhere}
.dd dd{margin:0;color:var(--color-svv-ink);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.dd-tete{margin-top:4px}
.dd-tete dt{color:var(--color-svv-ink);font-weight:700}
.dd-sous dt{padding-left:14px}
.dd-total dt,.dd-total dd{color:var(--color-svv-ink);font-weight:800}
.dd-total{border-top:1px dashed var(--color-svv-line-strong)}
.dd-source{display:block;font-size:.74rem;font-weight:500;color:var(--color-svv-muted)}
.dd-dont dt,.dd-dont dd{color:var(--color-svv-ink);font-weight:700;font-style:italic}
.dd-dont-total{font-weight:500;color:var(--color-svv-muted)}
.dd-net{border-top:1px solid var(--color-svv-line-strong);margin-top:4px;padding-top:4px !important}
.dd-net dt,.dd-net dd{color:var(--color-svv-ink);font-weight:800}
.plo-cumul-gestion th{padding-left:28px !important;font-weight:600 !important;color:var(--color-svv-muted) !important;font-size:.85rem}
.plo-cumul-gestion td{text-align:right;font-size:.85rem;font-variant-numeric:tabular-nums}
.gm{margin-top:8px;display:flex;flex-direction:column;gap:6px;max-width:100%}
.gm-bouton{appearance:none;border:0;background:transparent;color:var(--color-svv-ink);font:inherit;font-weight:700;font-size:.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0;text-align:left}
.gm-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:4px}
.gm-alerte{margin:0;padding:6px 10px;border-radius:10px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border:1px solid var(--color-svv-amber);font-size:.82rem;font-weight:700}
.gm-corps{overflow-x:auto;max-width:100%}
.gm-table{border-collapse:collapse;font-size:.8rem;width:100%;min-width:620px;margin-bottom:8px}
.gm-table th,.gm-table td{padding:4px 6px;border-bottom:1px solid var(--color-svv-line);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.gm-table .gm-g{text-align:left}
.gm-table thead th{color:var(--color-svv-muted);font-weight:700}
.gm-vacant td,.gm-vacant th{color:var(--color-svv-muted)}
.gm-total th,.gm-total td{font-weight:800;color:var(--color-svv-ink);border-top:2px solid var(--color-svv-line-strong)}
@media (max-width:640px){
  .gm .gm-table{min-width:0;display:block}
  .gm .gm-table thead{display:none}
  .gm .gm-table tbody,.gm .gm-table tr,.gm .gm-table th,.gm .gm-table td{display:block;width:100%;box-sizing:border-box}
  .gm .gm-table tr{border:1px solid var(--color-svv-line);border-radius:10px;padding:4px 8px;margin-bottom:6px}
  .gm .gm-table th,.gm .gm-table td{border:0;padding:2px 0;white-space:normal;text-align:left}
  .gm .gm-table td{display:flex;justify-content:space-between;gap:8px}
  .gm .gm-table td::before{content:attr(data-mot);color:var(--color-svv-muted);font-weight:700}
  .gm .gm-table td.gm-vide{display:none}
  .plo-cumul .plo-cumul-gestion th{display:none}
}
@media (max-width:640px){ .plo-cumul-detail>td::before{content:none} .plo-cumul-detail{padding:4px !important} .dd{padding:6px 8px} .dd-sous dt{padding-left:8px} }
`;
