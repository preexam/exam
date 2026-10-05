import {auth,db,storage,doc,getDoc,updateDoc,serverTimestamp,signOut,escapeHtml,showMsg,ref,uploadBytes,getDownloadURL,onAuthStateChanged,getDocs,collection,getSettings,getActiveExam,examLifecycle,normalizeEducationQualification} from "./firebase.js";
const $=s=>document.querySelector(s); const appNo=sessionStorage.getItem("candidateApp"),root=document.querySelector("#dash");if(!appNo){location.replace("./application.html");throw new Error("No application")}; const user=auth.currentUser||await new Promise(resolve=>{let settled=false;const finish=u=>{if(settled)return;settled=true;off?.();clearTimeout(timer);resolve(u)};const off=onAuthStateChanged(auth,finish);const timer=setTimeout(()=>finish(null),8000)});if(!user){sessionStorage.clear();location.replace("./application.html");throw new Error("Not authenticated")};const snap=await getDoc(doc(db,"applications",appNo));if(!snap.exists()||snap.data().authUid!==user.uid){root.innerHTML='<div class="card">Application not found or access denied.</div>';throw 0}const a=snap.data(); const settings=await getSettings(); const formFieldEnabled=settings.formFieldEnabled||{}; const formFieldRequired=settings.formFieldRequired||{}; const formSections={personal:settings.formSections?.personal!==false,address:settings.formSections?.address!==false,education:settings.formSections?.education!==false,category:settings.formSections?.category!==false,other:settings.formSections?.other!==false,photo:settings.formSections?.photo!==false,documents:settings.formSections?.documents!==false,declaration:settings.formSections?.declaration!==false,payment:true}; const enabledField=key=>Object.prototype.hasOwnProperty.call(formFieldEnabled,key)?formFieldEnabled[key]!==false:!["certificateFile","nocFile","otherFile"].includes(key); const requiredField=key=>Object.prototype.hasOwnProperty.call(formFieldRequired,key)?formFieldRequired[key]===true:["fullName","dob"].includes(key); const sectionMeta=[["personal","Personal Details"],["address","Address Details"],["education","Education & Educational Qualification"],["category","Category Details"],["other","Other Details"],["photo","Photo & Signature"],["documents","Documents"],["declaration","Declaration"],["payment","Payment"]];
const storedExamId=a.examId||"default"; let examId=storedExamId!=="default"?storedExamId:(settings.activeExamId&&settings.activeExamId!=="default"?String(settings.activeExamId):"default"); let examSnap=await getDoc(doc(db,"exams",examId)); if(!examSnap.exists()&&storedExamId==="default"){const examsSnap=await getDocs(collection(db,"exams")); const createdAt=a.createdAt?.toDate?a.createdAt.toDate():new Date(a.createdAt||0); const candidates=examsSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status!=="Closed"&&x.status!=="Archived").filter(x=>{const start=Number(x.applicationStartMs)||Date.parse(x.applicationStart||""); const end=Number(x.applicationEndMs)||Date.parse(x.applicationEnd||""); const t=createdAt.getTime(); return Number.isNaN(t)||(!start||t>=start)&&(!end||t<=end)}).sort((x,y)=>(Number(y.applicationStartMs)||Date.parse(y.applicationStart||"")||0)-(Number(x.applicationStartMs)||Date.parse(x.applicationStart||"")||0)); if(candidates.length){examId=candidates[0].id;examSnap=await getDoc(doc(db,"exams",examId));}} const exam=examSnap.exists()?{id:examSnap.id,...examSnap.data()}:null; const paymentRequired=exam?.paymentRequired!==false; formSections.payment=paymentRequired; const enabledSections=sectionMeta.filter(([key])=>formSections[key]); const life=examLifecycle(exam); let locked=a.status==="Final Submitted"; const correctionMode=a.status==="Correction Required"&&life.correctionOpen; const customSnap=await getDocs(collection(db,"customFields")); const customFields=customSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.visible!==false).sort((x,y)=>(x.order||100)-(y.order||100)); const docSnap=await getDocs(collection(db,"documents")); const documentRules=docSnap.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(x.order||0)-(y.order||0)); if(settings.maintenanceMode){root.innerHTML=`<div class="card"><h1>Portal Under Maintenance</h1><p>Please try again later.</p></div>`;throw 0}

const v=(obj,key)=>escapeHtml(obj?.[key]||"");
const educationQualification=normalizeEducationQualification(settings.educationQualification||{});
const qualificationTrackKey=value=>value==="1 to 5"?"1to5":value==="6 to 8"?"6to8":"";
const language1Options=["Hindi","English","Sanskrit"];
const selectedLanguage1=Array.isArray(a.education?.language1)?a.education.language1.map(String):a.education?.language1?[String(a.education.language1)]:[];
function educationDropdown(label,name,options,value){
  const current=String(value||"");
  const optionButtons=options.map(x=>`<button type="button" class="education-dropdown-option" data-education-value="${escapeHtml(x)}" ${locked?"disabled":""}>${escapeHtml(x)}</button>`).join("");
  return `<div class="education-dropdown-wrap"><label>${escapeHtml(label)}</label><details class="education-dropdown" data-education-dropdown="${escapeHtml(name)}"><summary><span data-education-label="${escapeHtml(name)}">${escapeHtml(current||`Select ${label}`)}</span></summary><div class="education-dropdown-menu">${optionButtons}</div></details><input class="education-dropdown-value" type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(current)}"></div>`;
}
function qualificationSubjectField(value,languageValues=selectedLanguage1,advancedValue=a.education?.advancedSubject){
  const trackKey=qualificationTrackKey(value);
  const langChecks=language1Options.map(x=>`<label class="language-choice"><input type="checkbox" name="language1Choice" value="${escapeHtml(x)}" ${languageValues.includes(x)?"checked":""} ${locked?"disabled":""}><span>${escapeHtml(x)}</span></label>`).join("");
  const extra=trackKey==="6to8"
    ? `<div class="education-choice-card"><label>Optional Subject / Subject Group</label>${educationDropdown("Optional Subject","advancedSubject",["Mathematics & Science","Social Studies"],advancedValue)}</div>`
    : "";
  return `<div class="education-choice-grid">
    <div class="education-choice-card"><label>Language 1 <span class="muted">(Select any 2)</span></label><div class="language-dropdown"><details><summary>Select any 2 languages</summary><div class="language-options">${langChecks}</div></details></div></div>
    <div class="education-choice-card"><label>Language 2</label><div class="education-fixed-value">Nagpuri</div><input type="hidden" name="language2" value="Nagpuri"></div>
    ${extra}
  </div>`;
}

