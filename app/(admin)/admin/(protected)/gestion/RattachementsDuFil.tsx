'use client';

import { useCallback, useEffect, useState } from 'react';
import { ModifierRattachement, motSorteLong, CSS_MODIFIER_RATTACHEMENT } from './ModifierRattachement';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
// LOT STATUT-PAR-MAIL — une ligne par BIEN, pas par message. Module PUR, éprouvé sans écran.
import { regrouperParBien } from '../../../../lib/gestion/statutClassement';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';

/**
 * LOT BARRE-STATUT — « VISUALISER / MODIFIER » : LES RATTACHEMENTS D'UN ÉCHANGE, VUS DEPUIS SA LIGNE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI ELLE EXISTE. La capsule verte d'une ligne dit « c'est rangé » — mais pas OÙ. Pour le savoir, il fallait
 * ouvrir l'échange, déplier un message, et lire son bandeau « Rattaché à ». Depuis la liste, la barre de survol
 * propose donc de VOIR d'abord, et de modifier ensuite (demande d'Arno) : c'est le même ordre que la fenêtre
 * « Modifier » du lot FIL-LECTURE-2 — comprendre avant de changer.
 *
 * 🔴 ELLE NE RÉÉCRIT AUCUN GESTE. Modifier un rattachement reste ENTIÈREMENT le travail de `ModifierRattachement`,
 * avec sa fiche détaillée, son sélecteur de cible et sa validation obligatoire. Cette fenêtre-ci ne fait que deux
 * choses : LISTER, et passer la main. Réimplémenter le remplacement ici aurait créé une deuxième façon de faire le
 * même geste — donc, un jour, deux comportements différents.
 *
 * 🔴 PLUSIEURS RATTACHEMENTS SE LISTENT TOUS. Un échange de douze mails peut en porter autant : n'en montrer qu'un
 * (le premier, le plus récent) laisserait croire que c'est le seul, et on modifierait le mauvais. Chacun porte le
 * mail dont il vient, parce que c'est le MAIL qui est rattaché, jamais l'échange.
 *
 * ⚠️ LES PROPOSITIONS SONT MONTRÉES, ET DITES COMME TELLES. La capsule, elle, ne compte que les rattachements
 * CONFIRMÉS — une proposition ne classe rien. Mais on ouvre justement cette fenêtre pour trancher : les cacher
 * obligerait à ressortir ailleurs pour faire le geste qu'on venait faire.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : le type passe par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function RattachementsDuFil({ filId, titre, onFerme, onGeste }: {
  filId: number;
  /** L'objet de l'échange, pour que la fenêtre dise de QUOI elle parle. Absent = un titre générique. */
  titre?: string | null;
  onFerme: () => void;
  onGeste?: (message: string) => void;
}) {
  const [etat, setEtat] = useState<
    { v: 'charge' } | { v: 'ok'; liens: LienAffiche[] } | { v: 'sans_schema' } | { v: 'erreur'; message: string }
  >({ v: 'charge' });
  const [modifie, setModifie] = useState<LienAffiche | null>(null);

  const charger = useCallback(async () => {
    setEtat({ v: 'charge' });
    try {
      const res = await fetch(`/api/admin/gestion/rattachements?fil=${filId}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: LienAffiche[]; message?: string };
      if (d.etat === 'sans_schema') { setEtat({ v: 'sans_schema' }); return; }
      if (d.etat !== 'ok') { setEtat({ v: 'erreur', message: d.message ?? 'Lecture impossible.' }); return; }
      setEtat({ v: 'ok', liens: d.data ?? [] });
    } catch {
      setEtat({ v: 'erreur', message: 'La lecture des rattachements n’a pas abouti.' });
    }
  }, [filId]);

  useEffect(() => { void charger(); }, [charger]);

  /**
   * ⚠️ LA FENÊTRE DE MODIFICATION PREND TOUTE LA PLACE quand elle s'ouvre : deux boîtes de dialogue empilées sont
   * injouables au clavier, et un lecteur d'écran ne sait plus laquelle est active. On rend donc l'une OU l'autre.
   */
  if (modifie !== null) {
    return (
      <ModifierRattachement lien={modifie} messageId={modifie.messageId}
        onGeste={onGeste}
        onAnnuler={() => setModifie(null)}
        onFait={async () => { setModifie(null); await charger(); }} />
    );
  }

  return (
    <div className="mrt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_RATTACHEMENTS_FIL}</style>
      <div className="mrt rdf" role="dialog" aria-modal="true" aria-labelledby="rdf-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>
        <h2 className="mrt-titre" id="rdf-titre">Rattachements de l’échange</h2>
        {titre && <p className="rdf-objet">{titre}</p>}

        {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des rattachements…</p>}
        {etat.v === 'erreur' && <p className="gst-tronc" role="alert">{etat.message}</p>}
        {/* ⚠️ LA MIGRATION 257 ABSENTE EST UN ÉTAT, PAS UNE PANNE : on le DIT, on ne montre pas une liste vide. */}
        {etat.v === 'sans_schema' && (
          <p className="gst-tronc">
            Les rattachements ne sont pas encore installés sur cette base (mise à jour 257 à appliquer).
          </p>
        )}
        {/* Une liste vide ne peut normalement pas arriver ici — la capsule était verte — mais un rattachement a pu
            être retiré entre-temps par quelqu'un d'autre. On le dit plutôt que de laisser un cadre vide. */}
        {etat.v === 'ok' && etat.liens.length === 0 && (
          <p className="gst-tronc">
            Cet échange ne porte plus aucun rattachement vivant. Il a pu être retiré depuis l’affichage de la liste.
          </p>
        )}

        {/* ══ 🔴 LOT STATUT-PAR-MAIL — UNE LIGNE PAR BIEN, PAS PAR MESSAGE ═══════════════════════════════════════
            LE DÉFAUT QU'ON CORRIGE, vu par Arno sur le fil 803 : cette fenêtre affichait TROIS LIGNES IDENTIQUES
            — « Lot 445 » trois fois — une par message, sans jamais dire que c'était le même bien vu trois fois.
            On croyait à un triplon, ou à une erreur.

            Désormais : une ligne par BIEN, avec « sur 3 mails de la conversation » écrit dessus, et le détail
            par message DÉPLIABLE. On ne cache rien — on cesse de répéter. */}
        {etat.v === 'ok' && etat.liens.length > 0 && (
          <ul className="rdf-liste">
            {regrouperParBien(etat.liens).map((g) => (
              <li key={g.cle} className="rdf-item">
                <div className="rdf-tete">
                  <span className="rdf-sorte">{motSorteLong(g.sorte as 'lot')}</span>
                  <span className="rdf-cible">{g.libelle}</span>
                  <span className={`rdf-statut rdf-statut--${g.statut === 'a_classer' ? 'propose' : 'confirme'}`}>
                    {g.statut === 'classe' ? 'posé à la main' : g.statut === 'auto' ? 'automatique' : 'proposé'}
                  </span>
                </div>
                {/* 🔴 LE CHIFFRE QUI MANQUAIT : combien de mails de la conversation portent ce rattachement. */}
                <p className="rdf-detail">
                  sur {g.nbMails} mail{g.nbMails > 1 ? 's' : ''} de la conversation
                </p>
                {/* LE DÉTAIL, REPLIÉ : chaque mail, sa règle, sa date, son auteur, et son propre « Modifier ». */}
                <details className="rdf-detail-mails">
                  <summary className="rdf-resume">Voir le détail par mail</summary>
                  <ul className="rdf-sous-liste">
                    {g.liens.map((l) => (
                      <li key={l.id} className="rdf-sous-item">
                        <span className="rdf-detail">
                          mail nº {l.messageId}
                          {' · '}{l.statut === 'confirme' ? 'confirmé' : 'proposé'}
                          {' · '}{l.origine === 'manuel' ? 'posé à la main' : 'posé automatiquement'}
                          {l.regle ? ` · règle ${l.regle}` : ''}
                          {l.creeLe ? ` · ${dateHeureComplete(l.creeLe)}` : ''}
                          {l.creePar ? ` · ${l.creePar}` : ''}
                          {l.pieceId !== null ? ' · cette pièce jointe seulement' : ''}
                        </span>
                        <button type="button" className="gst-lien-bouton" onClick={() => setModifie(l)}>
                          Modifier ce rattachement…
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}

        <div className="mrt-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export const CSS_RATTACHEMENTS_FIL = `
.rdf-objet{margin:-6px 0 10px;font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.rdf-liste{display:flex;flex-direction:column;gap:10px;margin:0 0 14px;padding:0;list-style:none}
.rdf-item{display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid var(--color-svv-line);
  border-radius:.6rem;background:var(--color-svv-surface);min-width:0}
.rdf-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;min-width:0}
.rdf-sorte{font-size:.72rem;font-weight:700;letter-spacing:.04em;color:var(--color-svv-muted)}
.rdf-cible{font-size:.95rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* Le mot est TOUJOURS écrit : la couleur ne fait que l'appuyer. */
.rdf-statut{padding:.05rem .4rem;border-radius:999px;font-size:.7rem;font-weight:700;line-height:1.5;
  border:1px solid transparent}
.rdf-statut--confirme{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.rdf-statut--propose{color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
.rdf-detail{margin:0;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* LOT STATUT-PAR-MAIL — le detail par mail, REPLIE. On ne cache rien : on cesse de repeter. */
.rdf-detail-mails{margin-top:2px}
.rdf-resume{font-size:.78rem;color:var(--color-svv-muted);cursor:pointer}
.rdf-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.rdf-sous-liste{display:flex;flex-direction:column;gap:6px;margin:6px 0 0;padding:0 0 0 10px;list-style:none;
  border-left:2px solid var(--color-svv-line)}
.rdf-sous-item{display:flex;flex-direction:column;gap:2px;min-width:0}
`;
