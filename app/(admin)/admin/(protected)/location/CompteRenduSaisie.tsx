'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as KeyboardEventReact, type PointerEvent as PointerEventReact } from 'react';
import { envoyer, useLecture } from './commun';
import { useContextePreavis } from './preavisSynchro';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';
import { aUnEmail } from '../../../../lib/location/emailLocataireRequis';
import { prenomNom } from '../../../../lib/location/mailsPreavisSortie';
import { Icone } from './IconesCompteRendu';
import { lignePhoto } from '../../../../lib/location/photosCompteRendu';
import { dureeFr, etatVocalLocataires, insererDictee, insererTranscription, MENTION_TRANSCRIT, PRISE_MIN_MS, VOCAL_DUREE_MAX_S } from '../../../../lib/location/vocauxCompteRendu';
import { appliquerTirets, insererEntree, themeBascule } from '../../../../lib/location/texteCompteRendu';
import { appliquerThemeSur, persisterTheme, racineTheme, snapshotTheme, snapshotThemeServeur, souscrireTheme } from '../themeDom';

/**
 * ══ 🔴🔴 LE FORMULAIRE « COMPTE RENDU PRÉ-VISITE » SUR MOBILE (Arno, 15/11/2026) ═══════════════════════════════════════════════════════════
 * TROIS BLOCS distincts, dans cet ordre : TEXTE (saisie libre, « Maintenir pour dicter », « Clavier »), PHOTOS (légende toujours modifiable,
 * suppression confirmée, Carrousel / Liste mémorisé sur l'appareil), DICTAPHONE (fichiers vocaux INTERNES : prises maintenues, plusieurs
 * prises par fichier, plusieurs fichiers, réécoute enchaînée, renommage, suppression confirmée, « Transcrire dans le texte » à la demande).
 * L'APPUI LONG : événements « pointer », pas de menu contextuel, pas de sélection, pas de zoom ; le doigt qui sort du bouton = arrêt normal ;
 * un appui de moins d'une demi-seconde est ignoré ; la première autorisation du micro est dite clairement. Les modules lourds (conversion des
 * photos, enregistreur) se chargent AU TOUCHER.
 */
const modulePhoto = () => import('../../../../lib/location/photoEcran');
const nouvelleCle = (): string => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const moduleVocal = () => import('../../../../lib/location/enregistreurVocal');

/* ══ L'ENREGISTREMENT MAINTENU (dictée et dictaphone) ═══════════════════════════════════════════════════════════════════════════════════ */

export type EtatMaintien = 'repos' | 'demarrage' | 'enregistre';
export const MESSAGE_APPUI_BREF = 'Appui trop bref : maintenez le bouton appuyé pendant que vous parlez.';
export const MESSAGE_MICRO_PRET = 'Micro autorisé : maintenez de nouveau le bouton appuyé pendant que vous parlez.';

/** Enregistre TANT QUE le bouton est maintenu ; au relâchement, rend la prise (≥ 0,5 s) à `onPrise`. Ne lève jamais. */
export function useEnregistrementMaintenu(onPrise: (blob: Blob, type: string, dureeMs: number) => void): {
  etat: EtatMaintien; dureeMs: number; message: string | null; appuyer: () => void; relacher: () => void; effacerMessage: () => void } {
  const [etat, setEtat] = useState<EtatMaintien>('repos');
  const [dureeMs, setDureeMs] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const voulu = useRef(false);
  const rec = useRef<{ r: MediaRecorder; flux: MediaStream; morceaux: Blob[]; debut: number; type: string } | null>(null);
  const priseRef = useRef(onPrise);
  useEffect(() => { priseRef.current = onPrise; }, [onPrise]);
  const relacher = useCallback((): void => {
    voulu.current = false;
    const x = rec.current;
    if (x && x.r.state !== 'inactive') { try { x.r.stop(); } catch { /* déjà arrêté */ } }
  }, []);
  const appuyer = useCallback((): void => {
    if (rec.current !== null || voulu.current) return;
    voulu.current = true; setMessage(null); setEtat('demarrage');
    void (async () => {
      let o: Awaited<ReturnType<Awaited<ReturnType<typeof moduleVocal>>['ouvrirEnregistreur']>>;
      try { o = await (await moduleVocal()).ouvrirEnregistreur(); } catch { o = { ok: false, motif: 'L’enregistrement n’a pas pu démarrer sur cet appareil.' }; }
      if (!o.ok) { voulu.current = false; setEtat('repos'); setMessage(o.motif); return; }
      // relâché pendant la demande d'autorisation du micro (première fois) : on ne garde rien, on dit de recommencer
      if (!voulu.current) { o.flux.getTracks().forEach((t) => t.stop()); setEtat('repos'); setMessage(MESSAGE_MICRO_PRET); return; }
      const x = { r: o.r, flux: o.flux, morceaux: [] as Blob[], debut: Date.now(), type: o.type };
      o.r.ondataavailable = (e) => { if (e.data && e.data.size > 0) x.morceaux.push(e.data); };
      o.r.onstop = () => {
        x.flux.getTracks().forEach((t) => t.stop());
        const ms = Date.now() - x.debut;
        rec.current = null; setEtat('repos'); setDureeMs(0);
        if (ms < PRISE_MIN_MS) { setMessage(MESSAGE_APPUI_BREF); return; }
        const blob = new Blob(x.morceaux, { type: x.type });
        if (blob.size > 0) priseRef.current(blob, x.type, ms);
      };
      rec.current = x;
      try { o.r.start(250); } catch { rec.current = null; x.flux.getTracks().forEach((t) => t.stop()); setEtat('repos'); setMessage('L’enregistrement n’a pas pu démarrer sur cet appareil.'); return; }
      setEtat('enregistre'); setDureeMs(0);
    })();
  }, []);
  useEffect(() => {
    if (etat !== 'enregistre') return;
    const t = setInterval(() => {
      const x = rec.current; if (x === null) return;
      const ms = Date.now() - x.debut; setDureeMs(ms);
      if (ms >= VOCAL_DUREE_MAX_S * 1000) relacher();
    }, 200);
    return () => clearInterval(t);
  }, [etat, relacher]);
  useEffect(() => () => { voulu.current = false; const x = rec.current; if (x) { try { x.r.stop(); } catch { /* rien */ } x.flux.getTracks().forEach((t) => t.stop()); } }, []);
  return { etat, dureeMs, message, appuyer, relacher, effacerMessage: () => setMessage(null) };
}

/** Le gros bouton « maintenir » : pointer events, aucun menu, aucune sélection, aucun zoom ; sortir du bouton = relâcher. */
export function BoutonMaintenir({ etat, dureeMs, repos, actif, rond = false, onAppui, onRelache, className, attributs }: {
  etat: EtatMaintien; dureeMs: number; repos: React.ReactNode; actif: React.ReactNode;
  /** le bouton rond du dictaphone : l'icône seule (la durée est affichée SOUS le bouton) */
  rond?: boolean; onAppui: () => void; onRelache: () => void; className: string; attributs: Record<string, string> }) {
  const bas = (e: PointerEventReact<HTMLButtonElement>): void => {
    e.preventDefault();
    // le toucher capture le doigt d'office : on le libère pour que « sortir du bouton » arrête l'enregistrement
    try { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* rien */ }
    onAppui();
  };
  const clavier = (e: KeyboardEventReact<HTMLButtonElement>, haut: boolean): void => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (haut) onRelache(); else if (!e.repeat) onAppui();
  };
  // 🔴 Arno (15/11/2026) — UN SEUL code visuel d'enregistrement (dictée et dictaphone) : ROUGE dès que le doigt est posé (y compris pendant
  // l'ouverture du micro), pulsation ; retour à l'état normal au relâchement.
  const enCours = etat !== 'repos';
  return (
    <button type="button" className={`${className}${enCours ? ' pvv-maintien--actif' : ''}`} aria-pressed={enCours} data-enregistrement={enCours ? 'oui' : 'non'}
      onPointerDown={bas} onPointerUp={onRelache} onPointerCancel={onRelache} onPointerLeave={() => { if (enCours) onRelache(); }}
      onContextMenu={(e) => e.preventDefault()} onKeyDown={(e) => clavier(e, false)} onKeyUp={(e) => clavier(e, true)} {...attributs}>
      {rond ? (enCours ? actif : repos)
        : etat === 'enregistre' ? <><span className="pvv-point" aria-hidden="true" />{actif} <span className="pvv-chrono" role="timer" data-maintien-duree>{dureeFr(dureeMs / 1000)}</span></>
          : etat === 'demarrage' ? <><span className="pvv-point" aria-hidden="true" />Micro…</> : repos}
      {rond && etat === 'enregistre' && <span className="pvv-lu" data-maintien-duree>{dureeFr(dureeMs / 1000)}</span>}
    </button>
  );
}

/** La dictée maintenue, transcrite par Mistral (RIEN n'est gardé : ni fichier, ni pièce) : le texte, ou la raison de l'échec. Ne lève jamais. */
export async function transcrireDictee(blob: Blob, type: string, occupationIds: readonly number[]): Promise<{ texte: string } | { motif: string }> {
  let donnees: string;
  try { donnees = await (await modulePhoto()).enBase64(blob); } catch { return { motif: 'La dictée n’a pas pu être préparée sur cet appareil.' }; }
  const r = await envoyer({ action: 'dicter-compte-rendu', occupationIds: [...occupationIds], donnees, typeMime: type }, { propre: true });
  const d = r.data as { ok?: boolean; texte?: string; motif?: string } | undefined;
  if (r.motif !== null || d?.ok !== true || typeof d.texte !== 'string') return { motif: d?.motif ?? r.motif ?? 'La transcription a échoué : rien n’a été ajouté, réessayez.' };
  return { texte: d.texte };
}

