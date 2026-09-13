'use client';

import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import { BlocRepliable } from './BlocRepliable';
import { BasculeRail } from './BasculeRail';
import { PanneauCarteRail } from './PanneauCarteRail';
import type { CompteursProcess } from './CommutateurProcess';

/**
 * AJUSTEMENT — REGROUPE, dans « À demander », DEUX lignes repliables auparavant séparées : ② « Basculer une commune de rail » et ③ la
 * carte interactive du rail actif (Lot 4). Une SEULE ligne repliable les contient (gain de place). On NE supprime, ne masque, ne conditionne
 * RIEN : les deux fonctions gardent l'INTÉGRALITÉ de leurs contrôles et de leur comportement, chacune sous son PROPRE en-tête distinct.
 *
 * Décision porteur : le 3e groupe « Hors process » ① reste dans le commutateur (composant partagé « À demander » + « En cours », inchangé).
 * Ici on n'en RÉPÈTE que le DÉCOMPTE dans le libellé, pour garder l'info d'un coup d'œil SANS déplier. La carte (~366 communes) reste dans un
 * repli INTERNE → chargement paresseux : ouvrir le groupe pour « Basculer » ne charge pas la carte.
 */
export function GroupeRailsCommunes({ hors, rail, onAction }: {
  hors: CompteursProcess['hors'] | null; rail: Process; onAction: () => void;
}) {
  const sansAdresse = hors?.communesSansAdresse ?? 0;
  const courrier = hors?.courrierDemandes ?? 0;
  // Libellé : NOMME les fonctions contenues (bascule + carte) ET porte le DÉCOMPTE hors-process (un coup d'œil, sans déplier). Tient sur UNE
  //   ligne (nowrap + ellipsis, texte intégral au survol) ; si l'espace manque, seule la queue se tronque — le décompte reste aussi visible
  //   dans le commutateur au-dessus (① inchangé), donc jamais perdu.
  const texteHors = `hors process : ${sansAdresse} sans adresse${courrier > 0 ? ` · ${courrier} courrier` : ''}`;
  const titre = (
    <span title={`Bascule de rail & carte des communes — ${texteHors}`}
      style={{ display: 'inline-block', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
      Bascule de rail &amp; carte des communes
      <span style={{ color: 'var(--color-svv-muted)', fontWeight: 400 }}> — {texteHors}</span>
    </span>
  );

  return (
    <BlocRepliable titre={titre}>
      {() => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          {/* ② Basculer une commune de rail — composant INCHANGÉ (garde son propre repli + tous ses contrôles + son message). */}
          <BasculeRail onBascule={onAction} />
          {/* ③ Carte des communes du rail ACTIF — repli INTERNE (chargement paresseux de la carte) ; son titre sert de sous-titre distinct. */}
          <BlocRepliable titre={<>Carte des communes — rail {PROCESS_META[rail].court}</>}>
            {() => <PanneauCarteRail rail={rail} onApplique={onAction} />}
          </BlocRepliable>
        </div>
      )}
    </BlocRepliable>
  );
}
