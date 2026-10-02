import {auth,db,storage,doc,getDoc,updateDoc,serverTimestamp,signOut,escapeHtml,showMsg,ref,uploadBytes,getDownloadURL,onAuthStateChanged,getDocs,collection,getSettings,getActiveExam,examLifecycle} from "./firebase.js";
import {functions} from "./firebase-config.js";
import {httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
const $=s=>document.querySelector(s); const appNo=sessionStorage.getItem("candidateApp"),root=document.querySelector("#dash");if(!appNo){location.replace("application.html");throw new Error("No application")};const user=await new Promise(resolve=>{const off=onAuthStateChanged(auth,u=>{off();resolve(u)})});if(!user){sessionStorage.clear();location.href="application.html";throw new Error("Not authenticated")};const snap=await getDoc(doc(db,"applications",appNo));if(!snap.exists()||snap.data().authUid!==user.uid){root.innerHTML='<div class="card">Application not found or access denied.</div>';throw 0}const a=snap.data(); const settings=await getSettings(); const formFieldEnabled=settings.formFieldEnabled||{}; const formSections={personal:settings.formSections?.personal!==false,address:settings.formSections?.address!==false,education:settings.formSections?.education!==false,category:settings.formSections?.category!==false,photo:settings.formSections?.photo!==false,documents:settings.formSections?.documents!==false,declaration:settings.formSections?.declaration!==false,payment:true}; const enabledField=key=>formFieldEnabled[key]!==false; const sectionMeta=[["personal","Personal Details"],["address","Address Details"],["education","Education & Educational Qualification"],["category","Category / Other Details"],["documents","Documents"],["declaration","Declaration"],["payment","Payment"]]; const enabledSections=sectionMeta.filter(([key])=>formSections[key]); const examSnap=await getDoc(doc(db,"exams",a.examId||settings.activeExamId||"default")); const exam=examSnap.exists()?{id:examSnap.id,...examSnap.data()}:null; const life=examLifecycle(exam); const locked=a.status==="Final Submitted"; const correctionMode=a.status==="Correction Required"&&life.correctionOpen; const customSnap=await getDocs(collection(db,"customFields")); const customFields=customSnap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.visible!==false).sort((x,y)=>(x.order||100)-(y.order||100)); const docSnap=await getDocs(collection(db,"documents")); const documentRules=docSnap.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>(x.order||0)-(y.order||0)); if(settings.maintenanceMode){root.innerHTML=`<div class="card"><h1>Portal Under Maintenance</h1><p>Please try again later.</p></div>`;throw 0}
const v=(obj,key)=>escapeHtml(obj?.[key]||"");
const paymentRequired=exam?.paymentRequired!==false;
const paymentFee=Number(exam?.fee||0);
const paymentPanel=paymentRequired
  ? (a.paymentStatus==="Successful"
    ? `<div class="card payment-card"><span class="eyebrow">PAYMENT</span><h2>Payment Successful</h2><p class="muted">Your application payment has been verified. You can now use Final Submit.</p><p><b>Amount:</b> ₹${paymentFee.toFixed(2)}</p></div>`
    : `<div class="card payment-card"><span class="eyebrow">PAYMENT REQUIRED</span><h2>Complete Application Payment</h2><p class="muted">Payment must be successfully verified before Final Submit.</p><p><b>Application Fee:</b> ₹${paymentFee.toFixed(2)}</p><button class="btn primary" type="button" id="payNow" ${paymentFee>0?"":"disabled"}>${paymentFee>0?"Pay Now":"Payment fee is not configured"}</button><p id="paymentMsg" class="message"></p></div>`)
  : `<div class="card payment-card"><span class="eyebrow">PAYMENT</span><h2>No Payment Required</h2><p class="muted">This exam is configured without an application payment.</p></div>`;
