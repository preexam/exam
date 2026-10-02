import {auth,db,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,query,where,orderBy,limit,serverTimestamp,writeBatch,runTransaction,signInWithEmailAndPassword,signOut,onAuthStateChanged,updatePassword,escapeHtml,showMsg,downloadText,toDate,getSettings,getActiveExam,examLifecycle,isAdminUser,defaultEducationQualification} from "./firebase.js";

const $=s=>document.querySelector(s);
const panel=$("#panel");
let me=null, adminData=null, currentTab="dashboard", examCache=[];

const TAB_GROUPS=[
  {label:"Dashboard",items:[["dashboard","Dashboard","dashboard"]]},
  {
    label:"Exams",
    items:[
      ["exams","Exam Management","exams"],
      ["results","Results","results"],
      ["centres","Centres & Roll","centres"]
    ]
  },
  {
    label:"Applications",
    items:[
      ["candidates","Candidates","applications"],
      ["applications","Applications","applications"],
      ["payments","Payments","payments"],
      ["documents","Documents","documents"],
      ["admit","Admit Cards","admit"]
    ]
  },
  {
    label:"Form & Portal",
    items:[
      ["form","Form Builder","formBuilder"],
      ["notices","Notices","notices"],
      ["settings","Portal & Security","settings"]
    ]
  },
  {label:"Reports",items:[["reports","Reports & Export","reports"]]},
  {
    label:"Administration",
    items:[
      ["admins","Admin Roles","adminUsers"],
      ["audit","Audit Log","audit"]
    ]
  }
];

const TAB_LABELS=Object.fromEntries(
  TAB_GROUPS.flatMap(group=>group.items.map(([id,label])=>[id,label]))
);

const has=p=>
  adminData?.permissions?.all===true||
  adminData?.permissions?.[p]===true||
  adminData?.role==="superadmin";

function esc(v){
  return escapeHtml(v??"");
}

function formObj(form){
  return Object.fromEntries(new FormData(form).entries());
}

function bool(form,n){
  return !!form.querySelector(`[name="${n}"]`)?.checked;
}

async function log(action,candidate="",details={}){
  try{
    await addDoc(collection(db,"auditLogs"),{
      adminUid:me.uid,
      admin:adminData?.name||me.email,
      action,
      candidate:String(candidate||""),
      details,
      createdAt:serverTimestamp(),
      time:new Date().toISOString()
    });
  }catch(e){
    console.warn("audit",e);
  }
}

function guard(permission){
  if(!has(permission)){
    panel.innerHTML=`
      <div class="card">
        <h2>Permission denied</h2>
        <p>Your admin role does not have access to this module.</p>
      </div>
    `;
    return false;
  }
  return true;
}

