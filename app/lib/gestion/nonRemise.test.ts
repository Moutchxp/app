import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  candidatsMessageId, estAvisNonRemise, lireAvis, motifNonRemise, phraseNonRemise, sorteAvis,
  texteHumainAvis,
} from './nonRemise';
import { mentionNonRemise } from './conversation';
import type { MessageDeFil } from './carteRepo';

/**
 * LOT ENVOI-DIAG — LIRE UN AVIS DE NON-REMISE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI EST PROTÉGÉ ICI, ET CHAQUE POINT A UNE CONSÉQUENCE CONNUE :
 *   ① un avis de BONNE remise ne doit jamais devenir une non-remise — sinon on annonce perdu un mail arrivé ;
 *   ② un RETARD (4.x.x) ne doit jamais se dire « non distribué » — sinon on réécrit pour rien au même locataire ;
 *   ③ une RÉPONSE humaine à un avis n'est pas un avis ;
 *   ④ on ne CHOISIT pas le Message-ID de l'original : on ramasse les candidats, la base tranche. Une ligne de
 *      signature DKIM (`h=…:message-id:…`) ne doit pas être prise pour le champ lui-même.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : toutes les adresses sont en `.invalid`. Les FORMES de corps, en revanche, sont celles
 * relevées dans la vraie base le 26/09/2026 (Gmail, Exchange) — un parseur éprouvé sur des textes inventés ne prouve
 * rien sur ceux qui arrivent vraiment.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** La forme Gmail, relevée en base (message 56687). */
const AVIS_GMAIL = `
** Message non distribué **

Un problème est survenu lors de la distribution de votre message à diane@exemple.invalid.

Réponse du serveur distant :
550 5.7.1 Email 4hrQ0J6W2nz rejected per SPAM policy

Reporting-MTA: dns; googlemail.com
Received-From-MTA: dns; gestion@exemple.invalid
Arrival-Date: Thu, 24 Sep 2026 13:09:18 -0700 (PDT)
X-Original-Message-ID: <6W3I0EMBEUU4.I6N9DRGQM2521@win-v9livl9jlsi>

Final-Recipient: rfc822; diane@exemple.invalid
Action: failed
Status: 5.7.1
Remote-MTA: dns; smtp-in.exemple.invalid.
Diagnostic-Code: smtp; 550 5.7.1 Email 4hrQ0J6W2nz rejected per SPAM policy
Last-Attempt-Date: Thu, 24 Sep 2026 13:09:21 -0700 (PDT)
`;

/** La forme Gmail d'un RETARD, relevée en base (message 56797) — boîte du destinataire pleine. */
const AVIS_RETARD = `
** Message non distribué **

Un problème temporaire est survenu lors de la distribution de votre message à rishika@exemple.invalid.

Final-Recipient: rfc822; rishika@exemple.invalid
Action: delayed
Status: 4.2.2
Diagnostic-Code: smtp; 452-4.2.2 The recipient's inbox is out of storage space.
Last-Attempt-Date: Fri, 25 Sep 2026 16:32:19 -0700 (PDT)
Will-Retry-Until: Sun, 27 Sep 2026 12:56:17 -0700 (PDT)
`;

/**
 * La forme Exchange, relevée en base (message 56602). Le piège y est visible : des lignes de signature DKIM citent
 * « message-id » au milieu d'une liste `h=`, AVANT le vrai champ `Message-ID:`.
 */
const AVIS_EXCHANGE = `
Échec de la remise pour ces destinataires ou groupes :

antoine@exemple.invalid
Nous n’avons pas trouvé l’adresse de courrier que vous avez entrée.

Informations de diagnostic pour les administrateurs :
 h=From:Date:Subject:Message-ID:Content-Type:MIME-Version;
        h=content-type:mime-version:to:message-id:subject:date:from;
Message-ID: <DCY5FBEBEUU4.USTVO1VCFZFP3@win-v9livl9jlsi>
X-MS-TrafficTypeDiagnostic: AM1PEPF000C1AD9:EE_

Final-Recipient: rfc822;antoine@exemple.invalid
Action: failed
Status: 5.1.10
Diagnostic-Code: smtp;550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup
`;

