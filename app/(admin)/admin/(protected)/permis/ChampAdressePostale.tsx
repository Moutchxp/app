'use client';

import { useState, type CSSProperties } from 'react';
import { ChampAdresseOfficielle } from '../../../../components/adresse/ChampAdresseOfficielle';
import { adresseDuChoix } from '../../../../components/adresse/adresseOfficielle';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';

/**
 * ══ 🔴🔴 L'ADRESSE POSTALE D'UN SERVICE DE MAIRIE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7b) ══════════════════════════════════════════
 * Le COMPOSANT UNIQUE (propositions de la Base Adresse), avec la saisie libre CONSERVÉE derrière « Adresse absente de la liste ? » : une adresse
 * postale porte souvent un nom de service, une boîte postale, un « CS » ou un « CEDEX » que la Base Adresse ne connaît pas. La valeur déjà
 * enregistrée s'affiche telle quelle et n'est jamais réécrite : seul un nouveau choix dans la liste la remplace.
 */
export function ChampAdressePostale({ valeur, onChange, style, styleBloc, ariaLabel, exemple = 'Service urbanisme, 1 place de la Mairie, 92000…' }: {
  valeur: string; onChange: (v: string) => void; style: CSSProperties; styleBloc?: CSSProperties; ariaLabel?: string; exemple?: string;
}) {
  const [libre, setLibre] = useState(false);
  const lien: CSSProperties = { alignSelf: 'flex-start', minHeight: 44, padding: 0, border: 0, background: 'none', color: 'var(--color-svv-red)', font: 'inherit', fontSize: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', minWidth: 0, width: '100%', ...styleBloc }} data-adresse-postale={libre ? 'libre' : 'liste'}>
      <style>{CSS_CHAMP_ADRESSE}</style>
      {libre ? (
        <>
          <input type="text" value={valeur} placeholder={exemple} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} style={style} data-adresse-postale-libre />
          <button type="button" style={lien} onClick={() => setLibre(false)} data-adresse-postale-retour>Revenir aux suggestions</button>
        </>
      ) : (
        <>
          <ChampAdresseOfficielle valeur={valeur} onChange={onChange} onChoisir={(a) => onChange(adresseDuChoix(a))} exemple={exemple}
            attributs={ariaLabel === undefined ? {} : { 'aria-label': ariaLabel }} apparence={{ champ: { className: '', style } }} />
          <button type="button" style={lien} onClick={() => setLibre(true)} data-adresse-postale-hors-liste>Adresse absente de la liste ? (BP, CS, CEDEX)</button>
        </>
      )}
    </div>
  );
}
