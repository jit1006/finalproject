-- Reference seed (SQLite) for the 16-table schema. Apply once after schema.sql.
-- All reference vocabularies live in ref_lookup, keyed by (lookup_type, code).
PRAGMA foreign_keys = ON;

-- ROLES ----------------------------------------------------------------------
INSERT INTO ref_lookup (lookup_type, code, name, meaning, attrs_json) VALUES
  ('ROLE','BUSINESS','Business User','Owns entity/department scope', json('{"scope_type":"DEPARTMENT"}')),
  ('ROLE','VENDOR','Vendor User','Owns vendor code scope', json('{"scope_type":"VENDOR"}')),
  ('ROLE','COMPLIANCE','Compliance Officer','Cross-entity compliance', json('{"scope_type":"GLOBAL"}')),
  ('ROLE','FACILITIES','Facilities Team','Cross-entity ops/finance/admin', json('{"scope_type":"GLOBAL"}'));

-- SCOPE TYPES ----------------------------------------------------------------
INSERT INTO ref_lookup (lookup_type, code, name) VALUES
  ('SCOPE_TYPE','DEPARTMENT','Department-scoped'),
  ('SCOPE_TYPE','VENDOR','Vendor-scoped'),
  ('SCOPE_TYPE','GLOBAL','Cross-entity');

-- DOC TYPES (numeric_value = base retention years; attrs_json = trigger desc) -
INSERT INTO ref_lookup (lookup_type, code, name, meaning, numeric_value, attrs_json) VALUES
  ('DOC_TYPE','Client KYC','Client KYC',NULL,8, json('{"trigger":"Relationship closure date"}')),
  ('DOC_TYPE','Loan Agreements','Loan Agreements',NULL,10, json('{"trigger":"Loan closure date"}')),
  ('DOC_TYPE','Other Agreements and Vendor Data','Other Agreements and Vendor Data',NULL,7, json('{"trigger":"Contract end date"}')),
  ('DOC_TYPE','Vendor Onboarding','Vendor Onboarding',NULL,7, json('{"trigger":"Onboarding completion date"}')),
  ('DOC_TYPE','Audit Reports','Audit Reports',NULL,10, json('{"trigger":"Report issue date"}')),
  ('DOC_TYPE','Invoices','Invoices',NULL,8, json('{"trigger":"Financial year end"}')),
  ('DOC_TYPE','Misc Documents','Misc Documents',NULL,5, json('{"trigger":"Carton creation date"}'));

-- ARCHIVAL POLICIES ----------------------------------------------------------
INSERT INTO ref_lookup (lookup_type, code, name) VALUES
  ('ARCHIVAL_POLICY','Banking','Banking'),
  ('ARCHIVAL_POLICY','Country Specific','Country Specific'),
  ('ARCHIVAL_POLICY','Standard','Standard');

-- RETENTION POLICIES: code = "<DOC_TYPE>|<ARCHIVAL_POLICY>", numeric_value = years
INSERT INTO ref_lookup (lookup_type, code, numeric_value) VALUES
  ('RETENTION_POLICY','Client KYC|Standard',8),
  ('RETENTION_POLICY','Client KYC|Country Specific',10),
  ('RETENTION_POLICY','Client KYC|Banking',10),
  ('RETENTION_POLICY','Loan Agreements|Standard',10),
  ('RETENTION_POLICY','Loan Agreements|Country Specific',12),
  ('RETENTION_POLICY','Loan Agreements|Banking',10),
  ('RETENTION_POLICY','Other Agreements and Vendor Data|Standard',7),
  ('RETENTION_POLICY','Other Agreements and Vendor Data|Country Specific',9),
  ('RETENTION_POLICY','Other Agreements and Vendor Data|Banking',10),
  ('RETENTION_POLICY','Vendor Onboarding|Standard',7),
  ('RETENTION_POLICY','Vendor Onboarding|Country Specific',9),
  ('RETENTION_POLICY','Vendor Onboarding|Banking',10),
  ('RETENTION_POLICY','Audit Reports|Standard',10),
  ('RETENTION_POLICY','Audit Reports|Country Specific',12),
  ('RETENTION_POLICY','Audit Reports|Banking',10),
  ('RETENTION_POLICY','Invoices|Standard',8),
  ('RETENTION_POLICY','Invoices|Country Specific',10),
  ('RETENTION_POLICY','Invoices|Banking',10),
  ('RETENTION_POLICY','Misc Documents|Standard',5),
  ('RETENTION_POLICY','Misc Documents|Country Specific',7),
  ('RETENTION_POLICY','Misc Documents|Banking',10);

