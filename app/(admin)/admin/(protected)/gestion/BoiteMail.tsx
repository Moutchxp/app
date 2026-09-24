'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CurseurBoite, LigneBoite } from '../../../../lib/gestion/boiteRepo';
import { depuis, formaterDateFr } from '../../../../lib/gestion/ecran';
import { corpsLisible } from '../../../../lib/gestion/lisibilite';
import { nettoyerObjet } from '../../../../lib/gestion/objet';

/**
 * LOT 5a — LA BOÎTE MAIL. Le second mode du module : tout le courrier, du plus récent au plus ancien, comme on lit sa
 * messagerie. Le poste de tri (« À classer ») n'est pas touché — les deux répondent à deux questions différentes :
 * « qu'ai-je à traiter ? » et « qu'est-ce qui existe ? ».
 *
 * CE QUE CE LOT NE FAIT PAS, et qu'il ne faut pas chercher ici : la recherche (5c), l'affichage des messages écartés
 * DANS leur échange (5b), la vue conversation dépliable (5b), l'affichage HTML (5d), l'envoi (5e). Un clic ouvre
 * l'échange avec la lecture qui existe AUJOURD'HUI.
 *
 * MOBILE D'ABORD : une ligne = un bouton pleine largeur d'au moins 44 px, l'objet et l'adresse cassent en fin de ligne,
 * aucun débordement horizontal, aucune interaction au survol seul. Couleurs : jetons `--color-svv-*` uniquement, et
 * chaque information portée par un MOT ou une FORME — jamais par la couleur seule.
 */

interface ComptesBoite { lisibles: number; automatiques: number }
interface ReponseBoite {
  lignes: LigneBoite[];
  suivant: CurseurBoite | null;
  total: number | null;
  comptes: ComptesBoite | null;
}

type Etat =
  | { v: 'charge' }
  | { v: 'ok'; lignes: LigneBoite[]; suivant: CurseurBoite | null; total: number; comptes: ComptesBoite | null }
  | { v: 'erreur'; m: string };

