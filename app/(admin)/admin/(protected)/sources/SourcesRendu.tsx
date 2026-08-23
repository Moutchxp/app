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
import type { EtatAutomatisation, StatutSourceAuto } from '../../../../lib/veille/ingestionAuto';
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

/** Date de vérification « le AAAA-MM-JJ », ou chaîne vide si inconnue. */
const leJour = (iso: string | null): string => (iso ? ` le ${iso.slice(0, 10)}` : '');

/** Texte d'état de détection (source SONDÉE ou Sitadel) — jamais « oui/non » ambigu. Un échec dit son échec, jamais « à jour ». */
function texteEtatDetection(d: EtatDetection | undefined): { texte: string; couleur: string } {
  const ink = 'var(--color-svv-ink)', muted = 'var(--color-svv-muted)', red = 'var(--color-svv-red)', green = 'var(--color-svv-green-ink)';
  if (!d || d.statut === 'jamais_verifie') return { texte: 'jamais encore vérifiée', couleur: muted };
  if (d.statut === 'a_jour') return { texte: `vérifiée${leJour(d.verifieLe)}, à jour`, couleur: green };
  if (d.statut === 'mise_a_jour') return { texte: `vérifiée${leJour(d.verifieLe)}, mise à jour disponible (${d.editionDistante})`, couleur: red };
  if (d.statut === 'echec') return { texte: `vérification en échec${d.depuisJours !== null ? ` depuis ${d.depuisJours} j` : ''}`, couleur: red };
  return { texte: '—', couleur: ink }; // 'desactive' est traité en amont (pas de case cochée)
}

/**
 * Colonne UNIQUE « Surveillance » (G1) — fusionne l'ancienne case « surveiller » et l'ancienne colonne oui/non, une seule vérité.
 * Trois régimes : (1) NON surveillable (LiDAR/BDNB) → phrase-motif, aucune case ; (2) surveillance NATIVE (Sitadel) → « par son
 * propre mécanisme de veille, sans interrupteur » + état ; (3) SONDÉE (les 5 sources à détection) → case + état en toutes lettres.
 * Le contrôle ne s'affiche QUE là où il fonctionne (pas de case sur Sitadel, que basculerDetectionSource rejette).
 */
function CelluleSurveillance({ ligne, onToggle }: { ligne: LigneSource; onToggle?: (source: string, actif: boolean) => void }) {
  const d = ligne.detection;

  // (1) Non surveillable : l'IGN/BDNB ne permettent pas de comparer → phrase-motif, aucune case.
  if (!ligne.detectable) {
    return (
      <span style={{ color: 'var(--color-svv-muted)', fontSize: 12 }}>
        <strong style={{ color: 'var(--color-svv-ink)', fontWeight: 600 }}>Non surveillable</strong> — {ligne.motifNonDetectable}
      </span>
    );
  }

  // (2) Surveillance NATIVE (Sitadel) : pas d'interrupteur (basculerDetectionSource la rejette), on décrit son mécanisme propre.
  if (ligne.surveillance) {
    const e = texteEtatDetection(d);
    return (
      <span style={{ fontSize: 12, color: 'var(--color-svv-ink)' }}>
        <strong style={{ fontWeight: 600 }}>Surveillée par son propre mécanisme de veille</strong>, sans interrupteur à régler
        {d && d.statut !== 'jamais_verifie' ? <> — <span style={{ color: e.couleur }}>{e.texte}</span></> : null}
      </span>
    );
  }

  // (3) Source SONDÉE : la case porte l'intention (activer/désactiver la détection), l'état est écrit en toutes lettres.
  const cochee = d?.statut !== 'desactive';
  const e = texteEtatDetection(d);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', minHeight: 24 }}>
        <input type="checkbox" checked={cochee} onChange={(ev) => onToggle?.(ligne.cle, ev.target.checked)} aria-label={`Surveiller ${ligne.nom}`} />
        Surveiller
      </label>
      {cochee
        ? <span style={{ color: e.couleur }}>Surveillée — {e.texte}</span>
        : <span style={{ color: 'var(--color-svv-muted)' }}>Non surveillée</span>}
    </span>
  );
}

/** Le tableau : une ligne par source, dans l'ordre du modèle (LiDAR en tête). Défile dans son conteneur sur mobile. */
export function TableauSources({ lignes, onToggle }: { lignes: LigneSource[]; onToggle?: (source: string, actif: boolean) => void }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-svv-line)', borderRadius: 12 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
        <thead>
          <tr>
            <th style={enTete}>Source</th>
            <th style={enTete}>Ce qu’elle sert</th>
            <th style={enTete}>Millésime en base</th>
            <th style={enTete}>Âge</th>
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
              <td style={{ ...cellule, minWidth: 220 }}><CelluleSurveillance ligne={l} onToggle={onToggle} /></td>
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

/**
 * Ligne DÉPLIABLE (G1) — `<details>` natif : vrai contrôle au clavier, état ouvert/fermé annoncé par le navigateur, aucune lib.
 * FERMÉE par défaut. Le résumé porte le titre à gauche et le CHIFFRE DE SYNTHÈSE à droite : le titre se tronque sur écran étroit,
 * le chiffre reste intact (ne casse jamais la ligne). Le `<details>` natif ne s'anime pas → prefers-reduced-motion respecté.
 */