-- CARTON STATUSES (attrs_json.is_terminal) -----------------------------------
INSERT INTO ref_lookup (lookup_type, code, meaning, attrs_json) VALUES
  ('CARTON_STATUS','Created','Carton registered; not yet collected', json('{"is_terminal":false}')),
  ('CARTON_STATUS','Pickup Requested','Pickup raised, awaiting vendor', json('{"is_terminal":false}')),
  ('CARTON_STATUS','In Transit to Vendor','Collected, not yet receipted', json('{"is_terminal":false}')),
  ('CARTON_STATUS','In Storage','Held at vendor warehouse', json('{"is_terminal":false}')),
  ('CARTON_STATUS','Retrieval Requested','Retrieval raised, awaiting delivery', json('{"is_terminal":false}')),
  ('CARTON_STATUS','With Business','Physically with the department', json('{"is_terminal":false}')),
  ('CARTON_STATUS','Return Requested','Return to vendor raised', json('{"is_terminal":false}')),
  ('CARTON_STATUS','Destruction Requested','Awaiting approval', json('{"is_terminal":false}')),
  ('CARTON_STATUS','Approved for Destruction','Approved, awaiting execution', json('{"is_terminal":false}')),
  ('CARTON_STATUS','Destroyed','Terminal; certificate issued', json('{"is_terminal":true}')),
  ('CARTON_STATUS','Missing','Exception state from reconciliation', json('{"is_terminal":false}'));

-- REQUEST STATUSES -----------------------------------------------------------
INSERT INTO ref_lookup (lookup_type, code) VALUES
  ('REQUEST_STATUS','Open'),('REQUEST_STATUS','In Progress'),('REQUEST_STATUS','Completed'),
  ('REQUEST_STATUS','Rejected'),('REQUEST_STATUS','Cancelled');

-- EVENT TYPES (attrs_json: raised_by role, resulting_status, allowed_next_status)
INSERT INTO ref_lookup (lookup_type, code, meaning, attrs_json) VALUES
  ('EVENT_TYPE','CARTON_CREATED','Carton registered', json('{"raised_by":"BUSINESS","resulting_status":"Created","from":[null],"to":"Created"}')),
  ('EVENT_TYPE','PICKUP_REQUESTED','Business requests collection', json('{"raised_by":"BUSINESS","resulting_status":"Pickup Requested","from":["Created"],"to":"Pickup Requested"}')),
  ('EVENT_TYPE','PICKED_UP_BY_VENDOR','Vendor confirms collection', json('{"raised_by":"VENDOR","resulting_status":"In Transit to Vendor","from":["Pickup Requested"],"to":"In Transit to Vendor"}')),
  ('EVENT_TYPE','RECEIVED_AT_WAREHOUSE','Vendor confirms warehouse receipt', json('{"raised_by":"VENDOR","resulting_status":"In Storage","from":["In Transit to Vendor","Return Requested"],"to":"In Storage"}')),
  ('EVENT_TYPE','RETRIEVAL_REQUESTED','Business requests retrieval', json('{"raised_by":"BUSINESS","resulting_status":"Retrieval Requested","from":["In Storage"],"to":"Retrieval Requested"}')),
  ('EVENT_TYPE','DELIVERED_TO_BUSINESS','Vendor delivers to business', json('{"raised_by":"VENDOR","resulting_status":"With Business","from":["Retrieval Requested"],"to":"With Business"}')),
  ('EVENT_TYPE','RETURN_REQUESTED','Business requests return', json('{"raised_by":"BUSINESS","resulting_status":"Return Requested","from":["With Business"],"to":"Return Requested"}')),
  ('EVENT_TYPE','DESTRUCTION_REQUESTED','Business requests destruction', json('{"raised_by":"BUSINESS","resulting_status":"Destruction Requested","from":["In Storage"],"to":"Destruction Requested"}')),
  ('EVENT_TYPE','DESTRUCTION_APPROVED','Compliance approves destruction', json('{"raised_by":"COMPLIANCE","resulting_status":"Approved for Destruction","from":["Destruction Requested"],"to":"Approved for Destruction"}')),
  ('EVENT_TYPE','DESTROYED','Vendor destroys the carton', json('{"raised_by":"VENDOR","resulting_status":"Destroyed","from":["Approved for Destruction"],"to":"Destroyed"}')),
  ('EVENT_TYPE','INTER_WAREHOUSE_TRANSFER','Vendor moves between its warehouses', json('{"raised_by":"VENDOR","resulting_status":"In Storage","from":["In Storage"],"to":"In Storage"}')),
  ('EVENT_TYPE','LEGAL_HOLD_APPLIED','Compliance applies a hold', json('{"raised_by":"COMPLIANCE","resulting_status":null}')),
  ('EVENT_TYPE','LEGAL_HOLD_RELEASED','Compliance releases a hold', json('{"raised_by":"COMPLIANCE","resulting_status":null}')),
  ('EVENT_TYPE','REQUEST_ACKNOWLEDGED','Vendor acknowledgment', json('{"raised_by":"VENDOR","resulting_status":null}')),
  ('EVENT_TYPE','REQUEST_REJECTED','Rejected instruction/approval', json('{"resulting_status":"In Storage","from":["Destruction Requested"],"to":"In Storage"}')),
  ('EVENT_TYPE','REQUEST_CANCELLED','Business cancellation', json('{"raised_by":"BUSINESS","resulting_status":null}')),
  ('EVENT_TYPE','FILE_INDEXED','File index added/corrected', json('{"raised_by":"BUSINESS","resulting_status":null}')),
  ('EVENT_TYPE','CERTIFICATE_LODGED','Evidence attachment', json('{"raised_by":"VENDOR","resulting_status":null}')),
  ('EVENT_TYPE','RECONCILIATION_RUN','Recorded reconciliation', json('{"raised_by":"FACILITIES","resulting_status":null}'));

