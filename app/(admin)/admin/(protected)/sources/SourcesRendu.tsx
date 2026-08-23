import type { CSSProperties, ReactNode } from 'react';
import {
  DEPARTEMENTS,
  resumeCouverture,
  texteReingestion,
  type Couverture,
  type Departement,
  type EtatDetection,
  type LigneSource,
} from '../../../../lib/admin/sourcesFraicheur';
import { preparerCommande, aUneProcedure, TERMINAL_RAPPEL } from '../../../../lib/admin/commandeReingestion';
import { formaterOctets, formaterPct, type MorphologieDisque, type PosteMorphologie } from '../../../../lib/admin/morphologieDisque';
import type { AffichageProtocoles, SectionProtocole } from '../../../../lib/admin/protocolesReingestion';
import { misesAJourSansProcedure } from '../../../../lib/admin/pastilleSources';
import { BoutonCopier } from '../permis/BoutonCopier';

/**
 * FRAÎCHEUR DES DONNÉES — rendu PUR (lot 1/3). Aucun état, aucun effet, aucune I/O → testable en Node via
 * `renderToStaticMarkup`. Trois blocs : le tableau (une ligne par source), la grille de couverture par département
 * (sources spatiales), et une ligne de contexte en clair. Les règles d'honnêteté sont portées par le modèle
 * (`sourcesFraicheur.ts`) ; ici on ne fait que les afficher sans les contredire (jamais « à jour », substitut visible).
 * Mobile-first : le tableau défile horizontalement dans son conteneur (jamais de débordement de page), la couverture
 * se replie en pastilles qui reviennent à la ligne. AUCUN bleu, focus rouge, pas d'interaction au survol seul.
 */

const cellule: CSSProperties = { padding: '.5rem .6rem', fontSize: 13, verticalAlign: 'top', borderBottom: '1px solid var(--color-svv-line)' };
const enTete: CSSProperties = { ...cellule, textAlign: 'left', fontWeight: 700, color: 'var(--color-svv-muted)', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: 11, letterSpacing: '.02em' };

/** Millésime OU substitut OU état vide/indisponible — jamais trompeur : un substitut se lit comme un substitut. */
function CelluleMillesime({ ligne }: { ligne: LigneSource }) {
  if (ligne.indisponible) return <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>lecture indisponible</span>;
  if (ligne.vide) return <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>aucune donnée en base</span>;
  if (ligne.estSubstitut) {
    return (
      <span style={{ color: 'var(--color-svv-muted)' }}>
        {ligne.millesimeAffiche} <span style={{ fontSize: 11, fontStyle: 'italic' }}>(substitut, pas un millésime)</span>
      </span>
    );
  }
  return <strong style={{ color: 'var(--color-svv-ink)', fontVariantNumeric: 'tabular-nums' }}>{ligne.millesimeAffiche}</strong>;
}

/** Âge en jours de ce qu'on a — JAMAIS « à jour » : sans date fiable, « inconnu ». */
function CelluleAge({ ligne }: { ligne: LigneSource }) {
  if (ligne.vide || ligne.indisponible) return <span style={{ color: 'var(--color-svv-muted)' }}>—</span>;
  if (ligne.ageJours === null) return <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>inconnu</span>;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ligne.ageJours} j</span>;
}

