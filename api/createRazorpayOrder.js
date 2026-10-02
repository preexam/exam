const { auth, db, admin, requiredEnv, razorpayRequest, paymentWindowOpen, resolveExamForApplication, corsHeadersFor } = require("./_lib/razorpay");

async function getUser(req, body = {}) {
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : String(body?.idToken || "");
  if (!token) throw new Error("Authentication required.");
  return auth.verifyIdToken(token);
}

function json(res, data, status, req) {
  res.statusCode = status;
  Object.entries(corsHeadersFor(req)).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  Object.entries(corsHeadersFor(req)).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") return json(res, { error: "Method Not Allowed" }, 405, req);

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const user = await getUser(req, body);
    const applicationNumber = String(body?.applicationNumber || "").trim();
    if (!applicationNumber) return json(res, { error: "Application number is required." }, 400, req);

    const appRef = db.doc("applications/" + applicationNumber);
    const appSnap = await appRef.get();
    if (!appSnap.exists || appSnap.data().authUid !== user.uid) {
      return json(res, { error: "Application access denied." }, 403, req);
    }

    const app = appSnap.data();
    if (app.paymentStatus === "Successful") return json(res, { error: "Payment is already successful." }, 409, req);

    const exam = await resolveExamForApplication(app);
    if (!exam) return json(res, { error: "Exam configuration not found." }, 412, req);

    if (exam.paymentRequired === false) return json(res, { required: false }, 200, req);
    if (!paymentWindowOpen(exam)) return json(res, { error: "The payment window has closed." }, 412, req);

    const amountPaise = Math.round(Number(exam.fee || 0) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return json(res, { error: "Application fee is not configured." }, 412, req);
    }

    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: applicationNumber,
        notes: { applicationNumber, examId: exam.id }
      })
    });

    await db.runTransaction(async tx => {
      const fresh = await tx.get(appRef);
      if (!fresh.exists || fresh.data().authUid !== user.uid) throw new Error("Application changed or access denied.");
      tx.update(appRef, {
        examId: exam.id,
        paymentOrderId: order.id,
        paymentOrderAmount: amountPaise,
        paymentOrderCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      tx.set(db.doc("payments/" + order.id), {
        applicationNumber,
        authUid: user.uid,
        gateway: "razorpay",
        orderId: order.id,
        examId: exam.id,
        amount: Number((amountPaise / 100).toFixed(2)),
        amountPaise,
        currency: "INR",
        status: "Pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return json(res, {
      required: true,
      keyId: requiredEnv("RAZORPAY_KEY_ID"),
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      description: "Application Fee - " + applicationNumber
    }, 200, req);
  } catch (error) {
    console.error("createRazorpayOrder", error);
    const message = error?.message || "Unable to create payment order.";
    return json(res, { error: message }, message === "Authentication required." ? 401 : 500, req);
  }
};
