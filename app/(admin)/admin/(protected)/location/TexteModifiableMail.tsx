'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CLES_MODIFIABLES, estModifie, paragraphesDesParties, refusRetouche, texteDeLaPartie, type CleModifiable, type EditionMail, type Retouche,
} from '../../../../lib/location/texteModifiable';

/**
 * ══ 🔴🔴 « MODIFIER LE TEXTE » SOUS UN MAIL DU RÉCAPITULATIF (décision d'Arno du 10/11/2026, option 1) ══════════════════════════════
 *
 * Un bouton sous chaque mail à texte fixe ; « Texte modifié » quand il l'a été. L'éditeur montre le mail découpé en PARTIES :
 *   · modifiables (formule d'appel, introduction, conclusion libre — vide par défaut —, politesse) : des zones de texte ; les données
 *     protégées y restent sous forme de repères `{adresse}`, `{date de réception}`… que le serveur remplit (les retirer est refusé) ;
 *   · protégées (objet, dates, dépôt de garantie, provision de 20 %, article de loi, copie de l'accusé, « Mail envoyé par … », signature) :
 *     grisées, avec un cadenas, non modifiables.
 * L'aperçu se refait à chaque frappe, avec le MÊME code que le serveur (`texteModifiable.ts`) ; « Appliquer » renvoie la retouche à l'écran
 * appelant, qui relit le récapitulatif au serveur (ce qui s'affiche alors est exactement ce qui part). « Revenir au texte d'origine » efface
 * toute modification. Plusieurs locataires : une seule modification, appliquée à chacun avec son nom. ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

/** Le bouton et la mention, sous un mail du récapitulatif. `onAppliquer(undefined)` : retour au texte d'origine. */
export function ModifierTexteMail({ edition, retouche, onAppliquer, plusieurs = false, desactive = false }: {
  edition: EditionMail; retouche: Retouche | undefined; onAppliquer: (r: Retouche | undefined) => void;
  /** Le même mail part à plusieurs locataires, séparément (la modification vaut pour chacun). */
  plusieurs?: boolean; desactive?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="tmm-barre" data-texte-modifiable={edition.cle}>
      <style>{CSS_TEXTE_MODIFIABLE}</style>
      <button type="button" className="svv-btn svv-btn-outline gst-btn tmm-bouton" disabled={desactive} onClick={() => setOuvert(true)} data-modifier-texte={edition.cle}>
        Modifier le texte
      </button>
      {edition.modifie && <span className="tmm-modifie" data-texte-modifie={edition.cle}>Texte modifié</span>}
      {ouvert && <EditeurTexteMail edition={edition} retouche={retouche} plusieurs={plusieurs}
        onAnnuler={() => setOuvert(false)} onAppliquer={(r) => { setOuvert(false); onAppliquer(r); }} />}
    </div>
  );
}

/** Une retouche réduite à ce qui change vraiment (une partie retapée à l'identique n'est pas une modification). PUR. */
export function retoucheUtile(edition: EditionMail, r: Retouche): Retouche | undefined {
  const garde: Retouche = {};
  for (const cle of CLES_MODIFIABLES) {
    const p = edition.parties.find((x) => x.cle === cle);
    if (p === undefined || r[cle] === undefined) continue;
    if (estModifie([p], { [cle]: r[cle] })) garde[cle] = r[cle];
  }
  return Object.keys(garde).length === 0 ? undefined : garde;
}