/**
 * 🔴 Arno (15/11/2026) — UNE CONFIRMATION, la même partout sur la page (photo, fichier vocal, prise, personne ajoutée) : la question sur une
 * ligne, puis les deux boutons côte à côte sur UNE même ligne, même taille — « Garder » (contour) à gauche, l'action (rouge) à droite.
 */
export function Confirmation({ question, action, onConfirmer, onGarder, attributs, attributsOui, attributsNon }: {
  question: string; action: string; onConfirmer: () => void; onGarder: () => void;
  attributs: Record<string, string>; attributsOui: Record<string, string>; attributsNon: Record<string, string> }) {
  return (
    <div className="pvv-confirmer" role="alertdialog" aria-label={question} {...attributs}>
      <p className="pvv-confirmer-question">{question}</p>
      <div className="pvv-confirmer-boutons">
        <button type="button" className="pvv-choix" onClick={onGarder} {...attributsNon}>Garder</button>
        <button type="button" className="pvv-choix pvv-choix--danger" onClick={onConfirmer} {...attributsOui}>{action}</button>
      </div>
    </div>
  );
}

/**
 * 🔴 Arno (15/11/2026) — LE CHAMP DE LÉGENDE d'une photo : le liseré d'un champ de saisie de l'application (visible au repos, accentué au
 * focus), et à l'extrême droite DANS le champ un petit bouton micro rond « Maintenir pour dicter la légende » : la mécanique de « Maintenir
 * pour dicter » (appui maintenu, rouge et pulsation, transcription au relâchement, insertion au curseur de CETTE légende, sans ouvrir le
 * clavier, appui de moins de 0,5 s ignoré). Le texte ne passe jamais sous le bouton (marge droite du champ).
 */
export function ChampLegende({ rang, valeur, invalide, occupationIds, onChange, onOccupe }: {
  rang: number; valeur: string; invalide: boolean; occupationIds: readonly number[];
  onChange: (f: (legende: string) => string) => void; onOccupe: (occupe: boolean) => void }) {
  const curseur = useRef<number | null>(null);
  const [transcription, setTranscription] = useState(false);
  const [motif, setMotif] = useState<string | null>(null);
  const noter = (e: { currentTarget: HTMLInputElement }): void => { curseur.current = e.currentTarget.selectionStart; };
  const dictee = useEnregistrementMaintenu((blob, type) => {
    setTranscription(true); setMotif(null);
    void (async () => {
      const r = await transcrireDictee(blob, type, occupationIds);
      setTranscription(false);
      if ('motif' in r) { setMotif(r.motif); return; }
      onChange((l) => { const x = insererDictee(l, curseur.current, r.texte); const t = x.texte.slice(0, LEGENDE_MAX); curseur.current = Math.min(x.curseur, t.length); return t; });
    })();
  });
  const occupe = dictee.etat !== 'repos' || transcription;
  // le parent passe une fonction neuve à chaque rendu : on la lit par une référence (sinon l'effet se relancerait sans fin)
  const occuperRef = useRef(onOccupe);
  useEffect(() => { occuperRef.current = onOccupe; }, [onOccupe]);
  useEffect(() => { occuperRef.current(occupe); }, [occupe]);
  useEffect(() => () => occuperRef.current(false), []);
  return (
    <div className="pvv-legende-bloc">
      <label className="pvs-champ pvv-legende"><span className="pvs-libelle">{`Légende de la photo ${rang} *`}</span>
        <span className="pvv-legende-cadre">
          <input type="text" className="pvv-legende-champ" value={valeur} maxLength={LEGENDE_MAX} placeholder="ex. Rayure parquet chambre" aria-invalid={invalide} autoComplete="off" autoCapitalize="sentences" enterKeyHint="done"
            onChange={(e) => { const v = e.target.value; curseur.current = e.target.selectionStart; onChange(() => v); }} onSelect={noter} onKeyUp={noter} onClick={noter} onBlur={noter} data-photo-legende />
          <BoutonMaintenir etat={dictee.etat} dureeMs={dictee.dureeMs} rond repos={<Icone nom="micro" taille={20} />} actif={<Icone nom="micro" taille={20} />}
            onAppui={dictee.appuyer} onRelache={dictee.relacher} className="pvv-maintien pvv-micro-legende"
            attributs={{ 'aria-label': `Maintenir pour dicter la légende de la photo ${rang}`, title: 'Maintenir pour dicter la légende', 'data-dicter-legende': String(rang) }} />
        </span>
      </label>
      {transcription && <span className="loc-muet pvv-statut" role="status" data-legende-transcription>transcription…</span>}
      {dictee.message !== null && <span className="pvv-photo-motif" role="alert" data-legende-message>{dictee.message}</span>}
      {motif !== null && <span className="pvv-photo-motif" role="alert" data-legende-motif>{motif}</span>}
    </div>
  );
}
const LEGENDE_MAX = 200;

/* ══ BLOC PRÉSENCE (Arno, 15/11/2026) ════════════════════════════════════════════════════════════════════════════════════════════════════
 * Un locataire par ligne, « présent » à cocher (non coché par défaut), avec sa date d'entrée ; « + Ajouter une personne » (civilité, nom,
 * prénom) : elle n'existe que pour CE compte rendu (rien n'est créé dans les fiches), cochée par défaut, supprimable. Au moins une personne
 * cochée pour voir le récapitulatif. Le serveur écrit « En présence de … » en tête du compte rendu. */
export interface PersonneAjouteeSaisie { cle: string; civilite: 'Madame' | 'Monsieur'; nom: string; prenom: string; present: boolean;
  /** 🔴 Arno (15/11/2026) — note INTERNE (« mère du locataire »…) : jamais dans la phrase de présence ni dans un mail aux locataires */
  note: string }
export const libellePersonne = (p: { civilite: 'Madame' | 'Monsieur'; nom: string; prenom: string }): string =>
  [p.civilite === 'Madame' ? 'Mme' : 'M.', p.prenom.trim(), p.nom.trim()].filter(Boolean).join(' ');

export function BlocPresence({ locataires, presents, setPresents, ajoutees, setAjoutees, erreur, dateFr }: {
  locataires: readonly { occupationId: number; nom: string; entree?: string | null }[];
  presents: readonly number[]; setPresents: (f: (x: number[]) => number[]) => void;
  ajoutees: readonly PersonneAjouteeSaisie[]; setAjoutees: (f: (x: PersonneAjouteeSaisie[]) => PersonneAjouteeSaisie[]) => void;
  erreur: string | null; dateFr: (iso: string) => string }) {
  const titreId = useId();
  const [ajout, setAjout] = useState(false);
  /** 🔴 Arno (15/11/2026) — retirer une personne ajoutée se confirme, comme toute suppression de la page */
  const [aRetirer, setARetirer] = useState<string | null>(null);
  const [civilite, setCivilite] = useState<'Madame' | 'Monsieur' | null>(null);
  const [nom, setNom] = useState(''); const [prenom, setPrenom] = useState(''); const [note, setNote] = useState('');
  const fermer = (): void => { setAjout(false); setCivilite(null); setNom(''); setPrenom(''); setNote(''); };
  const ajouter = (): void => {
    if (civilite === null || nom.trim() === '') return;
    setAjoutees((xs) => [...xs, { cle: nouvelleCle(), civilite, nom: nom.trim().slice(0, 80), prenom: prenom.trim().slice(0, 80), present: true, note: note.trim().slice(0, 120) }]);
    fermer();
  };
  return (
    <section className={`pvv-bloc pvv-bloc--presence${erreur !== null ? ' pvv-bloc--erreur' : ''}`} aria-labelledby={titreId} data-bloc-presence data-presence-erreur={erreur !== null ? 'oui' : undefined}>
      <h3 id={titreId} className="pvv-bloc-titre">Présence <span className="pvv-requis">*</span></h3>
      <ul className="pvv-presences" data-cr-locataires>
        {locataires.map((x) => (
          <li key={x.occupationId}>
            <label className="pvv-case pvv-presence">
              <input type="checkbox" checked={presents.includes(x.occupationId)} aria-invalid={erreur !== null}
                onChange={(e) => { const v = e.target.checked; setPresents((xs) => (v ? [...xs.filter((y) => y !== x.occupationId), x.occupationId] : xs.filter((y) => y !== x.occupationId))); }}
                data-presence-locataire={x.occupationId} />
              <span data-cr-locataire={x.occupationId}><strong>{x.nom}</strong>{x.entree ? ` — Entré(e) dans les lieux le ${dateFr(x.entree)}` : ''}</span>
            </label>
          </li>))}
        {ajoutees.map((p) => (
          <li key={p.cle} className="pvv-presence-ajoutee" data-personne-ajoutee={p.cle}>
            <label className="pvv-case pvv-presence">
              <input type="checkbox" checked={p.present} aria-invalid={erreur !== null}
                onChange={(e) => { const v = e.target.checked; setAjoutees((xs) => xs.map((y) => (y.cle === p.cle ? { ...y, present: v } : y))); }} data-presence-personne />
              <span><strong>{libellePersonne(p)}</strong> <span className="pvv-etiquette">personne présente</span></span>
            </label>
            {/* la note INTERNE, modifiable jusqu'à l'envoi */}
            <label className="pvv-note-presence"><span className="pvv-lu">Note interne sur {libellePersonne(p)}</span>
              <input type="text" value={p.note} maxLength={120} placeholder="ex. mère du locataire (note interne)" autoComplete="off" autoCapitalize="sentences" enterKeyHint="done"
                onChange={(e) => { const v = e.target.value; setAjoutees((xs) => xs.map((y) => (y.cle === p.cle ? { ...y, note: v } : y))); }} data-personne-note /></label>
            <button type="button" className="pvv-mini" onClick={() => setARetirer(p.cle)} aria-label={`Retirer ${libellePersonne(p)}`} data-personne-retirer><Icone nom="corbeille" /></button>
            {aRetirer === p.cle && (
              <Confirmation question={`Retirer ${libellePersonne(p)} ?`} action="Retirer" onGarder={() => setARetirer(null)}
                onConfirmer={() => { setAjoutees((xs) => xs.filter((y) => y.cle !== p.cle)); setARetirer(null); }}
                attributs={{ 'data-personne-confirmer': '' }} attributsOui={{ 'data-personne-retirer-oui': '' }} attributsNon={{ 'data-personne-retirer-non': '' }} />)}
          </li>))}
      </ul>
      <button type="button" className="pvv-lien" onClick={() => setAjout(true)} data-ajouter-personne><Icone nom="plus" taille={16} /> Ajouter une personne</button>
      {erreur !== null && <p className="pvv-photo-motif" role="alert" data-presence-motif>{erreur}</p>}
      {ajout && (
        <div className="pvv-mini-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
          <div className="pvv-mini-modale" role="dialog" aria-modal="true" aria-label="Ajouter une personne présente" data-modale-personne>
            <h4 className="pvv-bloc-titre">Ajouter une personne</h4>
            <fieldset className="pvv-civilite"><legend className="pvs-libelle">Civilité *</legend>
              {(['Madame', 'Monsieur'] as const).map((c) => (
                <label key={c} className="pvv-case"><input type="radio" name="civilite-personne" checked={civilite === c} onChange={() => setCivilite(c)} data-personne-civilite={c} />{c}</label>))}
            </fieldset>
            <label className="pvs-champ"><span className="pvs-libelle">Nom *</span><input type="text" value={nom} maxLength={80} placeholder="ex. Martin" autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} enterKeyHint="next" onChange={(e) => setNom(e.target.value)} data-personne-nom /></label>
            <label className="pvs-champ"><span className="pvs-libelle">Prénom</span><input type="text" value={prenom} maxLength={80} placeholder="ex. Léa" autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} enterKeyHint="next" onChange={(e) => setPrenom(e.target.value)} data-personne-prenom /></label>
            <label className="pvs-champ"><span className="pvs-libelle">Note <span className="loc-muet">(interne, facultative)</span></span><input type="text" value={note} maxLength={120} placeholder="ex. mère du locataire" autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" onChange={(e) => setNote(e.target.value)} data-personne-note-modale /></label>
            <div className="pvv-boutons-2">
              <button type="button" className="svv-btn svv-btn-outline pvv-gros" onClick={fermer} data-personne-annuler>Annuler</button>
              <button type="button" className="svv-btn svv-btn-primary pvv-gros" onClick={ajouter} disabled={civilite === null || nom.trim() === ''} data-personne-ajouter>Ajouter</button>
            </div>
          </div>
        </div>)}
    </section>
  );
}

