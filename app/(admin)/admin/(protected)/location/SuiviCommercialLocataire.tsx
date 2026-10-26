'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlocSuiviCommercial, CSS_SUIVI_COMMERCIAL, ttcDepuisHt, useParametresSuivi, type ParametresSuivi } from './SuiviCommercial';
import { BlocReplie, CSS_BLOC_REPLIE } from './BlocReplie';
import { LigneManques } from './LigneManques';
import { ModaleIssue } from './ModaleIssue';
import { phraseConversion } from './ConversionMandat';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS } from './commun';
import type { EcranOrigine } from './OrigineActivite';
import { champsSuivi, changementsSuivi, type ChangementDossier, type NomsDossier, type SuiviDossier } from '../../../../lib/location/dossierLocation';
import { LIBELLE_TYPE_ACTIVITE } from '../../../../lib/location/suivi/suivi';
import {
  ECRAN_FICHE_LOCATAIRE_LOCATION, manquesSuiviCommercial, suiviDeDepart, suiviTouche, type BailDuLocataire, type CourantSuivi, type LectureSuiviLocataire,
} from '../../../../lib/location/suiviLocataire';

/**
 * ══ 🔴🔴 Arno (26/10/2026) — LE BLOC 4 « SUIVI COMMERCIAL » DANS LA FICHE LOCATAIRE ══════════════════════════════════════════════════════
 * Le MÊME composant que « Nouveau locataire » et le Dossier de location (`BlocSuiviCommercial`, sans pré-remplissage de création ; l'origine
 * dans son propre flux pour une ligne existante), sur la ligne de suivi du bail : PRÉ-REMPLI si le bloc a été validé (l'origine est
 * renseignée), VIDE sinon (aucune ligne, ou « À qualifier »). Un bloc vide ne compte comme une modification qu'une fois touché : rien
 * n'est écrasé sans qu'on l'ait rempli. « Mandat de gestion seul » (locataire en place) : montré comme tel, avec la mention de conversion.
 * Les autres baux et lignes du locataire : une liste repliée, en lecture (rien n'est fusionné). Ce qui manque : « Reste à renseigner ».
 * Deux hôtes : la « Fiche locataire » du Suivi du mois (un seul « Enregistrer les modifications » avec les blocs 1 et 3) et la fiche
 * du locataire dans la Location (`BlocSuiviCommercialLocataire`, son propre enregistrement). Aucun envoi à ADHOC & MONGA, aucun geste Drive.
 */
const API = '/api/admin/gestion/annuaire/location';

const nomsDepuis = (lu: ParametresSuivi | null): NomsDossier => {
  const n = (l: readonly { id: number; libelle?: string; nom?: string }[] | undefined, id: number): string => {
    const x = (l ?? []).find((y) => y.id === id);
    return x?.libelle ?? x?.nom ?? `n° ${id}`;
  };
  return { negociateur: (id) => n(lu?.negociateurs, id), collegue: (id) => n(lu?.collegues, id), apporteur: (id) => n(lu?.apporteurs, id) };
};
const ttcDe = (ht: string): string => ttcDepuisHt(ht) ?? '';

export type EtatSuiviLocataire = { sorte: 'lecture' } | { sorte: 'erreur'; motif: string } | { sorte: 'ok'; l: LectureSuiviLocataire };

