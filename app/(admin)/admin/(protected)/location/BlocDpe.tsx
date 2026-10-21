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
 * dates, sans rien désaligner.
 * Arno (21/10/2026, débordement constaté en production) : les lettres A à G sont des pastilles compactes de MÊME largeur, sur une
 * ligne ; « Non soumis » les suit s'il y a la place, sinon passe à la ligne suivante — jamais coupé, jamais hors de l'encadré.
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
            <button key={c} type="button" className="loc-dpe-lettre" aria-pressed={classe === c} onClick={() => onClasse(classe === c ? '' : c)}>{c}</button>
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
/* Les choix du DPE (Arno, 21/10/2026) : les lettres A à G = pastilles compactes de MÊME largeur, lettre seule centrée ; la coche
   du choix retenu est posée AU-DESSUS de la lettre, en petit, hors du flux (la largeur ne change jamais au clic). « Non soumis » garde la pastille
   ordinaire et passe à la ligne s'il manque de place : le retour à la ligne est TOUJOURS permis — rien ne sort de l'encadré. */
.loc-pilules--dpe{gap:8px;flex-wrap:wrap}
.loc-pilules--dpe button{flex:0 0 auto;white-space:nowrap;max-width:100%}
.loc-pilules--dpe button.loc-dpe-lettre{position:relative;width:3.25rem;min-width:44px;padding:0;text-align:center}
.loc-pilules--dpe button.loc-dpe-lettre::before{position:absolute;left:50%;top:5px;transform:translateX(-50%);content:"✓";font-size:.62em;line-height:1}
.loc-pilules--dpe button.loc-dpe-lettre::after{content:none}
.loc-pilules--dpe button[data-dpe-non-soumis]{padding:0 16px}
/* Au téléphone : les sept lettres tiennent sur une ligne (cibles de 44 px, encadré et marges resserrés). */
@media (max-width:600px){
  .loc-dpe-pno-bloc{padding:16px 10px}
  .loc-pilules--dpe{gap:3px}
  .loc-pilules--dpe button{font-size:1rem}
  .loc-pilules--dpe button.loc-dpe-lettre{width:44px}
}
@media (min-width:900px){
  .loc-dpe-pno{grid-template-columns:minmax(0,3fr) minmax(0,2fr);grid-template-rows:auto auto auto auto;column-gap:24px;row-gap:0}
  .loc-dpe-pno-bloc{grid-row:span 4;grid-template-rows:subgrid;row-gap:14px}
  .loc-dpe-pno-notes:empty{display:flex}
  /* Le DPE seul (ancienne page « Nouveau propriétaire + bien ») : une colonne. */
  .loc-dpe-pno.loc-dpe-pno--seul{grid-template-columns:minmax(0,44rem)}
}
/* Bureau étroit : DPE plus large que PNO, encadrés un peu resserrés (les pastilles gardent leur taille). */
@media (min-width:900px) and (max-width:1099px){
  .loc-dpe-pno{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}
  .loc-dpe-pno-bloc{padding:18px 16px}
  .loc-pilules--dpe{gap:6px}
}
`;