function table(headers,rows){
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${headers.map(h=>`<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${
            rows.join("")||
            `<tr><td colspan="${headers.length}" class="muted">No records found.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function field(label,name,type="text",value="",extra=""){
  return `
    <label>
      ${label}
      <input
        name="${name}"
        type="${type}"
        value="${esc(value)}"
        ${extra}
      >
    </label>
  `;
}

function select(label,name,opts,value="",extra=""){
  return `
    <label>
      ${label}
      <select name="${name}" ${extra}>
        ${opts.map(o=>`
          <option
            value="${esc(o)}"
            ${String(o)===String(value)?"selected":""}
          >
            ${esc(o)}
          </option>
        `).join("")}
      </select>
    </label>
  `;
}

function check(label,name,value=true){
  return `
    <label class="check">
      <input
        name="${name}"
        type="checkbox"
        ${value?"checked":""}
      >
      ${label}
    </label>
  `;
}

function section(title,body){
  return `<h2 class="section-title">${title}</h2>${body}`;
}


/* =========================================================
   ADMIN LOGIN
   ========================================================= */

$("#loginForm").onsubmit=async e=>{
  e.preventDefault();

  const email=$("#email").value.trim();
  const password=$("#password").value;

  showMsg($("#loginMsg"),"Signing in...");

  try{
    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    showMsg(
      $("#loginMsg"),
      "Login successful. Loading admin panel..."
    );

  }catch(err){

    console.error("ADMIN LOGIN ERROR:",err);

    let message="Admin login failed.";

    switch(err?.code){

      case "auth/invalid-credential":
        message="Login failed: Email or password is incorrect.";
        break;

      case "auth/user-not-found":
        message="Login failed: Admin account was not found in Firebase Authentication.";
        break;

      case "auth/wrong-password":
        message="Login failed: Incorrect password.";
        break;

      case "auth/invalid-email":
        message="Login failed: Invalid email address.";
        break;

      case "auth/user-disabled":
        message="Login failed: This Firebase account is disabled.";
        break;

      case "auth/operation-not-allowed":
        message="Login failed: Email/Password sign-in is disabled in Firebase Authentication.";
        break;

      case "auth/invalid-api-key":
        message="Login failed: Firebase API key/configuration is invalid.";
        break;

      case "auth/network-request-failed":
        message="Login failed: Network error. Check your internet connection.";
        break;

      default:
        message=
          `Login failed: ${err?.code||"unknown-error"}`+
          `${err?.message?" - "+err.message:""}`;
    }

    showMsg(
      $("#loginMsg"),
      message,
      true
    );
  }
};


$("#logout").onclick=async()=>{try{if(me)await log("ADMIN_LOGOUT")}catch{}await signOut(auth)};


$("#changePassword").onclick=async()=>{
  const p=prompt(
    "Enter a new password (minimum 6 characters):"
  );

  if(!p)return;

  if(p.length<12){
    alert("Admin password must be at least 12 characters.");
    return;
  }

  try{
    await updatePassword(me,p);
    await log("ADMIN_PASSWORD_CHANGED");
    alert("Password changed.");
  }catch(e){
    alert(
      "For security, sign in again before changing password."
    );
  }
};


let sessionTimer=null;
let sessionTimeoutMs=0;
let sessionActivityBound=false;

function resetAdminSessionTimer(){
  if(!sessionTimeoutMs||!auth.currentUser)return;
  clearTimeout(sessionTimer);
  sessionTimer=setTimeout(async()=>{
    try{ await signOut(auth); }catch{}
    showMsg($("#loginMsg"),"Admin session expired. Please sign in again.",true);
  },sessionTimeoutMs);
}

function startAdminSessionTimeout(minutes){
  const n=Number(minutes);
  sessionTimeoutMs=(Number.isFinite(n)&&n>0?n:30)*60*1000;
  if(!sessionActivityBound){
    ["click","keydown","mousemove","touchstart"].forEach(type=>
      document.addEventListener(type,resetAdminSessionTimer,{passive:true})
    );
    sessionActivityBound=true;
  }
  resetAdminSessionTimer();
}

/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(auth,async user=>{

  if(!user){
    clearTimeout(sessionTimer);
    sessionTimeoutMs=0;
    $("#login").hidden=false;
    $("#app").hidden=true;
    return;
  }

  try{

    const a=await isAdminUser(user.uid);

    if(!a){
      console.error("ADMIN PROFILE MISSING",{
        uid:user.uid,
        email:user.email
      });

      await signOut(auth);

      showMsg(
        $("#loginMsg"),
        "Admin profile not found. Add this Firebase Auth UID to Firestore: admins/" + user.uid,
        true
      );

      return;
    }

    if(a.active!==true){

      await signOut(auth);

      showMsg(
        $("#loginMsg"),
        "This admin profile is inactive. Ask a superadmin to activate it.",
        true
      );

      return;
    }

    me=user;
    adminData=a;
    window.__adminData=a;

    const portalSettings=await getSettings();
    startAdminSessionTimeout(portalSettings.sessionTimeoutMinutes);

    $("#login").hidden=true;
    $("#app").hidden=false;

    $("#welcome").textContent=
      `${a.name||user.email} • ${a.role||"admin"}`;

    buildTabs();

    await dashboard();
    await log("ADMIN_LOGIN");

  }catch(e){

    console.error("ADMIN PROFILE ERROR:",e);

    const code=e?.code||"unknown";
    const detail=e?.message||"Firebase request failed.";

    showMsg(
      $("#loginMsg"),
      "Admin panel load failed: " + code + " — " + detail,
      true
    );
  }
});


function buildTabs(){

  const wrap=$("#tabs");

  const visible=TAB_GROUPS
    .map(group=>({
      label:group.label,
      items:group.items.filter(([,label,permission])=>
        permission==="dashboard"||has(permission)
      )
    }))
    .filter(group=>group.items.length);

  wrap.innerHTML=visible.map((group,index)=>{
    if(group.label==="Dashboard"){
      const [id,label]=group.items[0];
      return `<button data-tab="${id}" class="nav-main">${label}</button>`;
    }
    return `
      <details class="nav-group">
        <summary>${group.label}</summary>
        <div class="nav-group-menu">
          ${group.items.map(([id,label])=>
            `<button type="button" data-tab="${id}">${label}</button>`
          ).join("")}
        </div>
      </details>
    `;
  }).join("");

  wrap.querySelectorAll("[data-tab]").forEach(b=>
    b.onclick=()=>loadTab(b.dataset.tab)
  );
}


async function loadTab(tab){

  currentTab=tab;

  $("#tabs")
    .querySelectorAll("button")
    .forEach(b=>
      b.classList.toggle(
        "active",
        b.dataset.tab===tab
      )
    );

  ({
    dashboard,
    candidates,
    exams,
    applications,
    payments,
    form:formBuilder,
    documents,
    admit,
    centres,
    results,
    notices,
    reports,
    admins,
    audit,
    settings
  }[tab]||dashboard)();
}


/* =========================================================
   DASHBOARD
   ========================================================= */

async function counts(){

  const names=[
    "candidates",
    "applications",
    "payments",
    "admitCards",
    "results",
    "exams"
  ];

  const o={};

  for(const n of names){

    try{
      o[n]=(
        await getDocs(
          collection(db,n)
        )
      ).size;

    }catch{
      o[n]=0;
    }
  }

  return o;
}


async function dashboard(){

  const c=await counts();

  $("#stats").innerHTML=[
    ["Candidates",c.candidates,"candidates"],
    ["Applications",c.applications,"applications"],
    ["Payments",c.payments,"payments"],
    ["Admit Cards",c.admitCards,"admit"],
    ["Results",c.results,"results"],
    ["Exams",c.exams,"exams"]
  ]
  .map(x=>`
    <div
      class="stat stat-link"
      data-go="${x[2]}"
    >
      <span>${x[0]}</span>
      <b>${x[1]}</b>
    </div>
  `)
  .join("");

  $("#stats")
    .querySelectorAll(".stat-link")
    .forEach(x=>
      x.onclick=()=>loadTab(x.dataset.go)
    );

  panel.innerHTML=`
    <h2>Admin Control Center</h2>

    <p>
      All core portal operations are managed from this panel.
      Use <b>Exam Management</b> first, then configure
      Application/Form/Documents, Centre/Roll, Admit Card
      and Result.
    </p>

    <div class="grid-3">

      <div class="card">
        <h3>Application</h3>
        <p>
          Search, verify, approve/reject, correction,
          payment state and export.
        </p>
      </div>

      <div class="card">
        <h3>Admit Card</h3>
        <p>
          Generate drafts in bulk, assign roll numbers/centres,
          preview and publish.
        </p>
      </div>

      <div class="card">
        <h3>Result</h3>
        <p>
          Manual entry, CSV/Excel import, validation,
          revision and publication.
        </p>
      </div>

    </div>
  `;
}


/* =========================================================
   CANDIDATE DIRECTORY
   ========================================================= */

async function candidates(){

  if(!guard("applications"))return;

  const s=await getDocs(collection(db,"candidates"));

  window.__candidates=s.docs.map(d=>({
    id:d.id,
    ...d.data()
  }));

  panel.innerHTML=`
    <h2>Candidate Directory</h2>
    <p class="muted">Registered candidates and their application details.</p>
    <div class="toolbar">
      <input id="candidateSearch" placeholder="Search application / name / mobile">
      <button class="btn" id="candidateRefresh">Refresh</button>
    </div>
    <div id="candidateTable"></div>
  `;

  const render=()=>{
    const q=(document.querySelector("#candidateSearch").value||"").trim().toLowerCase();
    const rows=(window.__candidates||[]).filter(x=>
      [x.id,x.applicationNumber,x.name,x.mobile,x.status]
        .some(v=>String(v||"").toLowerCase().includes(q))
    );
    $("#candidateTable").innerHTML=table(
      ["Application","Candidate","Mobile","Status","Registered","Actions"],
      rows.map(x=>`
        <tr>
          <td>${esc(x.applicationNumber||"")}</td>
          <td>${esc(x.name||"")}</td>
          <td>${esc(x.mobile||"")}</td>
          <td>${esc(x.status||"")}</td>
          <td>${esc(toDate(x.createdAt)||"")}</td>
          <td><button class="btn small" data-view-candidate="${esc(x.id)}">View</button></td>
        </tr>
      `)
    );
    $("#candidateTable").querySelectorAll("[data-view-candidate]").forEach(b=>
      b.onclick=()=>viewCandidate(b.dataset.viewCandidate)
    );
  };

  $("#candidateSearch").oninput=render;
  $("#candidateRefresh").onclick=()=>candidates();
  render();
}

async function viewCandidate(id){
  const s=await getDoc(doc(db,"candidates",id));
  if(!s.exists()){alert("Candidate not found.");return;}
  const x={id:s.id,...s.data()};
  panel.innerHTML=`
    <div class="actions no-print"><button class="btn" id="backCandidates">Back</button><button class="btn" id="printCandidate">Print</button>${x.applicationNumber?'<button class="btn primary" id="candidateDocuments">Verify Documents</button>':""}</div>
    <h2>Candidate: ${esc(x.name||x.applicationNumber||id)}</h2>
    <div class="grid-3"><div class="card"><b>Application</b><p>${esc(x.applicationNumber||"")}</p></div><div class="card"><b>Mobile</b><p>${esc(x.mobile||"")}</p></div><div class="card"><b>Status</b><p>${esc(x.status||"")}</p></div></div>
    <section class="card"><h3>Candidate Status</h3><div class="toolbar"><select id="candidateStatus">${["Registered","Active","Suspended","Locked"].map(st=>`<option ${x.status===st?"selected":""}>${st}</option>`).join("")}</select><button class="btn primary" id="saveCandidateStatus">Save Candidate Status</button></div><p id="candidateMsg" class="message"></p></section>
    ${Object.entries(x).filter(([k])=>k!=="id").map(([k,v])=>`<div class="card"><b>${esc(k)}</b><pre style="white-space:pre-wrap">${esc(typeof v==="object"?JSON.stringify(v,null,2):v)}</pre></div>`).join("")}
  `;
  $("#backCandidates").onclick=()=>loadTab("candidates");
  $("#printCandidate").onclick=()=>window.print();
  $("#saveCandidateStatus").onclick=async()=>{
    const status=$("#candidateStatus").value;
    await updateDoc(doc(db,"candidates",id),{status,updatedAt:serverTimestamp()});
    await log("CANDIDATE_STATUS_CHANGED",id,{status});
    showMsg($("#candidateMsg"),"Candidate status saved.");
    candidates();
  };
  if(x.applicationNumber)$("#candidateDocuments").onclick=()=>verifyCandidateDocuments(x.applicationNumber);
}

async function verifyCandidateDocuments(applicationNumber){
  const s=await getDoc(doc(db,"applications",applicationNumber));
  if(!s.exists()){alert("Application not found.");return;}
  const a=s.data(),docs=a.documents||{},verification=a.documentVerification||{};
  const entries=Object.entries(docs).filter(([,url])=>typeof url==="string"&&url);
  panel.innerHTML=`
    <div class="actions no-print"><button class="btn" id="backCandidateDocs">Back to Candidate</button></div>
    <h2>Document Verification: ${esc(applicationNumber)}</h2>
    <p class="muted">Review each uploaded document independently. Verification is stored on the application and does not change the uploaded file.</p>
    <div class="card">${entries.length?entries.map(([key,url])=>{const v=verification[key]||{};return `<div class="card"><div class="actions"><b>${esc(key)}</b><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">Open Document</a></div><div class="form-grid"><label>Status<select data-doc-status="${esc(key)}">${["Pending","Verified","Rejected"].map(st=>`<option ${v.status===st?"selected":""}>${st}</option>`).join("")}</select></label><label>Verification Note<input data-doc-note="${esc(key)}" value="${esc(v.note||"")}" placeholder="Optional note"></label></div></div>`}).join(""):"<p>No uploaded documents are available for verification.</p>"}</div>
    <div class="actions"><button class="btn primary" id="saveDocumentVerification">Save Document Verification</button></div><p id="docVerifyMsg" class="message"></p>
  `;
  $("#backCandidateDocs").onclick=()=>loadTab("candidates");
  $("#saveDocumentVerification").onclick=async()=>{
    const next={};
    document.querySelectorAll("[data-doc-status]").forEach(el=>{
      const key=el.dataset.docStatus;
      const note=[...document.querySelectorAll("[data-doc-note]")].find(input=>input.dataset.docNote===key)?.value.trim()||"";
      next[key]={status:el.value,note,verifiedBy:me.uid,verifiedAt:serverTimestamp()};
    });
    await updateDoc(doc(db,"applications",applicationNumber),{documentVerification:next,updatedAt:serverTimestamp()});
    await log("DOCUMENT_VERIFICATION_UPDATED",applicationNumber,{count:Object.keys(next).length});
    showMsg($("#docVerifyMsg"),"Document verification saved.");
  };
}


/* =========================================================
   EXAM MANAGEMENT
   ========================================================= */

function validateExamLifecycle(v,current=null){
  const errors=[];
  const ms=value=>{const n=Date.parse(value||"");return Number.isFinite(n)?n:null};
  const start=v.applicationStartMs??ms(v.applicationStart),end=v.applicationEndMs??ms(v.applicationEnd);
  const payment=v.paymentEndMs??ms(v.paymentEnd),correctionStart=v.correctionStartMs??ms(v.correctionStart),correctionEnd=v.correctionEndMs??ms(v.correctionEnd);
  const admit=v.admitReleaseMs??ms(v.admitRelease),result=v.resultReleaseMs??ms(v.resultRelease),examDate=ms(v.examDate);
  if(start!=null&&end!=null&&start>=end)errors.push("Application start must be before the application last date.");
  if(payment!=null&&end!=null&&(payment<start||payment>end))errors.push("Payment last date must be within the application window.");
  if((correctionStart==null)!=(correctionEnd==null))errors.push("Both correction start and correction end are required together.");
  if(correctionStart!=null&&correctionEnd!=null&&correctionStart>=correctionEnd)errors.push("Correction start must be before correction end.");
  if(correctionStart!=null&&end!=null&&correctionStart<end)errors.push("Correction window cannot start before applications close.");
  if(examDate!=null&&end!=null&&examDate<end)errors.push("Exam date cannot be before the application last date.");
  if(admit!=null&&examDate!=null&&admit>=examDate)errors.push("Admit-card release must be before the exam date.");
  if(result!=null&&examDate!=null&&result<examDate)errors.push("Result release cannot be before the exam date.");
  const minAge=v.minAge===""||v.minAge==null?null:Number(v.minAge),maxAge=v.maxAge===""||v.maxAge==null?null:Number(v.maxAge);
  if(minAge!=null&&(!Number.isFinite(minAge)||minAge<0))errors.push("Minimum age must be a valid non-negative number.");
  if(maxAge!=null&&(!Number.isFinite(maxAge)||maxAge<0))errors.push("Maximum age must be a valid non-negative number.");
  if(minAge!=null&&maxAge!=null&&minAge>maxAge)errors.push("Minimum age cannot be greater than maximum age.");
  if(current?.status==="Archived"&&v.status!=="Archived")errors.push("An archived exam cannot be reopened.");
  if(v.status==="Completed"&&examDate!=null&&examDate>Date.now())errors.push("A future exam cannot be marked Completed.");
  return errors;
}

async function exams(){

  if(!guard("exams"))return;

  panel.innerHTML=`

    <h2>Exam Management</h2>

    <p class="muted">
      Central configuration for eligibility, application
      windows, payment, admit card and result behaviour.
    </p>

    <form id="examForm" class="form-grid">

      ${field(
        "Exam Name",
        "examName",
        "text",
        "",
        "required"
      )}

      ${field(
        "Exam Code",
        "examCode",
        "text",
        "",
        "required"
      )}

      ${field(
        "Application Start",
        "applicationStart",
        "datetime-local"
      )}

      ${field(
        "Application Last Date",
        "applicationEnd",
        "datetime-local"
      )}

      ${field(
        "Payment Last Date",
        "paymentEnd",
        "datetime-local"
      )}

      ${field(
        "Correction Start",
        "correctionStart",
        "datetime-local"
      )}

      ${field(
        "Correction End",
        "correctionEnd",
        "datetime-local"
      )}

      ${field(
        "Exam Date",
        "examDate",
        "date"
      )}

      ${field(
        "Application Fee",
        "fee",
        "number",
        "0",
        "min=0 step=0.01"
      )}

      ${select(
        "Language",
        "language",
        ["English","Hindi","Bilingual","Other"]
      )}

      ${select(
        "Exam Mode",
        "mode",
        ["Online","Offline","Hybrid"]
      )}

      ${select(
        "Application Status",
        "status",
        ["Draft","Open","Closed","Completed","Archived"]
      )}

      ${field(
        "Admit Release Date",
        "admitRelease",
        "datetime-local"
      )}

      ${field(
        "Result Release Date",
        "resultRelease",
        "datetime-local"
      )}

      ${field(
        "Minimum Age",
        "minAge",
        "number",
        "",
        "min=0"
      )}

      ${field(
        "Maximum Age",
        "maxAge",
        "number",
        "",
        "min=0"
      )}

      ${field(
        "Eligible Qualification",
        "eligibilityQualification"
      )}

      ${field(
        "Allowed Categories",
        "eligibilityCategories",
        "text",
        "UR,OBC,SC,ST,EWS"
      )}

      ${check(
        "Allow correction window",
        "allowCorrection",
        true
      )}

      ${check(
        "Payment required before final submission",
        "paymentRequired",
        true
      )}

      ${check(
        "Auto-create admit-card drafts",
        "autoAdmitDraft",
        true
      )}

      ${check(
        "Enable section-wise result",
        "sectionResult",
        true
      )}

      ${check(
        "Enable question-wise result",
        "questionWiseResult",
        false
      )}

      ${check(
        "Enable result PDF/print",
        "resultPdf",
        true
      )}

      ${check(
        "Enable admit PDF/print",
        "admitPdf",
        true
      )}

      <div class="actions">
        <button type="submit" class="btn primary">
          Save Exam Settings
        </button>
      </div>

      <p id="examMsg" class="message"></p>

    </form>

    <div id="examList"></div>
  `;

  $("#examForm").onsubmit=async e=>{

    e.preventDefault();

    const v=formObj(e.target);

    const toMs=value=>{const n=Date.parse(value||"");return Number.isFinite(n)?n:null};
    v.applicationStartMs=toMs(v.applicationStart);
    v.applicationEndMs=toMs(v.applicationEnd);
    v.correctionStartMs=toMs(v.correctionStart);
    v.correctionEndMs=toMs(v.correctionEnd);
    v.admitReleaseMs=toMs(v.admitRelease);
    v.resultReleaseMs=toMs(v.resultRelease);

    v.allowCorrection=
      bool(e.target,"allowCorrection");

    v.paymentRequired=
      bool(e.target,"paymentRequired");

    v.autoAdmitDraft=
      bool(e.target,"autoAdmitDraft");

    v.sectionResult=
      bool(e.target,"sectionResult");

    v.questionWiseResult=
      bool(e.target,"questionWiseResult");

    v.resultPdf=
      bool(e.target,"resultPdf");

    v.admitPdf=
      bool(e.target,"admitPdf");

    const lifecycleErrors=validateExamLifecycle(v,examCache.find(x=>x.id===v.examCode));
    if(lifecycleErrors.length){
      showMsg($("#examMsg"),lifecycleErrors.join(" "),true);
      return;
    }

    v.updatedAt=serverTimestamp();
    v.createdAt=serverTimestamp();

    await setDoc(
      doc(db,"exams",v.examCode),
      v,
      {merge:true}
    );

    await log(
      "EXAM_SAVED",
      v.examCode
    );

    showMsg(
      $("#examMsg"),
      "Exam saved."
    );

    listExams();
  };

  listExams();
}


async function listExams(){

  const s=await getDocs(
    query(
      collection(db,"exams"),
      orderBy("createdAt","desc")
    )
  );

  examCache=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));
  window.__examCache=examCache;

  $("#examList").innerHTML=
    section(
      "Existing Exams",
      table(
        [
          "Code",
          "Name",
          "Mode",
          "Status",
          "Application Window",
          "Actions"
        ],

        examCache.map(x=>`
          <tr>

            <td>${esc(x.id)}</td>

            <td>${esc(x.examName)}</td>

            <td>${esc(x.mode)}</td>

            <td>${esc(x.status)}</td>

            <td>
              ${esc(x.applicationStart||"")}
              →
              ${esc(x.applicationEnd||"")}
            </td>

            <td>

              <button
                class="btn small"
                data-edit-exam="${esc(x.id)}"
              >
                Edit
              </button>

              <button
                class="btn small"
                data-config-exam="${esc(x.id)}"
              >
                Open Config
              </button>
              <button class="btn small danger" data-delete-exam="${esc(x.id)}">Delete</button>

            </td>

          </tr>
        `)
      )
    );

  $("#examList")
    .querySelectorAll("[data-edit-exam]")
    .forEach(b=>
      b.onclick=()=>editExam(b.dataset.editExam)
    );

  $("#examList")
    .querySelectorAll("[data-config-exam]")
    .forEach(b=>
      b.onclick=()=>examConfig(b.dataset.configExam)
    );
  $("#examList").querySelectorAll("[data-delete-exam]").forEach(b=>b.onclick=()=>deleteExam(b.dataset.deleteExam));
}


async function deleteExam(id){
  const x=examCache.find(a=>a.id===id); if(!x)return;
  if(id===(window.__portalSettings?.activeExamId||"")){alert("This is the active exam. Change the Active Exam Code before deleting it.");return;}
  const [a,c,r]=await Promise.all([
    getDocs(query(collection(db,"applications"),where("examId","==",id),limit(1))),
    getDocs(query(collection(db,"admitCards"),where("examId","==",id),limit(1))),
    getDocs(query(collection(db,"results"),where("examId","==",id),limit(1)))
  ]);
  if(!a.empty||!c.empty||!r.empty){
    if(id!=="fgfd"){
      alert("This exam has linked applications, admit cards, or results. Close/archive it instead.");
      return;
    }
    if(!confirm("PERMANENTLY DELETE accidental exam fgfd and all linked records? This cannot be undone."))return;
    const targets=[];
    for(const [name,q] of [
      ["applications",query(collection(db,"applications"),where("examId","==",id))],
      ["admitCards",query(collection(db,"admitCards"),where("examId","==",id))],
      ["results",query(collection(db,"results"),where("examId","==",id))],
      ["payments",query(collection(db,"payments"),where("examId","==",id))],
      ["onlineAttempts",query(collection(db,"onlineAttempts"),where("examId","==",id))]
    ]){
      const snap=await getDocs(q);
      snap.forEach(d=>targets.push(d.ref));
    }
    for(let i=0;i<targets.length;i+=400){
      const educationQualification={enabled:!!document.querySelector('[name="educationQualificationEnabled"]')?.checked,tracks:{"1to5":{enabled:!!document.querySelector('[name="educationQualification_1to5_enabled"]')?.checked,label:"1 to 5",subjects:String(document.querySelector('[name="educationQualification_1to5_subjects"]')?.value||"").split(",").map(x=>x.trim()).filter(Boolean)},"6to8":{enabled:!!document.querySelector('[name="educationQualification_6to8_enabled"]')?.checked,label:"6 to 8",subjects:String(document.querySelector('[name="educationQualification_6to8_subjects"]')?.value||"").split(",").map(x=>x.trim()).filter(Boolean)}}};
  if(educationQualification.enabled&&Object.values(educationQualification.tracks).some(t=>t.enabled&&t.subjects.length===0)){showMsg($("#formSettingsMsg"),"Add at least one subject for every enabled qualification level.",true);return;}
  const batch=writeBatch(db);
      targets.slice(i,i+400).forEach(ref=>batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc(db,"exams",id));
    await log("EXAM_PERMANENTLY_DELETED",id,{examName:x.examName||"",linkedRecordsDeleted:targets.length});
    exams();
    return;
  }
  if(!confirm("Delete exam "+id+"? This cannot be undone."))return;
  await deleteDoc(doc(db,"exams",id)); await log("EXAM_DELETED",id,{examName:x.examName||""}); exams();
}

async function editExam(id){

  const x=
    examCache.find(a=>a.id===id);

  if(!x)return;

  loadTab("exams");

  setTimeout(()=>{

    const f=$("#examForm");

    Object.entries(x).forEach(([k,v])=>{

      const el=f.elements[k];

      if(!el||v?.toDate)return;

      if(el.type==="checkbox")
        el.checked=!!v;
      else
        el.value=v??"";
    });

  },50);
}


async function examConfig(id){

  const x=
    examCache.find(a=>a.id===id)||{};

  panel.innerHTML=`

    <h2>
      Exam Configuration:
      ${esc(x.examName||id)}
    </h2>

    <p>
      Configuration is stored with the exam and can be
      extended without changing the candidate URL.
    </p>

    ${section(
      "Application Controls",
      `
        ${check(
          "Application open",
          "applicationOpen",
          x.status==="Open"
        )}

        ${check(
          "Payment required",
          "paymentRequired",
          x.paymentRequired!==false
        )}

        ${check(
          "Correction allowed",
          "allowCorrection",
          !!x.allowCorrection
        )}
      `
    )}

    ${section(
      "Admit Card Controls",
      `
        ${check(
          "Auto draft generation",
          "autoAdmitDraft",
          x.autoAdmitDraft!==false
        )}

        ${field(
          "Roll prefix",
          "rollPrefix",
          "text",
          x.rollPrefix||""
        )}

        ${field(
          "Roll start",
          "rollStart",
          "number",
          x.rollStart||100001
        )}

        ${field(
          "Roll width",
          "rollWidth",
          "number",
          x.rollWidth||6
        )}
      `
    )}

    ${section(
      "Result Controls",
      `
        ${check(
          "Section-wise result",
          "sectionResult",
          x.sectionResult!==false
        )}

        ${check(
          "Question-wise result",
          "questionWiseResult",
          !!x.questionWiseResult
        )}

        ${check(
          "Result PDF/print",
          "resultPdf",
          x.resultPdf!==false
        )}
      `
    )}

    <div class="actions">
      <button
        type="button"
        class="btn primary"
        id="saveExamConfig"
      >
        Save Exam Settings
      </button>
    </div>

    <p id="cfgMsg" class="message"></p>
  `;

  $("#saveExamConfig").onclick=async()=>{

    const update={

      applicationOpen:
        $("input[name=applicationOpen]").checked,

      paymentRequired:
        $("input[name=paymentRequired]").checked,

      allowCorrection:
        $("input[name=allowCorrection]").checked,

      autoAdmitDraft:
        $("input[name=autoAdmitDraft]").checked,

      rollPrefix:
        $("input[name=rollPrefix]").value,

      rollStart:
        Number(
          $("input[name=rollStart]").value
        ),

      rollWidth:
        Number(
          $("input[name=rollWidth]").value
        ),

      sectionResult:
        $("input[name=sectionResult]").checked,

      questionWiseResult:
        $("input[name=questionWiseResult]").checked,

      resultPdf:
        $("input[name=resultPdf]").checked,

      updatedAt:
        serverTimestamp()
    };

    await updateDoc(
      doc(db,"exams",id),
      update
    );

    await log(
      "EXAM_CONFIG_UPDATED",
      id
    );

    showMsg(
      $("#cfgMsg"),
      "Configuration saved."
    );
  };
}


/* =========================================================
   APPLICATION MANAGEMENT
   ========================================================= */

async function applications(){

  if(!guard("applications"))return;

  panel.innerHTML=`

    <h2>Application Management</h2>

    <div class="toolbar">

      <label>
        Search
        <input
          id="appSearch"
          placeholder="Application / name / mobile"
        >
      </label>

      ${select(
        "Status",
        "appStatus",
        [
          "",
          "Registered",
          "Application Incomplete",
          "Payment Pending",
          "Payment Successful",
          "Final Submitted",
          "Under Verification",
          "Approved",
          "Rejected",
          "Correction Required"
        ]
      )}

      ${select(
        "Payment",
        "appPayment",
        [
          "",
          "Pending",
          "Successful",
          "Failed",
          "Refunded"
        ]
      )}

      <button
        id="appRefresh"
        class="btn"
      >
        Refresh
      </button>

      <button
        id="appExport"
        class="btn"
      >
        Export CSV
      </button>

    </div>

    <div id="appTable"></div>
  `;

  $("#appSearch").oninput=renderApps;
  $("#appStatus").onchange=renderApps;
  $("#appPayment").onchange=renderApps;

  $("#appRefresh").onclick=()=>applications();

  $("#appExport").onclick=exportApps;

  const s=await getDocs(
    query(
      collection(db,"applications"),
      orderBy("createdAt","desc"),
      limit(1000)
    )
  );

  window.__apps=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  renderApps();
}


function renderApps(){

  const q=
    $("#appSearch").value.toLowerCase();

  const st=
    $("#appStatus").value;

  const ps=
    $("#appPayment").value;

  const rows=
    (window.__apps||[])
      .filter(x=>
        (
          !q||
          [
            x.id,
            x.personal?.fullName,
            x.personal?.mobile,
            x.candidateId
          ]
          .some(v=>
            String(v||"")
              .toLowerCase()
              .includes(q)
          )
        )&&
        (!st||x.status===st)&&
        (!ps||x.paymentStatus===ps)
      );

  $("#appTable").innerHTML=
    table(
      [
        "Application",
        "Candidate",
        "Status",
        "Payment",
        "Submitted",
        "Actions"
      ],

      rows.map(x=>`

        <tr>

          <td>${esc(x.id)}</td>

          <td>
            ${esc(x.personal?.fullName)}
          </td>

          <td>${esc(x.status)}</td>

          <td>${esc(x.paymentStatus)}</td>

          <td>
            ${esc(toDate(x.finalSubmittedAt))}
          </td>

          <td>

            <button
              class="btn small"
              data-view-app="${esc(x.id)}"
            >
              View
            </button>

            <button
              class="btn small"
              data-status-app="${esc(x.id)}"
            >
              Status
            </button>

            <button
              class="btn small"
              data-verify-app="${esc(x.id)}"
            >
              Verify
            </button>

          </td>

        </tr>

      `)
    );

  $("#appTable")
    .querySelectorAll("[data-view-app]")
    .forEach(b=>
      b.onclick=()=>viewApplication(b.dataset.viewApp)
    );

  $("#appTable")
    .querySelectorAll("[data-status-app]")
    .forEach(b=>
      b.onclick=()=>changeAppStatus(b.dataset.statusApp)
    );

  $("#appTable")
    .querySelectorAll("[data-verify-app]")
    .forEach(b=>
      b.onclick=()=>verifyApplication(b.dataset.verifyApp)
    );
}


async function viewApplication(id){

  const s=await getDoc(
    doc(db,"applications",id)
  );

  if(!s.exists()){
    alert("Not found");
    return;
  }

  const x=s.data();

  panel.innerHTML=`

    <div class="actions no-print">

      <button
        class="btn"
        onclick="loadTab('applications')"
      >
        Back
      </button>

      <button
        class="btn"
        onclick="window.print()"
      >
        Print
      </button>

    </div>

    <h2>
      Application: ${esc(id)}
    </h2>

    ${
      Object.entries(x)
        .map(([k,v])=>`
          <div class="card">

            <b>${esc(k)}</b>

            <pre style="white-space:pre-wrap">
${esc(
  typeof v==="object"
    ?JSON.stringify(v,null,2)
    :v
)}
            </pre>

          </div>
        `)
        .join("")
    }
  `;

  window.loadTab=loadTab;
}


async function changeAppStatus(id){

  const allowed=[
    "Registered",
    "Application Incomplete",
    "Payment Pending",
    "Payment Successful",
    "Final Submitted",
    "Under Verification",
    "Approved",
    "Rejected",
    "Correction Required"
  ];
  const current=window.__apps.find(x=>x.id===id)?.status||"";
  const st=prompt("New status (allowed: "+allowed.join(", ")+")",current);
  if(!st)return;
  if(!allowed.includes(st)){alert("Invalid application status.");return}
  if(st==="Correction Required"){
    const app=window.__apps.find(x=>x.id===id);
    const exam=examCache.find(x=>x.id===app?.examId);
    if(!exam?.allowCorrection){alert("Correction is not enabled for this exam.");return}
  }
  await updateDoc(doc(db,"applications",id),{status:st,updatedAt:serverTimestamp()});
  await log("APPLICATION_STATUS_CHANGED",id,{from:current,status:st});
  applications();
}


async function verifyApplication(id){

  const app=window.__apps.find(x=>x.id===id);
  if(!app){alert("Application not found.");return}
  if(!["Final Submitted","Under Verification"].includes(app.status)){
    alert("Only a submitted application can be approved.");
    return;
  }
  if(app.paymentStatus!=="Successful"){
    alert("Payment must be successful before approval.");
    return;
  }
  const ok=confirm("Mark application as Approved?");
  if(!ok)return;
  await updateDoc(doc(db,"applications",id),{
    status:"Approved",
    verifiedBy:me.uid,
    verifiedAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  });
  await log("APPLICATION_APPROVED",id);
  alert("Application approved.");
}


function exportApps(){

  const rows=
    (window.__apps||[])
      .map(x=>[
        x.id,
        x.personal?.fullName,
        x.personal?.mobile,
        x.status,
        x.paymentStatus,
        toDate(x.createdAt),
        toDate(x.finalSubmittedAt)
      ]);

  downloadText(
    "applications.csv",

    [
      [
        "Application",
        "Name",
        "Mobile",
        "Status",
        "Payment",
        "Created",
        "Submitted"
      ],
      ...rows
    ]
    .map(r=>
      r.map(v=>
        `"${String(v??"").replace(/"/g,'""')}"`
      ).join(",")
    )
    .join("\n"),

    "text/csv"
  );
}


