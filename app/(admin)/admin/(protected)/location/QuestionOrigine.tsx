'use client';

import { useState } from 'react';
import { CSS_ZONE_AUTO, ZoneAuto } from './ZoneAuto';
import {
  LIBELLE_ORIGINE, LIBELLE_SOUS_ORIGINE, ORIGINES, originePrete, QUESTION_ORIGINE, SOUS_ORIGINES_VENTE,
  type Origine, type OrigineArchivage, type SousOrigine,
} from '../../../../lib/location/archivage';

/**
 * ══ 🔴🔴 « DERNIÈRE QUESTION AVANT L'ARCHIVAGE DÉFINITIF » (Arno, 18/10/2026) ══════════════════════════════════════════
 *
 * « Quelle est l'origine de l'archivage de ce propriétaire ? — un seul choix possible (gros boutons radio, style de la
 * tuile) ; Mise en vente → sous-question obligatoire, un seul choix ; sous la liste, un champ “Précision” libre et
 * facultatif. Bouton final rouge “Archiver définitivement”, grisé tant qu'aucun choix n'est fait (et que la
 * sous-question n'est pas répondue si “Mise en vente”). “Retour” revient à l'étape précédente sans rien écrire. RIEN
 * n'est archivé avant ce clic final. »
 * Elle se pose DANS l'étape qui précède (le panneau de confirmation, ou la même modale) : jamais une seconde fenêtre.
 */
export function QuestionOrigine({ envoi, motif, onRetour, onArchiver, question = QUESTION_ORIGINE, libelleFinal = 'Archiver définitivement' }: {
  envoi: boolean; motif: string | null; onRetour: () => void; onArchiver: (o: OrigineArchivage) => void;
  /** La question et le bouton final : ceux du propriétaire par défaut ; ceux de la sortie de biens au besoin (Arno, 18/10/2026). */
  question?: string; libelleFinal?: string;
}) {
  const [origine, setOrigine] = useState<Origine | null>(null);
  const [sous, setSous] = useState<SousOrigine | null>(null);
  const [precision, setPrecision] = useState('');
  const pret = originePrete(origine, sous);
  return (
    <div className="qo" data-question-origine>
      <style>{CSS_QUESTION_ORIGINE + CSS_ZONE_AUTO}</style>
      <p className="qo-question" id="qo-question">{question}</p>
      <div className="qo-liste" role="radiogroup" aria-labelledby="qo-question">
        {ORIGINES.map((o) => (
          <div key={o} className="qo-ligne">
            <button type="button" role="radio" aria-checked={origine === o} className="qo-choix" data-origine={o}
              onClick={() => { setOrigine(o); if (o !== 'mise_en_vente') setSous(null); }}>
              <span className="qo-pastille" aria-hidden="true" />{LIBELLE_ORIGINE[o]}
            </button>
            {/* La sous-question, JUSTE SOUS « Mise en vente » (obligatoire, un seul choix). */}
            {o === 'mise_en_vente' && origine === 'mise_en_vente' && (
              <div className="qo-sous" data-sous-question>
                <p className="qo-sous-titre" id="qo-sous">Par qui ? <span className="qo-requis">(obligatoire)</span></p>
                <div className="qo-pilules" role="radiogroup" aria-labelledby="qo-sous">
                  {SOUS_ORIGINES_VENTE.map((x) => (
                    <button key={x} type="button" role="radio" aria-checked={sous === x} className="qo-pilule" data-sous-origine={x} onClick={() => setSous(x)}>
                      {LIBELLE_SOUS_ORIGINE[x]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <ZoneAuto etiquette="Précision (facultative)" valeur={precision} placeholder="ex. Vente signée chez le notaire en septembre" onChange={setPrecision} />
      {motif !== null && <p className="cp-refus" role="alert">{motif}</p>}
      <div className="qo-pied">
        <button type="button" className="svv-btn svv-btn-outline gst-btn qo-retour" onClick={onRetour} disabled={envoi}>Retour</button>
        <button type="button" className="qo-final" disabled={!pret || envoi} data-archiver-definitivement
          onClick={() => { if (pret && origine !== null) onArchiver({ origine, sousOrigine: origine === 'mise_en_vente' ? sous : null, precision: precision.trim() === '' ? null : precision.trim() }); }}>
          {libelleFinal}
        </button>
      </div>
    </div>
  );
}

/** Couleurs du thème uniquement : le choix retenu prend le rouge de l'agence (comme les gros boutons Oui / Non de la tuile). */
export const CSS_QUESTION_ORIGINE = `
.qo{display:flex;flex-direction:column;gap:12px;min-width:0}
.qo-question{margin:0;font-size:1.1rem;font-weight:800;color:var(--color-svv-ink)}
.qo-liste{display:flex;flex-direction:column;gap:8px}
.qo-choix{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:100%;min-height:56px;padding:12px 18px;border-radius:16px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:1.08rem;font-weight:700;text-align:left;cursor:pointer}
.qo-choix:hover{border-color:var(--color-svv-ink)}
.qo-pastille{flex:0 0 auto;width:20px;height:20px;border-radius:999px;border:2px solid currentColor;box-sizing:border-box}
.qo-choix[aria-checked="true"]{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);box-shadow:0 0 0 4px var(--color-svv-red-soft)}
.qo-choix[aria-checked="true"] .qo-pastille{background:radial-gradient(circle, currentColor 0 4px, transparent 5px)}
.qo-ligne{display:flex;flex-direction:column;gap:8px}
.qo-sous{display:flex;flex-direction:column;gap:8px;margin:0 0 4px 16px;padding-left:14px;border-left:3px solid var(--color-svv-red)}
.qo-sous-titre{margin:0;font-weight:700;color:var(--color-svv-ink)}
.qo-requis{font-weight:400;color:var(--color-svv-muted)}
.qo-pilules{display:flex;flex-wrap:wrap;gap:8px}
.qo-pilule{min-height:44px;padding:8px 16px;border-radius:999px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer}
.qo-pilule[aria-checked="true"]{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface)}
.qo-pilule[aria-checked="true"]::before{content:"✓ "}
.qo-pied{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.qo-retour{min-height:44px}
.qo-final{flex:1 1 16rem;box-sizing:border-box;min-height:56px;padding:14px 18px;border-radius:14px;border:2px solid var(--color-svv-red);background:var(--color-svv-red);color:var(--color-svv-surface);font:inherit;font-size:1.08rem;font-weight:800;cursor:pointer}
.qo-final:disabled{background:var(--color-svv-field);border-color:var(--color-svv-line-strong);color:var(--color-svv-muted);cursor:not-allowed}
@media (max-width:640px){
  .qo-choix{font-size:1rem;padding:10px 14px}
  .qo-sous{margin-left:6px;padding-left:10px}
  .qo-pied{flex-direction:column-reverse;align-items:stretch}
  .qo-final{flex:0 0 auto;width:100%}
}
`;
