import { describe, it, expect } from "vitest";
import { acceptFee, mentionsTransfer } from "../../../scripts/data-pipeline/lib/description-transfer";

describe("mentionsTransfer", () => {
  it("spots Spanish and English transfer wording", () => {
    expect(mentionsTransfer("Se traspasa bar en funcionamiento")).toBe(true);
    expect(mentionsTransfer("TRASPASO 170.000 €")).toBe(true);
    expect(mentionsTransfer("Transfer fee 90k, key money negotiable")).toBe(true);
  });

  it("still sends 'sin traspaso' on, so the model can say no", () => {
    expect(mentionsTransfer("Local sin traspaso")).toBe(true);
  });

  it("skips descriptions with no mention", () => {
    expect(mentionsTransfer("Local diáfano a pie de calle")).toBe(false);
    expect(mentionsTransfer("")).toBe(false);
    expect(mentionsTransfer(null)).toBe(false);
  });
});

describe("acceptFee", () => {
  it("keeps a real fee", () => {
    expect(acceptFee({ isTransfer: true, fee: 170000 })).toBe(170000);
  });

  it("rejects no, no amount, and silly amounts", () => {
    expect(acceptFee({ isTransfer: false, fee: 170000 })).toBeNull();
    expect(acceptFee({ isTransfer: true, fee: null })).toBeNull();
    expect(acceptFee({ isTransfer: true, fee: 999 })).toBeNull();
    expect(acceptFee({ isTransfer: true, fee: 5_000_001 })).toBeNull();
    expect(acceptFee(null)).toBeNull();
  });
});
