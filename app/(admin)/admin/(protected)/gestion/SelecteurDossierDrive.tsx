'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { dateHeureCourte } from '../../../../lib/gestion/ecran';

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
 *   · FIL D'ARIANE toujours visible — deux dossiers « Documents » à deux endroits sont la règle, pas l'exception.
 *
 * 🔴 LOT 5-PJ-D — ON S'OUVRE SUR LES DOSSIERS RÉCENTS, comme « Ajouter à Drive » dans Gmail (demande d'Arno du
 * 25/09 : « exactement le même fonctionnement que dans Gmail »). En tête, s'il existe, le dernier dossier utilisé
 * POUR CET ÉCHANGE ; puis les derniers dossiers où un dépôt a réussi, tous collaborateurs confondus. Chaque ligne
 * porte son CHEMIN (deux « Documents » ne se distinguent que par là) et la date du dernier dépôt. Sous la liste,
 * « Parcourir tout le Drive » ouvre la racine — navigation et recherche strictement inchangées.
 *
 * 🔴 LES DEUX REGROUPEMENTS N'ONT PLUS DE « DÉPOSER ICI ». « Drives partagés » et « Partagés avec moi » ne sont pas
 * des dossiers : le bouton y promettait un geste que Google aurait refusé après le téléversement. Le serveur refuse
 * aussi, de son côté (`cibleDepot.ts`) — un bouton retiré met l'écran d'accord avec la réalité, il ne protège de rien.
 *
 * 🔒 LE NAVIGATEUR NE PARLE JAMAIS À GOOGLE. Il demande à l'application, qui relit le droit et interroge le Drive avec
 * un jeton qui ne quitte pas le serveur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MOBILE D'ABORD : une seule colonne, cibles de 44 px, aucune action au survol seul, aucune couleur en dur.
 */

interface Dossier {
  /** L'identifiant où l'on ENTRE et où l'on DÉPOSE. Pour un raccourci, c'est celui de sa CIBLE. */
  id: string;
  nom: string;
  driveId: string | null;
  /** LOT 5-PJ-C — vrai quand l'entrée est un raccourci : dit par une icône ET par le MOT « raccourci ». */
  raccourci?: boolean;
  /** LOT 5-PJ-D — vrai pour « Drives partagés » et « Partagés avec moi » : on y ENTRE, on n'y DÉPOSE pas. */
  regroupement?: boolean;
}

/** LOT 5-PJ-D — un dossier récent, déjà vérifié par le serveur avec le jeton de la personne connectée. */
interface Recent {
  id: string;
  nom: string;
  driveId: string | null;
  /** « GESTION LOCATIVE › 1 actifs › Dupont », ou vide quand le Drive n'a pas pu le dire à temps. */
  chemin: string;
  /** Date du dernier dépôt (ISO). Vide pour la ligne de tête, qui se situe par son titre, pas par sa date. */
  dernierDepot: string;
}

interface Etape {
  id: string;
  nom: string;
  /** LOT 5-PJ-D — vrai pour les deux regroupements : on est DEDANS, mais on n'y dépose pas. */
  regroupement?: boolean;
}

type Vue =
  | { v: 'charge' }
  | {
      v: 'ok'; dossiers: Dossier[]; ariane: Etape[];
      mode: 'racines' | 'navigation' | 'recherche'; compte: string | null;
      /** LOT 5-PJ-D — pourquoi la racine s'affiche à la place de la vue d'ouverture. */
      motif: string | null;
    }
  | { v: 'accueil'; dernier: Recent | null; recents: Recent[]; compte: string | null }
  | { v: 'indisponible'; message: string };

export interface CibleDepot { id: string; nom: string }

