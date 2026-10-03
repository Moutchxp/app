import { describe, it, expect, vi } from 'vitest';
import { deposerPieces, messageEtatGoogle, resumerDepot, type DepsDepot, type IssuePiece } from './depotDrive';
import type { DepotDrive } from './driveRepo';

const AUTEUR = { id: 7, libelle: 'Arnaud Jorel' };

function deps(o: {
  pieces?: Record<number, {
    nomFichier: string; typeMime: string | null; cleStockage: string;
    stockageVide?: boolean; driveFileId?: string | null;
  } | null>;
  existants?: Record<string, DepotDrive>;
  depot?: DepsDepot['deposer'];
  memoriser?: DepsDepot['memoriser'];
  infos?: { nom: string; driveId: string | null } | null;
  /** 🔴 LES OCTETS ONT DISPARU du stockage local — c'est ce que le vidage laisse derrière lui. */
  octetsAbsents?: boolean;
  copier?: DepsDepot['copierDepuisDrive'];
} = {}): DepsDepot & { deposes: string[]; memorises: number[]; copies: string[] } {
  const deposes: string[] = [];
  const memorises: number[] = [];
  const copies: string[] = [];
  return {
    get deposes() { return deposes; },
    get memorises() { return memorises; },
    get copies() { return copies; },
    lirePiece: async (id) => {
      const p = (o.pieces ?? {})[id];
      if (p === undefined) return { pieceId: id, nomFichier: `piece-${id}.pdf`, typeMime: 'application/pdf', cleStockage: `k${id}` };
      return p === null ? null : { pieceId: id, ...p };
    },
    copierDepuisDrive: o.copier ?? (async (_j, x) => {
      copies.push(x.driveFileId);
      return { ok: true, valeur: { id: `C${x.driveFileId}`, nom: x.nom, webViewLink: `https://drive/copie/${x.nom}` } };
    }),
    octets: async () => {
      if (o.octetsAbsents === true) throw new Error('The specified key does not exist.');
      return new Uint8Array([1, 2, 3]);
    },
    depotExistant: async (pieceId, dossierId) => (o.existants ?? {})[`${pieceId}:${dossierId}`] ?? null,
    deposer: o.depot ?? (async (_j, x) => { deposes.push(x.nom); return { ok: true, valeur: { id: `F${x.nom}`, nom: x.nom, webViewLink: `https://drive/${x.nom}` } }; }),
    memoriser: o.memoriser ?? (async (d) => { memorises.push(d.pieceId); return { etat: 'enregistre' }; }),
    infosDossier: async () => (o.infos === undefined ? { nom: 'Dupont', driveId: 'DRV' } : o.infos),
  };
}

const etats = (i: IssuePiece[]): string[] => i.map((x) => x.etat);