const paymentFee=Number(exam?.fee||0);
const customSection=(key,label,body)=>`<section id="section-${key}" class="application-section" data-section="${key}"><h2 class="section-title">Custom Fields — ${escapeHtml(label)}</h2>${body}</section>`;
const customSectionsMarkup=Object.entries({personal:"Personal Details",address:"Address Details",education:"Education & Educational Qualification",category:"Category Details",other:"Other Details",photo:"Photo & Signature",documents:"Documents",declaration:"Declaration"}).map(([sectionKey,label])=>{const items=customFields.filter(x=>x.section===sectionKey);return items.length&&formSections[sectionKey]?customSection(sectionKey,label,`<div class="form-grid">${items.map(x=>customField(x,a.other?.customFields?.[x.id]||"")).join("")}</div>`):""}).join("");

const paymentPanel=paymentRequired
  ? (a.paymentStatus==="Successful"
    ? `<div class="card payment-card"><span class="eyebrow">PAYMENT</span><h2>Payment Successful</h2><p class="muted">Your application payment has been verified. You can now use Final Submit.</p><p><b>Amount:</b> ₹${(Number(a.paymentOrderAmount||paymentFee*100)/100).toFixed(2)}</p></div>`
    : `<div class="card payment-card"><span class="eyebrow">PAYMENT REQUIRED</span><h2>Complete Application Payment</h2><p class="muted">Payment must be successfully verified before Final Submit.</p><p><b>Application Fee:</b> ₹${paymentFee.toFixed(2)}</p><button class="btn primary" type="button" id="payNow" ${paymentFee>0?"":"disabled"}>${paymentFee>0?"Pay Now":"Payment fee is not configured"}</button><p id="paymentMsg" class="message"></p></div>`)
  : `<div class="card payment-card"><span class="eyebrow">PAYMENT</span><h2>No Payment Required</h2><p class="muted">This exam is configured without an application payment.</p></div>`;

