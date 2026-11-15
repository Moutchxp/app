'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as KeyboardEventReact, type PointerEvent as PointerEventReact } from 'react';
import { envoyer, useLecture } from './commun';
import { erreurReseau, groupeDe, listerAttente, mettreEnAttente, retirerAttente } from '../../../../lib/location/fileAttenteLocale';
import { useContextePreavis } from './preavisSynchro';
import { Icone } from './IconesCompteRendu';
import { arreterLecture, basculerLecture, etatLecture, useLecteurVocal, type Piste } from './lecteurVocal';
import { normaliserPrise } from '../../../../lib/location/normalisationVocal';
import { lignePhoto } from '../../../../lib/location/photosCompteRendu';
import { dureeFr, etatVocalLocataires, insererDictee, insererTranscription, MENTION_TRANSCRIT, PRISE_MIN_MS, VOCAL_DUREE_MAX_S } from '../../../../lib/location/vocauxCompteRendu';
import { appliquerTirets, insererEntree, themeBascule, tiretApresRetour } from '../../../../lib/location/texteCompteRendu';
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
export const MESSAGE_PRISE_VIDE = 'L’enregistrement est vide : rien n’a été capté. Réessayez en maintenant le bouton pendant que vous parlez.';
export const MESSAGE_MICRO_PRET = 'Micro autorisé : maintenez de nouveau le bouton appuyé pendant que vous parlez.';

/** Enregistre TANT QUE le bouton est maintenu ; au relâchement, rend la prise (≥ 0,5 s) à `onPrise`. Ne lève jamais. */
export function useEnregistrementMaintenu(onPrise: (blob: Blob, type: string, dureeMs: number) => void): {
  etat: EtatMaintien; dureeMs: number; message: string | null; appuyer: () => void; relacher: () => void; effacerMessage: () => void } {
  const [etat, setEtat] = useState<EtatMaintien>('repos');
  const [dureeMs, setDureeMs] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const voulu = useRef(false);
  const rec = useRef<{ r: MediaRecorder; flux: MediaStream; morceaux: Blob[]; debut: number; type: string; livre: boolean } | null>(null);
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
      // le micro reste ouvert (gardé tant que la page est visible) ; rien n'a été enregistré
      if (!voulu.current) { setEtat('repos'); setMessage(MESSAGE_MICRO_PRET); return; }
      const x = { r: o.r, flux: o.flux, morceaux: [] as Blob[], debut: Date.now(), type: o.type, livre: false };
      o.r.ondataavailable = (e) => { if (e.data && e.data.size > 0) x.morceaux.push(e.data); };
      o.r.onstop = () => {
        // 🔴 (7e retour) le micro n'est PAS refermé : il est gardé pour l'appui suivant (relâché en arrière-plan)
        const ms = Date.now() - x.debut;
        rec.current = null; setEtat('repos'); setDureeMs(0);
        if (x.livre) return; // déjà finalisée au passage en arrière-plan
        if (ms < PRISE_MIN_MS) { setMessage(MESSAGE_APPUI_BREF); return; }
        const blob = new Blob(x.morceaux, { type: x.type });
        // 🔴 (9e retour) une prise SANS contenu n'est jamais gardée ni oubliée en silence : c'est dit
        if (blob.size === 0) { setMessage(MESSAGE_PRISE_VIDE); return; }
        priseRef.current(blob, x.type, ms);
      };
      rec.current = x;
      try { o.r.start(250); } catch { rec.current = null; setEtat('repos'); setMessage('L’enregistrement n’a pas pu démarrer sur cet appareil.'); return; }
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
  /* 🔴🔴 Arno (15/11/2026, 9e retour) — MISE EN VEILLE OU FERMETURE PENDANT UNE PRISE : la page va être suspendue, la fin normale de
     l'enregistrement (onstop) risque de ne jamais arriver. La prise est FINALISÉE TOUT DE SUITE avec ce qui a déjà été capté (morceaux livrés
     toutes les 250 ms) et remise aussitôt (le formulaire l'écrit d'abord dans le téléphone) ; la fin normale est alors ignorée. */
  useEffect(() => {
    if (etat === 'repos') return;
    const urgence = (e: Event): void => {
      if (e.type === 'visibilitychange' && document.visibilityState !== 'hidden') return;
      const x = rec.current;
      if (x === null || x.livre) { relacher(); return; }
      try { x.r.requestData(); } catch { /* rien */ }
      const ms = Date.now() - x.debut;
      const blob = new Blob(x.morceaux, { type: x.type });
      if (ms >= PRISE_MIN_MS && blob.size > 0) { x.livre = true; priseRef.current(blob, x.type, ms); }
      relacher();
    };
    document.addEventListener('visibilitychange', urgence, true);
    window.addEventListener('pagehide', urgence, true);
    return () => { document.removeEventListener('visibilitychange', urgence, true); window.removeEventListener('pagehide', urgence, true); };
  }, [etat, relacher]);
  useEffect(() => () => { voulu.current = false; const x = rec.current; if (x) { try { x.r.stop(); } catch { /* rien */ } } }, []);
  return { etat, dureeMs, message, appuyer, relacher, effacerMessage: () => setMessage(null) };
}

/**
 * Le bouton « maintenir » : pointer events, aucun menu, aucune sélection, aucun zoom.
 * 🔴🔴 Arno (15/11/2026, 7e retour) — APPUI CONTINU GARANTI : tant que le doigt reste posé, l'enregistrement ne s'interrompt JAMAIS.
 * CAUSE des arrêts constatés doigt posé : au contact, le bouton RELÂCHAIT la capture du doigt (ancienne règle « doigt sorti du bouton =
 * arrêt ») ; le moindre glissement hors des 44 px du micro déclenchait `pointerleave` → arrêt, et `pointercancel` (geste repris par le
 * navigateur) aussi. Désormais : le doigt est CAPTURÉ (`setPointerCapture`), `touch-action: none` ; ni `pointerleave` ni `pointercancel`
 * n'arrêtent ; l'arrêt vient UNIQUEMENT du retrait du doigt (pointerup sur le bouton ou n'importe où, touchend sans plus aucun doigt) ou du
 * passage de la page en arrière-plan. Rouge et pulsation dès le contact, sans attendre le micro.
 */
export function BoutonMaintenir({ etat, dureeMs, repos, actif, rond = false, onAppui, onRelache, className, attributs }: {
  etat: EtatMaintien; dureeMs: number; repos: React.ReactNode; actif: React.ReactNode;
  /** le bouton rond du dictaphone : l'icône seule (la durée est affichée SOUS le bouton) */
  rond?: boolean; onAppui: () => void; onRelache: () => void; className: string; attributs: Record<string, string> }) {
  const relache = useRef(onRelache);
  useEffect(() => { relache.current = onRelache; }, [onRelache]);
  const desarmer = useRef<(() => void) | null>(null);
  /** le retrait du doigt, où qu'il se produise, et l'arrière-plan : les SEULES fins d'un appui */
  const armer = (pointeur: number): void => {
    desarmer.current?.();
    const fin = (): void => { desarmer.current?.(); relache.current(); };
    const haut = (e: PointerEvent): void => { if (e.pointerId === pointeur || e.pointerType === 'mouse') fin(); };
    const doigts = (e: TouchEvent): void => { if (e.touches.length === 0) fin(); };
    const cache = (): void => { if (document.visibilityState === 'hidden') fin(); };
    window.addEventListener('pointerup', haut, true); window.addEventListener('touchend', doigts, true); window.addEventListener('mouseup', fin, true);
    document.addEventListener('visibilitychange', cache); window.addEventListener('pagehide', fin);
    desarmer.current = () => {
      window.removeEventListener('pointerup', haut, true); window.removeEventListener('touchend', doigts, true); window.removeEventListener('mouseup', fin, true);
      document.removeEventListener('visibilitychange', cache); window.removeEventListener('pagehide', fin);
      desarmer.current = null;
    };
  };
  useEffect(() => () => desarmer.current?.(), []);
  const bas = (e: PointerEventReact<HTMLButtonElement>): void => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* rien */ }
    armer(e.pointerId);
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
      onPointerDown={bas} onPointerUp={() => { desarmer.current?.(); onRelache(); }}
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
/**
 * 🔴 Arno (15/11/2026) — UN CHAMP D'UNE LIGNE AVEC SON MICRO (légende d'une photo, titre d'un fichier vocal) : le liseré d'un champ de saisie,
 * le petit bouton micro rond à droite DANS le champ (« Maintenir pour dicter … »), la dictée insérée au curseur de CE champ, sans ouvrir le
 * clavier ; le texte ne passe jamais sous le bouton.
 */
