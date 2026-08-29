import type { CSSProperties } from 'react';
import { cadreDeAnneaux, type Boite, type PointLambert } from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite, PolygoneBdTopo } from '../../../../lib/permis/empriseReconstruiteRepo';
import type { EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import { SchemaParcelleTrace, LegendeSchemaProjection, ListeEmprises, attribuerReperes, FILTRES_SCHEMA_DEFAUT } from './TraceEmpriseRendu';
import type { EtatStatutPolygone } from '../../../../lib/permis/polygoneStatut';
import { nomAffichageCorps } from '../../../../lib/permis/nomCorps'; // NOM-1 — le SEUL décideur du nom d'affichage d'un corps

/**
 * PROJ-4a — RÉCAP (LECTURE SEULE) de l'emprise projetée, affiché dans le détail du Suivi Rattachement pour un permis « en attente de
 * bâti » (issu de la projection). Rôle : rendre de nouveau VISIBLE l'emprise qu'Arno a tracée/adoptée/retouchée, superposée à la
 * parcelle et au bâti BD TOPO existant, pendant l'intervalle où l'on attend que BD TOPO livre le bâtiment.
 *
 * 🔴 AFFICHAGE PUR. Aucune écriture, aucun couplage moteur : l'emprise reste une RECONSTITUTION (ou une donnée IGN), jamais une
 * mesure — elle n'alimente ni le verdict, ni une altitude, ni un certificat. On RÉUTILISE les briques de l'écran de projection
 * (`SchemaParcelleTrace`, `LegendeSchemaProjection`, `ListeEmprises`) : mêmes conventions visuelles, même légende, rien à réapprendre.
 */

// Dimensions de la BOÎTE SVG (viewport d'affichage) — repris À L'IDENTIQUE de `BlocTraceEmprise` (écran de projection) pour un rendu
//   cohérent. Ce sont des tailles de dessin, PAS des variables métier/scoring (rien à externaliser en config).
const BOITE = { largeur: 300, hauteur: 230, marge: 12 };

const muted: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.4 };
const titreBat: CSSProperties = { fontSize: 12, fontWeight: 600, marginTop: '.2rem' };

export interface RecapProjectionProps {
  etat: EtatSuivi;                                            // GATE : seul « en_attente_bati » affiche ce récap (cf. ci-dessous)
  emprises: EmpriseReconstruite[];                            // emprises reconstituées / adoptées du dossier (avec provenance + multi-parties)
  parcelle: PointLambert[][];                                 // empreinte parcellaire (Lambert-93), pour caler le schéma
  polygones: PolygoneBdTopo[];                                // bâti BD TOPO (∩ empreinte) — existant + futur « en projet »
  batiments: { corpsId: number; repere: string | null; nomRepli?: string | null }[]; // bâtiments déclarés au permis (+ nom de repli NOM-1)
  statuts?: Map<string, EtatStatutPolygone>;                  // RATT-3 — statut décidé par cleabs : colore l'existant (préservé/détruit) sur le schéma
}

/**
 * Récap de projection. Trois issues :
 *  · état ≠ « en attente de bâti » → rien (ce récap ne concerne QUE les permis passés en suivi par la projection) ;
 *  · aucune emprise → on le DIT explicitement (jamais un schéma vide) : pas passé par la projection, ou rien tracé ;
 *  · emprises présentes → schéma 3 couches (parcelle · bâti BD TOPO · emprise projetée) + légende + provenance par bâtiment.
 */
export function RecapProjectionRattachement({ etat, emprises, parcelle, polygones, batiments, statuts }: RecapProjectionProps) {
  if (etat !== 'en_attente_bati') return null;

  if (emprises.length === 0) {
    return (
      <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Projection des emprises</div>
        <p style={{ ...muted, margin: 0 }}>
          Ce permis est en attente de bâti, mais aucune emprise projetée n’a été enregistrée — il n’est pas passé par l’étape
          « Projection », ou aucune emprise n’y a été tracée. Rien à afficher ici pour l’instant.
        </p>
      </div>
    );
  }

  const cadre = cadreDeAnneaux(parcelle);
  const boite: Boite | null = cadre ? { largeur: BOITE.largeur, hauteur: BOITE.hauteur, marge: BOITE.marge, cadre } : null;
  const polygonesReperes = attribuerReperes(polygones);

  // Groupement des emprises PAR BÂTIMENT (vocabulaire « bâtiment », jamais « corps »). Un bâtiment peut en porter plusieurs (PROJ-3q).
  const parBatiment = batiments
    .map((b) => ({ b, emp: emprises.filter((e) => e.corpsId === b.corpsId) }))
    .filter((x) => x.emp.length > 0);
  // Emprises antérieures au rattachement par bâtiment (corpsId null) ou dont le bâtiment n'est plus déclaré : listées à part, jamais perdues.
  const orphelines = emprises.filter((e) => e.corpsId === null || !batiments.some((b) => b.corpsId === e.corpsId));

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>
        Projection des emprises{' '}
        <span style={muted}>(reconstitution ou donnée IGN — jamais une mesure ; n’alimente ni le verdict ni l’altitude)</span>
      </div>
      <p style={{ ...muted, margin: 0 }}>
        Ce que l’on attend de BD TOPO : l’emprise au sol des futurs bâtiments, superposée à la parcelle et au bâti existant.
      </p>
      <SchemaParcelleTrace boite={boite} parcelle={parcelle} emprises={emprises} polygones={polygonesReperes} filtres={FILTRES_SCHEMA_DEFAUT} calageLambert={[]} statuts={statuts} />
      <LegendeSchemaProjection />
      {parBatiment.map(({ b, emp }) => {
        const nom = nomAffichageCorps({ repere: b.repere, nomRepli: b.nomRepli, corpsId: b.corpsId }); // NOM-1
        return (
        <div key={b.corpsId}>
          <div style={titreBat}>{nom}</div>
          <ListeEmprises emprises={emp} nomCorps={nom} />
        </div>
      );})}
      {orphelines.length > 0 && (
        <div>
          <div style={titreBat}>Emprises non rattachées à un bâtiment</div>
          <ListeEmprises emprises={orphelines} />
        </div>
      )}
    </div>
  );
}