describe('reconnaître un avis', () => {
  it('l’expéditeur système et un objet typique suffisent', () => {
    expect(estAvisNonRemise({
      deAdresse: 'mailer-daemon@googlemail.com', objet: 'Delivery Status Notification (Failure)', corps: 'x',
    })).toBe(true);
    expect(estAvisNonRemise({
      deAdresse: 'postmaster@exemple.invalid', objet: 'Non remis : Quittance Octobre', corps: 'x',
    })).toBe(true);
  });

  it('le rapport machine suffit À LUI SEUL, quel que soit l’expéditeur', () => {
    // Certains serveurs d'entreprise envoient l'avis depuis une adresse nominative. Le rapport, lui, ne trompe pas.
    expect(estAvisNonRemise({ deAdresse: 'relais@exemple.invalid', objet: 'Undeliverable', corps: AVIS_EXCHANGE }))
      .toBe(true);
  });

  it('🔴 une RÉPONSE humaine à un avis n’est PAS un avis', () => {
    // Relevé en base : « Re: Delivery Status Notification (Failure) », écrit par un collègue. Le compter ferait
    // apparaître « non distribué » sur une conversation ordinaire entre deux personnes.
    for (const objet of [
      'Re: Delivery Status Notification (Failure)', 'RE : Non remis : Quittance',
      'Fwd: Delivery Status Notification', 'TR: Non remis', 'Rép : Message non distribué',
    ]) {
      expect(estAvisNonRemise({ deAdresse: 'collegue@exemple.invalid', objet, corps: 'Salut,' }), objet).toBe(false);
    }
  });

  it('un mail ordinaire n’est pas un avis', () => {
    expect(estAvisNonRemise({
      deAdresse: 'locataire@exemple.invalid', objet: 'Fuite salle de bain', corps: 'Bonjour, il y a une fuite.',
    })).toBe(false);
    expect(estAvisNonRemise({ deAdresse: null, objet: null, corps: null })).toBe(false);
  });
});

describe('lire le rapport', () => {
  it('la forme Gmail : destinataire, action, code, phrase du serveur', () => {
    const a = lireAvis(AVIS_GMAIL);
    expect(a.destinataire).toBe('diane@exemple.invalid');
    expect(a.action).toBe('failed');
    expect(a.statut).toBe('5.7.1');
    // La phrase du serveur, SANS le préfixe de protocole : c'est elle qui explique, et un administrateur la veut brute.
    expect(a.diagnostic).toBe('550 5.7.1 Email 4hrQ0J6W2nz rejected per SPAM policy');
  });

  it('la forme Exchange : `rfc822;` collé, pas seulement espacé', () => {
    const a = lireAvis(AVIS_EXCHANGE);
    expect(a.destinataire).toBe('antoine@exemple.invalid');
    expect(a.statut).toBe('5.1.10');
  });

  it('un RETARD porte sa date de dernière tentative', () => {
    expect(lireAvis(AVIS_RETARD).reessaiJusqua).toBe('Sun, 27 Sep 2026 12:56:17 -0700 (PDT)');
  });

  it('un corps illisible rend des `null`, et ne jette pas', () => {
    const a = lireAvis('bonjour, ceci n’est pas un rapport');
    expect(a).toEqual({
      destinataire: null, action: null, statut: null, diagnostic: null, candidats: [], reessaiJusqua: null,
    });
    expect(lireAvis(null).destinataire).toBeNull();
  });
});

describe('🔴 les candidats Message-ID — on propose, la base tranche', () => {
  it('`X-Original-Message-ID` vient EN TÊTE : c’est celui que Google pose exprès', () => {
    expect(candidatsMessageId(AVIS_GMAIL)[0]).toBe('<6W3I0EMBEUU4.I6N9DRGQM2521@win-v9livl9jlsi>');
  });

  it('🔴 une liste DKIM `h=…:message-id:…` n’est PAS prise pour le champ', () => {
    const c = candidatsMessageId(AVIS_EXCHANGE);
    expect(c).toEqual(['<DCY5FBEBEUU4.USTVO1VCFZFP3@win-v9livl9jlsi>']);
    // Le piège serait de ramasser un fragment de la liste `h=` : il n'y a pas de chevrons, donc rien à ramasser.
    expect(c.every((x) => x.startsWith('<') && x.endsWith('>'))).toBe(true);
  });

  it('aucun candidat quand l’avis n’en cite aucun — et c’est une réponse valide', () => {
    expect(candidatsMessageId(AVIS_RETARD)).toEqual([]);
  });

  it('pas de doublon : le même identifiant cité deux fois ne compte qu’une', () => {
    const corps = 'X-Original-Message-ID: <a@b>\nMessage-ID: <a@b>\nMessage-ID: <c@d>';
    expect(candidatsMessageId(corps)).toEqual(['<a@b>', '<c@d>']);
  });
});