export function ChampAvecMicro({ libelle, libelleVisible, valeur, max, placeholder, invalide = false, occupationIds, onChange, onOccupe, attributsChamp, attributsMicro, classe = '', remplacer = false }: {
  libelle: string; libelleVisible: boolean; valeur: string; max: number; placeholder?: string; invalide?: boolean; occupationIds: readonly number[];
  onChange: (f: (v: string) => string) => void; onOccupe: (occupe: boolean) => void;
  attributsChamp: Record<string, string>; attributsMicro: Record<string, string>; classe?: string;
  /** 🔴 Arno (15/11/2026, 8e retour) — la dictée REMPLACE tout le champ (titre d'un fichier vocal) au lieu de s'insérer au curseur ; vide : rien ne change */
  remplacer?: boolean }) {
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
      if (remplacer) {
        // 🔴 (8e retour) le titre dicté remplace l'ancien (« Vocal 2 » + « salle de bain » → « Salle de bain ») ; une dictée vide ne change rien
        const t = titreDicte(r.texte, max);
        if (t !== '') { curseur.current = t.length; onChange(() => t); }
        return;
      }
      const p = curseur.current; // lu AVANT la mise à jour (rejouée en développement)
      onChange((l) => { const x = insererDictee(l, p, r.texte); const t = x.texte.slice(0, max); curseur.current = Math.min(x.curseur, t.length); return t; });
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
      <label className={`pvs-champ pvv-legende${classe ? ` ${classe}` : ''}`}><span className={libelleVisible ? 'pvs-libelle' : 'pvv-lu'}>{libelle}</span>
        <span className="pvv-legende-cadre">
          <input type="text" className="pvv-legende-champ" value={valeur} maxLength={max} placeholder={placeholder} aria-invalid={invalide} autoComplete="off" autoCapitalize="sentences" enterKeyHint="done"
            onChange={(e) => { const v = e.target.value; curseur.current = e.target.selectionStart; onChange(() => v); }} onSelect={noter} onKeyUp={noter} onClick={noter} onBlur={noter} {...attributsChamp} />
          <BoutonMaintenir etat={dictee.etat} dureeMs={dictee.dureeMs} rond repos={<Icone nom="micro" taille={20} />} actif={<Icone nom="micro" taille={20} />}
            onAppui={dictee.appuyer} onRelache={dictee.relacher} className="pvv-maintien pvv-micro-legende" attributs={attributsMicro} />
        </span>
      </label>
      {transcription && <span className="loc-muet pvv-statut" role="status" data-legende-transcription>transcription…</span>}
      {dictee.message !== null && <span className="pvv-photo-motif" role="alert" data-legende-message>{dictee.message}</span>}
      {motif !== null && <span className="pvv-photo-motif" role="alert" data-legende-motif>{motif}</span>}
    </div>
  );
}

/** 🔴 Arno (15/11/2026, 8e retour) — un TITRE dicté : propre, sans point final, première lettre en capitale, borné ; vide : chaîne vide. PUR. */
export function titreDicte(dicte: string, max: number): string {
  const t = dicte.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '').trim();
  return t === '' ? '' : `${t.charAt(0).toLocaleUpperCase('fr-FR')}${t.slice(1)}`.slice(0, max);
}

