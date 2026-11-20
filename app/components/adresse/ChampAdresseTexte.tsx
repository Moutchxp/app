'use client';

import { useState, type CSSProperties } from 'react';
import { ChampAdresseOfficielle, type ApparenceChamp } from './ChampAdresseOfficielle';
import { adresseDuChoix, type AdresseOfficielle } from './adresseOfficielle';
import { MOT_ADRESSE_NON_VERIFIEE } from '../../lib/gestion/saisieFiche';

/**
 * ══ 🔴🔴 UNE ADRESSE GARDÉE EN UNE CHAÎNE DE TEXTE (Arno, 20/11/2026, « Adresse officielle BAN », lots 7b et 7d) ══════════════════════════════════
 * Le COMPOSANT UNIQUE (propositions de la Base Adresse) ; la saisie libre CONSERVÉE derrière « Adresse absente de la liste ? » (une adresse à
 * l'étranger, une boîte postale, un « CS », un « CEDEX »), et « Revenir aux suggestions ». La valeur déjà enregistrée s'affiche telle quelle et n'est
 * jamais réécrite : seul un nouveau choix dans la liste la remplace. `onChange` dit aussi la NATURE de la saisie : « liste » (choisie dans la
 * liste), « libre » (saisie libre), `null` (tapée sans choisir) — le serveur n'enregistre le format unique que pour « liste ».
 */
export type NatureSaisie = 'liste' | 'libre' | null;

export function ChampAdresseTexte({ valeur, onChange, style, styleBloc, className, ariaLabel, exemple, lienLibre = 'Adresse absente de la liste ?', id, apparence, verifiee }: {
  valeur: string; onChange: (v: string, nature: NatureSaisie, officielle?: AdresseOfficielle) => void;
  /** le style ou la classe du champ (celui de l'écran qui le monte) */
  style?: CSSProperties; className?: string; styleBloc?: CSSProperties; ariaLabel?: string; exemple?: string;
  /** le mot du lien vers la saisie libre */
  lienLibre?: string; id?: string; apparence?: ApparenceChamp;
  /** faux : la mention discrète « adresse non vérifiée » (celle de ChampAdresseBan) quand une adresse est tapée sans être choisie ; absent : aucune mention */
  verifiee?: boolean;
}) {
  const [libre, setLibre] = useState(false);
  const lien: CSSProperties = { alignSelf: 'flex-start', minHeight: 44, padding: 0, border: 0, background: 'none', color: 'var(--color-svv-red)', font: 'inherit', fontSize: 12, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', minWidth: 0, width: '100%', ...styleBloc }} data-adresse-texte={libre ? 'libre' : 'liste'}>
      {libre ? (
        <>
          <input id={id} type="text" value={valeur} placeholder={exemple} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value, 'libre')} style={style} className={className}
            data-adresse-texte-libre />
          <button type="button" style={lien} onClick={() => setLibre(false)} data-adresse-texte-retour>Revenir aux suggestions</button>
        </>
      ) : (
        <>
          <ChampAdresseOfficielle id={id} valeur={valeur} onChange={(v) => onChange(v, null)} onChoisir={(a) => onChange(adresseDuChoix(a), 'liste', a)} exemple={exemple}
            attributs={ariaLabel === undefined ? {} : { 'aria-label': ariaLabel }} apparence={apparence ?? { champ: { className: className ?? '', style } }}
            apresListe={verifiee === false ? ({ ouvert, cherche }) => (!ouvert && !cherche && valeur.trim() !== '' ? <span className="cab-note">{MOT_ADRESSE_NON_VERIFIEE}</span> : null) : null} />
          <button type="button" style={lien} onClick={() => setLibre(true)} data-adresse-texte-hors-liste>{lienLibre}</button>
        </>
      )}
    </div>
  );
}
