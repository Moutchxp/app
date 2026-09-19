'use client';

import type { Process } from '../../../../lib/sitadel/process';

/**
 * BLOC AUTO/MANUEL de préparation des demandes — COMMUN AUX DEUX RAILS, rendu JUSTE SOUS le sélecteur des deux rails (au-dessus du
 * carrousel de dépôt). L'axe auto/manuel désigne, selon le rail :
 *  · TÉLÉSERVICE : la SÉLECTION des permis à demander. AUTO → une carte de dépôt par commune LIBRE apparaît toute seule dans le
 *    carrousel ci-dessous (aucun geste ; la demande se crée au 1er geste réel). MANUEL → on choisit soi-même un permis dans le vivier
 *    téléservice, hors critères.
 *  · E-MAIL : la préparation de la 1re DEMANDE d'information. AUTO → le lot par critères (bouton « Préparer les demandes » plus bas,
 *    INCHANGÉ). MANUEL → on choisit soi-même un permis dans le vivier e-mail, hors critères (même chemin de création existant).
 *
 * 🔒 Cet axe est STRICTEMENT DISTINCT de l'automatisation des RELANCES (chronologie des rappels, réglage `relance_auto_active`) : le
 *    choix fait ici n'a AUCUN impact sur elle, et réciproquement. Aucun écriture en base : `mode` est un état d'écran (parent ADemanderVue).
 *
 * Le `mode` est CONTRÔLÉ par le parent (ADemanderVue), qui l'utilise aussi, côté téléservice, pour afficher/masquer les cartes
 * virtuelles du carrousel. Chaque mode dit en TOUTES LETTRES ce qu'il fait (le texte porte l'info ; `aria-pressed` porte l'état ; la
 * couleur — trame ROUGE du rail actif — n'est qu'un appui). Mobile-first : les cartes passent l'une sous l'autre, cibles ≥ 44 px.
 */
export type ModePreparation = 'auto' | 'manuel';

export function ModeDemandeTeleservice({ mode, onMode, process = 'formulaire', badge }: {
  mode: ModePreparation;
  onMode: (m: ModePreparation) => void;
  process?: Process; // rail concerné (défaut téléservice — historique). Pilote le vocabulaire du mode manuel.
  badge?: React.ReactNode; // 224 — pastille d'ÉTAT permanent (rail e-mail : envoi auto ON/OFF), rendue dans l'en-tête. Absente → rien.
}) {
  const estTeleservice = process === 'formulaire';
  // Trame ROUGE de l'option ACTIVE = MÊMES tokens que le rail actif du sélecteur au-dessus (CommutateurProcess) : bordure rouge + fond
  //   rouge pâle. Aucune valeur de couleur nouvelle en dur.
  const styleOnglet = (actif: boolean): React.CSSProperties => ({
    flex: '1 1 12rem', minHeight: 44, padding: '.4rem .7rem', borderRadius: '.5rem', fontSize: 13, textAlign: 'left',
    border: actif ? '2px solid var(--color-svv-red)' : '1px solid var(--color-svv-line)',
    background: actif ? 'var(--color-svv-red-soft, #fdecec)' : 'transparent', fontWeight: actif ? 700 : 500, cursor: 'pointer',
  });

  const titre = estTeleservice ? 'Comment sélectionner les demandes téléservice ?' : 'Comment préparer la 1re demande e-mail ?';
  const libAuto = estTeleservice ? 'Sélection automatique' : 'Envoi automatique';
  const aideAuto = estTeleservice
    ? 'Les cartes de dépôt des communes libres apparaissent toutes seules dans le carrousel ci-dessus (aucun clic ; la demande se crée au 1er geste).'
    : 'Les 1res demandes déjà prêtes partent toutes seules aux mairies, aux créneaux ouvrés, dans la limite de tes plafonds (par passage, par jour, par commune et par mois). L’activation est confirmée par une fenêtre récapitulative.';
  const libManuel = estTeleservice ? 'Sélection manuelle' : 'Envoi manuel';
  const aideManuel = estTeleservice
    ? 'Tu choisis toi-même un permis dans le vivier téléservice, hors des critères de sélection.'
    : 'Tu choisis toi-même un permis dans le vivier e-mail, hors des critères, pour préparer sa 1re demande.';

  return (
    <section aria-label="Mode de préparation des demandes" className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13 }}>{titre}</strong>
        {badge}
      </div>
      <div role="group" aria-label="Choisir le mode de préparation" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="svv-choix" aria-pressed={mode === 'auto'} onClick={() => onMode('auto')} style={styleOnglet(mode === 'auto')}>
          {libAuto} {mode === 'auto' ? '· actif' : ''}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>{aideAuto}</span>
        </button>
        <button type="button" className="svv-choix" aria-pressed={mode === 'manuel'} onClick={() => onMode('manuel')} style={styleOnglet(mode === 'manuel')}>
          {libManuel} {mode === 'manuel' ? '· actif' : ''}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>{aideManuel}</span>
        </button>
      </div>

      {mode === 'auto' && (
        <p role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
          {estTeleservice
            ? 'Regarde le carrousel « à déposer à la main » ci-dessus : chaque commune libre y a déjà sa carte de dépôt, prête à copier.'
            : 'L’envoi automatique est activé : les 1res demandes prêtes partent aux mairies aux créneaux ouvrés, sans geste de ta part. Reviens en « Envoi manuel » pour reprendre la main. Le bouton « Préparer les demandes » plus bas reste disponible.'}
        </p>
      )}
      {/* §C — le moteur de recherche du mode manuel a MIGRÉ dans le moteur fusionné (RechercheVivier, plus bas dans l'onglet) : ici, une
          NOTE oriente vers lui. La bascule et le texte du mode manuel restent ; seul l'ancien moteur interne (RechercheVivierManuel) est retiré. */}
      {mode === 'manuel' && (
        <p role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
          {estTeleservice
            ? 'Sers-toi du moteur de recherche ci-dessous : cherche un permis, puis « Afficher la carte dans le carrousel » — elle passe en 1re position, devant la sélection automatique de sa commune.'
            : 'Sers-toi du moteur de recherche ci-dessous : cherche un permis, puis « Préparer cette demande » — elle apparaît dans la liste des demandes.'}
        </p>
      )}
    </section>
  );
}