/* ══ BLOC TEXTE ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export function BlocTexte({ corps, setCorps, lireCurseur, noterCurseur, occupationIds, onOccupe }: {
  corps: string; setCorps: (f: (c: string) => string) => void;
  /** le curseur du texte (là où s'insèrent la dictée et la transcription d'un fichier vocal) */
  lireCurseur: () => number | null; noterCurseur: (n: number | null) => void;
  occupationIds: readonly number[]; onOccupe: (occupe: boolean) => void }) {
  const [transcription, setTranscription] = useState(false);
  const zone = useRef<HTMLTextAreaElement | null>(null);
  /** le clavier est-il ouvert (le champ a le focus) : « Clavier » bascule */
  const [clavier, setClavier] = useState(false);
  /** 🔴 Arno (15/11/2026) — après un changement fait PAR le formulaire (tiret, dictée, Entrée), le curseur est remis à sa place si le champ a le focus */
  const replacer = useRef(false);
  const [motif, setMotif] = useState<string | null>(null);
  const noter = (e: { currentTarget: HTMLTextAreaElement }): void => { noterCurseur(e.currentTarget.selectionStart); };
  const dictee = useEnregistrementMaintenu((blob, type) => {
    setTranscription(true); setMotif(null);
    void (async () => {
      const r = await transcrireDictee(blob, type, occupationIds);
      setTranscription(false);
      if ('motif' in r) { setMotif(r.motif); return; }
      const t = r.texte;
      setCorps((c) => { const x = insererDictee(c, lireCurseur(), t); const y = appliquerTirets(x.texte, x.curseur); noterCurseur(y.curseur); replacer.current = true; return y.texte; });
    })();
  });
  const occupe = dictee.etat !== 'repos' || transcription;
  useEffect(() => { onOccupe(occupe); }, [occupe, onOccupe]);
  // la zone grandit avec le texte (≈ 6 lignes au départ) ; clavier ouvert : la zone et la dernière ligne restent visibles
  useEffect(() => {
    const t = zone.current; if (!t) return;
    t.style.height = 'auto'; t.style.height = `${Math.max(t.scrollHeight, 0)}px`;
  }, [corps]);
  useLayoutEffect(() => {
    const t = zone.current;
    if (!replacer.current || !t) return;
    replacer.current = false;
    const p = lireCurseur();
    if (p !== null && document.activeElement === t) { try { t.setSelectionRange(p, p); } catch { /* rien */ } }
  }, [corps, lireCurseur]);
  /** « Clavier » : ouvre (curseur dans la zone) — ou, s'il est ouvert, REFERME (le champ perd le focus). */
  const basculerClavier = (): void => {
    const t = zone.current; if (!t) return;
    if (document.activeElement === t) { noterCurseur(t.selectionStart); t.blur(); return; }
    const p = lireCurseur() ?? t.value.length;
    t.focus();
    try { t.setSelectionRange(p, p); } catch { /* rien */ }
    setTimeout(() => { try { t.scrollIntoView({ block: 'center' }); } catch { /* rien */ } }, 300);
  };
  /** « Entrée » : un retour à la ligne au curseur, SANS ouvrir le clavier (le focus ne bouge pas : ouvert, il le reste ; fermé, il le reste). */
  const entree = (): void => {
    setCorps((c) => { const x = insererEntree(c, lireCurseur()); noterCurseur(x.curseur); replacer.current = true; return x.texte; });
  };
  /** un bouton qui ne doit PAS faire perdre (ni prendre) le focus du champ */
  const sansFocus = { onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(), onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() };
  const titreId = useId();
  return (
    <section className="pvv-bloc pvv-bloc--texte" aria-labelledby={titreId} data-bloc-texte>
      <div className="pvv-bloc-tete">
        <h3 id={titreId} className="pvv-bloc-titre">Texte <span className="pvv-requis">*</span></h3>
        <button type="button" className="pvv-mini pvv-entree" {...sansFocus} onClick={entree} aria-label="Aller à la ligne" title="Aller à la ligne" data-entree><Icone nom="entree" taille={22} /></button>
      </div>
      <textarea ref={zone} className="pvv-texte" value={corps} rows={6} aria-labelledby={titreId} autoComplete="off" autoCapitalize="sentences" autoCorrect="on" spellCheck enterKeyHint="enter" placeholder="ex. Logement propre, rayure du parquet de la chambre… (dictez ou tapez)"
        onChange={(e) => {
          // 🔴 la règle des tirets s'applique à la frappe (retour à la ligne du clavier compris) ; le curseur suit
          const x = appliquerTirets(e.target.value, e.target.selectionStart);
          if (x.texte !== e.target.value) replacer.current = true;
          setCorps(() => x.texte); noterCurseur(x.curseur);
        }}
        onSelect={noter} onKeyUp={noter} onClick={noter}
        onBlur={(e) => { noter(e); setClavier(false); }}
        onFocus={(e) => { setClavier(true); const t = e.currentTarget; setTimeout(() => { try { t.scrollIntoView({ block: 'nearest' }); } catch { /* rien */ } }, 350); }}
        data-corps-compte-rendu />
      {/* 🔴 Arno (15/11/2026) — « Clavier » à GAUCHE (bascule ouvrir / fermer), « Maintenir pour dicter » à DROITE */}
      <div className="pvv-texte-boutons">
        <button type="button" className={`svv-btn pvv-gros${clavier ? ' svv-btn-primary pvv-clavier--ouvert' : ' svv-btn-outline'}`} {...sansFocus} onClick={basculerClavier}
          aria-pressed={clavier} data-clavier data-clavier-ouvert={clavier ? 'oui' : 'non'}><Icone nom="clavier" /> {clavier ? 'Fermer le clavier' : 'Clavier'}</button>
        <BoutonMaintenir etat={dictee.etat} dureeMs={dictee.dureeMs} repos={<><Icone nom="micro" /> Maintenir pour dicter</>} actif="Dictée…"
          onAppui={dictee.appuyer} onRelache={dictee.relacher} className="svv-btn pvv-gros pvv-maintien" attributs={{ 'data-dicter': '' }} />
      </div>
      {transcription && <p className="loc-muet pvv-statut" role="status" data-dictee-transcription>transcription…</p>}
      {dictee.message !== null && <p className="pvv-photo-motif" role="alert" data-dictee-message>{dictee.message}</p>}
      {motif !== null && <p className="pvv-photo-motif" role="alert" data-dictee-motif>{motif}</p>}
    </section>
  );
}

