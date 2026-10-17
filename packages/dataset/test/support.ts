import { scanForAgentInstructions } from '@mandato/domain';
import { ALL_BILLS, filePath } from '../src';

export { ALL_BILLS, filePath };

/** Bills whose chat or e-mail text trips the deterministic scanner without being an attack. */
export function scanForAgentInstructionsInDataset(): string[] {
  return ALL_BILLS.filter((b) => !b.truth.agentInstructions.detected)
    .filter(
      (b) =>
        scanForAgentInstructions(
          b.document.email?.body,
          b.document.chat?.messages.map((m) => m.text).join('\n'),
        ).matched,
    )
    .map((b) => b.id);
}
