'use client';

import { useEffect, useMemo, useState } from 'react';
import { EtatLecture, envoyer, useLecture } from './commun';
import { ConfirmationSortie, EncartDuLogement, MESSAGE_SORTIE_GESTION } from './SortieLocataires';
import { aujourdhuiParisEcran, CSS_PREAVIS, MentionPreavis } from './Preavis';
import {
  ajouterMois, dateFrPreavis, EDL_MOIS_APRES_FIN, lireTri, trierPreavis, TRI_DEFAUT, verifierEtatDesLieux,
  type LignePreavisAccueil, type TriPreavis,
} from '../../../../lib/location/preavis';
import type { BailLogement, EncartLogement } from '../../../../lib/location/sortieLocataires';
import {
  heureFinProposee, mentionEdls, pastilleEdls, verifierPlanification, type EdlsAffiche,
} from '../../../../lib/location/edls';
import { statutPreavis } from '../../../../lib/location/preavis';

/**
 * ══ 🔴🔴 ACCUEIL LOCATION — LE BLOC « LOCATAIRES EN PRÉAVIS » (Arno, 18/10/2026) ═════════════════════════════════════════
 * Sous les trois grosses cases, séparé d'elles par EXACTEMENT le même espace que celui qui sépare la barre de recherche des
 * cases (le même espace réservé `loc-zone-resultats loc-zone-resultats--vide`, posé par l'accueil). Une ligne par préavis,
 * TOUTES DE LA MÊME HAUTEUR (deux lignes de texte) : les locataires ; l'adresse · « Fin de préavis le … » · « État des lieux
 * le … » ; la mention orange (« en préavis » / « Préavis échu — sortie à saisir », avec le mot) ; « Ouvrir » / « Fermer ».
 * Dépliée : la date d'état des lieux prévue (saisie, modifiable, effaçable — journalisé), la SORTIE OFFICIELLE par LA
 * confirmation réduite commune (`ConfirmationSortie` → action `sortie-locataires` → `enregistrerSortie`, droit Gestion vérifié
 * au serveur), les liens vers la fiche et l'écran de sortie. Deux tris segmentés, mémorisés en préférence LOCALE.
 * Les données sont celles du préavis (`preavisEnCours`) : aucune table propre à l'accueil, aucune deuxième implémentation.
 *
 * ══ 🔴🔴 ARNO (19/10/2026) — FICHE DÉPLIÉE COMPLÈTE + « EDLS PLANIFIÉ » ═════════════════════════════════════════════════
 * Dépliée : l'encart « Le logement » de l'écran de sortie (MÊME composant, avec les coordonnées) et les dates du préavis.
 * « Planifier l'état des lieux de sortie » (date, début, fin, « Confier à », commentaire) crée une TÂCHE du module de
 * tâches de la Gestion ; la ligne passe AUSSITÔT à « EDLS planifié » (bleu : le locataire occupe toujours ; l'alerte
 * « Préavis échu » garde la priorité). « Déplacer » et, après un refus, « Confier à quelqu'un d'autre ». La date de l'EDLS
 * EST la date d'état des lieux (une seule donnée) : la planification REMPLACE la saisie à la main de cette date (Arno) —
 * qui reste offerte tant que la migration 385 n'est pas appliquée.
 */

export const CLE_TRI = 'svav.location.preavis.tri';

function lireTriMemorise(): TriPreavis {
  try { return lireTri(window.localStorage.getItem(CLE_TRI)); } catch { return TRI_DEFAUT; }
}
function memoriserTri(t: TriPreavis): void {
  try { window.localStorage.setItem(CLE_TRI, `${t.cle}:${t.sens}`); } catch { /* préférence d'affichage seulement : l'écran marche sans */ }
}

interface Donnees { disponible: boolean; etatDesLieux: boolean; planification?: boolean; lignes: LignePreavisAccueil[] }

