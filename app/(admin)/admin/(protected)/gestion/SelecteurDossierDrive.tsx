'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * LOT 5-PJ-B — LE SÉLECTEUR DE DOSSIER DU DRIVE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 IL NE CRÉE RIEN. Pas de bouton « nouveau dossier », pas de renommage, pas de déplacement : le Drive est construit
 * à la main depuis des années, et la règle d'Arno est de ne pas réinventer ce qui existe. On CHOISIT une destination
 * dans l'arborescence réelle, c'est tout.
 *
 * MESURÉ le 25/09/2026 : ~15 000 dossiers, jusqu'à 13 niveaux de profondeur. D'où la forme retenue :
 *   · navigation PARESSEUSE, un niveau à la fois — on ne charge jamais l'arborescence entière ;
 *   · RECHERCHE par nom, tous Drive confondus : personne ne descend treize niveaux à la main ;
 *   · FIL D'ARIANE toujours visible — deux dossiers « Documents » à deux endroits sont la règle, pas l'exception ;
 *   · ouverture sur le DERNIER DOSSIER UTILISÉ POUR CET ÉCHANGE : dans la vraie vie, les pièces d'un même échange
 *     vont presque toujours au même endroit.
 *
 * 🔒 LE NAVIGATEUR NE PARLE JAMAIS À GOOGLE. Il demande à l'application, qui relit le droit et interroge le Drive avec
 * un jeton qui ne quitte pas le serveur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MOBILE D'ABORD : une seule colonne, cibles de 44 px, aucune action au survol seul, aucune couleur en dur.
 */

interface Dossier { id: string; nom: string; driveId: string | null }
interface Etape { id: string; nom: string }

type Vue =
  | { v: 'charge' }
  | { v: 'ok'; dossiers: Dossier[]; ariane: Etape[]; mode: 'racines' | 'navigation' | 'recherche' }
  | { v: 'indisponible'; message: string };

export interface CibleDepot { id: string; nom: string }

export function SelecteurDossierDrive({ filId, titre, onChoisir, onFermer }: {
  /** Sert à rouvrir sur le dernier dossier utilisé POUR CET ÉCHANGE. */
  filId: number | null;
  titre: string;
  onChoisir: (cible: CibleDepot) => void;
  onFermer: () => void;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  const [parent, setParent] = useState<{ id: string; driveId: string | null } | null>(null);
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  /** Le dossier mis en avant : celui sur lequel on est, et qu'on peut choisir tel quel. */
  const [courant, setCourant] = useState<CibleDepot | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setVue({ v: 'charge' });
    const p = new URLSearchParams();
    if (recherche.trim() !== '') p.set('q', recherche.trim());
    else if (parent) { p.set('parent', parent.id); if (parent.driveId) p.set('drive', parent.driveId); }
    if (filId !== null) p.set('fil', String(filId));
    try {
      const res = await fetch(`/api/admin/gestion/drive/dossiers?${p}`, { cache: 'no-store' });
      const d = (await res.json()) as {
        etat: string; message?: string; mode?: Vue extends { mode: infer M } ? M : never;
        dossiers?: Dossier[]; ariane?: Etape[]; dernier?: { id: string; nom: string | null } | null;
      };
      if (d.etat !== 'ok') {
        // « Pas de schéma », « pas connecté », « expiré » : trois raisons DIFFÉRENTES, trois messages différents.
        setVue({ v: 'indisponible', message: d.message ?? 'Le Drive n’est pas joignable.' });
        return;
      }
      // À la toute première ouverture, on saute au dernier dossier utilisé pour cet échange.
      if (d.mode === 'racines' && parent === null && recherche === '' && d.dernier) {
        setParent({ id: d.dernier.id, driveId: null });
        setCourant({ id: d.dernier.id, nom: d.dernier.nom ?? 'dossier précédent' });
        return; // le rechargement est déclenché par le changement de `parent`
      }
      const ariane = d.ariane ?? [];
      setVue({ v: 'ok', dossiers: d.dossiers ?? [], ariane, mode: (d.mode ?? 'racines') as 'racines' });
      const dernier = ariane[ariane.length - 1];
      setCourant(dernier ? { id: dernier.id, nom: dernier.nom } : null);
    } catch {
      setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' });
    }
  }, [parent, recherche, filId]);

  useEffect(() => { void charger(); }, [charger]);

  return (
    <div className="dsel" role="dialog" aria-label={titre} aria-modal="true">
      <div className="dsel-barre">
        <strong className="dsel-titre">{titre}</strong>
        <button type="button" className="dsel-fermer" onClick={onFermer} aria-label="Fermer le sélecteur">✕</button>
      </div>

      {/* ══ LA RECHERCHE ══ On soumet EXPLICITEMENT : chercher à chaque frappe enverrait une requête Google par
          caractère, et le Drive n'aime pas ça. */}
      <form
        className="dsel-recherche"
        onSubmit={(e) => { e.preventDefault(); setParent(null); setRecherche(saisie); }}
      >
        <input
          className="dsel-champ" type="search" value={saisie} placeholder="Chercher un dossier par son nom…"
          aria-label="Chercher un dossier par son nom" onChange={(e) => setSaisie(e.target.value)}
        />
        <button type="submit" className="dsel-bouton">Chercher</button>
        {recherche !== '' && (
          <button type="button" className="dsel-bouton" onClick={() => { setSaisie(''); setRecherche(''); setParent(null); }}>
            Tout le Drive
          </button>
        )}
      </form>

      {vue.v === 'charge' && <p className="dsel-info" role="status">Lecture du Drive…</p>}

      {/* Une indisponibilité DIT laquelle : « non connecté » et « expiré » ne se réparent pas de la même façon. */}
      {vue.v === 'indisponible' && <p className="dsel-info dsel-info--stop" role="status">{vue.message}</p>}

      {vue.v === 'ok' && (
        <>
          {vue.mode !== 'recherche' && (
            <nav className="dsel-ariane" aria-label="Chemin du dossier">
              <button type="button" className="dsel-miette" onClick={() => setParent(null)}>Drive</button>
              {vue.ariane.map((e) => (
                <span key={e.id}>
                  <span className="dsel-sep" aria-hidden="true">›</span>
                  <button type="button" className="dsel-miette" onClick={() => setParent({ id: e.id, driveId: null })}>{e.nom}</button>
                </span>
              ))}
            </nav>
          )}

          {vue.mode === 'recherche' && (
            <p className="dsel-info">
              {vue.dossiers.length} dossier{vue.dossiers.length > 1 ? 's' : ''} dont le nom contient « {recherche} ».
              {' '}La recherche de Google tient compte des accents et ne devine rien.
            </p>
          )}

          <ul className="dsel-liste">
            {vue.dossiers.map((d) => (
              <li key={d.id} className="dsel-item">
                {/* OUVRIR et CHOISIR sont deux gestes SÉPARÉS : cliquer sur un dossier pour entrer dedans, et
                    vouloir y déposer, ne sont pas la même intention — les confondre déposerait au mauvais endroit. */}
                <button
                  type="button" className="dsel-ouvrir"
                  onClick={() => { setRecherche(''); setSaisie(''); setParent({ id: d.id, driveId: d.driveId }); }}
                >
                  <span aria-hidden="true">📁</span> {d.nom}
                </button>
                <button type="button" className="dsel-choisir" onClick={() => onChoisir({ id: d.id, nom: d.nom })}>
                  Déposer ici
                </button>
              </li>
            ))}
            {vue.dossiers.length === 0 && (
              <li className="dsel-info">{vue.mode === 'recherche' ? 'Aucun dossier de ce nom.' : 'Ce dossier n’en contient aucun autre.'}</li>
            )}
          </ul>

          {/* Déposer DANS le dossier où l'on se trouve : sans ça, il faudrait remonter d'un cran pour le choisir. */}
          {courant !== null && vue.mode === 'navigation' && (
            <button type="button" className="dsel-ici" onClick={() => onChoisir(courant)}>
              Déposer dans « {courant.nom} »
            </button>
          )}
        </>
      )}
    </div>
  );
}