/* ══ BLOC PHOTOS ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une photo du formulaire : son aperçu (sur l'appareil), sa pièce déposée (`id`), sa légende. */
export interface PhotoSaisie { cle: string; id: number | null; apercu: string; legende: string; etat: 'envoi' | 'ok' | 'erreur'; motif: string | null }
export type VuePhotos = 'carrousel' | 'liste';
export const CLE_VUE_PHOTOS = 'svav.compteRendu.photos.vue';
/** 🔴 Arno (15/11/2026) — « Carrousel » par défaut ; le choix de l'utilisateur, mémorisé sur l'appareil, l'emporte ensuite. */
export const lireVuePhotos = (): VuePhotos => { try { return window.localStorage.getItem(CLE_VUE_PHOTOS) === 'liste' ? 'liste' : 'carrousel'; } catch { return 'carrousel'; } };

export function BlocPhotos({ photos, onChange, occupationIds, rangSansLegende, onOccupe }: { photos: PhotoSaisie[];
  onChange: (f: (x: PhotoSaisie[]) => PhotoSaisie[]) => void; occupationIds: readonly number[]; rangSansLegende: number | null;
  /** 🔴 Arno (15/11/2026) — une légende en cours de dictée ou de transcription : le récapitulatif attend */
  onOccupe?: (occupe: boolean) => void }) {
  const [legendesOccupees, setLegendesOccupees] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { onOccupe?.(legendesOccupees.size > 0); }, [legendesOccupees, onOccupe]);
  const occuper = useCallback((cle: string, o: boolean) => setLegendesOccupees((s) => {
    if (o === s.has(cle)) return s;
    const n = new Set(s); if (o) n.add(cle); else n.delete(cle); return n;
  }), []);
  const camera = useId(); const galerie = useId(); const titreId = useId();
  const [vue, setVue] = useState<VuePhotos>('carrousel');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setVue(lireVuePhotos()); }, []);
  const choisirVue = (v: VuePhotos): void => { setVue(v); try { window.localStorage.setItem(CLE_VUE_PHOTOS, v); } catch { /* sans stockage */ } };
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [rang, setRang] = useState(0);
  const piste = useRef<HTMLOListElement | null>(null);
  const reglage = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** la photo vers laquelle le carrousel défile (‹ ›, légende touchée) : pas de recalage avant d'y être (1 s au plus) */
  const cible = useRef<{ rang: number; jusqua: number } | null>(null);
  useEffect(() => () => { if (reglage.current) clearTimeout(reglage.current); }, []);
  const maj = (cle: string, f: (x: PhotoSaisie) => PhotoSaisie) => onChange((xs) => xs.map((x) => (x.cle === cle ? f(x) : x)));
  const dejaDeposees = (): Promise<number[]> => new Promise((ok) => onChange((xs) => { ok(xs.filter((x) => x.id !== null).map((x) => x.id as number)); return xs; }));
  const ajouter = async (liste: FileList | null): Promise<void> => {
    for (const f of [...(liste ?? [])]) {
      const cle = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      onChange((xs) => [...xs, { cle, id: null, apercu: '', legende: '', etat: 'envoi', motif: null }]);
      let c: Awaited<ReturnType<Awaited<ReturnType<typeof modulePhoto>>['convertirPhoto']>>; let donnees = '';
      try {
        const m = await modulePhoto();
        c = await m.convertirPhoto(f);
        if (c.ok) donnees = await m.enBase64(c.blob);
      } catch { c = { ok: false, motif: `« ${f.name} » : la photo n’a pas pu être préparée sur cet appareil.` }; }
      if (!c.ok) { const motif = c.motif; maj(cle, (x) => ({ ...x, etat: 'erreur', motif })); continue; }
      const apercu = URL.createObjectURL(c.blob);
      maj(cle, (x) => ({ ...x, apercu }));
      const deja = await dejaDeposees();
      const r = await envoyer({ action: 'photo-compte-rendu', occupationIds: [...occupationIds], donnees, dejaIds: deja }, { propre: true });
      const id = (r.data as { id?: number } | undefined)?.id;
      maj(cle, (x) => (r.motif === null && typeof id === 'number' ? { ...x, id, etat: 'ok' } : { ...x, etat: 'erreur', motif: r.motif ?? 'La photo n’a pas pu être déposée.' }));
    }
  };
  const deplacer = (i: number, d: -1 | 1) => onChange((xs) => { const x = [...xs]; const j = i + d; if (j < 0 || j >= x.length) return xs; [x[i], x[j]] = [x[j], x[i]]; return x; });
  const retirer = (cle: string) => {
    const p = photos.find((x) => x.cle === cle); if (p?.apercu) URL.revokeObjectURL(p.apercu);
    onChange((xs) => xs.filter((x) => x.cle !== cle)); setAConfirmer(null);
  };
  const aller = (i: number): void => {
    const p = piste.current; if (!p) return;
    const j = Math.max(0, Math.min(photos.length - 1, i));
    cible.current = { rang: j, jusqua: Date.now() + 1000 };
    if (reglage.current) { clearTimeout(reglage.current); reglage.current = null; } // un recalage d'avant ne doit pas ramener en arrière
    try { p.scrollTo({ left: j * p.clientWidth, behavior: 'smooth' }); } catch { p.scrollLeft = j * p.clientWidth; }
    setRang(j);
  };
  // une photo de moins : l'indicateur reste dans les bornes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (rang > Math.max(0, photos.length - 1)) setRang(Math.max(0, photos.length - 1)); }, [photos.length, rang]);
  // la photo sans légende signalée est montrée (carrousel : on y va)
  useEffect(() => { if (vue === 'carrousel' && rangSansLegende !== null) aller(rangSansLegende); }, [rangSansLegende]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="pvv-bloc pvv-bloc--photos pvv-photos" aria-labelledby={titreId} data-photos-compte-rendu data-vue-photos={vue}>
      <div className="pvv-bloc-tete">
        <h3 id={titreId} className="pvv-bloc-titre">Photos {photos.length > 0 && <span className="loc-muet">({photos.length})</span>}</h3>
        {photos.length > 0 && (
          // 🔴 Arno (15/11/2026) — deux VRAIS petits boutons, bien séparés, liseré gris ; l'actif en plein rouge (accent de l'application)
          <div className="pvv-segments" role="group" aria-label="Affichage des photos">
            <button type="button" className="pvv-choix pvv-vue" aria-pressed={vue === 'carrousel'} onClick={() => choisirVue('carrousel')} data-vue-carrousel>Carrousel</button>
            <button type="button" className="pvv-choix pvv-vue" aria-pressed={vue === 'liste'} onClick={() => choisirVue('liste')} data-vue-liste>Liste</button>
          </div>)}
      </div>
      <div className="pvv-photos-boutons pvv-boutons-2">
        {/* 🔴 Arno (15/11/2026) — « Photothèque » à GAUCHE, « Ajouter une photo » à DROITE */}
        <label className="svv-btn svv-btn-outline pvv-gros" htmlFor={galerie} data-photo-galerie-bouton><Icone nom="images" /> Photothèque</label>
        <input id={galerie} className="pvv-fichier" type="file" accept="image/*" multiple onChange={(e) => { void ajouter(e.target.files); e.target.value = ''; }} data-photo-galerie />
        <label className="svv-btn pvv-gros pvv-plein" htmlFor={camera} data-ajouter-photo><Icone nom="appareil" /> Ajouter une photo</label>
        <input id={camera} className="pvv-fichier" type="file" accept="image/*" capture="environment" multiple onChange={(e) => { void ajouter(e.target.files); e.target.value = ''; }} data-photo-camera />
      </div>
      {photos.length > 0 && <>
        {vue === 'carrousel' && (
          <div className="pvv-carrousel-nav">
            <button type="button" className="pvv-mini" onClick={() => aller(rang - 1)} disabled={rang === 0} aria-label="Photo précédente" data-carrousel-precedente><Icone nom="gauche" /></button>
            <span className="pvv-indicateur" aria-live="polite" data-carrousel-indicateur>{Math.min(rang + 1, photos.length)}/{photos.length}</span>
            <button type="button" className="pvv-mini" onClick={() => aller(rang + 1)} disabled={rang >= photos.length - 1} aria-label="Photo suivante" data-carrousel-suivante><Icone nom="droite" /></button>
          </div>)}
        <ol ref={piste} className={vue === 'carrousel' ? 'pvv-photos-liste pvv-carrousel' : 'pvv-photos-liste'}
          onScroll={vue === 'carrousel' ? (e) => {
            const p = e.currentTarget; if (p.clientWidth <= 0) return;
            // un défilement voulu (‹ ›, légende) : l'indicateur montre déjà la cible ; on ne recale pas tant qu'on n'y est pas
            const c = cible.current;
            if (c !== null) {
              if (Math.abs(p.scrollLeft - c.rang * p.clientWidth) <= 2 || Date.now() > c.jusqua) cible.current = null;
              else return;
            }
            setRang(Math.round(p.scrollLeft / p.clientWidth));
            // le défilement arrêté : on se recale sur la photo la plus proche (WebKit ne le fait pas toujours, ex. après le focus d'une légende)
            if (reglage.current) clearTimeout(reglage.current);
            reglage.current = setTimeout(() => {
              reglage.current = null;
              if (cible.current !== null && Date.now() <= cible.current.jusqua) return; // un défilement voulu est en cours
              const j = Math.round(p.scrollLeft / p.clientWidth); if (Math.abs(p.scrollLeft - j * p.clientWidth) > 2) aller(j);
            }, 140);
          } : undefined}>
          {photos.map((x, i) => {
            const sansLegende = rangSansLegende === i || (rangSansLegende !== null && x.legende.trim() === '');
            return (
              <li key={x.cle} className={`pvv-photo${sansLegende ? ' pvv-photo--erreur' : ''}${x.etat === 'erreur' ? ' pvv-photo--echec' : ''}`} data-photo={i + 1} data-photo-etat={x.etat}
                data-photo-sans-legende={sansLegende ? 'oui' : undefined}
                // carrousel : toucher une légende amène SA photo entière à l'écran (jamais deux moitiés)
                onFocus={vue === 'carrousel' ? () => { if (i !== rang) aller(i); else setTimeout(() => aller(i), 60); } : undefined}>
                <div className="pvv-photo-tete">
                  <strong>Photo {i + 1}</strong>
                  <span className="pvv-photo-gestes">
                    <button type="button" className="pvv-mini" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={`Monter la photo ${i + 1}`} data-photo-monter><Icone nom="haut" /></button>
                    <button type="button" className="pvv-mini" onClick={() => deplacer(i, 1)} disabled={i === photos.length - 1} aria-label={`Descendre la photo ${i + 1}`} data-photo-descendre><Icone nom="bas" /></button>
                    <button type="button" className="pvv-mini pvv-mini--danger" onClick={() => setAConfirmer(x.cle)} aria-label={`Supprimer la photo ${i + 1}`} data-photo-supprimer>Supprimer</button>
                  </span>
                </div>
                {aConfirmer === x.cle && (
                  <Confirmation question={`Supprimer la photo ${i + 1} ?`} action="Supprimer" onConfirmer={() => retirer(x.cle)} onGarder={() => setAConfirmer(null)}
                    attributs={{ 'data-photo-confirmer': '' }} attributsOui={{ 'data-photo-supprimer-oui': '' }} attributsNon={{ 'data-photo-supprimer-non': '' }} />)}
                {x.apercu ? <img className="pvv-vignette" src={x.apercu} alt={x.legende ? lignePhoto(i, x.legende) : `Photo ${i + 1}`} /> : <span className="pvv-vignette pvv-vignette--vide" />}
                {x.etat === 'envoi' && <span className="loc-muet" role="status">Préparation…</span>}
                {x.etat === 'erreur' && <span className="pvv-photo-motif" role="alert">{x.motif}</span>}
                <ChampLegende rang={i + 1} valeur={x.legende} invalide={sansLegende} occupationIds={occupationIds}
                  onChange={(f) => maj(x.cle, (y) => ({ ...y, legende: f(y.legende) }))} onOccupe={(o) => occuper(x.cle, o)} />
                {sansLegende && x.etat !== 'erreur' && <span className="pvv-photo-motif" role="alert" data-photo-legende-requise>Légende obligatoire avant l’envoi.</span>}
              </li>);
          })}
        </ol>
      </>}
    </section>
  );
}