export function EditeurTexteMail({ edition, retouche, plusieurs, onAnnuler, onAppliquer }: {
  edition: EditionMail; retouche: Retouche | undefined; plusieurs: boolean; onAnnuler: () => void; onAppliquer: (r: Retouche | undefined) => void;
}) {
  const titreId = useId();
  const [brouillon, setBrouillon] = useState<Retouche>(() => {
    const b: Retouche = {};
    for (const p of edition.parties) if (p.modifiable) b[p.cle as CleModifiable] = texteDeLaPartie(p, retouche);
    return b;
  });
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') onAnnuler(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onAnnuler]);
  const refus = refusRetouche(edition.parties, brouillon);
  const apercu = [...paragraphesDesParties(edition.parties, brouillon, edition.valeurs), ...edition.suite.map((s) => s.texte)].join('\n\n');
  const origine = () => {
    const b: Retouche = {};
    for (const p of edition.parties) if (p.modifiable) b[p.cle as CleModifiable] = p.texte;
    setBrouillon(b);
  };
  const boite = (
    <div className="mis-voile tmm-voile">
      <div className="mis-boite tmm-boite" role="dialog" aria-modal="true" aria-labelledby={titreId} data-editeur-texte={edition.cle}>
        <style>{CSS_TEXTE_MODIFIABLE}</style>
        <h2 id={titreId} className="mis-titre">Modifier le texte du mail</h2>
        <p className="loc-muet tmm-aide">
          Les parties grisées 🔒 sont protégées : le serveur les reconstruit. Les mots entre accolades — {'{adresse}'}, {'{date de réception}'}… — sont des
          données protégées remplies par le serveur : elles doivent rester.{plusieurs ? ' La modification vaut pour chaque locataire, avec son propre nom.' : ''}
        </p>
        <div className="tmm-protege" data-partie-protegee="objet"><span className="tmm-cadenas" aria-hidden="true">🔒</span>
          <span className="tmm-libelle">Objet</span><span className="tmm-texte">{edition.objet}</span></div>
        {edition.parties.map((p) => p.modifiable ? (
          <label key={p.cle} className="tmm-champ" data-partie-modifiable={p.cle}>
            <span className="tmm-libelle">{p.libelle}</span>
            <textarea rows={p.cle === 'intro' ? 4 : 2} value={brouillon[p.cle as CleModifiable] ?? ''} maxLength={5000}
              placeholder={p.cle === 'conclusion' ? 'Vide par défaut : un paragraphe libre, ajouté avant la formule de politesse.' : undefined}
              onChange={(e) => { const v = e.target.value; setBrouillon((b) => ({ ...b, [p.cle]: v })); }} />
          </label>
        ) : (
          <div key={p.cle} className="tmm-protege" data-partie-protegee={p.cle}><span className="tmm-cadenas" aria-hidden="true">🔒</span>
            <span className="tmm-libelle">{p.libelle}</span><span className="tmm-texte">{p.texte}</span></div>
        ))}
        {edition.suite.map((s) => (
          <div key={s.libelle} className="tmm-protege" data-partie-protegee={s.libelle}><span className="tmm-cadenas" aria-hidden="true">🔒</span>
            <span className="tmm-libelle">{s.libelle}</span><span className="tmm-texte">{s.texte}</span></div>
        ))}
        <p className="pss-sous-titre">Aperçu{plusieurs ? ' (premier locataire)' : ''}</p>
        <pre className="pss-pre tmm-apercu" data-apercu-texte>{apercu}</pre>
        {refus !== null && <p className="cev-alerte" role="alert" data-refus-texte>{refus}</p>}
        <div className="mis-actions tmm-actions">
          <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={origine} data-texte-origine>Revenir au texte d’origine</button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn mis-action" onClick={onAnnuler} data-annuler-texte>Annuler</button>
          <button type="button" className="svv-btn svv-btn-primary gst-btn mis-action" disabled={refus !== null}
            onClick={() => onAppliquer(retoucheUtile(edition, brouillon))} data-appliquer-texte>Appliquer</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; une colonne au telephone. */
export const CSS_TEXTE_MODIFIABLE = `
.tmm-barre{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}
.tmm-bouton{min-height:44px;width:auto}
.tmm-modifie{display:inline-flex;align-items:center;min-height:28px;padding:2px 10px;border-radius:999px;font-size:.78rem;font-weight:800;
  color:var(--color-svv-ink);background:color-mix(in srgb, var(--color-svv-red) 14%, transparent);border:1px solid var(--color-svv-red)}
.tmm-voile{z-index:60}
.tmm-boite{display:flex;flex-direction:column;gap:8px;max-height:92vh;overflow-y:auto}
.tmm-aide{margin:0;font-size:.82rem}
.tmm-champ{display:flex;flex-direction:column;gap:4px;min-width:0}
.tmm-champ textarea{font:inherit;font-size:.92rem;line-height:1.45;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:8px;
  background:var(--color-svv-field);color:var(--color-svv-ink);min-height:44px;resize:vertical;box-sizing:border-box;width:100%}
.tmm-libelle{font-size:.76rem;font-weight:800;color:var(--color-svv-ink)}
.tmm-protege{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;padding:6px 10px;border-radius:8px;border:1px dashed var(--color-svv-line);
  background:color-mix(in srgb, var(--color-svv-line) 35%, transparent);color:var(--color-svv-muted);min-width:0}
.tmm-protege .tmm-libelle{color:var(--color-svv-muted)}
.tmm-cadenas{grid-row:span 2;font-size:.9rem}
.tmm-texte{font-size:.85rem;white-space:pre-wrap;overflow-wrap:anywhere}
.tmm-apercu{max-height:40vh;overflow:auto}
.tmm-actions{flex-wrap:wrap}
`;
