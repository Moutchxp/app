import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BOUTON_ANNULER_CORBEILLE, BOUTON_CONFIRMER_CORBEILLE, MENTION_RECUPERABLE, motCorbeilleFaite,
  motProchaineRestauration, peutMettreCorbeille, phraseCorbeille,
} from './driveCorbeille';
import { DOSSIER_INTERDIT_LECTURE, indexerMaillons, type Maillon } from './driveLectureFichier';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA RÈGLE DE « SUPPRIMER », ÉPROUVÉE SANS RÉSEAU ══════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE LOT LÈVE UN INTERDIT, ET C'EST POUR CELA QUE CE FICHIER EXISTE AVANT LE CODE QUI ÉCRIT.
 *
 * L'application s'interdisait de supprimer quoi que ce soit du Drive. Arno lève l'interdit pour la seule MISE À LA
 * CORBEILLE, qui se défait. Tout ce qui borne cette levée est éprouvé ici, exhaustivement et sans Google :
 *
 *   ① un DOSSIER est refusé, toujours, sans aucune exception ;
 *   ② rien de ce qui est sous « Documents clients scannés » n'y touche, à aucune profondeur ;
 *   ③ ni l'archive elle-même, ni aucun de ses ancêtres ;
 *   ④ une chaîne qu'on n'a pas su lire vaut INTERDIT ;
 *   ⑤ la phrase de confirmation est celle qu'Arno dicte, au mot près.
 *
 * 🔴 ET LE FICHIER QUI ÉCRIT EST FOUILLÉ, LIGNE À LIGNE, au bas de ce test : aucun `DELETE`, aucun `emptyTrash`,
 * aucun `name`, aucun `parents`, aucun `permissions`. C'est la frontière qui sépare un geste réversible d'une
 * destruction, et elle ne tient pas à une intention : elle tient à ce que le code contient.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une arborescence minuscule, mais complète : racine → dossiers → fichiers. */
const m = (id: string, nom: string, parentId: string | null): Maillon => ({ id, nom, parentId });

const ARCHIVE = 'id-archive';
const DRIVE = 'id-drive';           // « GESTION LOCATIVE », ancêtre de l'archive
const BIENS = 'id-biens';           // un dossier ordinaire, frère de l'archive

const MAILLONS: Maillon[] = [
  m(DRIVE, 'GESTION LOCATIVE', null),
  m(ARCHIVE, DOSSIER_INTERDIT_LECTURE, DRIVE),
  m('id-sous-archive', 'Clients 2019', ARCHIVE),
  m('id-avis', 'avis-imposition.pdf', 'id-sous-archive'),
  m(BIENS, 'Biens', DRIVE),
  m('id-bien-1', '12 rue des Lilas', BIENS),
  m('id-bail', 'bail.pdf', 'id-bien-1'),
];

const CTX = {
  index: indexerMaillons(MAILLONS),
  proteges: new Set([ARCHIVE]),
  protegesEtAncetres: new Set([ARCHIVE, DRIVE]),
};

