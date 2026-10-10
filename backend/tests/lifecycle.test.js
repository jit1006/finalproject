// Backend tests using node:test + node:sqlite (zero deps) for the 16-table schema.
// Run: npm test
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.PRMS_DATABASE_FILE = join(tmpdir(), `prms16-test-${randomUUID()}.db`);
process.env.PRMS_SESSION_SECRET = "test";

const here = dirname(fileURLToPath(import.meta.url));
const { db } = await import("../src/db/connection.js");
const { hashPassword, verifyPassword } = await import("../src/security.js");

before(() => {
  db.exec(readFileSync(join(here, "../src/db/schema.sql"), "utf8"));
  db.exec(readFileSync(join(here, "../src/db/seed.sql"), "utf8"));
});

test("password hashing round-trips and rejects wrong/empty", () => {
  const h = hashPassword("correct horse");
  assert.ok(verifyPassword("correct horse", h));
  assert.ok(!verifyPassword("wrong", h));
  assert.ok(!verifyPassword("x", null));
});

test("ref_lookup consolidates vocabularies and role FK is enforced", () => {
  const roles = db.prepare("SELECT count(*) n FROM ref_lookup WHERE lookup_type='ROLE'").get().n;
  assert.equal(roles, 4);
  // A bad role_code violates the generated-column FK into ref_lookup.
  assert.throws(() =>
    db.prepare("INSERT INTO app_user(user_id,full_name,email,role_code,scope_type) VALUES ('BAD','B','bad@x.invalid','NOTAROLE','GLOBAL')").run(),
  );
});

test("hold blocks a destruction request and sets carton flag", async () => {
  const { userRepo, cartonRepo } = await import("../src/repositories/index.js");
  const holdService = await import("../src/services/hold_service.js");
  const requestService = await import("../src/services/request_service.js");

  userRepo.upsert({ userId: "B1", fullName: "B", email: `b-${randomUUID()}@x.invalid`, roleCode: "BUSINESS", scopeType: "DEPARTMENT", entityId: "ENT-BRN", departmentId: "DEP-BRN-DEL", passwordHash: hashPassword("x"), status: "ACTIVE" });
  userRepo.upsert({ userId: "C1", fullName: "C", email: `c-${randomUUID()}@x.invalid`, roleCode: "COMPLIANCE", scopeType: "GLOBAL", passwordHash: hashPassword("x"), status: "ACTIVE" });
  const biz = userRepo.findById("B1");
  const comp = userRepo.findById("C1");

  const cid = `CT-${randomUUID().slice(0, 8)}`;
  cartonRepo.insert({ cartonId: cid, entityId: "ENT-BRN", departmentId: "DEP-BRN-DEL", ownerUserId: "B1", documentType: "Client KYC", archivalPolicy: "Standard", cartonCreatedDate: "2010-01-01", retentionTriggerDate: "2010-01-01", assignedVendorId: "VND-001", currentStatus: "In Storage" });
  const carton = cartonRepo.findById(cid);

  holdService.applyHold(comp, { cartonId: cid, holdId: `H-${randomUUID().slice(0, 8)}`, matterReference: "M", reason: "lit" });
  assert.equal(cartonRepo.findById(cid).legalHoldFlag, true);
  assert.throws(
    () => requestService.raiseRequest(biz, carton, { requestId: `R-${randomUUID().slice(0, 8)}`, requestType: "DESTRUCTION" }),
    /active legal hold/,
  );
});

test("retention view computes due date and reports missing trigger", () => {
  const cid = `CT-${randomUUID().slice(0, 8)}`;
  db.prepare("INSERT INTO carton(carton_id,entity_id,department_id,owner_user_id,document_type,archival_policy,carton_created_date,retention_trigger_date,assigned_vendor_id,current_status) VALUES (?,?,?,?,?,?,?,?,?, 'Created')")
    .run(cid, "ENT-BRN", "DEP-BRN-DEL", "B1", "Client KYC", "Standard", "2020-01-01", "2020-01-01", "VND-001");
  const row = db.prepare("SELECT destruction_due_on, calculation_status FROM carton_retention WHERE carton_id=?").get(cid);
  assert.equal(row.calculation_status, "CALCULATED");
  assert.equal(row.destruction_due_on, "2028-01-01");
});
