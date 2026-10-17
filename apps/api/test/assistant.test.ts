import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Container } from '../src/container';
import { invoices } from '../src/db/schema';
import type { StructuredLlm } from '../src/llm/structured';
import { ask } from '../src/services/ask';
import { DEMO_ORG_ID, runMonth } from '../src/services/demo';
import { draftReply } from '../src/services/reply';
import { demoContainer } from './helpers';

/** A scripted model: records what it was given and answers with a fixed object. */
function scripted(reply: unknown) {
  const calls: { system: string; user: string }[] = [];
  const llm: StructuredLlm = {
    async complete({ system, user, schema }) {
      calls.push({ system, user });
      return schema.parse(reply);
    },
  };
  return { llm, calls };
}

let container: Container;
const model = scripted({
  answer: 'Valentina cobró MND-0004 y MND-0014 se frenó por duplicada. MND-9999 no existe.',
  refs: ['MND-0014', 'MND-9999'],
  followUps: ['¿Y en septiembre?'],
});

beforeAll(async () => {
  container = await demoContainer({ now: '2026-09-01T15:00:00Z', llm: model.llm });
  await runMonth(container.deps, '2026-08', { paceMs: 0 });
});
afterAll(() => container.database.close());

describe('Pregúntale a Mandato', () => {
  it('answers from a read-only snapshot and cites only receipts that exist', async () => {
    const answer = await ask(container.deps, DEMO_ORG_ID, '¿Qué pasó con Valentina?');
    expect(answer.refs.map((r) => r.ref)).toEqual(['MND-0004', 'MND-0014']);
    const [first] = await container.deps.db
      .select()
      .from(invoices)
      .where(eq(invoices.ref, 'MND-0004'));
    expect(answer.refs[0]?.invoiceId).toBe(first?.id);
    const call = model.calls.at(-1)!;
    expect(call.system).toContain('No puedes pagar, aprobar');
    expect(call.user).toContain('MND-0014');
    expect(call.user).toContain('Transferencias:');
  });

  it('explains that a model is needed when none is configured', async () => {
    const without = { ...container.deps, llm: null };
    await expect(ask(without, DEMO_ORG_ID, '¿Hola?')).rejects.toMatchObject({ status: 503 });
  });
});

describe('the reply to the vendor', () => {
  it('drafts from the decision’s own reasons, for a person to send', async () => {
    const replyModel = scripted({ language: 'es', subject: 'Tu cobro', body: 'Hola, ...' });
    const deps = { ...container.deps, llm: replyModel.llm };
    const [held] = await container.deps.db
      .select()
      .from(invoices)
      .where(eq(invoices.datasetId, 'ago-14'));
    const draft = await draftReply(deps, DEMO_ORG_ID, held!.id, 'whatsapp');
    expect(draft.subject).toBe('Tu cobro');
    const given = replyModel.calls[0]!.user;
    expect(given).toContain('frenado');
    expect(given).toContain('Motivo de la decisión');
    expect(given).toContain('WhatsApp');
    expect(replyModel.calls[0]!.system).toContain('No reveles límites internos');
  });
});