describe('🔴🔴 le verdict d’une mise à la corbeille', () => {
  it('un fichier ordinaire passe', () => {
    expect(peutMettreCorbeille({ cibleId: 'id-bail', estDossier: false }, CTX)).toEqual({ ok: true });
  });

  /**
   * 🔴🔴 ① UN DOSSIER, JAMAIS. Arno : « sur une ligne de FICHIER uniquement. Jamais sur un dossier. »
   * Un dossier emporte ce qu'on ne voit pas : trente documents peuvent partir sur un clic destiné à un seul.
   */
  it('🔴🔴 un DOSSIER est refusé, même parfaitement ordinaire', () => {
    const v = peutMettreCorbeille({ cibleId: 'id-bien-1', estDossier: true }, CTX);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motif).toContain('DOSSIER');
  });

  /** 🔴🔴 ② RIEN SOUS L'ARCHIVE — et on vérifie les DEUX profondeurs, pas seulement l'enfant direct. */
  it('🔴🔴 un fichier sous « Documents clients scannés » est refusé, à toute profondeur', () => {
    const v = peutMettreCorbeille({ cibleId: 'id-avis', estDossier: false }, CTX);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motif).toContain(DOSSIER_INTERDIT_LECTURE);
  });

  /** 🔴🔴 ③ NI L'ARCHIVE, NI SES ANCÊTRES — l'interdit qu'on oublie, et le plus coûteux. */
  it('🔴🔴 l’archive elle-même et ses ancêtres sont refusés', () => {
    for (const id of [ARCHIVE, DRIVE]) {
      const v = peutMettreCorbeille({ cibleId: id, estDossier: false }, CTX);
      expect(v.ok).toBe(false);
      expect(v.ok === false && v.motif).toContain('archive');
    }
  });

  /**
   * 🔴 ④ NE PAS SAVOIR VAUT INTERDIT. Un fichier dont la chaîne est trouée pourrait être n'importe où — y compris
   * dans l'archive. On refuse, et on DIT que c'est par précaution.
   */
  it('🔴 une chaîne inconnue ou trouée est refusée', () => {
    const inconnu = peutMettreCorbeille({ cibleId: 'id-jamais-vu', estDossier: false }, CTX);
    expect(inconnu.ok).toBe(false);
    expect(inconnu.ok === false && inconnu.motif).toContain('précaution');

    const troue = {
      ...CTX, index: indexerMaillons([m('id-orphelin', 'x.pdf', 'id-parent-absent')]),
    };
    const v = peutMettreCorbeille({ cibleId: 'id-orphelin', estDossier: false }, troue);
    expect(v.ok).toBe(false);
  });

  it('⚠️ un identifiant vide est refusé', () => {
    expect(peutMettreCorbeille({ cibleId: '   ', estDossier: false }, CTX).ok).toBe(false);
  });

  /**
   * 🔴🔴 LE MÊME VERDICT VAUT POUR LA RESTAURATION, et ce n'est pas une symétrie décorative : un régime plus
   * souple au retour ouvrirait une porte de sortie de l'archive — « je l'y mets, je l'en sors ».
   */
  it('🔴🔴 la restauration obéit au MÊME verdict', () => {
    expect(peutMettreCorbeille({ cibleId: 'id-avis', estDossier: false, sorte: 'restaurer' }, CTX).ok).toBe(false);
    expect(peutMettreCorbeille({ cibleId: 'id-bail', estDossier: false, sorte: 'restaurer' }, CTX).ok).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA CONFIRMATION — AU MOT PRÈS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la confirmation', () => {
  /** Arno la dicte ; on la vérifie telle quelle, parce que c'est le dernier endroit où l'on peut dire non. */
  it('🔴🔴 elle dit le nom, le chemin, et qu’on peut récupérer', () => {
    expect(phraseCorbeille('0851_001.pdf', 'Test / _MESURE dossier instantane'))
      .toBe('Mettre à la corbeille du Drive : 0851_001.pdf — dans Test / _MESURE dossier instantane ? '
        + 'Récupérable 30 jours depuis la corbeille du Drive.');
  });

  it('⚠️ un nom ou un chemin vide ne produit jamais une phrase trouée', () => {
    expect(phraseCorbeille('  ', '  ')).toContain('ce fichier');
    expect(phraseCorbeille('  ', '  ')).toContain('ce dossier');
    expect(phraseCorbeille('  ', '  ')).toContain(MENTION_RECUPERABLE);
  });

  it('les deux boutons sont ceux d’Arno', () => {
    expect(BOUTON_ANNULER_CORBEILLE).toBe('Annuler');
    expect(BOUTON_CONFIRMER_CORBEILLE).toBe('Mettre à la corbeille');
  });

  /**
   * 🔴 LE BANDEAU DIT « RÉCUPÉRABLE », PAS « SUPPRIMÉ ». Le mot « supprimé » ferait renoncer à chercher le
   * document — exactement l'erreur que la réversibilité doit éviter.
   */
  it('🔴 le compte rendu annonce la récupération, jamais une suppression', () => {
    expect(motCorbeilleFaite(1)).toBe('1 fichier mis à la corbeille du Drive. ' + MENTION_RECUPERABLE);
    expect(motCorbeilleFaite(3)).toContain('3 fichiers mis');
    expect(motCorbeilleFaite(1).toLowerCase()).not.toContain('supprim');
    expect(motProchaineRestauration('bail.pdf', 1)).toContain('« bail.pdf »');
    expect(motProchaineRestauration('bail.pdf', 4)).toContain('les 4 fichiers');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE GARDE STATIQUE — CE QUE LE FICHIER QUI ÉCRIT A LE DROIT DE CONTENIR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’écriture ne sait faire QUE la corbeille', () => {
  const src = readFileSync('app/lib/gestion/driveCorbeilleReel.ts', 'utf8');
  /** On examine le CODE, pas la prose : l'encadré du fichier explique justement ce qu'il ne fait pas. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');

  /**
   * 🔴🔴 LA FRONTIÈRE ENTRE UN GESTE RÉVERSIBLE ET UNE DESTRUCTION. `files.delete` et `emptyTrash` ne se défont
   * pas : ils restent absents de ce dépôt, et c'est à cette condition qu'Arno a levé l'interdit.
   */
  it('🔴🔴 aucune suppression définitive, nulle part', () => {
    expect(code).not.toContain('DELETE');
    expect(code.toLowerCase()).not.toContain('emptytrash');
    expect(code.toLowerCase()).not.toContain('files.delete');
  });

  /** 🔴 UN SEUL VERBE : `PATCH`. Un `POST` ici créerait quelque chose, un `DELETE` détruirait. */
  it('🔴 un seul verbe HTTP, et c’est PATCH', () => {
    const verbes = [...code.matchAll(/method:\s*'([A-Z]+)'/g)].map((x) => x[1]);
    expect(verbes).toEqual(['PATCH']);
  });

  /**
   * 🔴 LE CORPS NE PORTE QUE `trashed`. Un `name` serait un renommage, un `parents` un déplacement : deux gestes
   * que cette route n'a jamais demandés et dont personne ne verrait passer la trace.
   */
  it('🔴 le corps ne contient que `trashed`', () => {
    expect(code).toContain('JSON.stringify({ trashed: o.versLaCorbeille })');
    expect((code.match(/JSON\.stringify/g) ?? []).length).toBe(1);
    expect(code).not.toContain('name:');
    expect(code).not.toContain('parents:');
    expect(code.toLowerCase()).not.toContain('permissions');
  });

  /** ⚠️ ET IL NE TOUCHE À AUCUNE AUTRE RESSOURCE DE L'API : un seul point d'entrée, `files/{id}`. */
  it('⚠️ une seule adresse appelée', () => {
    const adresses = [...code.matchAll(/API_FICHIERS\}\/\$\{[^}]+\}([^`]*)/g)].map((x) => x[1]);
    expect(adresses).toHaveLength(1);
    expect(adresses[0]).toContain('?${p}');
    expect(adresses[0]).not.toContain('/copy');
  });
});
