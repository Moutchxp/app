'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CurseurBoite, LigneBoite } from '../../../../lib/gestion/boiteRepo';
import { decouperTermes } from '../../../../lib/gestion/rechercheBoite';
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

/** LOT 5c — ce que le champ de recherche et ses filtres demandent. Vide = on affiche la liste ordinaire. */
export interface Critere { q: string; du: string; au: string; de: string }
export const CRITERE_VIDE: Critere = { q: '', du: '', au: '', de: '' };

/** Y a-t-il quelque chose à chercher ? Un champ vide n'envoie AUCUNE requête. PUR. */
export function critereActif(c: Critere): boolean {
  return decouperTermes(c.q).length > 0 || c.de.trim() !== '' || c.du !== '' || c.au !== '';
}

/**
 * LOT 5c — DÉCOUPE UN EXTRAIT autour des mots trouvés, pour les mettre en évidence. Rend une suite de morceaux dont
 * certains sont marqués : l'écran les rend en GRAISSE, jamais par une couleur seule — une mise en évidence invisible
 * en niveaux de gris ou pour un daltonien ne met rien en évidence.
 *
 * La comparaison se fait sur le texte NORMALISÉ (accents retirés, minuscules) tout en rendant le texte D'ORIGINE :
 * chercher « fenetre » doit souligner « Fenêtre » tel qu'il est écrit. PUR.
 */
export function morceauxMisEnEvidence(texte: string, saisie: string): { t: string; fort: boolean }[] {
  const termes = decouperTermes(saisie).map((x) => x.texte).filter((x) => x.length >= 2);
  if (termes.length === 0) return [{ t: texte, fort: false }];
  // On normalise une COPIE pour chercher, et on découpe l'ORIGINAL aux mêmes positions : les deux ont la même longueur
  //   (`translate` remplace caractère par caractère, il ne change jamais le nombre de lettres).
  const repere = normaliserPourReperage(texte);
  const marques = new Array<boolean>(texte.length).fill(false);
  for (const t of termes) {
    let i = repere.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marques[k] = true;
      i = repere.indexOf(t, i + t.length);
    }
  }
  const out: { t: string; fort: boolean }[] = [];
  let debut = 0;
  for (let i = 1; i <= texte.length; i++) {
    if (i === texte.length || marques[i] !== marques[debut]) {
      out.push({ t: texte.slice(debut, i), fort: marques[debut] });
      debut = i;
    }
  }
  return out;
}

const ACCENTS = 'àâäáãåÀÂÄÁÃÅéèêëÉÈÊËíìîïÍÌÎÏóòôöõÓÒÔÖÕúùûüÚÙÛÜçÇñÑýÿÝ';
const SANS____ = 'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnNyyY';
/** La MÊME normalisation que la base, caractère par caractère : les positions restent alignées sur l'original. PUR. */
function normaliserPourReperage(s: string): string {
  let out = '';
  for (const c of s.toLowerCase()) { const i = ACCENTS.indexOf(c); out += i === -1 ? c : SANS____[i]; }
  return out;
}
interface ReponseBoite {
  lignes: LigneBoite[];
  suivant: CurseurBoite | null;
  total: number | null;
  comptes: ComptesBoite | null;
  /** LOT 5c — présent sur une réponse de recherche : `false` quand la migration 237 n'est pas appliquée. */
  pleinTexte?: boolean;
  automatiquesMasques?: number | null;
}

type Etat =
  | { v: 'charge' }
  | {
      v: 'ok'; lignes: LigneBoite[]; suivant: CurseurBoite | null; total: number; comptes: ComptesBoite | null;
      pleinTexte: boolean; automatiquesMasques: number | null;
    }
  | { v: 'erreur'; m: string };

/**
 * Va chercher une page — de la LISTE, ou des RÉSULTATS quand un critère est posé. Une seule fonction pour les deux :
 * les deux rendent la même forme de ligne, et l'écran ne doit pas avoir deux façons d'afficher la même chose.
 * Rapporte, ne décide pas.
 */
