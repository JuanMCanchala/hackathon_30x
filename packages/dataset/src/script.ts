/**
 * What the people at Andes Labs do between bills. The demo and the evaluation harness replay
 * these actions at their timestamps, interleaved with the bills.
 */
import type { PayoutDestination } from '@mandato/domain';

export type ScriptAction =
  | { at: string; kind: 'approve'; bill: string; userId: string; note: string }
  | { at: string; kind: 'reject'; bill: string; userId: string; note: string }
  | { at: string; kind: 'accept_proposal'; bill: string; userId: string }
  | { at: string; kind: 'reject_proposal'; bill: string; userId: string; note: string }
  | {
      at: string;
      kind: 'update_payee_destination';
      payeeId: string;
      userId: string;
      destination: PayoutDestination;
      note: string;
    };

export const SCRIPT: ScriptAction[] = [
  // —— August ——
  {
    at: '2026-08-03T15:00:00-05:00',
    kind: 'approve',
    bill: 'ago-02',
    userId: 'usr_martin',
    note: 'Sumamos 10 personas al equipo en agosto.',
  },
  {
    at: '2026-08-03T15:05:00-05:00',
    kind: 'accept_proposal',
    bill: 'ago-02',
    userId: 'usr_martin',
  },
  {
    at: '2026-08-06T12:00:00-05:00',
    kind: 'approve',
    bill: 'ago-09',
    userId: 'usr_martin',
    note: 'Es el retainer acordado para el segundo semestre.',
  },
  {
    at: '2026-08-06T12:05:00-05:00',
    kind: 'accept_proposal',
    bill: 'ago-09',
    userId: 'usr_martin',
  },
  {
    at: '2026-08-06T16:00:00-05:00',
    kind: 'reject',
    bill: 'ago-10',
    userId: 'usr_martin',
    note: 'El monto en letras no coincide; le pedimos una cuenta de cobro corregida.',
  },
  {
    at: '2026-08-07T15:00:00-05:00',
    kind: 'approve',
    bill: 'ago-11',
    userId: 'usr_martin',
    note: 'Contratado desde agosto. Verifiqué su llave Bre-B por llamada.',
  },
  {
    at: '2026-08-07T15:05:00-05:00',
    kind: 'accept_proposal',
    bill: 'ago-11',
    userId: 'usr_martin',
  },
  {
    at: '2026-08-11T17:00:00-05:00',
    kind: 'approve',
    bill: 'ago-13',
    userId: 'usr_martin',
    note: 'Revisión de contratos de contratistas, acordada con Lexia.',
  },
  {
    at: '2026-08-11T17:05:00-05:00',
    kind: 'reject_proposal',
    bill: 'ago-13',
    userId: 'usr_martin',
    note: 'Los honorarios cambian cada mes; prefiero aprobarlos uno a uno.',
  },
  {
    at: '2026-08-13T15:00:00-05:00',
    kind: 'reject',
    bill: 'ago-15',
    userId: 'usr_martin',
    note: 'No pagamos en soles. Le pedimos facturar en USD y registrarla primero.',
  },
  {
    at: '2026-08-14T09:00:00-05:00',
    kind: 'reject',
    bill: 'ago-16',
    userId: 'usr_sofia',
    note: 'No conocemos a este proveedor.',
  },
  {
    at: '2026-08-18T15:00:00-05:00',
    kind: 'approve',
    bill: 'ago-17',
    userId: 'usr_martin',
    note: 'Ilustraciones de la nueva landing.',
  },
  {
    at: '2026-08-18T15:05:00-05:00',
    kind: 'accept_proposal',
    bill: 'ago-17',
    userId: 'usr_martin',
  },

  // —— September ——
  {
    at: '2026-09-02T11:00:00-05:00',
    kind: 'approve',
    bill: 'sep-04',
    userId: 'usr_martin',
    note: 'Confirmé por llamada con Valentina el cambio de llave.',
  },
  {
    at: '2026-09-02T11:10:00-05:00',
    kind: 'update_payee_destination',
    payeeId: 'pay_valentina',
    userId: 'usr_martin',
    destination: { method: 'bre_b', value: '@valentina.rios', bankName: null },
    note: 'Nueva llave Bre-B verificada por llamada.',
  },
  {
    at: '2026-09-10T16:00:00-05:00',
    kind: 'approve',
    bill: 'sep-13',
    userId: 'usr_martin',
    note: 'Contrato de arrendamiento de la oficina nueva.',
  },
  {
    at: '2026-09-10T16:05:00-05:00',
    kind: 'reject_proposal',
    bill: 'sep-13',
    userId: 'usr_martin',
    note: 'Sigo prefiriendo aprobar a Lexia caso por caso.',
  },
  {
    at: '2026-09-11T12:00:00-05:00',
    kind: 'reject',
    bill: 'sep-14',
    userId: 'usr_sofia',
    note: 'Es un cobro repetido del mismo plan.',
  },
  {
    at: '2026-09-15T15:00:00-05:00',
    kind: 'approve',
    bill: 'sep-16',
    userId: 'usr_martin',
    note: 'Proyecto aprobado por la junta en agosto.',
  },
  {
    at: '2026-09-16T09:00:00-05:00',
    kind: 'approve',
    bill: 'sep-16',
    userId: 'usr_sofia',
    note: 'Revisado contra el contrato del proyecto.',
  },
  // sep-17 (Ruta Viajes) stays pending: the September budget is exhausted.
];