export function BlocPreavisAccueil({ gestion }: { gestion: boolean }) {
  const [version, setVersion] = useState(0);
  const lu = useLecture<Donnees>(`preavisEnCours=1&v=${version}`);
  const [tri, setTri] = useState<TriPreavis>(TRI_DEFAUT);
  // La préférence locale est lue APRÈS le montage : le rendu serveur et le premier rendu client restent identiques.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTri(lireTriMemorise()); }, []);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);
  // L'EDLS que l'on vient de planifier, montré AUSSITÔT, en attendant la relecture du serveur (qui le remplace).
  const [locaux, setLocaux] = useState<Record<string, EdlsAffiche>>({});
  const choisirTri = (t: TriPreavis): void => { setTri(t); memoriserTri(t); };
  const d = lu.etat.etat === 'ok' ? lu.etat.data : null;
  // Une réponse inattendue (serveur plus ancien que l'écran) ne fait jamais tomber l'accueil : on n'affiche que ce qui est lisible.
  const lignes = d === null || !Array.isArray(d.lignes) ? []
    : trierPreavis(d.lignes.map((x) => (locaux[x.cle] ? { ...x, edls: locaux[x.cle], etatDesLieuxLe: locaux[x.cle].jour } : x)), tri);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLocaux({}); }, [d]);
  const jour = aujourdhuiParisEcran();
  const segment = (t: TriPreavis, libelle: string) => (
    <button type="button" className="pva-segment" aria-pressed={tri.cle === t.cle && tri.sens === t.sens}
      data-tri={`${t.cle}:${t.sens}`} onClick={() => choisirTri(t)}>{libelle}</button>
  );
  return (
    <section className="pva" aria-label="Locataires en préavis" data-bloc-preavis>
      <style>{CSS_PREAVIS + CSS_PREAVIS_ACCUEIL}</style>
      <h2 className="pva-titre">Locataires en préavis <span className="loc-pastille" data-nombre-preavis>{lignes.length}</span></h2>
      {lu.etat.etat !== 'ok' ? <EtatLecture etat={lu.etat} /> : !d!.disponible ? (
        <p className="loc-muet" data-preavis-indisponible>Préavis : la mise à jour de la base (migration 383) reste à appliquer.</p>
      ) : (
        <>
          <div className="pva-tris" role="group" aria-label="Trier les préavis">
            <div className="pva-tri" role="group" aria-label="Fin de préavis">
              <span className="pva-tri-libelle">Fin de préavis</span>
              {segment({ cle: 'fin', sens: 'asc' }, 'Plus proche d’abord')}
              {segment({ cle: 'fin', sens: 'desc' }, 'Plus lointaine d’abord')}
            </div>
            <div className="pva-tri" role="group" aria-label="État des lieux">
              <span className="pva-tri-libelle">État des lieux</span>
              {segment({ cle: 'edl', sens: 'asc' }, 'Plus proche d’abord')}
              {segment({ cle: 'edl', sens: 'desc' }, 'Plus lointain d’abord')}
            </div>
          </div>
          {bilan !== null && <p className="gst-info" role="status" data-preavis-bilan>{bilan}</p>}
          {lignes.length === 0 ? <p className="loc-muet" data-preavis-vide>Aucun locataire en préavis</p> : (
            <ul className="pva-liste">
              {lignes.map((l) => {
                const noms = l.locataires.map((x) => x.nom).join(', ');
                const detail = [l.adresse ?? `Bien ${l.lotId}`, `Fin de préavis le ${dateFrPreavis(l.dateMax)}`,
                  l.edls ? mentionEdls(l.edls) : l.etatDesLieuxLe ? `État des lieux le ${dateFrPreavis(l.etatDesLieuxLe)}` : null].filter((x) => x !== null).join(' · ');
                const estOuverte = ouverte === l.cle;
                return (
                  <li key={l.cle} className="pva-item" data-ligne-preavis={l.cle}>
                    <div className="pva-ligne">
                      <div className="pva-textes">
                        <span className="pva-noms" title={noms}>{noms}</span>
                        <span className="pva-detail" title={detail}>{detail}</span>
                      </div>
                      {/* L'alerte « Préavis échu » garde la priorité ; sinon « EDLS planifié » (bleu), sinon « en préavis ». */}
                      {l.edls && statutPreavis(l, jour) !== 'echu'
                        ? <span className="pvs-mention pvs-mention--en_preavis" data-preavis="edls" data-edls-statut={l.edls.statut ?? 'planifie'}>{pastilleEdls(l.edls)}</span>
                        : <MentionPreavis p={l} jour={jour} court />}
                      <button type="button" className="svv-btn svv-btn-outline gst-btn pva-ouvrir" aria-expanded={estOuverte}
                        aria-label={`${estOuverte ? 'Fermer' : 'Ouvrir'} le préavis de ${noms}`} data-ouvrir-preavis={l.cle}
                        onClick={() => setOuverte(estOuverte ? null : l.cle)}>{estOuverte ? 'Fermer' : 'Ouvrir'}</button>
                    </div>
                    {estOuverte && (
                      <LigneDepliee l={l} gestion={gestion} edlDisponible={d!.etatDesLieux} planification={d!.planification === true}
                        apres={() => setVersion((v) => v + 1)}
                        edlsPose={(e) => { setLocaux((m) => ({ ...m, [l.cle]: e })); lu.rafraichir(); }}
                        sortieFaite={(phrase, mail) => {
                          setOuverte(null);
                          setBilan(`Sortie enregistrée — ${noms}. ${phrase}${mail === null ? '' : ` ${mail}`}`);
                          setVersion((v) => v + 1);
                        }} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function LigneDepliee({ l, gestion, edlDisponible, planification, apres, edlsPose, sortieFaite }: {
  l: LignePreavisAccueil; gestion: boolean; edlDisponible: boolean; planification: boolean; apres: () => void;
  edlsPose: (e: EdlsAffiche) => void; sortieFaite: (phrase: string, mail: string | null) => void;
}) {
  const [edl, setEdl] = useState(l.etatDesLieuxLe ?? '');
  const [refusEdl, setRefusEdl] = useState<string | null>(null);
  const [envoiEdl, setEnvoiEdl] = useState(false);
  const [sortie, setSortie] = useState(false);
  const verdict = verifierEtatDesLieux(edl, [{ recuLe: l.recuLe, dateMax: l.dateMax }]);
  const enregistrerEdl = async (date: string): Promise<void> => {
    setEnvoiEdl(true); setRefusEdl(null);
    const r = await envoyer({ action: 'etat-des-lieux', occupationIds: l.occupationIds, date });
    setEnvoiEdl(false);
    if (r.motif !== null) { setRefusEdl(r.motif); return; }
    if (date === '') setEdl('');
    apres();
  };
  const premier = l.locataires[0];
  return (
    <div className="pva-depliee" data-ligne-depliee={l.cle}>
      <InfosDuLogement l={l} />
      {planification ? <BlocEdls l={l} edlsPose={edlsPose} /> : (
      <div className="pva-bloc" data-bloc-edl>
        <label className="pvs-champ">
          <span className="pvs-libelle">Date d’état des lieux de sortie prévue</span>
          <input type="date" value={edl} min={l.recuLe} max={ajouterMois(l.dateMax, EDL_MOIS_APRES_FIN)} disabled={!edlDisponible}
            onChange={(e) => { setEdl(e.target.value); setRefusEdl(null); }} data-date-edl />
        </label>
        {!edlDisponible && <p className="loc-muet">La mise à jour de la base (migration 384) reste à appliquer.</p>}
        {edlDisponible && !verdict.ok && <p className="cp-refus" role="status" data-message-edl>{verdict.motif}</p>}
        {refusEdl !== null && <p className="cp-refus" role="alert">{refusEdl}</p>}
        <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!edlDisponible || envoiEdl || !verdict.ok || edl === '' || edl === (l.etatDesLieuxLe ?? '')}
            onClick={() => { void enregistrerEdl(edl); }} data-enregistrer-edl>Enregistrer la date</button>
          {l.etatDesLieuxLe !== null && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={envoiEdl} onClick={() => { void enregistrerEdl(''); }} data-effacer-edl>Effacer la date</button>
          )}
        </div>
        <p className="loc-muet" data-planification-indisponible>Planifier l’état des lieux (tâche, rendez-vous) : la mise à jour de la base (migration 385) reste à appliquer.</p>
      </div>
      )}
      <div className="pva-bloc" data-bloc-sortie-officielle>
        <p className="pvs-libelle" style={{ margin: 0 }}>Date officielle de sortie</p>
        {!gestion ? <p className="sor-gestion-seule-texte" role="note" data-sortie-gestion-seule>{MESSAGE_SORTIE_GESTION}</p>
          : !sortie ? (
            <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => setSortie(true)} data-valider-sortie>Valider la sortie</button>
            </div>
          ) : <SortieDuPreavis l={l} onAnnuler={() => setSortie(false)} onFait={sortieFaite} />}
      </div>
      <p className="pva-liens">
        {l.locataires.map((x) => (
          <a key={x.occupationId} href={`/admin/location/locataire/${x.locataireId}`} data-lien-fiche={x.locataireId}>
            Voir la fiche du locataire{l.locataires.length > 1 ? ` (${x.nom})` : ''}</a>
        ))}
        {premier !== undefined && <a href={`/admin/location/locataire/${premier.locataireId}?sortie=${l.occupationId}`} data-lien-ecran-sortie>Écran de sortie</a>}
      </p>
    </div>
  );
}

/** L'encart « Le logement » de l'écran de sortie (MÊME composant), avec les coordonnées, et les dates du préavis. */
function InfosDuLogement({ l }: { l: LignePreavisAccueil }) {
  const lu = useLecture<EncartLogement>(`encartBail=${l.occupationId}`);
  return (
    <div className="pva-bloc pva-logement" data-infos-logement>
      {lu.etat.etat === 'ok' ? <EncartDuLogement e={lu.etat.data} coordonnees /> : <EtatLecture etat={lu.etat} />}
      <p className="pva-dates-preavis" data-dates-preavis>Préavis : recommandé reçu le {dateFrPreavis(l.recuLe)} — fin du préavis le {dateFrPreavis(l.dateMax)}</p>
    </div>
  );
}

interface Personne { id: number; libelle: string }

/** L'EDLS de la ligne : « Planifier », ou son état avec « Déplacer » — et, après un refus, « Confier à quelqu'un d'autre ». */
function BlocEdls({ l, edlsPose }: { l: LignePreavisAccueil; edlsPose: (e: EdlsAffiche) => void }) {
  const [mode, setMode] = useState<'lecture' | 'planifier' | 'deplacer' | 'reattribuer'>('lecture');
  const [bilan, setBilan] = useState<string | null>(null);
  const e = l.edls ?? null;
  const fait = (x: EdlsAffiche, phrase: string): void => { setMode('lecture'); setBilan(phrase); edlsPose(x); };
  return (
    <div className="pva-bloc" data-bloc-edls>
      <p className="pvs-libelle" style={{ margin: 0 }}>État des lieux de sortie</p>
      {e !== null && <p className={`pva-edls${e.statut === 'refusee' ? ' pva-edls--refus' : ''}`} role="status" data-edls-mention>{mentionEdls(e)}</p>}
      {bilan !== null && <p className="gst-info" role="status" data-edls-bilan>{bilan}</p>}
      {mode === 'lecture' && (
        <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
          {e === null ? <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setBilan(null); setMode('planifier'); }} data-planifier-edls>Planifier l’état des lieux de sortie</button> : (
            <>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setBilan(null); setMode('deplacer'); }} data-deplacer-edls>Déplacer</button>
              {e.statut === 'refusee' && <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setBilan(null); setMode('reattribuer'); }} data-reattribuer-edls>Confier à quelqu’un d’autre</button>}
            </>
          )}
        </div>
      )}
      {(mode === 'planifier' || mode === 'deplacer') && (
        <FormulaireEdls l={l} e={mode === 'deplacer' ? e : null} onAnnuler={() => setMode('lecture')} onFait={fait} />
      )}
      {mode === 'reattribuer' && e !== null && <FormulaireReattribuer l={l} e={e} onAnnuler={() => setMode('lecture')} onFait={fait} />}
    </div>
  );
}

/** La phrase après un geste : la tâche, ses mails (canal du module de tâches) et l'agenda. */
function phraseGeste(debut: string, data: unknown): string {
  const r = (data ?? {}) as { mails?: { destinataire: string; etat: string }[]; agenda?: string };
  const mails = (r.mails ?? []).map((m) => `mail à ${m.destinataire} : ${m.etat === 'envoye' ? 'envoyé' : m.etat === 'factice' ? 'préparé (essai)' : m.etat === 'desactive' ? 'envoi désactivé' : m.etat === 'sans_droit' ? 'pas de droit d’envoi au nom de gestion@' : m.etat}`);
  return [debut, ...mails, r.agenda ?? ''].filter((x) => x.trim() !== '').join(' — ');
}

function ChoixPersonne({ valeur, onChange, exclure }: { valeur: number | null; onChange: (id: number | null) => void; exclure?: number | null }) {
  const lu = useLecture<Personne[]>('edlsConfiables=1');
  const personnes = useMemo(() => (lu.etat.etat === 'ok' && Array.isArray(lu.etat.data) ? lu.etat.data.filter((p) => p.id !== exclure) : []), [lu.etat, exclure]);
  // La première personne (soi-même en tête de liste) est proposée d'office.
  useEffect(() => { if (valeur === null && personnes.length > 0) onChange(personnes[0].id); }, [valeur, personnes, onChange]);
  return (
    <label className="pvs-champ">
      <span className="pvs-libelle">Confier à *</span>
      {lu.etat.etat !== 'ok' ? <EtatLecture etat={lu.etat} /> : personnes.length === 0
        ? <p className="loc-muet" data-aucune-personne>Personne n’a les tuiles Location et Gestion avec une adresse de notre Workspace.</p>
        : (
          <select value={valeur ?? ''} onChange={(ev) => onChange(ev.target.value === '' ? null : Number(ev.target.value))} data-confier-a>
            {personnes.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
          </select>
        )}
    </label>
  );
}

/** Planifier (ou déplacer) : date*, début*, fin* (proposée = début + 1 h, modifiable, après le début), « Confier à »*, commentaire. */
function FormulaireEdls({ l, e, onAnnuler, onFait }: {
  l: LignePreavisAccueil; e: EdlsAffiche | null; onAnnuler: () => void; onFait: (x: EdlsAffiche, phrase: string) => void;
}) {
  const debutInitial = e?.heure ?? '';
  const [jour, setJour] = useState(e?.jour ?? '');
  const [debut, setDebut] = useState(debutInitial);
  const [fin, setFin] = useState(e?.heure ? heureFinProposee(e.heure) : '');
  const [finTouchee, setFinTouchee] = useState(e !== null);
  const [confieA, setConfieA] = useState<number | null>(e?.confieAId ?? null);
  const [libelles, setLibelles] = useState<Record<number, string>>({});
  const [commentaire, setCommentaire] = useState('');
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Pour un déplacement, la fin d'origine (durée de la tâche) est reprise.
  useEffect(() => {
    if (e?.heure && e.dureeMinutes !== null) {
      const [h, m] = e.heure.split(':').map(Number);
      const t = Math.min(h * 60 + m + e.dureeMinutes, 23 * 60 + 59);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFin(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    }
  }, [e]);
  const lu = useLecture<Personne[]>('edlsConfiables=1');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (lu.etat.etat === 'ok' && Array.isArray(lu.etat.data)) setLibelles(Object.fromEntries(lu.etat.data.map((p) => [p.id, p.libelle]))); }, [lu.etat]);
  const verdict = verifierPlanification({ jour, debut, fin, confieA, commentaire }, [{ recuLe: l.recuLe, dateMax: l.dateMax }]);
  const valider = async (): Promise<void> => {
    if (!verdict.ok) { setRefus(verdict.motif); return; }
    setEnvoi(true); setRefus(null);
    const r = await envoyer(e === null
      ? { action: 'planifier-edls', occupationIds: l.occupationIds, jour, debut, fin, confieA, commentaire }
      : { action: 'deplacer-edls', occupationIds: l.occupationIds, jour, debut, fin, confieA });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    const data = (r.data ?? {}) as { statut?: EdlsAffiche['statut'] };
    onFait({
      edlsId: e?.edlsId ?? 0, tacheId: e?.tacheId ?? 0, jour: verdict.jour, heure: verdict.heure, dureeMinutes: verdict.dureeMinutes,
      confieA: (confieA !== null ? libelles[confieA] : null) ?? e?.confieA ?? '', confieAId: confieA,
      statut: data.statut ?? 'en_attente', reponduPar: null, motifRefus: null,
    }, phraseGeste(e === null ? 'État des lieux planifié' : 'Rendez-vous déplacé', r.data));
  };
  return (
    <div className="pvs-form pva-form-edls" data-formulaire-edls={e === null ? 'planifier' : 'deplacer'}>
      <div className="pva-grille-edls">
        <label className="pvs-champ"><span className="pvs-libelle">Date de l’EDLS *</span>
          <input type="date" value={jour} min={l.recuLe} max={ajouterMois(l.dateMax, EDL_MOIS_APRES_FIN)} onChange={(ev) => { setJour(ev.target.value); setRefus(null); }} data-edls-jour /></label>
        <label className="pvs-champ"><span className="pvs-libelle">Heure de début *</span>
          <input type="time" value={debut} onChange={(ev) => { setDebut(ev.target.value); if (!finTouchee) setFin(heureFinProposee(ev.target.value)); setRefus(null); }} data-edls-debut /></label>
        <label className="pvs-champ"><span className="pvs-libelle">Heure de fin *</span>
          <input type="time" value={fin} onChange={(ev) => { setFin(ev.target.value); setFinTouchee(true); setRefus(null); }} data-edls-fin /></label>
      </div>
      <ChoixPersonne valeur={confieA} onChange={setConfieA} />
      {e === null && (
        <label className="pvs-champ"><span className="pvs-libelle">Commentaire (facultatif)</span>
          <textarea value={commentaire} onChange={(ev) => setCommentaire(ev.target.value)} rows={2} placeholder="ex. clés chez le gardien" data-edls-commentaire /></label>
      )}
      {!verdict.ok && (jour !== '' || debut !== '') && <p className="cp-refus" role="status" data-edls-message>{verdict.motif}</p>}
      {refus !== null && <p className="cp-refus" role="alert" data-edls-refus>{refus}</p>}
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || !verdict.ok} onClick={() => { void valider(); }} data-valider-edls>
          {envoi ? 'Enregistrement…' : e === null ? 'Planifier' : 'Déplacer le rendez-vous'}</button>
      </div>
    </div>
  );
}

/** Après un refus : confier l'EDLS à quelqu'un d'autre (nouvelle demande, nouveau mail). */
function FormulaireReattribuer({ l, e, onAnnuler, onFait }: { l: LignePreavisAccueil; e: EdlsAffiche; onAnnuler: () => void; onFait: (x: EdlsAffiche, phrase: string) => void }) {
  const [confieA, setConfieA] = useState<number | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const lu = useLecture<Personne[]>('edlsConfiables=1');
  const libelle = (id: number | null): string => (lu.etat.etat === 'ok' && Array.isArray(lu.etat.data) ? lu.etat.data.find((p) => p.id === id)?.libelle ?? '' : '');
  const valider = async (): Promise<void> => {
    setEnvoi(true); setRefus(null);
    const r = await envoyer({ action: 'reattribuer-edls', occupationIds: l.occupationIds, confieA });
    setEnvoi(false);
    if (r.motif !== null) { setRefus(r.motif); return; }
    const data = (r.data ?? {}) as { statut?: EdlsAffiche['statut'] };
    onFait({ ...e, confieA: libelle(confieA), confieAId: confieA, statut: data.statut ?? 'en_attente', reponduPar: null, motifRefus: null },
      phraseGeste(`État des lieux confié à ${libelle(confieA)}`, r.data));
  };
  return (
    <div className="pvs-form" data-formulaire-reattribuer>
      <ChoixPersonne valeur={confieA} onChange={setConfieA} exclure={e.confieAId} />
      {refus !== null && <p className="cp-refus" role="alert">{refus}</p>}
      <div className="loc-boutons" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onAnnuler} disabled={envoi}>Annuler</button>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || confieA === null} onClick={() => { void valider(); }} data-valider-reattribution>
          {envoi ? 'Enregistrement…' : 'Confier'}</button>
      </div>
    </div>
  );
}