/** Édition distante détectée (lot 2). Règle d'honnêteté : un échec dit « non vérifié depuis N j », JAMAIS « à jour ». */
function CelluleDetection({ ligne, onToggle }: { ligne: LigneSource; onToggle?: (source: string, actif: boolean) => void }) {
  const d: EtatDetection | undefined = ligne.detection;
  if (!d) return <span style={{ color: 'var(--color-svv-muted)' }}>—</span>;

  let corps: ReactNode;
  if (d.statut === 'a_jour') {
    corps = <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>à jour</span>;
  } else if (d.statut === 'mise_a_jour') {
    corps = <span style={{ color: 'var(--color-svv-red)', fontWeight: 700 }}>⚠ mise à jour disponible — {d.editionDistante}</span>;
  } else if (d.statut === 'non_verifiable') {
    corps = <span style={{ color: 'var(--color-svv-muted)' }} title={d.motif}>non vérifiable <span style={{ fontSize: 11, fontStyle: 'italic' }}>({d.motif})</span></span>;
  } else if (d.statut === 'echec') {
    const n = d.depuisJours;
    corps = <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}>non vérifié{n !== null ? ` depuis ${n} j` : ''}</span>;
  } else if (d.statut === 'desactive') {
    corps = <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>surveillance désactivée</span>;
  } else {
    corps = <span style={{ color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>jamais vérifié</span>;
  }

  // Réglage par source : seules les sources DÉTECTABLES portent l'interrupteur (une non détectable n'a rien à surveiller).
  const bascule = ligne.detectable ? (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-svv-muted)', cursor: 'pointer', marginTop: 4 }}>
      <input
        type="checkbox"
        checked={d.statut !== 'desactive'}
        onChange={(e) => onToggle?.(ligne.cle, e.target.checked)}
        aria-label={`Surveiller ${ligne.nom}`}
      />
      surveiller
    </label>
  ) : null;

  return <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 0 }}>{corps}{bascule}</span>;
}

/** Le tableau : une ligne par source, dans l'ordre du modèle (LiDAR en tête). Défile dans son conteneur sur mobile. */
export function TableauSources({ lignes, onToggle }: { lignes: LigneSource[]; onToggle?: (source: string, actif: boolean) => void }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-svv-line)', borderRadius: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 860 }}>
        <thead>
          <tr>
            <th style={enTete}>Source</th>
            <th style={enTete}>Ce qu’elle sert</th>
            <th style={enTete}>Millésime en base</th>
            <th style={enTete}>Âge</th>
            <th style={enTete}>Édition distante</th>
            <th style={enTete}>Surveillance</th>
            <th style={enTete}>Réingestion</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle}>
              <td style={{ ...cellule, fontWeight: 700, color: 'var(--color-svv-ink)', whiteSpace: 'nowrap' }}>{l.nom}</td>
              <td style={{ ...cellule, color: 'var(--color-svv-muted)', minWidth: 180 }}>{l.sert}</td>
              <td style={cellule}><CelluleMillesime ligne={l} /></td>
              <td style={cellule}><CelluleAge ligne={l} /></td>
              <td style={{ ...cellule, minWidth: 190 }}><CelluleDetection ligne={l} onToggle={onToggle} /></td>
              <td style={cellule}>
                {l.surveillance
                  ? <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}>oui</span>
                  : <span style={{ color: 'var(--color-svv-muted)' }}>non</span>}
              </td>
              <td style={{ ...cellule, whiteSpace: 'nowrap' }}>
                <span style={l.reingestion.mode === 'inexistante' ? { color: 'var(--color-svv-red)', fontWeight: 600 } : { color: 'var(--color-svv-ink)' }}>
                  {texteReingestion(l.reingestion)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STYLE_COUV: Record<Couverture, CSSProperties> = {
  present: { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)', borderColor: 'var(--color-svv-green)' },
  partiel: { background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)', borderColor: 'var(--color-svv-red)', borderStyle: 'dashed' },
  absent: { background: 'transparent', color: 'var(--color-svv-muted)', borderColor: 'var(--color-svv-line)' },
};
const SYMBOLE: Record<Couverture, string> = { present: '✓', partiel: '~', absent: '·' };
const MOT: Record<Couverture, string> = { present: 'présent', partiel: 'partiel', absent: 'absent' };

/** Une pastille de couverture : symbole + n° de département + libellé accessible (jamais la couleur SEULE). */
function PastilleDept({ dept, etat }: { dept: Departement; etat: Couverture }) {
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 44, minHeight: 28, justifyContent: 'center',
    padding: '2px 8px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, ...STYLE_COUV[etat],
  };
  return (
    <span style={style} aria-label={`${dept} : ${MOT[etat]}`} title={`${dept} : ${MOT[etat]}`}>
      <span aria-hidden="true">{SYMBOLE[etat]}</span>
      <span>{dept}</span>
    </span>
  );
}