describe('déposer des pièces', () => {
  it('une pièce part, et le lien Drive revient', async () => {
    const d = deps();
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
    expect(i[0].etat === 'depose' && i[0].lien).toBe('https://drive/piece-1.pdf');
    expect(d.memorises).toEqual([1]);
  });

  it('le nom du dossier est mémorisé AVEC le dépôt — pour survivre à un renommage dans le Drive', async () => {
    const vus: unknown[] = [];
    const d = deps({ memoriser: async (x) => { vus.push(x); return { etat: 'enregistre' }; } });
    await deposerPieces(d, 'j', [1], 'DOS', AUTEUR);
    expect(vus[0]).toMatchObject({ dossierNom: 'Dupont', driveId: 'DRV', auteurLibelle: 'Arnaud Jorel' });
  });

  /**
   * 🔴 LE DOUBLON N'EST PAS UNE ERREUR. Le Drive d'un propriétaire n'a pas besoin de deux exemplaires du même bail :
   * on rend « déjà là » AVEC le lien vers le fichier existant, et on ne téléverse rien.
   */
  it('une pièce déjà dans CE dossier n’est pas renvoyée — et le lien existant est proposé', async () => {
    const d = deps({
      existants: { '1:DOS': { pieceId: 1, driveFileId: 'F', dossierId: 'DOS', dossierNom: 'Dupont', webViewLink: 'https://drive/deja', deposeLe: '', deposePar: 'x' } },
    });
    const i = await deposerPieces(d, 'j', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['deja']);
    expect(i[0].etat === 'deja' && i[0].lien).toBe('https://drive/deja');
    expect(d.deposes).toEqual([]); // rien n'a été téléversé
  });

  it('la même pièce dans un AUTRE dossier reste possible', async () => {
    const d = deps({
      existants: { '1:AUTRE': { pieceId: 1, driveFileId: 'F', dossierId: 'AUTRE', dossierNom: null, webViewLink: null, deposeLe: '', deposePar: 'x' } },
    });
    expect(etats(await deposerPieces(d, 'j', [1], 'DOS', AUTEUR))).toEqual(['depose']);
  });

  /** Deux clics simultanés : la base tranche, et le second apprend que le fichier est là — pas qu'il a échoué. */
  it('un refus de la base (index unique) devient « déjà là », jamais un échec', async () => {
    const d = deps({ memoriser: async () => ({ etat: 'doublon' }) });
    expect(etats(await deposerPieces(d, 'j', [1], 'DOS', AUTEUR))).toEqual(['deja']);
  });

  /**
   * 🔴 LE RÉSULTAT EST PIÈCE PAR PIÈCE. Un « OK » global mentirait dès qu'une pièce échoue, et un « échec » global
   * ferait recommencer les dépôts déjà réussis.
   */
  it('une pièce en échec n’emporte pas les autres', async () => {
    let n = 0;
    const d = deps({
      depot: async (_j, x) => {
        n += 1;
        return n === 2 ? { ok: false, motif: 'Google a refusé' } : { ok: true, valeur: { id: 'F', nom: x.nom, webViewLink: null } };
      },
    });
    const i = await deposerPieces(d, 'j', [1, 2, 3], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose', 'echec', 'depose']);
    expect(i[1].etat === 'echec' && i[1].motif).toBe('Google a refusé');
  });

  it('une pièce non conservée par l’application le DIT, sans faire échouer la série', async () => {
    const d = deps({ pieces: { 2: null } });
    const i = await deposerPieces(d, 'j', [1, 2], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose', 'echec']);
    expect(i[1].etat === 'echec' && i[1].motif).toContain('pas conservée');
  });

  it('une exception pendant la lecture du stockage devient un échec de CETTE pièce', async () => {
    const d = deps();
    d.octets = async () => { throw new Error('stockage muet'); };
    const i = await deposerPieces(d, 'j', [1, 2], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['echec', 'echec']);
    expect(i[0].etat === 'echec' && i[0].motif).toContain('stockage muet');
  });

  /**
   * ══ 🔴 LOT DRIVE-UNIQUE — LE CAS QU'ON A VRAIMENT RENCONTRÉ, ET QUI N'EST PAS UNE PANNE ═══════════════════════
   *
   * En rangeant une vraie pièce le 29/09/2026, l'écran a affiché « The specified key does not exist. » — le message
   * du stockage objet, en anglais, qui n'apprend rien sinon que quelque chose est cassé.
   *
   * 🔴 OR CE N'EST PAS CASSÉ : c'est la trace du VIDAGE du stockage local. Les octets d'une pièce sont libérés une
   * fois sa copie Drive prouvée — donc une pièce dont les octets manquent est, presque toujours, une pièce qui est
   * DÉJÀ dans le Drive. Le dire envoie la chercher ; le message d'origine envoie ouvrir un ticket.
   */
  it('🔴 des octets absents du stockage se disent en français, et renvoient au Drive', async () => {
    const d = deps();
    d.octets = async () => { throw new Error('The specified key does not exist.'); };
    const i = await deposerPieces(d, 'j', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['echec']);
    const motif = i[0].etat === 'echec' ? i[0].motif : '';
    expect(motif).toContain('ne sont plus dans le stockage local');
    expect(motif).toContain('Drive');
    // ⚠️ ET PAS UN MOT D'ANGLAIS : c'est tout l'objet de la traduction.
    expect(motif).not.toContain('key');
  });

  /** ⚠️ LES AUTRES PANNES GARDENT LEUR MESSAGE BRUT : le traduire au jugé inventerait un diagnostic. */
  it('une panne qu’on ne sait pas nommer garde son message, tel quel', async () => {
    const d = deps();
    d.octets = async () => { throw new Error('connexion réinitialisée par le pair'); };
    const i = await deposerPieces(d, 'j', [1], 'DOS', AUTEUR);
    expect(i[0].etat === 'echec' && i[0].motif).toBe('connexion réinitialisée par le pair');
  });

  it('un nom de dossier illisible n’empêche pas de déposer', async () => {
    const d = deps({ infos: null });
    expect(etats(await deposerPieces(d, 'j', [1], 'DOS', AUTEUR))).toEqual(['depose']);
  });

  it('le jeton et le nom du dossier ne sont demandés qu’UNE fois pour toute la série', async () => {
    const infos = vi.fn(async () => ({ nom: 'D', driveId: null }));
    const d = deps();
    d.infosDossier = infos;
    await deposerPieces(d, 'j', [1, 2, 3], 'DOS', AUTEUR);
    expect(infos).toHaveBeenCalledTimes(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 UNE PIÈCE VIDÉE SE RANGE QUAND MÊME — elle se COPIE depuis sa copie Drive
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 une pièce dont les octets locaux ont été libérés', () => {
  /**
   * 🔴 LE CAS, ET IL EST ORDINAIRE. Les octets d'une pièce sont libérés du stockage local une fois sa copie Drive
   * PROUVÉE (même taille, même md5) — c'est tout le propos du vidage. La ranger ailleurs échouait alors, avec le
   * message du stockage objet en anglais : « The specified key does not exist. »
   *
   * 🔴 CE N'EST PAS UNE PANNE : le fichier existe, il est dans le Drive, et Google sait le copier d'un dossier à
   * l'autre sans qu'aucun octet repasse par nous (`files.copy`). Échouer là était un refus de faire ce qui est
   * parfaitement possible — et le dire en anglais envoyait ouvrir un ticket.
   *
   * ⚠️ LA COPIE LUE EST CELLE QUE NOUS AVONS FAITE (`origine = 'copie'`, cf. `lirePieceAServir`), jamais un dépôt
   * manuel : rien ne garantit qu'un dépôt manuel soit encore là, et il peut vivre dans « Documents clients
   * scannés », auquel ce lot ne touche sous aucune forme.
   */
  it('🔴 elle se copie depuis le Drive, sans repasser par nos octets', async () => {
    const d = deps({
      pieces: { 1: { nomFichier: 'bail.pdf', typeMime: 'application/pdf', cleStockage: 'k1', stockageVide: true, driveFileId: 'DF1' } },
    });
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
    expect(d.copies).toEqual(['DF1']);
    expect(d.deposes).toEqual([]);          // aucun téléversement : rien n'est remonté d'ici
    expect(d.memorises).toEqual([1]);       // et le dépôt est mémorisé comme n'importe quel autre
  });

  /** 🔴 ET MÊME QUAND LE STOCKAGE MENT : la colonne dit « plein », les octets ne sont plus là. On copie quand même. */
  it('🔴 les octets manquent alors qu’on les croyait là : on copie, on n’échoue pas', async () => {
    const d = deps({
      octetsAbsents: true,
      pieces: { 1: { nomFichier: 'bail.pdf', typeMime: 'application/pdf', cleStockage: 'k1', driveFileId: 'DF1' } },
    });
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
    expect(d.copies).toEqual(['DF1']);
  });

  /**
   * ⚠️ SANS COPIE DRIVE CONNUE, on ne peut rien copier — et l'on retombe sur le message en français, qui dit ce
   * qu'on sait et envoie chercher dans le Drive. Jamais « The specified key does not exist ».
   */
  it('sans copie Drive connue, le motif est en français et dit quoi faire', async () => {
    const d = deps({
      octetsAbsents: true,
      pieces: { 1: { nomFichier: 'bail.pdf', typeMime: 'application/pdf', cleStockage: 'k1', driveFileId: null } },
    });
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['echec']);
    const motif = i[0].etat === 'echec' ? i[0].motif : '';
    expect(motif).toContain('stockage local');
    expect(motif).not.toContain('specified key');
  });

  /** ⚠️ ET SI LA COPIE DRIVE ÉCHOUE (fichier supprimé du Drive entre-temps), on le dit — sans inventer un succès. */
  it('une copie Drive refusée est un échec dit en clair', async () => {
    const d = deps({
      pieces: { 1: { nomFichier: 'bail.pdf', typeMime: 'application/pdf', cleStockage: 'k1', stockageVide: true, driveFileId: 'DF1' } },
      copier: async () => ({ ok: false, motif: 'Ce fichier n’existe plus dans le Drive.' }),
    });
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['echec']);
    expect(i[0].etat === 'echec' && i[0].motif).toContain('n’existe plus dans le Drive');
    expect(d.memorises).toEqual([]);
  });
});

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LA COPIE DRIVE→DRIVE DEVIENT LA VOIE ORDINAIRE ══════════════════════
 *
 * Demande d'Arno : « quand la pièce existe déjà dans notre copie “00 Arrivée des mails”, fais une copie
 * Drive → Drive (files.copy) au lieu d'un nouvel envoi ».
 *
 * MESURÉ le 30/09/2026 sur le vrai Drive, vérifications comprises : nos octets 3 593 ms → 2 699 ms après les
 * optimisations ; la copie Drive → Drive, 2 254 ms. Et surtout : AUCUN octet ne transite.
 */
describe('🔴🔴 la copie Drive → Drive, voie ordinaire', () => {
  const avecCopie = (driveFileId = 'ARRIVEE1') => ({
    pieces: {
      1: { nomFichier: 'piece-1.pdf', typeMime: 'application/pdf', cleStockage: 'k1', driveFileId },
    },
  });

  it('🔴 une pièce qui a DÉJÀ une copie Drive est copiée, pas renvoyée', async () => {
    const d = deps(avecCopie());
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
    expect(d.copies).toEqual(['ARRIVEE1']);
    // ⚠️ AUCUN TÉLÉVERSEMENT : c'est tout l'intérêt — pas un octet ne repasse par nous.
    expect(d.deposes).toEqual([]);
    expect(i[0].etat === 'depose' && i[0].voie).toBe('copie_drive');
  });

  /** 🔴 LE NOM CHOISI AU STYLO PART AVEC LA COPIE : sinon la même pièce se rangerait sous deux noms selon la voie. */
  it('🔴 la copie naît sous le nom d’usage, pas sous celui d’origine', async () => {
    const vus: { nom: string }[] = [];
    const d = deps({
      ...avecCopie(),
      copier: async (_j, x) => {
        vus.push({ nom: x.nom });
        return { ok: true, valeur: { id: 'C1', nom: x.nom, webViewLink: null } };
      },
    });
    await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR, new Map([[1, 'Recommandé M Ahmed KHARRAT.pdf']]));
    expect(vus).toEqual([{ nom: 'Recommandé M Ahmed KHARRAT.pdf' }]);
  });

  /**
   * 🔴🔴 SI LA COPIE RAPIDE ÉCHOUE, ON RETOMBE SUR NOS OCTETS. Le fichier d'origine a pu être mis à la corbeille
   * dans le Drive, ou les droits avoir changé : la voie rapide n'a pas le droit de faire échouer un dépôt que la
   * voie lente aurait réussi. Un dépôt qui échoue est un document perdu de vue.
   */
  it('🔴🔴 une copie refusée par Google n’emporte pas le dépôt : les octets prennent le relais', async () => {
    const d = deps({
      ...avecCopie(),
      copier: async () => ({ ok: false, motif: 'Google ne trouve plus l’élément visé.' }),
    });
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
    expect(d.deposes).toEqual(['piece-1.pdf']);
    expect(i[0].etat === 'depose' && i[0].voie).toBe('octets');
  });

  /**
   * ⚠️ MAIS SI LES OCTETS ONT ÉTÉ LIBÉRÉS, il n'y a pas de relais — et l'échec se dit avec le motif de la copie,
   * pas avec « The specified key does not exist » du stockage objet.
   */
  it('⚠️ octets libérés ET copie refusée : un échec, dit en français', async () => {
    const d = deps({
      pieces: {
        1: {
          nomFichier: 'piece-1.pdf', typeMime: 'application/pdf', cleStockage: 'k1',
          driveFileId: 'ARRIVEE1', stockageVide: true,
        },
      },
      octetsAbsents: true,
      copier: async () => ({ ok: false, motif: 'Google ne trouve plus l’élément visé.' }),
    });
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['echec']);
    expect(i[0].etat === 'echec' && i[0].motif).toContain('Google');
  });

  it('⚠️ sans copie Drive connue, rien ne change : on passe par les octets', async () => {
    const d = deps();
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(d.copies).toEqual([]);
    expect(d.deposes).toEqual(['piece-1.pdf']);
    expect(i[0].etat === 'depose' && i[0].voie).toBe('octets');
  });

  /** 🔴 L'ÉCRAN A BESOIN DE L'IDENTIFIANT pour remplacer sa ligne provisoire par la vraie, sans tout redemander. */
  it('🔴 l’identifiant du fichier créé revient avec le verdict', async () => {
    const i = await deposerPieces(deps(avecCopie()), 'jeton', [1], 'DOS', AUTEUR);
    expect(i[0].etat === 'depose' && i[0].driveFileId).toBe('CARRIVEE1');
  });
});

describe('le compte rendu', () => {
  const issue = (etat: IssuePiece['etat'], id: number): IssuePiece => {
    if (etat === 'echec') return { pieceId: id, nomFichier: 'x', etat, motif: 'm' };
    if (etat === 'deja') return { pieceId: id, nomFichier: 'x', etat, lien: null, driveFileId: null };
    return { pieceId: id, nomFichier: 'x', etat, lien: null, driveFileId: `D${id}`, voie: 'octets' };
  };

  it('dit les trois cas avec des MOTS, jamais « 3/5 »', () => {
    const t = resumerDepot([issue('depose', 1), issue('depose', 2), issue('deja', 3), issue('echec', 4)]);
    expect(t).toContain('2 pièces déposées');
    expect(t).toContain('1 déjà dans ce dossier');
    expect(t).toContain('1 en échec');
  });
  it('le singulier est respecté', () => {
    expect(resumerDepot([issue('depose', 1)])).toContain('1 pièce déposée');
  });
  it('rien à dire se dit quand même', () => {
    expect(resumerDepot([])).toContain('Aucune pièce');
  });
});

describe('ce que l’écran dit quand Google manque', () => {
  /** « Jamais connecté » et « expiré » ne se réparent pas pareil : un message unique enverrait au mauvais endroit. */
  it('non connecté renvoie aux réglages', () => {
    expect(messageEtatGoogle({ etat: 'non_connecte', motif: 'x' })).toBe('Drive non connecté — voir réglages');
  });
  it('expiré demande de REFAIRE l’autorisation', () => {
    expect(messageEtatGoogle({ etat: 'expire', motif: 'x' })).toContain('refaire l’autorisation');
  });
  it('connecté ne dit rien', () => {
    expect(messageEtatGoogle({ etat: 'ok', jeton: 'j' })).toBe('');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RENOMMER-AVANT-RANGER — LA COPIE PART SOUS LE NOM CHOISI, L'ORIGINE NE BOUGE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le nom sous lequel la copie part', () => {
  /**
   * 🔴🔴 LA GARANTIE CENTRALE DU LOT, ÉPROUVÉE LÀ OÙ LE FICHIER PART VRAIMENT. Tout le reste — le stylo, le
   * champ, la carte — n'est qu'un affichage si ce nom-ci n'atteint pas le téléversement.
   */
  it('🔴 la copie est téléversée sous le nom donné', async () => {
    const d = deps();
    const i = await deposerPieces(d, 'j', [1], 'DOS', AUTEUR, new Map([[1, 'Quittance septembre 2026.pdf']]));
    expect(d.deposes).toEqual(['Quittance septembre 2026.pdf']);
    // ⚠️ ET L'ISSUE REND CE NOM-LÀ : c'est lui qu'on retrouvera dans le Drive, donc lui que l'écran doit annoncer.
    expect(i[0].nomFichier).toBe('Quittance septembre 2026.pdf');
  });

  /**
   * 🔴🔴 LA PIÈCE D'ORIGINE N'EST JAMAIS RENOMMÉE. `lirePiece` est la seule lecture de la pièce reçue, et rien
   * dans ce module ne l'écrit : le nom reçu reste le nom reçu, dans le mail comme dans notre base.
   */
  it('🔴 rien n’écrit sur la pièce reçue : seul le nom de la COPIE change', async () => {
    const lues: number[] = [];
    const d = { ...deps(), lirePiece: async (id: number) => { lues.push(id); return { pieceId: id, nomFichier: '0836_001.pdf', typeMime: 'application/pdf', cleStockage: 'k1' }; } };
    const i = await deposerPieces(d as never, 'j', [1], 'DOS', AUTEUR, new Map([[1, 'Bail.pdf']]));
    expect(lues).toEqual([1]);
    expect(i[0].etat).toBe('depose');
    // La seule écriture du module est le DÉPÔT (dans le Drive) et sa MÉMORISATION (dans notre journal).
    expect(Object.keys(d)).not.toContain('renommerPiece');
  });

  /** 🔴 LE JOURNAL GARDE LES DEUX NOMS : le reçu vit dans `gestion_piece`, le donné arrive ici. */
  it('🔴 le journal reçoit le nom donné — et seulement s’il diffère', async () => {
    const vus: { pieceId: number; nomDepose?: string | null }[] = [];
    const d = deps({ memoriser: async (x) => { vus.push(x); return { etat: 'enregistre' }; } });
    await deposerPieces(d, 'j', [1, 2], 'DOS', AUTEUR, new Map([[1, 'Bail.pdf']]));
    expect(vus[0]).toMatchObject({ pieceId: 1, nomDepose: 'Bail.pdf' });
    // ⚠️ La pièce 2 n'a pas été renommée : rien n'est écrit, et « personne n'a renommé » se lit dans l'absence.
    expect(vus[1]).toMatchObject({ pieceId: 2, nomDepose: null });
  });

  /**
   * 🔴 LA COPIE DE DRIVE À DRIVE SUIT LA MÊME RÈGLE. C'est la voie d'une pièce dont les octets locaux ont été
   * libérés : elle ne passe pas par `deposer`, et l'oublier aurait déposé sous l'ancien nom une fois sur deux,
   * selon que le vidage était passé ou non — le pire genre de défaut, invisible et intermittent.
   */
  it('🔴 la voie « copie depuis le Drive » emporte aussi le nom donné', async () => {
    const noms: string[] = [];
    const d = deps({
      pieces: { 1: { nomFichier: '0836_001.pdf', typeMime: 'application/pdf', cleStockage: 'k1', stockageVide: true, driveFileId: 'SRC' } },
      copier: async (_j, x) => { noms.push(x.nom); return { ok: true, valeur: { id: 'C1', nom: x.nom, webViewLink: 'https://drive/c1' } }; },
    });
    await deposerPieces(d, 'j', [1], 'DOS', AUTEUR, new Map([[1, 'Bail signé.pdf']]));
    expect(noms).toEqual(['Bail signé.pdf']);
  });

  /** ⚠️ SANS RENOMMAGE, LE COMPORTEMENT EST CELUI D'AVANT CE LOT, mot pour mot. */
  it('sans carte de noms, la pièce part sous son nom d’origine', async () => {
    const d = deps();
    await deposerPieces(d, 'j', [1], 'DOS', AUTEUR);
    expect(d.deposes).toEqual(['piece-1.pdf']);
    const d2 = deps();
    await deposerPieces(d2, 'j', [1], 'DOS', AUTEUR, new Map([[1, '  ']]));
    expect(d2.deposes).toEqual(['piece-1.pdf']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LA COPIE ENTRE AU REGISTRE *ET* DANS L'INDEX, TOUT DE SUITE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (03/10/2026) : « à chaque dépôt réussi (glisser, “Déposer ici”, copie d'une vignette dupliquée),
   enregistrer IMMÉDIATEMENT la copie (fileId, md5, parents, nom) au registre et dans l'index ».

   🔴 CE QU'ON ATTENDAIT AVANT : l'agent `launchd` qui tient l'index à jour par `changes.list`. MESURÉ sur le cas
   d'Arno (pièce 27085, « test gigout.pdf ») : dépôt confirmé à 21:37:35, entrée dans `gestion_drive_empreinte` à
   21:50:12 — 12 min 37 s pendant lesquelles le document était dans le Drive et l'application ne savait pas le
   reconnaître par son contenu.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’index des empreintes, alimenté par le dépôt', () => {
  const META = {
    md5: '7b2364ff4527e7a55365f506f98bf888', parentId: 'DOS', tailleOctets: 4096,
    typeMime: 'application/pdf', modifieLe: '2026-10-03T19:37:35.000Z', driveId: 'DRV',
  };
  /** Un dépôt qui rapporte ses métadonnées, comme `deposerFichier` et `files.copy` le font depuis ce lot. */
  const avecMeta = (): DepsDepot['deposer'] =>
    async (_j, x) => ({ ok: true, valeur: { id: 'F1', nom: x.nom, webViewLink: 'https://drive/F1', ...META } });

  it('🔴🔴 l’empreinte part au REGISTRE', async () => {
    const vus: unknown[] = [];
    const d = deps({ depot: avecMeta(), memoriser: async (x) => { vus.push(x); return { etat: 'enregistre' }; } });
    await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(vus[0]).toMatchObject({ pieceId: 1, driveFileId: 'F1', md5: META.md5 });
  });

  it('🔴🔴 et la copie entre dans l’INDEX, avec son parent réel et son nom', async () => {
    const indexes: unknown[] = [];
    const d = { ...deps({ depot: avecMeta() }), noterAuIndex: async (l: unknown) => { indexes.push(l); } };
    await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toEqual({
      driveFileId: 'F1', md5: META.md5, nom: 'piece-1.pdf', parentId: 'DOS', driveId: 'DRV',
      typeMime: 'application/pdf', tailleOctets: 4096, modifieLe: META.modifieLe,
    });
  });

  /**
   * 🔴 LE PARENT VIENT DE GOOGLE, et `dossierId` n'est qu'un REPLI. Les deux coïncident normalement — mais
   * inventer un parent ferait tracer un chemin faux dans l'index, et un chemin faux envoie chercher un document
   * là où il n'est pas.
   */
  it('🔴 sans parent rendu par Google, le dossier visé sert de repli', async () => {
    const indexes: { parentId: string | null }[] = [];
    const d = {
      ...deps({ depot: async (_j, x) => ({ ok: true, valeur: { id: 'F1', nom: x.nom, webViewLink: null } }) }),
      noterAuIndex: async (l: { parentId: string | null }) => { indexes.push(l); },
    };
    await deposerPieces(d, 'jeton', [1], 'CIBLE', AUTEUR);
    expect(indexes[0].parentId).toBe('CIBLE');
  });

  /**
   * 🔴🔴 AU MIEUX-EFFORT : UN INDEX EN ÉCHEC NE FAIT PAS RATER LE DÉPÔT. Le fichier EST dans le Drive — dire le
   * dépôt raté parce qu'on n'a pas su rafraîchir un reflet enverrait le déposer une seconde fois. Même règle que
   * `consignerNomDuDepot` et que le journal de `memoriserDepot`.
   */
  it('🔴🔴 un index en échec ne change RIEN au verdict du dépôt', async () => {
    const d = {
      ...deps({ depot: avecMeta() }),
      noterAuIndex: async () => { throw new Error('base indisponible'); },
    };
    const i = await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
  });

  /** ⚠️ UN APPELANT SANS `noterAuIndex` (doublure, ou code d'avant ce lot) se comporte exactement comme avant. */
  it('⚠️ `noterAuIndex` absent : comportement d’avant ce lot', async () => {
    const i = await deposerPieces(deps({ depot: avecMeta() }), 'jeton', [1], 'DOS', AUTEUR);
    expect(etats(i)).toEqual(['depose']);
  });

  /**
   * ⚠️ ET LA VOIE `files.copy` RAPPORTE AUSSI SON EMPREINTE. C'est la voie ORDINAIRE depuis le lot
   * RANGER-INSTANTANE-ET-NOM : la laisser muette aurait fait entrer la même pièce au registre avec son empreinte
   * par un chemin et sans elle par l'autre.
   */
  it('⚠️ la copie Drive → Drive indexe aussi', async () => {
    const indexes: { md5: string | null }[] = [];
    const d = {
      ...deps({
        pieces: { 1: { nomFichier: 'a.pdf', typeMime: null, cleStockage: 'k1', stockageVide: true, driveFileId: 'SRC' } },
        copier: async (_j, x) => ({
          ok: true, valeur: { id: 'C1', nom: x.nom, webViewLink: null, md5: META.md5, parentId: x.dossierId },
        }),
      }),
      noterAuIndex: async (l: { md5: string | null }) => { indexes.push(l); },
    };
    await deposerPieces(d, 'jeton', [1], 'DOS', AUTEUR);
    expect(indexes[0]?.md5).toBe(META.md5);
  });
});
