import { describe, expect, it } from "vitest";
import { deriveSteps, jobGuard, type JobStepsInput } from "./jobSteps";

const base: JobStepsInput = { state: "RUNNING", stage: "MATCHING", total: 33, resolved: 27, pending: 6 };
const states = (job: JobStepsInput) => deriveSteps(job).map((s) => s.state);

describe("deriveSteps", () => {
  it("shows matching running and commit not started while there are pending records", () => {
    expect(states(base)).toEqual(["SUCCESS", "SUCCESS", "RUNNING", "PENDING", "PENDING", "PENDING"]);
    expect(deriveSteps(base)[2].detail).toBe("27/33 · correspondências em análise");
  });

  it("waits for explicit confirmation once nothing is pending", () => {
    const steps = deriveSteps({ ...base, stage: "COMMIT", resolved: 33, pending: 0 });
    expect(steps.map((s) => s.state)).toEqual(["SUCCESS", "SUCCESS", "SUCCESS", "PENDING", "PENDING", "PENDING"]);
    expect(steps[3].detail).toBe("Aguardando confirmação explícita");
  });

  it("marks every step success only after the commit", () => {
    const steps = deriveSteps({ ...base, state: "SUCCESS", stage: "NOTIFICATION", resolved: 33, pending: 0, alertsPrepared: 2 });
    expect(steps.every((s) => s.state === "SUCCESS")).toBe(true);
    expect(steps[5].detail).toContain("2 alertas");
  });

  it("fails at the stage that failed and leaves the rest pending", () => {
    const steps = deriveSteps({ state: "FAILED", stage: "PARSE", total: 0, resolved: 0, pending: 0, error: "Nenhum registro" });
    expect(steps.map((s) => s.state)).toEqual(["FAILED", "PENDING", "PENDING", "PENDING", "PENDING", "PENDING"]);
    expect(steps[0].detail).toBe("Nenhum registro");
  });

  it("cancels everything after matching", () => {
    expect(states({ ...base, state: "CANCELLED" })).toEqual(["SUCCESS", "SUCCESS", "SUCCESS", "CANCELLED", "CANCELLED", "CANCELLED"]);
  });
});

describe("jobGuard", () => {
  it("describes progress without implying a commit", () => {
    expect(jobGuard(base)).toBe("27/33 · commit bloqueado");
    expect(jobGuard({ ...base, pending: 0, resolved: 33 })).toBe("33/33 · aguardando confirmação");
    expect(jobGuard({ ...base, state: "SUCCESS" })).toBe("Lote concluído");
    expect(jobGuard({ ...base, state: "FAILED", error: "HTTP 500" })).toBe("HTTP 500");
  });
});
