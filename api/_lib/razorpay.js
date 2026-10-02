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

function paymentWindowOpen(exam) {
  const end = exam?.paymentEndMs != null
    ? Number(exam.paymentEndMs)
    : exam?.paymentEnd
      ? new Date(exam.paymentEnd).getTime()
      : null;
  return end == null || (!Number.isNaN(end) && Date.now() <= end);
}

async function markPaymentSuccessful({ applicationNumber, orderId, paymentId, amountPaise, signature = null, source }) {
  const appRef = db.doc("applications/" + applicationNumber);
  const paymentRef = db.doc("payments/" + orderId);

  await db.runTransaction(async tx => {
    const appSnap = await tx.get(appRef);
    const paymentSnap = await tx.get(paymentRef);
    if (!appSnap.exists) throw new Error("Application not found.");
    const app = appSnap.data();

    if (app.paymentStatus === "Successful") return;
    if (app.paymentOrderId !== orderId) throw new Error("Payment order does not match the application.");

    let examId = app.examId || "default"; if(examId === "default"){const settingsSnap = await tx.get(db.doc("settings/portal")); const activeExamId = settingsSnap.exists ? settingsSnap.data().activeExamId : null; if(activeExamId && activeExamId !== "default") examId = String(activeExamId);} const examSnap = await tx.get(db.doc("exams/" + examId));
    const exam = examSnap.exists ? examSnap.data() : {};
    const expected = Math.round(Number(exam.fee || 0) * 100);
    if (expected <= 0 || Number(amountPaise) !== expected) {
      throw new Error("Payment amount does not match the configured application fee.");
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
  markPaymentSuccessful
};
