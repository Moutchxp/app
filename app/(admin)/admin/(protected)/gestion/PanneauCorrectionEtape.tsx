'use client';

/**
 * ══ 🔴🔴 LOT FRISE-CORRECTION-MANUELLE (26/10/2026) — LE PANNEAU DE CORRECTION D'UNE CARTE OU D'UN POINT DE LA FRISE ══════
 *
 * DEMANDE D'ARNO : « quand l'automatisation s'est trompée, pouvoir FACILEMENT modifier chaque point et chaque carte de la
 * frise, et notamment transformer un point d'information en carte d'étape, et inversement ».
 *
 * Trois composants, tous rendus par `FriseAvancement` SOUS la frise (jamais dans la piste, qui coupe ce qui dépasse) :
 *   · `PanneauCorrection`   — sous le détail d'un élément touché : transformer, nature, titre, date, retirer, revenir à
 *                             l'automatique, et le contenu du mail d'origine ;
 *   · `ListeRetires`        — les éléments retirés, repliés, avec « Remettre dans la frise » ;
 *   · `OutilsInterventions` — « Délier MNG-… de cet événement » (confirmation en clair), et « Relier à nouveau ».
 *
 * 🔴 MOBILE-FIRST (CLAUDE.md §15) : cibles de 44 px au moins, rien au seul survol, tout passe à la ligne sur iPhone en portrait.
 * 🔴 COULEURS : jetons `--color-svv-*` seulement, et l'information est toujours écrite en toutes lettres.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : modules purs seulement (garde `clientBoundary.guard.test.ts`).
 */
import { useState } from 'react';
import {
  estBorne, familleDe, motCorrection, motRetrait, natureParDefautApresTransformation, naturesPour, peutRevenirAutomatique,
  phraseDelier, type Famille,
} from '../../../../lib/gestion/correctionEtape';
import { dateAffichee, etapeOuvrable, type EtapeAAfficher } from '../../../../lib/gestion/frise';
import { motEtape, type TypeEtape } from '../../../../lib/gestion/mongaEtape';

export const MOT_CORRECTION_INDISPONIBLE = 'La correction sera disponible après la mise à jour de la base (migration 429).';

/** Le geste demandé par le panneau ; `FriseAvancement` l'envoie à la route de correction, et relit la frise. */
export type GesteCorrection =
  | { geste: 'corriger'; type: TypeEtape; titre: string | null; jour: string | null }
  | { geste: 'retirer' } | { geste: 'remettre' } | { geste: 'automatique' };

const motFamille = (f: Famille): string => (f === 'point' ? 'point d’information' : 'carte d’étape');

/** Le titre affiché d'un élément : son titre corrigé, sinon le mot de sa nature. */
export function intituleDe(e: EtapeAAfficher): string {
  return e.titre !== null && e.titre !== undefined && e.titre.trim() !== '' ? e.titre.trim() : motEtape(e.type);
}

