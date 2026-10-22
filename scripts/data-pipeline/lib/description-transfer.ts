/**
 * Transfer fees hidden in rental descriptions.
 *
 * Some landlords post a traspaso (a running business handed over for a
 * one-off fee) under Idealista's rentals category and only mention the fee
 * in the description. A free word check picks the few that mention one, then
 * a cheap Haiku call reads the amount.
 */

import Anthropic from "@anthropic-ai/sdk";

const TRANSFER_MODEL = "claude-haiku-5-5";

// Anything outside this range is a misread (a phone number, the rent, a
// typo), not a real transfer fee.
const MIN_FEE = 1_000;
const MAX_FEE = 5_000_000;

export interface TransferAnswer {
  isTransfer: boolean;
  fee: number | null;
}

/** Free pre-check: only descriptions that mention a transfer go to the model. */
export function mentionsTransfer(text: string | null | undefined): boolean {
  return !!text && /traspas|transfer|key money/i.test(text);
}

/**
 * Whether a rental keeps a fee found on an earlier run. Only new listings are
 * checked, so the stored fee is kept while the description still mentions a
 * transfer (or could not be read), and dropped once it no longer does. That
 * clears a misread or a fee the landlord has since removed.
 */
export function keepsStoredFee(description: string | null): boolean {
  return description === null || mentionsTransfer(description);
}

/** The fee to save, or null when the answer is not a believable transfer fee. */
export function acceptFee(answer: TransferAnswer | null): number | null {
  if (!answer?.isTransfer || typeof answer.fee !== "number") return null;
  return answer.fee >= MIN_FEE && answer.fee <= MAX_FEE ? Math.round(answer.fee) : null;
}

const SCHEMA = {
  type: "object",
  properties: {
    isTransfer: { type: "boolean" },
    fee: { type: ["number", "null"] },
  },
  required: ["isTransfer", "fee"],
  additionalProperties: false,
};

const SYSTEM =
  "You read Spanish commercial property listings. Decide whether the listing " +
  "asks for a traspaso: a one-off fee paid to the outgoing tenant for the " +
  "business, fit-out or equipment, on top of the monthly rent. " +
  "isTransfer is true only if such a fee is required. Phrases like " +
  "\"sin traspaso\" or \"no traspaso\" mean false. " +
  "fee is the fee in euros as a plain number (\"170.000 €\" is 170000, " +
  "\"170k\" is 170000), or null if no amount is written. Never use the rent as the fee.";

/**
 * Ask the model whether a description asks for a transfer fee.
 * Returns null on any failure, so a bad reply simply means "no fee".
 */
export async function findTransferFee(
  client: Anthropic,
  description: string
): Promise<TransferAnswer | null> {
  try {
    const response = await client.messages.create({
      model: TRANSFER_MODEL,
      max_tokens: 1000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: description.slice(0, 4000) }],
    });
    // The reply can open with a thinking block, so take the first text block.
    const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (response.stop_reason !== "end_turn" || !block) {
      console.error(`    Transfer check got no usable answer (stop: ${response.stop_reason})`);
      return null;
    }
    return JSON.parse(block.text) as TransferAnswer;
  } catch (err) {
    const why = err instanceof Anthropic.APIError ? `${err.constructor.name} (${err.status})` : (err as Error)?.name;
    console.error(`    Transfer check failed: ${why}`);
    return null;
  }
}
