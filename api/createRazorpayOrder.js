const { auth, db, admin, requiredEnv, razorpayRequest, paymentWindowOpen, corsHeaders } = require("./_lib/razorpay");

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
    if (!applicationNumber) return Response.json({ error: "Application number is required." }, { status: 400, headers: corsHeaders }), { headers: corsHeaders });

    const appRef = db.doc("applications/" + applicationNumber);
    const appSnap = await appRef.get();
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
    if (app.paymentStatus === "Successful") {
      return Response.json({ error: "Payment is already successful." }, { status: 409, headers: corsHeaders }), { headers: corsHeaders });
    }

    const examSnap = await db.doc("exams/" + examId).get();
    if (!examSnap.exists) return Response.json({ error: "Exam configuration not found." }, { status: 412, headers: corsHeaders }), { headers: corsHeaders });
    const exam = examSnap.data();

    if (exam.paymentRequired === false) return Response.json({ required: false }), { headers: corsHeaders });
    if (!paymentWindowOpen(exam)) return Response.json({ error: "The payment window has closed." }, { status: 412, headers: corsHeaders }), { headers: corsHeaders });

    const amountPaise = Math.round(Number(exam.fee || 0) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return Response.json({ error: "Application fee is not configured." }, { status: 412, headers: corsHeaders }), { headers: corsHeaders });
    }

    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: applicationNumber,
        notes: { applicationNumber, examId }
      })
    });

    await db.runTransaction(async tx => {
      const fresh = await tx.get(appRef);
      if (!fresh.exists || fresh.data().authUid !== user.uid) throw new Error("Application changed or access denied.");
      tx.update(appRef, {
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
        amount: Number((amountPaise / 100).toFixed(2)),
        amountPaise,
        currency: "INR",
        status: "Pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return Response.json({
      required: true,
      keyId: requiredEnv("RAZORPAY_KEY_ID"),
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      description: "Application Fee - " + applicationNumber
    }), { headers: corsHeaders });
  } catch (error) {
    console.error("createRazorpayOrder", error);
    const message = error?.message || "Unable to create payment order.";
    return Response.json({ error: message }, { status: message === "Authentication required." ? 401 : 500 }), { headers: corsHeaders });
  }
}
