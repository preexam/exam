const { auth, db, admin, requiredEnv, razorpayRequest, paymentWindowOpen, corsHeaders } = require("./_lib/razorpay");

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
    if (!applicationNumber) return json({ error: "Application number is required." }, 400);

    const appRef = db.doc("applications/" + applicationNumber);
    const appSnap = await appRef.get();
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
    if (app.paymentStatus === "Successful") {
      return json({ error: "Payment is already successful." }, 409);
    }

    const examSnap = await db.doc("exams/" + examId).get();
    if (!examSnap.exists) return json({ error: "Exam configuration not found." }, 412);
    const exam = examSnap.data();

    if (exam.paymentRequired === false) return json({ required: false });
    if (!paymentWindowOpen(exam)) return json({ error: "The payment window has closed." }, 412);

    const amountPaise = Math.round(Number(exam.fee || 0) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return json({ error: "Application fee is not configured." }, 412);
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

    return json({
      required: true,
      keyId: requiredEnv("RAZORPAY_KEY_ID"),
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      description: "Application Fee - " + applicationNumber
    });
  } catch (error) {
    console.error("createRazorpayOrder", error);
    const message = error?.message || "Unable to create payment order.";
    return json({ error: message }, message === "Authentication required." ? 401 : 500);
  }
}