/** Le champ de légende d'une photo (et son micro). */
export function ChampLegende({ rang, valeur, invalide, occupationIds, onChange, onOccupe }: {
  rang: number; valeur: string; invalide: boolean; occupationIds: readonly number[];
  onChange: (f: (legende: string) => string) => void; onOccupe: (occupe: boolean) => void }) {
  return (
    // 🔴 Arno (15/11/2026, 10e retour) — la dictée REMPLACE la légende (capitale, sans point final), comme pour les titres de vocaux ;
    // dictée vide ou échouée : la légende d'avant reste. Seul le bloc Texte insère au curseur.
    <ChampAvecMicro libelle={`Légende de la photo ${rang} *`} libelleVisible valeur={valeur} max={LEGENDE_MAX} placeholder="ex. Rayure parquet chambre" invalide={invalide}
      occupationIds={occupationIds} onChange={onChange} remplacer onOccupe={onOccupe} attributsChamp={{ 'data-photo-legende': '' }}
      attributsMicro={{ 'aria-label': `Maintenir pour dicter la légende de la photo ${rang}`, title: 'Maintenir pour dicter la légende', 'data-dicter-legende': String(rang) }} />
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
      <h3 id={titreId} className="pvv-bloc-titre pvv-titre-encart">Présence <span className="pvv-requis">*</span></h3>
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
      // 🔴 (7e retour) le curseur est lu AVANT la mise à jour : React rejoue la fonction de mise à jour en développement ; relire un curseur
      // déjà déplacé insérait au mauvais endroit
      const p = lireCurseur();
      setCorps((c) => { const x = insererDictee(c, p, t); const y = appliquerTirets(x.texte, x.curseur); noterCurseur(y.curseur); replacer.current = true; return y.texte; });
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
  /* 🔴 Arno (15/11/2026, 6e retour) — l'état du bouton suit le clavier RÉEL : fermé autrement (bouton de la barre iOS, appui ailleurs,
     défilement), la zone visible reprend sa hauteur : le champ est quitté et le bouton redevient blanc. Blanc = fermé, rouge = ouvert. */
  const vuOuvert = useRef(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const verifier = (): void => {
      if (window.innerHeight - vv.height > 120) { vuOuvert.current = true; return; }
      if (!vuOuvert.current) return;
      vuOuvert.current = false;
      const t = zone.current;
      if (t && document.activeElement === t) { noterCurseur(t.selectionStart); t.blur(); }
      setClavier(false);
    };
    vv.addEventListener('resize', verifier);
    return () => vv.removeEventListener('resize', verifier);
  }, [noterCurseur]);
  // un appui AILLEURS (hors du champ et des boutons du texte) : WebKit garde le focus du champ ; on le quitte, le clavier se ferme, le bouton redevient blanc
  useEffect(() => {
    if (!clavier) return;
    const ailleurs = (e: PointerEvent): void => {
      const t = zone.current; const cible = e.target as Element | null;
      if (!t || !cible || t.contains(cible) || cible.closest?.('[data-clavier],[data-entree],[data-dicter]')) return;
      if (document.activeElement === t) { noterCurseur(t.selectionStart); t.blur(); }
    };
    document.addEventListener('pointerdown', ailleurs, true);
    return () => document.removeEventListener('pointerdown', ailleurs, true);
  }, [clavier, noterCurseur]);
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
  /* 🔴🔴 Arno (15/11/2026, 7e retour) — UN APPUI = UN SEUL RETOUR À LA LIGNE. Causes du double retour : (1) la fonction de mise à jour relisait
     le curseur qu'elle venait de déplacer, et React la rejoue (développement) ; (2) un même toucher peut livrer deux activations (contact puis
     clic de compatibilité). Le curseur est lu une fois, avant ; et une seconde activation dans la même demi-seconde est ignorée. */
  const derniereEntree = useRef(0);
  const entree = (): void => {
    const t = Date.now();
    if (t - derniereEntree.current < 450) return;
    derniereEntree.current = t;
    const p = lireCurseur();
    setCorps((c) => { const x = insererEntree(c, p); noterCurseur(x.curseur); replacer.current = true; return x.texte; });
  };
  /** un bouton qui ne doit PAS faire perdre (ni prendre) le focus du champ */
  const sansFocus = { onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(), onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() };
  const titreId = useId();
  return (
    <section className="pvv-bloc pvv-bloc--texte" aria-labelledby={titreId} data-bloc-texte>
      <div className="pvv-bloc-tete">
        <h3 id={titreId} className="pvv-bloc-titre pvv-titre-encart">Texte <span className="pvv-requis">*</span></h3>
        <button type="button" className="pvv-mini pvv-entree" {...sansFocus} onClick={entree} aria-label="Aller à la ligne" title="Aller à la ligne" data-entree><Icone nom="entree" taille={22} /></button>
      </div>
      <textarea ref={zone} className="pvv-texte" value={corps} rows={6} aria-labelledby={titreId} autoComplete="off" autoCapitalize="sentences" autoCorrect="on" spellCheck enterKeyHint="enter" placeholder="ex. Logement propre, rayure du parquet de la chambre… (dictez ou tapez)"
        onChange={(e) => {
          // 🔴 la règle des tirets s'applique à la frappe ; le retour à la ligne du clavier pose le tiret TOUT DE SUITE (comme « Entrée ») ; le curseur suit
          const type = (e.nativeEvent as InputEvent).inputType;
          const x = type === 'insertLineBreak' || type === 'insertParagraph' ? tiretApresRetour(e.target.value, e.target.selectionStart) : appliquerTirets(e.target.value, e.target.selectionStart);
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
/** 🔴 Arno (15/11/2026) — `attente` : pas encore déposée (réseau coupé) ; gardée dans le téléphone, renvoyée automatiquement. */
export interface PhotoSaisie { cle: string; id: number | null; apercu: string; legende: string; etat: 'envoi' | 'attente' | 'ok' | 'erreur' | 'perdue'; motif: string | null }
/** 🔴🔴 Arno (15/11/2026, 9e retour) — une pièce référencée qu'on ne retrouve ni sur le serveur ni dans le téléphone : signalée, ROUGE, bloquante. */
export const MOTIF_PHOTO_PERDUE = 'Photo vide ou perdue — à reprendre (supprimez-la, puis ajoutez-la de nouveau).';
export const MOTIF_PRISE_PERDUE = 'Le son de cette prise n’a pas été retrouvé : supprimez-la, puis réenregistrez-la.';
/** 🔴🔴 (9e retour) — l'état visible d'une pièce : en cours (gris), sauvegardée (discret), vide ou perdue (ROUGE). PUR. */
export type StatutPiece = 'en_cours' | 'sauvegardee' | 'perdue';
export const statutPiece = (etat: PhotoSaisie['etat'] | PriseVocale['etat']): StatutPiece =>
  (etat === 'ok' ? 'sauvegardee' : etat === 'erreur' || etat === 'perdue' ? 'perdue' : 'en_cours');
export const STATUT_PIECE: Record<StatutPiece, { libelle: string; classe: string }> = {
  en_cours: { libelle: 'Sauvegarde en cours…', classe: 'loc-muet pvv-statut-piece' },
  sauvegardee: { libelle: 'Sauvegardée', classe: 'loc-muet pvv-statut-piece pvv-statut-piece--ok' },
  perdue: { libelle: 'Vide ou perdue — à réenregistrer', classe: 'pvv-statut-piece pvv-statut-piece--perdue' },
};
/**
 * 🔴🔴 Arno (15/11/2026, 9e retour) — CE QUI EMPÊCHE LE RÉCAPITULATIF ET L'ENVOI : chaque photo ou prise pas encore confirmée par le serveur,
 * ou vide ou perdue, NOMMÉE (« Photo 2 », « Prise 3 de « Salle de bain » »). Liste vide : rien ne bloque. PUR.
 */
export function piecesBloquantes(photos: readonly Pick<PhotoSaisie, 'etat'>[], fichiers: readonly Pick<FichierVocal, 'nom' | 'prises'>[]): { enCours: string[]; perdues: string[] } {
  const enCours: string[] = []; const perdues: string[] = [];
  photos.forEach((x, i) => { const s = statutPiece(x.etat); if (s === 'en_cours') enCours.push(`Photo ${i + 1}`); else if (s === 'perdue') perdues.push(`Photo ${i + 1}`); });
  fichiers.forEach((f, i) => f.prises.forEach((p, k) => {
    const n = `Prise ${k + 1} de « ${f.nom.trim() || `Vocal ${i + 1}`} »`;
    const s = statutPiece(p.etat); if (s === 'en_cours') enCours.push(n); else if (s === 'perdue') perdues.push(n);
  }));
  return { enCours, perdues };
}
const listeFr = (xs: readonly string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`);
/** Le message du refus, ou null. PUR. */
export function motifPiecesBloquantes(b: { enCours: string[]; perdues: string[] }): string | null {
  const m: string[] = [];
  if (b.perdues.length > 0) m.push(`${listeFr(b.perdues)} : vide${b.perdues.length > 1 ? 's' : ''} ou perdue${b.perdues.length > 1 ? 's' : ''} — supprimez-l${b.perdues.length > 1 ? 'es' : 'a'} (et refaites-l${b.perdues.length > 1 ? 'es' : 'a'}) avant d’envoyer.`);
  if (b.enCours.length > 0) m.push(`${listeFr(b.enCours)} : sauvegarde en cours — attendez « Sauvegardée ».`);
  return m.length === 0 ? null : m.join(' ');
}
/** L'empreinte SHA-256 (hexadécimal) d'un enregistrement, ou null si l'appareil ne sait pas la calculer (page hors HTTPS). */
export async function empreinteSha256(b: Blob): Promise<string | null> {
  try {
    const s = globalThis.crypto?.subtle; if (!s) return null;
    const h = new Uint8Array(await s.digest('SHA-256', await b.arrayBuffer()));
    return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
export const MOTIF_ATTENTE_PHOTO = 'En attente du réseau — gardée sur cet appareil, envoyée automatiquement au retour du réseau.';
export const MOTIF_ATTENTE_PRISE = 'En attente du réseau — gardée sur cet appareil, enregistrée automatiquement au retour du réseau.';
const RELANCE_MS = 15_000;
/** Le retour du réseau et une relance régulière tant que quelque chose attend. */
function useRelance(enAttente: boolean, relancer: () => void): void {
  const f = useRef(relancer);
  useEffect(() => { f.current = relancer; }, [relancer]);
  useEffect(() => {
    const auRetour = (): void => f.current();
    window.addEventListener('online', auRetour);
    return () => window.removeEventListener('online', auRetour);
  }, []);
  useEffect(() => {
    if (!enAttente) return;
    const t = setInterval(() => f.current(), RELANCE_MS);
    return () => clearInterval(t);
  }, [enAttente]);
}
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
  // 🔴 Arno (15/11/2026) — chaque photo est gardée DANS LE TÉLÉPHONE avant d'être déposée, et le reste tant que le serveur n'a pas confirmé ;
  // réseau coupé : « en attente », renvoyée automatiquement (retour du réseau, relance régulière, réouverture de la page).
  const groupe = groupeDe(occupationIds);
  const blobs = useRef(new Map<string, Blob>());
  const encours = useRef(new Set<string>());
  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  const deposer = async (cle: string): Promise<void> => {
    const blob = blobs.current.get(cle);
    if (!blob || encours.current.has(cle)) return;
    encours.current.add(cle);
    try {
      let donnees = '';
      try { donnees = await (await modulePhoto()).enBase64(blob); } catch { maj(cle, (x) => ({ ...x, etat: 'erreur', motif: 'La photo n’a pas pu être préparée sur cet appareil.' })); return; }
      maj(cle, (x) => ({ ...x, etat: 'envoi', motif: null }));
      const deja = await dejaDeposees();
      const r = await envoyer({ action: 'photo-compte-rendu', occupationIds: [...occupationIds], donnees, dejaIds: deja }, { propre: true });
      const id = (r.data as { id?: number } | undefined)?.id;
      if (r.motif === null && typeof id === 'number') { maj(cle, (x) => ({ ...x, id, etat: 'ok', motif: null })); await retirerAttente(groupe, cle); blobs.current.delete(cle); return; }
      if (erreurReseau(r)) { maj(cle, (x) => ({ ...x, etat: 'attente', motif: MOTIF_ATTENTE_PHOTO })); return; }
      await retirerAttente(groupe, cle); blobs.current.delete(cle);
      maj(cle, (x) => ({ ...x, etat: 'erreur', motif: r.motif ?? 'La photo n’a pas pu être déposée.' }));
    } finally { encours.current.delete(cle); }
  };
  const relancer = useCallback((): void => {
    for (const x of photosRef.current) if (x.etat === 'attente' && x.id === null) void deposer(x.cle);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // à l'ouverture : les photos restées dans le téléphone (page rechargée, réseau coupé) reviennent dans le formulaire, puis repartent
  useEffect(() => {
    let vivant = true;
    void listerAttente(groupe).then((xs) => {
      if (!vivant) return;
      const lp = xs.filter((e) => e.sorte === 'photo');
      if (lp.length === 0) return;
      for (const e of lp) blobs.current.set(e.cle, e.blob);
      onChange((cur) => {
        const out = cur.map((x) => { const e = lp.find((y) => y.cle === x.cle); return e && x.id === null ? { ...x, apercu: x.apercu || URL.createObjectURL(e.blob), etat: 'attente' as const, motif: MOTIF_ATTENTE_PHOTO } : x; });
        for (const e of lp) if (!out.some((x) => x.cle === e.cle)) out.push({ cle: e.cle, id: null, apercu: URL.createObjectURL(e.blob), legende: e.legende ?? '', etat: 'attente', motif: MOTIF_ATTENTE_PHOTO });
        return out;
      });
      setTimeout(() => relancer(), 0);
    });
    return () => { vivant = false; };
  }, [groupe]); // eslint-disable-line react-hooks/exhaustive-deps
  useRelance(photos.some((x) => x.etat === 'attente'), relancer);
  const ajouter = async (liste: FileList | null): Promise<void> => {
    for (const f of [...(liste ?? [])]) {
      const cle = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      onChange((xs) => [...xs, { cle, id: null, apercu: '', legende: '', etat: 'envoi', motif: null }]);
      let c: Awaited<ReturnType<Awaited<ReturnType<typeof modulePhoto>>['convertirPhoto']>>;
      try { c = await (await modulePhoto()).convertirPhoto(f); } catch { c = { ok: false, motif: `« ${f.name} » : la photo n’a pas pu être préparée sur cet appareil.` }; }
      if (!c.ok) { const motif = c.motif; maj(cle, (x) => ({ ...x, etat: 'erreur', motif })); continue; }
      const apercu = URL.createObjectURL(c.blob);
      maj(cle, (x) => ({ ...x, apercu }));
      blobs.current.set(cle, c.blob);
      await mettreEnAttente(groupe, { cle, sorte: 'photo', blob: c.blob, type: c.blob.type || 'image/jpeg', creeLe: new Date().toISOString() });
      await deposer(cle);
    }
  };
  const deplacer = (i: number, d: -1 | 1) => onChange((xs) => { const x = [...xs]; const j = i + d; if (j < 0 || j >= x.length) return xs; [x[i], x[j]] = [x[j], x[i]]; return x; });
  const retirer = (cle: string) => {
    const p = photos.find((x) => x.cle === cle); if (p?.apercu) URL.revokeObjectURL(p.apercu);
    blobs.current.delete(cle); void retirerAttente(groupe, cle);
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
        <h3 id={titreId} className="pvv-bloc-titre pvv-titre-encart">Photos {photos.length > 0 && <span className="loc-muet">({photos.length})</span>}</h3>
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
              <li key={x.cle} className={`pvv-photo${sansLegende ? ' pvv-photo--erreur' : ''}${x.etat === 'erreur' || x.etat === 'perdue' ? ' pvv-photo--echec' : ''}`} data-photo={i + 1} data-photo-etat={x.etat}
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
                {x.etat === 'attente' && <span className="pvv-attente" role="status" data-photo-attente>{x.motif}</span>}
                {(x.etat === 'erreur' || x.etat === 'perdue') && <span className="pvv-photo-motif" role="alert" data-photo-perdue={x.etat === 'perdue' ? '' : undefined}>{x.motif}</span>}
                <ChampLegende rang={i + 1} valeur={x.legende} invalide={sansLegende} occupationIds={occupationIds}
                  onChange={(f) => maj(x.cle, (y) => {
                    const legende = f(y.legende);
                    // une photo pas encore déposée : sa légende est gardée avec elle dans le téléphone
                    const b = blobs.current.get(y.cle);
                    if (y.id === null && b) void mettreEnAttente(groupe, { cle: y.cle, sorte: 'photo', blob: b, type: b.type || 'image/jpeg', legende, creeLe: new Date().toISOString() });
                    return { ...y, legende };
                  })} onOccupe={(o) => occuper(x.cle, o)} />
                {sansLegende && x.etat !== 'erreur' && x.etat !== 'perdue' && <span className="pvv-photo-motif" role="alert" data-photo-legende-requise>Légende obligatoire avant l’envoi.</span>}
              </li>);
          })}
        </ol>
      </>}
    </section>
  );
}

/* ══ BLOC DICTAPHONE ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une prise du dictaphone : sa réécoute (sur l'appareil) et sa pièce déposée (`id`, interne). */
export interface PriseVocale { cle: string; id: number | null; url: string; dureeS: number; etat: 'depot' | 'attente' | 'ok' | 'erreur' | 'perdue'; motif: string | null;
  /** 🔴 (9e retour) le niveau a été normalisé (crête à −1 dBFS) avant le dépôt */
  normalisee?: boolean }
/** Un fichier vocal : un nom (renommable) et ses prises, dans l'ordre. */
export interface FichierVocal { cle: string; nom: string; prises: PriseVocale[]; transcription: 'en_cours' | 'ok' | 'echec' | null; motif: string | null;
  /** 🔴 Arno (15/11/2026) — « Envoyé aux locataires » : défaut NON (le fichier reste interne). */
  locataires?: boolean }

export const fichierVide = (rang: number): FichierVocal => ({ cle: nouvelleCle(), nom: `Vocal ${rang + 1}`, prises: [], transcription: null, motif: null, locataires: false });
export const dureeFichier = (f: FichierVocal): number => f.prises.reduce((s, p) => s + p.dureeS, 0);

/**
 * 🔴🔴 Arno (15/11/2026, 9e retour) — LE BOUTON « ÉCOUTER » de partout (cartes, prises, récapitulatif, consultation) : Lecture / Pause, le
 * lecteur UNIQUE de la page (`lecteurVocal.ts`) ; la lecture démarre au premier toucher. Jamais de menu de l'appui long (CSS).
 */
export function BoutonEcouter({ cle, pistes, classe, texte = false, etiquette, attributs }: { cle: string; pistes: readonly Piste[]; classe: string;
  /** avec le mot « Écouter » / « Pause » (sinon l'icône seule) */ texte?: boolean;
  etiquette?: (enLecture: boolean) => string; attributs?: Record<string, string | undefined> }) {
  const e = useLecteurVocal();
  const enLecture = e.cle === cle && e.enLecture;
  // le bouton disparaît (prise supprimée, fenêtre fermée) : sa lecture s'arrête
  useEffect(() => () => { if (etatLecture().cle === cle) arreterLecture(); }, [cle]);
  return (
    <button type="button" className={classe} disabled={pistes.every((p) => p.url === '')} aria-pressed={enLecture} aria-label={etiquette?.(enLecture)}
      onClick={() => basculerLecture(cle, pistes)} data-lecture-cle={cle} data-en-lecture={enLecture ? 'oui' : 'non'} {...attributs}>
      <Icone nom={enLecture ? 'pause' : 'lecture'} />{texte && ` ${enLecture ? 'Pause' : 'Écouter'}`}</button>
  );
}
/** « Lecture… 00:03 / 00:05 » et la barre, sous le vocal qui joue (ou est en pause) ; rien sinon. */
export function ProgressionLecture({ cles }: { cles: readonly string[] }) {
  const e = useLecteurVocal();
  if (e.cle === null || !cles.includes(e.cle)) return null;
  const pct = e.dureeS > 0 ? Math.max(0, Math.min(100, (e.positionS / e.dureeS) * 100)) : 0;
  return (
    <div className="pvv-lecture" role="status" data-lecture-progression={e.cle} data-lecture-etat={e.motif ? 'erreur' : e.enLecture ? 'lecture' : 'pause'}>
      <span className={e.motif ? 'pvv-photo-motif' : 'pvv-lecture-texte'} data-lecture-texte>{e.motif ?? `${e.enLecture ? 'Lecture…' : 'En pause'} ${dureeFr(e.positionS)} / ${dureeFr(e.dureeS)}`}</span>
      <span className="pvv-lecture-barre" role="progressbar" aria-label="Avancement de la lecture" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <span className="pvv-lecture-plein" style={{ width: `${pct}%` }} /></span>
    </div>
  );
}
const pistesDe = (prises: readonly { url: string; dureeS: number }[]): Piste[] => prises.filter((p) => p.url !== '').map((p) => ({ url: p.url, dureeS: p.dureeS }));

export function BlocDictaphone({ fichiers, setFichiers, occupationIds, onTranscrit, onOccupe, courant, setCourant }: {
  fichiers: FichierVocal[]; setFichiers: (f: (x: FichierVocal[]) => FichierVocal[]) => void; occupationIds: readonly number[];
  onTranscrit: (texte: string) => void; onOccupe: (occupe: boolean) => void;
  /** 🔴 Arno (15/11/2026, 8e retour) — le FICHIER ACTIF (destination des prochaines prises), tenu par le formulaire : il est mémorisé dans le brouillon */
  courant: string | null; setCourant: (cle: string | null) => void }) {
  const titreId = useId();
  const rond = useRef<HTMLDivElement | null>(null);
  const [aConfirmer, setAConfirmer] = useState<{ fichier: string; prise: string | null } | null>(null);
  const cleCourante = courant !== null && fichiers.some((f) => f.cle === courant) ? courant : (fichiers[fichiers.length - 1]?.cle ?? null);
  const majFichier = (cle: string, f: (x: FichierVocal) => FichierVocal) => setFichiers((xs) => xs.map((x) => (x.cle === cle ? f(x) : x)));
  const majPrise = (fc: string, pc: string, f: (x: PriseVocale) => PriseVocale) => majFichier(fc, (x) => ({ ...x, prises: x.prises.map((p) => (p.cle === pc ? f(p) : p)) }));
  // 🔴 Arno (15/11/2026) — chaque prise est gardée DANS LE TÉLÉPHONE avant d'être déposée, et le reste tant que le serveur n'a pas confirmé ;
  // réseau coupé : « en attente », renvoyée automatiquement (retour du réseau, relance régulière, réouverture de la page).
  const groupe = groupeDe(occupationIds);
  const enAttente = useRef(new Map<string, { fc: string; blob: Blob; type: string; dureeS: number; nom?: string }>());
  const encours = useRef(new Set<string>());
  const deposer = async (fc: string, pc: string, blob: Blob, type: string, dureeS: number): Promise<void> => {
    if (encours.current.has(pc)) return;
    encours.current.add(pc);
    try {
      majPrise(fc, pc, (p) => ({ ...p, etat: 'depot', motif: null }));
      const deja = await new Promise<number[]>((ok) => setFichiers((xs) => { ok(xs.flatMap((x) => x.prises).filter((p) => p.id !== null).map((p) => p.id as number)); return xs; }));
      let donnees: string;
      try { donnees = await (await modulePhoto()).enBase64(blob); } catch { majPrise(fc, pc, (p) => ({ ...p, etat: 'erreur', motif: 'La prise n’a pas pu être préparée sur cet appareil.' })); return; }
      // 🔴🔴 (9e retour) l'empreinte des octets : le serveur refuse ce qui n'est pas arrivé tel quel ; « Sauvegardée » seulement si elle concorde
      const local = await empreinteSha256(blob);
      const r = await envoyer({ action: 'vocal-compte-rendu', occupationIds: [...occupationIds], donnees, typeMime: type, dureeS, dejaIds: deja, ...(local ? { empreinte: local } : {}) }, { propre: true });
      const id = (r.data as { id?: number } | undefined)?.id;
      const recue = (r.data as { empreinte?: string } | undefined)?.empreinte;
      if (r.motif === null && typeof id === 'number' && local !== null && typeof recue === 'string' && recue !== local) {
        majPrise(fc, pc, (p) => ({ ...p, etat: 'attente', motif: MOTIF_ATTENTE_PRISE })); return; // gardée dans le téléphone, renvoyée
      }
      if (r.motif === null && typeof id === 'number') { majPrise(fc, pc, (p) => ({ ...p, id, etat: 'ok', motif: null })); enAttente.current.delete(pc); await retirerAttente(groupe, pc); return; }
      if (erreurReseau(r)) { majPrise(fc, pc, (p) => ({ ...p, etat: 'attente', motif: MOTIF_ATTENTE_PRISE })); return; }
      enAttente.current.delete(pc); await retirerAttente(groupe, pc);
      majPrise(fc, pc, (p) => ({ ...p, etat: 'erreur', motif: r.motif ?? 'La prise n’a pas pu être enregistrée.' }));
    } finally { encours.current.delete(pc); }
  };
  /* 🔴🔴 Arno (15/11/2026, 9e retour) — LE MÊME NIVEAU D'UNE PRISE À L'AUTRE : la prise (déjà gardée telle quelle dans le téléphone) est
     NORMALISÉE (crête à −1 dBFS), la version normalisée remplace l'originale dans le téléphone, PUIS elle est déposée. L'appareil ne sait
     pas : l'originale est déposée (jamais perdue). Une prise remise par le téléphone à la réouverture passe par le même chemin. */
  const normalisees = useRef(new Set<string>());
  const preparerEtDeposer = async (fc: string, pc: string, blob: Blob, type: string, dureeS: number): Promise<void> => {
    let b = blob; let t = type;
    if (!normalisees.current.has(pc) && !/^audio\/wav/i.test(type)) {
      normalisees.current.add(pc);
      const n = await normaliserPrise(blob);
      const e = enAttente.current.get(pc);
      if (n !== null && e !== undefined) {
        b = n.blob; t = n.type;
        enAttente.current.set(pc, { ...e, blob: b, type: t });
        await mettreEnAttente(groupe, { cle: pc, sorte: 'prise', blob: b, type: t, fichierCle: fc, fichierNom: e.nom, dureeS, creeLe: new Date().toISOString() });
        if (!enAttente.current.has(pc)) { await retirerAttente(groupe, pc); return; } // supprimée pendant l'écriture
        const url = URL.createObjectURL(b);
        majPrise(fc, pc, (p) => { try { if (p.url.startsWith('blob:')) URL.revokeObjectURL(p.url); } catch { /* rien */ } return { ...p, url, normalisee: true }; });
      }
      if (e === undefined) return; // supprimée pendant ce temps
    }
    await deposer(fc, pc, b, t, dureeS);
  };
  const relancer = useCallback((): void => {
    for (const [pc, e] of enAttente.current) void preparerEtDeposer(e.fc, pc, e.blob, e.type, e.dureeS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // à l'ouverture : les prises restées dans le téléphone reviennent dans leur fichier vocal, puis repartent
  useEffect(() => {
    let vivant = true;
    void listerAttente(groupe).then((xs) => {
      if (!vivant) return;
      const lp = xs.filter((e) => e.sorte === 'prise' && e.fichierCle);
      if (lp.length === 0) return;
      for (const e of lp) enAttente.current.set(e.cle, { fc: e.fichierCle as string, blob: e.blob, type: e.type, dureeS: e.dureeS ?? 0, nom: e.fichierNom });
      setFichiers((cur) => {
        const out = cur.map((f) => ({ ...f, prises: [...f.prises] }));
        for (const e of lp) {
          let f = out.find((x) => x.cle === e.fichierCle);
          if (!f) { f = { ...fichierVide(out.length), cle: e.fichierCle as string, nom: e.fichierNom || `Vocal ${out.length + 1}` }; out.push(f); }
          const deja = f.prises.find((p) => p.cle === e.cle);
          if (deja) { if (deja.id === null) Object.assign(deja, { url: deja.url || URL.createObjectURL(e.blob), etat: 'attente', motif: MOTIF_ATTENTE_PRISE }); }
          else f.prises.push({ cle: e.cle, id: null, url: URL.createObjectURL(e.blob), dureeS: e.dureeS ?? 0, etat: 'attente', motif: MOTIF_ATTENTE_PRISE });
        }
        return out;
      });
      setTimeout(() => relancer(), 0);
    });
    return () => { vivant = false; };
  }, [groupe]); // eslint-disable-line react-hooks/exhaustive-deps
  useRelance(fichiers.some((f) => f.prises.some((p) => p.etat === 'attente')), relancer);
  const prise = useEnregistrementMaintenu((blob, type, dureeMs) => {
    const dureeS = Math.min(dureeMs / 1000, VOCAL_DUREE_MAX_S);
    const pc = nouvelleCle(); const url = URL.createObjectURL(blob);
    let fc = cleCourante;
    if (fc === null) { const f = fichierVide(0); fc = f.cle; setFichiers((xs) => [...xs, f]); setCourant(f.cle); }
    const cible = fc;
    setFichiers((xs) => xs.map((x) => (x.cle === cible ? { ...x, prises: [...x.prises, { cle: pc, id: null, url, dureeS, etat: 'depot', motif: null }] } : x)));
    const nom = fichiers.find((x) => x.cle === cible)?.nom ?? `Vocal ${fichiers.length + 1}`;
    enAttente.current.set(pc, { fc: cible, blob, type, dureeS, nom });
    // 🔴 (9e retour) l'ordre garanti : la prise brute dans le téléphone D'ABORD, puis la normalisation, puis le dépôt vérifié
    void mettreEnAttente(groupe, { cle: pc, sorte: 'prise', blob, type, fichierCle: cible, fichierNom: nom, dureeS, creeLe: new Date().toISOString() })
      .then(() => preparerEtDeposer(cible, pc, blob, type, dureeS));
  });
  const [titresOccupes, setTitresOccupes] = useState<ReadonlySet<string>>(new Set());
  const occuperTitre = useCallback((cle: string, o: boolean) => setTitresOccupes((s) => {
    if (o === s.has(cle)) return s;
    const n = new Set(s); if (o) n.add(cle); else n.delete(cle); return n;
  }), []);
  // 🔴 (9e retour) une prise en cours de sauvegarde ou perdue ne grise plus le bouton : « Voir le récapitulatif » dit laquelle bloque
  const enCours = prise.etat !== 'repos' || titresOccupes.size > 0 || fichiers.some((f) => f.transcription === 'en_cours');
  useEffect(() => { onOccupe(enCours); }, [enCours, onOccupe]);
  // 🔴 (8e retour) « Nouveau fichier vocal » : créé, rendu actif, et l'écran défile jusqu'au gros bouton
  const nouveau = (): void => {
    const f = fichierVide(fichiers.length); setFichiers((xs) => [...xs, f]); setCourant(f.cle);
    setTimeout(() => { try { rond.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* rien */ } }, 0);
  };
  /** un appui n'importe où sur une carte (hors boutons et champs) la rend active */
  const choisirParLaCarte = (cle: string, e: { target: EventTarget | null }): void => {
    const t = e.target as Element | null;
    if (t?.closest?.('button,input,textarea,select,label,a,audio,[role="switch"]')) return;
    setCourant(cle);
  };
  const supprimerFichier = (fc: string): void => {
    const f = fichiers.find((x) => x.cle === fc);
    f?.prises.forEach((p) => { try { URL.revokeObjectURL(p.url); } catch { /* rien */ } enAttente.current.delete(p.cle); void retirerAttente(groupe, p.cle); });
    arreterLecture();
    // 🔴 (8e retour) le fichier ACTIF supprimé : le précédent devient actif (le suivant s'il n'y en a pas avant)
    if (fc === cleCourante) { const i = fichiers.findIndex((x) => x.cle === fc); const voisin = fichiers[i - 1] ?? fichiers[i + 1] ?? null; setCourant(voisin?.cle ?? null); }
    setFichiers((xs) => xs.filter((x) => x.cle !== fc)); setAConfirmer(null);
  };
  const supprimerPrise = (fc: string, pc: string): void => {
    const p = fichiers.find((x) => x.cle === fc)?.prises.find((y) => y.cle === pc);
    if (p) { try { URL.revokeObjectURL(p.url); } catch { /* rien */ } enAttente.current.delete(pc); void retirerAttente(groupe, pc); }
    arreterLecture();
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
      {/* 🔴 Arno (15/11/2026, 10e retour) — le titre est « Dictaphone » tout court (mention retirée avec son accord) : chaque carte dit son statut */}
      <h3 id={titreId} className="pvv-bloc-titre pvv-titre-encart">Dictaphone</h3>
      <div className="pvv-dictaphone" ref={rond}>
        {/* 🔴🔴 Arno (15/11/2026, 8e retour) — la DESTINATION toujours visible : une pastille par fichier (l'actif plein rouge) et « + Nouveau » */}
        {fichiers.length > 0 && (
          <div className="pvv-pastilles-vocaux" role="group" aria-label="Fichier où vont les prochaines prises" data-pastilles-vocaux>
            {fichiers.map((f, i) => (
              <button key={f.cle} type="button" className="pvv-choix pvv-pastille-vocal" aria-pressed={f.cle === cleCourante} title={f.nom.trim() || `Vocal ${i + 1}`}
                onClick={() => setCourant(f.cle)} disabled={prise.etat !== 'repos'} data-pastille-vocal={i + 1}>
                <span className="pvv-pastille-texte">{f.nom.trim() || `Vocal ${i + 1}`}</span></button>))}
            <button type="button" className="pvv-choix pvv-pastille-vocal pvv-pastille-nouveau" onClick={nouveau} disabled={prise.etat !== 'repos'} data-pastille-nouveau>
              <Icone nom="plus" taille={16} /> Nouveau</button>
          </div>)}
        {/* 🔴 Arno (15/11/2026) — le bouton rond : une grande icône de micro, rien d'autre ; ROUGE tant que le doigt est posé ; la durée SOUS le bouton */}
        <BoutonMaintenir etat={prise.etat} dureeMs={prise.dureeMs} repos={<Icone nom="micro" taille={44} />} actif={<Icone nom="micro" taille={44} />} rond
          onAppui={prise.appuyer} onRelache={prise.relacher} className="pvv-rond pvv-maintien" attributs={{ 'data-enregistrer-vocal': '', 'aria-label': 'Maintenir pour enregistrer' }} />
        {/* 🔴 (8e retour) sous le gros bouton : où va la prise (la durée pendant l'enregistrement) */}
        <span className="pvv-chrono pvv-rond-duree" role="timer" aria-live="off" data-rond-duree data-vocal-cible>{prise.etat !== 'repos' ? dureeFr(prise.dureeMs / 1000)
          : cleCourante === null ? 'La première prise crée « Vocal 1 »'
            : `Maintenir pour enregistrer dans « ${(() => { const i = fichiers.findIndex((f) => f.cle === cleCourante); return fichiers[i]?.nom.trim() || `Vocal ${i + 1}`; })()} »`}</span>
        {/* 🔴 Arno (15/11/2026, 7e retour) — même style, pleine largeur de l'encart */}
        <div className="pvv-nouveau-vocal"><button type="button" className="svv-btn svv-btn-outline pvv-gros" onClick={nouveau} disabled={prise.etat !== 'repos'} data-nouveau-vocal><Icone nom="plus" /> Nouveau fichier vocal</button></div>
      </div>
      {prise.message !== null && <p className="pvv-photo-motif" role="alert" data-vocal-micro>{prise.message}</p>}
      {fichiers.length > 0 && <ol className="pvv-fichiers">{fichiers.map((f, i) => {
        const estCourant = f.cle === cleCourante;
        return (
          <li key={f.cle} className={`pvv-fichier-vocal${estCourant ? ' pvv-fichier-vocal--courant' : ''}`} data-vocal={i + 1} data-vocal-prises={f.prises.length}
            data-vocal-transcription={f.transcription ?? undefined} data-vocal-actif={estCourant ? 'oui' : 'non'} onClick={(e) => { if (!estCourant) choisirParLaCarte(f.cle, e); }}>
            {estCourant && <p className="pvv-fichier-actif-etiquette" data-fichier-actif-etiquette>Les prochaines prises vont ici</p>}
            {/* 🔴 Arno (15/11/2026, 6e retour) — le titre du fichier vocal : le même petit micro à droite dans le champ que pour les légendes */}
            <ChampAvecMicro libelle={`Nom du fichier vocal ${i + 1}`} libelleVisible={false} valeur={f.nom} max={60} occupationIds={occupationIds} classe="pvv-nom-vocal" remplacer
              onChange={(g) => majFichier(f.cle, (x) => ({ ...x, nom: g(x.nom) }))} onOccupe={(o) => occuperTitre(f.cle, o)}
              attributsChamp={{ 'data-vocal-nom': '' }}
              attributsMicro={{ 'aria-label': `Maintenir pour dicter le nom du fichier vocal ${i + 1}`, title: 'Maintenir pour dicter le nom', 'data-dicter-titre': String(i + 1) }} />
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
              {/* 🔴 (9e retour) Lecture / Pause par le lecteur unique ; les prises enchaînées ; la progression sous les boutons */}
              <BoutonEcouter cle={f.cle} pistes={pistesDe(f.prises)} classe="svv-btn svv-btn-outline pvv-gros" texte attributs={{ 'data-vocal-ecouter': '' }} />
              {/* 🔴 (8e retour) « Enregistrer ici » devient « Choisir ce fichier » (même fonction, accord d'Arno) ; sur la carte active : « Fichier actif », désactivé */}
              <button type="button" className="svv-btn svv-btn-outline pvv-gros" onClick={() => setCourant(f.cle)} disabled={estCourant} aria-pressed={estCourant} data-vocal-choisir>
                <Icone nom="cible" /> {estCourant ? 'Fichier actif' : 'Choisir ce fichier'}</button>
              <button type="button" className="svv-btn svv-btn-outline pvv-gros" disabled={f.prises.every((p) => p.id === null) || f.transcription === 'en_cours'} onClick={() => { void transcrire(f); }} data-vocal-transcrire><Icone nom="texte" /> Transcrire dans le texte</button>
              <button type="button" className="svv-btn svv-btn-outline pvv-gros pvv-gros--danger" onClick={() => setAConfirmer({ fichier: f.cle, prise: null })} aria-label={`Supprimer ${f.nom}`} data-vocal-supprimer><Icone nom="corbeille" /> Supprimer</button>
            </div>
            <ProgressionLecture cles={[f.cle]} />
            {aConfirmer?.fichier === f.cle && aConfirmer.prise === null && (
              <Confirmation question={`Supprimer « ${f.nom} » et ses ${f.prises.length} prise${f.prises.length > 1 ? 's' : ''} ?`} action="Supprimer"
                onConfirmer={() => supprimerFichier(f.cle)} onGarder={() => setAConfirmer(null)}
                attributs={{ 'data-vocal-confirmer': '' }} attributsOui={{ 'data-vocal-supprimer-oui': '' }} attributsNon={{ 'data-vocal-supprimer-non': '' }} />)}
            {f.transcription === 'en_cours' && <span className="loc-muet" role="status" data-vocal-transcription-en-cours>Transcription en cours…</span>}
            {f.transcription === 'ok' && <span className="loc-muet" data-vocal-transcrit>Texte inséré dans le compte rendu {MENTION_TRANSCRIT} — modifiable.</span>}
            {f.motif !== null && <span className="pvv-photo-motif" role="alert" data-vocal-motif>{f.motif}</span>}
            {f.prises.length > 0 && <ol className="pvv-prises">{f.prises.map((p, k) => (
              <li key={p.cle} className={`pvv-prise${p.etat === 'erreur' || p.etat === 'perdue' ? ' pvv-photo--echec pvv-prise--perdue' : ''}`} data-prise={k + 1} data-prise-etat={p.etat}
                data-prise-normalisee={p.normalisee ? 'oui' : undefined}>
                <span>Prise {k + 1} <span className="loc-muet">({dureeFr(p.dureeS)})</span></span>
                {/* 🔴🔴 Arno (15/11/2026, 9e retour) — l'état de CHAQUE prise, toujours dit : « Sauvegardée » seulement après la vérification du serveur */}
                <span className={STATUT_PIECE[statutPiece(p.etat)].classe} role={statutPiece(p.etat) === 'perdue' ? 'alert' : 'status'} data-prise-statut={statutPiece(p.etat)}>{STATUT_PIECE[statutPiece(p.etat)].libelle}</span>
                {p.etat === 'attente' && <span className="pvv-attente" role="status" data-prise-attente>{p.motif}</span>}
                <BoutonEcouter cle={p.cle} pistes={pistesDe([p])} classe="pvv-mini" etiquette={(l) => (l ? `Pause de la prise ${k + 1}` : `Écouter la prise ${k + 1}`)} attributs={{ 'data-prise-ecouter': '' }} />
                <button type="button" className="pvv-mini" onClick={() => setAConfirmer({ fichier: f.cle, prise: p.cle })} aria-label={`Supprimer la prise ${k + 1}`} data-prise-supprimer><Icone nom="corbeille" /></button>
                {aConfirmer?.fichier === f.cle && aConfirmer.prise === p.cle && (
                  <Confirmation question={`Supprimer la prise ${k + 1} ?`} action="Supprimer" onConfirmer={() => supprimerPrise(f.cle, p.cle)} onGarder={() => setAConfirmer(null)}
                    attributs={{ 'data-prise-confirmer': '' }} attributsOui={{ 'data-prise-supprimer-oui': '' }} attributsNon={{ 'data-prise-supprimer-non': '' }} />)}
                {p.motif !== null && p.etat !== 'attente' && <span className="pvv-photo-motif" role="alert" data-prise-motif>{p.motif}</span>}
                <ProgressionLecture cles={[p.cle]} />
              </li>))}</ol>}
          </li>);
      })}</ol>}
    </section>
  );
}

/**
 * 🔴 Arno (15/11/2026, 6e retour) — LES VOCAUX DU RÉCAPITULATIF, AVANT L'ENVOI : sur chaque ligne (« ENVOYÉ aux locataires » / « NON envoyé
 * (interne) »), un bouton « Écouter » (lecture / pause, prises enchaînées) pour vérifier l'affectation avant de confirmer.
 */
export function LignesVocauxRecap({ fichiers, aussiLocataires }: { fichiers: readonly FichierVocal[]; aussiLocataires: boolean }) {
  const liste = fichiers.map((f, i) => ({ f, i })).filter(({ f }) => f.prises.some((p) => p.id !== null));
  if (liste.length === 0) return null;
  return (
    <ul className="pvv-recap-vocaux" data-recap-vocaux>{liste.map(({ f, i }) => {
      const envoye = f.locataires === true && aussiLocataires;
      const cle = `recap-${f.cle}`;
      return (
        <li key={f.cle} className="pvv-recap-vocal-ligne" data-recap-vocal-ligne={i + 1}>
          <span className={`pvv-vocal-etat${envoye ? ' pvv-vocal-etat--envoye' : ''}`} data-recap-vocal={envoye ? 'envoye' : 'interne'}>
            {f.nom.trim() || `Vocal ${i + 1}`} — {etatVocalLocataires(envoye)}{f.locataires && !aussiLocataires ? ' — l’envoi aux locataires est désactivé : activez « Compte rendu envoyé aux locataires » pour le joindre' : ''}</span>
          <BoutonEcouter cle={cle} pistes={pistesDe(f.prises.filter((p) => p.id !== null))} classe="pvv-choix pvv-recap-ecouter" texte
            etiquette={(l) => `${l ? 'Pause' : 'Écouter'} — ${f.nom.trim() || `Vocal ${i + 1}`}`} attributs={{ 'data-recap-ecouter': '' }} />
          <ProgressionLecture cles={[cle]} />
        </li>);
    })}</ul>
  );
}

/**
 * « Voir le compte rendu » (après l'envoi, LECTURE SEULE) : les fichiers vocaux, leurs prises, la réécoute du fichier qui les ENCHAÎNE et
 * celle de chaque prise. Rien n'est modifiable.
 */
export function LectureFichiersVocaux({ fichiers, url }: { fichiers: { nom: string; prises: { id: number; nom: string; dureeS?: number }[]; locataires?: boolean }[]; url: (id: number) => string }) {
  return (
    <ol className="pvv-cr-fichiers">{fichiers.map((f, i) => {
      const cle = `cr-f${i}`;
      return (
        <li key={cle} className="pvv-fichier-vocal" data-cr-vocal={i + 1} data-cr-vocal-prises={f.prises.length}>
          {/* 🔴 Arno (15/11/2026, 11e retour) — le titre UNE fois, le statut en étiquette (vert : envoyé aux locataires ; gris : interne) */}
          <div className="pvv-photo-tete pvv-cr-vocal-tete"><strong className="pvv-cr-legende" data-cr-vocal-nom>{f.nom}</strong>
            <span className="loc-muet">{f.prises.length} prise{f.prises.length > 1 ? 's' : ''}</span></div>
          <span className={`pvv-cr-vocal-statut${f.locataires ? ' pvv-cr-vocal-statut--envoye' : ''}`} data-cr-vocal-etat={f.locataires ? 'envoye' : 'interne'}>{etatVocalLocataires(f.locataires === true)}</span>
          <div className="pvv-photo-gestes pvv-vocal-gestes">
            <BoutonEcouter cle={cle} pistes={f.prises.map((p) => ({ url: url(p.id), dureeS: p.dureeS ?? 0 }))} classe="pvv-mini" texte attributs={{ 'data-cr-vocal-ecouter': '' }} />
          </div>
          <ProgressionLecture cles={[cle]} />
          <ol className="pvv-prises">{f.prises.map((p, k) => (
            <li key={p.id} className="pvv-prise" data-cr-prise={k + 1}><span>Prise {k + 1}</span>
              <BoutonEcouter cle={`cr-p${p.id}`} pistes={[{ url: url(p.id), dureeS: p.dureeS ?? 0 }]} classe="pvv-mini"
                etiquette={(l) => (l ? `Pause de la prise ${k + 1}` : `Écouter la prise ${k + 1}`)} attributs={{ 'data-cr-prise-ecouter': '' }} />
              <ProgressionLecture cles={[`cr-p${p.id}`]} /></li>))}</ol>
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

/** 🔴 Arno (15/11/2026, 6e retour) — les destinataires du compte rendu, lus au serveur (noms des locataires, adresses internes, mentions de recette). */
export interface DestinatairesCompteRendu { locataires: { nom: string; recette: string | null }[]; sansEmail: string[]; internes: string[]; recetteInternes: string | null }

export function BoutonEnvoiLocataires({ actif, onBasculer, occupationIds, nomsConnus }: {
  actif: boolean; onBasculer: () => void; occupationIds: readonly number[];
  /** les noms des locataires du préavis, montrés tant que la liste n'est pas lue */
  nomsConnus: readonly string[];
}) {
  const { base } = useContextePreavis();
  const lu = useLecture<DestinatairesCompteRendu>(`previsiteDestinataires=${occupationIds.join(',')}`, base);
  // une réponse illisible (ou pas encore lue) ne casse rien : les noms connus, aucun interne
  const brut = lu.etat.etat === 'ok' ? (lu.etat.data as Partial<DestinatairesCompteRendu> | null) : null;
  const d: DestinatairesCompteRendu | null = brut && Array.isArray(brut.locataires) && Array.isArray(brut.internes)
    ? { locataires: brut.locataires, internes: brut.internes, sansEmail: Array.isArray(brut.sansEmail) ? brut.sansEmail : [], recetteInternes: brut.recetteInternes ?? null } : null;
  const locataires = d?.locataires ?? nomsConnus.map((nom) => ({ nom, recette: null }));
  const internes = d?.internes ?? [];
  return (
    <div className="pvv-envoi-loc" data-bloc-envoi-locataires>
      <button type="button" className={`svv-btn pvv-gros pvv-envoi-loc-bouton${actif ? ' svv-btn-primary pvv-envoi-loc--oui' : ' svv-btn-outline'}`} aria-pressed={actif}
        onClick={onBasculer} data-aussi-locataires={actif ? 'oui' : 'non'}>
        {actif ? <><Icone nom="coche" /> {LIBELLE_ENVOI_LOCATAIRES_OUI}</> : LIBELLE_ENVOI_LOCATAIRES_NON}
      </button>
      {/* 🔴 Arno (15/11/2026, 6e retour) — « Les destinataires : » un par ligne, barre VERTE pour chaque locataire, GRISE pour chaque interne ;
          bouton désactivé : les seuls internes */}
      <p className="pvv-dest-titre" data-destinataires-titre>Les destinataires :</p>
      <ul className="pvv-dest-liste" data-destinataires-liste>
        {actif && locataires.map((l, i) => (
          <li key={`l${i}`} className="pvv-dest pvv-dest--locataire" data-destinataire-liste="locataire">
            <span className="pvv-dest-nom">{l.nom}</span>{l.recette && <span className="pvv-dest-recette" data-destinataire-recette>{l.recette}</span>}
          </li>))}
        {internes.map((a) => <li key={a} className="pvv-dest pvv-dest--interne" data-destinataire-liste="interne"><span className="pvv-dest-nom">{a}</span></li>)}
      </ul>
      {d?.recetteInternes && <p className="pvv-dest-recette" data-destinataires-recette-internes>{d.recetteInternes}</p>}
      {actif && d !== null && d.locataires.length === 0 && <p className="loc-muet" data-envoi-locataires-aucun>Aucun locataire avec une adresse e-mail : seuls les collaborateurs le recevront.</p>}
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
.pvv-recap-vocaux{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.pvv-recap-vocal-ligne{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:10px;background:var(--color-svv-field)}
.pvv-recap-vocal-ligne .pvv-vocal-etat{flex:1 1 12rem;min-width:0}
.pvv-recap-ecouter{white-space:nowrap;flex:0 0 auto}
.pvv-dest-titre{margin:4px 0 0;font-weight:800;color:var(--color-svv-ink)}
.pvv-dest-liste{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.pvv-dest{--pvv-dest:var(--color-svv-gray);display:flex;flex-direction:column;gap:2px;padding:6px 10px;border-radius:8px;border-left:6px solid var(--pvv-dest);background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:700;overflow-wrap:anywhere}
.pvv-dest--locataire{--pvv-dest:var(--color-svv-green-ink)}
.pvv-dest--interne{--pvv-dest:var(--color-svv-gray)}
.pvv-dest-recette{display:block;margin:0;font-size:.86rem;font-weight:700;color:var(--color-svv-ink);padding:4px 8px;border-radius:8px;border:1px dashed var(--color-svv-urgence-orange)}
.pvv-bloc{border:1px solid var(--color-svv-line);border-radius:14px;padding:12px;margin:14px 0 0;display:flex;flex-direction:column;gap:10px;min-width:0}
.pvv-bloc--texte{background:color-mix(in srgb, var(--color-svv-green) 5%, var(--color-svv-surface))}
.pvv-bloc--photos{background:color-mix(in srgb, var(--color-svv-ink) 4%, var(--color-svv-surface))}
.pvv-bloc--dictaphone{background:color-mix(in srgb, var(--color-svv-red) 4%, var(--color-svv-surface))}
.pvv-bloc-tete{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pvv-bloc-titre{margin:0;font-size:1.05rem;font-weight:900;letter-spacing:.01em}
/* Arno (15/11/2026, 10e retour) : les titres des quatre encarts (Presence, Texte, Photos, Dictaphone) nettement plus gros, le meme style ;
   l'asterisque et le compteur suivent la ligne, a leur taille */
.pvv-bloc-titre.pvv-titre-encart{font-size:1.45rem;font-weight:900;line-height:1.2;letter-spacing:0;color:var(--color-svv-ink)}
.pvv-titre-encart .loc-muet{font-size:1rem;font-weight:700}
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
.pvv-maintien{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;cursor:pointer;transition:none}
/* Arno (15/11/2026, 7e retour) : rouge DES le contact — aucune transition de couleur sur les boutons micro */
.pvv-maintien.svv-btn,.pvv-maintien--actif{transition:none}
.pvv-maintien.svv-btn{background:var(--color-svv-ink);color:var(--color-svv-surface);border:0}
.pvv-maintien--actif,.pvv-maintien--actif.svv-btn,.pvv-boite-cr .pvv-maintien.pvv-maintien--actif,.pvv-boite-cr .pvv-maintien.pvv-maintien--actif:hover,.pvv-boite-cr .pvv-maintien.pvv-maintien--actif:active{background:var(--color-svv-red) !important;border-color:var(--color-svv-red) !important;color:var(--color-svv-blanc) !important;animation:pvv-pulsation 1.1s ease-in-out infinite}
@keyframes pvv-pulsation{0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--color-svv-red) 55%, transparent)}70%{box-shadow:0 0 0 14px color-mix(in srgb, var(--color-svv-red) 0%, transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--color-svv-red) 0%, transparent)}}
@media (prefers-reduced-motion: reduce){.pvv-maintien--actif,.pvv-maintien--actif.svv-btn{animation:none}}
.pvv-point{display:inline-block;width:10px;height:10px;border-radius:999px;background:var(--color-svv-surface)}
.pvv-chrono{font-variant-numeric:tabular-nums}
.pvv-statut{margin:0;font-style:italic}
.pvv-segments{display:inline-flex;gap:10px;flex-wrap:wrap}
.pvv-sauvegarde{align-self:flex-start;margin:0;padding:3px 10px;border-radius:999px;background:var(--color-svv-field);color:var(--color-svv-muted);font-size:.82rem;font-weight:800}
.pvv-sauvegarde--enregistre{color:var(--color-svv-green-ink)}
.pvv-sauvegarde--hors_ligne,.pvv-sauvegarde--echec{color:var(--color-svv-ink);background:color-mix(in srgb, var(--color-svv-urgence-orange) 18%, var(--color-svv-surface))}
.pvv-restaure{margin:0;padding:8px 10px;border-radius:10px;border-left:4px solid var(--color-svv-green-ink);background:var(--color-svv-field);color:var(--color-svv-ink);font-weight:700}
.pvv-effacer-ligne{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.pvv-effacer-brouillon{color:var(--color-svv-red);border-color:var(--color-svv-red)}
.pvv-attente{display:block;padding:6px 10px;border-radius:10px;border:1px dashed var(--color-svv-urgence-orange);color:var(--color-svv-ink);font-weight:700;font-size:.9rem}
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
/* Arno (15/11/2026, 8e retour) : la destination des prises toujours visible — pastilles, carte active bordee de rouge et etiquetee */
.pvv-fichier-vocal{cursor:pointer}
.pvv-fichier-vocal.pvv-fichier-vocal--courant{border:4px solid var(--color-svv-red);cursor:default}
.pvv-fichier-actif-etiquette{align-self:flex-start;margin:0;padding:3px 10px;border-radius:999px;background:var(--color-svv-red);color:var(--color-svv-surface);font-size:.82rem;font-weight:900}
.pvv-pastilles-vocaux{align-self:stretch;display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding:2px 2px 6px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
.pvv-pastille-vocal{flex:0 0 auto;max-width:12rem;border-radius:999px}
.pvv-pastille-texte{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:10.5rem}
.pvv-pastille-nouveau{color:var(--color-svv-ink)}
.pvv-nom-vocal{flex:1;min-width:0}
.pvv-nom-vocal .pvv-legende-champ{font-weight:800}
.pvv-lu{position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pvv-vocal-resume{margin:0}
.pvv-vocal-gestes{flex-wrap:wrap}
.pvv-prises{margin:0;padding:0 0 0 4px;list-style:none;display:flex;flex-direction:column;gap:6px}
.pvv-prise{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:var(--color-svv-field)}
.pvv-statut-piece{font-size:.85rem}
/* Arno (15/11/2026, 9e retour) : la progression de la lecture, sous le vocal qui joue */
.pvv-lecture{flex:1 0 100%;display:flex;flex-direction:column;gap:4px;min-width:0}
.pvv-lecture-texte{font-size:.88rem;font-weight:700;font-variant-numeric:tabular-nums;color:var(--color-svv-ink)}
.pvv-lecture-barre{display:block;position:relative;height:6px;border-radius:999px;background:var(--color-svv-line);overflow:hidden}
.pvv-lecture-plein{display:block;height:100%;border-radius:999px;background:var(--color-svv-red)}
/* Arno (15/11/2026, 9e retour) : JAMAIS le menu de l'appui long (Copier, Coller...) sur un bouton ; les champs de saisie restent selectionnables */
.pvv-page-cr button,.pvv-page-cr .svv-btn,.pvv-page-cr [role=switch],.pvv-page-cr label.pvv-interrupteur,.mis-boite button,.mis-boite .svv-btn,.pvv-voile button{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:manipulation}
.pvv-page-cr input,.pvv-page-cr textarea,.mis-boite input,.mis-boite textarea{-webkit-user-select:text;user-select:text}
.pvv-statut-piece--perdue{color:var(--color-svv-red);font-weight:800}
.pvv-prise--perdue{border:2px solid var(--color-svv-red)}
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
/* Arno (15/11/2026, 11e retour) : le statut d'un vocal de la consultation, en etiquette (vert : envoye aux locataires ; gris : interne) */
.pvv-cr-vocal-statut{align-self:flex-start;display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:.8rem;font-weight:900;letter-spacing:.04em;background:var(--color-svv-gray);color:var(--color-svv-surface)}
.pvv-cr-vocal-statut--envoye{background:var(--color-svv-green-ink)}
.pvv-cr-fichiers .pvv-prises{max-height:none;overflow:visible}
.pvv-cr-fichiers .pvv-mini{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
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
/* Arno (15/11/2026, 7e retour) : les champs de la fenetre « Ajouter une personne » ont le lisere standard ; Madame / Monsieur lisibles */
.pvv-mini-modale input[type=text]{padding:0 12px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:16px}
.pvv-mini-modale input[type=text]:focus{outline:none;border-color:var(--color-svv-ink);box-shadow:0 0 0 1px var(--color-svv-ink)}
.pvv-civilite .pvv-case{min-height:48px;padding:0 16px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font-weight:800}
.pvv-civilite .pvv-case:has(input:checked){border-color:var(--color-svv-red);box-shadow:0 0 0 1px var(--color-svv-red);background:color-mix(in srgb, var(--color-svv-red) 8%, var(--color-svv-surface))}
.pvv-nouveau-vocal{align-self:stretch;width:100%}
.pvv-nouveau-vocal .pvv-gros{width:100%}
.pvv-cr-fichiers{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
/* le formulaire du compte rendu : fond OPAQUE (rien de la page derriere ne transparait), boutons en FIN de formulaire (plus colles en bas) */
.pvv-voile-cr{background:var(--color-svv-surface);z-index:200;top:0;right:0;bottom:0;left:0;box-shadow:0 0 0 100vmax var(--color-svv-surface)}
/* clavier iOS ouvert, rebond du defilement : le fond de la page elle-meme est opaque tant que le formulaire est ouvert */
html:has(.pvv-voile-cr),body:has(.pvv-voile-cr){background:var(--color-svv-surface)}
.pvv-recap-vocaux{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.pvv-recap-vocaux li{padding:10px 12px;border-radius:10px;border:2px solid currentColor;font-size:1.02rem;background:var(--color-svv-surface)}
/* la marge laterale des blocs (12 px + 1 px de bord) : les boutons du bas ont exactement la largeur de ceux des blocs */
.pvv-boite-cr .mis-actions{position:static;margin:18px 0 0;padding:12px 13px 16px;border-top:1px solid var(--color-svv-line);background:transparent}
@media (max-width:640px){
  .pvv-voile-cr .mis-boite{min-height:100%;border-radius:0;box-shadow:none}
  .pvv-boite-cr .mis-actions{margin:18px 0 0;padding:12px 13px calc(12px + env(safe-area-inset-bottom))}
}
`;
