const { db, admin, safeEqualHex, webhookSignature, markPaymentSuccessful } = require("./_lib/razorpay");

// Razorpay signs the exact raw request body. Vercel's Node runtime must not
// parse the body before this handler reads it.
module.exports.config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = String(req.headers?.["x-razorpay-signature"] || "");

    if (!safeEqualHex(webhookSignature(rawBody), signature)) {
      res.statusCode = 401;
      res.end("Invalid signature");
      return;
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      res.statusCode = 400;
      res.end("Invalid JSON");
      return;
    }

    const eventId = String(req.headers?.["x-razorpay-event-id"] || "");
    const eventRef = eventId ? db.doc("razorpayWebhookEvents/" + eventId) : null;

    if (eventRef) {
      const existing = await eventRef.get();
      if (existing.exists && existing.data()?.status === "Processed") {
        res.statusCode = 200;
        res.end("OK");
        return;
      }
    }

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
          source: "webhook",
          examId: payment.examId || null
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

    if (eventRef) {
      await eventRef.set({
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        event: event.event || "",
        status: "Processed"
      }, { merge: true });
    }

    res.statusCode = 200;
    res.end("OK");
  } catch (error) {
    console.error("razorpayWebhook", error);
    res.statusCode = 500;
    res.end("Webhook processing failed");
  }
};
