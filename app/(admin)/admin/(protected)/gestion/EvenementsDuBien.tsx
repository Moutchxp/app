'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
/* 🔴 MODULE PUR UNIQUEMENT : ce composant vit dans le navigateur (incident du 24/09/2026). */
import { motEtape, type TypeEtape } from '../../../../lib/gestion/mongaEtape';
import { libelleEtat } from '../../../../lib/gestion/ecran';
import { FriseAvancement } from './FriseAvancement';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 4 — LE BLOC « ÉVÉNEMENTS » DE LA FICHE D'UN BIEN ═════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026), mot pour mot : « Dans la fiche du BIEN, UNIQUEMENT si le bien a au moins un
 * événement : un bloc “Événements” placé juste au-dessus du moteur Historique. Les événements en cours sont
 * dépliés avec leur frise, les clos sont repliés (une ligne : titre, dates, dernière étape). Rien d'autre ne
 * bouge dans la fiche (preuve d'empreintes sur une fiche sans événement : identique). »
 *
 * ═══ 🔴🔴 « UNIQUEMENT SI » EST UNE RÈGLE DE RENDU, PAS UNE PRÉFÉRENCE ══════════════════════════════════════════
 *
 * Ce composant rend `null` — rien, pas même un conteneur vide — tant que la liste est vide OU en cours de
 * lecture. C'est ce qui tient la promesse « rien d'autre ne bouge dans la fiche » : une fiche sans événement
 * doit avoir EXACTEMENT la même empreinte qu'avant ce lot, et un `<section>` vide, même sans texte, déplacerait
 * ce qui suit d'une marge.
 *
 * ⚠️ ET IL NE REND RIEN NON PLUS PENDANT LE CHARGEMENT : afficher « Lecture… » puis disparaître ferait sauter la
 * page à chaque ouverture de fiche, sur l'immense majorité des biens qui n'ont aucun événement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface EvenementDuBien {
  id: number;
  reference: string;
  objet: string;
  etat: string;
  ouvertLe: string;
  traiteLe: string | null;
  clos: boolean;
  nbEtapes: number;
  derniereEtapeType: TypeEtape | null;
  derniereEtapeLe: string | null;
}

export function EvenementsDuBien({
  lotCle, onGeste, onOuvrirFil, evenementVise = null,
}: {
  /** La clé WIPPIMMO du lot — la même identité que l'historique juste en dessous. */
  lotCle: string;
  onGeste?: (message: string) => void;
  onOuvrirFil?: (filId: number) => void;
  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — L'ÉVÉNEMENT SUR LEQUEL ON ARRIVE ═════════════════════════════════
   *
   * Arno : le gros bouton de l'écran partagé « ouvre la fiche du bien, défile jusqu'au bloc Événements, déplie
   * cet événement et centre sa frise sur la dernière étape ».
   *
   * 🔴 LE CENTRAGE SUR LA DERNIÈRE ÉTAPE EST DÉJÀ TENU, et il n'y a rien à ajouter : `FriseAvancement` cale sur
   * `cleDOuverture` — la dernière carte réelle — UNE SEULE FOIS à son montage (lot FRISES-REPARATION). Déplier
   * l'événement monte la frise, et la frise se cale. Un second calage écrit ici l'aurait fait deux fois.
   */
  evenementVise?: number | null;
}) {
  const [evenements, setEvenements] = useState<EvenementDuBien[] | null>(null);
  const [deplies, setDeplies] = useState<ReadonlySet<number>>(new Set());
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/gestion/biens/evenements?bien=${encodeURIComponent(lotCle)}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; evenements?: EvenementDuBien[] };
      setEvenements(d.etat === 'ok' ? (d.evenements ?? []) : []);
    } catch {
      /* ⚠️ UN ÉCHEC SE TAIT ICI, et c'est délibéré : ce bloc est un PLUS sur la fiche d'un bien. Une bannière
         d'erreur en travers d'une fiche qu'on ouvrait pour autre chose ferait plus de mal que l'absence. */
      setEvenements([]);
    }
  }, [lotCle]);

  useEffect(() => { void charger(); }, [charger]);

  /**
   * 🔴 LES EN COURS SONT DÉPLIÉS, LES CLOS REPLIÉS (Arno). Posé une fois, à l'arrivée des données — et non
   * recalculé à chaque rendu, sans quoi replier un événement en cours le rouvrirait aussitôt.
   */
  useEffect(() => {
    if (evenements === null) return;
    /**
     * 🔴 LOT VIGNETTE-EVENEMENT — L'ÉVÉNEMENT VISÉ EST DÉPLIÉ, MÊME S'IL EST CLOS. On vient de cliquer un bouton
     * qui promet de l'ouvrir : le laisser replié parce qu'il est clos tiendrait la lettre de la règle (« les clos
     * restent repliés ») contre son esprit — cette règle vaut pour ce qu'on n'a pas demandé.
     */
    const ouverts = new Set(evenements.filter((e) => !e.clos).map((e) => e.id));
    if (evenementVise !== null && evenements.some((e) => e.id === evenementVise)) ouverts.add(evenementVise);
    setDeplies(ouverts);
  }, [evenements, evenementVise]);

  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — SE POSER SUR L'ÉVÉNEMENT VISÉ ═════════════════════════════════════
   *
   * ⚠️ UNE SEULE FOIS, ET LE VERROU EST ICI. Sans lui, chaque relecture du bloc — un changement d'état, un geste
   * sur la frise — ramènerait la page sur l'événement, et l'on perdrait l'endroit qu'on regardait. Même règle,
   * et même raison, que le calage de la frise (lot FRISES-REPARATION).
   *
   * ⚠️ `block: 'start'` : on veut voir l'événement ET ce qui le suit, pas le centrer au milieu d'un écran dont la
   * moitié haute serait vide.
   *
   * ⚠️ SANS `behavior: 'smooth'`, ET C'EST MESURÉ. Premier jet avec la douceur : le défilement partait de 0 et
   * s'arrêtait à 459 px pour une cible à 1078 — à mi-chemin. Une animation de défilement est pilotée par les
   * images du navigateur, et elle s'interrompt dès que la page cesse d'en produire. Le bouton PROMET d'arriver
   * sur l'événement ; arriver à moitié est pire que d'arriver sec. Même arbitrage que le défilement continu des
   * frises (lot FRISES-REPARATION), et pour la même raison.
   */
  const pose = useRef(false);
  const ancres = useRef(new Map<number, HTMLLIElement | null>());
  useEffect(() => {
    /* ⚠️ ON ATTEND QUE L'ÉVÉNEMENT SOIT DÉPLIÉ : sa frise se monte alors, et la page cesse de bouger sous le
       défilement. Mesuré sans cette garde : on arrivait 30 px trop bas, le titre du bloc rogné. */
    if (pose.current || evenementVise === null || evenements === null || !deplies.has(evenementVise)) return;
    const el = ancres.current.get(evenementVise);
    if (el === null || el === undefined) return;
    pose.current = true;
    el.scrollIntoView({ block: 'start' });
  }, [evenementVise, evenements, deplies]);

  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — L'ÉTAT DE L'ÉVÉNEMENT, DANS SON EN-TÊTE ═══════════════════════════
   *
   * ACCORD D'ARNO : le bloc « À traiter / En cours / Traité » quitte l'écran partagé et « est ajouté dans
   * l'en-tête de l'événement sur la fiche du bien (bloc Événements) […] MÊME PORTE D'ÉCRITURE ».
   *
   * 🔴 LA MÊME PORTE, C'EST `PATCH /api/admin/gestion/evenements/[id] { etat }` — celle que `CarteVive` emploie
   * depuis le lot 4c, et qui passe par `changerEtatEvenement` : même journal, même contrainte de base (l'état et
   * la date de traitement vont ensemble), même réversibilité. Une seconde porte aurait écrit une seconde
   * histoire dans le journal.
   */
  const changerEtat = useCallback(async (id: number, etat: string, reference: string): Promise<void> => {
    if (occupe) return;
    setOccupe(true);
    try {
      const res = await fetch(`/api/admin/gestion/evenements/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etat }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || d.ok !== true) { onGeste?.(d.erreur ?? 'Changement d’état impossible.'); return; }
      onGeste?.(`Événement ${reference} : ${libelleEtat(etat as 'a_traiter').toLowerCase()}.`);
      await charger();
    } catch {
      onGeste?.('Changement d’état impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  }, [occupe, onGeste, charger]);

  /* 🔴 RIEN DU TOUT : ni pendant la lecture, ni sur un bien sans événement. Voir l'encadré. */
  if (evenements === null || evenements.length === 0) return null;

  return (
    <section className="ann-bloc evb" aria-labelledby="evb-titre">
      <style>{CSS_EVENEMENTS_DU_BIEN}</style>
      <h4 className="ann-bloc-titre" id="evb-titre">
        Événements <span className="gst-compte">{evenements.length}</span>
      </h4>
      <ul className="evb-liste">
        {evenements.map((e) => {
          const ouvert = deplies.has(e.id);
          return (
            <li key={e.id} className={`evb-item${e.clos ? ' evb-item--clos' : ''}`}
              ref={(el) => { ancres.current.set(e.id, el); }}>
              <button
                type="button" className="evb-tete" aria-expanded={ouvert}
                onClick={() => setDeplies((s) => {
                  const n = new Set(s);
                  if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
                  return n;
                })}
              >
                <span className="evb-objet">{e.objet}</span>
                <span className="evb-bas">
                  <span className="evb-ref">{e.reference}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{e.clos ? 'clos' : 'en cours'}</span>
                  <span aria-hidden="true"> · </span>
                  {/* ⚠️ LES DATES SE DÉCOUPENT, elles ne passent pas par `Date` : le fuseau du lecteur ne doit
                      pas décaler le jour d'ouverture d'un dossier. Même règle que dans `frise.ts`. */}
                  <span>ouvert le {jourFr(e.ouvertLe)}</span>
                  {e.traiteLe !== null && <>
                    <span aria-hidden="true"> · </span>
                    <span>clos le {jourFr(e.traiteLe)}</span>
                  </>}
                  {/* 🔴 LA DERNIÈRE ÉTAPE SUR LA LIGNE REPLIÉE — c'est la demande d'Arno pour les clos, et elle
                      sert tout autant sur un en cours qu'on vient de replier. */}
                  {e.derniereEtapeType !== null && <>
                    <span aria-hidden="true"> · </span>
                    <span className="evb-etape">
                      {motEtape(e.derniereEtapeType)}
                      {e.derniereEtapeLe !== null && <> le {jourFr(e.derniereEtapeLe)}</>}
                    </span>
                  </>}
                </span>
              </button>
              {/**
                * 🔴🔴 LES TROIS ÉTATS, DANS L'EN-TÊTE (accord d'Arno, point 1). Ils sont HORS du bouton qui
                * déplie : un bouton dans un bouton n'est pas un balisage valide, et le clic de l'un déclencherait
                * l'autre. Ils sont donc posés à côté, sur la même ligne.
                */}
              <div className="evb-etats" role="group" aria-label={`État de l’événement ${e.reference}`}>
                {(['a_traiter', 'en_cours', 'traite'] as const).map((c) => (
                  <button key={c} type="button"
                    className={`evb-etat${e.etat === c ? ' evb-etat--actif' : ''}`}
                    aria-pressed={e.etat === c} disabled={occupe || e.etat === c}
                    onClick={() => void changerEtat(e.id, c, e.reference)}>
                    {libelleEtat(c)}
                  </button>
                ))}
              </div>
              {ouvert && (
                <div className="evb-frise">
                  <FriseAvancement
                    evenementId={e.id} compact
                    onGeste={onGeste} onOuvrirFil={onOuvrirFil}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** `2026-09-23T17:02:00+02:00` → `23/09/2026`. PUR, par découpage — jamais un `Date`. */
export function jourFr(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-');
  return j === undefined ? iso : `${j}/${m}/${a}`;
}

/* ⚠️ JETONS `--color-svv-*` UNIQUEMENT, et aucun accent grave : cette feuille vit dans un litteral gabarit. */
const CSS_EVENEMENTS_DU_BIEN = `
.evb-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.evb-item{border:1px solid var(--color-svv-line);border-radius:8px;padding:8px;
  /* ⚠️ DE L'AIR AU-DESSUS QUAND ON ATTERRIT DESSUS (lot VIGNETTE-EVENEMENT) : le gros bouton de l'ecran partage
     amene ici, et un evenement colle au bord haut se lit mal — le titre du bloc passerait sous l'en-tete. */
  scroll-margin-top:72px}
.evb-item--clos{opacity:.85}
.evb-tete{display:flex;flex-direction:column;gap:2px;width:100%;min-height:44px;padding:2px;
  font:inherit;text-align:left;background:none;border:0;cursor:pointer;color:var(--color-svv-ink)}
.evb-tete:hover{background:var(--color-svv-field)}
.evb-tete:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.evb-objet{font-size:.88rem;font-weight:700;overflow-wrap:anywhere}
.evb-bas{font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.evb-ref{font-weight:700}
.evb-etape{color:var(--color-svv-ink)}
.evb-frise{margin-top:6px;padding-top:6px;border-top:1px solid var(--color-svv-line)}
/* ══ 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — LES TROIS ETATS, DANS L'EN-TETE DE L'EVENEMENT ══════════════════════
   Ils reprennent le dessin des « voies » de la carte vivante (.gst-voie), pour que le meme geste se reconnaisse
   d'un ecran a l'autre. Cibles 36 px de haut, et ils tombent en colonne sur un ecran etroit. */
.evb-etats{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}
.evb-etat{font:inherit;font-size:.76rem;min-height:36px;padding:3px 10px;cursor:pointer;
  color:var(--color-svv-ink);background:var(--color-svv-bg);
  border:1px solid var(--color-svv-line);border-radius:6px}
.evb-etat:hover:not(:disabled){background:var(--color-svv-field)}
.evb-etat:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ⚠️ L'ETAT COURANT EST DESACTIVE : il est deja vrai, et le recliquer n'aurait rien a dire. Il le MONTRE par sa
   couleur ET par aria-pressed — jamais par la couleur seule. */
.evb-etat--actif{color:var(--color-svv-bg);background:var(--color-svv-red);border-color:var(--color-svv-red)}
.evb-etat:disabled:not(.evb-etat--actif){color:var(--color-svv-muted);cursor:default}
`;