/* ══ BLOC DICTAPHONE ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une prise du dictaphone : sa réécoute (sur l'appareil) et sa pièce déposée (`id`, interne). */
export interface PriseVocale { cle: string; id: number | null; url: string; dureeS: number; etat: 'depot' | 'ok' | 'erreur'; motif: string | null }
/** Un fichier vocal : un nom (renommable) et ses prises, dans l'ordre. */
export interface FichierVocal { cle: string; nom: string; prises: PriseVocale[]; transcription: 'en_cours' | 'ok' | 'echec' | null; motif: string | null;
  /** 🔴 Arno (15/11/2026) — « Envoyé aux locataires » : défaut NON (le fichier reste interne). */
  locataires?: boolean }

export const fichierVide = (rang: number): FichierVocal => ({ cle: nouvelleCle(), nom: `Vocal ${rang + 1}`, prises: [], transcription: null, motif: null, locataires: false });
export const dureeFichier = (f: FichierVocal): number => f.prises.reduce((s, p) => s + p.dureeS, 0);

/** Un lecteur unique : lit une suite de prises (le fichier : enchaînées), ou une seule ; Pause. */
function useLecteur(): { jouant: string | null; lire: (cle: string, urls: string[]) => void; arreter: () => void } {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [jouant, setJouant] = useState<string | null>(null);
  const arreter = useCallback((): void => { const a = audio.current; if (a) { a.onended = null; a.pause(); } setJouant(null); }, []);
  const lire = useCallback((cle: string, urls: string[]): void => {
    if (typeof Audio === 'undefined' || urls.length === 0) return;
    if (audio.current === null) audio.current = new Audio();
    const a = audio.current;
    let i = 0;
    const suivante = (): void => {
      if (i >= urls.length) { setJouant(null); a.onended = null; return; }
      a.src = urls[i]; i += 1;
      void a.play()?.catch?.(() => setJouant(null));
    };
    a.onended = suivante;
    setJouant(cle); suivante();
  }, []);
  useEffect(() => () => { const a = audio.current; if (a) { a.onended = null; a.pause(); } }, []);
  return { jouant, lire, arreter };
}

