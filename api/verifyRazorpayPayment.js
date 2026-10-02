const { auth, db, requiredEnv, razorpayRequest, safeEqualHex, checkoutSignature, markPaymentSuccessful, corsHeadersFor } = require("./_lib/razorpay");

async function getUser(request, body = null) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : String(body?.idToken || "");
  if (!token) throw new Error("Authentication required.");
  return auth.verifyIdToken(token);
}

function json(data, status = 200, request) {
  return Response.json(data, { status, headers: corsHeadersFor(request) });
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeadersFor(request) });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeadersFor(request) });

  try {
    const body = await request.json();
    const user = await getUser(request, body);
    const applicationNumber = String(body?.applicationNumber || "").trim();
    const orderId = String(body?.orderId || "").trim();
    const paymentId = String(body?.paymentId || "").trim();
    const signature = String(body?.signature || "").trim();

    if (!applicationNumber || !orderId || !paymentId || !signature) {
      return json({ error: "Payment verification data is incomplete." }, 400, request);
    }

    const appSnap = await db.doc("applications/" + applicationNumber).get();
    if (!appSnap.exists || appSnap.data().authUid !== user.uid) {
      return json({ error: "Application access denied." }, 403, request);
    }

    const app = appSnap.data();
    const storedExamId = app.examId || "default";
    let examId = storedExamId;
    if (storedExamId === "default") {
      const settingsSnap = await db.doc("settings/portal").get();
      const activeExamId = settingsSnap.exists ? settingsSnap.data().activeExamId : null;
      if (activeExamId && activeExamId !== "default") examId = String(activeExamId);
    }
    if (app.paymentOrderId !== orderId) {
      return json({ error: "This payment order is not linked to the application." }, 412, request);
    }
    if (app.paymentStatus === "Successful") return json({ success: true, status: "Successful" }, 200, request);

    const expectedSignature = checkoutSignature(orderId, paymentId);
    if (!safeEqualHex(expectedSignature, signature)) {
      return json({ error: "Payment signature verification failed." }, 403, request);
    }

    const payment = await razorpayRequest("/payments/" + encodeURIComponent(paymentId), { method: "GET" });
    const examSnap = await db.doc("exams/" + examId).get();
    const expectedAmount = Math.round(Number(examSnap.exists ? examSnap.data().fee : 0) * 100);

    if (payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== expectedAmount) {
      return json({ error: "Payment is not captured or the amount does not match." }, 412, request);
    }

    await markPaymentSuccessful({
      applicationNumber,
      orderId,
      paymentId,
      amountPaise: Number(payment.amount),
      signature,
      source: "checkout"
    });

    return json({ success: true, status: "Successful", paymentId }, 200, request);
  } catch (error) {
    console.error("verifyRazorpayPayment", error);
    const message = error?.message || "Payment verification failed.";
    return json({ error: message }, message === "Authentication required." ? 401 : 500, request);
  }
}
