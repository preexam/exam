const { auth, db, requiredEnv, razorpayRequest, safeEqualHex, checkoutSignature, resolveExamForApplication, markPaymentSuccessful, corsHeadersFor } = require("./_lib/razorpay");

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
    const orderId = String(body?.orderId || "").trim();
    const paymentId = String(body?.paymentId || "").trim();
    const signature = String(body?.signature || "").trim();

    if (!applicationNumber || !orderId || !paymentId || !signature) {
      return json(res, { error: "Payment verification data is incomplete." }, 400, req);
    }

    const appSnap = await db.doc("applications/" + applicationNumber).get();
    if (!appSnap.exists || appSnap.data().authUid !== user.uid) {
      return json(res, { error: "Application access denied." }, 403, req);
    }

    const app = appSnap.data();
    if (app.paymentOrderId !== orderId) return json(res, { error: "This payment order is not linked to the application." }, 412, req);
    if (app.paymentStatus === "Successful") return json(res, { success: true, status: "Successful" }, 200, req);

    const exam = await resolveExamForApplication(app);
    if (!exam) return json(res, { error: "Exam configuration not found." }, 412, req);

    const expectedSignature = checkoutSignature(orderId, paymentId);
    if (!safeEqualHex(expectedSignature, signature)) {
      return json(res, { error: "Payment signature verification failed." }, 403, req);
    }

    const payment = await razorpayRequest("/payments/" + encodeURIComponent(paymentId), { method: "GET" });
    const expectedAmount = Math.round(Number(exam.fee || 0) * 100);

    if (payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== expectedAmount) {
      return json(res, { error: "Payment is not captured or the amount does not match." }, 412, req);
    }

    await markPaymentSuccessful({
      applicationNumber,
      orderId,
      paymentId,
      amountPaise: Number(payment.amount),
      signature,
      source: "checkout",
      examId: exam.id
    });

    return json(res, { success: true, status: "Successful", paymentId }, 200, req);
  } catch (error) {
    console.error("verifyRazorpayPayment", error);
    const message = error?.message || "Payment verification failed.";
    return json(res, { error: message }, message === "Authentication required." ? 401 : 500, req);
  }
};