root.innerHTML=`<div class="card"><h1>Application Dashboard</h1><p>Application Number: <b>${escapeHtml(appNo)}</b></p><p>Status: <b>${escapeHtml(a.status||"Application Incomplete")}</b></p><p>Payment: <b>${escapeHtml(a.paymentStatus||"Pending")}</b></p></div><div class="application-layout"><aside class="application-sidebar"><div class="sidebar-title">Application Steps</div>${enabledSections.map(([key,label],i)=>`<a href="#section-${key}" class="section-link ${i===0?"active":""}" data-section-link="${key}"><span>${String(i+1).padStart(2,"0")}</span>${label}</a>`).join("")}</aside><form id="appForm" class="card application-form">${sec("1. Personal Details",`<div class="form-grid">${f("Full Name","fullName",v(a.personal,"fullName"))}${f("Father's Name","fatherName",v(a.personal,"fatherName"))}${f("Mother's Name","motherName",v(a.personal,"motherName"))}${f("Date of Birth","dob",v(a.personal,"dob"),"type=date")}${sel("Gender","gender",["Male","Female","Other"],a.personal?.gender)}${sel("Category","category",["UR","OBC","SC","ST","EWS"],a.personal?.category)}${sel("Marital Status","maritalStatus",["Unmarried","Married","Other"],a.personal?.maritalStatus)}${f("Nationality","nationality",v(a.personal,"nationality")||"Indian")}${f("Domicile / State","domicile",v(a.personal,"domicile"))}${f("Aadhaar Number","aadhaar",v(a.personal,"aadhaar"),"inputmode=\"numeric\" maxlength=\"12\"")}${f("Other ID Type","otherIdType",v(a.personal,"otherIdType"))}${f("Other ID Number","otherIdNumber",v(a.personal,"otherIdNumber"))}${f("Mobile","mobile",v(a.personal,"mobile"),"inputmode=\"numeric\" maxlength=\"10\"")}${f("Email","email",v(a.personal,"email"),"type=\"email\"")}${f("Alternate Mobile","alternateMobile",v(a.personal,"alternateMobile"))}${f("Guardian Name","guardianName",v(a.personal,"guardianName"))}${f("Guardian Relationship","guardianRelation",v(a.personal,"guardianRelation"))}${f("Guardian Occupation","guardianOccupation",v(a.personal,"guardianOccupation"))}${f("Guardian Annual Income","guardianIncome",v(a.personal,"guardianIncome"))}</div>`)}${sec("2. Address Details",`<div class="form-grid">${f("House/Building No.","house",v(a.address,"house"))}${f("Village/Town/City","city",v(a.address,"city"))}${f("Post Office","postOffice",v(a.address,"postOffice"))}${f("Police Station","policeStation",v(a.address,"policeStation"))}${f("District","district",v(a.address,"district"))}${f("State","state",v(a.address,"state"))}${f("PIN Code","pin",v(a.address,"pin"),"inputmode=\"numeric\" maxlength=\"6\"")}${sel("Correspondence Address Different","correspondenceDifferent",["Yes","No"],a.address?.correspondenceDifferent)}${f("Permanent Address","permanentAddress",v(a.address,"permanentAddress"))}${f("Correspondence Address","correspondenceAddress",v(a.address,"correspondenceAddress"))}</div>`)}${sec("3. Education Details",`<div class="form-grid">${f("10th Board","board10",v(a.education,"board10"))}${f("10th Passing Year","year10",v(a.education,"year10"))}${f("10th Roll Number","roll10",v(a.education,"roll10"))}${f("10th Percentage/CGPA","marks10",v(a.education,"marks10"))}${f("12th Board","board12",v(a.education,"board12"))}${f("12th Passing Year","year12",v(a.education,"year12"))}${f("12th Roll Number","roll12",v(a.education,"roll12"))}${f("12th Percentage/CGPA","marks12",v(a.education,"marks12"))}${f("Higher education","graduation",v(a.education,"graduation"))}${f("University","university",v(a.education,"university"))}<div id="applyingForWrap">${educationDropdown("Applying For","examPost",["1 to 5","6 to 8"],a.education?.examPost||a.personal?.examPost)}</div><div id="qualificationSubjectWrap">${qualificationSubjectField(a.education?.examPost||a.personal?.examPost)}</div></div>`)}${sec("4. Category Details",`<div class="form-grid">${f("EWS Status","ews",v(a.category,"ews"))}${f("OBC-NCL Status","obcNcl",v(a.category,"obcNcl"))}${f("PwBD / Disability","pwbd",v(a.category,"pwbd"))}${f("Ex-Serviceman","exServiceman",v(a.category,"exServiceman"))}${f("Certificate Number","certificateNo",v(a.category,"certificateNo"))}${f("Certificate Issue Date","certificateDate",v(a.category,"certificateDate"),"type=date")}${f("Certificate Issuing Authority","certificateAuthority",v(a.category,"certificateAuthority"))}${f("Certificate Validity","certificateValidity",v(a.category,"certificateValidity"),"type=date")}</div>`)}${sec("5. Other Details",`<div class="form-grid">${f("Employment Status","employment",v(a.other,"employment"))}${f("Government Employee","governmentEmployee",v(a.other,"governmentEmployee"))}${f("Employer / Organization","employer",v(a.other,"employer"))}${f("Designation","designation",v(a.other,"designation"))}${f("Employee ID","employeeId",v(a.other,"employeeId"))}${f("Joining Date","joiningDate",v(a.other,"joiningDate"),"type=date")}${f("NOC Required","nocRequired",v(a.other,"nocRequired"))}${f("Experience","experience",v(a.other,"experience"))}${f("Identification / Visible Mark","visibleMark",v(a.other,"visibleMark"))}</div>`)}${sec("6. Photo & Signature",`<div class="form-grid">${enabledField("photo")?`<label>Photograph<input id="photo" type="file" accept="image/*" ${requiredField("photo")&&!a.photoUrl?"required":""} ${locked?"disabled":""}></label>`:""}${enabledField("signature")?`<label>Signature<input id="signature" type="file" accept="image/*" ${requiredField("signature")&&!a.signatureUrl?"required":""} ${locked?"disabled":""}></label>`:""}${enabledField("thumb")?`<label>Thumb Impression<input id="thumb" type="file" accept="image/*" ${requiredField("thumb")&&!a.thumbUrl?"required":""} ${locked?"disabled":""}></label>`:""}</div><p class="muted">Files upload to Firebase Storage when Storage is enabled.</p>`)}${formSections.documents?sec("7. Documents",`<div class="form-grid">${enabledField("certificateFile")?`<label>Reservation Certificate<input id="certificateFile" type="file" accept=".pdf,image/*" ${requiredField("certificateFile")&&!a.documents?.certificateUrl?"required":""} ${locked?"disabled":""}></label>`:""}${enabledField("nocFile")?`<label>NOC Document<input id="nocFile" type="file" accept=".pdf,image/*" ${requiredField("nocFile")&&!a.documents?.nocUrl?"required":""} ${locked?"disabled":""}></label>`:""}${enabledField("otherFile")?`<label>Other Document<input id="otherFile" type="file" accept=".pdf,image/*" ${requiredField("otherFile")&&!a.documents?.otherDocumentUrl?"required":""} ${locked?"disabled":""}></label>`:""}</div>`):""}${customSectionsMarkup}${formSections.documents&&documentRules.length?sec("7A. Additional Documents",`<div class="form-grid">${documentRules.map(x=>documentField(x,a.documents?.["document_"+x.id]||"")).join("")}</div>`):""}${sec("8. Declaration",`<div class="declaration-box"><div class="declaration-intro"><h3>Candidate Declaration</h3><p>Please read all terms carefully before accepting the declaration.</p></div><ol class="declaration-terms"><li><b>Attendance &amp; Refund:</b> After submitting the application/form, if the candidate does not appear for the scheduled offline mock examination, the applicable examination fee/amount will not be refunded, subject to the applicable payment/refund policy.<br><span class="declaration-hindi"><b>उपस्थिति और रिफंड:</b> आवेदन/फॉर्म जमा करने के बाद यदि उम्मीदवार निर्धारित ऑफलाइन मॉक परीक्षा में उपस्थित नहीं होता है, तो लागू परीक्षा शुल्क/राशि वापस नहीं की जाएगी, जो लागू भुगतान/रिफंड नीति के अधीन होगी।</span></li><li><b>Correct Information &amp; Documents:</b> The candidate is responsible for providing correct and complete information and valid documents. If any incorrect, misleading, incomplete or unverifiable information/document is found, the candidate may be denied entry or may be disqualified from the examination.<br><span class="declaration-hindi"><b>सही जानकारी और दस्तावेज:</b> उम्मीदवार सही एवं पूर्ण जानकारी तथा वैध दस्तावेज देने के लिए जिम्मेदार है। गलत, भ्रामक, अधूरी या सत्यापित न की जा सकने वाली जानकारी/दस्तावेज मिलने पर प्रवेश से वंचित किया जा सकता है या उम्मीदवार को परीक्षा से अयोग्य घोषित किया जा सकता है।</span></li><li><b>Discipline &amp; Fair Conduct:</b> Cheating, use of unfair means, impersonation, sharing answers, disturbing other candidates, misconduct, or any attempt to disrupt the examination process may result in removal from the examination and/or cancellation of candidature, without prejudice to other applicable action.<br><span class="declaration-hindi"><b>अनुशासन और निष्पक्ष आचरण:</b> नकल, अनुचित साधनों का उपयोग, किसी अन्य व्यक्ति के स्थान पर परीक्षा देना, उत्तर साझा करना, अन्य उम्मीदवारों को परेशान करना, दुर्व्यवहार या परीक्षा प्रक्रिया को बाधित करने का कोई प्रयास परीक्षा से हटाए जाने और/या उम्मीदवारी रद्द किए जाने का कारण बन सकता है।</span></li><li><b>Mock Examination Disclaimer:</b> This is a practice/mock examination intended to provide preparation and a real-exam-like environment. No representation or guarantee is made that the questions in this mock examination will appear in the actual JTET or any other real examination.<br><span class="declaration-hindi"><b>मॉक परीक्षा संबंधी सूचना:</b> यह एक अभ्यास/मॉक परीक्षा है, जिसका उद्देश्य तैयारी और वास्तविक परीक्षा जैसा वातावरण प्रदान करना है। इस मॉक परीक्षा के प्रश्न वास्तविक JTET या किसी अन्य वास्तविक परीक्षा में आएंगे, इसकी कोई गारंटी नहीं दी जाती है।</span></li><li><b>Examination Instructions:</b> Candidates must follow the instructions issued by the examination authority/centre staff, carry required documents, report on time, and maintain proper conduct throughout the examination. Failure to follow instructions may lead to denial of entry or removal from the examination.<br><span class="declaration-hindi"><b>परीक्षा संबंधी निर्देश:</b> उम्मीदवारों को परीक्षा प्राधिकरण/केंद्र कर्मचारियों द्वारा जारी निर्देशों का पालन करना, आवश्यक दस्तावेज साथ लाना, समय पर रिपोर्ट करना और पूरे समय उचित आचरण बनाए रखना अनिवार्य है। निर्देशों का पालन न करने पर प्रवेश से वंचित किया जा सकता है या परीक्षा से हटाया जा सकता है।</span></li><li><b>Final Responsibility:</b> The candidate confirms that they have read, understood and accepted these terms and that the information submitted in the application is true to the best of their knowledge.<br><span class="declaration-hindi"><b>अंतिम जिम्मेदारी:</b> उम्मीदवार पुष्टि करता है कि उसने सभी शर्तों को पढ़, समझ और स्वीकार कर लिया है तथा आवेदन में दी गई जानकारी उसकी जानकारी के अनुसार सत्य और सही है।</span></li></ol><label class="check declaration-accept"><input id="declare" type="checkbox" ${a.declarationAccepted?"checked":""} ${locked?"disabled":""} required> <span><b>I Agree:</b> I have read and accept all the above terms and conditions and declare that the information provided by me is true and correct.<br><span class="declaration-hindi"><b>मैं सहमत हूँ:</b> मैंने ऊपर दी गई सभी शर्तों और नियमों को पढ़ लिया है और स्वीकार करता/करती हूँ तथा घोषणा करता/करती हूँ कि मेरे द्वारा दी गई जानकारी सत्य और सही है।</span></span></label>`)}${sec("9. Payment",paymentPanel)}<div class="actions"><button class="btn" type="submit" ${locked?"disabled":""}>Save Application</button><button class="btn primary ${locked?"submitted":""}" type="button" id="finalSubmit" ${locked?"disabled":""}>${locked?"Application Submitted ✓":"Final Submit"}</button><button class="btn" type="button" id="print">Print / Save PDF</button></div><p id="msg" class="message"></p></form></div><div id="submissionSuccessModal" class="submission-modal" hidden><div class="submission-modal-backdrop"></div><div class="submission-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="submissionSuccessTitle"><div class="submission-success-icon">✓</div><span class="eyebrow">APPLICATION SUBMISSION</span><h2 id="submissionSuccessTitle">Application Submitted Successfully</h2><p class="submission-lead">Dear Candidate, your application has been submitted successfully.</p><div class="credential-grid"><div class="credential-card"><span>Application Number</span><strong id="successApplicationNumber"></strong></div><div class="credential-card"><span>Password</span><strong id="successApplicationPassword"></strong></div></div><div class="submission-notice"><b>Please save these details carefully.</b><p>Your Application Number and Password will be required for future login and for downloading your Admit Card / Result.</p><p class="submission-warning">For your security, do not share your password with anyone.</p></div><div class="submission-actions"><button type="button" class="btn primary" id="successPrint">Print / Save Application</button><button type="button" class="btn" id="successClose">Continue</button></div></div></div>`;