async function chargerPage(
  curseur: CurseurBoite | null, auto: boolean, critere: Critere,
): Promise<ReponseBoite | { erreur: string }> {
  const p = new URLSearchParams();
  if (curseur) { p.set('depuis', curseur.dernierLe); p.set('avant', curseur.filId); }
  if (auto) p.set('auto', '1');
  const cherche = critereActif(critere);
  if (cherche) {
    if (critere.q.trim() !== '') p.set('q', critere.q);
    if (critere.du !== '') p.set('du', critere.du);
    if (critere.au !== '') p.set('au', critere.au);
    if (critere.de.trim() !== '') p.set('de', critere.de);
  }
  try {
    const url = cherche ? '/api/admin/gestion/boite/recherche' : '/api/admin/gestion/boite';
    const res = await fetch(`${url}?${p.toString()}`, { cache: 'no-store' });
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

/**
 * Met en évidence les mots cherchés. En GRAISSE (`<strong>`), donc perceptible en niveaux de gris et pour un
 * daltonien — une mise en évidence portée par la seule couleur n'en est pas une. Le texte reste du TEXTE : il n'est
 * jamais interprété comme du HTML.
 */
export function Evidence({ texte, saisie }: { texte: string; saisie: string }) {
  const morceaux = morceauxMisEnEvidence(texte, saisie);
  if (morceaux.length === 1 && !morceaux[0].fort) return <>{texte}</>;
  return <>{morceaux.map((m, i) => (m.fort ? <strong key={i} className="bte-trouve">{m.t}</strong> : <span key={i}>{m.t}</span>))}</>;
}

export function BoiteMail({ onOuvrir }: { onOuvrir: (filId: number) => void }) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [auto, setAuto] = useState(false);
  const [suite, setSuite] = useState(false);
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  // LOT 5c — la SAISIE en cours, et le critère VALIDÉ. Les deux sont distincts à dessein : on ne lance pas une
  //   recherche sur 56 000 messages à chaque frappe, on la lance quand la personne a fini de taper.
  const [saisie, setSaisie] = useState<Critere>(CRITERE_VIDE);
  const [critere, setCritere] = useState<Critere>(CRITERE_VIDE);
  const [filtres, setFiltres] = useState(false);

  // La date de référence n'est posée qu'APRÈS le montage : la calculer au rendu serveur ferait diverger l'hydratation.
  useEffect(() => { setMaintenant(new Date()); }, []);

  const premiere = useCallback(async (avecAuto: boolean, c: Critere) => {
    setEtat({ v: 'charge' });
    const r = await chargerPage(null, avecAuto, c);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    setEtat({
      v: 'ok', lignes: r.lignes, suivant: r.suivant, total: r.total ?? r.lignes.length, comptes: r.comptes,
      pleinTexte: r.pleinTexte !== false, automatiquesMasques: r.automatiquesMasques ?? null,
    });
  }, []);

  useEffect(() => { void premiere(auto, critere); }, [premiere, auto, critere]);

  async function voirPlus() {
    if (etat.v !== 'ok' || etat.suivant === null || suite) return;
    setSuite(true);
    const r = await chargerPage(etat.suivant, auto, critere);
    setSuite(false);
    if ('erreur' in r) { setEtat({ v: 'erreur', m: r.erreur }); return; }
    // On CONCATÈNE : « voir plus » allonge la liste, il ne la remplace pas — on ne perd jamais ce qu'on lisait.
    setEtat({
      ...etat, lignes: [...etat.lignes, ...r.lignes], suivant: r.suivant, total: etat.total, comptes: etat.comptes,
    });
  }

  if (etat.v === 'charge') return <p className="gst-info" role="status">Chargement de la boîte…</p>;
  if (etat.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">{etat.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void premiere(auto, critere)}>Réessayer</button>
      </div>
    );
  }

  const ref = maintenant ?? new Date();
  const cherche = critereActif(critere);
  return (
    <section aria-labelledby="bte-titre">
      <h2 className="gst-titre" id="bte-titre">
        {cherche ? 'Résultats' : 'Boîte mail'} {!cherche && <span className="gst-compte">{etat.total}</span>}
      </h2>

      {/* ══ LA RECHERCHE ══════════════════════════════════════════════════════════════════════════════════════════
          Un formulaire, donc « Entrée » cherche et le clavier des téléphones affiche « Rechercher ». La recherche ne
          part PAS à chaque frappe : sur 56 000 messages, ce serait une requête par lettre. */}
      <form className="bte-recherche" role="search" onSubmit={(e) => { e.preventDefault(); setCritere(saisie); }}>
        <div className="bte-champ-ligne">
          <input type="search" className="bte-champ" value={saisie.q} placeholder="Chercher dans le courrier"
            aria-label="Chercher dans le courrier"
            onChange={(e) => setSaisie({ ...saisie, q: e.target.value })} />
          <button type="submit" className="svv-btn svv-btn-primary gst-btn">Chercher</button>
        </div>
        <div className="bte-outils">
          <button type="button" className="gst-lien-bouton" aria-expanded={filtres} onClick={() => setFiltres((v) => !v)}>
            {filtres ? 'Masquer les filtres' : 'Filtres (période, expéditeur)'}
          </button>
          {cherche && (
            <button type="button" className="gst-lien-bouton"
              onClick={() => { setSaisie(CRITERE_VIDE); setCritere(CRITERE_VIDE); }}>
              Effacer la recherche
            </button>
          )}
        </div>
        {filtres && (
          <div className="bte-filtres">
            <label className="bte-filtre">
              <span>Du</span>
              <input type="date" className="bte-champ" value={saisie.du} onChange={(e) => setSaisie({ ...saisie, du: e.target.value })} />
            </label>
            <label className="bte-filtre">
              <span>Au</span>
              <input type="date" className="bte-champ" value={saisie.au} onChange={(e) => setSaisie({ ...saisie, au: e.target.value })} />
            </label>
            <label className="bte-filtre">
              <span>Expéditeur</span>
              <input type="text" className="bte-champ" value={saisie.de} placeholder="nom ou adresse"
                onChange={(e) => setSaisie({ ...saisie, de: e.target.value })} />
            </label>
          </div>
        )}
        {/* La recherche marche SANS la migration, en plus lent — et elle le DIT plutôt que de faire semblant. */}
        {cherche && !etat.pleinTexte && (
          <p className="gst-tronc">
            Recherche en mode réduit : elle balaie le courrier au lieu d’utiliser un index, et ne reconnaît pas les
            formes fléchies (« fuites » ne trouvera pas « fuite »). Elle sera complète une fois la mise à jour de la
            base appliquée.
          </p>
        )}
      </form>

      {/* EN RECHERCHE : combien de résultats la règle du courrier automatique écarte. Même phrase, même bouton. */}
      {cherche && etat.automatiquesMasques !== null && etat.automatiquesMasques > 0 && (
        <p className="gst-tronc">
          {etat.automatiquesMasques} résultat{etat.automatiquesMasques > 1 ? 's' : ''}
          {' '}ne contien{etat.automatiquesMasques > 1 ? 'nent' : 't'} que du courrier automatique et
          {' '}{etat.automatiquesMasques > 1 ? 'ne sont pas affichés' : 'n’est pas affiché'} ici. Rien n’est supprimé.
          {' '}
          <button type="button" className="gst-lien-bouton" aria-pressed={auto} onClick={() => setAuto((v) => !v)}>
            Afficher aussi le courrier automatique
          </button>
        </p>
      )}
      {cherche && auto && (
        <p className="gst-tronc">
          Le courrier automatique est inclus dans les résultats.{' '}
          <button type="button" className="gst-lien-bouton" aria-pressed onClick={() => setAuto(false)}>
            Masquer le courrier automatique
          </button>
        </p>
      )}

      {/* CE QUE LA LISTE NE MONTRE PAS, dit en toutes lettres — et ramené d'un geste. Jamais un masquage silencieux. */}
      {!cherche && etat.comptes !== null && etat.comptes.automatiques > 0 && (
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
        ? <p className="gst-vide">{cherche ? 'Aucun échange ne correspond à cette recherche.' : 'Aucun échange dans la boîte.'}</p>
        : (
          <ul className="gst-liste bte-liste">
            {etat.lignes.map((l) => (
              <li key={l.filId}>
                <button type="button" className="bte-ligne" onClick={() => onOuvrir(l.filId)}>
                  <span className="bte-haut">
                    <span className="bte-qui">{nomCorrespondant(l)}</span>
                    <span className="bte-quand" title={formaterDateFr(l.dernierLe)}>{depuis(l.dernierLe, ref)}</span>
                  </span>
                  <span className="bte-objet"><Evidence texte={nettoyerObjet(l.objet) || '(sans objet)'} saisie={critere.q} /></span>
                  {apercu(l.extrait) !== '' && (
                    <span className="bte-apercu">
                      {l.dernierSens === 'envoye' && <span className="bte-vous">Vous : </span>}
                      <Evidence texte={apercu(l.extrait)} saisie={critere.q} />
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
.bte-recherche{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}
.bte-champ-ligne{display:flex;flex-wrap:wrap;gap:8px}
/* 16 px MINIMUM : en dessous, iOS zoome à chaque fois qu'on clique dans le champ, et l'écran part de travers. */
.bte-champ{flex:1 1 12rem;min-width:0;min-height:44px;padding:.5rem .7rem;font-size:16px;
  border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.bte-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.bte-outils{display:flex;flex-wrap:wrap;gap:6px 14px}
.bte-filtres{display:flex;flex-wrap:wrap;gap:8px}
.bte-filtre{display:flex;flex-direction:column;gap:2px;flex:1 1 9rem;min-width:0;font-size:.78rem;color:var(--color-svv-muted)}
.bte-trouve{font-weight:800;text-decoration:underline;text-underline-offset:2px}
.bte-plus{margin-top:12px;width:100%}
@media (min-width:600px){.bte-plus{width:auto}}
`;