/** Va chercher une page. Rapporte, ne décide pas — l'appelant fait ce qu'il veut du résultat. */
async function chargerPage(curseur: CurseurBoite | null, auto: boolean): Promise<ReponseBoite | { erreur: string }> {
  const p = new URLSearchParams();
  if (curseur) { p.set('depuis', curseur.dernierLe); p.set('avant', curseur.filId); }
  if (auto) p.set('auto', '1');
  try {
    const res = await fetch(`/api/admin/gestion/boite?${p.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      return { erreur: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    }
    return (await res.json()) as ReponseBoite;
  } catch {
    return { erreur: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}

/**
 * L'APERÇU d'une ligne. On retire l'historique cité AVANT de couper : sans ça, un échange de dix réponses afficherait
 * dix fois le même aperçu — celui du tout premier message, recopié en bas de chaque réponse. PUR.
 */
export function apercu(extrait: string | null, max = 140): string {
  if (extrait === null) return '';
  const visible = corpsLisible(extrait).visible.replace(/\s+/g, ' ').trim();
  return visible.length <= max ? visible : `${visible.slice(0, max - 1).trimEnd()}…`;
}

/** Le nom à afficher pour le correspondant. Jamais vide : une ligne sans nom reste identifiable. PUR. */
export function nomCorrespondant(l: Pick<LigneBoite, 'interlocuteur'>): string {
  const n = (l.interlocuteur ?? '').trim();
  return n === '' ? '(correspondant inconnu)' : n;
}

export function BoiteMail({ onOuvrir }: { onOuvrir: (filId: number) => void }) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [auto, setAuto] = useState(false);
  const [suite, setSuite] = useState(false);
  const [maintenant, setMaintenant] = useState<Date | null>(null);

  // La date de référence n'est posée qu'APRÈS le montage : la calculer au rendu serveur ferait diverger l'hydratation.
  useEffect(() => { setMaintenant(new Date()); }, []);

  const premiere = useCallback(async (avecAuto: boolean) => {
    setEtat({ v: 'charge' });
    const r = await chargerPage(null, avecAuto);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    setEtat({ v: 'ok', lignes: r.lignes, suivant: r.suivant, total: r.total ?? r.lignes.length, comptes: r.comptes });
  }, []);

  useEffect(() => { void premiere(auto); }, [premiere, auto]);

  async function voirPlus() {
    if (etat.v !== 'ok' || etat.suivant === null || suite) return;
    setSuite(true);
    const r = await chargerPage(etat.suivant, auto);
    setSuite(false);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    // On CONCATÈNE : « voir plus » allonge la liste, il ne la remplace pas — on ne perd jamais ce qu'on lisait.
    setEtat({ v: 'ok', lignes: [...etat.lignes, ...r.lignes], suivant: r.suivant, total: etat.total, comptes: etat.comptes });
  }

  if (etat.v === 'charge') return <p className="gst-info" role="status">Chargement de la boîte…</p>;
  if (etat.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">{etat.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void premiere(auto)}>Réessayer</button>
      </div>
    );
  }

  const ref = maintenant ?? new Date();
  return (
    <section aria-labelledby="bte-titre">
      <h2 className="gst-titre" id="bte-titre">
        Boîte mail <span className="gst-compte">{etat.total}</span>
      </h2>

      {/* CE QUE LA LISTE NE MONTRE PAS, dit en toutes lettres — et ramené d'un geste. Jamais un masquage silencieux. */}
      {etat.comptes !== null && etat.comptes.automatiques > 0 && (
        <p className="gst-tronc">
          {auto
            ? <>Le courrier automatique est inclus : {etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que des messages tenus hors de la file par une règle.</>
            : <>{etat.comptes.automatiques} échange{etat.comptes.automatiques > 1 ? 's' : ''} ne contien{etat.comptes.automatiques > 1 ? 'nent' : 't'} que du courrier automatique et {etat.comptes.automatiques > 1 ? 'ne sont pas affichés' : 'n’est pas affiché'} ici. Rien n’est supprimé.</>}
          {' '}
          <button type="button" className="gst-lien-bouton" aria-pressed={auto} onClick={() => setAuto((v) => !v)}>
            {auto ? 'Masquer le courrier automatique' : 'Afficher aussi le courrier automatique'}
          </button>
        </p>
      )}

      {etat.lignes.length === 0
        ? <p className="gst-vide">Aucun échange dans la boîte.</p>
        : (
          <ul className="gst-liste bte-liste">
            {etat.lignes.map((l) => (
              <li key={l.filId}>
                <button type="button" className="bte-ligne" onClick={() => onOuvrir(l.filId)}>
                  <span className="bte-haut">
                    <span className="bte-qui">{nomCorrespondant(l)}</span>
                    <span className="bte-quand" title={formaterDateFr(l.dernierLe)}>{depuis(l.dernierLe, ref)}</span>
                  </span>
                  <span className="bte-objet">{nettoyerObjet(l.objet) || '(sans objet)'}</span>
                  {apercu(l.extrait) !== '' && (
                    <span className="bte-apercu">
                      {l.dernierSens === 'envoye' && <span className="bte-vous">Vous : </span>}
                      {apercu(l.extrait)}
                    </span>
                  )}
                  <span className="bte-bas">
                    <span>{l.nbMessages} message{l.nbMessages > 1 ? 's' : ''}</span>
                    {/* Chaque marque porte un MOT : elle reste lisible en niveaux de gris et pour un daltonien. */}
                    {l.aPiece && <span className="bte-marque"><span aria-hidden="true">📎</span> pièce jointe</span>}
                    {l.reference && <span className="bte-ref">{l.reference}</span>}
                    {l.sansSuite && <span className="bte-marque">classé sans suite</span>}
                    {l.nbLisibles === 0 && <span className="bte-marque">courrier automatique</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

      {etat.suivant !== null && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn bte-plus" disabled={suite} onClick={() => void voirPlus()}>
          {suite ? 'Chargement…' : 'Voir les échanges plus anciens'}
        </button>
      )}
      {etat.suivant === null && etat.lignes.length > 0 && (
        <p className="gst-tronc">Vous avez atteint le plus ancien message de la boîte.</p>
      )}

      <style>{CSS_BOITE}</style>
    </section>
  );
}

const CSS_BOITE = `
.bte-liste{display:flex;flex-direction:column;gap:0;border-top:1px solid var(--color-svv-line)}
.bte-ligne{display:flex;flex-direction:column;gap:3px;width:100%;min-height:44px;padding:10px 4px;text-align:left;
  background:none;border:0;border-bottom:1px solid var(--color-svv-line);color:inherit;font:inherit;cursor:pointer}
.bte-ligne:hover,.bte-ligne:focus-visible{background:var(--color-svv-field)}
.bte-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.bte-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;justify-content:space-between}
.bte-qui{font-weight:700;font-size:.95rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.bte-quand{font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
.bte-objet{font-size:.9rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.bte-apercu{font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bte-vous{font-weight:600;color:var(--color-svv-ink)}
.bte-bas{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:.78rem;color:var(--color-svv-muted)}
.bte-marque{display:inline-flex;align-items:center;gap:.25rem}
.bte-ref{font-weight:700;color:var(--color-svv-green-ink)}
.bte-plus{margin-top:12px;width:100%}
@media (min-width:600px){.bte-plus{width:auto}}
`;