/** La confirmation réduite COMMUNE, sur le bail du préavis, avec ses locataires cochés (ceux du préavis). */
function SortieDuPreavis({ l, onAnnuler, onFait }: { l: LignePreavisAccueil; onAnnuler: () => void; onFait: (phrase: string, mail: string | null) => void }) {
  const lu = useLecture<BailLogement>(`bail=${l.occupationId}`);
  if (lu.etat.etat !== 'ok') return <EtatLecture etat={lu.etat} />;
  const bail = lu.etat.data;
  const choix = bail.locataires.filter((x) => l.occupationIds.includes(x.occupationId)).map((x) => x.occupationId);
  if (choix.length === 0) return <p className="loc-muet">Ces locataires ne sont plus en place : rechargez la page.</p>;
  return <ConfirmationSortie bail={bail} choix={choix} occupationId={choix[0]} onAnnuler={onAnnuler} onFait={onFait} />;
}

/**
 * Jetons du thème uniquement. 🔴 HAUTEUR CONSTANTE des lignes : deux lignes de texte (une chacune, tronquée proprement,
 * texte complet en infobulle et dans l'intitulé du bouton), une hauteur FIXE — au bureau comme au téléphone.
 */
export const CSS_PREAVIS_ACCUEIL = `
.pva{display:flex;flex-direction:column;gap:12px;min-width:0}
.pva-titre{margin:0;font-size:1.15rem;font-weight:800;display:flex;align-items:center;gap:8px}
.pva-tris{display:flex;flex-wrap:wrap;gap:10px 18px}
.pva-tri{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.pva-tri-libelle{font-size:.85rem;font-weight:700;color:var(--color-svv-muted)}
.pva-segment{min-height:44px;padding:8px 12px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.9rem;cursor:pointer}
/* Arno (19/10/2026) — le tri ACTIF en ROUGE (le rouge des gros boutons actifs, texte blanc) ; les autres restent blancs. */
.pva-segment[aria-pressed="true"]{background:var(--color-svv-red);color:var(--color-svv-surface);border-color:var(--color-svv-red);font-weight:700}
.pva-liste{list-style:none;margin:0;padding:0;border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface)}
.pva-item + .pva-item{border-top:1px solid var(--color-svv-line)}
.pva-ligne{box-sizing:border-box;height:4.75rem;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:8px 12px}
.pva-textes{display:flex;flex-direction:column;gap:2px;min-width:0}
.pva-noms,.pva-detail{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.pva-noms{font-weight:800;color:var(--color-svv-ink)}
.pva-detail{font-size:.88rem;color:var(--color-svv-muted)}
.pva-ouvrir{min-height:44px}
.pva-depliee{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;padding:4px 12px 14px}
.pva-bloc{display:flex;flex-direction:column;gap:8px;min-width:0}
.pva-logement{grid-column:1 / -1}
.pva-dates-preavis{margin:0;font-weight:600;color:var(--color-svv-ink)}
.pva-edls{margin:0;padding:8px 10px;border-radius:10px;background:var(--color-svv-blue-soft);color:var(--color-svv-blue);font-weight:700;overflow-wrap:anywhere}
.pva-edls--refus{background:var(--color-svv-urgence-orange);color:var(--color-svv-surface)}
.pva-grille-edls{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px}
.pva-form-edls input,.pva-form-edls select,.pva-form-edls textarea,[data-formulaire-reattribuer] select{min-height:44px;box-sizing:border-box;width:100%;max-width:100%}
.pva-liens{grid-column:1 / -1;margin:0;display:flex;flex-wrap:wrap;gap:6px 18px}
.pva-liens a{display:inline-flex;align-items:center;min-height:44px;color:var(--color-svv-ink);font-weight:600;text-decoration:underline}
.sor-gestion-seule-texte{margin:0;padding:10px 12px;border-radius:10px;background:var(--color-svv-field);color:var(--color-svv-ink)}
@media (max-width:760px){
  .pva-ligne{height:6.25rem;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto}
  .pva-textes{grid-column:1 / -1}
  .pva-ligne .pvs-mention{justify-self:start}
  .pva-depliee{grid-template-columns:1fr}
}
`;
