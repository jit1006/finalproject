// Route registration. Handlers translate HTTP <-> services only; no business
// logic here. `ctx` carries { req, res, params, body, cookies, user? }.
import { config } from "../config.js";
import { AppError, forbidden, notFound } from "../errors.js";
import { Router } from "./router.js";
import * as authService from "../services/auth_service.js";
import * as cartonService from "../services/carton_service.js";
import * as requestService from "../services/request_service.js";
import * as holdService from "../services/hold_service.js";
import * as reconService from "../services/recon_service.js";
import * as scope from "../services/scope.js";
import { cartonRepo, eventRepo, requestRepo } from "../repositories/index.js";
import { AppUser, Carton, Request, LegalHold, ReconException } from "../models/index.js";
import { db } from "../db/connection.js";

export const router = new Router();

// --- helpers ---
function requireUser(ctx) {
  const raw = ctx.cookies[config.sessionCookieName];
  const user = authService.resolveSession(raw); // throws 401 if invalid
  ctx.user = user;
  return user;
}
function requireRoles(ctx, ...roles) {
  const user = requireUser(ctx);
  if (!roles.includes(user.roleCode)) throw forbidden(`Requires role in ${roles.join(", ")}`);
  return user;
}
function getCartonScoped(ctx, cartonId) {
  const carton = cartonRepo.findById(cartonId);
  if (!carton) throw notFound(`Carton ${cartonId} not found`);
  scope.assertCanViewCarton(ctx.user, carton);
  return carton;
}
function setSessionCookie(ctx, raw) {
  const attrs = [
    `${config.sessionCookieName}=${raw}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${config.sessionTtlMinutes * 60}`,
  ];
  if (config.secureCookies) attrs.push("Secure");
  ctx.res.setHeader("Set-Cookie", attrs.join("; "));
}

// --- auth ---
router.post("/api/v1/auth/login", (ctx) => {
  const user = authService.authenticate(ctx.body.email, ctx.body.password);
  const raw = authService.createSession(user);
  setSessionCookie(ctx, raw);
  return { status: 200, body: AppUser.toPublic(user) };
});

router.post("/api/v1/auth/logout", (ctx) => {
  authService.revokeSession(ctx.cookies[config.sessionCookieName]);
  ctx.res.setHeader("Set-Cookie", `${config.sessionCookieName}=; Path=/; Max-Age=0`);
  return { status: 200, body: { ok: true } };
});

router.get("/api/v1/auth/me", (ctx) => {
  const user = requireUser(ctx);
  return { status: 200, body: AppUser.toPublic(user) };
});

// --- cartons ---
router.post("/api/v1/cartons", (ctx) => {
  const user = requireRoles(ctx, "BUSINESS");
  const b = ctx.body;
  const carton = cartonService.registerCarton(user, {
    cartonId: b.carton_id,
    documentType: b.document_type,
    archivalPolicy: b.archival_policy,
    cartonCreatedDate: b.carton_created_date,
    assignedVendorId: b.assigned_vendor_id,
    retentionTriggerDate: b.retention_trigger_date ?? null,
    declaredFileCount: b.declared_file_count ?? null,
    barcode: b.barcode ?? null,
    remarks: b.remarks ?? null,
  });
  return { status: 201, body: Carton.toPublic(carton) };
});

router.get("/api/v1/cartons/:cartonId", (ctx) => {
  requireUser(ctx);
  return { status: 200, body: Carton.toPublic(getCartonScoped(ctx, ctx.params.cartonId)) };
});

router.post("/api/v1/cartons/:cartonId/files", (ctx) => {
  const user = requireRoles(ctx, "BUSINESS");
  const carton = getCartonScoped(ctx, ctx.params.cartonId);
  scope.assertCanRaiseForCarton(user, carton);
  const b = ctx.body;
  const result = cartonService.indexFile(user, carton, {
    fileId: b.file_id,
    fileRef: b.file_ref,
    documentType: b.document_type,
    fileDescription: b.file_description ?? null,
    documentYear: b.document_year ?? null,
    containsPii: b.contains_pii ?? true,
  });
  return { status: 201, body: result };
});

router.get("/api/v1/cartons/:cartonId/files", (ctx) => {
  const user = requireUser(ctx);
  const carton = getCartonScoped(ctx, ctx.params.cartonId);
  if (user.roleCode === "VENDOR") throw forbidden("Vendor users cannot view carton contents");
  const files = cartonService.listFiles(carton.cartonId).map((f) => ({
    file_id: f.fileId, file_ref: f.fileRef, document_type: f.documentType,
    file_description: f.fileDescription, document_year: f.documentYear,
  }));
  return { status: 200, body: files };
});

router.get("/api/v1/cartons/:cartonId/history", (ctx) => {
  requireUser(ctx);
  const carton = getCartonScoped(ctx, ctx.params.cartonId);
  // State is denormalized onto the carton row in the 16-table design.
  return {
    status: 200,
    body: {
      state: {
        cartonId: carton.cartonId,
        status: carton.currentStatus,
        currentLocationId: carton.currentLocationId,
        legalHoldFlag: carton.legalHoldFlag,
      },
      events: eventRepo.history(ctx.params.cartonId),
    },
  };
});

