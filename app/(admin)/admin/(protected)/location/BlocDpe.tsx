'use client';

import { CLASSES_DPE, DPE_NON_SOUMIS, LIBELLE_DPE_NON_SOUMIS } from '../../../../lib/location/bienComplet';
import { alertesDpe } from '../../../../lib/location/reglagesDpe';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE BLOC « DPE » DU FORMULAIRE D'UN BIEN (Arno, 18/10/2026) ═══════════════════════════════════════
 *
 * Un seul composant pour « Ajouter un nouveau bien » (et le formulaire enchaîné après « Créer un nouveau propriétaire ») ET
 * l'ancienne page « Nouveau propriétaire + bien » : mêmes choix, mêmes messages, mêmes alertes — la règle est celle de
 * `bienComplet.ts` (`manquesDpeEntretien`), la même que le serveur.
 *
 * MISE EN PAGE (Arno) : le bloc a QUATRE rangées — titre · choix · date · alertes. Posé dans `.loc-dpe-pno` à côté du bloc
 * « Assurance PNO » (mêmes quatre rangées), les deux partagent la MÊME grille (`subgrid`) : les choix sont sur une ligne,
 * les dates sur la ligne suivante, et les blocs ont la même hauteur ; les alertes du DPE vont dans la 4e rangée, sous les
 * dates, sans rien désaligner. Au bureau, les 8 choix tiennent sur UNE ligne ; au téléphone ils peuvent passer sur deux.
 */
export function BlocDpe({ classe, date, onClasse, onDate, aujourdhui, manque }: {
  classe: string; date: string; onClasse: (c: string) => void; onDate: (d: string) => void; aujourdhui: string;
  /** Le message de la règle sous le champ (`dpe`, `dpeDate`), ou rien. */
  manque: (cle: 'dpe' | 'dpeDate') => React.ReactNode;
}) {
  const nonSoumis = classe === DPE_NON_SOUMIS;
  return (
    <div className="loc-dpe-pno-bloc" data-dpe>
      <h4>DPE <span className="loc-oblig">*</span></h4>
      <div className="loc-dpe-pno-choix">
        <div className="loc-pilules loc-pilules--dpe" role="group" aria-label="Classe DPE">
          {CLASSES_DPE.map((c) => (
            <button key={c} type="button" aria-pressed={classe === c} onClick={() => onClasse(classe === c ? '' : c)}>{c}</button>
          ))}
          {/* « Non soumis » (bien dispensé de DPE), dans le prolongement des lettres : la date est vidée et grisée. */}
          <button type="button" aria-pressed={nonSoumis} data-dpe-non-soumis
            onClick={() => { if (nonSoumis) onClasse(''); else { onClasse(DPE_NON_SOUMIS); onDate(''); } }}>{LIBELLE_DPE_NON_SOUMIS}</button>
        </div>
        {manque('dpe')}
      </div>
      <div className="loc-dpe-pno-date">
        <label className="loc-champ" data-dpe-date><span>Date du DPE{nonSoumis ? ' (sans objet)' : <> <span className="loc-oblig">*</span></>}</span>
          <input type="date" value={date} max={aujourdhui} disabled={nonSoumis} onChange={(e) => onDate(e.target.value)} /></label>
        {manque('dpeDate')}
      </div>
      <div className="loc-dpe-pno-notes" data-notes-dpe>
        {alertesDpe({ classe, date, nonSoumis }, aujourdhui).map((a) => (
          <p key={a} className="loc-alerte loc-alerte--orange" role="status" data-alerte-dpe>⚠ {a}</p>
        ))}
      </div>
    </div>
  );
}

export const CSS_DPE_PNO = `
/* DPE (gauche) et assurance PNO (droite) : deux blocs de même hauteur, rangées partagées (Arno, 18/10/2026). */
.loc-dpe-pno{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
.loc-dpe-pno-bloc{display:grid;grid-template-rows:auto auto auto auto;row-gap:14px;align-content:start;align-items:start;min-width:0;
  border:2px solid var(--color-svv-line);border-radius:20px;padding:18px 20px;background:var(--color-svv-field);box-sizing:border-box}
.loc-dpe-pno-bloc > h4{margin:0;font-size:1.08rem;font-weight:700;color:var(--color-svv-ink)}
.loc-dpe-pno-choix,.loc-dpe-pno-date,.loc-dpe-pno-notes{display:flex;flex-direction:column;gap:10px;min-width:0}
.loc-dpe-pno-notes:empty{display:none}
.loc-dpe-pno-notes .loc-alerte{margin:0}
.loc-dpe-pno.loc-dpe-pno--seul{margin-bottom:16px}
.loc-dpe-pno-bloc input:disabled{background:var(--color-svv-field);color:var(--color-svv-muted);cursor:not-allowed}
/* Les choix du DPE : pastilles un peu plus compactes (même style), « Non soumis » dans le prolongement des lettres. */
.loc-pilules--dpe{gap:8px}
.loc-pilules--dpe button{padding:0 13px;min-width:46px;white-space:nowrap;flex-shrink:0}
/* Au téléphone : les 8 choix sur DEUX lignes au plus (pastilles et marges un peu resserrées, même style). */
@media (max-width:600px){
  .loc-dpe-pno-bloc{padding:16px 12px}
  .loc-pilules--dpe{gap:6px}
  .loc-pilules--dpe button{padding:0 10px;min-width:40px;font-size:1rem}
}
@media (min-width:900px){
  .loc-dpe-pno{grid-template-columns:minmax(0,3fr) minmax(0,2fr);grid-template-rows:auto auto auto auto;column-gap:24px;row-gap:0}
  .loc-dpe-pno-bloc{grid-row:span 4;grid-template-rows:subgrid;row-gap:14px}
  .loc-dpe-pno-notes:empty{display:flex}
  .loc-pilules--dpe{flex-wrap:nowrap}
  /* Le DPE seul (ancienne page « Nouveau propriétaire + bien ») : une colonne. */
  .loc-dpe-pno.loc-dpe-pno--seul{grid-template-columns:minmax(0,44rem)}
}
/* Bureau étroit : les 8 choix restent sur une ligne, pastilles un peu plus serrées (jamais écrasées : flex-shrink:0). */
@media (min-width:900px) and (max-width:1099px){
  .loc-dpe-pno{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}
  .loc-dpe-pno-bloc{padding:18px 16px}
  .loc-pilules--dpe{gap:5px}
  .loc-pilules--dpe button{padding:0 9px;min-width:40px}
}
`;