export function BlocDictaphone({ fichiers, setFichiers, occupationIds, onTranscrit, onOccupe }: {
  fichiers: FichierVocal[]; setFichiers: (f: (x: FichierVocal[]) => FichierVocal[]) => void; occupationIds: readonly number[];
  onTranscrit: (texte: string) => void; onOccupe: (occupe: boolean) => void }) {
  const titreId = useId();
  const [courant, setCourant] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<{ fichier: string; prise: string | null } | null>(null);
  const lecteur = useLecteur();
  const cleCourante = courant !== null && fichiers.some((f) => f.cle === courant) ? courant : (fichiers[fichiers.length - 1]?.cle ?? null);
  const majFichier = (cle: string, f: (x: FichierVocal) => FichierVocal) => setFichiers((xs) => xs.map((x) => (x.cle === cle ? f(x) : x)));
  const majPrise = (fc: string, pc: string, f: (x: PriseVocale) => PriseVocale) => majFichier(fc, (x) => ({ ...x, prises: x.prises.map((p) => (p.cle === pc ? f(p) : p)) }));
  const deposer = async (fc: string, pc: string, blob: Blob, type: string, dureeS: number): Promise<void> => {
    const deja = await new Promise<number[]>((ok) => setFichiers((xs) => { ok(xs.flatMap((x) => x.prises).filter((p) => p.id !== null).map((p) => p.id as number)); return xs; }));
    let donnees: string;
    try { donnees = await (await modulePhoto()).enBase64(blob); } catch { majPrise(fc, pc, (p) => ({ ...p, etat: 'erreur', motif: 'La prise n’a pas pu être préparée sur cet appareil.' })); return; }
    const r = await envoyer({ action: 'vocal-compte-rendu', occupationIds: [...occupationIds], donnees, typeMime: type, dureeS, dejaIds: deja }, { propre: true });
    const id = (r.data as { id?: number } | undefined)?.id;
    majPrise(fc, pc, (p) => (r.motif === null && typeof id === 'number' ? { ...p, id, etat: 'ok' } : { ...p, etat: 'erreur', motif: r.motif ?? 'La prise n’a pas pu être enregistrée.' }));
  };
  const prise = useEnregistrementMaintenu((blob, type, dureeMs) => {
    const dureeS = Math.min(dureeMs / 1000, VOCAL_DUREE_MAX_S);
    const pc = nouvelleCle(); const url = URL.createObjectURL(blob);
    let fc = cleCourante;
    if (fc === null) { const f = fichierVide(0); fc = f.cle; setFichiers((xs) => [...xs, f]); setCourant(f.cle); }
    const cible = fc;
    setFichiers((xs) => xs.map((x) => (x.cle === cible ? { ...x, prises: [...x.prises, { cle: pc, id: null, url, dureeS, etat: 'depot', motif: null }] } : x)));
    void deposer(cible, pc, blob, type, dureeS);
  });
  const enCours = prise.etat !== 'repos' || fichiers.some((f) => f.transcription === 'en_cours' || f.prises.some((p) => p.etat === 'depot'));
  useEffect(() => { onOccupe(enCours); }, [enCours, onOccupe]);
  const nouveau = (): void => { const f = fichierVide(fichiers.length); setFichiers((xs) => [...xs, f]); setCourant(f.cle); };
  const supprimerFichier = (fc: string): void => {
    const f = fichiers.find((x) => x.cle === fc);
    f?.prises.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch { /* rien */ } });
    if (lecteur.jouant !== null) lecteur.arreter();
    setFichiers((xs) => xs.filter((x) => x.cle !== fc)); setAConfirmer(null);
  };
  const supprimerPrise = (fc: string, pc: string): void => {
    const p = fichiers.find((x) => x.cle === fc)?.prises.find((y) => y.cle === pc);
    if (p) { try { URL.revokeObjectURL(p.url); } catch { /* rien */ } }
    if (lecteur.jouant !== null) lecteur.arreter();
    majFichier(fc, (x) => ({ ...x, prises: x.prises.filter((y) => y.cle !== pc) })); setAConfirmer(null);
  };
  const transcrire = async (f: FichierVocal): Promise<void> => {
    const ids = f.prises.filter((p) => p.id !== null).map((p) => p.id as number);
    if (ids.length === 0) return;
    majFichier(f.cle, (x) => ({ ...x, transcription: 'en_cours', motif: null }));
    const morceaux: string[] = [];
    for (const id of ids) {
      const r = await envoyer({ action: 'transcrire-vocal', occupationIds: [...occupationIds], pieceId: id }, { propre: true });
      const d = r.data as { ok?: boolean; texte?: string; motif?: string } | undefined;
      if (r.motif !== null || d?.ok !== true || typeof d.texte !== 'string') {
        majFichier(f.cle, (x) => ({ ...x, transcription: 'echec', motif: d?.motif ?? r.motif ?? 'La transcription a échoué : le fichier vocal reste joint.' })); return;
      }
      if (d.texte.trim() !== '') morceaux.push(d.texte.trim());
    }
    if (morceaux.length > 0) onTranscrit(morceaux.join(' '));
    majFichier(f.cle, (x) => ({ ...x, transcription: 'ok' }));
  };
  return (
    <section className="pvv-bloc pvv-bloc--dictaphone pvv-vocaux" aria-labelledby={titreId} data-vocaux-compte-rendu>
      <h3 id={titreId} className="pvv-bloc-titre">Dictaphone <span className="loc-muet">(internes, sauf ceux envoyés aux locataires)</span></h3>
      <div className="pvv-dictaphone">
        {/* 🔴 Arno (15/11/2026) — le bouton rond : une grande icône de micro, rien d'autre ; ROUGE tant que le doigt est posé ; la durée SOUS le bouton */}
        <BoutonMaintenir etat={prise.etat} dureeMs={prise.dureeMs} repos={<Icone nom="micro" taille={44} />} actif={<Icone nom="micro" taille={44} />} rond
          onAppui={prise.appuyer} onRelache={prise.relacher} className="pvv-rond pvv-maintien" attributs={{ 'data-enregistrer-vocal': '', 'aria-label': 'Maintenir pour enregistrer' }} />
        <span className="pvv-chrono pvv-rond-duree" role="timer" aria-live="off" data-rond-duree>{prise.etat === 'repos' ? 'Maintenir pour enregistrer' : dureeFr(prise.dureeMs / 1000)}</span>
        <p className="loc-muet pvv-dictaphone-cible" data-vocal-cible>{cleCourante === null ? 'La première prise crée « Vocal 1 ».'
          : `Les prises s’ajoutent à « ${fichiers.find((f) => f.cle === cleCourante)?.nom ?? ''} ».`}</p>
        <div className="pvv-boutons-2 pvv-a-droite"><button type="button" className="svv-btn svv-btn-outline pvv-gros" onClick={nouveau} disabled={prise.etat !== 'repos'} data-nouveau-vocal><Icone nom="plus" /> Nouveau fichier vocal</button></div>
      </div>
      {prise.message !== null && <p className="pvv-photo-motif" role="alert" data-vocal-micro>{prise.message}</p>}
      {fichiers.length > 0 && <ol className="pvv-fichiers">{fichiers.map((f, i) => {
        const urls = f.prises.map((p) => p.url);
        const jouant = lecteur.jouant === f.cle;
        const estCourant = f.cle === cleCourante;
        return (
          <li key={f.cle} className={`pvv-fichier-vocal${estCourant ? ' pvv-fichier-vocal--courant' : ''}`} data-vocal={i + 1} data-vocal-prises={f.prises.length}
            data-vocal-transcription={f.transcription ?? undefined}>
            <div className="pvv-photo-tete">
              <label className="pvv-nom-vocal"><span className="pvv-lu">Nom du fichier vocal {i + 1}</span>
                <input type="text" value={f.nom} maxLength={60} autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" onChange={(e) => { const v = e.target.value; majFichier(f.cle, (x) => ({ ...x, nom: v })); }} data-vocal-nom /></label>
            </div>
            <p className="loc-muet pvv-vocal-resume" data-vocal-resume>{f.prises.length} prise{f.prises.length > 1 ? 's' : ''} · {dureeFr(dureeFichier(f))}</p>
            {/* 🔴 Arno (15/11/2026) — l'interrupteur « Envoyé aux locataires » (défaut : non envoyé) */}
            <label className={`pvv-interrupteur${f.locataires ? ' pvv-interrupteur--oui' : ''}`} data-vocal-locataires={f.locataires ? 'oui' : 'non'}>
              <input type="checkbox" role="switch" checked={f.locataires === true} aria-checked={f.locataires === true}
                onChange={(e) => { const v = e.target.checked; majFichier(f.cle, (x) => ({ ...x, locataires: v })); }} data-vocal-locataires-case />
              <span className="pvv-interrupteur-piste" aria-hidden="true" />
              <span>{f.locataires ? 'Envoyé aux locataires' : 'Non envoyé aux locataires'}</span>
            </label>
            {/* 🔴 Arno (15/11/2026) — boutons homogènes : la forme, la hauteur, la typographie et la largeur des deux boutons du bloc Texte */}
            <div className="pvv-boutons-2 pvv-vocal-gestes">
              <button type="button" className="svv-btn svv-btn-outline pvv-gros" disabled={urls.length === 0} onClick={() => (jouant ? lecteur.arreter() : lecteur.lire(f.cle, urls))} data-vocal-ecouter><Icone nom={jouant ? 'pause' : 'lecture'} /> {jouant ? 'Pause' : 'Écouter'}</button>
              {!estCourant && <button type="button" className="svv-btn svv-btn-outline pvv-gros" onClick={() => setCourant(f.cle)} data-vocal-choisir><Icone nom="cible" /> Enregistrer ici</button>}
              <button type="button" className="svv-btn svv-btn-outline pvv-gros" disabled={f.prises.every((p) => p.id === null) || f.transcription === 'en_cours'} onClick={() => { void transcrire(f); }} data-vocal-transcrire><Icone nom="texte" /> Transcrire dans le texte</button>
              <button type="button" className="svv-btn svv-btn-outline pvv-gros pvv-gros--danger" onClick={() => setAConfirmer({ fichier: f.cle, prise: null })} aria-label={`Supprimer ${f.nom}`} data-vocal-supprimer><Icone nom="corbeille" /> Supprimer</button>
            </div>
            {aConfirmer?.fichier === f.cle && aConfirmer.prise === null && (
              <Confirmation question={`Supprimer « ${f.nom} » et ses ${f.prises.length} prise${f.prises.length > 1 ? 's' : ''} ?`} action="Supprimer"
                onConfirmer={() => supprimerFichier(f.cle)} onGarder={() => setAConfirmer(null)}
                attributs={{ 'data-vocal-confirmer': '' }} attributsOui={{ 'data-vocal-supprimer-oui': '' }} attributsNon={{ 'data-vocal-supprimer-non': '' }} />)}
            {f.transcription === 'en_cours' && <span className="loc-muet" role="status" data-vocal-transcription-en-cours>Transcription en cours…</span>}
            {f.transcription === 'ok' && <span className="loc-muet" data-vocal-transcrit>Texte inséré dans le compte rendu {MENTION_TRANSCRIT} — modifiable.</span>}
            {f.motif !== null && <span className="pvv-photo-motif" role="alert" data-vocal-motif>{f.motif}</span>}
            {f.prises.length > 0 && <ol className="pvv-prises">{f.prises.map((p, k) => (
              <li key={p.cle} className={`pvv-prise${p.etat === 'erreur' ? ' pvv-photo--echec' : ''}`} data-prise={k + 1} data-prise-etat={p.etat}>
                <span>Prise {k + 1} <span className="loc-muet">({dureeFr(p.dureeS)})</span></span>
                {p.etat === 'depot' && <span className="loc-muet" role="status">Enregistrement…</span>}
                <button type="button" className="pvv-mini" onClick={() => (lecteur.jouant === p.cle ? lecteur.arreter() : lecteur.lire(p.cle, [p.url]))} aria-label={lecteur.jouant === p.cle ? `Pause de la prise ${k + 1}` : `Écouter la prise ${k + 1}`} data-prise-ecouter><Icone nom={lecteur.jouant === p.cle ? 'pause' : 'lecture'} /></button>
                <button type="button" className="pvv-mini" onClick={() => setAConfirmer({ fichier: f.cle, prise: p.cle })} aria-label={`Supprimer la prise ${k + 1}`} data-prise-supprimer><Icone nom="corbeille" /></button>
                {aConfirmer?.fichier === f.cle && aConfirmer.prise === p.cle && (
                  <Confirmation question={`Supprimer la prise ${k + 1} ?`} action="Supprimer" onConfirmer={() => supprimerPrise(f.cle, p.cle)} onGarder={() => setAConfirmer(null)}
                    attributs={{ 'data-prise-confirmer': '' }} attributsOui={{ 'data-prise-supprimer-oui': '' }} attributsNon={{ 'data-prise-supprimer-non': '' }} />)}
                {p.motif !== null && <span className="pvv-photo-motif" role="alert">{p.motif}</span>}
              </li>))}</ol>}
          </li>);
      })}</ol>}
    </section>
  );
}

/**
 * « Voir le compte rendu » (après l'envoi, LECTURE SEULE) : les fichiers vocaux, leurs prises, la réécoute du fichier qui les ENCHAÎNE et
 * celle de chaque prise. Rien n'est modifiable.
 */
export function LectureFichiersVocaux({ fichiers, url }: { fichiers: { nom: string; prises: { id: number; nom: string }[]; locataires?: boolean }[]; url: (id: number) => string }) {
  const lecteur = useLecteur();
  return (
    <ol className="pvv-cr-fichiers">{fichiers.map((f, i) => {
      const cle = `f${i}`; const jouant = lecteur.jouant === cle;
      return (
        <li key={cle} className="pvv-fichier-vocal" data-cr-vocal={i + 1} data-cr-vocal-prises={f.prises.length}>
          <div className="pvv-photo-tete"><strong className="pvv-cr-legende" data-cr-vocal-nom>{f.nom}</strong>
            <span className="loc-muet">{f.prises.length} prise{f.prises.length > 1 ? 's' : ''}</span></div>
          <p className={`pvv-vocal-etat${f.locataires ? ' pvv-vocal-etat--envoye' : ''}`} data-cr-vocal-etat={f.locataires ? 'envoye' : 'interne'}>{f.nom} — {etatVocalLocataires(f.locataires === true)}</p>
          <div className="pvv-photo-gestes pvv-vocal-gestes">
            <button type="button" className="pvv-mini" onClick={() => (jouant ? lecteur.arreter() : lecteur.lire(cle, f.prises.map((p) => url(p.id))))} data-cr-vocal-ecouter><Icone nom={jouant ? 'pause' : 'lecture'} /> {jouant ? 'Pause' : 'Écouter'}</button>
          </div>
          <ol className="pvv-prises">{f.prises.map((p, k) => (
            <li key={p.id} className="pvv-prise" data-cr-prise={k + 1}><span>Prise {k + 1}</span>
              <button type="button" className="pvv-mini" onClick={() => (lecteur.jouant === `p${p.id}` ? lecteur.arreter() : lecteur.lire(`p${p.id}`, [url(p.id)]))}
                aria-label={lecteur.jouant === `p${p.id}` ? `Pause de la prise ${k + 1}` : `Écouter la prise ${k + 1}`}><Icone nom={lecteur.jouant === `p${p.id}` ? 'pause' : 'lecture'} /></button></li>))}</ol>
        </li>);
    })}</ol>
  );
}