-- SLA (numeric_value = business days; attrs_json = start/end) -----------------
INSERT INTO ref_lookup (lookup_type, code, numeric_value, attrs_json) VALUES
  ('SLA','PICKUP',2, json('{"starts_on":"REQUEST_SUBMITTED","ends_on":"WAREHOUSE_RECEIPT"}')),
  ('SLA','RETRIEVAL',2, json('{"starts_on":"REQUEST_SUBMITTED","ends_on":"BUSINESS_DELIVERY"}')),
  ('SLA','RETURN',2, json('{"starts_on":"REQUEST_SUBMITTED","ends_on":"WAREHOUSE_RECEIPT"}')),
  ('SLA','DESTRUCTION',5, json('{"starts_on":"DESTRUCTION_APPROVED","ends_on":"CERTIFICATE_ISSUED"}'));

-- THRESHOLDS (numeric_value = days; attrs_json = day_basis) -------------------
INSERT INTO ref_lookup (lookup_type, code, meaning, numeric_value, attrs_json) VALUES
  ('THRESHOLD','In Transit to Vendor','Possibly lost in transit',30, json('{"day_basis":"CALENDAR"}')),
  ('THRESHOLD','With Business','Borrowing convention',90, json('{"day_basis":"CALENDAR"}')),
  ('THRESHOLD','Request open','Past its own due date',0, json('{"day_basis":"CALENDAR"}'));

-- TAX (numeric_value = pct*100 to keep integer; attrs_json = date range) ------
INSERT INTO ref_lookup (lookup_type, code, numeric_value, attrs_json) VALUES
  ('TAX','GST-18',1800, json('{"effective_from":"2024-04-01","effective_to":null}'));

-- HOLIDAYS -------------------------------------------------------------------
INSERT INTO ref_lookup (lookup_type, code, name) VALUES
  ('HOLIDAY','2025-01-26','Republic Day'),('HOLIDAY','2025-03-14','Holi'),
  ('HOLIDAY','2025-08-15','Independence Day'),('HOLIDAY','2025-10-02','Gandhi Jayanti'),
  ('HOLIDAY','2025-10-21','Diwali'),('HOLIDAY','2025-12-25','Christmas'),
  ('HOLIDAY','2026-01-26','Republic Day'),('HOLIDAY','2026-08-15','Independence Day'),
  ('HOLIDAY','2026-10-02','Gandhi Jayanti');

-- ACTIVITIES -----------------------------------------------------------------
INSERT INTO ref_lookup (lookup_type, code) VALUES
  ('ACTIVITY','PICKUP'),('ACTIVITY','RETRIEVAL'),('ACTIVITY','RETURN'),
  ('ACTIVITY','DESTRUCTION'),('ACTIVITY','STORAGE');