/* =========================================================
   PAYMENTS
   ========================================================= */

async function payments(){

  if(!guard("payments"))return;

  const s=await getDocs(
    query(
      collection(db,"payments"),
      orderBy("createdAt","desc"),
      limit(1000)
    )
  );

  window.__payments=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  panel.innerHTML=`

    <h2>Payment Management</h2>

    <p class="muted">
      Gateway verification must come from a trusted backend.
      Admin can reconcile states and references here.
    </p>

    <div class="toolbar">

      <input
        id="paySearch"
        placeholder="Search application / transaction"
      >

      <button
        id="payExport"
        class="btn"
      >
        Export CSV
      </button>

    </div>

    <div id="payTable"></div>
  `;

  $("#paySearch").oninput=renderPayments;

  $("#payExport").onclick=()=>{

    downloadText(
      "payments.csv",

      [
        [
          "Payment ID",
          "Application",
          "Status",
          "Transaction",
          "Reference",
          "Amount",
          "Date"
        ],

        ...(window.__payments||[])
          .map(x=>[
            x.id,
            x.applicationNumber,
            x.status,
            x.transactionId,
            x.paymentReference,
            x.amount,
            toDate(x.createdAt)
          ])
      ]
      .map(r=>
        r.map(v=>
          `"${String(v??"").replace(/"/g,'""')}"`
        ).join(",")
      )
      .join("\n"),

      "text/csv"
    );
  };

  renderPayments();
}


function renderPayments(){

  const q=
    $("#paySearch")
      .value
      .toLowerCase();

  const rows=
    (window.__payments||[])
      .filter(x=>
        [
          x.id,
          x.applicationNumber,
          x.transactionId,
          x.paymentReference
        ]
        .some(v=>
          String(v||"")
            .toLowerCase()
            .includes(q)
        )
      );

  $("#payTable").innerHTML=
    table(
      [
        "Application",
        "Status",
        "Transaction",
        "Reference",
        "Amount",
        "Date",
        "Action"
      ],

      rows.map(x=>`
        <tr>

          <td>${esc(x.applicationNumber)}</td>

          <td>${esc(x.status)}</td>

          <td>${esc(x.transactionId)}</td>

          <td>${esc(x.paymentReference)}</td>

          <td>${esc(x.amount)}</td>

          <td>${esc(toDate(x.createdAt))}</td>

          <td>

            <button
              class="btn small"
              data-pay="${esc(x.id)}"
            >
              Verify / Edit
            </button>

          </td>

        </tr>
      `)
    );

  $("#payTable")
    .querySelectorAll("[data-pay]")
    .forEach(b=>
      b.onclick=()=>editPayment(b.dataset.pay)
    );
}


