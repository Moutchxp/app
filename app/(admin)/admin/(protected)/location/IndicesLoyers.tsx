'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ENTETE_CONFIRMATION } from '../../../../lib/location/confirmationEnregistrement';
import {
  cleTrimestre, indicesDuType, LIBELLE_TYPE_INDICE, libelleIndice, libelleTrimestre, revisionParDefaut, SIGLE_INDICE, TYPES_INDICE,
  typeIndiceParDefaut, valeurIndiceTexte, type IndiceSaisi, type SaisieIndice, type TypeIndice,
} from '../../../../lib/location/indicesLoyers';
import { ListeChoix } from './ListeChoix';
import { PAGE_PARAMETRES } from './parametresAdresse';
import { libelleLoyerRevise, LOYER_REVISE_VIDE, type LoyerReviseLu, type SaisieLoyerRevise } from '../../../../lib/location/loyerRevise';
import { ChampNombre } from './ChampNombre';

/**
 * ══ 🔴 Arno (25/10/2026, migration 423) — L'INDICE DES LOYERS ═══════════════════════════════════════════════════════════════════
 *   · le BLOC « Indice des loyers » : à droite de « Loyer mensuel » (Nouveau locataire, Dossier de location en modification), même
 *     hauteur, même dessin. Type d'indice (présélectionné selon le bien), indice appliqué (les indices déjà saisis de ce type, du plus
 *     récent au plus ancien, avec leur dernière utilisation ; le plus récent présélectionné ; « + Saisir un nouvel indice »), date de
 *     révision annuelle (l'anniversaire de l'entrée, modifiable). Les trois champs sont obligatoires ;
 *   · l'onglet « Indices » de Paramètres Location : la liste (dernière utilisation), la saisie, la correction, les indices MANQUANTS.
 * Pas d'INSEE (décision d'Arno) : seuls les indices saisis existent.
 */

const API = '/api/admin/location/indices';
const NOUVEAU = 'nouveau';
export interface AlerteIndice { type: TypeIndice; annee: number; trimestre: number; biens: string[] }
type Lecture = { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; disponible: boolean; indices: IndiceSaisi[]; alertes: AlerteIndice[] };
type Issue = { ok: true; indice?: IndiceSaisi } | { ok: false; motif: string; existant?: IndiceSaisi };

