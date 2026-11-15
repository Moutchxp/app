'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_PREAVIS_LOCATION } from './preavisSynchro';
import { ENTETE_CONFIRMATION } from '../../../../lib/location/confirmationEnregistrement';

/** Une sauvegarde ne s'annonce jamais : aucune fenêtre « Modification enregistrée » (l'indicateur du formulaire suffit). */
const ENTETES = { 'Content-Type': 'application/json', [ENTETE_CONFIRMATION]: 'propre' };
import { BROUILLON_VIDE, LIBELLE_SAUVEGARDE, brouillonVide, messageBrouillonRestaure, nettoyerBrouillon, type ContenuBrouillon, type EtatSauvegarde }
  from '../../../../lib/location/brouillonCompteRendu';
import { ecrireBrouillonLocal, effacerBrouillonLocal, groupeDe, lireBrouillonLocal, viderAttente } from '../../../../lib/location/fileAttenteLocale';

/**
 * ══ 🔴🔴 Arno (15/11/2026, 6e retour du test iPhone) — LA SAUVEGARDE AUTOMATIQUE DU COMPTE RENDU ═════════════════════════════════════════
 * « Aucune saisie ne doit jamais être perdue » (veille, Chrome fermé ou rechargé, retour plus tard par le lien du mail, réseau coupé) :
 *   · chaque modification est écrite AUSSITÔT dans le téléphone (IndexedDB), puis envoyée au serveur après un court délai (brouillon de la
 *     pré-visite, migration 474) ; au passage en arrière-plan (visibilitychange, pagehide) et en quittant la page : tout de suite ;
 *   · réseau coupé : « Hors ligne — sera enregistré au retour du réseau », nouvel essai automatique ;
 *   · à la réouverture (même lien, même appareil ou un autre) : tout est restauré, « Brouillon restauré — enregistré à HHhMM » ; une copie
 *     du téléphone plus récente que le serveur (pas encore partie) l'emporte ;
 *   · « Effacer le brouillon » le marque effacé (serveur) et vide le téléphone ; rien n'est envoyé à qui que ce soit avant « Confirmer et envoyer ».
 */
const DELAI_MS = 1200;
const RELANCE_MS = 20_000;

type ReponseLecture = { etat: 'ok'; brouillon: ContenuBrouillon | null; enregistreLe: string | null } | { etat: 'indisponible' } | { etat: 'reseau' };

async function lireServeur(ids: readonly number[]): Promise<ReponseLecture> {
  try {
    const r = await fetch(`${API_PREAVIS_LOCATION}?previsiteBrouillon=${ids.join(',')}`, { cache: 'no-store' });
    const d = await r.json() as { etat?: string; data?: { brouillon?: unknown; enregistreLe?: string | null } };
    if (d.etat === 'ok') return { etat: 'ok', brouillon: d.data?.brouillon ? nettoyerBrouillon(d.data.brouillon) : null, enregistreLe: d.data?.enregistreLe ?? null };
    return { etat: 'indisponible' };
  } catch { return { etat: 'reseau' }; }
}

type Issue = 'ok' | 'indisponible' | 'reseau';
async function ecrireServeur(ids: readonly number[], contenu: unknown, keepalive = false): Promise<{ issue: Issue; enregistreLe?: string }> {
  try {
    const r = await fetch(API_PREAVIS_LOCATION, { method: 'POST', keepalive, headers: ENTETES,
      body: JSON.stringify({ action: 'brouillon-previsite', occupationIds: [...ids], contenu }) });
    const d = await r.json() as { etat?: string; data?: { enregistreLe?: string } };
    if (d.etat === 'ok') return { issue: 'ok', enregistreLe: d.data?.enregistreLe };
    return { issue: r.status >= 500 ? 'reseau' : 'indisponible' };
  } catch { return { issue: 'reseau' }; }
}

