const admin = require("firebase-admin");

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!value.project_id || !value.client_email || !value.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing required service-account fields.");
  }
  return {
    projectId: value.project_id,
    clientEmail: value.client_email,
    privateKey: String(value.private_key).replace(/\\n/g, "\n")
  };
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(getServiceAccount()) });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
