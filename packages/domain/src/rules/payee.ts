import { payoutMethodLabel } from '../format';
import { maskDestination, normalizeDestination } from '../text';
import { defineRule, fail, pass, skip } from './helpers';

const MATCHED_BY: Record<string, string> = {
  tax_id: 'por NIT/ID fiscal',
  destination: 'por sus datos de pago',
  tax_id_and_destination: 'por NIT/ID fiscal y datos de pago',
};

export const payeeKnown = defineRule(
  {
    id: 'payee.known',
    stage: 'payee',
    title: 'Beneficiario registrado',
    onFail: 'ESCALATE',
    teachable: true,
  },
  (d, meta) => {
    if (!d.x) return skip(meta, 'Sin lectura del documento no sé quién cobra.', false);
    const m = d.match;
    if (m.status === 'matched') {
      return pass(
        meta,
        `${m.payee.name} está en la lista de beneficiarios (coincide ${MATCHED_BY[m.by]}).`,
        { observed: d.x.issuer.name ?? m.payee.name, expected: m.payee.name },
      );
    }
    if (m.status === 'conflict') {
      return fail(
        meta,
        `El ID fiscal corresponde a ${m.byTaxId.name}, pero los datos de pago son de ${m.byDestination.name}.`,
        'el ID fiscal y los datos de pago fueran del mismo beneficiario registrado',
        { observed: `${m.byTaxId.name} / ${m.byDestination.name}` },
      );
    }
    const who = d.x.issuer.name ?? 'Quien cobra';
    let hint = '';
    if (m.similar) {
      hint = ` Se parece a ${m.similar.payee.name}, pero ni el ID fiscal ni los datos de pago coinciden, así que no lo trato como el mismo beneficiario`;
      hint += m.similar.confusable ? ' (además, el nombre usa letras de otro alfabeto).' : '.';
    }
    return fail(
      meta,
      `${who} no está en la lista de beneficiarios: ni su ID fiscal ni sus datos de pago coinciden con alguien registrado.${hint}`,
      `${d.x.issuer.name ?? 'quien cobra'} estuviera en la lista de beneficiarios y tuviera un acuerdo firmado`,
      { observed: d.x.issuer.name, expected: 'beneficiario registrado' },
    );
  },
);

export const payeeActive = defineRule(
  {
    id: 'payee.active',
    stage: 'payee',
    title: 'Beneficiario habilitado',
    onFail: 'HOLD',
    teachable: false,
  },
  (d, meta) => {
    if (!d.payee) return skip(meta, 'Sin beneficiario registrado.', false);
    if (d.payee.status === 'active') {
      return pass(meta, `El beneficiario ${d.payee.name} está habilitado para recibir pagos.`);
    }
    return fail(
      meta,
      `El beneficiario ${d.payee.name} está bloqueado en el registro.`,
      `alguien con permisos desbloqueara a ${d.payee.name}`,
    );
  },
);

export const destinationMatches = defineRule(
  {
    id: 'payee.destination_matches',
    stage: 'payee',
    title: 'Destino de pago registrado',
    onFail: 'ESCALATE',
    teachable: false,
  },
  (d, meta) => {
    if (!d.payee)
      return skip(meta, 'Sin beneficiario registrado no hay destino que comparar.', false);
    const registered = d.payee.destination;
    const registeredLabel = `${payoutMethodLabel(registered.method)} ${maskDestination(registered.value)}`;
    if (!d.invoiceDestinationNorm) {
      return pass(
        meta,
        `La factura no trae datos de pago; se usaría el destino registrado (${registeredLabel}).`,
        { expected: registeredLabel },
      );
    }
    const invoiceLabel = maskDestination(d.x?.payout.destination ?? '');
    if (d.invoiceDestinationNorm === normalizeDestination(registered.value)) {
      return pass(meta, `Los datos de pago coinciden con los registrados (${registeredLabel}).`, {
        observed: invoiceLabel,
        expected: registeredLabel,
      });
    }
    return fail(
      meta,
      `La factura pide pagar a ${invoiceLabel}, pero el destino registrado de ${d.payee.name} es ${registeredLabel}.`,
      'los datos de pago coincidieran con los registrados (si cambiaron, se actualizan en el registro de beneficiarios después de verificarlos por otro canal)',
      { observed: invoiceLabel, expected: registeredLabel },
    );
  },
);

export const payeeRules = [payeeKnown, payeeActive, destinationMatches];
