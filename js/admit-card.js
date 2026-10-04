import {auth,db,doc,getDoc,signInWithEmailAndPassword,escapeHtml,showMsg,getSettings,examLifecycle} from "./firebase.js";

const $=s=>document.querySelector(s);
const preview=new URLSearchParams(location.search).get("preview");

const value=(x,fallback="—")=>x===undefined||x===null||x===""?fallback:String(x);
const joinAddress=(x)=>[x.centreAddress,x.centreCity,x.centreDistrict,x.centreState,x.centrePin].filter(Boolean).join(", ");
const imageOrPlaceholder=(url,label)=>url
  ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}">`
  : `<div class="admit-placeholder">${escapeHtml(label)}</div>`;

function instructionList(text){
  const raw=String(text||"Follow all instructions issued by the examination authority.").split(/\r?\n|•|\s*;\s*/).map(x=>x.trim()).filter(Boolean);
  return raw.map((item,i)=>`<div class="admit-instruction"><div class="no">${i+1}</div><div class="txt">${escapeHtml(item)}</div></div>`).join("");
}

async function render(n,x,a,exam=null){
  const p=a?.personal||{};
  const schedule={
    examDate:x.examDate||exam?.examDate||"",
    reportingTime:x.reportingTime||exam?.reportingTime||"",
    gateClosingTime:x.gateClosingTime||exam?.gateClosingTime||"",
    examTime:x.examTime||exam?.examTime||"",
    issueDate:x.issueDate||""
  };
  const examName=x.examName||exam?.examName||"Admit Card";
  const paper=x.paper||x.examPost||p.examPost||exam?.examName||"";
  const language=x.examLanguage||p.examLanguage||exam?.language||"";
  const instructions=x.instructions||exam?.instructions||"Follow all instructions issued by the examination authority.";
  const allowed=x.allowedItems||exam?.allowedItems||"Carry only permitted stationery. Mobile phones, smart watches, earphones and other unauthorised electronic devices are not permitted inside the examination hall.";
  const centreAddress=joinAddress(x);
  const logo="assets/bookesh-logo.png";
  const status=x.published?"PUBLISHED":"DRAFT";
  const photo=p.photoUrl||a.photoUrl||a.documents?.photoUrl||"";
  const signature=p.signatureUrl||a.signatureUrl||a.documents?.signatureUrl||"";
  $("#admitResult").innerHTML=`
    <div class="admit-page">
      <div class="admit-toolbar no-print"><button class="btn primary" id="downloadAdmit">Download / Print PDF</button></div>

      <article class="admit-sheet">
        <div class="admit-watermark"><span>BOOKESH</span></div>
        <div class="admit-content">
          <header class="admit-head">
            <img class="admit-logo" src="${logo}" alt="BOOKESH">
            <div class="admit-title">
              <h1>${escapeHtml(examName)}</h1>
              <p>Practice / Examination Admit Card</p>
              <p><b>BOOKESH EXAM PORTAL</b> · Candidate Examination Document</p>
            </div>
            <div class="admit-badge"><strong>CANDIDATE ADMIT CARD</strong>${escapeHtml(status)}<br>Version ${escapeHtml(value(x.version,1))}</div>
          </header>

          <div class="admit-alert">PLEASE CHECK ALL DETAILS CAREFULLY BEFORE THE EXAMINATION</div>

          <section class="admit-section">
            <div class="admit-section-title">CANDIDATE DETAILS</div>
            <div class="admit-grid">
              <div class="admit-field"><div class="admit-label">Candidate Name</div><div class="admit-value">${escapeHtml(value(x.candidateName||p.fullName))}</div></div>
              <div class="admit-field"><div class="admit-label">Application No.</div><div class="admit-value">${escapeHtml(n)}</div></div>
              <div class="admit-field"><div class="admit-label">Roll No.</div><div class="admit-value">${escapeHtml(value(x.rollNumber))}</div></div>
              <div class="admit-field"><div class="admit-label">Date of Birth</div><div class="admit-value">${escapeHtml(value(p.dob))}</div></div>
              <div class="admit-field"><div class="admit-label">Father's Name</div><div class="admit-value">${escapeHtml(value(x.fatherName||p.fatherName))}</div></div>
              <div class="admit-field"><div class="admit-label">Mother's Name</div><div class="admit-value">${escapeHtml(value(p.motherName))}</div></div>
              <div class="admit-field"><div class="admit-label">Gender</div><div class="admit-value">${escapeHtml(value(p.gender))}</div></div>
              <div class="admit-field"><div class="admit-label">Category</div><div class="admit-value">${escapeHtml(value(p.category))}</div></div>
              <div class="admit-field"><div class="admit-label">Mobile No.</div><div class="admit-value">${escapeHtml(value(p.mobile))}</div></div>
              <div class="admit-field"><div class="admit-label">Candidate ID</div><div class="admit-value">${escapeHtml(value(a.candidateId||n))}</div></div>
            </div>
          </section>

          <div class="admit-schedule" style="margin-top:12px">
            <div><span>Exam Date</span><b>${escapeHtml(value(schedule.examDate))}</b></div>
            <div><span>Reporting Time</span><b>${escapeHtml(value(schedule.reportingTime))}</b></div>
            <div><span>Gate Closing</span><b>${escapeHtml(value(schedule.gateClosingTime))}</b></div>
            <div><span>Exam Time</span><b>${escapeHtml(value(schedule.examTime))}</b></div>
          </div>

          <section class="admit-section">
            <div class="admit-section-title">EXAMINATION CENTRE</div>
            <div class="admit-centre">
              <div class="admit-centre-main">
                <h3>${escapeHtml(value(x.centreName))}</h3>
                <p>${escapeHtml(value(centreAddress))}</p>
              </div>
              <div class="admit-centre-side">
                <b>CENTRE CODE</b><div>${escapeHtml(value(x.centreCode))}</div>
                <b style="margin-top:12px">PAPER / EXAM POST</b><div>${escapeHtml(value(paper))}</div>
                <b style="margin-top:12px">EXAM LANGUAGE</b><div>${escapeHtml(value(language))}</div>
              </div>
            </div>
          </section>

          <div class="admit-photo-row">
            <div class="admit-photo-box"><h4>Applicant Photograph</h4>${imageOrPlaceholder(photo,"Passport-size photograph")}</div>
            <div class="admit-photo-box"><h4>Candidate Signature</h4>${imageOrPlaceholder(signature,"Candidate signature")}</div>
            <div class="admit-photo-box"><h4>Verification</h4><div style="padding-top:8px">Invigilator: __________________<br><br>Signature: __________________</div></div>
          </div>

          <div class="admit-footer-grid">
            <div><b>Required ID</b><br>${escapeHtml(value(x.requiredId||exam?.requiredId,"Valid Government Photo ID"))}</div>
            <div><b>Issue Date</b><br>${escapeHtml(value(schedule.issueDate))}</div>
          </div>

          <div class="admit-note">BOOKESH EXAM PORTAL • Keep this admit card safely and carry it to the examination centre.</div>
        </div>
      </article>

      <article class="admit-sheet page-two">
        <div class="admit-watermark"><span>BOOKESH</span></div>
        <div class="admit-content">
          <header style="text-align:center;border-bottom:4px solid var(--admit-orange);padding-bottom:14px">
            <h1 style="margin:0;color:var(--admit-navy);font-size:28px">${escapeHtml(examName)}</h1>
            <h2 style="margin:4px 0 0;color:var(--admit-blue);font-size:17px">IMPORTANT INSTRUCTIONS & CANDIDATE DECLARATION</h2>
          </header>

          <section class="admit-section">
            <div class="admit-section-title">EXAMINATION INSTRUCTIONS</div>
            <div class="admit-instructions">${instructionList(instructions)}</div>
          </section>

          <section class="admit-section">
            <div class="admit-section-title">ALLOWED / RESTRICTED ITEMS</div>
            <div class="admit-declaration">${escapeHtml(allowed)}</div>
          </section>

          <section class="admit-section">
            <div class="admit-section-title">CANDIDATE DECLARATION & SIGNATURE</div>
            <div class="admit-declaration">I hereby declare that I have read and understood the instructions, rules and conditions applicable to this examination. I agree to follow the directions of the examination staff and confirm that the information provided in my application is correct.</div>
            <div class="admit-sign-grid">
              <div class="admit-sign-cell">Applicant / Candidate Signature<div class="admit-sign-line"></div></div>
              <div class="admit-sign-cell">Date<div class="admit-sign-line"></div></div>
            </div>
          </section>

          <div class="admit-footer-grid">
            <div><b>BOOKESH EXAM PORTAL</b><br>Learn. Test. Improve. — Built for Students.<br>Website: www.bookesh.co</div>
            <div><b>Candidate Support</b><br>bookeshonline@gmail.com<br>+91 82988 27705</div>
          </div>
          <div class="admit-note">This document is generated from the candidate's approved application and the examination/centre settings configured by the administrator.</div>
        </div>
      </article>
    </div>`;
  $("#downloadAdmit").onclick=()=>window.print();
}