root.innerHTML=`<div class="card"><h1>Application Dashboard</h1><p>Application Number: <b>${escapeHtml(appNo)}</b></p><p>Status: <b>${escapeHtml(a.status||"Application Incomplete")}</b></p><p>Payment: <b>${escapeHtml(a.paymentStatus||"Pending")}</b></p></div><div class="application-layout"><aside class="application-sidebar"><div class="sidebar-title">Application Steps</div>${enabledSections.map(([key,label],i)=>`<a href="#section-${key}" class="section-link ${i===0?"active":""}" data-section-link="${key}"><span>${String(i+1).padStart(2,"0")}</span>${label}</a>`).join("")}</aside><form id="appForm" class="card application-form">${sec("1. Personal Details",`<div class="form-grid">${f("Full Name","fullName",v(a.personal,"fullName"),"required")}${f("Father's Name","fatherName",v(a.personal,"fatherName"))}${f("Mother's Name","motherName",v(a.personal,"motherName"))}${f("Date of Birth","dob",v(a.personal,"dob"),"type=date required")}${sel("Gender","gender",["Male","Female","Other"],a.personal?.gender)}${sel("Category","category",["UR","OBC","SC","ST","EWS"],a.personal?.category)}${sel("Marital Status","maritalStatus",["Unmarried","Married","Other"],a.personal?.maritalStatus)}${f("Nationality","nationality",v(a.personal,"nationality")||"Indian")}${f("Domicile / State","domicile",v(a.personal,"domicile"))}${f("Aadhaar Number","aadhaar",v(a.personal,"aadhaar"),"inputmode=\"numeric\" maxlength=\"12\"")}${f("Other ID Type","otherIdType",v(a.personal,"otherIdType"))}${f("Other ID Number","otherIdNumber",v(a.personal,"otherIdNumber"))}${f("Mobile","mobile",v(a.personal,"mobile"),"inputmode=\"numeric\" maxlength=\"10\"")}${f("Email","email",v(a.personal,"email"),"type=\"email\"")}${f("Alternate Mobile","alternateMobile",v(a.personal,"alternateMobile"))}${f("Exam/Post Applied For","examPost",v(a.personal,"examPost"))}${f("Exam Language / Medium","examLanguage",v(a.personal,"examLanguage"))}${f("Guardian Name","guardianName",v(a.personal,"guardianName"))}${f("Guardian Relationship","guardianRelation",v(a.personal,"guardianRelation"))}${f("Guardian Occupation","guardianOccupation",v(a.personal,"guardianOccupation"))}${f("Guardian Annual Income","guardianIncome",v(a.personal,"guardianIncome"))}</div>`)}${sec("2. Address Details",`<div class="form-grid">${f("House/Building No.","house",v(a.address,"house"))}${f("Village/Town/City","city",v(a.address,"city"))}${f("Post Office","postOffice",v(a.address,"postOffice"))}${f("Police Station","policeStation",v(a.address,"policeStation"))}${f("District","district",v(a.address,"district"))}${f("State","state",v(a.address,"state"))}${f("PIN Code","pin",v(a.address,"pin"),"inputmode=\"numeric\" maxlength=\"6\"")}${f("Permanent Address","permanentAddress",v(a.address,"permanentAddress"))}${f("Correspondence Address","correspondenceAddress",v(a.address,"correspondenceAddress"))}</div>`)}${sec("3. Education Details",`<div class="form-grid">${f("10th Board","board10",v(a.education,"board10"))}${f("10th Passing Year","year10",v(a.education,"year10"))}${f("10th Roll Number","roll10",v(a.education,"roll10"))}${f("10th Percentage/CGPA","marks10",v(a.education,"marks10"))}${f("12th Board","board12",v(a.education,"board12"))}${f("12th Passing Year","year12",v(a.education,"year12"))}${f("12th Roll Number","roll12",v(a.education,"roll12"))}${f("12th Percentage/CGPA","marks12",v(a.education,"marks12"))}${f("Graduation / Other Qualification","graduation",v(a.education,"graduation"))}${f("University","university",v(a.education,"university"))}</div>`)}${sec("4. Category / Other Details",`<div class="form-grid">${f("EWS Status","ews",v(a.category,"ews"))}${f("OBC-NCL Status","obcNcl",v(a.category,"obcNcl"))}${f("PwBD / Disability","pwbd",v(a.category,"pwbd"))}${f("Ex-Serviceman","exServiceman",v(a.category,"exServiceman"))}${f("Certificate Number","certificateNo",v(a.category,"certificateNo"))}${f("Certificate Issue Date","certificateDate",v(a.category,"certificateDate"),"type=date")}${f("Certificate Issuing Authority","certificateAuthority",v(a.category,"certificateAuthority"))}${f("Certificate Validity","certificateValidity",v(a.category,"certificateValidity"),"type=date")}${f("Employment Status","employment",v(a.other,"employment"))}${f("Government Employee","governmentEmployee",v(a.other,"governmentEmployee"))}${f("Employer / Organization","employer",v(a.other,"employer"))}${f("Designation","designation",v(a.other,"designation"))}${f("Employee ID","employeeId",v(a.other,"employeeId"))}${f("Joining Date","joiningDate",v(a.other,"joiningDate"),"type=date")}${f("NOC Required","nocRequired",v(a.other,"nocRequired"))}${f("Experience","experience",v(a.other,"experience"))}${f("Identification / Visible Mark","visibleMark",v(a.other,"visibleMark"))}</div>`)}${sec("5. Photo & Signature",`<div class="form-grid">${enabledField("photo")?`<label>Photograph<input id="photo" type="file" accept="image/*" ${locked?"disabled":""}></label>`:""}${enabledField("signature")?`<label>Signature<input id="signature" type="file" accept="image/*" ${locked?"disabled":""}></label>`:""}${enabledField("thumb")?`<label>Thumb Impression<input id="thumb" type="file" accept="image/*" ${locked?"disabled":""}></label>`:""}</div><p class="muted">Files upload to Firebase Storage when Storage is enabled.</p>`)}${sec("6. Documents",`<div class="form-grid"><label>Reservation Certificate<input id="certificateFile" type="file" accept=".pdf,image/*" ${locked?"disabled":""}></label><label>NOC Document<input id="nocFile" type="file" accept=".pdf,image/*" ${locked?"disabled":""}></label><label>Other Document<input id="otherFile" type="file" accept=".pdf,image/*" ${locked?"disabled":""}></label></div>`)}${customFields.length?sec("5A. Additional Details",`<div class="form-grid">${customFields.map(x=>customField(x,a.other?.customFields?.[x.id]||"")).join("")}</div>`):""}${documentRules.length?sec("6A. Additional Documents",`<div class="form-grid">${documentRules.map(x=>documentField(x,a.documents?.["document_"+x.id]||"")).join("")}</div>`):""}${sec("7. Declaration / घोषणा",`<div class="declaration-box"><div class="declaration-intro"><h3>Candidate Declaration / अभ्यर्थी घोषणा</h3><p>Please read all terms carefully before accepting the declaration. / घोषणा स्वीकार करने से पहले सभी नियम एवं शर्तें ध्यानपूर्वक पढ़ें।</p></div><ol class="declaration-terms"><li><b>Attendance &amp; Refund / उपस्थिति एवं रिफंड:</b> After submitting the application/form, if the candidate does not appear for the scheduled offline mock examination, the applicable examination fee/amount will not be refunded, subject to the applicable payment/refund policy. / आवेदन/फॉर्म जमा करने के बाद यदि अभ्यर्थी निर्धारित ऑफलाइन मॉक परीक्षा में उपस्थित नहीं होता है, तो लागू परीक्षा शुल्क/राशि वापस नहीं की जाएगी, संबंधित भुगतान/रिफंड नीति के अधीन।</li><li><b>Correct Information &amp; Documents / सही जानकारी एवं दस्तावेज:</b> The candidate is responsible for providing correct and complete information and valid documents. If any incorrect, misleading, incomplete or unverifiable information/document is found, the candidate may be denied entry or may be disqualified from the examination. / अभ्यर्थी द्वारा सही एवं पूर्ण जानकारी तथा वैध दस्तावेज देना आवश्यक है। किसी भी गलत, भ्रामक, अधूरी या सत्यापित न हो सकने वाली जानकारी/दस्तावेज पाए जाने पर परीक्षा में प्रवेश रोका जा सकता है या अभ्यर्थी को परीक्षा से अयोग्य घोषित किया जा सकता है।</li><li><b>Discipline &amp; Fair Conduct / अनुशासन एवं निष्पक्ष आचरण:</b> Cheating, use of unfair means, impersonation, sharing answers, disturbing other candidates, misconduct, or any attempt to disrupt the examination process may result in removal from the examination and/or cancellation of candidature, without prejudice to other applicable action. / नकल, अनुचित साधनों का उपयोग, किसी अन्य व्यक्ति के स्थान पर परीक्षा देना, उत्तर साझा करना, अन्य अभ्यर्थियों को परेशान करना, अनुशासनहीनता या परीक्षा प्रक्रिया को बाधित करने का प्रयास करने पर अभ्यर्थी को परीक्षा से बाहर किया जा सकता है और/या उसकी अभ्यर्थिता रद्द की जा सकती है।</li><li><b>Mock Examination Disclaimer / मॉक परीक्षा संबंधी अस्वीकरण:</b> This is a practice/mock examination intended to provide preparation and a real-exam-like environment. No representation or guarantee is made that the questions in this mock examination will appear in the actual JTET or any other real examination. / यह एक अभ्यास/मॉक परीक्षा है, जिसका उद्देश्य तैयारी कराना और वास्तविक परीक्षा जैसा वातावरण उपलब्ध कराना है। इस मॉक परीक्षा में दिए गए प्रश्न वास्तविक JTET या किसी अन्य वास्तविक परीक्षा में आएंगे, इसकी कोई गारंटी या दावा नहीं किया जाता है।</li><li><b>Examination Instructions / परीक्षा निर्देश:</b> Candidates must follow the instructions issued by the examination authority/centre staff, carry required documents, report on time, and maintain proper conduct throughout the examination. Failure to follow instructions may lead to denial of entry or removal from the examination. / अभ्यर्थी को परीक्षा प्राधिकरण/केंद्र के निर्देशों का पालन करना, आवश्यक दस्तावेज साथ लाना, समय पर उपस्थित होना और पूरी परीक्षा के दौरान उचित आचरण बनाए रखना अनिवार्य है। निर्देशों का पालन न करने पर प्रवेश रोका जा सकता है या परीक्षा से बाहर किया जा सकता है।</li><li><b>Final Responsibility / अंतिम जिम्मेदारी:</b> The candidate confirms that they have read, understood and accepted these terms and that the information submitted in the application is true to the best of their knowledge. / अभ्यर्थी पुष्टि करता/करती है कि उसने इन नियमों एवं शर्तों को पढ़, समझ और स्वीकार कर लिया है तथा आवेदन में दी गई जानकारी उसकी सर्वोत्तम जानकारी के अनुसार सत्य है।</li></ol><label class="check declaration-accept"><input id="declare" type="checkbox" ${a.declarationAccepted?"checked":""} ${locked?"disabled":""} required> <span><b>I Agree / मैं सहमत हूँ:</b> I have read and accept all the above terms and conditions and declare that the information provided by me is true and correct. / मैंने ऊपर दी गई सभी नियम एवं शर्तें पढ़ ली हैं और उन्हें स्वीकार करता/करती हूँ तथा घोषणा करता/करती हूँ कि मेरे द्वारा दी गई जानकारी सत्य एवं सही है।</span></label>`)}${sec("8. Payment",paymentPanel)}<div class="actions"><button class="btn" type="submit" ${locked?"disabled":""}>Save Application</button><button class="btn primary" type="button" id="finalSubmit" ${locked?"disabled":""}>Final Submit</button><button class="btn" type="button" id="print">Print / Save PDF</button></div><p id="msg" class="message"></p></form></div>`;
async function loadRazorpayCheckout(){
  if(window.Razorpay)return;
  await new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://checkout.razorpay.com/v1/checkout.js";
    s.async=true;s.onload=resolve;s.onerror=()=>reject(new Error("Razorpay Checkout could not be loaded."));
    document.head.appendChild(s);
  });
}
async function startPayment(){
  const btn=document.querySelector("#payNow"),msg=document.querySelector("#paymentMsg");
  if(!btn||paymentFee<=0)return;
  btn.disabled=true;showMsg(msg,"Creating secure payment order...");
  try{
    const createOrder=httpsCallable(functions,"createRazorpayOrder");
    const verifyPayment=httpsCallable(functions,"verifyRazorpayPayment");
    const order=(await createOrder({applicationNumber:appNo})).data;
    await loadRazorpayCheckout();
    const rzp=new window.Razorpay({
      key:order.keyId,amount:order.amount,currency:order.currency,
      name:settings.portalName||"Exam Portal",description:order.description||"Application Fee",order_id:order.orderId,
      prefill:{name:a.personal?.fullName||"",email:a.personal?.email||"",contact:a.personal?.mobile||""},
      notes:{applicationNumber:appNo},
      handler:async response=>{
        try{
          showMsg(msg,"Verifying payment securely...");
          await verifyPayment({applicationNumber:appNo,orderId:response.razorpay_order_id,paymentId:response.razorpay_payment_id,signature:response.razorpay_signature});
          location.reload();
        }catch(e){btn.disabled=false;showMsg(msg,e?.message||"Payment verification failed. Please contact support.",true);}
      },
      modal:{ondismiss:()=>{btn.disabled=false;showMsg(msg,"Payment window closed. You can retry when ready.");}}
    });
    rzp.on("payment.failed",response=>{btn.disabled=false;showMsg(msg,response?.error?.description||"Payment failed. Please retry.",true);});
    rzp.open();
  }catch(e){btn.disabled=false;showMsg(msg,e?.message||"Unable to start payment. Please try again.",true);}
}
document.querySelector("#payNow")?.addEventListener("click",startPayment);
function sec(t,b){const n=String(t||"");const key=n.startsWith("1.")?"personal":n.startsWith("2.")?"address":n.startsWith("3.")?"education":n.startsWith("4.")||n.startsWith("5A.")?"category":n.startsWith("5.")||n.startsWith("6.")||n.startsWith("6A.")?"documents":n.startsWith("7.")?"declaration":null;if(n.startsWith("5.")&&!formSections.photo)return "";if((n.startsWith("6.")||n.startsWith("6A."))&&!formSections.documents)return "";if(n.startsWith("5A.")&&!formSections.category)return "";if(key&&!formSections[key]&&key!=="documents-supporting")return "";const id=key||"extra";return `<section id="section-${id}" class="application-section" data-section="${id}"><h2 class="section-title">${t}</h2>${b}</section>`}function customField(x,val=""){const n="custom_"+x.id,base=x.type==="Textarea"?`<textarea name="${n}" placeholder="${escapeHtml(x.placeholder||"")}" ${x.required?"required":""} ${x.locked||locked?"disabled":""}>${escapeHtml(val)}</textarea>`:x.type==="Dropdown"||x.type==="Radio"||x.type==="Yes/No"||x.type==="Multi-select"?`<select name="${n}" ${x.type==="Multi-select"?"multiple":""} ${x.required?"required":""} ${x.locked||locked?"disabled":""}>${(x.options?.length?x.options:(x.type==="Yes/No"?["Yes","No"]:[""])).map(o=>`<option value="${escapeHtml(o)}" ${(Array.isArray(val)?val.map(String).includes(String(o)):String(o)===String(val))?"selected":""}>${escapeHtml(o)}</option>`).join("")}</select>`:`<input name="${n}" type="${x.type==="Number"?"number":x.type==="Date"?"date":"text"}" value="${escapeHtml(val)}" placeholder="${escapeHtml(x.placeholder||"")}" ${x.validation?`pattern="${escapeHtml(x.validation)}"`:""} ${x.required?"required":""} ${x.locked||locked?"disabled":""}>`;return `<label>${escapeHtml(x.name||x.key||"Custom Field")}${base}${x.helpText?`<small>${escapeHtml(x.helpText)}</small>`:""}</label>`}function documentField(x,val=""){const accept=x.fileType==="PDF"?".pdf":x.fileType==="JPG"?".jpg,.jpeg":x.fileType==="PNG"?".png":x.fileType==="PDF/JPG/PNG"?".pdf,.jpg,.jpeg,.png":"";return `<label>${escapeHtml(x.name)}<input id="customDoc_${x.id}" type="file" accept="${accept}" ${x.required&&!val?"required":""} ${locked?"disabled":""}><small>${x.required?"Required":"Optional"} • Max ${escapeHtml(x.maxSize||2)} MB${x.dimensions?` • ${escapeHtml(x.dimensions)}`:""}</small>${val?`<a href="${escapeHtml(val)}" target="_blank" rel="noopener">View uploaded file</a>`:""}</label>`}function f(l,n,val,extra=""){if(!enabledField(n))return `<input type="hidden" name="${n}" value="${val}">`;return `<label>${l}<input name="${n}" value="${val}" ${extra} ${locked?"disabled":""}></label>`}function sel(l,n,o,val){if(!enabledField(n))return `<input type="hidden" name="${n}" value="${escapeHtml(val??"")}">`;return `<label>${l}<select name="${n}" ${locked?"disabled":""}>${o.map(x=>`<option ${x===val?"selected":""}>${x}</option>`).join("")}</select></label>`}
async function upload(id,maxMB=10){const file=document.querySelector("#"+id)?.files[0];if(!file)return null;if(file.size>maxMB*1024*1024)throw new Error(`File must be ${maxMB} MB or smaller.`);const allowed=["image/jpeg","image/png","image/webp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];if(!allowed.includes(file.type))throw new Error("Unsupported file type.");const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const r=ref(storage,`applications/${appNo}/${Date.now()}_${safe}`);await uploadBytes(r,file);return await getDownloadURL(r)}
function aadhaarValid(v){const s=String(v||"").replace(/\s/g,"");if(!/^\d{12}$/.test(s)||/^0{12}$/.test(s))return false;const d=[[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,8,5,9,6,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,6,7,8,5,4,3,2,1,0]],p=[[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,3,0,4,5,2,7],[9,4,5,3,1,2,8,6,7,0],[4,2,8,6,5,7,9,3,0,1],[2,7,9,3,0,1,6,8,5,4],[7,0,4,6,9,5,1,2,3,8]];let c=0;for(let i=0;i<s.length;i++)c=d[c][p[(s.length-1-i)%8][Number(s[i])]];return c===0}
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
async function save(final=false,stepSave=false){const form=document.querySelector("#appForm");if(locked){showMsg($("#msg"),"Application is already finally submitted and cannot be edited.",true);return}if(a.status==="Correction Required"&&!correctionMode){showMsg($("#msg"),"Correction window is not currently open.",true);return}if(!stepSave&&!form.reportValidity())return;const fd=new FormData(document.querySelector("#appForm"));const x=Object.fromEntries(fd.entries());for(const cf of customFields.filter(f=>f.type==="Multi-select")){x["custom_"+cf.id]=Array.from(document.querySelector(`[name="custom_${cf.id}"]`)?.selectedOptions||[]).map(o=>o.value)}if(!stepSave&&(!validateCustomFields(x)||!validateData(x)))return;const update={personal:{fullName:x.fullName,fatherName:x.fatherName,motherName:x.motherName,dob:x.dob,gender:x.gender,category:x.category,maritalStatus:x.maritalStatus,nationality:x.nationality,domicile:x.domicile,aadhaar:x.aadhaar,otherIdType:x.otherIdType,otherIdNumber:x.otherIdNumber,mobile:x.mobile,email:x.email,alternateMobile:x.alternateMobile,examPost:x.examPost,examLanguage:x.examLanguage,guardianName:x.guardianName,guardianRelation:x.guardianRelation,guardianOccupation:x.guardianOccupation,guardianIncome:x.guardianIncome},address:{house:x.house,city:x.city,postOffice:x.postOffice,policeStation:x.policeStation,district:x.district,state:x.state,pin:x.pin,permanentAddress:x.permanentAddress,correspondenceAddress:x.correspondenceAddress},education:{board10:x.board10,year10:x.year10,roll10:x.roll10,marks10:x.marks10,board12:x.board12,year12:x.year12,roll12:x.roll12,marks12:x.marks12,graduation:x.graduation,university:x.university},category:{ews:x.ews,obcNcl:x.obcNcl,pwbd:x.pwbd,exServiceman:x.exServiceman,certificateNo:x.certificateNo,certificateDate:x.certificateDate,certificateAuthority:x.certificateAuthority,certificateValidity:x.certificateValidity},other:{employment:x.employment,governmentEmployee:x.governmentEmployee,employer:x.employer,designation:x.designation,employeeId:x.employeeId,joiningDate:x.joiningDate,nocRequired:x.nocRequired,experience:x.experience,visibleMark:x.visibleMark,customFields:{...Object.fromEntries(customFields.map(c=>[c.id,(c.locked||c.visible===false)?a.other?.customFields?.[c.id]:x["custom_"+c.id]]))}},declarationAccepted:document.querySelector("#declare")?.checked??!!a.declarationAccepted,updatedAt:serverTimestamp()};for(const [id,key,max] of [["photo","photoUrl",10],["signature","signatureUrl",10],["thumb","thumbUrl",10],["certificateFile","certificateUrl",10],["nocFile","nocUrl",10],["otherFile","otherDocumentUrl",10],...documentRules.map(d=>["customDoc_"+d.id,"document_"+d.id,Number(d.maxSize||2)])]){const file=document.querySelector("#"+id)?.files[0];if(!file)continue;try{const u=await upload(id,max);if(u)update.documents={...(update.documents||{}),[key]:u}}catch(e){showMsg($("#msg"),e.message||"File upload failed. Please try again.",true);return}}if(final){if(a.status==="Correction Required"&&!correctionMode){showMsg($("#msg"),"Correction window is not currently open.",true);return}if(formSections.declaration&&!update.declarationAccepted){showMsg($("#msg"),"Accept the declaration before final submission.",true);return}if(exam?.paymentRequired!==false&&a.paymentStatus!=="Successful"){showMsg($("#msg"),"Payment must be successful before final submission.",true);return}update.status="Final Submitted";update.finalSubmittedAt=serverTimestamp()}await updateDoc(doc(db,"applications",appNo),update);showMsg($("#msg"),final?"Application finally submitted.":"Application saved.");if(final)setTimeout(()=>location.reload(),500)}
const stepKeys=["personal","address","education","category","documents","declaration","payment"];
const stepLabels={
  personal:"Personal Details",
  address:"Address Details",
  education:"Education & Educational Qualification",
  category:"Category / Other Details",
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
    const fd=new FormData(form);
    const x=Object.fromEntries(fd.entries());
    if(!validateData(x))return false;
  }
  if(key==="category"){
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
  const saveButton=document.querySelector("#appForm>.actions button[type="submit"]");
  if(saveButton)saveButton.style.display="none";
}
document.querySelector("#appForm").onsubmit=e=>{e.preventDefault();save(false)};
document.querySelector("#finalSubmit").onclick=async()=>{if(enabledStepKeys()[currentStep]!=="payment"){showMsg($("#msg"),"Complete the application steps and payment before final submission.",true);return}await save(true)};
document.querySelector("#print").onclick=()=>window.print();
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
window.scrollTo({top:0,behavior:"smooth"});
renderStep();