/**
 * 🔴 Arno (15/11/2026) — le petit bouton clair / sombre du formulaire (sur téléphone) : le MÊME réglage que le sélecteur de thème de l'admin
 * (même mémorisation par navigateur) ; il bascule vers le thème inverse de celui qu'on voit.
 */
export function BoutonTheme() {
  const pref = useSyncExternalStore(souscrireTheme, snapshotTheme, snapshotThemeServeur);
  const sombreSysteme = (): boolean => { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; } };
  const vu = pref === 'system' ? (typeof window !== 'undefined' && sombreSysteme() ? 'dark' : 'light') : pref;
  const basculer = (): void => { const v = themeBascule(pref, sombreSysteme()); persisterTheme(v); appliquerThemeSur(racineTheme(), v); };
  return (
    <button type="button" className="pvv-theme" onClick={basculer} aria-label={vu === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'} data-theme-bascule={vu}>
      <Icone nom={vu === 'dark' ? 'soleil' : 'lune'} /></button>
  );
}

/** Ce qui part avec l'envoi : les prises déposées et les fichiers (nom, prises dans l'ordre). PUR. */
export function vocauxPourEnvoi(fichiers: readonly FichierVocal[]): { vocaux: number[]; fichiersVocaux: { nom: string; ids: number[]; locataires: boolean }[] } {
  const fichiersVocaux = fichiers.map((f, i) => ({ nom: f.nom.trim() || `Vocal ${i + 1}`, ids: f.prises.filter((p) => p.id !== null).map((p) => p.id as number), locataires: f.locataires === true }))
    .filter((f) => f.ids.length > 0);
  return { vocaux: fichiersVocaux.flatMap((f) => f.ids), fichiersVocaux };
}

/** L'insertion d'une transcription de fichier vocal (avec la mention) : réexportée pour l'écran. */
export { insererTranscription };

/* ══ 🔴 Arno (15/11/2026) — L'ENVOI DU COMPTE RENDU AUX LOCATAIRES : un GROS bouton bascule pleine largeur (remplace la case « Envoyer aussi
 * aux locataires », accord d'Arno), ACTIVÉ PAR DÉFAUT. Activé : plein ROUGE, « Compte rendu envoyé aux locataires » avec une coche, et dessous
 * le ou les locataires qui le recevront ; désactivé : contour seul, « Compte rendu NON envoyé aux locataires (interne uniquement) ». Un appui
 * bascule ; aria-pressed suit l'état ; le texte d'aide aussi. */
export const LIBELLE_ENVOI_LOCATAIRES_OUI = 'Compte rendu envoyé aux locataires';
export const LIBELLE_ENVOI_LOCATAIRES_NON = 'Compte rendu NON envoyé aux locataires (interne uniquement)';
export const AIDE_ENVOI_LOCATAIRES_OUI = 'Envoyé à tous les collaborateurs ayant accès à Gestion et/ou Location ; chaque locataire reçoit en plus SON propre mail (seul destinataire, sans copie visible).';
export const AIDE_ENVOI_LOCATAIRES_NON = 'Envoyé seulement aux collaborateurs ayant accès à Gestion et/ou Location : aucun locataire ne le reçoit.';

/** Qui recevra le compte rendu : les locataires du préavis avec une adresse e-mail ; ceux qui n'en ont pas sont dits à part. PUR. */
export function destinatairesLocataires(locs: readonly { occupationId: number; nom: string; prenom?: string | null; emails: readonly string[] }[], occupationIds: readonly number[]):
  { recoivent: string[]; sansEmail: string[] } {
  const ici = locs.filter((x) => occupationIds.includes(x.occupationId));
  const nom = (x: (typeof ici)[number]) => prenomNom({ nom: x.nom, prenom: x.prenom ?? null });
  return { recoivent: ici.filter((x) => aUnEmail(x.emails)).map(nom), sansEmail: ici.filter((x) => !aUnEmail(x.emails)).map(nom) };
}