export function PanneauCorrection({
  e, disponible, occupe, question, onGeste, onOuvrirFil,
}: {
  e: EtapeAAfficher;
  /** `false` = la migration 429 n'est pas là : tout s'affiche, en lecture, avec la mention. */
  disponible: boolean;
  occupe: boolean;
  /** La question posée avant de retirer une borne qui change l'état (`questionAvantRetrait`), ou `null`. */
  question: string | null;
  onGeste: (g: GesteCorrection) => void;
  onOuvrirFil?: (filId: number) => void;
}) {
  const borne = estBorne(e.type);
  const familleInitiale = familleDe(e.type);
  const [famille, setFamille] = useState<Famille>(familleInitiale);
  const [type, setType] = useState<TypeEtape>(e.type);
  const [titre, setTitre] = useState<string>(e.titre ?? '');
  const [jour, setJour] = useState<string>(e.jourConnu === false ? '' : e.survenuLe.slice(0, 10));
  const [confirmeRetrait, setConfirmeRetrait] = useState(false);
  const inerte = !disponible || occupe;
  const trace = motCorrection({ ...e, statut: e.statut ?? 'vif' });
  const natures = borne ? [e.type] : naturesPour(famille);
  const transforme = famille !== familleInitiale;

  const transformer = (): void => {
    const vers: Famille = famille === 'point' ? 'carte' : 'point';
    setFamille(vers);
    /* Revenir à sa famille d'origine rend sa nature d'origine ; sinon, une nature proposée, qu'on peut changer. */
    setType(vers === familleInitiale ? e.type : natureParDefautApresTransformation(e.type));
    if (vers === 'carte' && titre.trim() === '') setTitre(intituleDe(e));
  };

  return (
    <section className="pce" aria-label={`Corriger : ${intituleDe(e)}`}>
      <p className="pce-titre">Corriger ce {motFamille(familleInitiale)}</p>
      {trace !== null && <p className="pce-trace" role="note">{trace}</p>}
      {!disponible && <p className="pce-indispo" role="note">{MOT_CORRECTION_INDISPONIBLE}</p>}

      {/* LE CONTENU DU MAIL D'ORIGINE reste lisible ici (Arno) : le texte lu par l'automatisation, et le mail lui-même. */}
      {((e.texte ?? '').trim() !== '' || etapeOuvrable(e)) && (
        <div className="pce-mail">
          {(e.texte ?? '').trim() !== '' && <p className="pce-mail-texte">{e.texte}</p>}
          {etapeOuvrable(e) && onOuvrirFil !== undefined && (
            <button type="button" className="pce-btn pce-btn--trait" onClick={() => onOuvrirFil(e.filId as number)}>
              Ouvrir le mail d’origine
            </button>
          )}
        </div>
      )}
      {e.aEuUnMail && e.filId === null && <p className="pce-aide">Mail supprimé — l’étape est conservée.</p>}

      {!borne && (
        <button type="button" className="pce-btn pce-btn--trait" disabled={inerte} onClick={transformer} aria-pressed={transforme}>
          {famille === 'point' ? 'Transformer en carte d’étape' : 'Transformer en point'}
        </button>
      )}
      {transforme && <p className="pce-aide" role="status">Sera enregistré comme {motFamille(famille)} : choisissez sa nature, puis « Enregistrer ».</p>}

      <div className="pce-champs">
        <label className="pce-champ">
          <span>Nature</span>
          <select value={type} disabled={inerte || borne} onChange={(ev) => setType(ev.target.value as TypeEtape)}>
            {natures.map((t) => <option key={t} value={t}>{motEtape(t)}</option>)}
          </select>
        </label>
        <label className="pce-champ">
          <span>Titre{type === 'autre' ? ' (obligatoire)' : ' (facultatif)'}</span>
          <input type="text" value={titre} maxLength={200} disabled={inerte} placeholder={motEtape(type)}
            onChange={(ev) => setTitre(ev.target.value)} />
        </label>
        <label className="pce-champ">
          <span>Date{borne ? ' (ne se corrige pas sur cette carte)' : ' (vide = sans date)'}</span>
          <input type="date" value={jour} disabled={inerte || borne} onChange={(ev) => setJour(ev.target.value)} />
        </label>
      </div>
      {borne && (
        <p className="pce-aide">La nature et la date d’une carte Ouverture, Clôture ou Réouverture ne se corrigent pas : elles disent l’état de l’événement. Son titre se corrige, et elle peut être retirée de la frise.</p>
      )}

      <div className="pce-actions">
        <button type="button" className="pce-btn pce-btn--plein" disabled={inerte}
          onClick={() => onGeste({ geste: 'corriger', type, titre: titre.trim() === '' ? null : titre.trim(), jour: jour === '' ? null : jour })}>
          Enregistrer la correction
        </button>
        {peutRevenirAutomatique(e) && (
          <button type="button" className="pce-btn pce-btn--trait" disabled={inerte} onClick={() => onGeste({ geste: 'automatique' })}>
            Revenir au classement automatique
          </button>
        )}
        {!confirmeRetrait ? (
          <button type="button" className="pce-btn pce-btn--trait" disabled={inerte} onClick={() => setConfirmeRetrait(true)}>
            Retirer de la frise
          </button>
        ) : (
          <div className="pce-confirme" role="alertdialog" aria-label="Retirer de la frise ?">
            <p>{question ?? `Retirer ce ${motFamille(familleInitiale)} de la frise ? Il reste consultable sous la frise, et peut y être remis.`}</p>
            <button type="button" className="pce-btn pce-btn--plein" disabled={inerte}
              onClick={() => { setConfirmeRetrait(false); onGeste({ geste: 'retirer' }); }}>Retirer</button>
            <button type="button" className="pce-btn pce-btn--trait" onClick={() => setConfirmeRetrait(false)}>Annuler</button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Les éléments retirés de la frise, repliés, chacun avec « Remettre dans la frise » (Arno : retirer est réversible). */
export function ListeRetires({ retires, disponible, occupe, onRemettre }: {
  retires: readonly EtapeAAfficher[]; disponible: boolean; occupe: boolean; onRemettre: (e: EtapeAAfficher) => void;
}) {
  if (retires.length === 0) return null;
  return (
    <details className="pce-retires">
      <summary>Retirés de la frise ({retires.length})</summary>
      {!disponible && <p className="pce-indispo">{MOT_CORRECTION_INDISPONIBLE}</p>}
      <ul>
        {retires.map((e) => {
          const trace = motCorrection({ ...e, statut: 'retire' });
          return (
            <li key={e.id} className="pce-retire">
              <span className="pce-retire-nom">
                {intituleDe(e)} — {familleDe(e.type) === 'point' ? 'point' : 'carte'}
                {dateAffichee(e) !== null && <> · {dateAffichee(e)}</>}
                {e.reference !== null && <> · {e.reference}</>}
              </span>
              <span className="pce-retire-trace">{motRetrait(e)}{trace !== null ? ` · ${trace}` : ''}</span>
              <button type="button" className="pce-btn pce-btn--trait" disabled={!disponible || occupe} onClick={() => onRemettre(e)}>
                Remettre dans la frise
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** « Délier MNG-… de cet événement » (confirmation qui dit ce qui va se passer), et « Relier à nouveau » des déliées. */
export function OutilsInterventions({ references, deliees, evenementReference, occupe, onDelier, onRelier }: {
  references: readonly string[]; deliees: readonly string[]; evenementReference: string | null; occupe: boolean;
  onDelier: (reference: string) => void; onRelier: (reference: string) => void;
}) {
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  if (references.length === 0 && deliees.length === 0) return null;
  return (
    <details className="pce-outils">
      <summary>Interventions Monga de cet événement</summary>
      <ul>
        {references.map((r) => (
          <li key={r} className="pce-outil">
            {aConfirmer === r ? (
              <div className="pce-confirme" role="alertdialog" aria-label={`Délier ${r} ?`}>
                <p>{phraseDelier(r, evenementReference)}</p>
                <button type="button" className="pce-btn pce-btn--plein" disabled={occupe}
                  onClick={() => { setAConfirmer(null); onDelier(r); }}>Délier {r}</button>
                <button type="button" className="pce-btn pce-btn--trait" onClick={() => setAConfirmer(null)}>Annuler</button>
              </div>
            ) : (
              <button type="button" className="pce-btn pce-btn--trait" disabled={occupe} onClick={() => setAConfirmer(r)}>
                Délier {r} de cet événement
              </button>
            )}
          </li>
        ))}
        {deliees.map((r) => (
          <li key={`d-${r}`} className="pce-outil">
            <span className="pce-retire-trace">{r} — déliée de cet événement</span>
            <button type="button" className="pce-btn pce-btn--trait" disabled={occupe} onClick={() => onRelier(r)}>
              Relier {r} à nouveau
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* Feuille du panneau. Aucun accent grave dans ce gabarit (piège du dépôt). Jetons --color-svv-* seulement. */
export const CSS_PANNEAU_CORRECTION = `
.pce{margin-top:10px;padding:12px;border:1px solid var(--color-svv-line);border-radius:8px;background:var(--color-svv-surface);
  display:flex;flex-direction:column;gap:10px;color:var(--color-svv-ink)}
.pce-titre{margin:0;font-weight:600;font-size:.9rem}
.pce-trace,.pce-indispo,.pce-aide{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.pce-indispo{padding:6px 8px;background:var(--color-svv-amber-soft);border-radius:6px;color:var(--color-svv-ink)}
.pce-mail{display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--color-svv-field);border-radius:6px}
.pce-mail-texte{margin:0;font-size:.82rem;white-space:pre-wrap;overflow-wrap:anywhere}
.pce-champs{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.pce-champ{display:flex;flex-direction:column;gap:4px;font-size:.8rem;color:var(--color-svv-label)}
.pce-champ select,.pce-champ input{min-height:44px;font:inherit;font-size:.9rem;padding:6px 8px;border:1px solid var(--color-svv-line-strong);
  border-radius:6px;background:var(--color-svv-bg);color:var(--color-svv-ink);width:100%;box-sizing:border-box}
.pce-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.pce-btn{min-height:44px;min-width:44px;padding:8px 14px;font:inherit;font-size:.85rem;border-radius:8px;cursor:pointer}
.pce-btn:disabled{opacity:.55;cursor:not-allowed}
.pce-btn--plein{background:var(--color-svv-red);color:var(--color-svv-blanc);border:1px solid var(--color-svv-red)}
.pce-btn--trait{background:var(--color-svv-bg);color:var(--color-svv-red);border:1px solid var(--color-svv-red)}
.pce-btn--trait[aria-pressed="true"]{background:var(--color-svv-red-soft)}
.pce-btn:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
.pce-confirme{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;border:1px solid var(--color-svv-red);border-radius:8px;
  background:var(--color-svv-red-soft);width:100%;box-sizing:border-box}
.pce-confirme p{margin:0;flex:1 1 100%;font-size:.82rem}
.pce-retires,.pce-outils{margin-top:10px;font-size:.82rem;color:var(--color-svv-ink)}
.pce-retires summary,.pce-outils summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:var(--color-svv-muted)}
.pce-retires ul,.pce-outils ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.pce-retire,.pce-outil{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px;border:1px solid var(--color-svv-line);border-radius:8px}
.pce-retire-nom{font-weight:600;flex:1 1 220px}
.pce-retire-trace{color:var(--color-svv-muted);flex:1 1 100%}
`;
