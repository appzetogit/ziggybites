/**
 * Firebase Realtime Database - Setup Check
 * Run: node scripts/check-firebase-realtime.js
 * (from backend directory: node scripts/check-firebase-realtime.js)
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

console.log("\n🔍 Firebase Realtime Database - Setup Check\n");
console.log("=".repeat(50));

const checks = [];
let allOk = true;

// 1. Check .env variables
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const databaseUrl = process.env.FIREBASE_DATABASE_URL;

if (projectId && clientEmail && privateKey) {
  checks.push({ ok: true, msg: "✅ .env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY are set" });
} else {
  allOk = false;
  const missing = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
  checks.push({ ok: false, msg: `❌ .env: Missing ${missing.join(", ")}` });
}

if (databaseUrl) {
  checks.push({ ok: true, msg: `✅ .env: FIREBASE_DATABASE_URL = ${databaseUrl}` });
} else {
  checks.push({ ok: true, msg: "⚠️  .env: FIREBASE_DATABASE_URL not set (will use default: tastizoo Asia Southeast 1)" });
}

// 2. Check service account JSON files
const jsonPaths = [
  path.join(backendRoot, "config", "serviceAccountKey.json"),
  path.join(backendRoot, "config", "tastizoo-default-rtdb-firebase-adminsdk.json"),
  path.join(backendRoot, "config", "zomato-607fa-firebase-adminsdk-fbsvc-f5f782c2cc.json"),
  path.join(backendRoot, "firebaseconfig.json"),
];

let foundJson = false;
for (const p of jsonPaths) {
  if (fs.existsSync(p)) {
    try {
      const json = JSON.parse(fs.readFileSync(p, "utf-8"));
      const hasRequired = json.project_id && json.client_email && json.private_key;
      if (hasRequired) {
        checks.push({ ok: true, msg: `✅ Service account file found: ${path.basename(p)}` });
        foundJson = true;
        break;
      }
    } catch (e) {
      checks.push({ ok: false, msg: `❌ Invalid JSON in ${path.basename(p)}` });
      allOk = false;
    }
  }
}

if (!foundJson && !(projectId && clientEmail && privateKey)) {
  checks.push({
    ok: false,
    msg: "❌ No service account file found in config/ (serviceAccountKey.json, etc.)",
  });
  allOk = false;
}

// 3. Summary
checks.forEach((c) => console.log(c.msg));

console.log("\n" + "=".repeat(50));
if (allOk) {
  console.log("✅ All checks passed. Firebase Realtime DB should initialize on server start.\n");
} else {
  console.log("❌ Setup incomplete. To enable Firebase Realtime Database:\n");
  console.log("Option A - Service Account JSON:");
  console.log("  1. Firebase Console → Project Settings → Service Accounts");
  console.log("  2. Generate new private key → Download JSON");
  console.log("  3. Save as backend/config/serviceAccountKey.json\n");
  console.log("Option B - Environment variables in .env:");
  console.log("  FIREBASE_PROJECT_ID=your-project-id");
  console.log("  FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com");
  console.log("  FIREBASE_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n\"");
  console.log("  FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app\n");
  console.log("Also create a Realtime Database in Firebase Console if not done:\n");
  console.log("  Firebase Console → Build → Realtime Database → Create Database\n");
}
