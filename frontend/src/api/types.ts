export type Role = "BUSINESS" | "VENDOR" | "COMPLIANCE" | "FACILITIES";

export interface User {
  user_id: string;
  full_name: string;
  email: string;
  role_code: Role;
  entity_id?: string | null;
  department_id?: string | null;
  vendor_id?: string | null;
}

export interface Carton {
  carton_id: string;
  entity_id: string;
  department_id: string;
  document_type: string;
  archival_policy: string;
  assigned_vendor_id: string | null;
  current_location_id?: string | null;
  current_status: string;
  legal_hold_flag: boolean;
  retention_trigger_date?: string | null;
  declared_file_count?: number | null;
  barcode?: string | null;
}

export interface ServiceRequest {
  request_id: string;
  carton_id: string;
  request_type: string;
  vendor_id: string;
  request_status: string;
  raised_by?: string | null;
  raised_on?: string | null;
  approved_by?: string | null;
  approved_on?: string | null;
  sla_due_date?: string | null;
}

export interface DashboardSummary {
  role: Role;
  totalCartons: number;
  totalRequests: number;
  cartonsByStatus: { status_code: string; n: number }[];
}

export interface CartonHistory {
  state: {
    cartonId: string;
    status: string;
    currentLocationId: string | null;
    legalHoldFlag: boolean;
  } | null;
  events: {
    eventId: string;
    eventType: string;
    occurredAt: string | null;
    actorId: string | null;
    resultingStatus: string | null;
  }[];
}