/** L'état du bloc 4 d'un locataire : la lecture, l'état de départ, la saisie, ce qui a changé, ce qui manque, ce qui part au serveur. */
export function useSuiviLocataire(locataireId: number, o: { bailId?: number | null; activiteId?: number | null; nonRattache?: boolean } = {}) {
  const bailId = o.bailId ?? null;
  const activiteId = o.activiteId ?? null;
  const parametres = useParametresSuivi();
  const [etat, setEtat] = useState<EtatSuiviLocataire>({ sorte: 'lecture' });
  const [depart, setDepart] = useState<SuiviDossier | null>(null);
  const [saisie, setSaisie] = useState<SuiviDossier | null>(null);
  const [ttc, setTtc] = useState<{ proprietaire: string; locataire: string }>({ proprietaire: '', locataire: '' });
  const [n, setN] = useState(0);
  const url = `${API}?suiviLocataire=${locataireId}${bailId !== null ? `&bail=${bailId}` : ''}${activiteId !== null ? `&activite=${activiteId}` : ''}${o.nonRattache === true ? '&nonRattache=1' : ''}`;
  const charger = useCallback((): Promise<{ etat?: string; data?: LectureSuiviLocataire } | null> =>
    fetch(url, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: LectureSuiviLocataire }>).catch(() => null), [url]);
  const appliquer = useCallback((d: { etat?: string; data?: LectureSuiviLocataire } | null): void => {
    if (d === null) { setEtat({ sorte: 'erreur', motif: 'Le suivi commercial n’a pas pu être lu : le serveur n’a pas répondu.' }); return; }
    if (d.etat !== 'ok' || d.data === undefined || d.data.courant === undefined) {
      setEtat({ sorte: 'erreur', motif: d.etat === 'sans_schema' ? 'La base n’est pas à jour pour le suivi commercial (migration 407).' : 'Le suivi commercial n’a pas pu être lu.' });
      return;
    }
    const l = d.data;
    const dep = suiviDeDepart(l.courant);
    setEtat({ sorte: 'ok', l });
    setDepart(dep);
    setSaisie(dep);
    // Les TTC du bloc : déduits des HT de départ (le HT qu'ils redonnent est exactement celui-là : aucun écart inventé à l'ouverture).
    setTtc({ proprietaire: dep === null ? '' : ttcDe(dep.honoProprietaireHt), locataire: dep === null ? '' : ttcDe(dep.honoLocataireHt) });
    setN((x) => x + 1);
  }, []);
  const lire = useCallback(async (): Promise<void> => { appliquer(await charger()); }, [appliquer, charger]);
  useEffect(() => {
    let vivant = true;
    void charger().then((d) => { if (vivant) appliquer(d); });
    return () => { vivant = false; };
  }, [charger, appliquer]);
  /* L'origine enregistrée dans son propre flux (« Modifier », double validation) : la version et l'origine relues, le reste de la saisie
     GARDÉ — et l'état de départ suit (l'origine confirmée n'est pas une modification du bloc). */
  const origineRelue = useCallback(async (): Promise<void> => {
    const d = await charger();
    if (d === null || d.etat !== 'ok' || d.data === undefined || d.data.courant.sorte !== 'ligne') return;
    const l = d.data;
    const c = l.courant as Extract<CourantSuivi, { sorte: 'ligne' }>;
    const origine = (s: SuiviDossier | null): SuiviDossier | null => (s === null ? s : { ...s, origineContact: c.suivi.origineContact, origineContactPrecision: c.suivi.origineContactPrecision,
      collegueId: c.suivi.collegueId, apporteurId: c.suivi.apporteurId, apporteurTaux: c.suivi.apporteurTaux, commissionApporteur: c.suivi.commissionApporteur,
      apporteurMode: c.suivi.apporteurMode, apporteurTauxGestion: c.suivi.apporteurTauxGestion });
    setEtat({ sorte: 'ok', l });
    setDepart(origine);
    setSaisie(origine);
  }, [charger]);

  const courant = etat.sorte === 'ok' ? etat.l.courant : null;
  const noms = useMemo(() => nomsDepuis(parametres.lu), [parametres.lu]);
  const enPlace = courant !== null && (courant.sorte === 'ligne' || courant.sorte === 'sans_ligne') && courant.enPlace !== null;
  const manques = saisie === null || courant === null || (courant.sorte !== 'ligne' && courant.sorte !== 'sans_ligne') ? []
    : manquesSuiviCommercial(saisie, { annuaire: parametres.lu?.annuaire === true, enPlace });
  // Les changements : par rapport à la LIGNE telle qu'elle est en base (le récapitulatif dit ce qui sera réellement écrit).
  const brut: ChangementDossier[] = saisie === null || courant === null ? []
    : courant.sorte === 'ligne' ? changementsSuivi(courant.suivi, saisie, noms) : courant.sorte === 'sans_ligne' ? changementsSuivi(null, saisie, noms) : [];
  /* Touché ? Une ligne VALIDÉE (pré-remplie) : comme au Dossier, dès qu'un champ diffère de la ligne (ou qu'une saisie devient illisible).
     Un bloc VIDE : seulement si l'on a rempli quelque chose — jamais du seul fait qu'il est vide (rien n'est écrasé sans qu'on y touche). */
  const prerempli = courant !== null && courant.sorte === 'ligne' && courant.valide;
  const touche = depart !== null && saisie !== null && (prerempli ? brut.length > 0 || (champsSuivi(saisie, noms) === null && suiviTouche(depart, saisie)) : suiviTouche(depart, saisie));
  const changements = touche ? brut : [];
  return {
    etat, courant, parametres, depart, saisie, ttc, n, touche, manques, changements, lire, origineRelue,
    poser: setSaisie, poserTtc: setTtc,
    /** Ce qui part au serveur pour le bloc 4 (seulement si on y a touché). */
    envoi: !touche || saisie === null || courant === null ? null
      : courant.sorte === 'ligne' ? { bailId: courant.bailId, activiteId: courant.activiteId, version: courant.version, suivi: saisie }
        : courant.sorte === 'sans_ligne' ? { bailId: courant.bailId, activiteId: null, version: '', suivi: saisie } : null,
  };
}
export type SuiviLocataire = ReturnType<typeof useSuiviLocataire>;

