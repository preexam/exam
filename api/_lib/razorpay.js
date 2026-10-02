const crypto = require("crypto");
const { admin, db, auth } = require("./firebase-admin");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + " is not configured.");
  return value;
}

function razorpayAuthHeader() {
  const id = requiredEnv("RAZORPAY_KEY_ID");
  const secret = requiredEnv("RAZORPAY_KEY_SECRET");
  return "Basic " + Buffer.from(id + ":" + secret).toString("base64");
}

async function razorpayRequest(path, options = {}) {
  const response = await fetch("https://api.razorpay.com/v1" + path, {
    ...options,
    headers: {
      Authorization: razorpayAuthHeader(),
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { description: text } }; }
  if (!response.ok) throw new Error(data?.error?.description || "Razorpay API request failed.");
  return data;
}

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); } catch { return false; }
}

function checkoutSignature(orderId, paymentId) {
  return crypto.createHmac("sha256", requiredEnv("RAZORPAY_KEY_SECRET")).update(orderId + "|" + paymentId).digest("hex");
}

function webhookSignature(rawBody) {
  return crypto.createHmac("sha256", requiredEnv("RAZORPAY_WEBHOOK_SECRET")).update(rawBody).digest("hex");
}

const corsHeaders = {
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const allowedCorsOrigins = new Set([
  "https://preexam.github.io",
  "https://bookesh.co",
  "https://www.bookesh.co"
]);

function corsHeadersFor(request) {
  const origin = request?.headers?.get ? request.headers.get("origin") : (request?.headers?.origin || "");
  const headers = { ...corsHeaders, Vary: "Origin" };
  if (allowedCorsOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function paymentWindowOpen(exam) {
  const end = exam?.paymentEndMs != null
    ? Number(exam.paymentEndMs)
    : exam?.paymentEnd
      ? new Date(exam.paymentEnd).getTime()
      : null;
  return end == null || (!Number.isNaN(end) && Date.now() <= end);
}

function timestampMs(value) {
  if (!value) return NaN;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number(value) : parsed;
}

function examStartMs(exam) {
  return Number(exam.applicationStartMs) || timestampMs(exam.applicationStart);
}

function examEndMs(exam) {
  return Number(exam.applicationEndMs) || timestampMs(exam.applicationEnd);
}

async function resolveExamForApplication(app) {
  const storedExamId = String(app?.examId || "default");
  const tryIds = [];

  // An existing application's exam assignment is immutable for payment purposes.
  // Only legacy applications without an examId use the current active exam.
  if (storedExamId !== "default") {
    tryIds.push(storedExamId);
  } else {
    const settingsSnap = await db.doc("settings/portal").get();
    const activeExamId = settingsSnap.exists ? String(settingsSnap.data().activeExamId || "") : "";
    if (activeExamId && activeExamId !== "default") tryIds.push(activeExamId);
  }

  for (const id of tryIds) {
    const snap = await db.doc("exams/" + id).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
  }

  if (storedExamId !== "default") return null;

  const examsSnap = await db.collection("exams").get();
  const createdAtMs = timestampMs(app?.createdAt);
  const candidates = examsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(exam => exam.status !== "Closed" && exam.status !== "Archived")
    .filter(exam => {
      const start = examStartMs(exam);
      const end = examEndMs(exam);
      return Number.isNaN(createdAtMs) || ((!start || createdAtMs >= start) && (!end || createdAtMs <= end));
    })
    .sort((a, b) => (examStartMs(b) || 0) - (examStartMs(a) || 0));

  if (candidates.length) return candidates[0];

  const fallback = examsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(exam => exam.status !== "Closed" && exam.status !== "Archived")
    .sort((a, b) => (examStartMs(b) || 0) - (examStartMs(a) || 0));

  return fallback[0] || null;
}

async function markPaymentSuccessful({ applicationNumber, orderId, paymentId, amountPaise, signature = null, source, examId = null }) {
  const appRef = db.doc("applications/" + applicationNumber);
  const paymentRef = db.doc("payments/" + orderId);

  let resolvedExamId = examId ? String(examId) : "";

  await db.runTransaction(async tx => {
    const appSnap = await tx.get(appRef);
    const paymentSnap = await tx.get(paymentRef);
    if (!appSnap.exists) throw new Error("Application not found.");
    const app = appSnap.data();

    if (app.paymentStatus === "Successful") return;
    if (app.paymentOrderId !== orderId) throw new Error("Payment order does not match the application.");

    const paymentData = paymentSnap.exists ? paymentSnap.data() : null;
    const expected = Number(paymentData?.amountPaise || app.paymentOrderAmount || 0);
    if (!paymentData || expected <= 0 || Number(amountPaise) !== expected) {
      throw new Error("Payment amount does not match the stored payment order.");
    }

    resolvedExamId = resolvedExamId || String(paymentData?.examId || app.examId || "");
    if (resolvedExamId) {
      const examSnap = await tx.get(db.doc("exams/" + resolvedExamId));
      if (!examSnap.exists) throw new Error("Exam configuration not found.");
    }

    tx.set(paymentRef, {
      applicationNumber,
      authUid: app.authUid || "",
      gateway: "razorpay",
      orderId,
      transactionId: paymentId,
      paymentReference: paymentId,
      amount: Number((Number(amountPaise) / 100).toFixed(2)),
      amountPaise: Number(amountPaise),
      currency: "INR",
      status: "Successful",
      verificationSource: source,
      signature: source === "checkout" ? signature : null,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: paymentSnap.exists
        ? (paymentSnap.data().createdAt || admin.firestore.FieldValue.serverTimestamp())
        : admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    tx.update(appRef, {
      paymentStatus: "Successful",
      paymentOrderId: orderId,
      paymentId,
      paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
}

module.exports = {
  admin,
  auth,
  db,
  requiredEnv,
  razorpayRequest,
  safeEqualHex,
  checkoutSignature,
  webhookSignature,
  paymentWindowOpen,
  resolveExamForApplication,
  markPaymentSuccessful,
  corsHeaders,
  corsHeadersFor
};