async function loadRazorpayCheckout(){
  if(window.Razorpay)return;
  await new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://checkout.razorpay.com/v1/checkout.js";
    s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error("Razorpay Checkout could not be loaded."));
    document.head.appendChild(s);
  });
}

const PAYMENT_API_BASE_URL="https://exam-henna-two.vercel.app";
async function paymentApi(path,payload){
  const token=await user.getIdToken();
  const response=await fetch(PAYMENT_API_BASE_URL+path,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=UTF-8"},
    body:JSON.stringify({...payload,idToken:token})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||"Payment service request failed.");
  return data;
}

async function startPayment(){
  const btn=document.querySelector("#payNow"),msg=document.querySelector("#paymentMsg");
  if(!btn||paymentFee<=0)return;
  btn.disabled=true;showMsg(msg,"Creating secure payment order...");
  try{
    const order=await paymentApi("/api/createRazorpayOrder",{applicationNumber:appNo});
    await loadRazorpayCheckout();
    const rzp=new window.Razorpay({
      key:order.keyId,amount:order.amount,currency:order.currency,
      name:settings.portalName||"Exam Portal",description:order.description||"Application Fee",order_id:order.orderId,
      prefill:{name:a.personal?.fullName||"",email:a.personal?.email||"",contact:a.personal?.mobile||""},
      notes:{applicationNumber:appNo},
      handler:async response=>{
        try{
          showMsg(msg,"Verifying payment securely...");

          await paymentApi("/api/verifyRazorpayPayment",{
            applicationNumber:appNo,
            orderId:response.razorpay_order_id,
            paymentId:response.razorpay_payment_id,
            signature:response.razorpay_signature
          });

          showMsg(msg,"Payment verified successfully. Final submission is being completed...");

          // Re-read the application from Firestore after backend verification.
          // This prevents the frontend from assuming that payment was successful
          // merely because Razorpay returned a payment response.
          const freshSnap=await getDoc(doc(db,"applications",appNo));

          if(!freshSnap.exists()){
            throw new Error("Application could not be refreshed after payment verification.");
          }

          const freshApplication=freshSnap.data();

          // The backend must have marked the payment as Successful.
          if(paymentRequired&&freshApplication.paymentStatus!=="Successful"){
            throw new Error("Payment verification is still pending. Please try again.");
          }

          // Keep the local application object in sync with Firestore.
          Object.assign(a,freshApplication);

          // Find the existing Final Submit button.
          const finalSubmit=document.querySelector("#finalSubmit");

          if(!finalSubmit){
            throw new Error("Final Submit button was not found.");
          }

          // Trigger the SAME Final Submit handler that a real user would trigger.
          finalSubmit.click();

        }catch(e){
          btn.disabled=false;
          showMsg(
            msg,
            e?.message||"Payment verification failed. Please contact support.",
            true
          );
        }
      },
      modal:{ondismiss:()=>{btn.disabled=false;showMsg(msg,"Payment window closed. You can retry when ready.");}}
    });
    rzp.on("payment.failed",response=>{btn.disabled=false;showMsg(msg,response?.error?.description||"Payment failed. Please retry.",true);});
    rzp.open();
  }catch(e){btn.disabled=false;showMsg(msg,e?.message||"Unable to start payment. Please try again.",true);}
}

document.querySelector("#payNow")?.addEventListener("click",startPayment);
function bindEducationControls(){
  const examWrap=document.querySelector("#applyingForWrap");
  const examInput=examWrap?.querySelector('input[name="examPost"]');
  bindEducationDropdowns(examWrap);
  bindLanguageChoices(document.querySelector("#qualificationSubjectWrap"));
}
function bindEducationDropdowns(scope=document){
  scope?.querySelectorAll(".education-dropdown").forEach(details=>{
    details.querySelectorAll(".education-dropdown-option").forEach(button=>{
      if(button.dataset.bound==="1")return;
      button.dataset.bound="1";
      button.addEventListener("click",()=>{
        const value=button.dataset.educationValue||"";
        const name=details.dataset.educationDropdown;
        const input=details.parentElement.querySelector(`input[name="${name}"]`);
        const label=details.querySelector(`[data-education-label="${name}"]`);
        if(input)input.value=value;
        if(label)label.textContent=value||`Select ${name}`;
        details.open=false;
      });
    });
  });
}
function bindLanguageChoices(scope=document){
  const inputs=Array.from(scope?.querySelectorAll('input[name="language1Choice"]')||[]);
  inputs.forEach(input=>{
    if(input.dataset.bound==="1")return;
    input.dataset.bound="1";
    input.addEventListener("change",()=>{
      const selected=inputs.filter(x=>x.checked);
      if(selected.length>2)input.checked=false;
    });
  });
}

function sec(t,b){const n=String(t||"");const key=n.startsWith("1.")?"personal":n.startsWith("2.")?"address":n.startsWith("3.")?"education":n.startsWith("4.")?"category":n.startsWith("5.")?"other":n.startsWith("6.")?"photo":n.startsWith("7.")?"documents":n.startsWith("8.")?"declaration":n.startsWith("9.")?"payment":null;if(key&&!formSections[key])return "";const id=key||"extra";return `<section id="section-${id}" class="application-section" data-section="${id}"><h2 class="section-title">${t}</h2>${b}</section>`}