export const CSS_SELECTEUR_DRIVE = `
.dsel{display:flex;flex-direction:column;gap:.5rem;padding:.6rem;border:1px solid var(--color-svv-line);
  border-radius:.6rem;background:var(--color-svv-surface);margin-top:.5rem}
.dsel-barre{display:flex;align-items:center;gap:8px}
.dsel-titre{font-size:.9rem;color:var(--color-svv-ink)}
.dsel-fermer{margin-left:auto;min-width:44px;min-height:44px;border:1px solid transparent;border-radius:.45rem;
  background:transparent;color:var(--color-svv-ink);cursor:pointer;font-size:1rem}
.dsel-fermer:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.dsel-fermer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.dsel-recherche{display:flex;flex-wrap:wrap;gap:6px}
.dsel-champ{flex:1 1 12rem;min-width:0;min-height:44px;padding:0 .6rem;border-radius:.45rem;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field);color:var(--color-svv-ink)}
.dsel-champ:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.dsel-bouton{min-height:44px;padding:0 .7rem;border-radius:.45rem;border:1px solid var(--color-svv-line);
  background:var(--color-svv-field);color:var(--color-svv-ink);cursor:pointer;font-size:.82rem}
.dsel-bouton:hover{border-color:var(--color-svv-ink-soft)}
.dsel-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.dsel-ariane{display:flex;flex-wrap:wrap;align-items:center;gap:2px;font-size:.8rem}
.dsel-miette{min-height:44px;padding:0 .35rem;border:1px solid transparent;border-radius:.35rem;background:transparent;
  color:var(--color-svv-ink);cursor:pointer;font-size:.8rem;text-decoration:underline}
.dsel-miette:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.dsel-miette:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.dsel-sep{color:var(--color-svv-ink-soft);padding:0 .1rem}

.dsel-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;
  max-height:15rem;overflow-y:auto}
.dsel-item{display:flex;flex-wrap:wrap;align-items:center;gap:4px;border-bottom:1px solid var(--color-svv-line)}
.dsel-ouvrir{flex:1 1 10rem;min-width:0;min-height:44px;text-align:left;padding:0 .4rem;border:1px solid transparent;
  border-radius:.35rem;background:transparent;color:var(--color-svv-ink);cursor:pointer;font-size:.85rem;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsel-ouvrir:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.dsel-ouvrir:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.dsel-choisir{min-height:44px;padding:0 .6rem;border-radius:.45rem;border:1px solid var(--color-svv-line);
  background:var(--color-svv-field);color:var(--color-svv-ink);cursor:pointer;font-size:.78rem;white-space:nowrap}
.dsel-choisir:hover{border-color:var(--color-svv-ink-soft)}
.dsel-choisir:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

.dsel-ici{min-height:44px;padding:0 .7rem;border-radius:.45rem;border:1px solid var(--color-svv-red);
  background:var(--color-svv-red);color:#fff;cursor:pointer;font-size:.85rem}
.dsel-ici:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}

.dsel-info{font-size:.8rem;color:var(--color-svv-ink-soft);margin:0}
/* Une indisponibilité est dite par un MOT, jamais par une seule couleur. */
.dsel-info--stop{color:var(--color-svv-ink);font-weight:600}
`;