export function LigneDepliable({ titre, synthese, children }: { titre: string; synthese: ReactNode; children?: ReactNode }) {
  return (
    <details className="svv-card svv-depliable" style={{ padding: 0 }}>
      <summary style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '.7rem .85rem', cursor: 'pointer', minHeight: 44, boxSizing: 'border-box' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
          <span className="svv-depliable-chevron" aria-hidden="true" style={{ color: 'var(--color-svv-muted)', fontSize: 11 }}>▸</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-svv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</span>
        </span>
        <span style={{ flexShrink: 0, fontSize: 12.5, color: 'var(--color-svv-muted)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{synthese}</span>
      </summary>
      <div style={{ padding: '0 .85rem .85rem' }}>{children}</div>
    </details>
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

/** Texte d'état d'une source automatisable (F6) : en attente cette nuit, dernier résultat, activée sans rien à faire, ou éteinte. */
function texteStatutAuto(s: StatutSourceAuto, fenetre: { debut: number; fin: number }): { texte: string; couleur: string } {
  const ink = 'var(--color-svv-ink)', muted = 'var(--color-svv-muted)', red = 'var(--color-svv-red)', green = 'var(--color-svv-green-ink)';
  if (s.enAttenteCetteNuit) {
    return { texte: `En attente — la mise à jour se fera cette nuit, entre ${fenetre.debut}h et ${fenetre.fin}h.`, couleur: ink };
  }
  if (s.dernier) {
    const mot = s.dernier.resultat === 'succes' ? 'réussie' : s.dernier.resultat === 'refus' ? 'refusée (disque insuffisant)' : 'échouée';
    const quand = s.dernier.finiLe ? ` le ${s.dernier.finiLe.slice(0, 10)}` : '';
    return { texte: `Dernière tentative : ${mot}${quand}.`, couleur: s.dernier.resultat === 'succes' ? green : red };
  }
  return s.actif
    ? { texte: 'Activée — rien à mettre à jour pour l’instant.', couleur: muted }
    : { texte: 'Désactivée.', couleur: muted };
}

/** Une source dans la section automatisation : interrupteur (cas a) ou « manuelle uniquement » + raison (cas b/c). */
function LigneAutomatisation({ s, fenetre, onToggleAuto }: {
  s: StatutSourceAuto; fenetre: { debut: number; fin: number }; onToggleAuto?: (source: string, actif: boolean) => void;
}) {
  const st = s.automatisable ? texteStatutAuto(s, fenetre) : null;
  return (
    <div className="svv-card" style={{ padding: '.7rem .85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-svv-ink)' }}>{s.nom}</span>
        {s.automatisable ? (
          <label style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', minHeight: 28 }}>
            <input type="checkbox" checked={s.actif} onChange={(e) => onToggleAuto?.(s.cle, e.target.checked)} aria-label={`Automatiser la mise à jour de ${s.nom} la nuit`} />
            Automatiser (nuit)
          </label>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>mise à jour manuelle uniquement — {s.raisonManuelle}</span>
        )}
      </div>
      {st && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: st.couleur }}>{st.texte}</p>}
    </div>
  );
}

/**
 * Section AUTOMATISATION NOCTURNE (F6) — fenêtre nocturne éditable + interrupteur par source AUTOMATISABLE (cas a). Les sources
 * (b)/(c) affichent « mise à jour manuelle uniquement » + la raison. L'écran POSE des réglages ; il n'EXÉCUTE RIEN (l'ingestion
 * part la nuit, dans la veille). Défauts : tout désactivé.
 */
export function SectionAutomatisation({ automatisation, onToggleAuto, onFenetre }: {
  automatisation: EtatAutomatisation;
  onToggleAuto?: (source: string, actif: boolean) => void;
  onFenetre?: (debut: number, fin: number) => void;
}) {
  const { fenetre, sources } = automatisation;
  const heures = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="svv-card" style={{ padding: '.7rem .85rem' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-svv-ink)' }}>Fenêtre nocturne</div>
        <p style={{ margin: '2px 0 8px', fontSize: 12, color: 'var(--color-svv-muted)' }}>
          Les mises à jour automatiques ne partent qu’entre ces heures. Hors fenêtre, elles attendent la nuit ; une nuit manquée est reportée à la suivante (jamais de rattrapage en journée).
        </p>
        <label style={{ fontSize: 12.5, marginRight: 10 }}>
          de{' '}
          <select value={fenetre.debut} onChange={(e) => onFenetre?.(Number(e.target.value), fenetre.fin)} aria-label="Heure de début de la fenêtre nocturne" style={{ minHeight: 32 }}>
            {heures.map((h) => <option key={h} value={h}>{h}h</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12.5 }}>
          à{' '}
          <select value={fenetre.fin} onChange={(e) => onFenetre?.(fenetre.debut, Number(e.target.value))} aria-label="Heure de fin de la fenêtre nocturne" style={{ minHeight: 32 }}>
            {heures.map((h) => <option key={h} value={h}>{h}h</option>)}
          </select>
        </label>
      </div>
      {sources.map((s) => (
        <LigneAutomatisation key={s.cle} s={s} fenetre={fenetre} onToggleAuto={onToggleAuto} />
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