async function editPayment(id){

  const x=
    window.__payments.find(
      p=>p.id===id
    );

  const st=prompt(
    "Payment status (Pending/Successful/Failed/Refunded)",
    x.status||"Pending"
  );

  if(!st)return;

  const ref=prompt(
    "Payment reference",
    x.paymentReference||""
  );

  await updateDoc(
    doc(db,"payments",id),
    {
      status:st,
      paymentReference:ref,
      verifiedBy:me.uid,
      verifiedAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    }
  );

  if(x.applicationNumber){

    await updateDoc(
      doc(db,"applications",x.applicationNumber),
      {
        paymentStatus:st,
        updatedAt:serverTimestamp()
      }
    );
  }

  await log(
    "PAYMENT_STATUS_CHANGED",
    x.applicationNumber,
    {
      status:st,
      reference:ref
    }
  );

  payments();
}


/* =========================================================
   FORM BUILDER
   ========================================================= */

const BUILTIN_FIELDS=[

  ["fullName","Full Name","Text","personal"],
  ["fatherName","Father's Name","Text","personal"],
  ["motherName","Mother's Name","Text","personal"],
  ["dob","Date of Birth","Date","personal"],
  ["gender","Gender","Dropdown","personal"],
  ["category","Category","Dropdown","category"],
  ["maritalStatus","Marital Status","Dropdown","personal"],
  ["nationality","Nationality","Text","personal"],
  ["domicile","Domicile / State","Text","personal"],
  ["aadhaar","Aadhaar Number","Text","personal"],
  ["otherIdType","Other ID Type","Text","personal"],
  ["otherIdNumber","Other ID Number","Text","personal"],
  ["mobile","Mobile Number","Text","personal"],
  ["email","Email ID","Text","personal"],
  ["alternateMobile","Alternate Mobile","Text","personal"],
  ["examPost","Exam/Post Applied For","Text","personal"],
  ["examLanguage","Exam Language / Medium","Dropdown","personal"],
  ["guardianName","Guardian Name","Text","personal"],
  ["guardianRelation","Guardian Relationship","Text","personal"],
  ["guardianOccupation","Guardian Occupation","Text","personal"],
  ["guardianIncome","Guardian Annual Income","Number","personal"],

  ["house","House/Building No.","Text","address"],
  ["city","Village/Town/City","Text","address"],
  ["postOffice","Post Office","Text","address"],
  ["policeStation","Police Station","Text","address"],
  ["district","District","Text","address"],
  ["state","State","Text","address"],
  ["pin","PIN Code","Text","address"],
  ["correspondenceDifferent","Correspondence Address Different","Yes/No","address"],
  ["permanentAddress","Permanent Address","Textarea","address"],

  ["board10","10th Board","Text","education"],
  ["year10","10th Passing Year","Number","education"],
  ["roll10","10th Roll Number","Text","education"],
  ["marks10","10th Percentage/CGPA","Number","education"],
  ["board12","12th Board","Text","education"],
  ["year12","12th Passing Year","Number","education"],
  ["roll12","12th Roll Number","Text","education"],
  ["marks12","12th Percentage/CGPA","Number","education"],
  ["graduation","Graduation / Other Qualification","Text","education"],
  ["university","University","Text","education"],

  ["ews","EWS Status","Yes/No","category"],
  ["obcNcl","OBC-NCL Status","Yes/No","category"],
  ["pwbd","PwBD / Disability","Text","category"],
  ["exServiceman","Ex-Serviceman","Yes/No","category"],
  ["certificateNo","Certificate Number","Text","category"],
  ["certificateDate","Certificate Issue Date","Date","category"],
  ["certificateAuthority","Certificate Issuing Authority","Text","category"],
  ["certificateValidity","Certificate Validity Date","Date","category"],

  ["employment","Employment Status","Dropdown","other"],
  ["governmentEmployee","Government Employee","Yes/No","other"],
  ["experience","Experience","Textarea","other"],
  ["employer","Employer / Organization","Text","other"],
  ["designation","Designation","Text","other"],
  ["employeeId","Employee ID","Text","other"],
  ["joiningDate","Joining Date","Date","other"],
  ["nocRequired","NOC Required","Yes/No","other"],

  ["photo","Photograph","File Upload","photo"],
  ["signature","Signature","File Upload","photo"],
  ["thumb","Left-hand Thumb Impression","File Upload","photo"],
  ["certificateFile","Reservation Certificate","File Upload","documents"],
  ["nocFile","NOC Document","File Upload","documents"],
  ["otherFile","Other Document","File Upload","documents"],
  ["visibleMark","Identification / Visible Mark","Text","other"]
];


async function formBuilder(){

  if(!guard("formBuilder"))return;

  const [s,settingsData]=await Promise.all([
    getDocs(query(collection(db,"customFields"),orderBy("order","asc"))),
    getSettings()
  ]);

  window.__customFields=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  window.__formFieldEnabled={
    ...(settingsData.formFieldEnabled||{})
  };
  window.__formSections={
    personal:settingsData.formSections?.personal!==false,
    address:settingsData.formSections?.address!==false,
    education:settingsData.formSections?.education!==false,
    category:settingsData.formSections?.category!==false,
    other:settingsData.formSections?.other!==false,
    photo:settingsData.formSections?.photo!==false,
    documents:settingsData.formSections?.documents!==false,
    declaration:settingsData.formSections?.declaration!==false
  };

  const educationQualification={...defaultEducationQualification,...(settingsData.educationQualification||{}),tracks:{...defaultEducationQualification.tracks,...Object.fromEntries(Object.entries(settingsData.educationQualification?.tracks||{}).map(([key,value])=>[key,{...defaultEducationQualification.tracks[key],...(value||{}),subjects:Array.isArray(value?.subjects)?value.subjects.filter(Boolean).map(String):defaultEducationQualification.tracks[key]?.subjects||[]}]))}};

  panel.innerHTML=`
    <h2>Application Form Builder</h2>
    <p class="muted">
      Select exactly which built-in and custom fields students should see.
      Hidden fields remain stored; they are simply removed from the candidate form.
    </p>

    <div class="actions settings-actions">
      <button type="button" class="btn primary" id="saveStudentForm">Save Student Form Settings</button>
      <button type="button" class="btn" id="resetStudentForm">Reset Built-in Fields</button>
    </div>
    <p class="muted settings-save-hint">Save after changing any student field or section visibility setting.</p>

    <p id="formSettingsMsg" class="message"></p>
    <div class="card" style="margin:14px 0">
      <h3>Student Form Sections</h3>
      <p class="muted">Enable only the categories that candidates should see in their application. Disabled sections are hidden from the candidate form.</p>
      <div class="form-grid">
        ${check("Personal Details","section_personal",window.__formSections.personal)}
        ${check("Address Details","section_address",window.__formSections.address)}
        ${check("Education & Educational Qualification","section_education",window.__formSections.education)}
        ${check("Category / Other Details","section_category",window.__formSections.category)}
        ${check("Photo & Signature","section_photo",window.__formSections.photo)}
        ${check("Documents","section_documents",window.__formSections.documents)}
        ${check("Declaration","section_declaration",window.__formSections.declaration)}
      </div>
    </div>
    <div class="card" style="margin:14px 0">
      <h3>Education Qualification Subject Rules</h3>
      <p class="muted">Enable qualification-wise subject selection and configure subjects for each level.</p>
      ${check("Enable qualification-wise subject selection","educationQualificationEnabled",educationQualification.enabled!==false)}
      <div class="form-grid">
        ${check("Enable 1 to 5 subject selection","educationQualification_1to5_enabled",educationQualification.tracks["1to5"]?.enabled!==false)}
        ${field("1 to 5 Subjects (comma separated)","educationQualification_1to5_subjects","text",(educationQualification.tracks["1to5"]?.subjects||[]).join(", "))}
        ${check("Enable 6 to 8 subject selection","educationQualification_6to8_enabled",educationQualification.tracks["6to8"]?.enabled!==false)}
        ${field("6 to 8 Subjects (comma separated)","educationQualification_6to8_subjects","text",(educationQualification.tracks["6to8"]?.subjects||[]).join(", "))}
      </div>
    </div>
    <div id="fieldTable"></div>

    <h3 class="section-title">Add Custom Field</h3>

    <form id="fieldForm" class="form-grid">
      ${field("Field Name","name","text","","required")}
      ${select("Type","type",["Text","Number","Date","Dropdown","Radio","Checkbox","Textarea","Yes/No","Multi-select","File Upload"])}
      ${select("Section","section",["personal","address","education","category","other","photo","documents","declaration"])}
      ${field("Placeholder","placeholder")}
      ${field("Help Text","helpText")}
      ${field("Validation / Regex","validation")}
      ${field("Options (comma separated)","options")}
      ${field("Order","order","number","100")}
      ${check("Visible for students","visible",true)}
      ${check("Required","required",false)}
      ${check("Locked / Admin controlled","locked",false)}
      <button class="btn primary">Add Custom Field</button>
      <p id="fieldMsg" class="message"></p>
    </form>
  `;

  $("#fieldForm").onsubmit=async e=>{
    e.preventDefault();
    const v=formObj(e.target);
    v.visible=bool(e.target,"visible");
    v.required=bool(e.target,"required");
    v.locked=bool(e.target,"locked");
    v.order=Number(v.order||100);
    v.options=(v.options||"").split(",").map(x=>x.trim()).filter(Boolean);

    await addDoc(collection(db,"customFields"),{
      ...v,
      createdAt:serverTimestamp()
    });

    await log("FORM_FIELD_ADDED",v.name);
    showMsg($("#fieldMsg"),"Custom field added.");
    formBuilder();
  };

  $("#saveStudentForm").onclick=saveStudentFormSettings;

  $("#resetStudentForm").onclick=async()=>{
    const defaults={};
    BUILTIN_FIELDS.forEach(([key])=>defaults[key]=true);
    await setDoc(
      doc(db,"settings","portal"),
      {formFieldEnabled:defaults,updatedAt:serverTimestamp()},
      {merge:true}
    );
    await log("STUDENT_FORM_FIELDS_RESET");
    showMsg($("#formSettingsMsg"),"Built-in student fields reset to enabled.");
    formBuilder();
  };

  renderFields();
}

async function saveStudentFormSettings(){

  const enabled={};
  document.querySelectorAll("[data-builtin-field]").forEach(input=>{
    enabled[input.dataset.builtinField]=input.checked;
  });

  const sectionKeys=["personal","address","education","category","photo","documents","declaration"];
  const formSections=Object.fromEntries(sectionKeys.map(k=>[k,!!document.querySelector(`[name="section_${k}"]`)?.checked]));
  const batch=writeBatch(db);

  document.querySelectorAll("[data-custom-field-toggle]").forEach(input=>{
    batch.update(
      doc(db,"customFields",input.dataset.customFieldToggle),
      {visible:input.checked,updatedAt:serverTimestamp()}
    );
  });

  batch.set(
    doc(db,"settings","portal"),
    {
      formFieldEnabled:enabled,
      formSections,
      educationQualification,
      updatedAt:serverTimestamp()
    },
    {merge:true}
  );

  await batch.commit();
  await log("STUDENT_FORM_FIELDS_UPDATED","",{enabledFields:enabled});
  showMsg($("#formSettingsMsg"),"Student form fields and section settings saved.");
  formBuilder();
}

function renderFields(){

  const rows=[
    ...BUILTIN_FIELDS.map(x=>{
      const enabled=Object.prototype.hasOwnProperty.call(window.__formFieldEnabled||{},x[0])?window.__formFieldEnabled[x[0]]!==false:!["certificateFile","nocFile","otherFile"].includes(x[0]);
      return `
        <tr>
          <td>${esc(x[0])}</td>
          <td>${esc(x[1])}</td>
          <td>${esc(x[2])}</td>
          <td>${esc(x[3])}</td>
          <td>Master</td>
          <td>
            <input
              type="checkbox"
              data-builtin-field="${esc(x[0])}"
              ${enabled?"checked":""}
            >
            ${enabled?"Enabled":"Disabled"}
          </td>
          <td>Admin controlled</td>
        </tr>
      `;
    }),

    ...(window.__customFields||[]).map(x=>`
      <tr>
        <td>${esc(x.key||x.id)}</td>
        <td>${esc(x.name)}</td>
        <td>${esc(x.type)}</td>
        <td>${esc(x.section)}</td>
        <td>Custom</td>
        <td>
          <input
            type="checkbox"
            data-custom-field-toggle="${esc(x.id)}"
            ${x.visible!==false?"checked":""}
          >
          ${x.visible!==false?"Enabled":"Disabled"}
        </td>
        <td>
          ${x.required?"Required":"Optional"} / ${x.locked?"Locked":"Editable"}
          <button class="btn small" data-del-field="${esc(x.id)}">Delete</button>
        </td>
      </tr>
    `)];

  $("#fieldTable").innerHTML=section(
    "Student Form Controls",
    table(
      ["Key","Name","Type","Section","Source","Student Access","Details"],
      rows
    )
  );

  $("#fieldTable")
    .querySelectorAll("[data-del-field]")
    .forEach(b=>b.onclick=async()=>{
      if(!confirm("Delete this custom field?"))return;
      await deleteDoc(doc(db,"customFields",b.dataset.delField));
      await log("FORM_FIELD_DELETED",b.dataset.delField);
      formBuilder();
    });
}


/* =========================================================
   DOCUMENTS
   ========================================================= */