function customField(x,val=""){const n="custom_"+x.id,base=x.type==="Textarea"?`<textarea name="${n}" placeholder="${escapeHtml(x.placeholder||"")}" ${x.required?"required":""} ${x.locked||locked?"disabled":""}>${escapeHtml(val)}</textarea>`:x.type==="Dropdown"||x.type==="Radio"||x.type==="Yes/No"||x.type==="Multi-select"?`<select name="${n}" ${x.type==="Multi-select"?"multiple":""} ${x.required?"required":""} ${x.locked||locked?"disabled":""}>${(x.options?.length?x.options:(x.type==="Yes/No"?["Yes","No"]:[""])).map(o=>`<option value="${escapeHtml(o)}" ${(Array.isArray(val)?val.map(String).includes(String(o)):String(o)===String(val))?"selected":""}>${escapeHtml(o)}</option>`).join("")}</select>`:`<input name="${n}" type="${x.type==="Number"?"number":x.type==="Date"?"date":"text"}" value="${escapeHtml(val)}" placeholder="${escapeHtml(x.placeholder||"")}" ${x.validation?`pattern="${escapeHtml(x.validation)}"`:""} ${x.required?"required":""} ${x.locked||locked?"disabled":""}>`;return `<label>${escapeHtml(x.name||x.key||"Custom Field")}${base}${x.helpText?`<small>${escapeHtml(x.helpText)}</small>`:""}</label>`}

function documentField(x,val=""){const accept=x.fileType==="PDF"?".pdf":x.fileType==="JPG"?".jpg,.jpeg":x.fileType==="PNG"?".png":x.fileType==="PDF/JPG/PNG"?".pdf,.jpg,.jpeg,.png":"";return `<label>${escapeHtml(x.name)}<input id="customDoc_${x.id}" type="file" accept="${accept}" ${x.required&&!val?"required":""} ${locked?"disabled":""}><small>${x.required?"Required":"Optional"} • Max ${escapeHtml(x.maxSize||2)} MB${x.dimensions?` • ${escapeHtml(x.dimensions)}`:""}</small>${val?`<a href="${escapeHtml(val)}" target="_blank" rel="noopener">View uploaded file</a>`:""}</label>`}

function f(l,n,val,extra=""){if(!enabledField(n))return `<input type="hidden" name="${n}" value="${escapeHtml(val??"")}">`;const safeExtra=String(extra||"").replace(/\brequired\b/g,"").trim();return `<label>${l}<input name="${n}" value="${escapeHtml(val??"")}" ${safeExtra} ${requiredField(n)?"required":""} ${locked?"disabled":""}></label>`}

function sel(l,n,o,val){if(!enabledField(n))return `<input type="hidden" name="${n}" value="${escapeHtml(val??"")}">`;return `<label>${l}<select name="${n}" ${requiredField(n)?"required":""} ${locked?"disabled":""}>${o.map(x=>`<option value="${escapeHtml(x)}" ${String(x)===String(val)?"selected":""}>${escapeHtml(x)}</option>`).join("")}</select></label>`}

