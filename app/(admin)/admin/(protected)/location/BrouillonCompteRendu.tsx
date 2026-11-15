'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_PREAVIS_LOCATION } from './preavisSynchro';
import { ENTETE_CONFIRMATION } from '../../../../lib/location/confirmationEnregistrement';

/** Une sauvegarde ne s'annonce jamais : aucune fenêtre « Modification enregistrée » (l'indicateur du formulaire suffit). */
const ENTETES = { 'Content-Type': 'application/json', [ENTETE_CONFIRMATION]: 'propre' };
import { BROUILLON_VIDE, LIBELLE_CARTOUCHE, LIBELLE_SAUVEGARDE, brouillonVide, detailCartouche, messageBrouillonRestaure, nettoyerBrouillon, type ContenuBrouillon, type EtatSauvegarde }
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
  /** 🔴 (7e retour) l'heure du dernier enregistrement (serveur, ou brouillon restauré) */
  dernier: string | null;
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
  const [dernier, setDernier] = useState<string | null>(null);
  const courant = useRef(JSON.stringify(o.contenu));
  courant.current = JSON.stringify(o.contenu);
  /** ce que le serveur a (JSON) ; null : rien encore */
  const serveur = useRef<string | null>(null);
  // 🔴 RIEN ne s'écrit tant que le brouillon n'est pas LU : sinon un démontage précoce (rechargement, double montage de React en développement)
  // écrirait un formulaire VIDE dans le téléphone, qui l'emporterait ensuite sur le brouillon du serveur.
  const arrete = useRef(true);
  const indispo = useRef(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 🔴 (8e retour) l'enregistrement en route vers le serveur : « Effacer » l'attend, sinon il arrivait APRÈS l'effacement et recréait le brouillon */
  const enVol = useRef<Promise<unknown> | null>(null);

  const envoyerAuServeur = useCallback(async (keepalive = false): Promise<void> => {
    if (arrete.current || indispo.current) return;
    const s = courant.current;
    if (s === serveur.current) { setEtat('enregistre'); return; }
    // rien de saisi et rien sur le serveur : pas de brouillon à créer
    if (serveur.current === null && brouillonVide(JSON.parse(s) as ContenuBrouillon)) { setEtat(null); return; }
    setEtat('enregistrement');
    const envoi = ecrireServeur(ids.current, JSON.parse(s), keepalive);
    enVol.current = envoi;
    const r = await envoi;
    if (enVol.current === envoi) enVol.current = null;
    if (arrete.current) return;
    if (r.issue === 'ok') {
      serveur.current = s;
      setDernier(r.enregistreLe ?? new Date().toISOString());
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
        setDernier(choisi.le);
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
    // un enregistrement déjà parti doit ARRIVER avant l'effacement (sinon il recréerait le brouillon effacé)
    if (enVol.current) { try { await enVol.current; } catch { /* rien */ } }
    try { await fetch(API_PREAVIS_LOCATION, { method: 'POST', headers: ENTETES, body: JSON.stringify({ action: 'effacer-brouillon-previsite', occupationIds: [...ids.current] }) }); } catch { /* le serveur sera écrasé au prochain enregistrement */ }
    await effacerBrouillonLocal(g); await viderAttente(g);
    serveur.current = null; setDernier(null);
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
  return { etat, restaure, pret, dernier, effacer, terminer };
}

/**
 * 🔴🔴 Arno (15/11/2026, 7e retour) — LE CARTOUCHE DE SAUVEGARDE, petit et discret, sur la ligne de « ← Retour », aligné à droite : « Enregistré »,
 * « Enregistrement… », « Hors ligne ». Un appui affiche « Dernier enregistrement à HHhMM » (et « Brouillon restauré » si la page a été rouverte).
 * Il remplace le grand bandeau « Brouillon restauré… » et la pastille sous le titre (accord d'Arno).
 */
export function CartoucheSauvegarde({ b }: { b: Brouillon }) {
  const [ouvert, setOuvert] = useState(false);
  if (b.etat === null && b.dernier === null) return null;
  const etat = b.etat ?? 'enregistre';
  return (
    <span className="pvv-cartouche-sauvegarde">
      <button type="button" className={`pvv-cartouche-bouton pvv-cartouche-bouton--${etat}`} aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}
        aria-label={`${LIBELLE_SAUVEGARDE[etat]} — ${detailCartouche(b.dernier, b.restaure !== null)}`} data-sauvegarde={etat}>
        <span aria-hidden="true" className="pvv-cartouche-point" />{LIBELLE_CARTOUCHE[etat]}
      </button>
      {ouvert && <span className="pvv-cartouche-detail" role="status" data-sauvegarde-detail>{detailCartouche(b.dernier, b.restaure !== null)}</span>}
    </span>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme. */
export const CSS_CARTOUCHE_SAUVEGARDE = `
.pvv-ligne-retour{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.pvv-cartouche-sauvegarde{position:relative;display:inline-flex;flex-direction:column;align-items:flex-end}
.pvv-cartouche-bouton{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 10px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-muted);font:inherit;font-size:.8rem;font-weight:800;cursor:pointer;white-space:nowrap}
.pvv-cartouche-point{display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--color-svv-line-strong)}
.pvv-cartouche-bouton--enregistre .pvv-cartouche-point{background:var(--color-svv-green-ink)}
.pvv-cartouche-bouton--enregistrement .pvv-cartouche-point{background:var(--color-svv-muted)}
.pvv-cartouche-bouton--hors_ligne .pvv-cartouche-point,.pvv-cartouche-bouton--echec .pvv-cartouche-point{background:var(--color-svv-urgence-orange)}
.pvv-cartouche-detail{position:absolute;top:calc(100% + 4px);right:0;z-index:5;padding:6px 10px;border-radius:10px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font-size:.82rem;font-weight:700;white-space:nowrap;box-shadow:0 6px 16px color-mix(in srgb, var(--color-svv-ink) 18%, transparent)}
`;