async function documents(){

  if(!guard("documents"))return;

  const s=await getDocs(
    query(
      collection(db,"documents"),
      orderBy("order","asc")
    )
  );

  window.__docs=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  panel.innerHTML=`

    <h2>Document Builder</h2>

    <form
      id="docForm"
      class="form-grid"
    >

      ${field(
        "Document Name",
        "name",
        "text",
        "",
        "required"
      )}

      ${select(
        "Type",
        "fileType",
        [
          "PDF",
          "JPG",
          "JPEG",
          "PNG",
          "PDF/JPG/PNG",
          "Any"
        ]
      )}

      ${field(
        "Max Size (MB)",
        "maxSize",
        "number",
        "2",
        "min=1"
      )}

      ${field(
        "Allowed Dimensions",
        "dimensions"
      )}

      ${field(
        "Max Files",
        "maxFiles",
        "number",
        "1",
        "min=1"
      )}

      ${select(
        "Required",
        "required",
        [
          "Required",
          "Optional"
        ]
      )}

      <div class="actions">
        <button type="submit" class="btn primary">
          Save Document Settings
        </button>
      </div>

    </form>

    <div id="docTable"></div>
    <p id="docMsg" class="message"></p>
  `;

  $("#docForm").onsubmit=async e=>{

    e.preventDefault();

    const v=formObj(e.target);

    v.required=
      v.required==="Required";

    v.maxSize=
      Number(v.maxSize||2);

    v.maxFiles=
      Number(v.maxFiles||1);

    if(v.maxSize<1||v.maxFiles<1){
      showMsg($("#docMsg"),"Maximum size and maximum files must both be at least 1.",true);
      return;
    }

    v.order=
      Date.now();

    await addDoc(
      collection(db,"documents"),
      {
        ...v,
        createdAt:serverTimestamp()
      }
    );

    await log(
      "DOCUMENT_RULE_ADDED",
      v.name
    );

    documents();
  };

  $("#docTable").innerHTML=
    table(
      [
        "Name",
        "Type",
        "Required",
        "Size",
        "Dimensions",
        "Max Files",
        "Action"
      ],

      window.__docs.map(x=>`

        <tr>

          <td>${esc(x.name)}</td>

          <td>${esc(x.fileType)}</td>

          <td>
            ${x.required?"Yes":"No"}
          </td>

          <td>
            ${esc(x.maxSize)} MB
          </td>

          <td>
            ${esc(x.dimensions)}
          </td>

          <td>
            ${esc(x.maxFiles)}
          </td>

          <td>

            <button
              class="btn small"
              data-del-doc="${x.id}"
            >
              Delete
            </button>

          </td>

        </tr>
      `)
    );

  $("#docTable")
    .querySelectorAll("[data-del-doc]")
    .forEach(b=>
      b.onclick=async()=>{

        await deleteDoc(
          doc(
            db,
            "documents",
            b.dataset.delDoc
          )
        );

        await log(
          "DOCUMENT_RULE_DELETED",
          b.dataset.delDoc
        );

        documents();
      }
    );
}


/* =========================================================
   CENTRES & ROLL
   ========================================================= */

async function centres(){

  if(!guard("centres"))return;

  const s=await getDocs(
    collection(db,"centres")
  );

  window.__centres=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  panel.innerHTML=`

    <h2>
      Exam Centres & Roll Numbers
    </h2>

    <form
      id="centreForm"
      class="form-grid"
    >

      ${field(
        "Centre Code",
        "code",
        "text",
        "",
        "required"
      )}

      ${field(
        "Centre Name",
        "name",
        "text",
        "",
        "required"
      )}

      ${field(
        "Address",
        "address"
      )}

      ${field(
        "City",
        "city"
      )}

      ${field(
        "District",
        "district"
      )}

      ${field(
        "State",
        "state"
      )}

      ${field(
        "PIN",
        "pin"
      )}

      ${field(
        "Capacity",
        "capacity",
        "number",
        "0",
        "min=0"
      )}

      ${field(
        "Shifts",
        "shifts",
        "text",
        "1"
      )}

      ${check(
        "Active",
        "active",
        true
      )}

      <button class="btn primary">
        Save Centre
      </button>

    </form>

    <div id="centreTable"></div>

    ${section(
      "Bulk Roll / Centre Allocation",
      `
        <form
          id="allocForm"
          class="form-grid"
        >

          ${select(
            "Exam",
            "examId",
            examCache.map(x=>x.id)
          )}

          ${select(
            "Centre",
            "centreId",
            window.__centres.map(x=>x.id)
          )}

          ${field(
            "Roll Prefix",
            "rollPrefix"
          )}

          ${field(
            "Starting Number",
            "rollStart",
            "number",
            "100001"
          )}

          ${field(
            "Roll Width",
            "rollWidth",
            "number",
            "6"
          )}

          ${check(
            "Assign only approved applications",
            "approvedOnly",
            true
          )}

          <div class="actions">
            <button type="button" class="btn primary" id="saveRollSettings">
              Save Roll Settings
            </button>
            <button type="submit" class="btn primary">
              Allocate & Generate Admit Drafts
            </button>
          </div>

          <p
            id="allocMsg"
            class="message"
          ></p>

        </form>
      `
    )}
  `;

  $("#centreForm").onsubmit=async e=>{

    e.preventDefault();

    const v=formObj(e.target);

    v.capacity=
      Number(v.capacity||0);

    v.shifts=
      v.shifts||"1";

    v.active=
      bool(e.target,"active");

    await setDoc(
      doc(db,"centres",v.code),
      {
        ...v,
        createdAt:serverTimestamp()
      },
      {merge:true}
    );

    await log(
      "CENTRE_SAVED",
      v.code
    );

    centres();
  };

  $("#centreTable").innerHTML=
    table(
      [
        "Code",
        "Name",
        "Location",
        "Capacity",
        "Shifts",
        "Active",
        "Action"
      ],

      window.__centres.map(x=>`

        <tr>

          <td>${esc(x.id)}</td>

          <td>${esc(x.name)}</td>

          <td>
            ${esc(
              [
                x.city,
                x.district,
                x.state
              ]
              .filter(Boolean)
              .join(", ")
            )}
          </td>

          <td>${esc(x.capacity)}</td>

          <td>${esc(x.shifts)}</td>

          <td>
            ${x.active!==false?"Yes":"No"}
          </td>

          <td>

            <button
              class="btn small"
              data-centre="${x.id}"
            >
              Toggle
            </button>
            <button class="btn small danger" data-delete-centre="${esc(x.id)}">Delete</button>

          </td>

        </tr>
      `)
    );

  $("#centreTable")
    .querySelectorAll("[data-centre]")
    .forEach(b=>
      b.onclick=async()=>{

        const x=
          window.__centres.find(
            c=>c.id===b.dataset.centre
          );

        await updateDoc(
          doc(db,"centres",x.id),
          {
            active:x.active===false
          }
        );

        centres();
      }
    );

  $("#centreTable").querySelectorAll("[data-delete-centre]").forEach(b=>b.onclick=()=>deleteCentre(b.dataset.deleteCentre));

  $("#saveRollSettings").onclick=async()=>{
    const v=formObj($("#allocForm"));
    if(!v.examId){showMsg($("#allocMsg"),"Select an exam first.",true);return;}
    const rollStart=Number(v.rollStart||100001);
    const rollWidth=Number(v.rollWidth||6);
    if(!Number.isFinite(rollStart)||rollStart<0||!Number.isFinite(rollWidth)||rollWidth<1){
      showMsg($("#allocMsg"),"Roll start/width is invalid.",true);
      return;
    }
    await updateDoc(doc(db,"exams",v.examId),{
      rollPrefix:v.rollPrefix||"",
      rollStart,
      rollWidth,
      defaultCentreId:v.centreId||"",
      updatedAt:serverTimestamp()
    });
    await log("ROLL_SETTINGS_SAVED",v.examId,{centreId:v.centreId||"",rollPrefix:v.rollPrefix||"",rollStart,rollWidth});
    showMsg($("#allocMsg"),"Roll settings saved.");
  };

  $("#allocForm").onsubmit=async e=>{
    e.preventDefault();
    await allocateAdmitDrafts(
      formObj(e.target),
      e.target
    );
  };
}


async function deleteCentre(id){
  const s=await getDocs(query(collection(db,"admitCards"),where("centreId","==",id),limit(1)));
  if(!s.empty){alert("This centre has linked admit cards. Mark it inactive instead.");return;}
  if(!confirm("Delete centre "+id+"? This cannot be undone."))return;
  await deleteDoc(doc(db,"centres",id)); await log("CENTRE_DELETED",id); centres();
}

async function allocateAdmitDrafts(v,form){

  const snap=await getDocs(
    query(
      collection(db,"applications"),
      orderBy("createdAt","asc"),
      limit(5000)
    )
  );

  let count=0;

  const prefix=
    v.rollPrefix||"";

  const selectedCentre=
    window.__centres.find(x=>x.id===v.centreId)||null;

  if(!selectedCentre){
    showMsg($("#allocMsg"),"Select a valid active centre.",true);
    return;
  }

  if(selectedCentre.active===false){
    showMsg($("#allocMsg"),"The selected centre is inactive.",true);
    return;
  }

  const shiftCount=Math.max(
    1,
    String(selectedCentre.shifts||"1")
      .split(",")
      .map(x=>x.trim())
      .filter(Boolean)
      .length
  );

  const capacity=Number(selectedCentre.capacity||0);
  const maxCapacity=capacity>0
    ?capacity*shiftCount
    :Number.MAX_SAFE_INTEGER;

  const allocationRef=doc(
    db,
    "centreAllocations",
    v.examId
  );

  for(const d of snap.docs){

    const a=d.data();

    if(a.examId!==v.examId)continue;

    if(
      v.approvedOnly!==undefined&&
      !a.status?.includes("Approved")
    )continue;

    const existing=
      await getDoc(
        doc(
          db,
          "admitCards",
          d.id
        )
      );

    if(
      existing.exists()&&
      existing.data().rollNumber
    )continue;

    const allocationOk=await runTransaction(db,async tx=>{
      const allocationSnap=await tx.get(allocationRef);
      const counts={...(allocationSnap.exists()?allocationSnap.data().counts||{}:{})};
      const used=Number(counts[v.centreId]||0);
      if(used>=maxCapacity) return false;
      counts[v.centreId]=used+1;
      tx.set(
        allocationRef,
        {
          examId:v.examId,
          counts,
          updatedAt:serverTimestamp()
        },
        {merge:true}
      );
      return true;
    });

    if(!allocationOk){
      showMsg(
        $("#allocMsg"),
        `Centre capacity reached (${maxCapacity} seats including shifts). Remaining candidates were not allocated.`,
        true
      );
      break;
    }

    const counterRef=doc(db,"counters",`admit_${v.examId}`);
    const rollNumber=await runTransaction(db,async tx=>{
      const counterSnap=await tx.get(counterRef);
      const current=Number(counterSnap.exists()?counterSnap.data().nextNumber:(v.rollStart||100001));
      if(!Number.isFinite(current)||current<0)throw new Error("Invalid roll counter.");
      tx.set(counterRef,{examId:v.examId,nextNumber:current+1,updatedAt:serverTimestamp()},{merge:true});
      return current;
    });
    const roll=
      prefix+
      String(rollNumber)
        .padStart(
          Number(v.rollWidth||6),
          "0"
        );



    await setDoc(
      doc(
        db,
        "admitCards",
        d.id
      ),
      {
        applicationNumber:d.id,
        authUid:a.authUid,
        candidateName:
          a.personal?.fullName||"",
        fatherName:
          a.personal?.fatherName||"",
        examId:v.examId,
        rollNumber:roll,
        centreCode:v.centreId,
        centreName:selectedCentre.name||"",
        centreAddress:selectedCentre.address||"",
        centreCity:selectedCentre.city||"",
        centreDistrict:selectedCentre.district||"",
        centreState:selectedCentre.state||"",
        centrePin:selectedCentre.pin||"",
        published:false,
        status:"Draft",
        version:1,
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      },
      {merge:true}
    );

    count++;
  }

  await log(
    "BULK_ADMIT_DRAFT_GENERATED",
    v.examId,
    {
      count,
      centre:v.centreId
    }
  );

  showMsg(
    $("#allocMsg"),
    `${count} admit-card drafts generated.`
  );
}


/* =========================================================
   ADMIT CARDS
   ========================================================= */

async function admit(){

  if(!guard("admit"))return;

  const s=await getDocs(
    query(
      collection(db,"admitCards"),
      orderBy("updatedAt","desc"),
      limit(1000)
    )
  );

  window.__admit=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  panel.innerHTML=`

    <h2>Admit Card Management</h2>

    <div class="toolbar">

      <input
        id="admitSearch"
        placeholder="Application / Roll / Candidate"
      >

      <button
        id="admitGenerate"
        class="btn"
      >
        Generate Missing Drafts
      </button>

      <button
        id="admitExport"
        class="btn"
      >
        Export CSV
      </button>

    </div>

    <div id="admitTable"></div>
  `;

  $("#admitGenerate").onclick=
    ()=>loadTab("centres");

  $("#admitExport").onclick=()=>{

    downloadText(
      "admit-cards.csv",

      [
        [
          "Application",
          "Roll",
          "Candidate",
          "Centre",
          "Date",
          "Reporting",
          "Published",
          "Version"
        ],

        ...(window.__admit||[])
          .map(x=>[
            x.id,
            x.rollNumber,
            x.candidateName,
            x.centreName,
            x.examDate,
            x.reportingTime,
            x.published,
            x.version
          ])
      ]
      .map(r=>
        r.map(v=>
          `"${String(v??"").replace(/"/g,'""')}"`
        ).join(",")
      )
      .join("\n"),

      "text/csv"
    );
  };

  $("#admitSearch").oninput=renderAdmit;

  renderAdmit();
}