/** Grille de couverture : une carte par source SPATIALE, ses 8 départements en pastilles qui reviennent à la ligne. */
export function GrilleCouverture({ lignes }: { lignes: LigneSource[] }) {
  const spatiales = lignes.filter((l) => l.couverture);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-svv-muted)' }}>
        <span aria-hidden="true">✓</span> présent · <span aria-hidden="true">~</span> partiel · <span aria-hidden="true">·</span> absent
      </p>
      {spatiales.map((l) => (
        <div key={l.cle} className="svv-card" style={{ padding: '.7rem .85rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--color-svv-ink)', marginBottom: 6, fontSize: 13 }}>{l.nom}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEPARTEMENTS.map((d) => (
              <PastilleDept key={d} dept={d} etat={l.couverture![d]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ligne de contexte en clair : le LiDAR est la seule source du verdict, et le verdict n'existe que là où il couvre. */
export function LigneContexte({ lignes }: { lignes: LigneSource[] }) {
  const { departementsLidar, departementsBati } = resumeCouverture(lignes);
  const zoneLidar = departementsLidar.length > 0
    ? `une zone limitée du ${departementsLidar.join(', ')} (aujourd’hui ≈ 1 km² au-dessus d’Asnières)`
    : 'aucune zone';
  return (
    <p className="svv-page-note" style={{ fontSize: 13, lineHeight: 1.5 }}>
      <strong>Seul le LiDAR entre dans le verdict.</strong> Il ne couvre que {zoneLidar} :
      un certificat n’est possible que là où le LiDAR existe. Les autres sources vont jusqu’à{' '}
      {departementsBati.length} département{departementsBati.length > 1 ? 's' : ''} et servent à éclairer et à détecter
      les changements, mais aucune n’entre dans le verdict.
    </p>
  );
}

/** Motif d'ABSENCE de commande pour une source (le pendant honnête du bouton : on dit toujours POURQUOI il n'y est pas). */
function motifSansCommande(ligne: LigneSource): string {
  const d = ligne.detection;
  if (ligne.reingestion.mode === 'automatique') return 'réingestion automatique — rien à préparer';
  if (ligne.reingestion.mode === 'inexistante') {
    return d?.statut === 'mise_a_jour'
      ? 'mise à jour disponible, mais AUCUNE procédure de réingestion — manque à combler'
      : 'aucune procédure de réingestion';
  }
  // Procédure manuelle existante, mais pas de mise à jour confirmée :
  if (!d || d.statut === 'a_jour') return 'déjà à jour — rien à préparer';
  if (d.statut === 'non_verifiable') return 'non vérifiable — aucune comparaison possible';
  if (d.statut === 'echec') return 'vérification en échec — mise à jour non confirmée';
  if (d.statut === 'desactive') return 'surveillance désactivée';
  return 'jamais vérifié — mise à jour non confirmée';
}

/** Une ligne de la section réingestion : soit le bloc « Préparer la commande », soit le motif de son absence. */
function LigneReingestion({ ligne, cheminDepot }: { ligne: LigneSource; cheminDepot: string }) {
  const actionnable = ligne.detection?.statut === 'mise_a_jour' && aUneProcedure(ligne.cle);
  const edition = ligne.detection?.statut === 'mise_a_jour' ? ligne.detection.editionDistante : null;
  const prep = actionnable ? preparerCommande(ligne.cle, edition, cheminDepot) : null;

  return (
    <div className="svv-card" style={{ padding: '.7rem .85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontSize: 13 }}>{ligne.nom}</span>
        {!prep && <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{motifSansCommande(ligne)}</span>}
      </div>
      {prep && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--color-svv-red)', fontSize: 13 }}>
            Préparer la commande{ligne.detection?.statut === 'mise_a_jour' ? ` — mise à jour ${ligne.detection.editionDistante}` : ''}
          </summary>
          {prep.avertissement && (
            <p role="note" style={{ margin: '8px 0 4px', fontSize: 12, lineHeight: 1.45, color: 'var(--color-svv-red)', fontWeight: 600 }}>
              ⚠ {prep.avertissement}
            </p>
          )}
          <p style={{ margin: '4px 0', fontSize: 11.5, color: 'var(--color-svv-muted)' }}>{TERMINAL_RAPPEL}</p>
          <pre style={{
            margin: '4px 0 8px', padding: '.6rem .7rem', overflowX: 'auto', fontSize: 12.5, lineHeight: 1.5,
            background: 'var(--color-svv-field)', border: '1px solid var(--color-svv-line)', borderRadius: 8,
            whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>{prep.commande}</pre>
          <BoutonCopier valeur={prep.commande} libelle="Copier la commande" />
        </details>
      )}
    </div>
  );
}

/**
 * Section RÉINGESTION (lot 3) — pour chaque source, soit le bloc copiable « Préparer la commande » (quand une mise à jour
 * est disponible ET qu'une procédure existe), soit le motif de son absence. La tuile n'exécute RIEN : elle prépare, l'humain
 * colle dans un terminal. `cheminDepot` = chemin ABSOLU du dépôt (fourni par le serveur).
 */
export function SectionReingestion({ lignes, cheminDepot }: { lignes: LigneSource[]; cheminDepot: string }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {lignes.map((l) => (
        <LigneReingestion key={l.cle} ligne={l} cheminDepot={cheminDepot} />
      ))}
    </div>
  );
}

/**
 * Regroupement « PÉRIMÉES SANS PROCÉDURE CONNUE » (F7) — les sources dont une publication plus récente a été détectée, mais
 * pour lesquelles AUCUN geste n'est documenté (cas c au sens du parseur de protocoles). Elles ne disparaissent pas de l'écran :
 * elles changent de statut. Rien à afficher (aucune dans ce cas) → composant vide. La phrase explicite POURQUOI ce bloc existe,
 * pour qu'il ne ressemble pas à une mise au rebut.
 */
export function SectionPerimeesSansProcedure({ lignes, protocoles }: { lignes: LigneSource[]; protocoles: AffichageProtocoles }) {
  const perimees = misesAJourSansProcedure(lignes, protocoles);
  if (perimees.length === 0) return null;
  return (
    <div className="svv-card" style={{ padding: '.7rem .85rem', borderColor: 'var(--color-svv-red)' }}>
      <div style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontSize: 13 }}>Périmées sans procédure connue</div>
      <p style={{ margin: '4px 0 8px', fontSize: 12, lineHeight: 1.5, color: 'var(--color-svv-muted)' }}>
        Ces sources ont bien une publication plus récente que ce qu’on détient, mais aucun geste n’est documenté pour les
        recharger. Elles ne comptent donc pas parmi les mises à jour disponibles.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {perimees.map((l) => (
          <li key={l.cle} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-svv-ink)' }}>{l.nom}</span>
            {l.detection?.statut === 'mise_a_jour' && (
              <span style={{ color: 'var(--color-svv-muted)', fontVariantNumeric: 'tabular-nums' }}>
                édition disponible : {l.detection.editionDistante}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barre de proportion (div plein, pas de lib de graphes) — décorative, aria-hidden ; le % chiffré est lu à côté. */
function BarreProportion({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: 'var(--color-svv-line)', overflow: 'hidden' }}>
      <div style={{ width: `${p}%`, height: '100%', background: 'var(--color-svv-red)' }} />
    </div>
  );
}

/** Une carte de poste : nom, poids + %, barre, détail données/index/lignes, et sous-lignes (vive vs copies) le cas échéant. */
function CartePoste({ poste }: { poste: PosteMorphologie }) {
  return (
    <div className="svv-card" style={{ padding: '.7rem .85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontSize: 13 }}>{poste.nom}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          <strong>{formaterOctets(poste.total)}</strong>
          <span style={{ color: 'var(--color-svv-muted)' }}> · {formaterPct(poste.pct)}</span>
        </span>
      </div>
      <div style={{ margin: '6px 0' }}><BarreProportion pct={poste.pct} /></div>
      <div style={{ fontSize: 11.5, color: 'var(--color-svv-muted)', fontVariantNumeric: 'tabular-nums' }}>
        données {formaterOctets(poste.donnees)} · index {formaterOctets(poste.index)} · {poste.lignes.toLocaleString('fr-FR')} lignes
        {poste.residuel !== undefined && poste.residuel > 0 ? ` · dont ${formaterOctets(poste.residuel)} de catalogues système` : ''}
      </div>
      {poste.sousLignes && poste.sousLignes.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 3 }}>
          {poste.sousLignes.map((s) => (
            <li key={s.nom} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--color-svv-ink)' }}>
              <span style={{ color: 'var(--color-svv-muted)' }}>↳ {s.nom}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formaterOctets(s.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Section MORPHOLOGIE (F4) — répartition de l'espace disque par source. Un poste par source (trié par poids), une barre de
 * proportion, le détail données/index/lignes, et pour BD TOPO bâtiment la distinction donnée vive / copies. AFFICHAGE PUR :
 * aucune suppression, aucune commande. Mesure en échec → sentinelle « indisponible » (jamais des zéros).
 */
export function SectionMorphologie({ morphologie }: { morphologie: MorphologieDisque }) {
  if (morphologie.indisponible) {
    return (
      <div className="svv-card" style={{ padding: '16px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color: 'var(--color-svv-red)', fontSize: 13 }}>Mesure disque indisponible</div>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-svv-muted)' }}>
          La répartition n’a pas pu être lue (voir les journaux serveur). Ce n’est pas une base vide.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
        <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)' }}>Total base</span>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formaterOctets(morphologie.totalBase ?? 0)}</strong>
      </div>
      {!morphologie.reconcilie && (
        <p role="note" style={{ margin: 0, fontSize: 11.5, color: 'var(--color-svv-red)', fontWeight: 600 }}>
          ⚠ Écart de réconciliation détecté — la somme des postes ne retombe pas exactement sur la taille de la base.
        </p>
      )}
      {morphologie.postes.map((p) => (
        <CartePoste key={p.cle} poste={p} />
      ))}
    </div>
  );
}

/** Corps d'une section de protocole : prose (paragraphes) + blocs de commande copiables (BoutonCopier réutilisé). */
function CorpsProtocole({ section }: { section: SectionProtocole }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
      {section.elements.map((el, i) =>
        el.type === 'prose' ? (
          <p key={i} style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--color-svv-ink)', whiteSpace: 'pre-wrap' }}>
            {el.texte}
          </p>
        ) : (
          <div key={i}>
            <pre style={{
              margin: '0 0 6px', padding: '.6rem .7rem', overflowX: 'auto', fontSize: 12.5, lineHeight: 1.5,
              background: 'var(--color-svv-field)', border: '1px solid var(--color-svv-line)', borderRadius: 8,
              whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>{el.commande}</pre>
            <BoutonCopier valeur={el.commande} libelle="Copier la commande" />
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Section PROTOCOLES (F5) — mode d'emploi de réingestion par source, lu depuis docs/PROTOCOLES_REINGESTION.md et affiché en
 * blocs dépliables avec bouton de copie sur chaque commande. L'écran n'EXÉCUTE RIEN. Deux sentinelles DISTINCTES : fichier
 * absent (global) vs section manquante (par source), jamais confondues avec un protocole vide. Une source sans procedure
 * (cas c) n'a aucun bloc copiable — sa prose dit « aucune procédure connue » et le motif.
 */
export function SectionProtocoles({ protocoles }: { protocoles: AffichageProtocoles }) {
  if (protocoles.fichierAbsent) {
    return (
      <div className="svv-card" style={{ padding: '16px', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, color: 'var(--color-svv-red)', fontSize: 13 }}>Protocoles non documentés</div>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-svv-muted)' }}>
          Le fichier docs/PROTOCOLES_REINGESTION.md est absent ou illisible (voir les journaux serveur).
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {protocoles.intro && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--color-svv-muted)', whiteSpace: 'pre-wrap' }}>
          {protocoles.intro}
        </p>
      )}
      {protocoles.sections.map((s) =>
        s.present ? (
          <details key={s.cle} className="svv-card" style={{ padding: '.7rem .85rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-svv-ink)', fontSize: 13 }}>{s.titre}</summary>
            <CorpsProtocole section={s} />
          </details>
        ) : (
          <div key={s.cle} className="svv-card" style={{ padding: '.7rem .85rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontSize: 13 }}>{s.nom}</div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-svv-red)', fontWeight: 600 }}>
              Protocole non documenté pour cette source.
            </p>
          </div>
        ),
      )}
    </div>
  );
}