router.get("/api/v1/cartons/:cartonId/retention", (ctx) => {
  requireUser(ctx);
  getCartonScoped(ctx, ctx.params.cartonId);
  const r = cartonService.retention(ctx.params.cartonId);
  if (!r) throw notFound("No retention row for carton");
  return { status: 200, body: r };
});

// --- requests ---
router.post("/api/v1/requests", (ctx) => {
  const user = requireRoles(ctx, "BUSINESS");
  const carton = getCartonScoped(ctx, ctx.body.carton_id);
  const req = requestService.raiseRequest(user, carton, {
    requestId: ctx.body.request_id,
    requestType: ctx.body.request_type,
  });
  return { status: 201, body: Request.toPublic(req) };
});

router.get("/api/v1/requests/queue", (ctx) => {
  const user = requireRoles(ctx, "VENDOR");
  return { status: 200, body: requestService.listVendorQueue(user.vendorId).map(Request.toPublic) };
});

const vendorAction = (eventType, markCompleted) => (ctx) => {
  const user = requireRoles(ctx, "VENDOR");
  const req = requestService.vendorAction(user, { requestId: ctx.params.requestId, eventType, markCompleted });
  return { status: 200, body: Request.toPublic(req) };
};
router.post("/api/v1/requests/:requestId/acknowledge", vendorAction("REQUEST_ACKNOWLEDGED", false));
router.post("/api/v1/requests/:requestId/collect", vendorAction("PICKED_UP_BY_VENDOR", false));
router.post("/api/v1/requests/:requestId/receive", vendorAction("RECEIVED_AT_WAREHOUSE", true));
router.post("/api/v1/requests/:requestId/deliver", vendorAction("DELIVERED_TO_BUSINESS", true));

router.post("/api/v1/requests/:requestId/approve", (ctx) => {
  const user = requireRoles(ctx, "COMPLIANCE");
  return { status: 200, body: Request.toPublic(requestService.approveDestruction(user, ctx.params.requestId)) };
});
router.post("/api/v1/requests/:requestId/destroy", (ctx) => {
  const user = requireRoles(ctx, "VENDOR");
  return { status: 200, body: Request.toPublic(requestService.executeDestruction(user, ctx.params.requestId)) };
});

router.get("/api/v1/requests/pending-approvals", (ctx) => {
  requireRoles(ctx, "COMPLIANCE");
  return { status: 200, body: requestService.listPendingApproval().map(Request.toPublic) };
});

router.get("/api/v1/cartons/:cartonId/requests", (ctx) => {
  requireUser(ctx);
  getCartonScoped(ctx, ctx.params.cartonId);
  return { status: 200, body: requestService.listForCarton(ctx.params.cartonId).map(Request.toPublic) };
});

// --- holds ---
router.get("/api/v1/holds", (ctx) => {
  requireUser(ctx);
  const activeOnly = new URL(ctx.req.url, "http://x").searchParams.get("active_only") === "true";
  return { status: 200, body: holdService.listHolds(activeOnly).map(LegalHold.toPublic) };
});
router.post("/api/v1/holds", (ctx) => {
  const user = requireRoles(ctx, "COMPLIANCE");
  const b = ctx.body;
  const hold = holdService.applyHold(user, {
    cartonId: b.carton_id, holdId: b.hold_id, matterReference: b.matter_reference, reason: b.reason,
  });
  return { status: 201, body: { hold_id: hold.holdId } };
});
router.post("/api/v1/holds/:holdId/release", (ctx) => {
  const user = requireRoles(ctx, "COMPLIANCE");
  const hold = holdService.releaseHold(user, ctx.params.holdId, ctx.body.reason);
  return { status: 200, body: { hold_id: hold.holdId, hold_release_date: hold.holdReleaseDate } };
});

// --- reconciliation & exceptions ---
router.post("/api/v1/reconciliations", (ctx) => {
  const user = requireRoles(ctx, "FACILITIES");
  const b = ctx.body;
  return { status: 201, body: reconService.startRun(user, { runKind: b.run_kind, scopeKey: b.scope_key, parameters: b.parameters ?? {} }) };
});
router.get("/api/v1/reconciliations", (ctx) => {
  requireRoles(ctx, "FACILITIES");
  return { status: 200, body: reconService.listRuns().map((x)=>x) };
});
router.get("/api/v1/exceptions", (ctx) => {
  const user = requireUser(ctx);
  return { status: 200, body: reconService.listExceptions(user).map(ReconException.toPublic) };
});

// --- dashboard & reference ---
router.get("/api/v1/dashboard", (ctx) => {
  const user = requireUser(ctx);
  const scopeArgs = { role: user.roleCode, entityId: user.entityId, departmentId: user.departmentId, vendorId: user.vendorId };
  return {
    status: 200,
    body: {
      role: user.roleCode,
      totalCartons: cartonRepo.totalCartons(scopeArgs),
      totalRequests: requestRepo.countForUser({ role: user.roleCode, userId: user.userId, vendorId: user.vendorId }),
      cartonsByStatus: cartonRepo.countsByStatus(scopeArgs),
    },
  };
});
router.get("/api/v1/reference-data/vendors", (ctx) => {
  requireUser(ctx);
  const rows = db.prepare("SELECT vendor_id, vendor_name, status FROM vendor ORDER BY vendor_id").all();
  return { status: 200, body: rows };
});


