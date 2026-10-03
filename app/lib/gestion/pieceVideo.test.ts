import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { estVideo, MESSAGE_VIDEO_ILLISIBLE, sortePiece } from './pieces';
import { sorteApercu, typeServi } from './apercuDrive';
import { genererMiniature, MOTIF_MINIATURE_NAVIGATEUR, DEPOT_MAX_OCTETS } from './miniature';
import { echecDefinitif, peutAvoirMiniature } from './miniatureCompletion';
import { CONFIG_GESTION_DEFAUT } from './config';
import { extensionGestion } from '../stockage';

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS, POINT 2 — LES VIDÉOS EN PIÈCE JOINTE ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026), fil 36593 / message 57422 : « VIDEO-2026-09-30-20-46-39.mp4 », 8,2 Mo, affichée en
 * tuile grise « MP4 » — sans image, sans lecture, sans rien.
 *
 * 🔴 CE QUE LA BASE DIT, relevé avant d'écrire une ligne : 117 vidéos, 1,1 Go — 80 `.mp4` (`video/mp4`, 783 Mo) et
 * 37 `.mov` (`video/quicktime`, 337 Mo). Aucun autre format.
 *
 * 🔴 ET CE QUE LA MACHINE DIT : `which ffmpeg` → INTROUVABLE. La miniature est donc extraite PAR LE NAVIGATEUR
 * (`<video>` + `canvas`), puis déposée et conservée comme les autres — c'est la seconde voie offerte par Arno, et
 * la seule qui n'exige aucune installation.
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① les cinq formats d'Arno sont reconnus, par le type MIME ET par l'extension ;
 *   ② le SERVEUR ne décode jamais une vidéo — et ne condamne jamais sa vignette ;
 *   ③ la visionneuse ouvre un vrai lecteur, et la route sert les tranches (`Range`) pour les vidéos SEULES ;
 *   ④ un format illisible donne le message d'Arno ET un bouton de téléchargement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LES CINQ FORMATS D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① une vidéo est reconnue comme telle', () => {
  it('🔴🔴 mp4, mov, webm, m4v, 3gp — par le type MIME', () => {
    for (const t of ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp']) {
      expect(sortePiece(t, 'x'), t).toBe('video');
      expect(estVideo(t, 'x'), t).toBe(true);
    }
  });

  /**
   * 🔴 ET PAR L'EXTENSION QUAND LE MAIL N'ANNONCE RIEN. `application/octet-stream` est fréquent dans du vrai
   * courrier : c'est la même règle que les images et les PDF, appliquée aux vidéos.
   */
  it('🔴 …et par l’extension quand le type est absent ou générique', () => {
    for (const n of ['a.mp4', 'a.MOV', 'a.webm', 'a.m4v', 'a.3gp']) {
      expect(sortePiece('application/octet-stream', n), n).toBe('video');
      expect(sortePiece(null, n), n).toBe('video');
    }
  });

  /** ⚠️ LA LISTE EST FERMÉE : un format absent garde son icône, et aucun octet n'est ouvert pour lui. */
  it('⚠️ un format hors liste reste « autre »', () => {
    for (const t of ['video/x-msvideo', 'video/x-matroska', 'application/zip', 'text/html']) {
      expect(sortePiece(t, 'x.bin'), t).toBe('autre');
    }
    expect(sortePiece('application/octet-stream', 'a.avi')).toBe('autre');
  });

  /**
   * 🔴🔴 LA VISIONNEUSE ET LES TUILES DISENT LA MÊME CHOSE, et c'est ce qui compte le plus ici : un fichier
   * annoncé « vidéo » par une tuile et refusé par la visionneuse serait un œil qui n'ouvre rien.
   */
  it('🔴🔴 `sortePiece` et `sorteApercu` s’accordent sur les mêmes types', () => {
    for (const t of ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2']) {
      expect(sortePiece(t, 'x'), t).toBe('video');
      expect(sorteApercu(t), t).toBe('video');
    }
  });

  /** 🔴 LE TYPE SERVI EST CELUI DU FICHIER : c'est lui qui dit au navigateur quel décodeur ouvrir. */
  it('🔴 une vidéo est servie sous son propre type', () => {
    expect(typeServi('video/mp4')).toBe('video/mp4');
    expect(typeServi('video/quicktime')).toBe('video/quicktime');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ①bis 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — LA RELÈVE GARDE AUSSI LES `.mov`
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ①bis la relève garde les .mov (accord d’Arno du 03/10/2026)', () => {
  /**
   * 🔴 CE QUE LA BASE DISAIT CE JOUR-LÀ : 37 pièces `.mov` (337 Mo) REFUSÉES, motif « type non autorisé pour la
   * gestion : “video/quicktime” ». Aucune n'avait d'octets, nulle part. Un `.mp4` passait, le même film filmé
   * par un iPhone en `.mov` était perdu.
   *
   * ⚠️ LA LISTE QUI COMMANDE EST CELLE DE `gestion_config` (pilotage sans code) : celle-ci n'est que le REPLI,
   * employé quand la base ne répond pas. Les deux doivent dire la même chose, sans quoi un redémarrage sans base
   * se remettrait à refuser ce qu'Arno vient d'autoriser.
   */
  it('🔴🔴 `video/quicktime` est dans la liste de repli', () => {
    expect(CONFIG_GESTION_DEFAUT.typesPiecesAcceptes).toContain('video/quicktime');
    expect(CONFIG_GESTION_DEFAUT.typesPiecesAcceptes).toContain('video/mp4');
  });

  /** 🔴 ET IL EST DÉPOSÉ SOUS SON EXTENSION : sans cette ligne, le fichier s'appellerait `.bin` sur le stockage. */
  it('🔴 un .mov est déposé en « mov », pas en « bin »', () => {
    expect(extensionGestion('video/quicktime')).toBe('mov');
    expect(extensionGestion('video/mp4')).toBe('mp4');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE SERVEUR NE DÉCODE PAS DE VIDÉO — ET NE CONDAMNE PAS SA VIGNETTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② le serveur n’essaie jamais de décoder une vidéo', () => {
  /**
   * 🔴 `sharp` NE SAIT PAS OUVRIR UN CONTENEUR MP4, et l'extraction d'une image demande un décodeur vidéo que la
   * machine n'a pas. Sans cette garde, chaque affichage aurait tiré 8 Mo du stockage pour échouer.
   */
  it('🔴🔴 `genererMiniature` rend le motif « navigateur », sans rien ouvrir', async () => {
    const issue = await genererMiniature(Buffer.from('ftypisom-pas-une-vraie-video'), 'video/mp4', 'a.mp4');
    expect(issue.ok).toBe(false);
    expect(issue.ok === false && issue.motif).toBe(MOTIF_MINIATURE_NAVIGATEUR);
  });

  /**
   * 🔴🔴 ET CE MOTIF N'EST PAS UN ÉCHEC DÉFINITIF. S'il l'était, la pièce serait inscrite « echec » et la route
   * ne la retenterait JAMAIS — y compris après le dépôt du navigateur. C'est le piège central de ce point.
   */
  it('🔴🔴 le motif « navigateur » ne condamne pas la vignette', () => {
    expect(echecDefinitif(MOTIF_MINIATURE_NAVIGATEUR)).toBe(false);
  });

  /** 🔴 ET LA PASSE DE RATTRAPAGE NE VA PAS CHERCHER LES VIDÉOS : ce serait tirer des centaines de Mo pour rien. */
  it('🔴 la complétion rétroactive ignore les vidéos', () => {
    expect(peutAvoirMiniature('video/mp4', 'a.mp4')).toBe(false);
    expect(peutAvoirMiniature('video/quicktime', 'a.mov')).toBe(false);
    // …et rien d'autre n'a changé :
    expect(peutAvoirMiniature('application/pdf', 'a.pdf')).toBe(true);
    expect(peutAvoirMiniature('image/jpeg', 'a.jpg')).toBe(true);
    expect(peutAvoirMiniature('application/zip', 'a.zip')).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LA ROUTE : LE DÉPÔT GARDÉ, ET LES TRANCHES POUR LES VIDÉOS SEULES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ ce que les routes font', () => {
  const miniature = readFileSync('app/(admin)/api/admin/gestion/pieces/[id]/miniature/route.ts', 'utf8');
  const piece = readFileSync('app/(admin)/api/admin/gestion/pieces/[id]/route.ts', 'utf8');

  /**
   * 🔴🔴 LES CINQ GARDES DU DÉPÔT, et chacune ferme une porte :
   *   ① le droit `gestion` ; ② la pièce DOIT être une vidéo ; ③ on ne remplace jamais une vignette existante ;
   *   ④ les octets sont RÉENCODÉS par nous ; ⑤ la taille est bornée avant lecture.
   */
  it('🔴🔴 le dépôt d’une vignette est gardé de cinq façons', () => {
    expect(miniature).toContain('export async function POST');
    expect(miniature).toContain("exigerCompteActif(request, 'gestion')");
    expect(miniature).toContain('if (!estVideo(etat.typeMime, etat.nomFichier))');
    expect(miniature).toContain("if (etat.etat === 'ok' && etat.cleMiniature !== null)");
    expect(miniature).toContain('miniatureDepuisImageDeposee(recu)');
    expect(miniature).toContain('DEPOT_MAX_OCTETS');
  });

  /** ⚠️ ET LA BORNE EST SÉRIEUSE : une vignette pèse quelques dizaines de Ko ; deux Mo ferment la porte au reste. */
  it('⚠️ la borne du dépôt est écrite une seule fois', () => {
    expect(DEPOT_MAX_OCTETS).toBe(2 * 1024 * 1024);
  });

  /** 🔴🔴 UNE VIDÉO N'EST JAMAIS INSCRITE « echec » par la route de lecture : sa vignette est encore à venir. */
  it('🔴🔴 la route ne mémorise pas l’échec d’une vidéo', () => {
    expect(miniature).toContain('if (issue.motif !== MOTIF_MINIATURE_NAVIGATEUR) await memoriserEchecMiniature');
  });

  /**
   * 🔴🔴 `Accept-Ranges` POUR LES VIDÉOS, ET POUR ELLES SEULES.
   *
   * ⚠️ LA DÉCISION DU 30/09/2026 TIENT : l'annoncer à PDF.js ne gagne rien (mesuré : deux requêtes sans tranche,
   * avec ou sans l'en-tête) et pourrait coûter cher — ici chaque tranche paie une lecture COMPLÈTE du stockage.
   * On ne l'élargit donc qu'au seul cas qui en a besoin, et qui ne marche pas sans : la barre de temps d'une
   * vidéo exige de pouvoir demander l'octet correspondant.
   */
  it('🔴🔴 les tranches sont annoncées aux vidéos, et à rien d’autre', () => {
    expect(piece).toContain("...(estVideo(piece.typeMime, piece.nomFichier) ? { 'Accept-Ranges': 'bytes' } : {})");
    /* 🔴 ET LE 206 EXISTAIT DÉJÀ : ce lot n'a pas réécrit la découpe, il l'a seulement annoncée. */
    expect(piece).toContain('status: 206');
    expect(piece).toContain("'Content-Range': `bytes ${tranche.debut}-${tranche.fin}/${octets.byteLength}`");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 CE QUE L'ÉCRAN FAIT D'UNE VIDÉO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ la visionneuse et les tuiles', () => {
  const apercu = readFileSync('app/(admin)/admin/(protected)/gestion/ApercuFichierDrive.tsx', 'utf8');
  const extraction = readFileSync('app/(admin)/admin/(protected)/gestion/miniatureVideoNavigateur.ts', 'utf8');

  /** 🔴 LES CINQ COMMANDES D'ARNO viennent de `controls` : lecture, pause, barre de temps, son, plein écran. */
  it('🔴🔴 un lecteur vidéo, avec ses commandes, sur la source du téléchargement', () => {
    expect(apercu).toContain('<video key={vu.id} className="apd-video" controls playsInline preload="metadata"');
    expect(apercu).toContain("src={adresseApercu(vu.id, 'octets', source)}");
  });

  /**
   * 🔴🔴 FORMAT NON LISIBLE → LE MESSAGE D'ARNO **ET** LE BOUTON. Les deux vont ensemble : un message qui
   * constate sans proposer laisse devant un cul-de-sac.
   */
  it('🔴🔴 format illisible : le message, et le téléchargement', () => {
    expect(MESSAGE_VIDEO_ILLISIBLE).toBe('Ce format ne se lit pas dans le navigateur');
    expect(apercu).toContain('{MESSAGE_VIDEO_ILLISIBLE}');
    expect(apercu).toContain('Télécharger la vidéo');
    expect(apercu).toContain('onError={() => setIllisible(true)}');
    /* ⚠️ ET LE VERDICT REPART À ZÉRO d'un document à l'autre : un `.mov` refusé ne condamne pas le `.mp4` suivant. */
    expect(apercu).toContain('setIllisible(false);');
  });

  /** 🔴 « VERS 1 S » (Arno), et le milieu pour une vidéo plus courte : la première image est souvent noire. */
  it('🔴🔴 l’image est prise vers 1 seconde', () => {
    expect(extraction).toContain('export const INSTANT_MINIATURE_S = 1;');
    expect(extraction).toContain('video.currentTime = duree > INSTANT_MINIATURE_S ? INSTANT_MINIATURE_S : duree / 2;');
  });

  /** 🔴 UNE SEULE EXTRACTION À LA FOIS, et une seule tentative par pièce : six vidéos ne font pas ramer la page. */
  it('🔴 les extractions se font à la queue leu leu, une fois par pièce', () => {
    expect(extraction).toContain('let queue: Promise<unknown> = Promise.resolve();');
    expect(extraction).toContain('const dejaTentees = new Set<number>();');
    expect(extraction).toContain('dejaTentees.add(o.pieceId);');
  });

  /**
   * 🔴🔴 « VAUT PARTOUT OÙ IL Y A DES MINIATURES » (Arno) : les TROIS écrans emploient le MÊME crochet. Trois
   * implémentations auraient fini par se comporter de trois façons.
   */
  it('🔴🔴 les trois écrans à miniatures passent par le même crochet', () => {
    for (const f of ['PiecesJointes.tsx', 'PiecesDeLaConversation.tsx', 'PiecesBrouillon.tsx']) {
      const src = readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');
      expect(src, f).toContain('useMiniatureVideo({');
    }
  });

  /** 🔒 ET CE MODULE N'ÉCRIT QU'À UN ENDROIT : la vignette de CETTE pièce. */
  it('🔒 l’extraction n’écrit que la vignette, et rien d’autre', () => {
    const code = extraction.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    expect(code).toContain("method: 'POST'");
    expect((code.match(/fetch\(/g) ?? [])).toHaveLength(1);
    for (const interdit of ['DELETE', 'PATCH', '/rattachements', '/suivi']) {
      expect(code, interdit).not.toContain(interdit);
    }
  });
});