const fr = (iso: string | null): string => (iso !== null && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const euros = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`.replace(/[  ]/g, ' ');

/** Les autres baux et lignes du locataire : une liste repliée, en lecture. */
function AutresBaux({ autres }: { autres: BailDuLocataire[] }) {
  const nb = autres.reduce((t, b) => t + Math.max(1, b.lignes.length), 0);
  if (autres.length === 0) return null;
  return (
    <BlocReplie id="slc-autres" section="autres-baux" titre="Autres baux et lignes de suivi" resume={`${nb} élément${nb > 1 ? 's' : ''}`} classe="slc-autres" niveau="h4"
      defilement={false} chevronAGauche donnees={{ 'data-autres-baux': String(autres.length) }}>
      <ul className="slc-liste">
        {autres.map((b) => (
          <li key={b.bailId} data-autre-bail={b.bailId}>
            <strong>{b.titre}</strong> <span className="loc-muet">— bail du {fr(b.entree)}{b.sortie !== null ? `, sorti le ${fr(b.sortie)}` : ', en cours'}</span>
            {b.lignes.length === 0 ? <p className="loc-muet slc-ligne">Aucune ligne de suivi pour ce bail.</p> : (
              <ul>{b.lignes.map((x) => (
                <li key={x.activiteId} className="slc-ligne" data-autre-ligne={x.activiteId}>
                  {LIBELLE_TYPE_ACTIVITE[x.type]} du {fr(x.dateSignature)} · {x.negociateur || 'négociateur non renseigné'} · origine : {x.origine ?? 'à renseigner'} · honoraires {euros(x.honoHt)} HT
                  {!x.valide && <span className="slc-pastille" data-a-qualifier> À qualifier</span>}
                  {x.conversion !== null && <span className="loc-muet slc-conversion"> — {phraseConversion(x.conversion)}</span>}
                </li>
              ))}</ul>
            )}
          </li>
        ))}
      </ul>
    </BlocReplie>
  );
}

/**
 * Le CONTENU du bloc 4 (sans titre de section) : le bloc de « Nouveau locataire » sur la ligne du bail, ou ce qui l'empêche ; la mention
 * d'un bloc vide ou d'une conversion ; la liste repliée des autres baux. `onTtcLocataire` : l'hôte qui porte les conditions d'entrée y
 * reporte les honoraires agence (la règle de « Nouveau locataire »).
 */
export function ContenuSuiviLocataire({ s, ecran, onTtcLocataire, loyer }: {
  s: SuiviLocataire; ecran: EcranOrigine; onTtcLocataire?: (ttc: string) => void; loyer?: { principal: string; provisions: string };
}) {
  if (s.etat.sorte === 'lecture') return <p className="gst-info" role="status">Lecture du suivi commercial…</p>;
  if (s.etat.sorte === 'erreur') return <p className="gst-erreur" role="alert">{s.etat.motif}</p>;
  const c = s.etat.l.courant;
  const autres = <AutresBaux autres={s.etat.l.autres} />;
  if (c.sorte === 'non_rattache') {
    return <><p className="loc-alerte loc-alerte--orange" role="status" data-suivi-non-rattache>Dossier non rattaché — à rattacher d’abord : cette ligne du suivi n’a pas de bail.</p>{autres}</>;
  }
  if (c.sorte === 'sans_bail') return <><p className="loc-muet" data-suivi-sans-bail>Ce locataire n’a aucun bail : il n’y a pas de suivi commercial à renseigner.</p>{autres}</>;
  if (s.saisie === null) return null;
  const saisie = s.saisie;
  const vide = c.sorte === 'sans_ligne' || !c.valide;
  return (
    <div className="slc" data-suivi-locataire={c.sorte === 'ligne' ? c.activiteId : 'nouveau'} data-suivi-prerempli={vide ? 'non' : 'oui'}>
      <p className="loc-muet slc-bail" data-suivi-bail={c.bailId}>{c.titre}</p>
      {vide && (
        <p className="loc-alerte loc-alerte--orange slc-vide" role="status" data-suivi-vide>
          {c.sorte === 'sans_ligne'
            ? 'Aucun suivi commercial n’a encore été enregistré pour ce bail : le bloc est vide. L’enregistrer crée la ligne de suivi, rattachée à ce bail.'
            : 'Rien n’a encore été validé dans ce bloc (origine du contact « à renseigner » : « À qualifier » dans le Suivi du mois) : il est vide. Les valeurs reprises sur la ligne restent telles quelles tant que ce bloc n’est pas rempli et enregistré.'}
        </p>
      )}
      {c.sorte === 'ligne' && c.suivi.type === 'gestion_seule' && (
        <p className="loc-muet slc-mandat" data-suivi-mandat-seul>
          « Mandat de gestion seul » — locataire en place à la prise en gestion, daté du mandat ({fr(c.suivi.dateSignature)}).
          {c.conversion !== null && <span data-suivi-conversion> {phraseConversion(c.conversion)}</span>}
        </p>
      )}
      <BlocSuiviCommercial key={s.n} valeur={saisie} onChange={(v) => s.poser({ ...v, categoriePrime: v.categoriePrime })} parametres={s.parametres} lotId={c.lotId}
        locataireIds={c.locataireIds} ttcProprietaire={s.ttc.proprietaire} ttcLocataire={s.ttc.locataire}
        onTtcProprietaire={(t) => s.poserTtc((x) => ({ ...x, proprietaire: t }))}
        onTtcLocataire={(t) => { s.poserTtc((x) => ({ ...x, locataire: t })); onTtcLocataire?.(t); }}
        manque={null} loyer={loyer} sansPreremplissage
        {...(c.sorte === 'ligne' ? { origineFlux: { activiteId: c.activiteId, ecran, onEnregistree: () => { void s.origineRelue(); } } } : {})}
        {...(c.enPlace !== null ? { enPlace: { dateMandat: c.enPlace.dateMandat } } : {})} />
      {autres}
    </div>
  );
}

/**
 * La fiche du locataire dans la LOCATION : le bloc 4 et son propre enregistrement — « Enregistrer le suivi commercial » (inactif tant
 * que rien n'a changé) → le récapitulatif (ancienne → nouvelle) → « Confirmer » ; « Reste à renseigner » dans la barre du bas.
 */
export function BlocSuiviCommercialLocataire({ locataireId }: { locataireId: number }) {
  const s = useSuiviLocataire(locataireId);
  const [issue, setIssue] = useState<null | { sorte: 'recap' } | { sorte: 'erreur' | 'conflit'; motif: string } | { sorte: 'ok'; motif: string }>(null);
  const [envoi, setEnvoi] = useState(false);
  const actif = s.touche && !envoi;
  const enregistrer = (): void => {
    if (!s.touche) return;
    if (s.manques.length > 0) { setIssue({ sorte: 'erreur', motif: `Reste à renseigner : ${s.manques.map((m) => m.replace(/^Suivi commercial : /, '')).join(' · ')}.` }); return; }
    if (s.changements.length === 0) { setIssue({ sorte: 'erreur', motif: 'Aucune modification à enregistrer : le bloc a les mêmes valeurs que la ligne de suivi.' }); return; }
    setIssue({ sorte: 'recap' });
  };
  const confirmer = async (): Promise<void> => {
    if (s.envoi === null || envoi) return;
    setEnvoi(true);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-svav-confirmation': 'propre' },
        body: JSON.stringify({ action: 'enregistrer-suivi-locataire', id: locataireId, ...s.envoi, ecran: ECRAN_FICHE_LOCATAIRE_LOCATION }) });
      const d = await r.json().catch(() => ({})) as { etat?: string; motif?: string; data?: { note?: string } };
      if (d.etat === 'ok') { setIssue({ sorte: 'ok', motif: typeof d.data?.note === 'string' ? `✓ Suivi commercial enregistré. ${d.data.note}` : '✓ Suivi commercial enregistré.' }); void s.lire(); return; }
      setIssue({ sorte: d.etat === 'conflit' ? 'conflit' : 'erreur', motif: d.motif ?? 'Le suivi commercial n’a pas été enregistré.' });
    } catch {
      setIssue({ sorte: 'erreur', motif: 'Le suivi commercial n’a pas été enregistré : le serveur n’a pas répondu.' });
    } finally { setEnvoi(false); }
  };
  const avecBloc = s.courant !== null && (s.courant.sorte === 'ligne' || s.courant.sorte === 'sans_ligne');
  return (
    <section className="svv-card loc-page slc-carte" aria-labelledby="slc-titre" data-bloc-suivi-locataire>
      <style>{CSS_LOCATION_ECRANS + CSS_LOCATION_CREATION + CSS_SUIVI_COMMERCIAL + CSS_BLOC_REPLIE + CSS_SUIVI_LOCATAIRE}</style>
      <h3 id="slc-titre" className="slc-titre"><span className="loc-num">4</span>Suivi commercial</h3>
      <ContenuSuiviLocataire s={s} ecran={ECRAN_FICHE_LOCATAIRE_LOCATION} />
      {avecBloc && (
        <div className="loc-collant slc-collant" data-collant-suivi>
          {s.manques.length > 0 ? <LigneManques manques={s.manques} attributs={{ 'data-manques-suivi': '' }} />
            : <p className="loc-manques" role="status" data-etat-suivi>{s.changements.length === 0 ? 'Aucune modification.' : `${s.changements.length} modification${s.changements.length > 1 ? 's' : ''} à enregistrer.`}</p>}
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!actif} onClick={enregistrer} data-enregistrer-suivi-locataire
            title={!s.touche ? 'Aucune modification à enregistrer.' : undefined}>{envoi ? 'Enregistrement…' : 'Enregistrer le suivi commercial'}</button>
        </div>
      )}
      {issue?.sorte === 'recap' && (
        <ModaleIssue sorte="attention" titre="Enregistrer le suivi commercial ?" onFermer={() => setIssue(null)}
          actions={[{ libelle: 'Revenir', onClick: () => setIssue(null), repere: 'revenir-suivi-locataire' },
            { libelle: envoi ? 'Enregistrement…' : 'Confirmer', onClick: () => { void confirmer(); }, principal: true, repere: 'confirmer-suivi-locataire' }]}>
          <RecapSuivi changements={s.changements} creation={s.courant?.sorte === 'sans_ligne'} />
        </ModaleIssue>
      )}
      {(issue?.sorte === 'erreur' || issue?.sorte === 'conflit') && (
        <ModaleIssue sorte={issue.sorte === 'conflit' ? 'attention' : 'erreur'} titre={issue.sorte === 'conflit' ? 'Suivi modifié par ailleurs' : 'Suivi commercial non enregistré'}
          onFermer={() => setIssue(null)} notes={[issue.motif]}
          actions={issue.sorte === 'conflit'
            ? [{ libelle: 'Revenir à la saisie', onClick: () => setIssue(null), repere: 'revenir-conflit-suivi' },
              { libelle: 'Recharger', onClick: () => { setIssue(null); void s.lire(); }, principal: true, repere: 'recharger-suivi-locataire' }]
            : [{ libelle: 'Fermer', onClick: () => setIssue(null), principal: true, repere: 'fermer-erreur-suivi' }]} />
      )}
      {issue?.sorte === 'ok' && <p className="mfl-ok slc-ok" role="status" data-suivi-enregistre>{issue.motif}</p>}
    </section>
  );
}

/** Le récapitulatif du bloc 4 (ancienne → nouvelle), partagé par les deux hôtes. */
export function RecapSuivi({ changements, creation }: { changements: readonly ChangementDossier[]; creation: boolean }) {
  return (
    <div className="mfl-recap-bloc" data-recap-bloc="4">
      <p className="mfl-recap-titre">4. Suivi commercial{creation ? ' — nouvelle ligne de suivi, rattachée au bail' : ''}</p>
      <ul>{changements.map((c) => <li key={c.champ} data-recap-champ>{c.champ} : <span className="mfl-avant">{c.avant}</span> → <strong>{c.apres}</strong></li>)}</ul>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons --color-svv-* seulement (clair, sombre). */
export const CSS_SUIVI_LOCATAIRE = `
.slc{display:flex;flex-direction:column;gap:10px}
.slc-bail{margin:0}
.slc-vide,.slc-mandat{margin:0}
.slc-autres{margin-top:6px;padding-top:6px;border-top:1px solid var(--color-svv-line)}
.slc-liste{margin:0;padding-left:1.1rem;display:flex;flex-direction:column;gap:8px;overflow-wrap:anywhere}
.slc-liste ul{margin:4px 0 0;padding-left:1.1rem}
.slc-ligne{margin:2px 0 0;font-size:.9rem}
.slc-pastille{margin-left:6px;padding:1px 8px;border-radius:999px;background:var(--color-svv-amber-soft);color:var(--color-svv-ink);font-size:.72rem;font-weight:800}
.slc-carte{display:flex;flex-direction:column;gap:12px}
.slc-titre{margin:0;font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.slc-collant .gst-btn{width:auto;min-height:44px}
.slc-ok{margin:0}
.mfl-pied .loc-manques-zone{flex:1 1 16rem;min-width:0;position:relative;align-self:center;margin-right:auto}
.mfl-pied .loc-manques-zone .loc-manques.loc-manques--ligne{display:block;min-width:0;margin:0}
`;