/** Les indices saisis (et les alertes), relus à la demande. */
export function useIndicesLoyers(): { lecture: Lecture; recharger: () => void; poster: (corps: Record<string, unknown>) => Promise<Issue> } {
  const [lecture, setLecture] = useState<Lecture>({ etat: 'charge' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(API, { headers: { Accept: 'application/json' } }).then((r) => r.json())
      .then((d: { etat?: string; data?: { disponible: boolean; indices: IndiceSaisi[]; alertes: AlerteIndice[] }; message?: string }) => {
        if (!vivant) return;
        const x = d.data;
        setLecture(d.etat === 'ok' && x && typeof x.disponible === 'boolean' && Array.isArray(x.indices)
          ? { etat: 'ok', disponible: x.disponible, indices: x.indices, alertes: Array.isArray(x.alertes) ? x.alertes : [] }
          : { etat: 'erreur', message: d.message ?? 'Lecture des indices impossible.' });
      })
      .catch(() => { if (vivant) setLecture({ etat: 'erreur', message: 'Lecture des indices impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [n]);
  const recharger = useCallback(() => setN((x) => x + 1), []);
  const poster = useCallback(async (corps: Record<string, unknown>): Promise<Issue> => {
    try {
      // L'écran confirme lui-même, sur place (message sous le formulaire) : la saisie autour n'est jamais quittée.
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', [ENTETE_CONFIRMATION]: 'propre' }, body: JSON.stringify(corps) });
      const d = await r.json() as { etat?: string; motif?: string; message?: string; data?: IndiceSaisi; existant?: IndiceSaisi };
      if (d.etat === 'ok') return { ok: true, ...(d.data ? { indice: d.data } : {}) };
      return { ok: false, motif: d.motif ?? d.message ?? 'Enregistrement refusé.', ...(d.existant ? { existant: d.existant } : {}) };
    } catch {
      return { ok: false, motif: 'Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été enregistré.' };
    }
  }, []);
  return { lecture, recharger, poster };
}

const OPTIONS_TYPE = TYPES_INDICE.map((t) => ({ id: t, libelle: LIBELLE_TYPE_INDICE[t] }));
const OPTIONS_TRIMESTRE = [1, 2, 3, 4].map((q) => ({ id: String(q), libelle: `T${q}` }));

/** Le formulaire d'un nouvel indice (trimestre + année + valeur) : bloc, et onglet « Indices ». */
function SaisieNouvelIndice({ type, onEnregistre, onAnnuler, poster, typeChoisi = false }: {
  type: TypeIndice | null;
  onEnregistre: (i: IndiceSaisi) => void;
  onAnnuler?: () => void;
  poster: (corps: Record<string, unknown>) => Promise<Issue>;
  /** L'onglet « Indices » : le type se choisit dans le formulaire. */
  typeChoisi?: boolean;
}) {
  const id = useId();
  const [choisi, setT] = useState<TypeIndice | null>(type);
  // Dans le bloc, le type est celui du bloc ; dans l'onglet « Indices », celui choisi dans le formulaire.
  const t = typeChoisi ? choisi : type;
  const [trimestre, setTrimestre] = useState('');
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [valeur, setValeur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<{ motif: string; existant?: IndiceSaisi } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const enregistrer = async (): Promise<void> => {
    if (envoi) return;
    setEnvoi(true); setRefus(null); setOk(null);
    const r = await poster({ action: 'creer', type: t, annee: Number(annee), trimestre: Number(trimestre), valeur });
    setEnvoi(false);
    if (r.ok && r.indice) {
      setOk(`✓ Indice ${SIGLE_INDICE[r.indice.type]} ${libelleTrimestre(r.indice.annee, r.indice.trimestre)} enregistré (${valeurIndiceTexte(r.indice.valeur)}).`);
      setValeur(''); setTrimestre('');
      onEnregistre(r.indice);
      return;
    }
    if (!r.ok) setRefus({ motif: r.motif, ...(r.existant ? { existant: r.existant } : {}) });
  };
  return (
    <div className="ilo-nouveau" data-nouvel-indice>
      {typeChoisi && (
        <div className="loc-champ"><span className="loc-cond-mot">Type d’indice</span>
          <ListeChoix options={OPTIONS_TYPE} valeur={t ?? ''} vide="— choisir —" libelle="Type du nouvel indice" onChange={(v) => setT(v === '' ? null : v as TypeIndice)} donnees={{ 'data-nouvel-indice-type': '' }} /></div>
      )}
      <div className="ilo-ligne">
        <div className="loc-champ"><span className="loc-cond-mot">Trimestre</span>
          <ListeChoix options={OPTIONS_TRIMESTRE} valeur={trimestre} vide="T…" libelle="Trimestre de l’indice" onChange={setTrimestre} donnees={{ 'data-nouvel-indice-trimestre': '' }} /></div>
        <label className="loc-champ" htmlFor={`${id}-annee`}><span className="loc-cond-mot">Année</span>
          <ChampNombre decimales={0} id={`${id}-annee`} maxLength={4} value={annee} onChange={(e) => setAnnee(e.target.value.replace(/\D/g, ''))} data-nouvel-indice-annee /></label>
        <label className="loc-champ" htmlFor={`${id}-valeur`}><span className="loc-cond-mot">Valeur</span>
          <ChampNombre decimales={3} id={`${id}-valeur`} placeholder="ex. 146,68" value={valeur} onChange={(e) => setValeur(e.target.value)} data-nouvel-indice-valeur /></label>
      </div>
      <p className="loc-muet ilo-aide">Trois décimales au plus. Un indice déjà saisi (même type, même trimestre) n’est jamais remplacé ici.</p>
      {refus !== null && (
        <p className="ilo-refus" role="alert" data-refus-indice>{refus.motif}
          {refus.existant !== undefined && (
            <button type="button" className="ilo-lien" onClick={() => { onEnregistre(refus.existant as IndiceSaisi); setRefus(null); }} data-utiliser-existant>
              Utiliser {libelleTrimestre(refus.existant.annee, refus.existant.trimestre)} — {valeurIndiceTexte(refus.existant.valeur)}</button>
          )}</p>
      )}
      {ok !== null && <p className="ilo-ok" role="status" data-indice-enregistre>{ok}</p>}
      <div className="ilo-boutons">
        {onAnnuler !== undefined && <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi} data-annuler-indice>Annuler</button>}
        <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void enregistrer(); }} disabled={envoi} data-enregistrer-indice>
          {envoi ? 'Enregistrement…' : 'Enregistrer l’indice'}</button>
      </div>
    </div>
  );
}

/**
 * Le BLOC « Indice des loyers ». Il pose lui-même la saisie (`valeur` absente) dès que les indices sont lus et que la base a la 423 :
 * le type selon le bien, l'indice le plus récent de ce type, la révision à l'anniversaire de l'entrée. Sans la 423 : le bandeau, et
 * rien n'est exigé ni envoyé.
 */
export function BlocIndiceLoyers({ valeur, onChange, famille, dateEntree, manque }: {
  valeur: SaisieIndice | undefined;
  onChange: (v: SaisieIndice) => void;
  /** La famille du bien (logement / local / parking…) : la présélection du type. */
  famille: string | null | undefined;
  dateEntree: string | null | undefined;
  manque: (cle: string) => ReactNode;
}) {
  const id = useId();
  const { lecture, recharger, poster } = useIndicesLoyers();
  const [nouveau, setNouveau] = useState(false);
  const indices = useMemo(() => (lecture.etat === 'ok' ? lecture.indices : []), [lecture]);
  // La révision suit la date d'entrée tant qu'on ne l'a pas modifiée (une révision déjà enregistrée n'est jamais recalculée).
  const manuelle = useRef(valeur !== undefined && valeur.revision !== '');
  const disponible = lecture.etat === 'ok' && lecture.disponible;
  useEffect(() => {
    if (!disponible || valeur !== undefined) return;
    const type = typeIndiceParDefaut(famille);
    const recent = indicesDuType(indices, type)[0];
    onChange({ type, reference: recent ? cleTrimestre(recent.annee, recent.trimestre) : '', revision: revisionParDefaut(dateEntree) });
  }, [disponible, valeur, famille, indices, dateEntree, onChange]);
  useEffect(() => {
    if (valeur === undefined || manuelle.current) return;
    const r = revisionParDefaut(dateEntree);
    if (r !== valeur.revision) onChange({ ...valeur, revision: r });
  }, [dateEntree, valeur, onChange]);
  const du = indicesDuType(indices, valeur?.type ?? null);
  const options = [
    ...du.map((i) => ({ id: cleTrimestre(i.annee, i.trimestre), libelle: libelleIndice(i) })),
    { id: NOUVEAU, libelle: '+ Saisir un nouvel indice' },
  ];
  return (
    <div className="loc-cond-bloc" data-cond="indice">
      <h4>Indice des loyers <span className="loc-oblig">*</span></h4>
      {lecture.etat === 'ok' && !lecture.disponible && (
        <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} data-indice-sans-migration>Mise à jour de la base à appliquer (migration 423) : l’indice des loyers ne sera pas enregistré.</p>
      )}
      {lecture.etat === 'erreur' && <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} role="status">{lecture.message}</p>}
      {lecture.etat === 'charge' && <p className="loc-muet" style={{ margin: 0 }} role="status">Lecture des indices…</p>}
      {disponible && valeur !== undefined && (
        <>
          <div className="loc-champ" data-indice="type"><span className="loc-cond-mot">Type d’indice</span>
            <ListeChoix options={OPTIONS_TYPE} valeur={valeur.type ?? ''} vide={null} libelle="Type d’indice" donnees={{ 'data-indice-type': '' }}
              onChange={(v) => {
                const type = v as TypeIndice;
                const recent = indicesDuType(indices, type)[0];
                onChange({ ...valeur, type, reference: recent ? cleTrimestre(recent.annee, recent.trimestre) : '' });
              }} />
            {manque('indice-type')}
          </div>
          <div className="loc-champ" data-indice="reference"><span className="loc-cond-mot">Indice appliqué</span>
            <ListeChoix options={options} valeur={valeur.reference} vide="— choisir —" libelle="Indice appliqué" donnees={{ 'data-indice-reference': '' }}
              onChange={(v) => { if (v === NOUVEAU) { setNouveau(true); return; } setNouveau(false); onChange({ ...valeur, reference: v }); }} />
            {du.length === 0 && !nouveau && <small className="loc-muet ilo-aide" data-aucun-indice>Aucun indice {valeur.type ? SIGLE_INDICE[valeur.type] : ''} saisi : « + Saisir un nouvel indice ».</small>}
            {manque('indice-reference')}
          </div>
          {nouveau && (
            <SaisieNouvelIndice type={valeur.type} poster={poster} onAnnuler={() => setNouveau(false)}
              onEnregistre={(i) => { recharger(); setNouveau(false); onChange({ ...valeur, type: i.type, reference: cleTrimestre(i.annee, i.trimestre) }); }} />
          )}
          <label className="loc-champ" htmlFor={`${id}-revision`} data-indice="revision"><span className="loc-cond-mot">Date de révision annuelle</span>
            <input id={`${id}-revision`} type="date" value={valeur.revision} data-indice-revision
              onChange={(e) => { manuelle.current = true; onChange({ ...valeur, revision: e.target.value }); }} />
            {manque('indice-revision')}
          </label>
        </>
      )}
    </div>
  );
}

const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/** L'onglet « Indices » de Paramètres Location : alertes, saisie, liste par type (dernière utilisation), correction. */
export function OngletIndices() {
  const { lecture, recharger, poster } = useIndicesLoyers();
  const [corrige, setCorrige] = useState<{ cle: string; valeur: string } | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (lecture.etat === 'charge') return <p className="plo-muet" role="status">Lecture…</p>;
  if (lecture.etat === 'erreur') return <p className="plo-alerte" role="status">{lecture.message}</p>;
  if (!lecture.disponible) return <p className="plo-alerte" role="status" data-indices-sans-migration>Mise à jour de la base à appliquer (migration 423) : les indices des loyers ne peuvent pas encore être saisis.</p>;
  const corriger = async (i: IndiceSaisi, v: string): Promise<void> => {
    if (envoi) return;
    setEnvoi(true); setMotif(null); setInfo(null);
    const r = await poster({ action: 'corriger', type: i.type, annee: i.annee, trimestre: i.trimestre, valeur: v });
    setEnvoi(false);
    if (r.ok) { setInfo(`✓ ${SIGLE_INDICE[i.type]} ${libelleTrimestre(i.annee, i.trimestre)} corrigé : ${v.replace('.', ',')}.`); setCorrige(null); recharger(); return; }
    setMotif(r.motif);
  };
  return (
    <section className="ilo-onglet" data-onglet-indices>
      <p className="plo-note">Les indices de révision des loyers saisis dans l’outil (pas de lecture automatique de l’INSEE). Une correction ne remplace rien
        en silence : elle s’ajoute à l’historique et s’applique aux calculs dès maintenant.</p>
      {lecture.alertes.length > 0 && (
        <div className="ilo-alertes" role="status" data-alertes-indices>
          {lecture.alertes.map((a) => (
            <p key={`${a.type}-${a.annee}-${a.trimestre}`} className="plo-alerte" data-alerte-indice={`${a.type}-${a.annee}-${a.trimestre}`}>
              <strong>Indice {SIGLE_INDICE[a.type]} T{a.trimestre} {a.annee} manquant</strong> — la révision ne peut pas être calculée (le dernier loyer connu est gardé) :
              {' '}{a.biens.join(' ; ')}.</p>
          ))}
        </div>
      )}
      <h3 className="plo-h3">Saisir un nouvel indice</h3>
      <SaisieNouvelIndice type={null} typeChoisi poster={poster} onEnregistre={() => recharger()} />
      {motif !== null && <p className="plo-erreur" role="alert">{motif}</p>}
      {info !== null && <p className="plo-ok" role="status">{info}</p>}
      {TYPES_INDICE.map((t) => {
        const liste = indicesDuType(lecture.indices, t);
        return (
          <div key={t} data-indices-type={t}>
            <h3 className="plo-h3">{LIBELLE_TYPE_INDICE[t]}</h3>
            {liste.length === 0 ? <p className="plo-muet plo-petit-texte">Aucun indice saisi.</p> : (
              <ul className="plo-versions">
                {liste.map((i) => {
                  const cle = `${t}-${cleTrimestre(i.annee, i.trimestre)}`;
                  return (
                    <li key={cle} data-indice-ligne={cle}>
                      <p className="plo-version-titre"><strong>{libelleTrimestre(i.annee, i.trimestre)} — {valeurIndiceTexte(i.valeur)}</strong></p>
                      <p className="plo-muet plo-petit-texte">{i.derniereUtilisation === null ? 'Jamais utilisé' : `Dernière utilisation le ${dateFr(i.derniereUtilisation)}`}</p>
                      {corrige?.cle === cle ? (
                        <div className="ilo-ligne">
                          <label className="plo-champ"><span>Valeur corrigée</span>
                            <ChampNombre decimales={3} value={corrige.valeur} onChange={(e) => setCorrige({ cle, valeur: e.target.value })} data-valeur-corrigee /></label>
                          <span className="ilo-boutons">
                            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setCorrige(null)} disabled={envoi}>Annuler</button>
                            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void corriger(i, corrige.valeur); }} disabled={envoi} data-enregistrer-correction>
                              {envoi ? 'Enregistrement…' : 'Enregistrer la correction'}</button>
                          </span>
                        </div>
                      ) : (
                        <button type="button" className="svv-btn svv-btn-outline gst-btn plo-corriger" onClick={() => { setCorrige({ cle, valeur: valeurIndiceTexte(i.valeur) }); setMotif(null); setInfo(null); }}
                          data-corriger-indice={cle}>Corriger</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Jetons du thème ; cibles ≥ 44 px. */
export const CSS_INDICES = `
.ilo-nouveau{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px dashed var(--color-svv-line-strong);border-radius:14px;background:var(--color-svv-surface)}
.ilo-ligne{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:start}
@media (max-width:480px){ .ilo-ligne{grid-template-columns:minmax(0,1fr)} }
.ilo-ligne input{min-height:44px;box-sizing:border-box;width:100%}
.ilo-aide{font-size:.85rem;margin:0}
.ilo-refus{margin:0;color:var(--color-svv-red);font-weight:700;font-size:.9rem;display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.ilo-ok{margin:0;color:var(--color-svv-green-ink);font-weight:700;font-size:.9rem}
.ilo-lien{appearance:none;border:0;background:none;padding:0;min-height:44px;font:inherit;font-weight:700;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
.ilo-boutons{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.ilo-boutons .gst-btn{width:auto;min-height:44px}
.ilo-alertes{display:flex;flex-direction:column;gap:6px}
.ilo-onglet{display:flex;flex-direction:column;gap:8px}
.ilo-liste-revises{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ilo-liste-revises li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;padding:8px 12px;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface)}
.ilo-question{font-weight:700;align-self:center}
.ilo-ajout{width:auto;min-height:44px;align-self:flex-start}
.ilo-nouveau .loc-champ{display:flex;flex-direction:column;gap:4px;min-width:0}
.ilo-nouveau .loc-cond-mot{font-weight:700;color:var(--color-svv-ink)}
.ilo-nouveau input{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;color:var(--color-svv-ink);background:var(--color-svv-surface);min-width:0;width:100%;box-sizing:border-box}
`;

/**
 * 🔴 Arno (25/10/2026, Q2) — « LOYER RÉVISÉ » du Dossier de location : les loyers réels révisés du bail (date d'effet, loyer HC,
 * provisions), PRIORITAIRES sur le calcul (affichés « réel » dans le tableau mensuel). Chaque ajout / annulation s'enregistre aussitôt
 * (son propre bouton) ; une ligne annulée reste en base. Sans la 423 : le bandeau.
 */
export function LoyersRevises({ bailId }: { bailId: number }) {
  const id = useId();
  const [lu, setLu] = useState<{ disponible: boolean; loyers: LoyerReviseLu[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const [saisie, setSaisie] = useState<SaisieLoyerRevise>(LOYER_REVISE_VIDE);
  const [ouvert, setOuvert] = useState(false);
  const [annuler, setAnnuler] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?bail=${bailId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json())
      .then((d: { etat?: string; data?: { disponible: boolean; loyers: LoyerReviseLu[] }; message?: string }) => {
        if (!vivant) return;
        if (d.etat === 'ok' && d.data && Array.isArray(d.data.loyers)) setLu(d.data); else setErreur(d.message ?? 'Lecture des loyers révisés impossible.');
      })
      .catch(() => { if (vivant) setErreur('Lecture des loyers révisés impossible : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [bailId, n]);
  const poster = async (corps: Record<string, unknown>, reussite: string): Promise<void> => {
    if (envoi) return;
    setEnvoi(true); setMotif(null); setInfo(null);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', [ENTETE_CONFIRMATION]: 'propre' }, body: JSON.stringify(corps) });
      const d = await r.json() as { etat?: string; motif?: string; message?: string };
      if (d.etat === 'ok') { setInfo(reussite); setN((x) => x + 1); setSaisie(LOYER_REVISE_VIDE); setOuvert(false); setAnnuler(null); return; }
      setMotif(d.motif ?? d.message ?? 'Enregistrement refusé.');
    } catch {
      setMotif('Enregistrement impossible : le serveur n’a pas répondu. Rien n’a été enregistré.');
    } finally { setEnvoi(false); }
  };
  return (
    <div className="loc-cond-bloc ilo-revises" data-loyers-revises>
      <h4>Loyer révisé</h4>
      {erreur !== null && <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} role="status">{erreur}</p>}
      {lu === null && erreur === null && <p className="loc-muet" style={{ margin: 0 }} role="status">Lecture…</p>}
      {lu !== null && !lu.disponible && <p className="loc-alerte loc-alerte--orange" style={{ margin: 0 }} data-revise-sans-migration>{'Mise à jour de la base à appliquer (migration 423) : les loyers révisés ne peuvent pas encore être enregistrés.'}</p>}
      {lu !== null && lu.disponible && (
        <>
          <p className="loc-muet ilo-aide">Le loyer réellement appliqué après une révision : il l’emporte sur le loyer calculé (entrée × indices) à partir de sa date d’effet.
            S’enregistre aussitôt, sans « Enregistrer » le dossier.</p>
          {lu.loyers.length === 0 ? <p className="loc-muet" style={{ margin: 0 }} data-aucun-revise>Aucun loyer révisé saisi.</p> : (
            <ul className="ilo-liste-revises">
              {lu.loyers.map((l) => (
                <li key={l.id} data-loyer-revise={l.id}>
                  <span><strong>{libelleLoyerRevise(l)}</strong><small className="loc-muet"> · saisi par {l.saisiPar}</small></span>
                  {annuler === l.id ? (
                    <span className="ilo-boutons">
                      <span className="ilo-question">Annuler ce loyer révisé ?</span>
                      <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setAnnuler(null)} disabled={envoi}>Non</button>
                      <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { void poster({ action: 'annuler-loyer-revise', id: l.id }, '✓ Loyer révisé annulé.'); }} disabled={envoi} data-confirmer-annulation>Oui, l’annuler</button>
                    </span>
                  ) : <button type="button" className="ilo-lien" onClick={() => { setAnnuler(l.id); setMotif(null); setInfo(null); }} data-annuler-revise={l.id}>Annuler</button>}
                </li>
              ))}
            </ul>
          )}
          {ouvert ? (
            <div className="ilo-nouveau" data-saisie-revise>
              <div className="ilo-ligne">
                <label className="loc-champ" htmlFor={`${id}-effet`}><span className="loc-cond-mot">Date d’effet</span>
                  <input id={`${id}-effet`} type="date" value={saisie.effetLe} onChange={(e) => setSaisie({ ...saisie, effetLe: e.target.value })} data-revise-effet /></label>
                <label className="loc-champ" htmlFor={`${id}-hc`}><span className="loc-cond-mot">Loyer HC</span>
                  <ChampNombre id={`${id}-hc`} placeholder="ex. 1 210,40" value={saisie.loyerHc} onChange={(e) => setSaisie({ ...saisie, loyerHc: e.target.value })} data-revise-hc /></label>
                <label className="loc-champ" htmlFor={`${id}-prov`}><span className="loc-cond-mot">Provisions</span>
                  <ChampNombre id={`${id}-prov`} placeholder="ex. 90" value={saisie.provisions} onChange={(e) => setSaisie({ ...saisie, provisions: e.target.value })} data-revise-provisions /></label>
              </div>
              <div className="ilo-boutons">
                <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setOuvert(false); setMotif(null); }} disabled={envoi}>Annuler</button>
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} data-enregistrer-revise
                  onClick={() => { void poster({ action: 'loyer-revise', bailId, ...saisie }, '✓ Loyer révisé enregistré.'); }}>{envoi ? 'Enregistrement…' : 'Enregistrer le loyer révisé'}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="svv-btn svv-btn-outline gst-btn ilo-ajout" onClick={() => { setOuvert(true); setInfo(null); }} data-ajouter-revise>+ Ajouter un loyer révisé</button>
          )}
          {motif !== null && <p className="ilo-refus" role="alert" data-refus-revise>{motif}</p>}
          {info !== null && <p className="ilo-ok" role="status" data-revise-ok>{info}</p>}
        </>
      )}
    </div>
  );
}

/**
 * 🔴 Arno (25/10/2026, décision 4) — sur la fiche du bien (Location) : l'alerte « indice … manquant » quand une révision de SON bail ne
 * peut pas être calculée (le dernier loyer connu est gardé). Rien du tout quand il n'en manque aucun (ou sans la 423).
 */
export function AlerteIndiceBien({ lotId, parCle = false }: { lotId: number; parCle?: boolean }) {
  const [alertes, setAlertes] = useState<AlerteIndice[]>([]);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?${parCle ? 'bienCle' : 'lot'}=${lotId}`, { headers: { Accept: 'application/json' } }).then((r) => r.json())
      .then((d: { etat?: string; data?: { alertes?: AlerteIndice[] } }) => { if (vivant && d.etat === 'ok' && Array.isArray(d.data?.alertes)) setAlertes(d.data.alertes); })
      .catch(() => { /* une lecture impossible ne montre rien : la fiche reste entière */ });
    return () => { vivant = false; };
  }, [lotId, parCle]);
  if (alertes.length === 0) return null;
  return (
    <div className="ilo-alerte-bien" role="status" data-alerte-indice-bien>
      <style>{`.ilo-alerte-bien{margin:0 0 12px;padding:10px 14px;border-radius:12px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border:1px solid var(--color-svv-amber);font-weight:600}
.ilo-alerte-bien a{color:inherit;font-weight:800}`}</style>
      {alertes.map((a) => (
        <p key={`${a.type}-${a.annee}-${a.trimestre}`} style={{ margin: 0 }}>
          <strong>Indice {SIGLE_INDICE[a.type]} T{a.trimestre} {a.annee} manquant</strong> : la révision du loyer ne peut pas être calculée (le dernier loyer connu est gardé).
          {' '}<a href={`${PAGE_PARAMETRES}?onglet=indices`} data-saisir-indice>Saisir l’indice</a></p>
      ))}
    </div>
  );
}