export interface Brouillon {
  /** l'indicateur (null : rien à dire encore) */
  etat: EtatSauvegarde | null;
  /** « Brouillon restauré — enregistré à HHhMM » (une fois, à l'ouverture) */
  restaure: string | null;
  /** le brouillon est lu : la page peut être saisie sans risque d'écraser */
  pret: boolean;
  effacer: () => Promise<void>;
  /** après l'envoi du compte rendu : plus rien n'est enregistré, le téléphone est vidé (le serveur l'a déjà marqué « envoyé ») */
  terminer: () => Promise<void>;
}

export function useBrouillonCompteRendu(o: { actif: boolean; occupationIds: readonly number[]; contenu: ContenuBrouillon;
  appliquer: (c: ContenuBrouillon) => void }): Brouillon {
  const g = groupeDe(o.occupationIds);
  const ids = useRef(o.occupationIds); ids.current = o.occupationIds;
  const appliquer = useRef(o.appliquer); appliquer.current = o.appliquer;
  const [etat, setEtat] = useState<EtatSauvegarde | null>(null);
  const [restaure, setRestaure] = useState<string | null>(null);
  const [pret, setPret] = useState(!o.actif);
  const courant = useRef(JSON.stringify(o.contenu));
  courant.current = JSON.stringify(o.contenu);
  /** ce que le serveur a (JSON) ; null : rien encore */
  const serveur = useRef<string | null>(null);
  // 🔴 RIEN ne s'écrit tant que le brouillon n'est pas LU : sinon un démontage précoce (rechargement, double montage de React en développement)
  // écrirait un formulaire VIDE dans le téléphone, qui l'emporterait ensuite sur le brouillon du serveur.
  const arrete = useRef(true);
  const indispo = useRef(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  const envoyerAuServeur = useCallback(async (keepalive = false): Promise<void> => {
    if (arrete.current || indispo.current) return;
    const s = courant.current;
    if (s === serveur.current) { setEtat('enregistre'); return; }
    // rien de saisi et rien sur le serveur : pas de brouillon à créer
    if (serveur.current === null && brouillonVide(JSON.parse(s) as ContenuBrouillon)) { setEtat(null); return; }
    setEtat('enregistrement');
    const r = await ecrireServeur(ids.current, JSON.parse(s), keepalive);
    if (arrete.current) return;
    if (r.issue === 'ok') {
      serveur.current = s;
      if (courant.current === s) { await ecrireBrouillonLocal(g, { contenu: JSON.parse(s), modifieLe: r.enregistreLe ?? new Date().toISOString(), synchronise: true }); setEtat('enregistre'); }
      return;
    }
    if (r.issue === 'indisponible') { indispo.current = true; setEtat('local'); return; }
    setEtat(typeof navigator !== 'undefined' && navigator.onLine === false ? 'hors_ligne' : 'echec');
  }, [g]);

  // ① À L'OUVERTURE : la copie du téléphone pas encore partie l'emporte ; sinon celle du serveur ; sans serveur (474 absente), celle du téléphone
  useEffect(() => {
    if (!o.actif) return;
    let vivant = true;
    void (async () => {
      const [local, srv] = await Promise.all([lireBrouillonLocal(g), lireServeur(ids.current)]);
      if (!vivant) return;
      if (srv.etat === 'indisponible') indispo.current = true;
      let choisi: { contenu: ContenuBrouillon; le: string } | null = null;
      if (local && !local.synchronise) choisi = { contenu: nettoyerBrouillon(local.contenu), le: local.modifieLe };
      else if (srv.etat === 'ok' && srv.brouillon) { choisi = { contenu: srv.brouillon, le: srv.enregistreLe ?? new Date().toISOString() }; serveur.current = JSON.stringify(srv.brouillon); }
      else if (local && srv.etat !== 'ok') choisi = { contenu: nettoyerBrouillon(local.contenu), le: local.modifieLe };
      if (choisi !== null && !brouillonVide(choisi.contenu)) {
        appliquer.current(choisi.contenu);
        setRestaure(messageBrouillonRestaure(choisi.le));
      }
      arrete.current = false;
      setPret(true);
      setEtat(indispo.current ? 'local' : srv.etat === 'reseau' ? 'hors_ligne' : serveur.current !== null ? 'enregistre' : null);
    })();
    return () => { vivant = false; };
  }, [g, o.actif]); // eslint-disable-line react-hooks/exhaustive-deps

  // ② CHAQUE MODIFICATION : aussitôt dans le téléphone, puis au serveur après un court délai
  const s = JSON.stringify(o.contenu);
  useEffect(() => {
    if (!pret || arrete.current || s === serveur.current) return;
    void ecrireBrouillonLocal(g, { contenu: JSON.parse(s), modifieLe: new Date().toISOString(), synchronise: false });
    if (indispo.current) { setEtat('local'); return; }
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => { minuterie.current = null; void envoyerAuServeur(); }, DELAI_MS);
  }, [s, pret, g, envoyerAuServeur]);

  // ③ ARRIÈRE-PLAN, FERMETURE, DÉPART DE LA PAGE : tout de suite (keepalive : la requête survit à la page) ; RETOUR DU RÉSEAU : nouvel essai
  useEffect(() => {
    if (!o.actif) return;
    const maintenant = (): void => {
      if (arrete.current || courant.current === serveur.current) return;
      if (minuterie.current) { clearTimeout(minuterie.current); minuterie.current = null; }
      void ecrireBrouillonLocal(g, { contenu: JSON.parse(courant.current), modifieLe: new Date().toISOString(), synchronise: false });
      void envoyerAuServeur(true);
    };
    const visibilite = (): void => { if (document.visibilityState === 'hidden') maintenant(); };
    const reseau = (): void => { void envoyerAuServeur(); };
    document.addEventListener('visibilitychange', visibilite);
    window.addEventListener('pagehide', maintenant);
    window.addEventListener('online', reseau);
    return () => {
      document.removeEventListener('visibilitychange', visibilite); window.removeEventListener('pagehide', maintenant); window.removeEventListener('online', reseau);
      maintenant();
    };
  }, [g, o.actif, envoyerAuServeur]);
  // une sauvegarde manquée (réseau, serveur) : nouvel essai régulier
  useEffect(() => {
    if (etat !== 'hors_ligne' && etat !== 'echec') return;
    const t = setInterval(() => { void envoyerAuServeur(); }, RELANCE_MS);
    return () => clearInterval(t);
  }, [etat, envoyerAuServeur]);

  const effacer = useCallback(async (): Promise<void> => {
    arrete.current = true;
    if (minuterie.current) { clearTimeout(minuterie.current); minuterie.current = null; }
    try { await fetch(API_PREAVIS_LOCATION, { method: 'POST', headers: ENTETES, body: JSON.stringify({ action: 'effacer-brouillon-previsite', occupationIds: [...ids.current] }) }); } catch { /* le serveur sera écrasé au prochain enregistrement */ }
    await effacerBrouillonLocal(g); await viderAttente(g);
    serveur.current = null;
    appliquer.current(BROUILLON_VIDE);
    courant.current = JSON.stringify(BROUILLON_VIDE);
    setRestaure(null); setEtat(null);
    arrete.current = false;
  }, [g]);
  const terminer = useCallback(async (): Promise<void> => {
    arrete.current = true;
    if (minuterie.current) { clearTimeout(minuterie.current); minuterie.current = null; }
    await effacerBrouillonLocal(g); await viderAttente(g);
  }, [g]);
  return { etat, restaure, pret, effacer, terminer };
}

/** L'indicateur discret en haut du formulaire, et le message de restauration. */
export function IndicateurSauvegarde({ b }: { b: Brouillon }) {
  return (
    <>
      {b.etat !== null && <p className={`pvv-sauvegarde pvv-sauvegarde--${b.etat}`} role="status" aria-live="polite" data-sauvegarde={b.etat}>{LIBELLE_SAUVEGARDE[b.etat]}</p>}
      {b.restaure !== null && <p className="pvv-restaure" role="status" data-brouillon-restaure>{b.restaure}</p>}
    </>
  );
}
