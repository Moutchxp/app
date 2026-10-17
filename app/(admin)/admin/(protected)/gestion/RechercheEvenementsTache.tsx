'use client';

import { useEffect, useRef, useState } from 'react';
import { LONGUEUR_MINIMALE } from '../../../../lib/gestion/annuaireRecherche';
import {
  chercherPropositionsEvenements, lireEvenementsOuvertsDesLots,
  type EvenementPropose, type GroupeEvenementsOuverts, type PropositionEvenements,
} from './tachesClient';

/**
 * ══ 🔴🔴 LOT GESTION-RECHERCHE-EVENEMENTS (Arno, 17/10/2026) — « RATTACHER À DES ÉVÉNEMENTS EN COURS » PAR RECHERCHE ═══
 *
 * ARNO : une seule ligne de saisie (nom de locataire ou de propriétaire, adresse postale, e-mail, téléphone), des
 * propositions dès 2 caractères (la recherche de l'annuaire, réutilisée). Clic sur un LOCATAIRE : les événements ouverts
 * de son bien ; sur un PROPRIÉTAIRE : ceux de tous ses biens, regroupés par bien ; sur une ADRESSE : ceux de ce bien.
 * Jamais d'événement clos ; « Aucun événement ouvert pour … » sinon. Les événements choisis restent en ÉTIQUETTES
 * retirables (×) au-dessus de la recherche, pour enchaîner plusieurs recherches ; les rattachements existants y sont à
 * l'ouverture de « Modifier ». Tâche créée depuis un bien : ses événements ouverts sont proposés d'office.
 *
 * La règle de rattachement ne change pas : la saisie envoie la liste des événements choisis, comme avant.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
type Connu = { id: number; reference: string; objet: string; clos?: boolean };

export function RechercheEvenementsTache({ rattaches, duBien, choisis, desactive, onBasculer }: {
  /** Les rattachements existants de la tâche (dont ceux d'un événement clos depuis). */
  rattaches: readonly { id: number; reference: string; objet: string; ouvert: boolean }[];
  /** Tâche d'un bien : les événements ouverts de CE bien, proposés d'office. */
  duBien: readonly EvenementPropose[];
  choisis: readonly number[];
  desactive: boolean;
  onBasculer: (id: number) => void;
}) {
  const [texte, setTexte] = useState('');
  const [propositions, setPropositions] = useState<PropositionEvenements[] | null>(null);
  const [choix, setChoix] = useState<{ p: PropositionEvenements; groupes: GroupeEvenementsOuverts[] | null } | null>(null);
  /* Les événements vus dans les résultats (pour écrire leur étiquette une fois cochés). */
  const [vus, setVus] = useState<Map<number, Connu>>(() => new Map());
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Ce qu'on sait de chaque événement : rattachements existants, ceux du bien, ceux vus en recherche (calculé). */
  const connus = new Map<number, Connu>(vus);
  for (const e of [...rattaches.map((r) => ({ ...r, clos: !r.ouvert })), ...duBien]) connus.set(e.id, e);
  const noter = (l: readonly Connu[]) => setVus((m) => {
    const n = new Map(m);
    for (const e of l) if (!n.has(e.id)) n.set(e.id, e);
    return n;
  });

  /* Les propositions au fil de la frappe (dès 2 caractères), sans inonder le serveur. */
  useEffect(() => {
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    const t = texte.trim();
    if (t.length < LONGUEUR_MINIMALE) return undefined;
    let vivant = true;
    minuteur.current = setTimeout(() => {
      void chercherPropositionsEvenements(t).then((l) => { if (vivant) setPropositions(l ?? []); });
    }, 220);
    return () => { vivant = false; };
  }, [texte]);

  const choisir = async (p: PropositionEvenements) => {
    setChoix({ p, groupes: null });
    const g = (await lireEvenementsOuvertsDesLots(p.lots)) ?? [];
    noter(g.flatMap((x) => x.evenements));
    setChoix({ p, groupes: g });
  };

  const etiquettes = choisis.map((id) => connus.get(id) ?? { id, reference: `événement ${id}`, objet: '' });
  const case_ = (e: { id: number; reference: string; objet: string }) => (
    <label key={e.id} className="tchf-case">
      <input type="checkbox" data-evenement-choix={e.id} checked={choisis.includes(e.id)} onChange={() => onBasculer(e.id)} />
      {e.reference} — {e.objet}
    </label>
  );
  const avecEvenements = (choix?.groupes ?? []).filter((g) => g.evenements.length > 0);

  return (
    <fieldset className="tchf-groupe tchf-evenements" disabled={desactive}>
      <legend className="tch-etiquette">Rattacher à des événements en cours (plusieurs possibles)</legend>
      {etiquettes.length > 0 && (
        <ul className="tchf-etiquettes" aria-label="Événements choisis">
          {etiquettes.map((e) => (
            <li key={e.id} className="tchf-etiquette" data-etiquette-evenement={e.id}>
              <span>{e.reference}{e.objet ? ` — ${e.objet}` : ''}{e.clos ? ' (clos)' : ''}</span>
              <button type="button" className="tchf-etiquette-x" aria-label={`Retirer ${e.reference}`} onClick={() => onBasculer(e.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
      <input type="search" className="tchf-recherche-ev" data-recherche-evenements value={texte} autoComplete="off"
        placeholder="Locataire, propriétaire, adresse, e-mail ou téléphone…" aria-label="Rechercher les événements d’un client ou d’un bien"
        onChange={(e) => { setTexte(e.target.value); setChoix(null); }} />
      {propositions !== null && choix === null && texte.trim().length >= LONGUEUR_MINIMALE && (
        propositions.length === 0
          ? <p className="tchf-aide" role="status">Aucun résultat pour « {texte.trim()} ».</p>
          : (
            <ul className="tchf-propositions" role="listbox" aria-label="Propositions">
              {propositions.map((p, i) => (
                <li key={`${p.sorte}-${i}`}>
                  <button type="button" className="tchf-proposition" data-proposition={p.sorte} onClick={() => void choisir(p)}>
                    <span className={`tchf-prop-sorte tchf-prop-sorte--${p.sorte}`}>
                      {p.sorte === 'bien' ? 'Adresse' : p.sorte === 'proprietaire' ? 'Propriétaire' : 'Locataire'}
                    </span>
                    <span className="tchf-prop-libelle">{p.libelle}</span>
                    {p.detail && <span className="tchf-prop-detail">{p.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )
      )}
      {choix !== null && (
        <div className="tchf-resultat-ev" data-resultat-evenements>
          <p className="tchf-aide">
            <button type="button" className="tch-lien" onClick={() => setChoix(null)}>← Propositions</button>
            {' '}{choix.p.libelle}
          </p>
          {choix.groupes === null ? <p className="tchf-aide">Lecture…</p>
            : avecEvenements.length === 0
              ? <p className="tchf-aide" role="status" data-aucun-evenement>Aucun événement ouvert pour {choix.p.libelle}.</p>
              : avecEvenements.map((g) => (
                <div key={g.lotId} className="tchf-evenements-groupe">
                  {/* Propriétaire : un intertitre par bien ; locataire ou adresse : un seul bien, son adresse aussi. */}
                  <p className="tchf-aide tchf-intertitre">{g.adresse}</p>
                  <div className="tchf-rappels">{g.evenements.map(case_)}</div>
                </div>
              ))}
        </div>
      )}
      {duBien.length > 0 && (
        <div className="tchf-evenements-groupe" data-evenements-du-bien>
          <p className="tchf-aide">Événements de ce bien</p>
          <div className="tchf-rappels">{duBien.map(case_)}</div>
        </div>
      )}
    </fieldset>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons seulement. Cibles tactiles de 44 px. */
export const CSS_RECHERCHE_EVENEMENTS = `
.tchf-etiquettes{list-style:none;margin:0 0 4px;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.tchf-etiquette{display:inline-flex;align-items:center;gap:.3rem;padding:2px 4px 2px 10px;border:1px solid var(--color-svv-line-strong);
  border-radius:999px;background:var(--color-svv-field);font-size:.84rem;color:var(--color-svv-ink);max-width:100%}
.tchf-etiquette span{overflow-wrap:anywhere}
.tchf-etiquette-x{min-width:32px;min-height:32px;border:0;background:none;font-size:1.1rem;line-height:1;cursor:pointer;color:var(--color-svv-muted);border-radius:999px}
.tchf-etiquette-x:hover,.tchf-etiquette-x:focus-visible{color:var(--color-svv-red)}
.tchf-recherche-ev{min-height:44px;padding:.4rem .6rem;border:1px solid var(--color-svv-line-strong);border-radius:.4rem;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;width:100%;box-sizing:border-box}
.tchf-propositions{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:3px;max-height:16rem;overflow-y:auto}
.tchf-proposition{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .6rem;width:100%;min-height:44px;padding:.35rem .6rem;
  text-align:left;font:inherit;font-size:.86rem;color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.4rem;cursor:pointer}
.tchf-proposition:hover,.tchf-proposition:focus-visible{border-color:var(--color-svv-line-strong)}
.tchf-prop-sorte{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--color-svv-muted)}
.tchf-prop-libelle{font-weight:600}
.tchf-prop-detail{font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.tchf-resultat-ev{display:flex;flex-direction:column;gap:4px;margin-top:4px}
.tchf-intertitre{font-weight:600;color:var(--color-svv-ink)}
`;
