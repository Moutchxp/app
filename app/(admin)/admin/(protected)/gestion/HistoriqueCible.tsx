'use client';

import { useCallback, useEffect, useState } from 'react';
import { CSS_PIECES, PiecesJointes } from './PiecesJointes';
import { motSorte, CSS_ENCART_RATTACHEMENT } from './EncartRattachement';
import { dateHeureCourte, formaterTaille, libelleSens } from '../../../../lib/gestion/ecran';
import { corpsLisible, trierPieces } from '../../../../lib/gestion/lisibilite';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import {
  ecrireFiltres, filtreActif, grouperParCible, libelleInterlocuteur, resumeEntete, texteCible,
  FILTRES_VIDES, PAGE_HISTORIQUE,
  type EnteteHistorique, type FiltresHistorique, type Interlocuteur, type LigneHistorique,
} from '../../../../lib/gestion/historique';
import type { Cible } from '../../../../lib/gestion/rattachement';

/**
 * LOT RATTACHEMENT-2 — TOUT L'HISTORIQUE D'UN LOGEMENT, D'UN PROPRIÉTAIRE OU D'UN ÉVÉNEMENT, D'UN CLIC.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND : « montre-moi tout ce qui s'est dit à propos de ce logement ». Mails AVEC et SANS pièce jointe,
 * le plus récent en haut. C'est la question pour laquelle la trace des adresses et les rattachements ont été
 * construits, et c'est la première fois qu'on peut y répondre sans ouvrir WIPPIMMO à côté.
 *
 * 🔴 CE QUI EST RATTACHÉ EST DANS LA FRISE ; CE QUI EST PROPOSÉ EST À PART, grisé, avec ses deux boutons. Mélanger les
 * deux ferait lire comme un fait ce qui n'est qu'une hypothèse — et un historique ne vaut que si l'on peut s'y fier.
 *
 * 🔴 AUCUNE REQUÊTE SUR TOUT L'HISTORIQUE D'UN COUP : la frise se charge par pages de 25, et « Voir la suite » ajoute
 * la page suivante sans recharger le reste. Le lot le plus fourni (429 mails) s'ouvre donc comme les autres.
 *
 * ⚠️ LES PIÈCES SONT RENDUES PAR `PiecesJointes`, LE COMPOSANT EXISTANT — miniatures, « Télécharger », « Drive »,
 * « Tout télécharger ». On n'en écrit pas un second : deux rendus des mêmes pièces finiraient par se contredire, et
 * c'est celui qu'on regarde le moins qui garderait le défaut.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Proposition {
  id: number;
  messageId: number;
  cible: Cible;
  libelle: string;
  motif: string | null;
  confiance: string | null;
  objet: string | null;
  recuLe: string;
  de: string;
  nbPieces: number;
}

interface Donnees {
  cible: Cible;
  titre: string;
  sousTitre: string | null;
  libelles: Record<string, string>;
  proprietaireDuLot: { cle: string; libelle: string } | null;
  logementsDuProprietaire: { cle: string; libelle: string }[];
  lignes: LigneHistorique[];
  suite: boolean;
  entete: EnteteHistorique;
  total: EnteteHistorique;
  interlocuteurs: Interlocuteur[];
  interlocuteursTronques: boolean;
  propositions: Proposition[];
}

type Etat = 'charge' | 'ok' | 'sans_schema' | 'inconnue' | 'erreur';

export function HistoriqueCible({ cible, maintenant, onRetour, onOuvrirFil, onCible, onGeste }: {
  cible: Cible;
  maintenant: Date;
  onRetour: () => void;
  /** Ouvrir l'échange d'un mail, comme aujourd'hui : dans la boîte, en pleine page. */
  onOuvrirFil?: (filId: number) => void;
  /** Sauter à l'historique d'une AUTRE cible (le propriétaire du logement, un logement du propriétaire). */
  onCible?: (c: Cible) => void;
  onGeste?: (message: string) => void;
}) {
  const [etat, setEtat] = useState<Etat>('charge');
  const [d, setD] = useState<Donnees | null>(null);
  const [f, setF] = useState<FiltresHistorique>({ ...FILTRES_VIDES });
  /** Les pages DÉJÀ chargées, accumulées : « Voir la suite » ajoute, il ne remplace pas. */
  const [pages, setPages] = useState<LigneHistorique[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [deplie, setDeplie] = useState<Set<number>>(new Set());

  const cleCible = texteCible(cible);

  const charger = useCallback(async (filtres: FiltresHistorique, ajouter: boolean) => {
    if (!ajouter) setEtat('charge');
    setOccupe(true);
    try {
      const res = await fetch(
        `/api/admin/gestion/historique?cible=${encodeURIComponent(cleCible)}`
        + `${ecrireFiltres(filtres).replace(/^\?/, '&')}`, { cache: 'no-store' });
      const j = (await res.json()) as { etat?: string; data?: Donnees };
      if (j.etat === 'ok' && j.data) {
        setD(j.data);
        setPages((p) => (ajouter ? [...p, ...(j.data?.lignes ?? [])] : (j.data?.lignes ?? [])));
        setEtat('ok');
      } else if (j.etat === 'sans_schema') setEtat('sans_schema');
      else if (j.etat === 'inconnue') setEtat('inconnue');
      else setEtat('erreur');
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  }, [cleCible]);

  // La cible change ⇒ on repart de zéro : filtres remis, pages vidées.
  useEffect(() => {
    const neufs = { ...FILTRES_VIDES };
    setF(neufs);
    setPages([]);
    setDeplie(new Set());
    void charger(neufs, false);
  }, [charger]);

  const appliquer = (maj: Partial<FiltresHistorique>): void => {
    // Tout changement de filtre remet la pagination à zéro : garder la page 3 d'un autre filtre n'aurait aucun sens.
    const neufs = { ...f, ...maj, page: 0 };
    setF(neufs);
    setPages([]);
    void charger(neufs, false);
  };

  const suivante = (): void => {
    const neufs = { ...f, page: f.page + 1 };
    setF(neufs);
    void charger(neufs, true);
  };

  /** Confirmer ou rejeter une proposition — par la route des rattachements, le SEUL chemin d'écriture. */
  const trancher = async (p: Proposition, statut: 'confirme' | 'rejete'): Promise<void> => {
    setOccupe(true);
    try {
      const res = await fetch('/api/admin/gestion/rattachements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lienId: p.id, statut }),
      });
      const j = (await res.json()) as { ok?: boolean; erreur?: string };
      if (res.ok && j.ok === true) {
        onGeste?.(statut === 'confirme' ? `Rattachement confirmé : ${p.libelle}` : `Proposition rejetée : ${p.libelle}`);
        const neufs = { ...f, page: 0 };
        setF(neufs);
        setPages([]);
        await charger(neufs, false);
      } else {
        onGeste?.(j.erreur ?? 'Le geste n’a pas abouti.');
      }
    } catch {
      onGeste?.('Le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  /**
   * L'HISTORIQUE RECOUVRE-T-IL PLUS D'UNE CIBLE ? Chez un logement quand on inclut son propriétaire ; chez un
   * propriétaire quand on inclut ses logements. C'est la seule condition où écrire la cible de chaque ligne renseigne
   * au lieu de répéter le titre de la page.
   */
  const plusieursCibles = (cible.sorte === 'lot' && f.avecProprietaire)
    || (cible.sorte === 'proprietaire' && f.avecLogements && (d?.logementsDuProprietaire.length ?? 0) > 0);

  return (
    <section className="hst" aria-labelledby="hst-titre">
      <style>{CSS_HISTORIQUE}</style>
      <style>{CSS_PIECES}</style>
      <style>{CSS_ENCART_RATTACHEMENT}</style>

      <div className="hst-entete">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onRetour}>← Écran partagé</button>
        <div className="hst-identite">
          <span className="hst-sorte">{motSorte(cible.sorte)}</span>
          <h2 className="hst-titre" id="hst-titre">{d?.titre ?? '…'}</h2>
          {d?.sousTitre && <p className="hst-sous">{d.sousTitre}</p>}
        </div>
      </div>

      {etat === 'sans_schema' && (
        <p className="gst-tronc">
          Historique pas encore installé : la mise à jour de la base (migration 257) reste à appliquer.
        </p>
      )}
      {etat === 'inconnue' && (
        <p className="gst-tronc">
          Cette cible n’existe pas (ou plus) dans l’annuaire. Rien n’a été supprimé : c’est l’import WIPPIMMO qui
          ne la porte plus.
        </p>
      )}
      {etat === 'erreur' && <p className="gst-tronc" role="alert">L’historique n’a pas pu être lu. Réessayez.</p>}
      {etat === 'charge' && <p className="gst-info" role="status">Chargement de l’historique…</p>}

      {etat === 'ok' && d !== null && (
        <>
          {/* ══ LE COMPTEUR ══════════════════════════════════════════════════════════════════════════════════════
              DEUX chiffres quand un filtre est posé : ce qu'on regarde, ET ce qu'il y a. N'en donner qu'un ferait
              croire que l'historique est plus court qu'il n'est. */}
          <p className="hst-compte" role="status">
            {resumeEntete(d.entete)}
            {d.entete.premierLe && d.entete.dernierLe && (
              <>
                {' · du '}{dateHeureCourte(d.entete.premierLe, maintenant)}
                {' au '}{dateHeureCourte(d.entete.dernierLe, maintenant)}
              </>
            )}
            {filtreActif(f) && d.total.nbMails !== d.entete.nbMails && (
              <span className="hst-sur"> — sur {d.total.nbMails} au total</span>
            )}
          </p>

          {/* ══ LES INTERRUPTEURS DE PÉRIMÈTRE ═══════════════════════════════════════════════════════════════════ */}
          <div className="hst-perimetre" role="group" aria-label="Ce que l’historique recouvre">
            {cible.sorte === 'lot' && d.proprietaireDuLot !== null && (
              <label className="hst-bascule">
                <input type="checkbox" checked={f.avecProprietaire} disabled={occupe}
                  onChange={(e) => appliquer({ avecProprietaire: e.target.checked })} />
                <span>Inclure les mails du propriétaire ({d.proprietaireDuLot.libelle})</span>
              </label>
            )}
            {cible.sorte === 'proprietaire' && d.logementsDuProprietaire.length > 0 && (
              <>
                <label className="hst-bascule">
                  <input type="checkbox" checked={f.avecLogements} disabled={occupe}
                    onChange={(e) => appliquer({ avecLogements: e.target.checked })} />
                  <span>Inclure les mails de ses {d.logementsDuProprietaire.length} logement(s)</span>
                </label>
                <label className="hst-bascule">
                  <input type="checkbox" checked={f.grouper} disabled={occupe}
                    onChange={(e) => appliquer({ grouper: e.target.checked })} />
                  <span>Regrouper par logement</span>
                </label>
              </>
            )}
            {cible.sorte === 'lot' && d.proprietaireDuLot !== null && onCible && (
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => onCible({ sorte: 'proprietaire', cle: d.proprietaireDuLot?.cle ?? null, id: null })}>
                Voir l’historique du propriétaire →
              </button>
            )}
          </div>

          {/* ══ LES FILTRES ══════════════════════════════════════════════════════════════════════════════════════ */}
          <div className="hst-filtres" role="group" aria-label="Filtrer l’historique">
            <label className="hst-champ">
              <span>Rechercher</span>
              <input type="search" value={f.texte} disabled={occupe}
                placeholder="dans l’objet et le texte"
                onChange={(e) => setF({ ...f, texte: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') appliquer({ texte: f.texte }); }} />
            </label>
            <label className="hst-champ">
              <span>Du</span>
              <input type="date" value={f.du ?? ''} disabled={occupe}
                onChange={(e) => appliquer({ du: e.target.value === '' ? null : e.target.value })} />
            </label>
            <label className="hst-champ">
              <span>Au</span>
              <input type="date" value={f.au ?? ''} disabled={occupe}
                onChange={(e) => appliquer({ au: e.target.value === '' ? null : e.target.value })} />
            </label>
            <div className="hst-boutons" role="group" aria-label="Pièces jointes">
              {([['toutes', 'Tous'], ['avec', 'Avec pièce'], ['sans', 'Sans pièce']] as const).map(([v, mot]) => (
                <button key={v} type="button" disabled={occupe}
                  className={`svv-btn gst-btn ${f.pieces === v ? 'svv-btn-primary' : 'svv-btn-outline'}`}
                  aria-pressed={f.pieces === v} onClick={() => appliquer({ pieces: v })}>
                  {mot}
                </button>
              ))}
            </div>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe}
              onClick={() => appliquer({ texte: f.texte })}>Appliquer</button>
            {filtreActif(f) && (
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => appliquer({
                  texte: '', du: null, au: null, pieces: 'toutes', interlocuteurs: [],
                })}>
                Tout afficher
              </button>
            )}
          </div>

          {/* ══ LE FILTRE PAR INTERLOCUTEUR ══════════════════════════════════════════════════════════════════════
              La liste ne rétrécit PAS quand on coche : sinon on ne pourrait plus en ajouter un second, et le filtre
              se refermerait sur lui-même. */}
          {d.interlocuteurs.length > 0 && (
            <details className="hst-inter" open={f.interlocuteurs.length > 0}>
              <summary className="hst-inter-titre">
                Interlocuteurs ({d.interlocuteurs.length}{d.interlocuteursTronques ? '+' : ''})
                {f.interlocuteurs.length > 0 && ` — ${f.interlocuteurs.length} coché(s)`}
              </summary>
              <ul className="hst-inter-liste">
                {d.interlocuteurs.map((i) => (
                  <li key={i.adresse}>
                    <label className="hst-inter-ligne">
                      <input type="checkbox" disabled={occupe}
                        checked={f.interlocuteurs.includes(i.adresse)}
                        onChange={(e) => appliquer({
                          interlocuteurs: e.target.checked
                            ? [...f.interlocuteurs, i.adresse]
                            : f.interlocuteurs.filter((a) => a !== i.adresse),
                        })} />
                      <span className="hst-inter-nom">{libelleInterlocuteur(i)}</span>
                      {/* NOS adresses sont montrées — elles font partie de l'échange — mais DITES comme telles. */}
                      {i.interne && <span className="hst-inter-note">nous</span>}
                      <span className="hst-inter-n">{i.nbMails}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {d.interlocuteursTronques && (
                <p className="hst-note">D’autres interlocuteurs existent — affinez la période pour les voir.</p>
              )}
            </details>
          )}

          {/* ══ LES PROPOSITIONS, À PART ET GRISÉES ══════════════════════════════════════════════════════════════ */}
          {d.propositions.length > 0 && (
            <div className="hst-props">
              <p className="hst-props-titre">
                {d.propositions.length} proposition{d.propositions.length > 1 ? 's' : ''} non confirmée
                {d.propositions.length > 1 ? 's' : ''} — elles ne sont PAS dans la frise ci-dessous
              </p>
              <ul className="ert-liste">
                {d.propositions.map((p) => (
                  <li key={p.id} className="ert-ligne ert-ligne--propose">
                    <span className="ert-sorte">{motSorte(p.cible.sorte)}</span>
                    <span className="ert-nom">{nettoyerObjet(p.objet ?? '') || '(sans objet)'}</span>
                    <span className="ert-source">{p.recuLe.slice(0, 10)} · {p.de}</span>
                    {p.nbPieces > 0 && <span className="ert-source">{p.nbPieces} pièce(s)</span>}
                    {p.motif && <span className="ert-motif">{p.motif}</span>}
                    <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe}
                      onClick={() => void trancher(p, 'confirme')}>Confirmer</button>
                    <button type="button" className="gst-lien-bouton" disabled={occupe}
                      onClick={() => void trancher(p, 'rejete')}>Rejeter</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ══ LA FRISE ═════════════════════════════════════════════════════════════════════════════════════════ */}
          {pages.length === 0 ? (
            <p className="gst-vide">
              {filtreActif(f)
                ? 'Aucun mail ne correspond à ces filtres. Rien n’a été perdu : « Tout afficher » les ramène.'
                : 'Aucun échange rattaché pour l’instant. La file « À trier » permet d’en rattacher à la main.'}
            </p>
          ) : f.grouper ? (
            grouperParCible(pages).map((g) => (
              <div key={texteCible(g.cible)} className="hst-groupe">
                <h3 className="hst-groupe-titre">
                  {g.libelle} <span className="gst-compte">{g.lignes.length}</span>
                  {onCible && !(g.cible.sorte === cible.sorte && g.cible.cle === cible.cle) && (
                    <button type="button" className="gst-lien-bouton" onClick={() => onCible(g.cible)}>ouvrir</button>
                  )}
                </h3>
                <Frise lignes={g.lignes} maintenant={maintenant} deplie={deplie} setDeplie={setDeplie}
                  onOuvrirFil={onOuvrirFil} libelles={d.libelles} avecCible={false} />
              </div>
            ))
          ) : (
            /* La cible de chaque ligne n'est écrite que si l'historique en recouvre PLUSIEURS — sinon elle répéterait
               le titre de la page à chaque ligne, ce qui est du bruit. */
            <Frise lignes={pages} maintenant={maintenant} deplie={deplie} setDeplie={setDeplie}
              onOuvrirFil={onOuvrirFil} libelles={d.libelles} avecCible={plusieursCibles} />
          )}

          {d.suite && (
            <div className="hst-suite">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={suivante}>
                {occupe ? 'Chargement…' : `Voir les ${PAGE_HISTORIQUE} suivants`}
              </button>
              <span className="hst-note">{pages.length} affichés sur {d.entete.nbMails}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * LA FRISE ELLE-MÊME. Extraite pour être rendue soit à plat, soit dans un groupe — une seule définition, donc un seul
 * comportement.
 */
function Frise({ lignes, maintenant, deplie, setDeplie, onOuvrirFil, avecCible }: {
  lignes: readonly LigneHistorique[];
  maintenant: Date;
  deplie: Set<number>;
  setDeplie: (s: Set<number>) => void;
  onOuvrirFil?: (filId: number) => void;
  libelles: Record<string, string>;
  /** Afficher sous quelle cible le mail entre dans l'historique (utile chez un propriétaire, inutile dans un groupe). */
  avecCible: boolean;
}) {
  return (
    <ol className="hst-frise">
      {lignes.map((l) => {
        const { vraies, signatures } = trierPieces(l.pieces);
        const ouvert = deplie.has(l.messageId);
        const lisible = l.extrait === null ? null : corpsLisible(l.extrait);
        return (
          <li key={`${l.messageId}-${texteCible(l.parCible)}`} className="hst-item">
            <div className="hst-item-tete">
              {/* LE SENS EN MOTS (« reçu de » / « envoyé à ») : il reste lisible en niveaux de gris. */}
              <span className="hst-quand">{dateHeureCourte(l.recuLe, maintenant)}</span>
              <span className="hst-qui">
                {libelleSens(l.sens)} {(l.deNom ?? '').trim() === '' ? l.de : l.deNom}
              </span>
              {l.source === 'carte' && <span className="hst-source">sur cette carte</span>}
              {avecCible && <span className="hst-source">{l.cibleLibelle}</span>}
            </div>

            <p className="hst-objet">{nettoyerObjet(l.objet ?? '') || '(sans objet)'}</p>

            {l.destinataires.length > 0 && (
              <p className="hst-dest">
                À : {l.destinataires.slice(0, 4).join(', ')}
                {l.destinataires.length > 4 && ' et d’autres'}
              </p>
            )}

            {lisible !== null && lisible.visible !== '' && (
              <p className={`hst-extrait${ouvert ? ' hst-extrait--ouvert' : ''}`}>{lisible.visible}</p>
            )}

            {l.pieces.length > 0 && (
              ouvert ? (
                <PiecesJointes messageId={l.messageId} filId={l.filId} vraies={vraies} signatures={signatures} />
              ) : (
                <button type="button" className="gst-lien-bouton" onClick={() => {
                  const s = new Set(deplie);
                  s.add(l.messageId);
                  setDeplie(s);
                }}>
                  {/* On annonce le POIDS avant de charger les miniatures : 11 pièces de 40 Mo ne se déplient pas par
                      surprise sur un téléphone. */}
                  {l.pieces.length} pièce{l.pieces.length > 1 ? 's' : ''} jointe{l.pieces.length > 1 ? 's' : ''}
                  {' — '}{formaterTaille(l.pieces.reduce((t, p) => t + (p.tailleOctets ?? 0), 0))}
                </button>
              )
            )}

            {onOuvrirFil && (
              <button type="button" className="gst-lien-bouton hst-ouvrir" onClick={() => onOuvrirFil(l.filId)}>
                Ouvrir l’échange
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export const CSS_HISTORIQUE = `
/* Mobile d'abord : une colonne, tout s'enroule, aucune largeur fixe, cibles tactiles de 44 px minimum.
   Aucune information ne tient à une couleur — le sens, la source et la cible sont écrits. */
.hst{display:flex;flex-direction:column;gap:.7rem;min-width:0}
.hst-entete{display:flex;flex-wrap:wrap;align-items:flex-start;gap:.6rem}
.hst-identite{flex:1 1 16rem;min-width:0}
.hst-sorte{display:block;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted)}
.hst-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hst-sous{margin:2px 0 0;font-size:.82rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.hst-compte{margin:0;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hst-sur{font-weight:400;color:var(--color-svv-muted)}
.hst-perimetre{display:flex;flex-direction:column;gap:.25rem}
.hst-bascule{display:flex;align-items:center;gap:.45rem;min-height:44px;font-size:.85rem;cursor:pointer;
  overflow-wrap:anywhere}
.hst-bascule input{min-width:20px;min-height:20px}
.hst-filtres{display:flex;flex-wrap:wrap;align-items:flex-end;gap:.5rem;padding:10px 12px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field)}
.hst-champ{display:flex;flex-direction:column;gap:2px;flex:1 1 9rem;min-width:0;font-size:.74rem;
  color:var(--color-svv-muted)}
.hst-champ input{min-height:44px;padding:6px 8px;border-radius:8px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-bg,#fff);color:var(--color-svv-ink);font:inherit;font-size:.85rem;min-width:0}
.hst-champ input:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.hst-boutons{display:flex;flex-wrap:wrap;gap:.3rem}
.hst-inter{border:1px solid var(--color-svv-line);border-radius:10px;padding:8px 12px}
.hst-inter-titre{font-size:.82rem;font-weight:700;color:var(--color-svv-ink);cursor:pointer;min-height:44px;
  display:flex;align-items:center}
.hst-inter-liste{list-style:none;margin:.3rem 0 0;padding:0;display:flex;flex-direction:column;gap:1px;
  max-height:min(40vh,260px);overflow-y:auto}
.hst-inter-ligne{display:flex;align-items:center;gap:.45rem;min-height:44px;padding:2px 4px;border-radius:6px;
  font-size:.82rem;cursor:pointer;overflow-wrap:anywhere}
.hst-inter-ligne:hover{background:var(--color-svv-line)}
.hst-inter-ligne input{min-width:20px;min-height:20px}
.hst-inter-nom{flex:1 1 auto;min-width:0}
.hst-inter-note{font-size:.7rem;font-weight:700;text-transform:uppercase;color:var(--color-svv-muted)}
.hst-inter-n{font-variant-numeric:tabular-nums;color:var(--color-svv-muted)}
.hst-note{margin:.2rem 0 0;font-size:.76rem;color:var(--color-svv-muted)}
.hst-props{padding:10px 12px;border-radius:10px;border:1px dashed var(--color-svv-line);
  background:var(--color-svv-field);opacity:.92}
.hst-props-titre{margin:0 0 .3rem;font-size:.78rem;font-weight:700;color:var(--color-svv-muted);
  overflow-wrap:anywhere}
.hst-groupe{display:flex;flex-direction:column;gap:.3rem}
.hst-groupe-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;margin:.4rem 0 0;font-size:.88rem;
  font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hst-frise{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.45rem}
.hst-item{display:flex;flex-direction:column;gap:.2rem;padding:10px 12px;border-radius:10px;
  border:1px solid var(--color-svv-line);min-width:0}
.hst-item-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.78rem;
  color:var(--color-svv-muted)}
.hst-quand{font-variant-numeric:tabular-nums}
.hst-qui{font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hst-source{font-size:.72rem;font-style:italic}
.hst-objet{margin:0;font-size:.9rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hst-dest{margin:0;font-size:.76rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.hst-extrait{margin:.15rem 0 0;font-size:.83rem;line-height:1.5;color:var(--color-svv-ink);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hst-extrait--ouvert{-webkit-line-clamp:unset;overflow:visible}
.hst-ouvrir{align-self:flex-start}
.hst-item .gst-lien-bouton{min-height:44px}
.hst-suite{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
`;
