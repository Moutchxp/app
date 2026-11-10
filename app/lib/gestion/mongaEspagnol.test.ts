import { describe, expect, it } from 'vitest';
import { certitudeALaCreation, etapesDuMailMonga } from './mongaEtape';

/**
 * ══ 🔴🔴 LOT MONGA-ESPAGNOL (Arno, 10/11/2026) — LES COMMENTAIRES MONGA EN ESPAGNOL ════════════════════════════════════════
 *
 * Les trois formulations RÉELLES relevées en production le 10/11/2026 (`.captures/monga-espagnol/resultat-prod.txt`, 14 mails),
 * mot pour mot. Le gabarit autour (bien, adresse, auteur) est anonymisé : seul le commentaire de Monga est réel. On éprouve :
 * l'étape française équivalente, sa date et sa plage ; la même règle de validation que le français ; le français inchangé ;
 * une phrase espagnole inconnue reste un commentaire.
 */
const mail = (commentaire: string): string =>
  'Monga\n\nLave-linge MNG-10001\n\n1 rue de l’Essai, 92000 Ville\nBonjour\n\n'
  + `Un nouveau message vous a été envoyé concernant la mission MNG-10001.\n\n${commentaire}\n\n`
  + 'Envoyé par Prénom Nom, le 09/11/2026 à 12:22\n \n\nVers Mission\n[https://app.monga.io/missions/view/0000]';
const lire = (commentaire: string, objet = 'MNG-10001 - Nouveau commentaire') => etapesDuMailMonga(objet, mail(commentaire));

const RDV_ES = 'Hola, la intervención con nuestro artesano asociado ha sido fijada para el 11/11/2026 entre 17h00 y 19h00';
const INJOIGNABLE_ES = 'No hemos podido contactar al contacto en el lugar durante nuestra llamada, le hemos dejado un mensaje, de voz '
  + 'complementado con un SMS, un recordatorio está programado para el final del día.';
const INJOIGNABLE_ES_2 = 'No hemos podido contactar al contacto en el lugar durante nuestra segunda llamada, por lo tanto le hemos enviado un '
  + 'correo electrónico. Continuaremos dándole seguimiento, por teléfono, SMS o correo electrónico regularmente.';
const ACCUSE_ES = 'Hola, acusamos buena recepción de tu solicitud y programamos la cita con uno de nuestros artesanos asociados a la brevedad.';

describe('🔴🔴 les trois formulations espagnoles réelles → l’étape française équivalente', () => {
  it('« la intervención … ha sido fijada para el … entre … y … » → Rendez-vous d’intervention, date et plage lues (7 mails)', () => {
    expect(lire(RDV_ES)).toEqual([expect.objectContaining({
      type: 'rdv_intervention', certitude: 'fiable', jour: '2026-11-11', heure: { de: '17:00', a: '19:00' }, texte: RDV_ES,
    })]);
  });
  it('« No hemos podido contactar al contacto … » (1re, 2e appel) → Contact injoignable (6 mails)', () => {
    for (const t of [INJOIGNABLE_ES, INJOIGNABLE_ES_2]) {
      expect(lire(t).map((e) => [e.type, e.certitude])).toEqual([['contact_injoignable', 'a_confirmer']]);
    }
  });
  it('« acusamos buena recepción de tu solicitud » → Ouverture par accusé de réception (1 mail, GES-2026-000026)', () => {
    expect(lire(ACCUSE_ES).map((e) => [e.type, e.certitude])).toEqual([['ouverture', 'a_confirmer']]);
  });
});

describe('🔴🔴 la même règle que le français, et le français inchangé', () => {
  it('chaque étape lue en espagnol est identique à sa jumelle française (type, certitude lue, date, plage)', () => {
    const fr = lire('Bonjour, l’intervention avec notre artisan partenaire a été fixée le 11/11/2026 entre 17h00 et 19h00')[0];
    const es = lire(RDV_ES)[0];
    expect({ ...es, texte: null }).toEqual({ ...fr, texte: null });
    expect(lire('Bonjour, nous accusons bonne réception de votre demande et programmons le rendez-vous.')[0].type).toBe('ouverture');
    expect(lire('Nous n’avons pas réussi à joindre le contact sur place lors de notre appel.')[0].type).toBe('contact_injoignable');
  });
  it('à la création : le carré (rendez-vous, ouverture) est À VALIDER ; l’injoignable reste un point, comme en français', () => {
    expect(certitudeALaCreation(lire(RDV_ES)[0])).toBe('a_confirmer');
    expect(certitudeALaCreation(lire(ACCUSE_ES)[0])).toBe('a_confirmer');
    expect(certitudeALaCreation(lire(INJOIGNABLE_ES)[0])).toBe('a_confirmer');   // lu « à confirmer », repère : inchangé
  });
});

describe('🔴 une phrase espagnole inconnue reste un simple commentaire : on n’invente rien', () => {
  it('ni une variante non observée, ni un texte libre', () => {
    for (const t of [
      'Hola, la cita con nuestro artesano asociado ha sido fijada para el 12/11/2026',   // « cita » : non observée
      'Hola, acusamos buena recepción de su solicitud.',                                  // « su » : non observée
      'Gracias, el presupuesto está disponible.',
    ]) expect(lire(t).map((e) => e.type)).toEqual(['commentaire']);
  });
});