function renderAdmit(){

  const q=
    $("#admitSearch")
      .value
      .toLowerCase();

  const rows=
    (window.__admit||[])
      .filter(x=>
        [
          x.id,
          x.rollNumber,
          x.candidateName,
          x.centreName
        ]
        .some(v=>
          String(v||"")
            .toLowerCase()
            .includes(q)
        )
      );

  $("#admitTable").innerHTML=
    table(
      [
        "Application",
        "Roll",
        "Candidate",
        "Centre",
        "Exam Date",
        "Status",
        "Version",
        "Actions"
      ],

      rows.map(x=>`

        <tr>

          <td>${esc(x.id)}</td>

          <td>${esc(x.rollNumber)}</td>

          <td>${esc(x.candidateName)}</td>

          <td>${esc(x.centreName)}</td>

          <td>${esc(x.examDate)}</td>

          <td>
            ${esc(x.status||"Draft")}
          </td>

          <td>
            ${esc(x.version||1)}
          </td>

          <td>

            <button
              class="btn small"
              data-edit-admit="${x.id}"
            >
              Edit
            </button>

            <button
              class="btn small"
              data-publish-admit="${x.id}"
            >
              ${x.published?"Unpublish":"Publish"}
            </button>
            <button class="btn small danger" data-delete-admit="${esc(x.id)}">Delete</button>

          </td>

        </tr>
      `)
    );

  $("#admitTable")
    .querySelectorAll("[data-edit-admit]")
    .forEach(b=>
      b.onclick=()=>editAdmit(
        b.dataset.editAdmit
      )
    );

  $("#admitTable")
    .querySelectorAll("[data-publish-admit]")
    .forEach(b=>
      b.onclick=()=>toggleAdmit(
        b.dataset.publishAdmit
      )
    );
  $("#admitTable").querySelectorAll("[data-delete-admit]").forEach(b=>b.onclick=()=>deleteAdmit(b.dataset.deleteAdmit));
}


async function deleteAdmit(id){
  const s=await getDoc(doc(db,"admitCards",id)); if(!s.exists()){alert("Admit card not found.");return}
  if(s.data().published){alert("Published admit cards cannot be deleted. Unpublish first.");return}
  if(!confirm("Delete draft admit card "+id+"?"))return;
  await deleteDoc(doc(db,"admitCards",id)); await log("ADMIT_CARD_DELETED",id); admit();
}

async function editAdmit(id){

  const s=await getDoc(
    doc(db,"admitCards",id)
  );

  const x=s.data();

  panel.innerHTML=`

    <h2>
      Edit Admit Card — ${esc(id)}
    </h2>

    <form
      id="admitEdit"
      class="form-grid"
    >

      ${field(
        "Candidate Name",
        "candidateName",
        "text",
        x.candidateName||""
      )}

      ${field(
        "Roll Number",
        "rollNumber",
        "text",
        x.rollNumber||""
      )}

      ${field(
        "Exam Date",
        "examDate",
        "date",
        x.examDate||""
      )}

      ${field(
        "Reporting Time",
        "reportingTime",
        "time",
        x.reportingTime||""
      )}

      ${field(
        "Gate Closing Time",
        "gateClosingTime",
        "time",
        x.gateClosingTime||""
      )}

      ${field(
        "Exam Time",
        "examTime",
        "text",
        x.examTime||""
      )}

      ${field(
        "Centre Code",
        "centreCode",
        "text",
        x.centreCode||""
      )}

      ${field(
        "Centre Name",
        "centreName",
        "text",
        x.centreName||""
      )}

      ${field(
        "Centre Address",
        "centreAddress",
        "text",
        x.centreAddress||""
      )}

      ${field(
        "Issue Date",
        "issueDate",
        "date",
        x.issueDate||""
      )}

      ${field(
        "Version",
        "version",
        "number",
        x.version||1
      )}

      ${field(
        "Exam/Post",
        "examPost",
        "text",
        x.examPost||""
      )}

      ${field(
        "Exam Language",
        "examLanguage",
        "text",
        x.examLanguage||""
      )}

      ${field(
        "Required ID",
        "requiredId",
        "text",
        x.requiredId||"Government photo ID"
      )}

      ${field(
        "Allowed Items",
        "allowedItems",
        "text",
        x.allowedItems||""
      )}

      ${field(
        "Instructions",
        "instructions",
        "text",
        x.instructions||""
      )}

      <button class="btn primary">
        Save Admit Card
      </button>

      <button
        type="button"
        class="btn"
        id="admitPrint"
      >
        Preview / Print
      </button>

      <p
        id="admitMsg"
        class="message"
      ></p>

    </form>
  `;

  $("#admitEdit").onsubmit=async e=>{

    e.preventDefault();

    const v=formObj(e.target);

    v.version=
      Number(v.version||1);

    v.updatedAt=
      serverTimestamp();

    await updateDoc(
      doc(db,"admitCards",id),
      v
    );

    await log(
      "ADMIT_CARD_UPDATED",
      id
    );

    showMsg(
      $("#admitMsg"),
      "Saved."
    );
  };

  $("#admitPrint").onclick=()=>{
    window.open(
      `admit-card.html?preview=${encodeURIComponent(id)}`,
      "_blank"
    );
  };
}


