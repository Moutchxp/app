'use client';

import { useCallback, useEffect, useState } from 'react';
/* 🔴 MODULE PUR UNIQUEMENT : ce composant vit dans le navigateur (incident du 24/09/2026). */
import { motEtape, type TypeEtape } from '../../../../lib/gestion/mongaEtape';
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
  lotCle, onGeste, onOuvrirFil,
}: {
  /** La clé WIPPIMMO du lot — la même identité que l'historique juste en dessous. */
  lotCle: string;
  onGeste?: (message: string) => void;
  onOuvrirFil?: (filId: number) => void;
}) {
  const [evenements, setEvenements] = useState<EvenementDuBien[] | null>(null);
  const [deplies, setDeplies] = useState<ReadonlySet<number>>(new Set());

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
    setDeplies(new Set(evenements.filter((e) => !e.clos).map((e) => e.id)));
  }, [evenements]);

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
            <li key={e.id} className={`evb-item${e.clos ? ' evb-item--clos' : ''}`}>
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
.evb-item{border:1px solid var(--color-svv-line);border-radius:8px;padding:8px}
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
`;
