export interface Customer {
  id: string;
  name: string;
  segment: "residential" | "commercial";
}

export interface Technician {
  id: string;
  name: string;
  skill: "hvac" | "plumbing" | "electrical";
}

export interface WorkOrder {
  id: string;
  customerId: string;
  technicianId: string;
  priority: "low" | "normal" | "urgent";
  status: "created" | "scheduled" | "completed";
  createdAt: string;
}