async function openAdmit(n,settings){
  const a=await getDoc(doc(db,"applications",n));
  if(!a.exists()){showMsg($("#admitMsg"),"Application not found.",true);return}
  const app=a.data();
  const examSnap=await getDoc(doc(db,"exams",app.examId||settings.activeExamId||"default"));
  const exam=examSnap.exists()?{id:examSnap.id,...examSnap.data()}:null;
  const life=examLifecycle(exam);
  const releaseConfigured=!!(exam?.admitReleaseMs??exam?.admitRelease);
  const released=life.admitReleased===true;
  const publishAllowed=releaseConfigured?released:settings.admitCardPublished===true;
  if(!publishAllowed){showMsg($("#admitMsg"),"Admit Cards are not currently released.",true);return}
  const s=await getDoc(doc(db,"admitCards",n));
  if(!s.exists()||s.data().published!==true){showMsg($("#admitMsg"),"Admit Card has not been released yet.",true);return}
  await render(n,s.data(),app,exam);
}

$("#admitLogin").onsubmit=async e=>{
  e.preventDefault();
  const settings=await getSettings();
  if(settings.maintenanceMode){showMsg($("#admitMsg"),"Portal is under maintenance.",true);return}
  const n=$("#admitApp").value.trim().toUpperCase();
  try{
    await signInWithEmailAndPassword(auth,`${n.toLowerCase()}@candidate.examportal.local`,$("#admitPass").value);
    await openAdmit(n,settings);
  }catch(e){
    showMsg($("#admitMsg"),"Unable to open admit card. Check login details.",true);
  }
};

if(preview){
  (async()=>{
    try{
      const s=await getDoc(doc(db,"admitCards",preview));
      const a=await getDoc(doc(db,"applications",preview));
      if(s.exists()&&a.exists()){
        const app=a.data();
        const examSnap=await getDoc(doc(db,"exams",app.examId||"default"));
        const exam=examSnap.exists()?{id:examSnap.id,...examSnap.data()}:null;
        await render(preview,s.data(),app,exam);
      }
    }catch(e){}
  })();
}