export function BoutonEnvoiLocataires({ actif, onBasculer, occupationId, occupationIds, nomsConnus }: {
  actif: boolean; onBasculer: () => void; occupationId: number; occupationIds: readonly number[];
  /** les noms des locataires du préavis, montrés tant que leurs adresses ne sont pas lues */
  nomsConnus: readonly string[];
}) {
  const { base } = useContextePreavis();
  const lu = useLecture<EncartLogement>(`encartBail=${occupationId}`, base);
  const d = lu.etat.etat === 'ok' ? destinatairesLocataires(lu.etat.data.coordonnees?.locataires ?? [], occupationIds) : null;
  const recoivent = d === null ? [...nomsConnus] : d.recoivent;
  return (
    <div className="pvv-envoi-loc" data-bloc-envoi-locataires>
      <button type="button" className={`svv-btn pvv-gros pvv-envoi-loc-bouton${actif ? ' svv-btn-primary pvv-envoi-loc--oui' : ' svv-btn-outline'}`} aria-pressed={actif}
        onClick={onBasculer} data-aussi-locataires={actif ? 'oui' : 'non'}>
        {actif ? <><Icone nom="coche" /> {LIBELLE_ENVOI_LOCATAIRES_OUI}</> : LIBELLE_ENVOI_LOCATAIRES_NON}
      </button>
      {actif && (recoivent.length > 0
        ? <p className="pvv-envoi-loc-noms" data-envoi-locataires-noms>Le recevra{recoivent.length > 1 ? 'nt' : ''} : {recoivent.join(', ')}</p>
        : <p className="pvv-envoi-loc-noms" data-envoi-locataires-noms>Aucun locataire avec une adresse e-mail : seuls les collaborateurs le recevront.</p>)}
      {actif && d !== null && d.sansEmail.length > 0 && <p className="loc-muet" data-envoi-locataires-sans-email>Sans adresse e-mail, ne le recevra pas : {d.sansEmail.join(', ')}</p>}
      <p className="loc-muet" data-aide-envoi-locataires>{actif ? AIDE_ENVOI_LOCATAIRES_OUI : AIDE_ENVOI_LOCATAIRES_NON}</p>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement. */
export const CSS_COMPTE_RENDU_SAISIE = `
.pvv-envoi-loc{display:flex;flex-direction:column;gap:6px}
.pvv-envoi-loc--oui.svv-btn,.pvv-envoi-loc--oui{background:var(--color-svv-red);color:var(--color-svv-surface);border:2px solid var(--color-svv-red)}
.pvv-envoi-loc-bouton.svv-btn-outline{background:var(--color-svv-surface);color:var(--color-svv-ink);border:2px solid var(--color-svv-line-strong)}
.pvv-envoi-loc-noms{margin:0;font-weight:800;overflow-wrap:anywhere}
.pvv-bloc{border:1px solid var(--color-svv-line);border-radius:14px;padding:12px;margin:14px 0 0;display:flex;flex-direction:column;gap:10px;min-width:0}
.pvv-bloc--texte{background:color-mix(in srgb, var(--color-svv-green) 5%, var(--color-svv-surface))}
.pvv-bloc--photos{background:color-mix(in srgb, var(--color-svv-ink) 4%, var(--color-svv-surface))}
.pvv-bloc--dictaphone{background:color-mix(in srgb, var(--color-svv-red) 4%, var(--color-svv-surface))}
.pvv-bloc-tete{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pvv-bloc-titre{margin:0;font-size:1.05rem;font-weight:900;letter-spacing:.01em}
.pvv-requis{color:var(--color-svv-red)}
.pvv-texte{width:100%;box-sizing:border-box;min-height:9.5em;resize:vertical;font:inherit;font-size:16px;line-height:1.5;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);overflow:hidden}
.pvv-boite-cr .pvv-texte{min-height:9.5em}
.pvv-texte-boutons,.pvv-boutons-2{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%}
.pvv-photos-boutons.pvv-boutons-2{display:grid}
.pvv-icone{flex:0 0 auto}
.pvv-plein.svv-btn,.pvv-plein{background:var(--color-svv-ink);color:var(--color-svv-surface);border:0}
.pvv-a-droite > :only-child{grid-column:2}
.pvv-note-presence{flex:1 1 100%;margin:0 0 0 30px}
.pvv-note-presence input{width:100%;box-sizing:border-box;min-height:40px;font:inherit;font-size:16px;padding:0 10px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.pvv-gros--danger{color:var(--color-svv-red);border-color:var(--color-svv-red)}
/* les boutons du bas du formulaire : la meme forme, hauteur, typographie et largeur que ceux des blocs */
.pvv-boite-cr .mis-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pvv-boite-cr .mis-actions .mis-action{width:100%;min-height:56px;font-size:1rem;font-weight:800;padding:0 10px}
.pvv-gros{box-sizing:border-box;min-height:56px;width:100%;margin:0;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:1rem;font-weight:800;line-height:1.2;padding:0 10px;text-align:center;border-radius:14px;cursor:pointer}
.pvv-maintien{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;cursor:pointer}
.pvv-maintien.svv-btn{background:var(--color-svv-ink);color:var(--color-svv-surface);border:0}
.pvv-maintien--actif,.pvv-maintien--actif.svv-btn,.pvv-boite-cr .pvv-maintien.pvv-maintien--actif,.pvv-boite-cr .pvv-maintien.pvv-maintien--actif:hover,.pvv-boite-cr .pvv-maintien.pvv-maintien--actif:active{background:var(--color-svv-red) !important;border-color:var(--color-svv-red) !important;color:var(--color-svv-blanc) !important;animation:pvv-pulsation 1.1s ease-in-out infinite}
@keyframes pvv-pulsation{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--color-svv-red) 55%, transparent)}70%{box-shadow:0 0 0 14px color-mix(in srgb, var(--color-svv-red) 0%, transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--color-svv-red) 0%, transparent)}}
@media (prefers-reduced-motion: reduce){.pvv-maintien--actif,.pvv-maintien--actif.svv-btn{animation:none}}
.pvv-point{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--color-svv-surface)}
.pvv-chrono{font-variant-numeric:tabular-nums}
.pvv-statut{margin:0;font-style:italic}
.pvv-segments{display:inline-flex;gap:10px;flex-wrap:wrap}
/* Arno (15/11/2026) : un CHOIX est un vrai bouton — liseré gris, fond de carte, 44 px ; l'actif en plein rouge (accent), texte gras */
.pvv-choix{box-sizing:border-box;min-height:44px;min-width:44px;padding:0 16px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.95rem;font-weight:700;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.pvv-choix:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
.pvv-choix[aria-pressed=true]{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);font-weight:900}
.pvv-choix--danger{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);font-weight:800}
/* le champ de legende : le lisere d'un champ de saisie (visible au repos, accentue au focus), le micro DANS le champ, a droite */
.pvv-legende-bloc{display:flex;flex-direction:column;gap:4px}
.pvv-legende-cadre{position:relative;display:block}
.pvv-legende-champ{width:100%;box-sizing:border-box;min-height:52px;margin:0;padding:0 60px 0 12px;font:inherit;font-size:16px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.pvv-legende-champ:focus{outline:none;border-color:var(--color-svv-ink);box-shadow:0 0 0 1px var(--color-svv-ink)}
.pvv-legende-champ[aria-invalid=true]{border-color:var(--color-svv-red);box-shadow:0 0 0 1px var(--color-svv-red)}
.pvv-micro-legende{position:absolute;top:50%;right:4px;transform:translateY(-50%);width:44px;height:44px;border-radius:999px;border:0;padding:0;display:flex;align-items:center;justify-content:center;background:var(--color-svv-ink);color:var(--color-svv-surface)}
.pvv-carrousel-nav{display:flex;align-items:center;justify-content:center;gap:12px}
.pvv-indicateur{min-width:3.5em;text-align:center;font-weight:800;font-variant-numeric:tabular-nums}
.pvv-carrousel{flex-direction:row !important;overflow-x:auto;scroll-snap-type:x mandatory;gap:0 !important;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.pvv-carrousel > li{flex:0 0 100%;box-sizing:border-box;scroll-snap-align:start}
.pvv-confirmer{flex:1 1 100%;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:10px 12px;border-radius:12px;border:2px solid var(--color-svv-red);background:color-mix(in srgb, var(--color-svv-red) 6%, var(--color-svv-surface))}
.pvv-confirmer-question{margin:0;font-weight:800;color:var(--color-svv-ink)}
.pvv-confirmer-boutons{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pvv-confirmer-boutons .pvv-choix{width:100%;min-height:48px}
.pvv-mini--danger{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.pvv-dictaphone{display:flex;flex-direction:column;align-items:center;gap:8px}
.pvv-rond{width:96px;height:96px;min-width:72px;min-height:72px;border-radius:999px;border:0;background:var(--color-svv-ink);color:var(--color-svv-surface);display:flex;align-items:center;justify-content:center;padding:0}
.pvv-rond-duree{min-height:1.4em;font-weight:800;color:var(--color-svv-muted)}
.pvv-dictaphone:has(.pvv-maintien--actif) .pvv-rond-duree{color:var(--color-svv-red)}
.pvv-rond-icone{font-size:1.6rem}
.pvv-dictaphone-cible{margin:0;text-align:center}
.pvv-fichiers{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.pvv-fichier-vocal{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:12px;border:2px solid var(--color-svv-line);background:var(--color-svv-surface)}
.pvv-fichier-vocal--courant{border-color:var(--color-svv-ink)}
.pvv-nom-vocal{flex:1;min-width:0}
.pvv-nom-vocal input{width:100%;box-sizing:border-box;min-height:44px;font:inherit;font-size:16px;font-weight:800;padding:0 10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.pvv-lu{position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pvv-vocal-resume{margin:0}
.pvv-vocal-gestes{flex-wrap:wrap}
.pvv-prises{margin:0;padding:0 0 0 4px;list-style:none;display:flex;flex-direction:column;gap:6px}
.pvv-prise{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:var(--color-svv-field)}
.pvv-entree{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0}
.pvv-clavier--ouvert{box-shadow:inset 0 0 0 2px var(--color-svv-surface)}
.pvv-interrupteur{display:inline-flex;align-items:center;gap:10px;min-height:44px;font-weight:800;cursor:pointer;color:var(--color-svv-muted)}
.pvv-interrupteur input{position:absolute;top:0;left:0;width:1px;height:1px;opacity:0}
.pvv-interrupteur-piste{position:relative;flex:0 0 auto;width:46px;height:28px;border-radius:999px;background:var(--color-svv-line-strong);transition:background .15s}
.pvv-interrupteur-piste::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:999px;background:var(--color-svv-surface);transition:transform .15s}
.pvv-interrupteur--oui{color:var(--color-svv-green-ink)}
.pvv-interrupteur--oui .pvv-interrupteur-piste{background:var(--color-svv-green)}
.pvv-interrupteur--oui .pvv-interrupteur-piste::after{transform:translateX(18px)}
.pvv-interrupteur input:focus-visible + .pvv-interrupteur-piste{outline:2px solid var(--color-svv-ink);outline-offset:2px}
.pvv-vocal-etat{margin:0;font-weight:900;color:var(--color-svv-red)}
.pvv-vocal-etat--envoye{color:var(--color-svv-green-ink)}
.pvv-titre-ligne{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.pvv-theme{display:none;flex:0 0 auto;min-width:40px;min-height:40px;border-radius:999px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:1.05rem;cursor:pointer}
@media (max-width:640px){.pvv-theme{display:inline-flex;align-items:center;justify-content:center}}
.pvv-bloc--presence{background:color-mix(in srgb, var(--color-svv-ink) 3%, var(--color-svv-surface))}
.pvv-bloc--erreur{border-color:var(--color-svv-red);background:color-mix(in srgb, var(--color-svv-red) 6%, var(--color-svv-surface))}
.pvv-bloc--erreur .pvv-presence{color:var(--color-svv-red)}
.pvv-presences{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.pvv-presences li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 8px}
.pvv-presence{align-items:flex-start;min-height:44px}
.pvv-presence input{flex:0 0 auto;margin-top:2px;width:22px;height:22px}
.pvv-etiquette{display:inline-block;margin-left:4px;padding:1px 8px;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-muted);font-size:.78rem;font-weight:800}
.pvv-lien{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0;border:0;background:none;font:inherit;font-weight:800;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer}
.pvv-mini-voile{position:fixed;top:0;right:0;bottom:0;left:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.pvv-mini-modale{width:min(420px,100%);box-sizing:border-box;padding:16px;border-radius:16px;background:var(--color-svv-surface);color:var(--color-svv-ink);display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 40px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
.pvv-civilite{border:0;margin:0;padding:0;display:flex;gap:16px;flex-wrap:wrap}
.pvv-mini-modale input[type=text]{width:100%;box-sizing:border-box;min-height:48px;font-size:16px}
.pvv-cr-fichiers{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
/* le formulaire du compte rendu : fond OPAQUE (rien de la page derriere ne transparait), boutons en FIN de formulaire (plus colles en bas) */
.pvv-voile-cr{background:var(--color-svv-surface);z-index:200;top:0;right:0;bottom:0;left:0;box-shadow:0 0 0 100vmax var(--color-svv-surface)}
/* clavier iOS ouvert, rebond du defilement : le fond de la page elle-meme est opaque tant que le formulaire est ouvert */
html:has(.pvv-voile-cr),body:has(.pvv-voile-cr){background:var(--color-svv-surface)}
.pvv-recap-vocaux{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.pvv-recap-vocaux li{padding:10px 12px;border-radius:10px;border:2px solid currentColor;font-size:1.02rem;background:var(--color-svv-surface)}
/* la marge laterale des blocs (12 px + 1 px de bord) : les boutons du bas ont exactement la largeur de ceux des blocs */
.pvv-boite-cr .mis-actions{position:static;margin:18px 0 0;padding:12px 13px 0;border-top:1px solid var(--color-svv-line);background:transparent}
@media (max-width:640px){
  .pvv-voile-cr .mis-boite{min-height:100%;border-radius:0;box-shadow:none}
  .pvv-boite-cr .mis-actions{margin:18px 0 0;padding:12px 13px calc(12px + env(safe-area-inset-bottom))}
}
`;