describe('🔴 permanent, temporaire, ou pas un échec', () => {
  it('5.x.x = définitif ; 4.x.x = le serveur distant réessaie', () => {
    expect(sorteAvis(lireAvis(AVIS_GMAIL))).toBe('permanent');
    expect(sorteAvis(lireAvis(AVIS_EXCHANGE))).toBe('permanent');
    expect(sorteAvis(lireAvis(AVIS_RETARD))).toBe('temporaire');
  });

  it('🔴 un avis de BONNE remise n’est PAS un échec', () => {
    // Certains serveurs en envoient. Le compter afficherait « non distribué » sur un message parfaitement arrivé —
    // l'inverse exact du service rendu par ce lot.
    for (const action of ['delivered', 'relayed', 'expanded']) {
      expect(sorteAvis({
        destinataire: 'x@exemple.invalid', action, statut: '2.0.0', diagnostic: '250 OK',
        candidats: [], reessaiJusqua: null,
      }), action).toBe('aucun');
    }
  });

  it('le CODE l’emporte sur l’action : il est normalisé, elle non', () => {
    // `Action: failed` avec un code 4.x.x arrive : le serveur a abandonné CETTE tentative, pas la remise.
    expect(sorteAvis({
      destinataire: null, action: 'failed', statut: '4.4.1', diagnostic: null, candidats: [], reessaiJusqua: null,
    })).toBe('temporaire');
  });

  it('sans code ni action reconnue, on ne conclut pas à un échec', () => {
    expect(sorteAvis(lireAvis('rien du tout'))).toBe('aucun');
  });
});

describe('le motif, en français', () => {
  const avis = (statut: string, diagnostic: string) => ({
    destinataire: 'x@exemple.invalid', action: 'failed', statut, diagnostic, candidats: [], reessaiJusqua: null,
  });

  it('les causes qu’on rencontre vraiment sont traduites', () => {
    expect(motifNonRemise(lireAvis(AVIS_EXCHANGE))).toContain('n’existe pas');
    expect(motifNonRemise(lireAvis(AVIS_RETARD))).toContain('pleine');
    expect(motifNonRemise(lireAvis(AVIS_GMAIL))).toContain('anti-spam');
    expect(motifNonRemise(avis('4.4.1', 'timed out'))).toContain('ne répond pas');
    expect(motifNonRemise(avis('5.7.26', 'not authorized by DMARC'))).toContain('authentification');
  });

  it('🔴 une cause INCONNUE rend la phrase du serveur TELLE QUELLE', () => {
    // Inventer « erreur de remise » retirerait la seule information exploitable. Un administrateur a besoin du texte.
    expect(motifNonRemise(avis('5.3.4', '552 message too large for this system')))
      .toBe('552 message too large for this system');
  });

  it('et sans diagnostic du tout, on dit le code — jamais rien', () => {
    expect(motifNonRemise(avis('5.9.9', ''))).toContain('5.9.9');
    expect(motifNonRemise(lireAvis('rien'))).toContain('sans en préciser la cause');
  });
});

describe('🔴 la phrase montrée à l’écran', () => {
  it('« non distribué » n’est dit QUE pour un échec définitif', () => {
    expect(phraseNonRemise({ sorte: 'permanent', destinataire: 'x@exemple.invalid', motif: 'adresse inconnue' }))
      .toBe('non distribué à x@exemple.invalid : adresse inconnue');
  });

  it('un RETARD se dit « remise retardée » : le message peut encore arriver', () => {
    const p = phraseNonRemise({ sorte: 'temporaire', destinataire: 'x@exemple.invalid', motif: 'boîte pleine' });
    expect(p).toContain('retardée');
    expect(p).not.toContain('non distribué');
  });

  it('sans destinataire connu, la phrase reste correcte', () => {
    expect(phraseNonRemise({ sorte: 'permanent', destinataire: null, motif: 'refus' })).toBe('non distribué : refus');
  });

  it('rien à dire pour un avis qui n’est pas un échec', () => {
    expect(phraseNonRemise({ sorte: 'aucun', destinataire: 'x@exemple.invalid', motif: 'ok' })).toBe('');
  });
});

