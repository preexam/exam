const { db, admin, requiredEnv, safeEqualHex, webhookSignature, markPaymentSuccessful } = require("./_lib/razorpay");

export default async function handler(request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  if (!safeEqualHex(webhookSignature(rawBody), signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId = request.headers.get("x-razorpay-event-id") || "";
  if (eventId) {
    const eventRef = db.doc("razorpayWebhookEvents/" + eventId);
    const existing = await eventRef.get();
    if (existing.exists) return new Response("OK", { status: 200 });
    await eventRef.set({
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      event: event.event || ""
    });
  }

  try {
    const entity = event?.payload?.payment?.entity;
    const orderId = entity?.order_id;

    if (orderId && event.event === "payment.captured") {
      const paymentSnap = await db.doc("payments/" + orderId).get();
      if (paymentSnap.exists) {
        const payment = paymentSnap.data();
        await markPaymentSuccessful({
          applicationNumber: payment.applicationNumber,
          orderId,
          paymentId: entity.id,
          amountPaise: Number(entity.amount || 0),
          source: "webhook"
        });
      }
    } else if (orderId && event.event === "payment.failed") {
      const paymentRef = db.doc("payments/" + orderId);
      const paymentSnap = await paymentRef.get();
      if (paymentSnap.exists && paymentSnap.data().status !== "Successful") {
        await paymentRef.set({
          status: "Failed",
          transactionId: entity.id || "",
          paymentReference: entity.id || "",
          failureReason: entity.error_description || "",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("razorpayWebhook", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
