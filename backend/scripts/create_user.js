// Provision (or update) an application user with a hashed password.
// Imported identities have NULL password_hash until set here.
//
// Usage:
//   node --experimental-sqlite scripts/create_user.js \
//     --id U-BIZ --name "Dina Business" --email dina@example.com --role BUSINESS \
//     --password demo --entity ENT-BRN --department DEP-BRN-DEL
import { provisionUser } from "../src/services/auth_service.js";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    out[key] = argv[i + 1];
  }
  return out;
}

const a = parseArgs(process.argv);
const required = ["id", "name", "email", "role", "password"];
for (const r of required) {
  if (!a[r]) {
    console.error(`Missing --${r}`);
    process.exit(1);
  }
}

const user = provisionUser({
  userId: a.id,
  fullName: a.name,
  email: a.email,
  roleCode: a.role,
  entityId: a.entity ?? null,
  departmentId: a.department ?? null,
  vendorId: a.vendor ?? null,
  password: a.password,
});
console.log(`Provisioned user ${user.user_id} (${user.role_code}).`);