async function toggleAdmit(id){

  const s=await getDoc(doc(db,"admitCards",id));
  if(!s.exists()){alert("Admit card not found.");return}
  const x=s.data();
  if(x.published){await updateDoc(doc(db,"admitCards",id),{published:false,status:"Draft",publishedAt:null,updatedAt:serverTimestamp()});await log("ADMIT_CARD_UNPUBLISHED",id);admit();return}
  if(!x.rollNumber){alert("Roll number is required before publishing.");return}
  const examSnap=x.examId?await getDoc(doc(db,"exams",x.examId)):null;
  const exam=examSnap?.exists()?{id:examSnap.id,...examSnap.data()}:null;
  const life=examLifecycle(exam);
  const releaseConfigured=!!(exam?.admitReleaseMs??exam?.admitRelease);
  if(releaseConfigured&&!life.admitReleased){alert("Admit card release date/time has not been reached.");return}
  await updateDoc(doc(db,"admitCards",id),{published:true,status:"Published",publishedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  await log("ADMIT_CARD_PUBLISHED",id,{releaseChecked:true});
  admit();
}


/* =========================================================
   RESULTS
   ========================================================= */

async function results(){

  if(!guard("results"))return;

  panel.innerHTML=`

    <h2>Result Management</h2>

    <div class="toolbar">

      <button
        class="btn primary"
        id="manualResult"
      >
        Manual Result
      </button>

      <button
        class="btn"
        id="importResult"
      >
        CSV / Excel Import
      </button>

      <button
        class="btn"
        id="resultList"
      >
        Published / Draft List
      </button>

    </div>

    <div id="resultWork"></div>
  `;

  $("#manualResult").onclick=
    manualResult;

  $("#importResult").onclick=
    resultImport;

  $("#resultList").onclick=
    resultList;

  resultList();
}


async function resultList(){

  const s=await getDocs(
    query(
      collection(db,"results"),
      orderBy("updatedAt","desc"),
      limit(1000)
    )
  );

  window.__results=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  $("#resultWork").innerHTML=
    table(
      [
        "Application",
        "Candidate",
        "Marks",
        "Max",
        "%",
        "Rank",
        "Status",
        "Published",
        "Revision",
        "Actions"
      ],

      window.__results.map(x=>`

        <tr>

          <td>${esc(x.id)}</td>

          <td>${esc(x.candidateName)}</td>

          <td>
            ${esc(
              x.finalMarks??x.marksObtained
            )}
          </td>

          <td>
            ${esc(x.maximumMarks)}
          </td>

          <td>
            ${esc(x.percentage)}
          </td>

          <td>
            ${esc(x.rank)}
          </td>

          <td>
            ${esc(x.status)}
          </td>

          <td>
            ${x.published?"Yes":"No"}
          </td>

          <td>
            ${esc(x.revision||1)}
          </td>

          <td>

            <button
              class="btn small"
              data-edit-result="${x.id}"
            >
              Edit
            </button>

            <button
              class="btn small"
              data-pub-result="${x.id}"
            >
              ${x.published?"Unpublish":"Publish"}
            </button>
            <button class="btn small danger" data-delete-result="${esc(x.id)}">Delete</button>

          </td>

        </tr>
      `)
    );

  $("#resultWork")
    .querySelectorAll("[data-edit-result]")
    .forEach(b=>
      b.onclick=()=>editResult(
        b.dataset.editResult
      )
    );

  $("#resultWork")
    .querySelectorAll("[data-pub-result]")
    .forEach(b=>
      b.onclick=()=>toggleResult(
        b.dataset.pubResult
      )
    );
  $("#resultWork").querySelectorAll("[data-delete-result]").forEach(b=>b.onclick=()=>deleteResult(b.dataset.deleteResult));
}


async function deleteResult(id){
  const s=await getDoc(doc(db,"results",id)); if(!s.exists()){alert("Result not found.");return}
  if(s.data().published){alert("Published results cannot be deleted. Unpublish first.");return}
  if(!confirm("Delete draft result "+id+"?"))return;
  await deleteDoc(doc(db,"results",id)); await log("RESULT_DELETED",id,{revision:s.data().revision||1}); resultList();
}

async function manualResult(existing=null){

  const x=existing||{};

  $("#resultWork").innerHTML=`

    <h3>
      ${existing?"Edit":"Create"} Result
    </h3>

    <form
      id="resultForm"
      class="form-grid"
    >

      ${field(
        "Application Number",
        "applicationNumber",
        "text",
        existing?.id||"",
        "required"
      )}

      ${field(
        "Candidate Name",
        "candidateName",
        "text",
        x.candidateName||""
      )}

      ${field(
        "Roll Number",
        "rollNumber",
        "text",
        x.rollNumber||""
      )}

      ${field(
        "Exam/Post",
        "examPost",
        "text",
        x.examPost||""
      )}

      ${field(
        "Total Questions",
        "totalQuestions",
        "number",
        x.totalQuestions||""
      )}

      ${field(
        "Attempted",
        "attempted",
        "number",
        x.attempted||""
      )}

      ${field(
        "Not Attempted",
        "notAttempted",
        "number",
        x.notAttempted||""
      )}

      ${field(
        "Correct",
        "correct",
        "number",
        x.correct||""
      )}

      ${field(
        "Wrong",
        "wrong",
        "number",
        x.wrong||""
      )}

      ${field(
        "Marks Obtained",
        "marksObtained",
        "number",
        x.marksObtained||""
      )}

      ${field(
        "Negative Marks",
        "negativeMarks",
        "number",
        x.negativeMarks||"0"
      )}

      ${field(
        "Final Marks",
        "finalMarks",
        "number",
        x.finalMarks??""
      )}

      ${field(
        "Maximum Marks",
        "maximumMarks",
        "number",
        x.maximumMarks||""
      )}

      ${field(
        "Percentage",
        "percentage",
        "number",
        x.percentage||""
      )}

      ${field(
        "Grade",
        "grade",
        "text",
        x.grade||""
      )}

      ${field(
        "Rank",
        "rank",
        "number",
        x.rank||""
      )}

      ${field(
        "Percentile",
        "percentile",
        "number",
        x.percentile||""
      )}

      ${select(
        "Status",
        "status",
        [
          "Qualified",
          "Not Qualified",
          "Pass",
          "Fail",
          "Pending",
          "Withheld"
        ],
        x.status||"Pending"
      )}

      ${field(
        "Cut-off",
        "cutoff",
        "number",
        x.cutoff||""
      )}

      ${check(
        "Published",
        "published",
        !!x.published
      )}

      ${check(
        "Question-wise enabled",
        "questionWiseEnabled",
        !!x.questionWiseEnabled
      )}

      <label>
        Section-wise JSON
        <textarea name="sections">
${esc(
  JSON.stringify(
    x.sections||[],
    null,
    2
  )
)}
        </textarea>
      </label>

      <label>
        Question-wise JSON
        <textarea name="questionWise">
${esc(
  JSON.stringify(
    x.questionWise||[],
    null,
    2
  )
)}
        </textarea>
      </label>

      <button class="btn primary">
        Save Result
      </button>

      <p
        id="resultMsg"
        class="message"
      ></p>

    </form>
  `;

  $("#resultForm").onsubmit=async e=>{

    e.preventDefault();

    const v=formObj(e.target);

    for(
      const n of [
        "totalQuestions",
        "attempted",
        "notAttempted",
        "correct",
        "wrong",
        "marksObtained",
        "negativeMarks",
        "finalMarks",
        "maximumMarks",
        "percentage",
        "rank",
        "percentile",
        "cutoff"
      ]
    ){

      if(v[n]!=="")
        v[n]=Number(v[n]);
    }

    try{

      v.sections=
        JSON.parse(
          v.sections||"[]"
        );

      v.questionWise=
        JSON.parse(
          v.questionWise||"[]"
        );

    }catch{

      showMsg(
        $("#resultMsg"),
        "Section/Question JSON is invalid.",
        true
      );

      return;
    }

    const app=
      await getDoc(
        doc(
          db,
          "applications",
          v.applicationNumber
        )
      );
    if(!app.exists()){showMsg($("#resultMsg"),"Application not found.",true);return}
    const appData=app.data();
    v.authUid=appData.authUid;
    v.examId=appData.examId||v.examId||"default";
    const max=v.maximumMarks===""?null:Number(v.maximumMarks);
    const final=v.finalMarks===""?Number(v.marksObtained||0):Number(v.finalMarks);
    if(max!=null&&(!Number.isFinite(max)||max<=0)){showMsg($("#resultMsg"),"Maximum marks must be greater than zero.",true);return}
    if(!Number.isFinite(final)||(max!=null&&(final<0||final>max))){showMsg($("#resultMsg"),"Final marks are invalid.",true);return}
    if(v.percentage!==""&&(!Number.isFinite(Number(v.percentage))||Number(v.percentage)<0||Number(v.percentage)>100)){showMsg($("#resultMsg"),"Percentage must be between 0 and 100.",true);return}
    if(v.totalQuestions!==""&&Number(v.totalQuestions)<0){showMsg($("#resultMsg"),"Total questions cannot be negative.",true);return}
    if(v.attempted!==""&&v.totalQuestions!==""&&Number(v.attempted)>Number(v.totalQuestions)){showMsg($("#resultMsg"),"Attempted questions cannot exceed total questions.",true);return}

    v.revision=
      (existing?.revision||0)+1;

    v.updatedAt=
      serverTimestamp();

    v.issueDate=
      new Date()
        .toISOString()
        .slice(0,10);

    await setDoc(
      doc(
        db,
        "results",
        v.applicationNumber
      ),
      v,
      {merge:true}
    );

    await log(
      "RESULT_SAVED",
      v.applicationNumber,
      {
        revision:v.revision
      }
    );

    showMsg(
      $("#resultMsg"),
      "Result saved."
    );
  };
}


async function editResult(id){

  const x=
    window.__results.find(
      r=>r.id===id
    );

  manualResult(x);
}


async function toggleResult(id){

  const s=await getDoc(doc(db,"results",id));
  if(!s.exists()){alert("Result not found.");return}
  const x=s.data();
  if(x.published){
    await updateDoc(doc(db,"results",id),{published:false,status:"Draft",publishedAt:null,updatedAt:serverTimestamp()});
    await log("RESULT_UNPUBLISHED",id,{revision:x.revision||1});
    resultList();
    return;
  }
  const examSnap=x.examId?await getDoc(doc(db,"exams",x.examId)):null;
  const exam=examSnap?.exists()?{id:examSnap.id,...examSnap.data()}:null;
  const life=examLifecycle(exam);
  const releaseConfigured=!!(exam?.resultReleaseMs??exam?.resultRelease);
  if(releaseConfigured&&!life.resultReleased){alert("Result release date/time has not been reached.");return}
  if(x.maximumMarks!=null&&x.finalMarks!=null&&(Number(x.finalMarks)<0||Number(x.finalMarks)>Number(x.maximumMarks))){alert("Invalid result marks.");return}
  if(!String(x.status||"").trim()||["Draft","Pending"].includes(String(x.status))){alert("Set a final result status before publishing.");return}
  await updateDoc(doc(db,"results",id),{published:true,status:x.status||"Published",publishedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  await log("RESULT_PUBLISHED",id,{revision:x.revision||1,releaseChecked:true});
  resultList();
}


/* =========================================================
   RESULT IMPORT
   ========================================================= */

async function resultImport(){

  $("#resultWork").innerHTML=`

    <h3>CSV Result Import</h3>

    <p>
      Accepted CSV headers include Application Number,
      Roll Number, Candidate Name, Marks Obtained,
      Maximum Marks, Percentage, Rank, Percentile,
      Status. Additional section/question JSON
      columns are optional.
    </p>

    <div class="dropzone">

      <input
        id="resultFile"
        type="file"
        accept=".csv"
      >

    </div>

    <div class="actions">

      <button
        class="btn"
        id="parseResults"
      >
        Preview
      </button>

      <button
        class="btn primary"
        id="commitResults"
      >
        Validate & Save Unpublished
      </button>

    </div>

    <p
      id="importMsg"
      class="message"
    ></p>

    <div id="importPreview"></div>
  `;

  $("#parseResults").onclick=
    ()=>parseImport(false);

  $("#commitResults").onclick=
    ()=>parseImport(true);
}


function parseCSV(text){

  const lines=
    text
      .split(/\r?\n/);

  if(!lines.length)return[];

  const split=l=>{

    let a=[];
    let c="";
    let q=false;

    for(
      let i=0;
      i<l.length;
      i++
    ){

      const ch=l[i];

      if(
        ch==='"'&&
        l[i+1]==='"'
      ){

        c+='"';
        i++;
        continue;
      }

      if(ch==='"'){
        q=!q;
        continue;
      }

      if(ch===','&&!q){

        a.push(c);
        c="";

      }else{

        c+=ch;
      }
    }

    a.push(c);

    return a;
  };

  const h=
    split(lines[0])
      .map(x=>x.trim());

  return lines
    .slice(1)
    .map(l=>{

      const a=split(l);
      const o={};

      h.forEach(
        (k,i)=>
          o[k]=a[i]??""
      );

      return o;
    });
}


async function parseImport(commit){

  const file=
    $("#resultFile").files[0];

  if(!file){

    showMsg(
      $("#importMsg"),
      "Choose a CSV file.",
      true
    );

    return;
  }

  if(!/\.csv$/i.test(file.name)){

    showMsg(
      $("#importMsg"),
      "Only CSV files are supported. Export the Excel sheet as CSV and import that file.",
      true
    );

    return;
  }

  const rows=
    parseCSV(
      await file.text()
    );

  const normalized=
    rows.map(r=>{

      const get=(...keys)=>{

        const k=
          Object.keys(r)
            .find(k=>
              keys.includes(
                k.trim().toLowerCase()
              )
            );

        return k?r[k]:"";
      };

      return {

        applicationNumber:
          (
            get(
              "application number",
              "applicationnumber",
              "application no",
              "app no"
            )||""
          )
          .trim()
          .toUpperCase(),

        rollNumber:
          get(
            "roll number",
            "rollnumber"
          ),

        candidateName:
          get(
            "candidate name",
            "name"
          ),

        marksObtained:
          get(
            "marks obtained",
            "marksobtained"
          ),

        maximumMarks:
          get(
            "maximum marks",
            "max marks",
            "maximummarks"
          ),

        percentage:
          get("percentage"),

        rank:
          get("rank"),

        percentile:
          get("percentile"),

        status:
          get("status")||"Pending"
      };
    });

  const invalid=
    normalized.filter(
      x=>!x.applicationNumber
    );

  $("#importPreview").innerHTML=
    table(
      [
        "Application",
        "Roll",
        "Candidate",
        "Marks",
        "Max",
        "%",
        "Rank",
        "Percentile",
        "Status",
        "Validation"
      ],

      normalized.map(x=>`

        <tr
          class="${!x.applicationNumber?"danger-row":""}"
        >

          <td>${esc(x.applicationNumber)}</td>

          <td>${esc(x.rollNumber)}</td>

          <td>${esc(x.candidateName)}</td>

          <td>${esc(x.marksObtained)}</td>

          <td>${esc(x.maximumMarks)}</td>

          <td>${esc(x.percentage)}</td>

          <td>${esc(x.rank)}</td>

          <td>${esc(x.percentile)}</td>

          <td>${esc(x.status)}</td>

          <td>
            ${
              x.applicationNumber
                ?"OK"
                :"Missing Application Number"
            }
          </td>

        </tr>
      `)
    );

  if(!commit){

    window.__importRows=
      normalized;

    showMsg(
      $("#importMsg"),
      `${normalized.length} rows loaded. ${invalid.length} invalid.`
    );

    return;
  }

  if(invalid.length){

    showMsg(
      $("#importMsg"),
      "Fix invalid rows before saving.",
      true
    );

    return;
  }

  let saved=0;

  for(const x of normalized){

    const app=
      await getDoc(
        doc(
          db,
          "applications",
          x.applicationNumber
        )
      );

    if(!app.exists())continue;

    const marks=Number(x.marksObtained||0);
    const maximum=Number(x.maximumMarks||0);
    const percentage=Number(x.percentage||0);
    if(!Number.isFinite(maximum)||maximum<=0||!Number.isFinite(marks)||marks<0||marks>maximum||!Number.isFinite(percentage)||percentage<0||percentage>100){
      showMsg($("#importMsg"),"Import stopped: one or more rows has invalid marks/maximum/percentage.",true);
      return;
    }
    const existingResult=await getDoc(doc(db,"results",x.applicationNumber));
    const n={
      ...x,
      marksObtained:marks,
      maximumMarks:maximum,
      percentage,
      rank:x.rank?Number(x.rank):null,
      percentile:x.percentile?Number(x.percentile):null,
      published:false,
      revision:(existingResult.exists()?Number(existingResult.data().revision||0):0)+1,
      authUid:app.data().authUid,
      examId:app.data().examId||"default",
      examPost:app.data().personal?.examPost||"",

      updatedAt:
        serverTimestamp(),

      issueDate:
        new Date()
          .toISOString()
          .slice(0,10)
    };

    await setDoc(
      doc(
        db,
        "results",
        x.applicationNumber
      ),
      n,
      {merge:true}
    );

    saved++;
  }

  await log(
    "RESULT_BULK_IMPORTED",
    "",
    {
      rows:normalized.length,
      saved
    }
  );

  showMsg(
    $("#importMsg"),
    `${saved} results saved as unpublished.`
  );
}


/* =========================================================
   NOTICES
   ========================================================= */

async function notices(){

  if(!guard("notices"))return;

  const s=await getDocs(
    query(
      collection(db,"notices"),
      orderBy("createdAt","desc"),
      limit(100)
    )
  );

  window.__notices=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  panel.innerHTML=`

    <h2>Notice Management</h2>

    <form
      id="noticeForm"
      class="form-grid"
    >

      ${field(
        "Title",
        "title",
        "text",
        "",
        "required"
      )}

      ${field(
        "Start Date",
        "startDate",
        "datetime-local"
      )}

      ${field(
        "End Date",
        "endDate",
        "datetime-local"
      )}

      ${select(
        "Priority",
        "priority",
        [
          "Normal",
          "Important",
          "Urgent"
        ]
      )}

      ${field(
        "Exam Scope",
        "examId",
        "text",
        "All exams"
      )}

      ${field(
        "Attachment URL",
        "attachmentUrl"
      )}

      ${field(
        "Content",
        "content"
      )}

      ${check(
        "Active",
        "active",
        true
      )}

      <div class="actions">
        <button type="submit" class="btn primary">
          Save Notice Settings
        </button>
      </div>

    </form>

    <div id="noticeTable"></div>
  `;

  $("#noticeForm").onsubmit=async e=>{

    e.preventDefault();

    const v=formObj(e.target);

    v.active=
      bool(e.target,"active");

    await addDoc(
      collection(db,"notices"),
      {
        ...v,
        createdAt:serverTimestamp()
      }
    );

    await log(
      "NOTICE_CREATED",
      v.title
    );

    notices();
  };

  $("#noticeTable").innerHTML=
    table(
      [
        "Title",
        "Priority",
        "Scope",
        "Start",
        "End",
        "Active",
        "Action"
      ],

      window.__notices.map(x=>`

        <tr>

          <td>${esc(x.title)}</td>

          <td>${esc(x.priority)}</td>

          <td>${esc(x.examId)}</td>

          <td>${esc(x.startDate)}</td>

          <td>${esc(x.endDate)}</td>

          <td>
            ${x.active!==false?"Yes":"No"}
          </td>

          <td>

            <button
              class="btn small"
              data-del-notice="${x.id}"
            >
              Delete
            </button>

          </td>

        </tr>
      `)
    );

  $("#noticeTable")
    .querySelectorAll("[data-del-notice]")
    .forEach(b=>
      b.onclick=async()=>{

        await deleteDoc(
          doc(
            db,
            "notices",
            b.dataset.delNotice
          )
        );

        await log(
          "NOTICE_DELETED",
          b.dataset.delNotice
        );

        notices();
      }
    );
}


/* =========================================================
   REPORTS & EXPORT
   ========================================================= */

async function reports(){

  if(!guard("reports"))return;

  panel.innerHTML=`

    <h2>Reports & Export</h2>

    <p>
      Export operational datasets for offline processing,
      archival and reconciliation.
    </p>

    <div class="grid-3">

      <button
        class="btn"
        id="rApps"
      >
        Applications CSV
      </button>

      <button
        class="btn"
        id="rPay"
      >
        Payments CSV
      </button>

      <button
        class="btn"
        id="rAdmit"
      >
        Admit Cards CSV
      </button>

      <button
        class="btn"
        id="rResult"
      >
        Results CSV
      </button>

      <button
        class="btn"
        id="rCentre"
      >
        Centres CSV
      </button>

      <button
        class="btn"
        id="rAudit"
      >
        Audit CSV
      </button>

    </div>

    <p
      id="reportMsg"
      class="message"
    ></p>
  `;

  $("#rApps").onclick=
    ()=>exportCollection(
      "applications",
      [
        "Application",
        "Name",
        "Mobile",
        "Status",
        "Payment"
      ],
      x=>[
        x.id,
        x.personal?.fullName,
        x.personal?.mobile,
        x.status,
        x.paymentStatus
      ]
    );

  $("#rPay").onclick=
    ()=>exportCollection(
      "payments",
      [
        "ID",
        "Application",
        "Status",
        "Transaction",
        "Amount"
      ],
      x=>[
        x.id,
        x.applicationNumber,
        x.status,
        x.transactionId,
        x.amount
      ]
    );

  $("#rAdmit").onclick=
    ()=>exportCollection(
      "admitCards",
      [
        "Application",
        "Roll",
        "Candidate",
        "Centre",
        "Published"
      ],
      x=>[
        x.id,
        x.rollNumber,
        x.candidateName,
        x.centreName,
        x.published
      ]
    );

  $("#rResult").onclick=
    ()=>exportCollection(
      "results",
      [
        "Application",
        "Candidate",
        "Marks",
        "Max",
        "Percentage",
        "Rank",
        "Status",
        "Published"
      ],
      x=>[
        x.id,
        x.candidateName,
        x.finalMarks??x.marksObtained,
        x.maximumMarks,
        x.percentage,
        x.rank,
        x.status,
        x.published
      ]
    );

  $("#rCentre").onclick=
    ()=>exportCollection(
      "centres",
      [
        "Code",
        "Name",
        "Address",
        "Capacity",
        "Active"
      ],
      x=>[
        x.id,
        x.name,
        x.address,
        x.capacity,
        x.active
      ]
    );

  $("#rAudit").onclick=
    ()=>exportCollection(
      "auditLogs",
      [
        "Admin",
        "Action",
        "Candidate",
        "Time"
      ],
      x=>[
        x.admin,
        x.action,
        x.candidate,
        x.time
      ]
    );
}


async function exportCollection(
  col,
  headers,
  map
){

  const s=await getDocs(
    collection(db,col)
  );

  const rows=
    s.docs.map(d=>
      map({
        id:d.id,
        ...d.data()
      })
    );

  downloadText(
    `${col}.csv`,

    [
      headers,
      ...rows
    ]
    .map(r=>
      r.map(v=>
        `"${String(v??"").replace(/"/g,'""')}"`
      ).join(",")
    )
    .join("\n"),

    "text/csv"
  );

  await log(
    "DATA_EXPORT",
    col,
    {
      count:rows.length
    }
  );
}


/* =========================================================
   ADMIN ROLES
   ========================================================= */

async function admins(){

  if(!guard("adminUsers"))return;

  const s=await getDocs(
    collection(db,"admins")
  );

  window.__admins=
    s.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

  panel.innerHTML=`

    <h2>Admin Users & Permissions</h2>

    <p class="muted">
      Create the Auth account separately in Firebase
      Authentication, then add its UID here.
    </p>

    <form
      id="adminForm"
      class="form-grid"
    >

      ${field(
        "Firebase Auth UID",
        "uid",
        "text",
        "",
        "required"
      )}

      ${field(
        "Name",
        "name",
        "text",
        "",
        "required"
      )}

      ${field(
        "Email",
        "email"
      )}

      ${select(
        "Role",
        "role",
        [
          "superadmin",
          "application_admin",
          "payment_admin",
          "admit_admin",
          "result_admin",
          "verification_admin",
          "report_admin"
        ]
      )}

      ${check(
        "Active",
        "active",
        true
      )}

      <div>

        ${check(
          "All permissions",
          "all",
          false
        )}

        <p class="muted">
          Or choose granular permissions below.
        </p>

      </div>

      ${
        [
          "exams",
          "applications",
          "payments",
          "formBuilder",
          "documents",
          "admit",
          "centres",
          "results",
          "notices",
          "reports",
          "audit",
          "settings",
          "adminUsers"
        ]
        .map(p=>
          check(p,p,false)
        )
        .join("")
      }

      <div class="actions">
        <button type="submit" class="btn primary">
          Save Admin Settings
        </button>
      </div>

    </form>

    <div id="adminTable"></div>
  `;

  $("#adminForm").onsubmit=async e=>{

    e.preventDefault();

    const v=formObj(e.target);

    const permissions={
      all:bool(e.target,"all")
    };

    for(
      const p of [
        "exams",
        "applications",
        "payments",
        "formBuilder",
        "documents",
        "admit",
        "centres",
        "results",
        "notices",
        "reports",
        "audit",
        "settings",
        "adminUsers"
      ]
    ){

      permissions[p]=
        bool(e.target,p);
    }

    await setDoc(
      doc(db,"admins",v.uid),
      {
        name:v.name,
        email:v.email,
        role:v.role,
        active:bool(
          e.target,
          "active"
        ),
        permissions,
        updatedAt:serverTimestamp()
      },
      {merge:true}
    );

    await log(
      "ADMIN_PROFILE_UPDATED",
      v.uid,
      {
        role:v.role
      }
    );

    admins();
  };

  $("#adminTable").innerHTML=
    table(
      [
        "UID",
        "Name",
        "Role",
        "Active",
        "Action"
      ],

      window.__admins.map(x=>`

        <tr>

          <td>${esc(x.id)}</td>

          <td>${esc(x.name)}</td>

          <td>${esc(x.role)}</td>

          <td>
            ${x.active?"Yes":"No"}
          </td>

          <td>

            <button
              class="btn small"
              data-toggle-admin="${x.id}"
            >
              Toggle Active
            </button>
            <button class="btn small danger" data-delete-admin="${esc(x.id)}">Delete</button>

          </td>

        </tr>
      `)
    );

  $("#adminTable")
    .querySelectorAll("[data-toggle-admin]")
    .forEach(b=>
      b.onclick=async()=>{

        const x=
          window.__admins.find(
            a=>a.id===b.dataset.toggleAdmin
          );

        if(x.id===me.uid){

          alert(
            "You cannot disable your own active session."
          );

          return;
        }

        await updateDoc(
          doc(
            db,
            "admins",
            x.id
          ),
          {
            active:!x.active,
            updatedAt:serverTimestamp()
          }
        );

        await log(
          "ADMIN_ACTIVE_TOGGLED",
          x.id
        );

        admins();
      }
    );

  $("#adminTable").querySelectorAll("[data-delete-admin]").forEach(b=>b.onclick=async()=>{
    const x=window.__admins.find(a=>a.id===b.dataset.deleteAdmin); if(!x)return;
    if(x.id===me.uid){alert("You cannot delete your own admin profile.");return}
    if(x.role==="superadmin"){alert("Superadmin profiles cannot be deleted. Disable instead.");return}
    if(!confirm("Delete admin profile "+(x.name||x.id)+"? This removes portal admin access but not the Firebase Auth account."))return;
    await deleteDoc(doc(db,"admins",x.id)); await log("ADMIN_PROFILE_DELETED",x.id,{role:x.role||""}); admins();
  });
}


/* =========================================================
   AUDIT LOG
   ========================================================= */

async function audit(){

  if(!guard("audit"))return;

  const s=await getDocs(
    query(
      collection(db,"auditLogs"),
      orderBy("createdAt","desc"),
      limit(1000)
    )
  );

  window.__auditLogs=s.docs.map(d=>({id:d.id,...d.data()}));

  panel.innerHTML=`
    <h2>Activity / Audit Log</h2>
    <div class="toolbar">
      <input id="auditSearch" placeholder="Search admin / action / candidate">
      <button class="btn" id="auditExport">Export CSV</button>
    </div>
    <div id="auditTable"></div>
  `;

  const render=()=>{
    const q=$("#auditSearch").value.trim().toLowerCase();
    const rows=(window.__auditLogs||[]).filter(x=>
      [x.admin,x.adminUid,x.action,x.candidate,JSON.stringify(x.details||{})]
        .some(v=>String(v||"").toLowerCase().includes(q))
    );
    $("#auditTable").innerHTML=table(
      ["Admin","Action","Candidate","Details","Time"],
      rows.map(x=>`<tr><td>${esc(x.admin)}</td><td>${esc(x.action)}</td><td>${esc(x.candidate)}</td><td>${esc(JSON.stringify(x.details||{}))}</td><td>${esc(toDate(x.createdAt)||x.time)}</td></tr>`)
    );
  };

  $("#auditSearch").oninput=render;
  $("#auditExport").onclick=()=>{
    const rows=(window.__auditLogs||[]).map(x=>[
      x.admin,x.adminUid,x.action,x.candidate,JSON.stringify(x.details||{}),toDate(x.createdAt)||x.time
    ]);
    downloadText("audit-log.csv",[["Admin","Admin UID","Action","Candidate","Details","Time"],...rows]
      .map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"),"text/csv");
  };
  render();
}


/* =========================================================
   PORTAL SETTINGS
   ========================================================= */

async function settings(){

  if(!guard("settings"))return;

  const x=await getSettings();
  window.__portalSettings=x;

  panel.innerHTML=`
    <h2>Portal Settings & Security</h2>
    <p class="muted">Each section has its own Save Settings button. Changes are not applied until you save the relevant section.</p>

    <div class="settings-section">
      <h3>Portal Basics</h3>
      <form id="settingsBasics" class="form-grid">
        ${field("Portal Name","portalName","text",x.portalName||"")}
        ${field("Short Name","portalShortName","text",x.portalShortName||"")}
        ${field("Application Prefix","applicationPrefix","text",x.applicationPrefix||"EXAM")}
        ${field("Active Exam Code","activeExamId","text",x.activeExamId||"default",'placeholder="e.g. jtet001"')}}
        ${field("Public Notice / Footer","footerText","text",x.footerText||"")}
        <div class="actions">
          <button class="btn primary">Save Portal Basics</button>
        </div>
        <p id="settingsBasicsMsg" class="message"></p>
      </form>
    </div>

    <div class="settings-section">
      <h3>Application & Session</h3>
      <form id="settingsApplication" class="form-grid">
        ${check("Application Open","applicationOpen",x.applicationOpen!==false)}
        ${field("Session Timeout (minutes)","sessionTimeoutMinutes","number",x.sessionTimeoutMinutes||30,"min=1")}
        <div class="actions">
          <button class="btn primary">Save Application Settings</button>
        </div>
        <p id="settingsApplicationMsg" class="message"></p>
      </form>
    </div>

    <div class="settings-section">
      <h3>Publication Controls</h3>
      <form id="settingsPublication" class="form-grid">
        ${check("Admit Card Published Globally","admitCardPublished",!!x.admitCardPublished)}
        ${check("Result Published Globally","resultPublished",!!x.resultPublished)}
        <div class="actions">
          <button class="btn primary">Save Publication Settings</button>
        </div>
        <p id="settingsPublicationMsg" class="message"></p>
      </form>
    </div>

    <div class="settings-section">
      <h3>Security & Maintenance</h3>
      <form id="settingsSecurity" class="form-grid">
        ${check("Maintenance Mode","maintenanceMode",!!x.maintenanceMode)}
        ${check("Require OTP / MFA for admins","adminMfaRequired",!!x.adminMfaRequired)}
        <div class="actions">
          <button class="btn primary">Save Security Settings</button>
        </div>
        <p id="settingsSecurityMsg" class="message"></p>
      </form>
    </div>

    <div id="settingsSummary"></div>

    <div class="card">
      <h3>Backup / Data Management</h3>
      <p>Use Reports & Export for operational CSV backups.</p>
      <button class="btn" id="backupMeta">Export Current Portal Settings JSON</button>
    </div>
  `;

  const savePart=async(form,fields,msgId)=>{
    const v=formObj(form);
    if(fields.includes("activeExamId")){
      v.activeExamId=String(v.activeExamId||"default").trim();
      if(v.activeExamId && v.activeExamId!=="default"){
        const examSnap=await getDoc(doc(db,"exams",v.activeExamId));
        if(!examSnap.exists()){
          showMsg(document.querySelector("#"+msgId),"Active Exam Code not found: "+v.activeExamId,true);
          return;
        }
      }
    }
    for(const n of fields){
      if(["applicationOpen","admitCardPublished","resultPublished","maintenanceMode","adminMfaRequired"].includes(n)){
        v[n]=bool(form,n);
      }
    }
    if("applicationSequence" in v)v.applicationSequence=Number(v.applicationSequence||100001);
    if("sessionTimeoutMinutes" in v)v.sessionTimeoutMinutes=Number(v.sessionTimeoutMinutes||30);

    await setDoc(
      doc(db,"settings","portal"),
      {...v,updatedAt:serverTimestamp()},
      {merge:true}
    );

    await log("PORTAL_SETTINGS_UPDATED","",{section:msgId});
    window.__portalSettings=await getSettings();
    renderSettingsSummary(window.__portalSettings);
    showMsg(document.querySelector("#"+msgId), "Settings saved.");
  };

  $("#settingsBasics").onsubmit=e=>{
    e.preventDefault();
    savePart(e.target,["portalName","portalShortName","applicationPrefix","applicationSequence","activeExamId","footerText"],"settingsBasicsMsg");
  };

  $("#settingsApplication").onsubmit=e=>{
    e.preventDefault();
    savePart(e.target,["applicationOpen","sessionTimeoutMinutes"],"settingsApplicationMsg");
  };

  $("#settingsPublication").onsubmit=e=>{
    e.preventDefault();
    savePart(e.target,["admitCardPublished","resultPublished"],"settingsPublicationMsg");
  };

  $("#settingsSecurity").onsubmit=e=>{
    e.preventDefault();
    savePart(e.target,["maintenanceMode","adminMfaRequired"],"settingsSecurityMsg");
  };

  $("#backupMeta").onclick=()=>{
    const current=window.__portalSettings||{};
    downloadText(
      "portal-settings.json",
      JSON.stringify({...current,exportedAt:new Date().toISOString()},null,2),
      "application/json"
    );
  };

  renderSettingsSummary(x);
}

function renderSettingsSummary(x){

  const rows=[
    ["Portal Name",x.portalName],
    ["Short Name",x.portalShortName],
    ["Application Prefix",x.applicationPrefix],
    ["Active Exam Code",x.activeExamId||"default"],
    ["Application Open",x.applicationOpen!==false?"Enabled":"Disabled"],
    ["Session Timeout",`${x.sessionTimeoutMinutes||30} minutes`],
    ["Admit Card Published",x.admitCardPublished?"Enabled":"Disabled"],
    ["Result Published",x.resultPublished?"Enabled":"Disabled"],
    ["Maintenance Mode",x.maintenanceMode?"Enabled":"Disabled"],
    ["Admin MFA",x.adminMfaRequired?"Enabled":"Disabled"],
    ["Enabled Student Fields",Object.entries(x.formFieldEnabled||{}).filter(([,v])=>v!==false).map(([k])=>k).join(", ")||"All built-in fields by default"]
  ];

  $("#settingsSummary").innerHTML=section(
    "Currently Saved Settings",
    table(["Setting","Saved Value"],rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v??"")}</td></tr>`))
  );
}