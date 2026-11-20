'use client';

import { type CSSProperties } from 'react';
import { ChampAdresseTexte } from '../../../../components/adresse/ChampAdresseTexte';
import { CSS_CHAMP_ADRESSE } from '../gestion/ChampAdresseBan';

/**
 * ══ 🔴🔴 L'ADRESSE POSTALE D'UN SERVICE DE MAIRIE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7b) ══════════════════════════════════════════
 * Le COMPOSANT UNIQUE (propositions de la Base Adresse), avec la saisie libre CONSERVÉE derrière « Adresse absente de la liste ? » : une adresse
 * postale porte souvent un nom de service, une boîte postale, un « CS » ou un « CEDEX » que la Base Adresse ne connaît pas. La valeur déjà
 * enregistrée s'affiche telle quelle et n'est jamais réécrite : seul un nouveau choix dans la liste la remplace.
 * (lot 7d) un emballage de `ChampAdresseTexte`, la même saisie pour toutes les adresses gardées en une chaîne.
 */
export function ChampAdressePostale({ valeur, onChange, style, styleBloc, ariaLabel, exemple = 'Service urbanisme, 1 place de la Mairie, 92000…' }: {
  valeur: string; onChange: (v: string) => void; style: CSSProperties; styleBloc?: CSSProperties; ariaLabel?: string; exemple?: string;
}) {
  return (
    <>
      <style>{CSS_CHAMP_ADRESSE}</style>
      <ChampAdresseTexte valeur={valeur} onChange={(v) => onChange(v)} style={style} styleBloc={styleBloc} ariaLabel={ariaLabel} exemple={exemple}
        lienLibre="Adresse absente de la liste ? (BP, CS, CEDEX)" />
    </>
  );
}
