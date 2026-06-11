import type { WorkOrder } from "../src/models";
import { describe, expect, it } from "vitest";

export function complete(order: WorkOrder): WorkOrder {
  return { ...order, status: "completed" };
}

describe("work order lifecycle", () => {
  it("marks a work order completed", () => {
    const order: WorkOrder = {
      id: "wo_1",
      customerId: "customer_1",
      technicianId: "technician_1",
      priority: "normal",
      status: "scheduled",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    expect(complete(order).status).toBe("completed");
  });
});
