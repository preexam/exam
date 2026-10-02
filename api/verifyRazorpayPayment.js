const { auth, db, requiredEnv, razorpayRequest, safeEqualHex, checkoutSignature, markPaymentSuccessful, corsHeaders } = require("./_lib/razorpay");

async function getUser(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("Authentication required.");
  return auth.verifyIdToken(header.slice(7));
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  try {
    const user = await getUser(request);
    const body = await request.json();
    const applicationNumber = String(body?.applicationNumber || "").trim();
    const orderId = String(body?.orderId || "").trim();
    const paymentId = String(body?.paymentId || "").trim();
    const signature = String(body?.signature || "").trim();

    if (!applicationNumber || !orderId || !paymentId || !signature) {
      return json({ error: "Payment verification data is incomplete." }, 400);
    }

    const appSnap = await db.doc("applications/" + applicationNumber).get();
    if (!appSnap.exists || appSnap.data().authUid !== user.uid) {
      return json({ error: "Application access denied." }, 403);
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
      return json({ error: "This payment order is not linked to the application." }, 412);
    }
    if (app.paymentStatus === "Successful") return json({ success: true, status: "Successful" });

    const expectedSignature = checkoutSignature(orderId, paymentId);
    if (!safeEqualHex(expectedSignature, signature)) {
      return json({ error: "Payment signature verification failed." }, 403);
    }

    const payment = await razorpayRequest("/payments/" + encodeURIComponent(paymentId), { method: "GET" });
    const examSnap = await db.doc("exams/" + examId).get();
    const expectedAmount = Math.round(Number(examSnap.exists ? examSnap.data().fee : 0) * 100);

    if (payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== expectedAmount) {
      return json({ error: "Payment is not captured or the amount does not match." }, 412);
    }

    await markPaymentSuccessful({
      applicationNumber,
      orderId,
      paymentId,
      amountPaise: Number(payment.amount),
      signature,
      source: "checkout"
    });

    return json({ success: true, status: "Successful", paymentId });
  } catch (error) {
    console.error("verifyRazorpayPayment", error);
    const message = error?.message || "Payment verification failed.";
    return json({ error: message }, message === "Authentication required." ? 401 : 500);
  }
}
