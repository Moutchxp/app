'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as KeyboardEventReact, type PointerEvent as PointerEventReact } from 'react';
import { envoyer } from './commun';
import { lignePhoto } from '../../../../lib/location/photosCompteRendu';
import { dureeFr, insererDictee, insererTranscription, MENTION_TRANSCRIT, PRISE_MIN_MS, VOCAL_DUREE_MAX_S } from '../../../../lib/location/vocauxCompteRendu';

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
export function BoutonMaintenir({ etat, dureeMs, repos, actif, onAppui, onRelache, className, attributs }: {
  etat: EtatMaintien; dureeMs: number; repos: React.ReactNode; actif: string; onAppui: () => void; onRelache: () => void; className: string; attributs: Record<string, string> }) {
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
  const enCours = etat !== 'repos';
  return (
    <button type="button" className={`${className}${enCours ? ' pvv-maintien--actif' : ''}`} aria-pressed={enCours}
      onPointerDown={bas} onPointerUp={onRelache} onPointerCancel={onRelache} onPointerLeave={() => { if (enCours) onRelache(); }}
      onContextMenu={(e) => e.preventDefault()} onKeyDown={(e) => clavier(e, false)} onKeyUp={(e) => clavier(e, true)} {...attributs}>
      {etat === 'enregistre' ? <><span className="pvv-point" aria-hidden="true" />{actif} <span className="pvv-chrono" role="timer" data-maintien-duree>{dureeFr(dureeMs / 1000)}</span></>
        : etat === 'demarrage' ? 'Micro…' : repos}
    </button>
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
  const [motif, setMotif] = useState<string | null>(null);
  const noter = (e: { currentTarget: HTMLTextAreaElement }): void => { noterCurseur(e.currentTarget.selectionStart); };
  const dictee = useEnregistrementMaintenu((blob, type) => {
    setTranscription(true); setMotif(null);
    void (async () => {
      let donnees: string;
      try { donnees = await (await modulePhoto()).enBase64(blob); } catch { setTranscription(false); setMotif('La dictée n’a pas pu être préparée sur cet appareil.'); return; }
      const r = await envoyer({ action: 'dicter-compte-rendu', occupationIds: [...occupationIds], donnees, typeMime: type }, { propre: true });
      setTranscription(false);
      const d = r.data as { ok?: boolean; texte?: string; motif?: string } | undefined;
      if (r.motif !== null || d?.ok !== true || typeof d.texte !== 'string') { setMotif(d?.motif ?? r.motif ?? 'La transcription a échoué : rien n’a été ajouté, réessayez.'); return; }
      const t = d.texte;
      setCorps((c) => { const x = insererDictee(c, lireCurseur(), t); noterCurseur(x.curseur); return x.texte; });
    })();
  });
  const occupe = dictee.etat !== 'repos' || transcription;
  useEffect(() => { onOccupe(occupe); }, [occupe, onOccupe]);
  // la zone grandit avec le texte (≈ 6 lignes au départ) ; clavier ouvert : la zone et la dernière ligne restent visibles
  useEffect(() => {
    const t = zone.current; if (!t) return;
    t.style.height = 'auto'; t.style.height = `${Math.max(t.scrollHeight, 0)}px`;
  }, [corps]);
  const ouvrirClavier = (): void => {
    const t = zone.current; if (!t) return;
    const p = lireCurseur() ?? t.value.length;
    t.focus();
    try { t.setSelectionRange(p, p); } catch { /* rien */ }
    setTimeout(() => { try { t.scrollIntoView({ block: 'center' }); } catch { /* rien */ } }, 300);
  };
  const titreId = useId();
  return (
    <section className="pvv-bloc pvv-bloc--texte" aria-labelledby={titreId} data-bloc-texte>
      <h3 id={titreId} className="pvv-bloc-titre">Texte <span className="pvv-requis">*</span></h3>
      <textarea ref={zone} className="pvv-texte" value={corps} rows={6} aria-labelledby={titreId} placeholder="ex. Logement propre, rayure du parquet de la chambre… (dictez ou tapez)"
        onChange={(e) => { const v = e.target.value; setCorps(() => v); noterCurseur(e.target.selectionStart); }}
        onSelect={noter} onBlur={noter} onKeyUp={noter} onClick={noter}
        onFocus={(e) => { const t = e.currentTarget; setTimeout(() => { try { t.scrollIntoView({ block: 'nearest' }); } catch { /* rien */ } }, 350); }}
        data-corps-compte-rendu />
      <div className="pvv-texte-boutons">
        <BoutonMaintenir etat={dictee.etat} dureeMs={dictee.dureeMs} repos={<><span aria-hidden="true">🎤</span> Maintenir pour dicter</>} actif="Dictée…"
          onAppui={dictee.appuyer} onRelache={dictee.relacher} className="svv-btn pvv-gros pvv-maintien" attributs={{ 'data-dicter': '' }} />
        <button type="button" className="svv-btn svv-btn-outline pvv-gros" onClick={ouvrirClavier} data-clavier><span aria-hidden="true">⌨️</span> Clavier</button>
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
export const lireVuePhotos = (): VuePhotos => { try { return window.localStorage.getItem(CLE_VUE_PHOTOS) === 'carrousel' ? 'carrousel' : 'liste'; } catch { return 'liste'; } };

export function BlocPhotos({ photos, onChange, occupationIds, rangSansLegende }: { photos: PhotoSaisie[];
  onChange: (f: (x: PhotoSaisie[]) => PhotoSaisie[]) => void; occupationIds: readonly number[]; rangSansLegende: number | null }) {
  const camera = useId(); const galerie = useId(); const titreId = useId();
  const [vue, setVue] = useState<VuePhotos>('liste');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setVue(lireVuePhotos()); }, []);
  const choisirVue = (v: VuePhotos): void => { setVue(v); try { window.localStorage.setItem(CLE_VUE_PHOTOS, v); } catch { /* sans stockage */ } };
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [rang, setRang] = useState(0);
  const piste = useRef<HTMLOListElement | null>(null);
  const reglage = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          <div className="pvv-segments" role="group" aria-label="Affichage des photos">
            <button type="button" className="pva-segment" aria-pressed={vue === 'carrousel'} onClick={() => choisirVue('carrousel')} data-vue-carrousel>Carrousel</button>
            <button type="button" className="pva-segment" aria-pressed={vue === 'liste'} onClick={() => choisirVue('liste')} data-vue-liste>Liste</button>
          </div>)}
      </div>
      <div className="pvv-photos-boutons">
        <label className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" htmlFor={camera} data-ajouter-photo>📷 Ajouter une photo</label>
        <input id={camera} className="pvv-fichier" type="file" accept="image/*" capture="environment" multiple onChange={(e) => { void ajouter(e.target.files); e.target.value = ''; }} data-photo-camera />
        <label className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" htmlFor={galerie} data-photo-galerie-bouton>🖼 Photothèque</label>
        <input id={galerie} className="pvv-fichier" type="file" accept="image/*" multiple onChange={(e) => { void ajouter(e.target.files); e.target.value = ''; }} data-photo-galerie />
      </div>
      {photos.length > 0 && <>
        {vue === 'carrousel' && (
          <div className="pvv-carrousel-nav">
            <button type="button" className="pvv-mini" onClick={() => aller(rang - 1)} disabled={rang === 0} aria-label="Photo précédente" data-carrousel-precedente>‹</button>
            <span className="pvv-indicateur" aria-live="polite" data-carrousel-indicateur>{Math.min(rang + 1, photos.length)}/{photos.length}</span>
            <button type="button" className="pvv-mini" onClick={() => aller(rang + 1)} disabled={rang >= photos.length - 1} aria-label="Photo suivante" data-carrousel-suivante>›</button>
          </div>)}
        <ol ref={piste} className={vue === 'carrousel' ? 'pvv-photos-liste pvv-carrousel' : 'pvv-photos-liste'}
          onScroll={vue === 'carrousel' ? (e) => {
            const p = e.currentTarget; if (p.clientWidth <= 0) return;
            setRang(Math.round(p.scrollLeft / p.clientWidth));
            // le défilement arrêté : on se recale sur la photo la plus proche (WebKit ne le fait pas toujours, ex. après le focus d'une légende)
            if (reglage.current) clearTimeout(reglage.current);
            reglage.current = setTimeout(() => { const j = Math.round(p.scrollLeft / p.clientWidth); if (Math.abs(p.scrollLeft - j * p.clientWidth) > 2) aller(j); }, 140);
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
                    <button type="button" className="pvv-mini" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={`Monter la photo ${i + 1}`} data-photo-monter>↑</button>
                    <button type="button" className="pvv-mini" onClick={() => deplacer(i, 1)} disabled={i === photos.length - 1} aria-label={`Descendre la photo ${i + 1}`} data-photo-descendre>↓</button>
                    <button type="button" className="pvv-mini" onClick={() => setAConfirmer(x.cle)} aria-label={`Supprimer la photo ${i + 1}`} data-photo-supprimer>Supprimer</button>
                  </span>
                </div>
                {aConfirmer === x.cle && (
                  <div className="pvv-confirmer" role="alertdialog" aria-label={`Supprimer la photo ${i + 1} ?`} data-photo-confirmer>
                    <span>Supprimer la photo {i + 1} ?</span>
                    <button type="button" className="pvv-mini pvv-mini--danger" onClick={() => retirer(x.cle)} data-photo-supprimer-oui>Supprimer</button>
                    <button type="button" className="pvv-mini" onClick={() => setAConfirmer(null)} data-photo-supprimer-non>Garder</button>
                  </div>)}
                {x.apercu ? <img className="pvv-vignette" src={x.apercu} alt={x.legende ? lignePhoto(i, x.legende) : `Photo ${i + 1}`} /> : <span className="pvv-vignette pvv-vignette--vide" />}
                {x.etat === 'envoi' && <span className="loc-muet" role="status">Préparation…</span>}
                {x.etat === 'erreur' && <span className="pvv-photo-motif" role="alert">{x.motif}</span>}
                <label className="pvs-champ"><span className="pvs-libelle">{`Légende de la photo ${i + 1} *`}</span>
                  <input type="text" value={x.legende} maxLength={200} placeholder="ex. Rayure parquet chambre" aria-invalid={sansLegende}
                    onChange={(e) => { const v = e.target.value; maj(x.cle, (y) => ({ ...y, legende: v })); }} data-photo-legende /></label>
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
export interface FichierVocal { cle: string; nom: string; prises: PriseVocale[]; transcription: 'en_cours' | 'ok' | 'echec' | null; motif: string | null }

const nouvelleCle = (): string => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const fichierVide = (rang: number): FichierVocal => ({ cle: nouvelleCle(), nom: `Vocal ${rang + 1}`, prises: [], transcription: null, motif: null });
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
      <h3 id={titreId} className="pvv-bloc-titre">Dictaphone <span className="loc-muet">(internes : jamais envoyés)</span></h3>
      <div className="pvv-dictaphone">
        <BoutonMaintenir etat={prise.etat} dureeMs={prise.dureeMs} repos={<><span aria-hidden="true" className="pvv-rond-icone">🎙</span><span>Maintenir pour enregistrer</span></>}
          actif="Enregistrement" onAppui={prise.appuyer} onRelache={prise.relacher} className="pvv-rond pvv-maintien" attributs={{ 'data-enregistrer-vocal': '' }} />
        <p className="loc-muet pvv-dictaphone-cible" data-vocal-cible>{cleCourante === null ? 'La première prise crée « Vocal 1 ».'
          : `Les prises s’ajoutent à « ${fichiers.find((f) => f.cle === cleCourante)?.nom ?? ''} ».`}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn pvv-photo-ajout" onClick={nouveau} disabled={prise.etat !== 'repos'} data-nouveau-vocal>➕ Nouveau fichier vocal</button>
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
                <input type="text" value={f.nom} maxLength={60} onChange={(e) => { const v = e.target.value; majFichier(f.cle, (x) => ({ ...x, nom: v })); }} data-vocal-nom /></label>
            </div>
            <p className="loc-muet pvv-vocal-resume" data-vocal-resume>{f.prises.length} prise{f.prises.length > 1 ? 's' : ''} · {dureeFr(dureeFichier(f))}</p>
            <div className="pvv-photo-gestes pvv-vocal-gestes">
              <button type="button" className="pvv-mini" disabled={urls.length === 0} onClick={() => (jouant ? lecteur.arreter() : lecteur.lire(f.cle, urls))} data-vocal-ecouter>{jouant ? '⏸ Pause' : '▶ Écouter'}</button>
              {!estCourant && <button type="button" className="pvv-mini" onClick={() => setCourant(f.cle)} data-vocal-choisir>Enregistrer ici</button>}
              <button type="button" className="pvv-mini" disabled={f.prises.every((p) => p.id === null) || f.transcription === 'en_cours'} onClick={() => { void transcrire(f); }} data-vocal-transcrire>Transcrire dans le texte</button>
              <button type="button" className="pvv-mini" onClick={() => setAConfirmer({ fichier: f.cle, prise: null })} aria-label={`Supprimer ${f.nom}`} data-vocal-supprimer>Supprimer</button>
            </div>
            {aConfirmer?.fichier === f.cle && aConfirmer.prise === null && (
              <div className="pvv-confirmer" role="alertdialog" aria-label={`Supprimer ${f.nom} ?`} data-vocal-confirmer>
                <span>Supprimer « {f.nom} » et ses {f.prises.length} prise{f.prises.length > 1 ? 's' : ''} ?</span>
                <button type="button" className="pvv-mini pvv-mini--danger" onClick={() => supprimerFichier(f.cle)} data-vocal-supprimer-oui>Supprimer</button>
                <button type="button" className="pvv-mini" onClick={() => setAConfirmer(null)} data-vocal-supprimer-non>Garder</button>
              </div>)}
            {f.transcription === 'en_cours' && <span className="loc-muet" role="status" data-vocal-transcription-en-cours>Transcription en cours…</span>}
            {f.transcription === 'ok' && <span className="loc-muet" data-vocal-transcrit>Texte inséré dans le compte rendu {MENTION_TRANSCRIT} — modifiable.</span>}
            {f.motif !== null && <span className="pvv-photo-motif" role="alert" data-vocal-motif>{f.motif}</span>}
            {f.prises.length > 0 && <ol className="pvv-prises">{f.prises.map((p, k) => (
              <li key={p.cle} className={`pvv-prise${p.etat === 'erreur' ? ' pvv-photo--echec' : ''}`} data-prise={k + 1} data-prise-etat={p.etat}>
                <span>Prise {k + 1} <span className="loc-muet">({dureeFr(p.dureeS)})</span></span>
                {p.etat === 'depot' && <span className="loc-muet" role="status">Enregistrement…</span>}
                <button type="button" className="pvv-mini" onClick={() => (lecteur.jouant === p.cle ? lecteur.arreter() : lecteur.lire(p.cle, [p.url]))} data-prise-ecouter>{lecteur.jouant === p.cle ? '⏸' : '▶'}</button>
                <button type="button" className="pvv-mini" onClick={() => setAConfirmer({ fichier: f.cle, prise: p.cle })} aria-label={`Supprimer la prise ${k + 1}`} data-prise-supprimer>Supprimer</button>
                {aConfirmer?.fichier === f.cle && aConfirmer.prise === p.cle && (
                  <span className="pvv-confirmer" role="alertdialog" data-prise-confirmer>Supprimer la prise {k + 1} ?
                    <button type="button" className="pvv-mini pvv-mini--danger" onClick={() => supprimerPrise(f.cle, p.cle)} data-prise-supprimer-oui>Supprimer</button>
                    <button type="button" className="pvv-mini" onClick={() => setAConfirmer(null)}>Garder</button></span>)}
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
export function LectureFichiersVocaux({ fichiers, url }: { fichiers: { nom: string; prises: { id: number; nom: string }[] }[]; url: (id: number) => string }) {
  const lecteur = useLecteur();
  return (
    <ol className="pvv-cr-fichiers">{fichiers.map((f, i) => {
      const cle = `f${i}`; const jouant = lecteur.jouant === cle;
      return (
        <li key={cle} className="pvv-fichier-vocal" data-cr-vocal={i + 1} data-cr-vocal-prises={f.prises.length}>
          <div className="pvv-photo-tete"><strong className="pvv-cr-legende" data-cr-vocal-nom>{f.nom}</strong>
            <span className="loc-muet">{f.prises.length} prise{f.prises.length > 1 ? 's' : ''}</span></div>
          <div className="pvv-photo-gestes pvv-vocal-gestes">
            <button type="button" className="pvv-mini" onClick={() => (jouant ? lecteur.arreter() : lecteur.lire(cle, f.prises.map((p) => url(p.id))))} data-cr-vocal-ecouter>{jouant ? '⏸ Pause' : '▶ Écouter'}</button>
          </div>
          <ol className="pvv-prises">{f.prises.map((p, k) => (
            <li key={p.id} className="pvv-prise" data-cr-prise={k + 1}><span>Prise {k + 1}</span>
              <button type="button" className="pvv-mini" onClick={() => (lecteur.jouant === `p${p.id}` ? lecteur.arreter() : lecteur.lire(`p${p.id}`, [url(p.id)]))}>{lecteur.jouant === `p${p.id}` ? '⏸' : '▶'}</button></li>))}</ol>
        </li>);
    })}</ol>
  );
}

/** Ce qui part avec l'envoi : les prises déposées et les fichiers (nom, prises dans l'ordre). PUR. */
export function vocauxPourEnvoi(fichiers: readonly FichierVocal[]): { vocaux: number[]; fichiersVocaux: { nom: string; ids: number[] }[] } {
  const fichiersVocaux = fichiers.map((f, i) => ({ nom: f.nom.trim() || `Vocal ${i + 1}`, ids: f.prises.filter((p) => p.id !== null).map((p) => p.id as number) }))
    .filter((f) => f.ids.length > 0);
  return { vocaux: fichiersVocaux.flatMap((f) => f.ids), fichiersVocaux };
}

/** L'insertion d'une transcription de fichier vocal (avec la mention) : réexportée pour l'écran. */
export { insererTranscription };

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement. */
export const CSS_COMPTE_RENDU_SAISIE = `
.pvv-bloc{border:1px solid var(--color-svv-line);border-radius:14px;padding:12px;margin:14px 0 0;display:flex;flex-direction:column;gap:10px;min-width:0}
.pvv-bloc--texte{background:color-mix(in srgb, var(--color-svv-green) 5%, var(--color-svv-surface))}
.pvv-bloc--photos{background:color-mix(in srgb, var(--color-svv-ink) 4%, var(--color-svv-surface))}
.pvv-bloc--dictaphone{background:color-mix(in srgb, var(--color-svv-red) 4%, var(--color-svv-surface))}
.pvv-bloc-tete{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pvv-bloc-titre{margin:0;font-size:1.05rem;font-weight:900;letter-spacing:.01em}
.pvv-requis{color:var(--color-svv-red)}
.pvv-texte{width:100%;box-sizing:border-box;min-height:9.5em;resize:vertical;font:inherit;font-size:16px;line-height:1.5;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);overflow:hidden}
.pvv-boite-cr .pvv-texte{min-height:9.5em}
.pvv-texte-boutons{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pvv-gros{min-height:56px;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:1rem;font-weight:800;padding:0 10px}
.pvv-maintien{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;cursor:pointer}
.pvv-maintien.svv-btn{background:var(--color-svv-ink);color:var(--color-svv-surface);border:0}
.pvv-maintien--actif,.pvv-maintien--actif.svv-btn{background:var(--color-svv-red);color:var(--color-svv-surface);animation:pvv-pulsation 1.1s ease-in-out infinite}
@keyframes pvv-pulsation{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--color-svv-red) 55%, transparent)}70%{box-shadow:0 0 0 14px color-mix(in srgb, var(--color-svv-red) 0%, transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--color-svv-red) 0%, transparent)}}
@media (prefers-reduced-motion: reduce){.pvv-maintien--actif,.pvv-maintien--actif.svv-btn{animation:none}}
.pvv-point{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--color-svv-surface)}
.pvv-chrono{font-variant-numeric:tabular-nums}
.pvv-statut{margin:0;font-style:italic}
.pvv-segments{display:inline-flex;gap:6px}
.pvv-carrousel-nav{display:flex;align-items:center;justify-content:center;gap:12px}
.pvv-indicateur{min-width:3.5em;text-align:center;font-weight:800;font-variant-numeric:tabular-nums}
.pvv-carrousel{flex-direction:row !important;overflow-x:auto;scroll-snap-type:x mandatory;gap:0 !important;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.pvv-carrousel > li{flex:0 0 100%;box-sizing:border-box;scroll-snap-align:start}
.pvv-confirmer{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:2px solid var(--color-svv-red);background:color-mix(in srgb, var(--color-svv-red) 6%, var(--color-svv-surface));font-weight:700}
.pvv-mini--danger{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.pvv-dictaphone{display:flex;flex-direction:column;align-items:center;gap:8px}
.pvv-rond{width:96px;height:96px;min-width:72px;min-height:72px;border-radius:999px;border:0;background:var(--color-svv-ink);color:var(--color-svv-surface);font:inherit;font-size:.72rem;font-weight:800;line-height:1.15;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px;text-align:center}
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
.pvv-cr-fichiers{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
/* le formulaire du compte rendu : fond OPAQUE (rien de la page derriere ne transparait), boutons en FIN de formulaire (plus colles en bas) */
.pvv-voile-cr{background:var(--color-svv-surface);z-index:200}
.pvv-boite-cr .mis-actions{position:static;margin:18px 0 0;padding:12px 0 0;border-top:1px solid var(--color-svv-line);background:transparent}
@media (max-width:640px){
  .pvv-voile-cr .mis-boite{min-height:100%;border-radius:0;box-shadow:none}
  .pvv-boite-cr .mis-actions{margin:18px 0 0;padding:12px 0 calc(12px + env(safe-area-inset-bottom))}
}
`;