-- ORG UNITS (entity + department merged) -------------------------------------
INSERT INTO org_unit (entity_id, department_id, entity_name, department_name) VALUES
  ('ENT-BRN','DEP-BRN-DEL','Branch Banking','Delhi Branch'),
  ('ENT-BRN','DEP-BRN-PUN','Branch Banking','Pune Branch'),
  ('ENT-BRN','DEP-BRN-MUM','Branch Banking','Mumbai Branch'),
  ('ENT-BRN','DEP-BRN-KOL','Branch Banking','Kolkata Branch'),
  ('ENT-BRN','DEP-BRN-CHE','Branch Banking','Chennai Branch'),
  ('ENT-MF','DEP-MF-OPS','Mutual Fund','MF Operations'),
  ('ENT-MF','DEP-MF-INV','Mutual Fund','Investor Services'),
  ('ENT-MF','DEP-MF-CMP','Mutual Fund','MF Compliance'),
  ('ENT-GCC','DEP-GCC-TRP','GCC','Transport'),
  ('ENT-GCC','DEP-GCC-RE','GCC','Real Estate'),
  ('ENT-GCC','DEP-GCC-AFMG','GCC','AFMG'),
  ('ENT-GCC','DEP-GCC-AP','GCC','Accounts Payable'),
  ('ENT-GCC','DEP-GCC-HR','GCC','Human Resources');

-- VENDORS --------------------------------------------------------------------
INSERT INTO vendor (vendor_id, vendor_name, status, contract_start, contract_ref, ops_contact_email, recertification_frequency) VALUES
  ('VND-001','SecureVault Storage Pvt Ltd','Active','2018-04-01','MSA-2018-114','vendor.ops@securevault.example','Quarterly'),
  ('VND-002','RecordSafe India Ltd','Active','2020-07-01','MSA-2020-227','india.ops@recordsafe.example','Quarterly'),
  ('VND-003','ArchivePro Logistics','Active','2023-01-15','MSA-2022-091','support@archivepro.example','Quarterly');

-- WAREHOUSE LOCATIONS --------------------------------------------------------
INSERT INTO warehouse_location (location_id, vendor_id, location_name, city, capacity_cartons) VALUES
  ('LOC-MUM-01','VND-001','Mumbai Warehouse - Bhiwandi','Mumbai',22000),
  ('LOC-DEL-01','VND-001','Delhi NCR Warehouse - Manesar','Delhi NCR',14000),
  ('LOC-PUN-01','VND-002','Pune Warehouse - Chakan','Pune',9000),
  ('LOC-KOL-01','VND-002','Kolkata Warehouse - Dankuni','Kolkata',6000),
  ('LOC-CHE-01','VND-003','Chennai Warehouse - Sriperumbudur','Chennai',7000),
  ('LOC-BLR-01','VND-003','Bengaluru Warehouse - Nelamangala','Bengaluru',8000);

-- RATE CARD ------------------------------------------------------------------
INSERT INTO rate_card (vendor_id, activity, effective_from, effective_to, rate_inr, unit) VALUES
  ('VND-001','PICKUP','2024-04-01',NULL,500,'PER_CARTON'),
  ('VND-001','RETRIEVAL','2024-04-01',NULL,500,'PER_CARTON'),
  ('VND-001','DESTRUCTION','2024-04-01',NULL,750,'PER_CARTON'),
  ('VND-001','STORAGE','2024-04-01','2026-04-01',100,'PER_CARTON_MONTH'),
  ('VND-001','STORAGE','2026-04-01',NULL,108,'PER_CARTON_MONTH'),
  ('VND-002','PICKUP','2024-04-01',NULL,450,'PER_CARTON'),
  ('VND-002','RETRIEVAL','2024-04-01',NULL,550,'PER_CARTON'),
  ('VND-002','DESTRUCTION','2024-04-01',NULL,700,'PER_CARTON'),
  ('VND-002','STORAGE','2024-04-01',NULL,95,'PER_CARTON_MONTH'),
  ('VND-003','PICKUP','2025-01-01',NULL,520,'PER_CARTON'),
  ('VND-003','RETRIEVAL','2025-01-01',NULL,520,'PER_CARTON'),
  ('VND-003','DESTRUCTION','2025-01-01',NULL,800,'PER_CARTON'),
  ('VND-003','STORAGE','2025-01-01',NULL,110,'PER_CARTON_MONTH');
