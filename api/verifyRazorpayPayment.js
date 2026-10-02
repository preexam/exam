const { auth, db, requiredEnv, razorpayRequest, safeEqualHex, checkoutSignature, markPaymentSuccessful, corsHeaders } = require("./_lib/razorpay");

async function getUser(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("Authentication required.");
  return auth.verifyIdToken(header.slice(7));
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
      return Response.json({ error: "Payment verification data is incomplete." }, { status: 400, headers: corsHeaders }), { headers: corsHeaders });
    }

    const appSnap = await db.doc("applications/" + applicationNumber).get();
    if (!appSnap.exists || appSnap.data().authUid !== user.uid) {
      return Response.json({ error: "Application access denied." }, { status: 403, headers: corsHeaders }), { headers: corsHeaders });
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
      return Response.json({ error: "This payment order is not linked to the application." }, { status: 412, headers: corsHeaders }), { headers: corsHeaders });
    }
    if (app.paymentStatus === "Successful") return Response.json({ success: true, status: "Successful" }), { headers: corsHeaders });

    const expectedSignature = checkoutSignature(orderId, paymentId);
    if (!safeEqualHex(expectedSignature, signature)) {
      return Response.json({ error: "Payment signature verification failed." }, { status: 403, headers: corsHeaders }), { headers: corsHeaders });
    }

    const payment = await razorpayRequest("/payments/" + encodeURIComponent(paymentId), { method: "GET" });
    const examSnap = await db.doc("exams/" + examId).get();
    const expectedAmount = Math.round(Number(examSnap.exists ? examSnap.data().fee : 0) * 100);

    if (payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== expectedAmount) {
      return Response.json({ error: "Payment is not captured or the amount does not match." }, { status: 412, headers: corsHeaders }), { headers: corsHeaders });
    }

    await markPaymentSuccessful({
      applicationNumber,
      orderId,
      paymentId,
      amountPaise: Number(payment.amount),
      signature,
      source: "checkout"
    });

    return Response.json({ success: true, status: "Successful", paymentId }), { headers: corsHeaders });
  } catch (error) {
    console.error("verifyRazorpayPayment", error);
    const message = error?.message || "Payment verification failed.";
    return Response.json({ error: message }, { status: message === "Authentication required." ? 401 : 500 }), { headers: corsHeaders });
  }
}