export function SelecteurDossierDrive({ filId, titre, onChoisir, onFermer }: {
  /** Sert à mettre en tête le dernier dossier utilisé POUR CET ÉCHANGE. */
  filId: number | null;
  titre: string;
  onChoisir: (cible: CibleDepot) => void;
  onFermer: () => void;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  const [parent, setParent] = useState<{ id: string; driveId: string | null } | null>(null);
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  /** LOT 5-PJ-D — vrai dès qu'on a demandé « Parcourir tout le Drive » : la racine, et non la vue d'ouverture. */
  const [racines, setRacines] = useState(false);
  /** Le dossier mis en avant : celui sur lequel on est, et qu'on peut choisir tel quel. */
  const [courant, setCourant] = useState<CibleDepot | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setVue({ v: 'charge' });
    const p = new URLSearchParams();
    if (recherche.trim() !== '') p.set('q', recherche.trim());
    else if (parent) { p.set('parent', parent.id); if (parent.driveId) p.set('drive', parent.driveId); }
    else if (racines) p.set('vue', 'racines');
    if (filId !== null) p.set('fil', String(filId));
    try {
      const res = await fetch(`/api/admin/gestion/drive/dossiers?${p}`, { cache: 'no-store' });
      const d = (await res.json()) as {
        etat: string; message?: string; mode?: 'racines' | 'navigation' | 'recherche' | 'accueil';
        compte?: string | null; motif?: string;
        dossiers?: Dossier[]; ariane?: Etape[]; dernier?: Recent | null; recents?: Recent[];
      };
      if (d.etat !== 'ok') {
        // « Pas de schéma », « pas configuré », « sans accès » : trois raisons DIFFÉRENTES, trois messages différents.
        setVue({ v: 'indisponible', message: d.message ?? 'Le Drive n’est pas joignable.' });
        return;
      }
      if (d.mode === 'accueil') {
        setCourant(null);
        setVue({ v: 'accueil', dernier: d.dernier ?? null, recents: d.recents ?? [], compte: d.compte ?? null });
        return;
      }
      const ariane = d.ariane ?? [];
      setVue({
        v: 'ok', dossiers: d.dossiers ?? [], ariane, mode: d.mode ?? 'racines',
        compte: d.compte ?? null, motif: d.motif ?? null,
      });
      const dernier = ariane[ariane.length - 1];
      // Un REGROUPEMENT n'est pas une destination : pas de « Déposer dans « Drives partagés » » non plus, qui
      //   promettrait au bas de l'écran ce que la ligne du dessus ne propose plus.
      setCourant(dernier && dernier.regroupement !== true ? { id: dernier.id, nom: dernier.nom } : null);
    } catch {
      setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' });
    }
  }, [parent, recherche, racines, filId]);

  useEffect(() => { void charger(); }, [charger]);

  /** Entrer dans un dossier — depuis la liste, un récent, ou une miette de chemin. */
  const entrer = (id: string, driveId: string | null): void => {
    setRecherche(''); setSaisie(''); setRacines(true); setParent({ id, driveId });
  };

  const ligneRecente = (r: Recent, maintenant: Date): ReactElement => (
    <li key={r.id} className="dsel-item dsel-item--recent">
      <button type="button" className="dsel-ouvrir dsel-ouvrir--recent" onClick={() => entrer(r.id, r.driveId)}>
        <span className="dsel-nom"><span aria-hidden="true">📁</span> {r.nom}</span>
        {/* LE CHEMIN, sans quoi deux dossiers « Documents » sont impossibles à distinguer. */}
        {r.chemin !== '' && <span className="dsel-chemin">{r.chemin}</span>}
        {r.dernierDepot !== '' && (
          <span className="dsel-quand">dernier dépôt&nbsp;: {dateHeureCourte(r.dernierDepot, maintenant)}</span>
        )}
      </button>
      <button type="button" className="dsel-choisir" onClick={() => onChoisir({ id: r.id, nom: r.nom })}>
        Déposer ici
      </button>
    </li>
  );

  const maintenant = new Date();

  return (
    <div className="dsel" role="dialog" aria-label={titre} aria-modal="true">
      <div className="dsel-barre">
        <strong className="dsel-titre">{titre}</strong>
        {/* LOT 5-PJ-C — AVEC QUEL COMPTE on regarde. Deux personnes ne voient pas la même chose : le dire évite de
            chercher pendant dix minutes un dossier auquel on n'a simplement pas accès. */}
        {(vue.v === 'ok' || vue.v === 'accueil') && vue.compte && <span className="dsel-compte">{vue.compte}</span>}
        <button type="button" className="dsel-fermer" onClick={onFermer} aria-label="Fermer le sélecteur">✕</button>
      </div>

      {/* ══ LA RECHERCHE ══ On soumet EXPLICITEMENT : chercher à chaque frappe enverrait une requête Google par
          caractère, et le Drive n'aime pas ça. */}
      <form
        className="dsel-recherche"
        onSubmit={(e) => { e.preventDefault(); setParent(null); setRacines(true); setRecherche(saisie); }}
      >
        <input
          className="dsel-champ" type="search" value={saisie} placeholder="Chercher un dossier par son nom…"
          aria-label="Chercher un dossier par son nom" onChange={(e) => setSaisie(e.target.value)}
        />
        <button type="submit" className="dsel-bouton">Chercher</button>
        {recherche !== '' && (
          <button
            type="button" className="dsel-bouton"
            onClick={() => { setSaisie(''); setRecherche(''); setParent(null); setRacines(true); }}
          >
            Tout le Drive
          </button>
        )}
      </form>

      {vue.v === 'charge' && <p className="dsel-info" role="status">Lecture du Drive…</p>}

      {/* Une indisponibilité DIT laquelle : « pas encore configuré » et « sans accès » ne se réparent pas pareil. */}
      {vue.v === 'indisponible' && <p className="dsel-info dsel-info--stop" role="status">{vue.message}</p>}

      {/* ══ LA VUE D'OUVERTURE (lot 5-PJ-D) ══ */}
      {vue.v === 'accueil' && (
        <>
          {vue.dernier !== null && (
            <>
              <p className="dsel-section">Dernier dossier utilisé pour cet échange</p>
              <ul className="dsel-liste">{ligneRecente(vue.dernier, maintenant)}</ul>
            </>
          )}
          {vue.recents.length > 0 && (
            <>
              <p className="dsel-section">Dossiers récents</p>
              <ul className="dsel-liste">{vue.recents.map((r) => ligneRecente(r, maintenant))}</ul>
            </>
          )}
          <button type="button" className="dsel-parcourir" onClick={() => { setParent(null); setRacines(true); }}>
            Parcourir tout le Drive
          </button>
        </>
      )}

      {vue.v === 'ok' && (
        <>
          {vue.mode !== 'recherche' && (
            <nav className="dsel-ariane" aria-label="Chemin du dossier">
              {/* Retour à la vue d'ouverture : elle reste à un clic, où qu'on soit descendu. Absente quand le
                  serveur vient de dire qu'il n'y a rien à y voir — une miette qui ramène au même écran est un piège. */}
              {vue.motif === null && (
                <>
                  <button
                    type="button" className="dsel-miette"
                    onClick={() => { setParent(null); setRacines(false); }}
                  >
                    Récents
                  </button>
                  <span className="dsel-sep" aria-hidden="true">›</span>
                </>
              )}
              <button type="button" className="dsel-miette" onClick={() => { setParent(null); setRacines(true); }}>Drive</button>
              {vue.ariane.map((e) => (
                <span key={e.id}>
                  <span className="dsel-sep" aria-hidden="true">›</span>
                  <button type="button" className="dsel-miette" onClick={() => entrer(e.id, null)}>{e.nom}</button>
                </span>
              ))}
            </nav>
          )}

          {/* La racine s'affiche à la place de la vue d'ouverture : on dit POURQUOI, sinon elle se lit comme une panne. */}
          {vue.motif === 'sans_depot' && (
            <p className="dsel-info">Aucune pièce n’a encore été déposée : choisissez un dossier dans le Drive.</p>
          )}
          {vue.motif === 'sans_recent_accessible' && (
            <p className="dsel-info">Aucun dossier récent accessible avec votre compte : choisissez-en un dans le Drive.</p>
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
                <button type="button" className="dsel-ouvrir" onClick={() => entrer(d.id, d.driveId)}>
                  <span aria-hidden="true">{d.raccourci ? '🔗' : '📁'}</span> {d.nom}
                  {/* L'information n'est JAMAIS portée par la seule icône : le mot est là aussi. */}
                  {d.raccourci && <span className="dsel-raccourci"> · raccourci</span>}
                  {/* LOT 5-PJ-D — on DIT pourquoi il n'y a pas de « Déposer ici », plutôt que de laisser un trou. */}
                  {d.regroupement && <span className="dsel-raccourci"> · regroupement, à ouvrir</span>}
                </button>
                {/* Un regroupement n'est pas une destination : Google refuserait le dépôt, après le téléversement. */}
                {!d.regroupement && (
                  <button type="button" className="dsel-choisir" onClick={() => onChoisir({ id: d.id, nom: d.nom })}>
                    Déposer ici
                  </button>
                )}
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
/* ── LOT 5-PJ-C ── */
.dsel-compte{margin-left:auto;font-size:.72rem;color:var(--color-svv-ink-soft);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;max-width:14rem}
.dsel-raccourci{color:var(--color-svv-ink-soft);font-size:.74rem}

/* ── LOT 5-PJ-D — LA VUE D'OUVERTURE ──
   Une ligne récente porte TROIS informations empilées (nom, chemin, date) : à 390 px, une seule ligne les tronquerait
   toutes les trois. D'où la colonne, et une hauteur libre plutot que la ligne unique des dossiers ordinaires. */
.dsel-section{margin:.3rem 0 0;font-size:.74rem;font-weight:600;letter-spacing:.02em;color:var(--color-svv-ink-soft)}
.dsel-item--recent{align-items:stretch}
.dsel-ouvrir--recent{display:flex;flex-direction:column;justify-content:center;gap:1px;white-space:normal;
  padding:.35rem .4rem;line-height:1.25}
.dsel-nom{color:var(--color-svv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsel-chemin{font-size:.72rem;color:var(--color-svv-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsel-quand{font-size:.7rem;color:var(--color-svv-ink-soft)}
.dsel-parcourir{min-height:44px;padding:0 .7rem;border-radius:.45rem;border:1px solid var(--color-svv-line);
  background:var(--color-svv-field);color:var(--color-svv-ink);cursor:pointer;font-size:.82rem;align-self:flex-start}
.dsel-parcourir:hover{border-color:var(--color-svv-ink-soft)}
.dsel-parcourir:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
`;
