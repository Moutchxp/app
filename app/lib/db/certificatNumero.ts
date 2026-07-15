import type { RequeteTx } from './client';

/** Compteur maximal représentable en NNNNNN (6 chiffres). Au-delà, le format SAVV-AAAA-NNNNNN est impossible. */
const COMPTEUR_MAX = 999999;

/** Levée si le compteur d'une année dépasse 999999 (format impossible) ou renvoie une valeur incohérente. */
export class ErreurNumeroCertificat extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurNumeroCertificat';
  }
}

/**
 * Attribue le PROCHAIN numéro `SAVV-AAAA-NNNNNN` (atomique, par année). Reçoit le `q` de la transaction EN COURS
 * (celle de l'émission) — n'ouvre JAMAIS sa propre transaction, n'appelle JAMAIS le pool directement.
 *
 * RAISON (pourquoi le client de transaction est passé, pas le pool) : le numéro doit vivre et mourir AVEC
 * l'émission. Si l'émission échoue et rollback, l'incrément du compteur est annulé avec elle → le numéro est
 * LIBÉRÉ. Sinon la série serait TROUÉE, ce qui est inacceptable sur une série de documents qui font foi.
 *
 * Attribution en UNE requête (JAMAIS SELECT-puis-UPDATE) : `INSERT … ON CONFLICT (annee) DO UPDATE … RETURNING`.
 * Le DO UPDATE prend un VERROU DE LIGNE → deux émissions simultanées se sérialisent, jamais le même numéro.
 *
 * ANNÉE : dérivée de l'HORLOGE POSTGRES (`now()`), dans la MÊME requête, JAMAIS reçue en paramètre → une SEULE
 * horloge (la base) fait foi. La frontière d'année est ANCRÉE sur l'ANNÉE CIVILE FRANÇAISE via `now() AT TIME
 * ZONE 'Europe/Paris'` : le numéro d'un certificat français appartient à l'année civile française, sa frontière ne
 * doit dépendre NI du serveur d'app, NI du fuseau de la SESSION Postgres, NI de l'endroit d'où l'on se connecte.
 * (Sans ancrage, `EXTRACT(YEAR FROM now())` suivrait le TimeZone de session : une émission le 1er janvier à 00h30
 * heure de Paris sur une session en UTC serait numérotée sur l'année PRÉCÉDENTE — le scindage de série qu'on évite.)
 * Aligné sur la convention Europe/Paris déjà en vigueur dans le projet (analytics/writer, maintenance, antiBruteforce).
 *
 * DÉBORDEMENT (> 999999 sur une année) : ÉCHEC EXPLICITE (`ErreurNumeroCertificat`) AVANT tout formatage — jamais
 * un numéro silencieusement mal formé. L'exception fait rollback la transaction d'émission → l'incrément fautif
 * est annulé (le compteur n'est pas laissé bloqué à 1000000).
 */
export async function attribuerNumeroCertificat(q: RequeteTx): Promise<string> {
  const r = await q<{ annee: number | string; dernier: number | string }>(
    `INSERT INTO certificat_compteur (annee, dernier)
       VALUES (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::int, 1)
     ON CONFLICT (annee) DO UPDATE SET dernier = certificat_compteur.dernier + 1
     RETURNING annee, dernier`,
  );
  const ligne = r.rows[0];
  // node-pg : `annee`/`dernier` sont des int4 → renvoyés en number ; on coerce défensivement (contrat : vérifier
  // le type réel, ne pas supposer).
  const annee = Number(ligne.annee);
  const dernier = Number(ligne.dernier);
  if (!Number.isInteger(annee) || !Number.isInteger(dernier) || dernier < 1) {
    throw new ErreurNumeroCertificat(`compteur incohérent (annee=${ligne.annee}, dernier=${ligne.dernier}).`);
  }
  if (dernier > COMPTEUR_MAX) {
    throw new ErreurNumeroCertificat(
      `dépassement du compteur ${annee} : ${dernier} > ${COMPTEUR_MAX} — format SAVV-AAAA-NNNNNN impossible.`,
    );
  }
  return `SAVV-${String(annee).padStart(4, '0')}-${String(dernier).padStart(6, '0')}`;
}