async function upload(id,maxMB=10){const file=document.querySelector("#"+id)?.files[0];if(!file)return null;if(file.size>maxMB*1024*1024)throw new Error(`File must be ${maxMB} MB or smaller.`);const allowed=["image/jpeg","image/png","image/webp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];if(!allowed.includes(file.type))throw new Error("Unsupported file type.");const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const r=ref(storage,`applications/${appNo}/${Date.now()}_${safe}`);await uploadBytes(r,file);return await getDownloadURL(r)}

function aadhaarValid(v){
  const s=String(v??"").replace(/[\s-]/g,"");
  if(!/^[2-9]\d{11}$/.test(s)||/^0{12}$/.test(s))return false;
  const d=[[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const p=[[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  let c=0;
  for(let i=s.length-1,pos=0;i>=0;i--,pos++)c=d[c][p[pos%8][Number(s[i])]];
  return c===0;
}

function validateCustomFields(values){
  for(const cf of customFields){
    const key="custom_"+cf.id;
    let value=values[key];
    if((value==null||value==="")&&cf.locked)value=a.other?.customFields?.[cf.id]||"";
    const text=Array.isArray(value)?value.join(","):String(value??"");
    if(cf.required&&!text.trim()){showMsg($("#msg"),`${cf.name||"Required field"} is required.`,true);return false}
    if(!text.trim())continue;
    if(cf.validation){
      try{if(!new RegExp(cf.validation).test(text)){showMsg($("#msg"),`${cf.name||"Field"} has an invalid format.`,true);return false}}catch{showMsg($("#msg"),`Invalid validation rule configured for ${cf.name||"custom field"}.`,true);return false}
    }
    if(cf.type==="Number"&&!Number.isFinite(Number(text))){showMsg($("#msg"),`${cf.name||"Number field"} must be numeric.`,true);return false}
    if(cf.type==="Date"){const d=new Date(text+"T00:00:00");const now=new Date();now.setHours(0,0,0,0);if(Number.isNaN(d.getTime())||d>now){showMsg($("#msg"),`${cf.name||"Date field"} contains an invalid/future date.`,true);return false}}
  }
  return true;
}

function validateId(type,value){const v=String(value||"").toUpperCase().replace(/\s+/g,"");if(!v)return true;const key=String(type||"").replace(/[^A-Za-z]/g,"").toLowerCase();const patterns={pan:/^[A-Z]{5}\d{4}[A-Z]$/,passport:/^[A-Z]\d{7}$/,voterid:/^[A-Z]{2,3}\d{7}$/,drivinglicense:/^[A-Z]{2}\d{2}[-A-Z0-9]{4,16}$/};return !patterns[key]||patterns[key].test(v)}

function validateData(x){const mobile=x.mobile||"";const alternateMobile=x.alternateMobile||"";const aadhaar=x.aadhaar||"";const pin=x.pin||"";const year10=x.year10||"";const year12=x.year12||"";const dob=x.dob||"";const today=new Date();today.setHours(0,0,0,0);if(mobile&&!/^\d{10}$/.test(mobile)){showMsg($("#msg"),"Mobile number must be exactly 10 digits.",true);return false}if(alternateMobile&&!/^\d{10}$/.test(alternateMobile)){showMsg($("#msg"),"Alternate mobile number must be exactly 10 digits.",true);return false}if(aadhaar&&!aadhaarValid(aadhaar)){showMsg($("#msg"),"Enter a valid 12-digit Aadhaar number.",true);return false}if(pin&&!/^\d{6}$/.test(pin)){showMsg($("#msg"),"PIN code must be exactly 6 digits.",true);return false}if(dob){const d=new Date(dob+"T00:00:00");if(Number.isNaN(d.getTime())||d>today){showMsg($("#msg"),"Date of birth cannot be in the future.",true);return false}}const y=today.getFullYear();if(year10&&(Number(year10)<1950||Number(year10)>y)){showMsg($("#msg"),"Invalid 10th passing year.",true);return false}if(year12&&(Number(year12)<1950||Number(year12)>y)){showMsg($("#msg"),"Invalid 12th passing year.",true);return false}if(year10&&year12&&Number(year12)<Number(year10)){showMsg($("#msg"),"12th passing year cannot be before 10th passing year.",true);return false}if(!validateId(x.otherIdType,x.otherIdNumber)){showMsg($("#msg"),"Other ID number format is invalid for the selected ID type.",true);return false}if(x.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x.email)){showMsg($("#msg"),"Enter a valid email address.",true);return false}return true}

function removeUndefined(value){if(Array.isArray(value))return value.map(removeUndefined);if(value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype){return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,removeUndefined(v)]))}return value}

async function save(final=false,stepSave=false){
  const form=document.querySelector("#appForm");
  if(locked){showMsg($("#msg"),"Application is already finally submitted and cannot be edited.",true);return}
  if(a.status==="Correction Required"&&!correctionMode){showMsg($("#msg"),"Correction window is not currently open.",true);return}
  if(!stepSave&&!form.reportValidity())return;
  const fd=new FormData(document.querySelector("#appForm"));
  const x=Object.fromEntries(fd.entries());
  x.language1=Array.from(document.querySelectorAll('input[name="language1Choice"]:checked')).map(el=>el.value);
  x.language2="Nagpuri";
  for(const cf of customFields.filter(f=>f.type==="Multi-select")){x["custom_"+cf.id]=Array.from(document.querySelector(`[name="custom_${cf.id}"]`)?.selectedOptions||[]).map(o=>o.value)}
  if(!stepSave&&(!validateCustomFields(x)||!validateData(x)))return;
  const update={personal:{fullName:x.fullName,fatherName:x.fatherName,motherName:x.motherName,dob:x.dob,gender:x.gender,category:x.category,maritalStatus:x.maritalStatus,nationality:x.nationality,domicile:x.domicile,aadhaar:x.aadhaar,otherIdType:x.otherIdType,otherIdNumber:x.otherIdNumber,mobile:x.mobile,email:x.email,alternateMobile:x.alternateMobile,guardianName:x.guardianName,guardianRelation:x.guardianRelation,guardianOccupation:x.guardianOccupation,guardianIncome:x.guardianIncome},address:{house:x.house,city:x.city,postOffice:x.postOffice,policeStation:x.policeStation,district:x.district,state:x.state,pin:x.pin,correspondenceDifferent:x.correspondenceDifferent,permanentAddress:x.permanentAddress,correspondenceAddress:x.correspondenceAddress},education:{board10:x.board10,year10:x.year10,roll10:x.roll10,marks10:x.marks10,board12:x.board12,year12:x.year12,roll12:x.roll12,marks12:x.marks12,graduation:x.graduation,university:x.university,examPost:x.examPost,teachingSubject:x.teachingSubject,examLanguage:x.examLanguage,language1:x.language1,language2:"Nagpuri",advancedSubject:x.advancedSubject},category:{ews:x.ews,obcNcl:x.obcNcl,pwbd:x.pwbd,exServiceman:x.exServiceman,certificateNo:x.certificateNo,certificateDate:x.certificateDate,certificateAuthority:x.certificateAuthority,certificateValidity:x.certificateValidity},other:{employment:x.employment,governmentEmployee:x.governmentEmployee,employer:x.employer,designation:x.designation,employeeId:x.employeeId,joiningDate:x.joiningDate,nocRequired:x.nocRequired,experience:x.experience,visibleMark:x.visibleMark,customFields:{...Object.fromEntries(customFields.map(c=>[c.id,(c.locked||c.visible===false)?a.other?.customFields?.[c.id]:x["custom_"+c.id]]))}},declarationAccepted:document.querySelector("#declare")?.checked??!!a.declarationAccepted,updatedAt:serverTimestamp()};
  for(const [id,key,max] of [["photo","photoUrl",10],["signature","signatureUrl",10],["thumb","thumbUrl",10],["certificateFile","certificateUrl",10],["nocFile","nocUrl",10],["otherFile","otherDocumentUrl",10],...documentRules.map(d=>["customDoc_"+d.id,"document_"+d.id,Number(d.maxSize||2)])].filter(([id])=>{if(id==="photo"||id==="signature"||id==="thumb")return enabledField(id);if(["certificateFile","nocFile","otherFile"].includes(id))return formSections.documents&&enabledField(id);return formSections.documents;})){
    const file=document.querySelector("#"+id)?.files[0];
    if(!file)continue;
    try{
      const u=await upload(id,max);
      if(u)update.documents={...(update.documents||{}),[key]:u}
    }catch(e){showMsg($("#msg"),e.message||"File upload failed. Please try again.",true);return}
  }
  if(final){
    if(a.status==="Correction Required"&&!correctionMode){showMsg($("#msg"),"Correction window is not currently open.",true);return}
    if(formSections.declaration&&!update.declarationAccepted){showMsg($("#msg"),"Accept the declaration before final submission.",true);return}
    if(exam?.paymentRequired!==false&&a.paymentStatus!=="Successful"){showMsg($("#msg"),"Payment must be successful before final submission.",true);return}
    update.status="Final Submitted";
    update.finalSubmittedAt=serverTimestamp()
  }
  await updateDoc(doc(db,"applications",appNo),removeUndefined(update));
  if(update.personal)a.personal={...(a.personal||{}),...update.personal};
  if(update.address)a.address={...(a.address||{}),...update.address};
  if(update.education)a.education={...(a.education||{}),...update.education};
  if(update.category)a.category={...(a.category||{}),...update.category};
  if(update.other)a.other={...(a.other||{}),...update.other};
  if(update.documents)a.documents={...(a.documents||{}),...update.documents};
  if(typeof update.declarationAccepted==="boolean")a.declarationAccepted=update.declarationAccepted;
  if(final){
    a.status="Final Submitted";
    a.finalSubmittedAt=new Date();
    locked=true;
    const finalButton=document.querySelector("#finalSubmit");
    if(finalButton){finalButton.disabled=true;finalButton.textContent="Application Submitted ✓";finalButton.classList.add("submitted");}
    const header=document.querySelector("#dash>.card:first-child");
    if(header){const statusLine=Array.from(header.querySelectorAll("p")).find(p=>p.textContent.includes("Status:"));if(statusLine)statusLine.innerHTML="Status: <b>Final Submitted</b>";}
    showSubmissionSuccess();
    showMsg($("#msg"),"Application submitted successfully.");
  }else{
    showMsg($("#msg"),"Application saved.");
  }
}

const stepKeys=["personal","address","education","category","other","photo","documents","declaration","payment"];
const stepLabels={
  personal:"Personal Details",
  address:"Address Details",
  education:"Education & Educational Qualification",
  category:"Category Details",
  other:"Other Details",
  photo:"Photo & Signature",
  documents:"Documents",
  declaration:"Declaration",
  payment:"Payment"
};

const enabledStepKeys=()=>stepKeys.filter(k=>formSections[k]);
const stepStateKey=`applicationStep:${appNo}`;
const savedStep=Number(sessionStorage.getItem(stepStateKey));
let currentStep=Number.isInteger(savedStep)&&savedStep>=0?savedStep:0;
const stepSections=key=>Array.from(document.querySelectorAll(".application-section[data-section='"+key+"']"));
const stepLinks=()=>document.querySelectorAll("[data-section-link]");

function validateCurrentStep(key){
  const sections=stepSections(key);
  for(const section of sections){
    const fields=section.querySelectorAll("input,select,textarea");
    for(const field of fields){
      if(field.disabled)continue;
      if(!field.checkValidity()){
        field.reportValidity();
        return false;
      }
    }
  }
  if(key==="personal"){
    const form=document.querySelector("#appForm");
    const fd=new FormData(form);
    const x=Object.fromEntries(fd.entries());
    if(!validateData(x))return false;
  }
  if(key==="education"){
    const form=document.querySelector("#appForm");
    const fd=new FormData(form);
    const x=Object.fromEntries(fd.entries());
    x.language1=Array.from(document.querySelectorAll('input[name="language1Choice"]:checked')).map(el=>el.value);
    x.language2="Nagpuri";
    if(x.language1.length!==2){showMsg($("#msg"),"Select any 2 languages for Language 1.",true);return false}
    if(x.examPost==="6 to 8"&&!x.advancedSubject){showMsg($("#msg"),"Select a subject group for 6 to 8.",true);return false}
  }
  if(key==="category"){
    const form=document.querySelector("#appForm");
    const fd=new FormData(form);
    const x=Object.fromEntries(fd.entries());
    for(const cf of customFields.filter(f=>f.type==="Multi-select")){
      x["custom_"+cf.id]=Array.from(document.querySelector("[name=\"custom_"+cf.id+"\"]")?.selectedOptions||[]).map(o=>o.value);
    }
    if(!validateCustomFields(x))return false;
  }
  return true;
}

function renderStep(){
  const enabled=enabledStepKeys();
  currentStep=Math.min(currentStep,Math.max(0,enabled.length-1));
  if(currentStep>=enabled.length)currentStep=Math.max(0,enabled.length-1);
  const activeKey=enabled[currentStep];
  stepKeys.forEach(key=>{
    stepSections(key).forEach(section=>section.classList.toggle("step-visible",key===activeKey));
  });
  stepLinks().forEach(link=>{
    const key=link.dataset.sectionLink;
    link.classList.toggle("active",key===activeKey);
    link.setAttribute("aria-current",key===activeKey?"step":"false");
  });
  document.querySelectorAll("[data-step-footer]").forEach(x=>x.remove());
  const sections=stepSections(activeKey);
  const last=sections[sections.length-1];
  if(last&&activeKey!=="payment"){
    const footer=document.createElement("div");
    footer.className="step-footer";
    footer.setAttribute("data-step-footer","");
    footer.innerHTML=`<button type="button" class="btn" data-step-back ${currentStep===0?"disabled":""}>Back</button><span class="step-counter">Step ${currentStep+1} of ${enabled.length}</span><button type="button" class="btn primary" data-step-next>${activeKey==="declaration"?"Review Declaration":"Save & Continue"}</button>`;
    last.appendChild(footer);
    footer.querySelector("[data-step-back]").onclick=()=>{
      if(currentStep>0){currentStep--;renderStep();window.scrollTo({top:0,behavior:"smooth"})}
    };
    footer.querySelector("[data-step-next]").onclick=async()=>{
      if(!validateCurrentStep(activeKey))return;
      const btn=footer.querySelector("[data-step-next]");
      btn.disabled=true;
      try{
        await save(false,true);
        if(currentStep<enabled.length-1){
          currentStep++;
          sessionStorage.setItem(stepStateKey,String(currentStep));
          renderStep();
          window.scrollTo({top:0,behavior:"smooth"});
        }else{
          document.querySelector("#declare")?.focus();
          showMsg($("#msg"),"Review the declaration carefully, then use Final Submit.");
        }
      }catch(e){
        showMsg($("#msg"),e.message||"Unable to save this step. Please try again.",true);
      }finally{btn.disabled=false}
    };
  }
  const isPayment=activeKey==="payment";
  document.querySelector("#appForm>.actions").style.display=isPayment?"flex":"none";
  const finalButton=document.querySelector("#finalSubmit");
  if(finalButton)finalButton.style.display=isPayment?"inline-flex":"none";
  const saveButton=document.querySelector('#appForm>.actions button[type="submit"]');
  if(saveButton)saveButton.style.display="none";
}

document.querySelector("#appForm").onsubmit=e=>{e.preventDefault();save(false)};
function showSubmissionSuccess(){
  const modal=document.querySelector("#submissionSuccessModal");if(!modal)return;
  const password=sessionStorage.getItem("candidatePassword")||"";
  document.querySelector("#successApplicationNumber").textContent=appNo;
  document.querySelector("#successApplicationPassword").textContent=password||"Your registration password";
  modal.hidden=false;document.body.classList.add("submission-modal-open");
}
document.querySelector("#finalSubmit").onclick=async()=>{
  if(enabledStepKeys()[currentStep]!=="payment"){
    showMsg($("#msg"),"Complete the application steps and payment before final submission.",true);return
  }
  await save(true)
};
document.querySelector("#successPrint")?.addEventListener("click",printApplication);
document.querySelector("#successClose")?.addEventListener("click",()=>{document.querySelector("#submissionSuccessModal")?.setAttribute("hidden","");document.body.classList.remove("submission-modal-open")});
document.querySelector("#submissionSuccessModal .submission-modal-backdrop")?.addEventListener("click",()=>{document.querySelector("#submissionSuccessModal")?.setAttribute("hidden","");document.body.classList.remove("submission-modal-open")});
function printableValue(value){if(value===null||value===undefined||value==="")return "—";if(Array.isArray(value))return value.join(", ");return String(value)}
function printApplication(){
  const password=sessionStorage.getItem("candidatePassword")||"";
  const sections=[
    ["Personal Details",[["Full Name",a.personal?.fullName],["Father Name",a.personal?.fatherName],["Mother Name",a.personal?.motherName],["Date of Birth",a.personal?.dob],["Gender",a.personal?.gender],["Category",a.personal?.category],["Marital Status",a.personal?.maritalStatus],["Nationality",a.personal?.nationality],["Domicile / State",a.personal?.domicile],["Aadhaar Number",a.personal?.aadhaar],["Other ID Type",a.personal?.otherIdType],["Other ID Number",a.personal?.otherIdNumber],["Mobile",a.personal?.mobile],["Email",a.personal?.email],["Alternate Mobile",a.personal?.alternateMobile],["Guardian Name",a.personal?.guardianName],["Guardian Relationship",a.personal?.guardianRelation],["Guardian Occupation",a.personal?.guardianOccupation],["Guardian Annual Income",a.personal?.guardianIncome]]],
    ["Address Details",[["House / Building No.",a.address?.house],["Village / Town / City",a.address?.city],["Post Office",a.address?.postOffice],["Police Station",a.address?.policeStation],["District",a.address?.district],["State",a.address?.state],["PIN Code",a.address?.pin],["Correspondence Address Different",a.address?.correspondenceDifferent],["Permanent Address",a.address?.permanentAddress],["Correspondence Address",a.address?.correspondenceAddress]]],
    ["Education & Educational Qualification",[["10th Board",a.education?.board10],["10th Passing Year",a.education?.year10],["10th Roll Number",a.education?.roll10],["10th Percentage / CGPA",a.education?.marks10],["12th Board",a.education?.board12],["12th Passing Year",a.education?.year12],["12th Roll Number",a.education?.roll12],["12th Percentage / CGPA",a.education?.marks12],["Graduation / Other Qualification",a.education?.graduation],["University",a.education?.university],["Applied Exam For",a.education?.examPost],["Teaching Subject / Subject Preference",a.education?.teachingSubject],["Exam Language / Medium",a.education?.examLanguage]]],
    ["Category Details",[["EWS Status",a.category?.ews],["OBC-NCL Status",a.category?.obcNcl],["PwBD / Disability",a.category?.pwbd],["Ex-Serviceman",a.category?.exServiceman],["Certificate Number",a.category?.certificateNo],["Certificate Issue Date",a.category?.certificateDate],["Certificate Issuing Authority",a.category?.certificateAuthority],["Certificate Validity",a.category?.certificateValidity]]],
    ["Other Details",[["Employment Status",a.other?.employment],["Government Employee",a.other?.governmentEmployee],["Employer / Organization",a.other?.employer],["Designation",a.other?.designation],["Employee ID",a.other?.employeeId],["Joining Date",a.other?.joiningDate],["NOC Required",a.other?.nocRequired],["Experience",a.other?.experience],["Identification / Visible Mark",a.other?.visibleMark]]],
    ["Documents & Uploads",[["Photograph",a.photoUrl?"Uploaded":"Not uploaded"],["Signature",a.signatureUrl?"Uploaded":"Not uploaded"],["Thumb Impression",a.thumbUrl?"Uploaded":"Not uploaded"],["Reservation Certificate",a.documents?.certificateUrl?"Uploaded":"Not uploaded"],["NOC Document",a.documents?.nocUrl?"Uploaded":"Not uploaded"],["Other Document",a.documents?.otherDocumentUrl?"Uploaded":"Not uploaded"]]],
    ["Declaration",[["Declaration Accepted",a.declarationAccepted?"Yes":"No"]]],
    ["Payment",[["Payment Status",a.paymentStatus],["Payment Amount",a.paymentOrderAmount?("₹"+(Number(a.paymentOrderAmount)/100).toFixed(2)):"—"],["Application Status",a.status],["Application Number",appNo]]]
  ];
  const customEntries=Object.entries(a.other?.customFields||{});
  if(customEntries.length)sections.splice(5,0,["Additional / Custom Details",customEntries.map(([id,value])=>{const field=customFields.find(x=>x.id===id);return [field?.name||id,value]})]);
  const rows=sections.map(([title,items])=>{const body=items.map(([label,value])=>"<tr><th>"+escapeHtml(label)+"</th><td>"+escapeHtml(printableValue(value))+"</td></tr>").join("");return "<section><h2>"+escapeHtml(title)+"</h2><table>"+body+"</table></section>"}).join("");
  const credential="<section class=\"credentials\"><h2>Candidate Login Details</h2><table><tr><th>Application Number</th><td>"+escapeHtml(appNo)+"</td></tr><tr><th>Password</th><td>"+escapeHtml(password||"Use the password created during registration")+"</td></tr></table><p>Keep your Application Number and Password safe. They are required for future login and Admit Card / Result download.</p></section>";
  const html="<!doctype html><html><head><meta charset=\"utf-8\"><title>Application "+escapeHtml(appNo)+"</title><style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#fff}.sheet{max-width:900px;margin:0 auto;padding:30px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #ff7a00;padding-bottom:16px;margin-bottom:22px}.brand{font-size:22px;font-weight:900;color:#0e376d}.meta{text-align:right;font-size:12px;color:#667085}.meta b{color:#172033}h1{font-size:24px;margin:0 0 5px}.subtitle{font-size:12px;color:#667085;margin:0}section{margin:0 0 22px;border:1px solid #dfe5ee;border-radius:10px;overflow:hidden;break-inside:avoid}h2{font-size:15px;margin:0;padding:11px 14px;background:#f5f8fc;color:#0e376d;border-bottom:1px solid #dfe5ee}table{width:100%;border-collapse:collapse}th,td{padding:8px 11px;border-bottom:1px solid #edf1f5;font-size:11px;text-align:left;vertical-align:top}th{width:36%;color:#526075;background:#fbfcfe;font-weight:700}tr:last-child th,tr:last-child td{border-bottom:0}.credentials{border:2px solid #0e376d}.credentials h2{background:#0e376d;color:#fff}.credentials p{font-size:11px;margin:0;padding:10px 12px;color:#526075}.print-btn{margin-bottom:20px}.footer{margin-top:25px;font-size:10px;color:#667085;text-align:center}@media print{.print-btn{display:none}.sheet{padding:0}.footer{margin-top:10px}}</style></head><body><div class=\"sheet\"><button class=\"print-btn\" onclick=\"window.print()\">Print / Save PDF</button><div class=\"head\"><div><div class=\"brand\">BOOKESH EXAM PORTAL</div><h1>Application Form</h1><p class=\"subtitle\">Final Submitted Application</p></div><div class=\"meta\"><div>Application No.</div><b>"+escapeHtml(appNo)+"</b><div style=\"margin-top:6px\">Status</div><b>"+escapeHtml(a.status||"Final Submitted")+"</b></div></div>"+credential+rows+"<div class=\"footer\">Please verify all details and keep this application record safely for future reference.</div></div></body></html>";
  const w=window.open("","_blank","noopener,noreferrer");
  if(!w){showMsg($("#msg"),"Please allow pop-ups for Print / Save Application.",true);return;}
  w.document.write(html);w.document.close();setTimeout(()=>w.focus(),100);
}
document.querySelector("#print").onclick=printApplication;
document.querySelector("#logout").onclick=async()=>{await signOut(auth);sessionStorage.clear();location.href="application.html"};

stepLinks().forEach(link=>{
  link.onclick=e=>{
    e.preventDefault();
    const key=link.dataset.sectionLink;
    const target=enabledStepKeys().indexOf(key);
    if(target<0)return;
    if(target>currentStep){
      showMsg($("#msg"),"Please complete the current step and use Save & Continue before moving ahead.",true);
      return;
    }
    currentStep=target;
    sessionStorage.setItem(stepStateKey,String(currentStep));
    renderStep();
    window.scrollTo({top:0,behavior:"smooth"});
  };
});

bindEducationControls();
window.scrollTo({top:0,behavior:"smooth"});
renderStep();
