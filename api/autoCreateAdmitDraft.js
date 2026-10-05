const { admin, db, auth, corsHeadersFor, resolveExamForApplication } = require("./_lib/razorpay");

function json(res, data, status, req) {
  res.statusCode = status;
  Object.entries(corsHeadersFor(req)).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = async function handler(req, res) {
  Object.entries(corsHeadersFor(req)).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") return json(res, { error: "Method Not Allowed" }, 405, req);

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const header = req.headers?.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : String(body?.idToken || "");
    if (!token) return json(res, { error: "Authentication required." }, 401, req);

    const user = await auth.verifyIdToken(token);
    const applicationNumber = String(body?.applicationNumber || "").trim().toUpperCase();
    if (!applicationNumber) return json(res, { error: "Application number is required." }, 400, req);

    const appRef = db.doc("applications/" + applicationNumber);
    const appSnap = await appRef.get();
    if (!appSnap.exists || appSnap.data().authUid !== user.uid) {
      return json(res, { error: "Application access denied." }, 403, req);
    }

    const app = appSnap.data();
    const exam = await resolveExamForApplication(app);
    if (!exam) return json(res, { error: "Exam configuration not found." }, 412, req);
    if (exam.autoAdmitDraft !== true) return json(res, { created: false, reason: "Auto draft generation is disabled." }, 200, req);
    if (!["Final Submitted","Approved"].includes(app.status)) return json(res, { error: "Application must be final submitted before admit draft generation." }, 412, req);
    if (exam.paymentRequired !== false && app.paymentStatus !== "Successful") return json(res, { error: "Payment must be successful before admit draft generation." }, 412, req);

    const admitRef = db.doc("admitCards/" + applicationNumber);
    const existing = await admitRef.get();
    if (existing.exists && existing.data().rollNumber) {
      return json(res, { created: false, existing: true, rollNumber: existing.data().rollNumber }, 200, req);
    }

    const centreId = String(exam.defaultCentreId || "").trim();
    if (!centreId) return json(res, { error: "Default centre is not configured for this exam." }, 412, req);
    const centreSnap = await db.doc("centres/" + centreId).get();
    if (!centreSnap.exists) return json(res, { error: "Default examination centre not found." }, 412, req);
    const centre = centreSnap.data();
    if (centre.active === false) return json(res, { error: "Default examination centre is inactive." }, 412, req);

    const shifts = Math.max(1, String(centre.shifts || "1").split(",").map(x => x.trim()).filter(Boolean).length);
    const capacity = num(centre.capacity, 0);
    const maxCapacity = capacity > 0 ? capacity * shifts : Number.MAX_SAFE_INTEGER;
    const allocationRef = db.doc("centreAllocations/" + exam.id);
    const counterRef = db.doc("counters/admit_" + exam.id);
    const width = Math.max(1, num(exam.rollWidth, 6));
    const start = Math.max(0, num(exam.rollStart, 100001));
    const prefix = String(exam.rollPrefix || "");

    const result = await db.runTransaction(async tx => {
      const freshExisting = await tx.get(admitRef);
      if (freshExisting.exists && freshExisting.data().rollNumber) return { created:false, rollNumber:freshExisting.data().rollNumber };

      const allocationSnap = await tx.get(allocationRef);
      const counts = { ...(allocationSnap.exists ? (allocationSnap.data().counts || {}) : {}) };
      const used = num(counts[centreId], 0);
      if (used >= maxCapacity) throw new Error("Default examination centre capacity is full.");

      const counterSnap = await tx.get(counterRef);
      const current = num(counterSnap.exists ? counterSnap.data().nextNumber : start, start);
      const rollNumber = prefix + String(current).padStart(width, "0");

      counts[centreId] = used + 1;
      tx.set(allocationRef, { examId: exam.id, counts, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
      tx.set(counterRef, { examId: exam.id, nextNumber: current + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
      tx.set(admitRef, {
        applicationNumber,
        authUid: app.authUid,
        candidateName: app.personal?.fullName || "",
        fatherName: app.personal?.fatherName || "",
        examId: exam.id,
        rollNumber,
        centreCode: centreId,
        centreName: centre.name || "",
        centreAddress: centre.address || "",
        centreCity: centre.city || "",
        centreDistrict: centre.district || "",
        centreState: centre.state || "",
        centrePin: centre.pin || "",
        examDate: exam.examDate || "",
        reportingTime: exam.reportingTime || "",
        gateClosingTime: exam.gateClosingTime || "",
        examTime: exam.examTime || "",
        issueDate: exam.admitRelease || "",
        published: false,
        status: "Draft",
        version: 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge:true });

      return { created:true, rollNumber };
    });

    return json(res, { applicationNumber, ...result }, 200, req);
  } catch (error) {
    console.error("autoCreateAdmitDraft", error);
    return json(res, { error: error?.message || "Unable to create admit-card draft." }, 500, req);
  }
};