describe('ce que le message du fil affiche', () => {
  const msg = (nonRemises: MessageDeFil['nonRemises']): Pick<MessageDeFil, 'nonRemises'> => ({ nonRemises });
  const m = (sorte: 'permanent' | 'temporaire', phrase: string) => ({
    sorte, phrase, destinataire: null, avisMessageId: 1,
  });

  it('rien dans le cas ordinaire — la quasi-totalité des messages', () => {
    expect(mentionNonRemise(msg([]))).toBeNull();
  });

  it('🔴 PLUSIEURS avis se disent TOUS, l’échec définitif d’abord', () => {
    // Un mail à cinq destinataires dont deux échouent rend deux avis. N'en montrer qu'un ferait croire qu'une seule
    // personne n'a pas reçu.
    const v = mentionNonRemise(msg([m('temporaire', 'remise retardée à a@x'), m('permanent', 'non distribué à b@x')]));
    expect(v?.definitif).toBe(true);
    expect(v?.texte).toBe('non distribué à b@x · remise retardée à a@x');
  });

  it('un retard SEUL n’est pas « définitif »', () => {
    expect(mentionNonRemise(msg([m('temporaire', 'remise retardée à a@x')]))?.definitif).toBe(false);
  });
});

/** LA MIGRATION 261, éprouvée par sa FORME. Ce qu'elle TIENT vraiment l'est par `gestion:boite:epreuve`. */
describe('la migration 261', () => {
  const sql = readFileSync('db/migrations/261_gestion_non_remise.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('crée la table des avis', () => {
    expect(code).toContain('CREATE TABLE IF NOT EXISTS gestion_non_remise');
  });

  it('🔴 un avis ne se lit qu’UNE fois : c’est l’idempotence du rattrapage', () => {
    expect(code).toContain('avis_message_id    bigint      NOT NULL UNIQUE');
  });

  it('🔴 le rattachement est NULLABLE : un avis orphelin reste orphelin', () => {
    expect(code).toContain('origine_message_id bigint          NULL');
  });

  it('🔴 « permanent » ou « temporaire », et rien d’autre', () => {
    expect(code).toContain("CHECK (sorte = ANY (ARRAY['permanent', 'temporaire']))");
  });

  it('🔴 un avis ne peut pas se rattacher à lui-même', () => {
    expect(code).toContain('origine_message_id IS DISTINCT FROM avis_message_id');
  });

  it('🔴 ajout seul : ni correction, ni effacement, ni TRUNCATE', () => {
    expect(code).toContain('BEFORE UPDATE OR DELETE ON gestion_non_remise');
    expect(code).toContain('BEFORE TRUNCATE ON gestion_non_remise');
  });

  /**
   * 🔴 LE PIÈGE DES DEUX MIGRATIONS EN ATTENTE. Toutes les migrations précédentes recopiaient la liste entière des
   * entités de journal en dur. Avec 260 et 261 en attente en même temps, la seconde appliquée EFFAÇAIT la valeur
   * ajoutée par la première — et une écriture de journal légitime se mettait à être refusée, le jour où la
   * fonctionnalité sert. Les deux lisent désormais la contrainte en place et y INSÈRENT leur valeur.
   */
  it('🔴 elle AJOUTE son entité de journal au lieu de réécrire la liste', () => {
    expect(code).toContain('pg_get_constraintdef');
    expect(code).toContain("replace(def, 'ARRAY[', 'ARRAY[''non_remise''::text, ')");
    // Aucune liste recopiée en dur : c'est elle qui effaçait la valeur de l'autre migration.
    expect(code).not.toContain("'adresses_messages'");
  });

  it('la migration 260 porte la MÊME correction — sinon le piège reste entier', () => {
    const v = readFileSync('db/migrations/260_gestion_piece_vidage.sql', 'utf8');
    expect(v).toContain("replace(def, 'ARRAY[', 'ARRAY[''vidage_stockage''::text, ')");
    expect(v.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')).not.toContain("'rattachement'");
  });

  it('🔒 ne contient aucune donnée, et s’exécute en UNE transaction', () => {
    expect(code).not.toMatch(/INSERT\s+INTO\s+gestion_non_remise/i);
    expect(code.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('donne les commandes exactes', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/261_gestion_non_remise.sql');
    expect(sql).toContain('npm run gestion:non-remise:rattraper');
  });
});

/** 🔒 CE QUE CE LOT NE FAIT JAMAIS — vérifié sur les sources. */
describe('les garanties du lot', () => {
  const sans = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');

  /**
   * ⚠️ ON LIT LA LISTE DES IMPORTS, PAS LE TEXTE. Chercher le mot « Gmail » dans la source attrape la PHRASE
   * « aucune écriture Gmail » d'un message de commande, et « stockage » attrape le nom de colonne `cle_stockage` :
   * un garde qui crie sur ses propres commentaires finit par être désarmé. Ce qui prouve qu'un module ne parle à
   * personne, c'est ce qu'il IMPORTE — et l'absence de tout appel réseau.
   */
  it('🔒 la lecture des avis ne touche NI Gmail, NI le Drive, NI MinIO', () => {
    for (const f of ['app/lib/gestion/nonRemise.ts', 'app/lib/gestion/nonRemiseRepo.ts',
      'app/scripts/rattraper-non-remises.ts']) {
      const src = sans(readFileSync(f, 'utf8'));
      const imports = [...src.matchAll(/^import\s+(?!type\b)[^;]*from\s*'([^']*)'/gm)].map((m) => m[1]);
      for (const i of imports) {
        expect(i, `${f} importe ${i}`).not.toMatch(/stockage|drive|gmail|google/i);
      }
      // Aucun appel réseau, sous aucune forme : ces modules ne connaissent que la base.
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toContain('googleapis.com');
    }
  });

  it('🔴 elle n’écrit QUE dans `gestion_non_remise` : aucun message n’est modifié', () => {
    const repo = sans(readFileSync('app/lib/gestion/nonRemiseRepo.ts', 'utf8'));
    const ecritures = [...repo.matchAll(/(INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/gi)].map((m) => m[2]);
    expect(new Set(ecritures)).toEqual(new Set(['gestion_non_remise']));
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 DÉFAUT TROUVÉ AU PREMIER RATTRAPAGE RÉEL (27/09/2026, 01:28). `constate_le` porte l'instant où NOUS avons lu
   * l'avis. Le rattrapage a lu 74 avis étalés du 09/01/2025 au 26/09/2026 et leur a donné à tous le même
   * `constate_le`, à la seconde près : trier là-dessus revenait à trier par ordre d'insertion, et « l'avis le plus
   * récent de cet échange » devenait « celui dont l'identifiant est le plus grand ».
   *
   * La date d'un avis est celle du message qui le porte. Aucune migration n'a été nécessaire : la donnée juste était
   * déjà en base — il suffisait d'aller lire la bonne, au lieu d'ajouter une seconde vérité à tenir.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 les lectures ordonnent sur la date de l’AVIS, jamais sur celle de sa lecture par nous', () => {
    const repo = sans(readFileSync('app/lib/gestion/nonRemiseRepo.ts', 'utf8'));
    // La date de référence est déclarée UNE fois, et c'est celle du message porteur.
    expect(repo).toContain("const DATE_DE_L_AVIS = 'a.recu_le'");
    // Aucun ORDER BY sur `constate_le` : c'est précisément ce qui aplatissait vingt mois d'avis sur une seconde.
    expect(repo).not.toMatch(/ORDER BY[^;]*constate_le/i);
    // Et les deux lectures joignent bien le message de l'avis pour disposer de sa date.
    expect(repo.match(/JOIN gestion_message a ON a\.id = n\.avis_message_id/g) ?? []).toHaveLength(2);
    // La commande de rattrapage aussi : son rapport annonçait « les cinq derniers » et montrait les cinq insérés.
    const cli = sans(readFileSync('app/scripts/rattraper-non-remises.ts', 'utf8'));
    expect(cli).toContain('ORDER BY a.recu_le DESC');
    expect(cli).not.toMatch(/ORDER BY[^;]*constate_le/i);
  });

  it('🔴 le rattachement n’accepte qu’un message que NOUS avons envoyé', () => {
    // Sans ce garde, un identifiant malencontreusement partagé collerait « non distribué » sur le mail d'un locataire.
    expect(sans(readFileSync('app/lib/gestion/nonRemiseRepo.ts', 'utf8'))).toContain("sens = 'envoye'");
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT AVIS-LISIBLE — LE PASSAGE LISIBLE D'UN AVIS, ISOLÉ DE SA PARTIE TECHNIQUE (demande d'Arno).
 *
 * CE QUE CE BLOC PROTÈGE, et qu'aucune relecture ne montre :
 *   ① la phrase humaine sort ENTIÈRE, en français comme en anglais — c'est elle qu'on vient lire en ouvrant l'avis ;
 *   ② la coupe se fait AVANT le marqueur technique, jamais après : un « Reporting-MTA » ou un `Received:` dans le
 *      bandeau rouge, et l'alerte devient un mur qu'on cesse de lire ;
 *   ③ rien n'est PERDU : ce qui n'est pas en rouge reste affiché dessous, mot pour mot ;
 *   ④ « Consultez les informations techniques ci-dessous » N'EST PAS un marqueur : c'est la fin d'une phrase
 *      humaine, et couper là ampute l'avis de sa moitié utile.
 *
 * Les corps ci-dessous sont RECOPIÉS de la base (fil 35848 message 57056, et deux autres avis réels).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 le passage lisible d’un avis de non-remise', () => {
  /** L'exemple exact donné par Arno : fil 35848, message 57056. */
  const AVIS_FR = [
    '** Boîte de réception du destinataire pleine **',
    '',
    "Votre message n'a pas pu être distribué à rishikadsingh@gmail.com. Sa boîte de réception est pleine ou elle reçoit un trop grand nombre de messages actuellement.",
    '',
    'Cliquez ici pour en savoir plus : https://support.google.com/mail/?p=OverQuotaTemp',
    '',
    'La réponse était :',
    '',
    "452 4.2.2 The recipient's inbox is out of storage space.",
    '',
    'Reporting-MTA: dns; googlemail.com',
    'Final-Recipient: rfc822; rishikadsingh@gmail.com',
    'Action: failed',
    'Status: 4.2.2',
  ].join('\n');

  it('🔴 FRANÇAIS : le titre ET la phrase, en entier — et rien de technique', () => {
    const { humain } = texteHumainAvis(AVIS_FR);
    expect(humain).toBe(
      '** Boîte de réception du destinataire pleine **\n'
      + "Votre message n'a pas pu être distribué à rishikadsingh@gmail.com. Sa boîte de réception est pleine ou elle reçoit un trop grand nombre de messages actuellement.");
  });

  it('la partie technique est CONSERVÉE, et commence au marqueur', () => {
    const { technique } = texteHumainAvis(AVIS_FR);
    expect(technique.startsWith('Cliquez ici pour en savoir plus')).toBe(true);
    expect(technique).toContain('Reporting-MTA: dns; googlemail.com');
    expect(technique).toContain('Final-Recipient: rfc822; rishikadsingh@gmail.com');
  });

  /** ④ Le piège : cette phrase ANNONCE la technique mais EST du texte humain. La couper amputerait l'avis. */
  it('🔴 « Consultez les informations techniques ci-dessous » reste DANS le texte humain', () => {
    const { humain } = texteHumainAvis([
      '** Message non distribué **',
      '',
      "Un problème est survenu lors de la distribution de votre message à yves.godeau@club-internet.fr. Consultez les informations techniques ci-dessous.",
      '',
      'Réponse du serveur distant :',
      '550 5.7.1 Email rejected per SPAM policy',
    ].join('\n'));
    expect(humain).toContain('Consultez les informations techniques ci-dessous.');
    expect(humain).not.toContain('550');
    expect(humain).not.toContain('Réponse du serveur distant');
  });

  it('ANGLAIS : « Address not found » / « couldn’t be delivered » sont traités pareil', () => {
    const { humain, technique } = texteHumainAvis([
      "Your message to daniel.raimundo@lumileds.com couldn't be delivered.",
      "daniel.raimundo wasn't found at lumileds.com.",
      '',
      'How to Fix It',
      'The address may be misspelled or may not exist.',
      '________________________________',
      'More Info for Email Admins',
      'Status code 554 5.4.14',
    ].join('\n'));
    expect(humain).toContain("couldn't be delivered");
    expect(humain).toContain('How to Fix It');
    // ② La partie administrateur N'ENTRE PAS dans le rouge.
    expect(humain).not.toContain('More Info for Email Admins');
    expect(technique).toContain('More Info for Email Admins');
  });

  /**
   * 🔴 LE DÉFAUT VU EN VÉRIFIANT LA FONCTION SUR LES 77 AVIS DE LA BASE : sans marqueur sur les en-têtes recopiés,
   * la coupe se faisait au premier `Content-Type:` — très bas — et le bandeau rouge avalait `Received:`, `Subject:`
   * et le `Message-ID:` du message d'origine.
   */
  it('🔴 les EN-TÊTES RECOPIÉS de l’original n’entrent jamais dans le rouge', () => {
    const { humain } = texteHumainAvis([
      'Your message could not be delivered to the recipient.',
      'The address was rejected by the server.',
      'Received: from WIN-V9LIVL9JLSI ([51.83.111.8])',
      'Subject: Document CRITERIMMO - Quittance',
      'Message-ID: <ONHMEY9NTSU4@win-v9livl9jlsi>',
    ].join('\n'));
    expect(humain).not.toContain('Received:');
    expect(humain).not.toContain('Subject:');
    expect(humain).not.toContain('Message-ID:');
  });

  it('les lignes vides et les URL nues ne polluent pas le bandeau', () => {
    const { humain } = texteHumainAvis([
      '[https://products.office.com/en-us/CMSImages/Office365Logo_Orange.png?version=b8d]',
      'Your message to someone@example.com could not be delivered today.',
      '',
      'Reporting-MTA: dns; googlemail.com',
    ].join('\n'));
    expect(humain).toBe('Your message to someone@example.com could not be delivered today.');
  });

  /**
   * 🔴 LE REPLI : un avis qui commence directement par son rapport machine ne donne rien de lisible. On rend `null`,
   * et l'écran se rabat sur le motif déjà extrait pour la ligne de liste — jamais un bandeau rouge vide.
   */
  it('🔴 rien d’isolable ⇒ `null`, jamais une chaîne vide', () => {
    expect(texteHumainAvis('Reporting-MTA: dns; googlemail.com\nAction: failed').humain).toBeNull();
    expect(texteHumainAvis('gestion').humain).toBeNull(); // trop court pour apprendre quoi que ce soit
    expect(texteHumainAvis(null).humain).toBeNull();
    expect(texteHumainAvis('').humain).toBeNull();
  });

  /** ③ Un avis SANS partie technique garde tout de même son corps : on ne rend jamais une technique vide par erreur. */
  it('un avis entièrement humain : tout en rouge, et rien ne manque', () => {
    const r = texteHumainAvis('Votre message n’a pas pu être remis au destinataire indiqué.');
    expect(r.humain).toBe('Votre message n’a pas pu être remis au destinataire indiqué.');
    expect(r.technique).toBe('');
  });

  /**
   * ⚠️ LE PLAFOND — un avis Office 365 fait suivre son constat d'un mode d'emploi de plusieurs milliers de signes.
   * Tout passer en rouge ferait un mur qu'on cesserait de lire. Ce qui dépasse N'EST PAS PERDU : il redescend dans
   * la partie normale, et la coupe se fait sur une FIN DE LIGNE.
   */
  it('🔴 un avis très long est borné, et le surplus redescend — jamais jeté', () => {
    const ligne = 'Une ligne d’explication qui prend de la place dans le bandeau rouge.';
    const long = Array.from({ length: 60 }, () => ligne).join('\n');
    const r = texteHumainAvis(long);
    expect((r.humain ?? '').length).toBeLessThanOrEqual(1200);
    expect(r.humain).not.toContain('\n\n');            // coupé sur une fin de ligne, pas au milieu d'un mot
    // Tout le texte est encore là, réparti entre les deux parties.
    const total = `${r.humain ?? ''}\n${r.technique}`.replace(/\s+/g, ' ');
    expect(total.split(ligne).length - 1).toBe(60);
  });
});
