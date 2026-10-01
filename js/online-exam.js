import {auth,db,doc,getDoc,getDocs,collection,query,orderBy,setDoc,updateDoc,serverTimestamp,signInWithEmailAndPassword,signOut,escapeHtml,showMsg,getSettings,examLifecycle} from "./firebase.js";

const $=s=>document.querySelector(s);
let examId=new URLSearchParams(location.search).get("exam");
let exam=null,app=null,attempt=null,questions=[],index=0,timer=null,dirtyTimer=null,savePromise=Promise.resolve();

function esc(v){return escapeHtml(v??"")}
function msg(t,e=false){const el=$("#examApp");el.innerHTML=`<div class="card"><p class="${e?"danger-text":"message"}">${esc(t)}</p></div>`}
function shuffled(a){const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
function answerValue(qid){return attempt?.answers?.[qid]||""}
function answeredCount(){return Object.values(attempt?.answers||{}).filter(Boolean).length}
function formatTime(ms){const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/3600)).padStart(2,"0")+":"+String(Math.floor(s%3600/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0")}

async function init(){
  if(!examId)return msg("Online exam link is missing.",true);
  try{
    const settings=await getSettings();
    examId=examId||settings.activeExamId||"default";
    if(settings.maintenanceMode)return msg("Portal is under maintenance.",true);
    const es=await getDoc(doc(db,"exams",examId));
    if(!es.exists())return msg("Exam not found.",true);
    exam={id:es.id,...es.data()};
    if(exam.onlineExamEnabled!==true||exam.onlineExamPublished!==true)return msg("This online examination is not currently available.",true);
    const life=examLifecycle(exam);
    if(exam.applicationStartMs||exam.applicationStart)if(!life.applicationOpen&&exam.status!=="Completed")return msg("This examination is not open.",true);
    renderLogin();
  }catch(e){console.error(e);msg("Unable to load the examination.",true)}
}

function renderLogin(){
  $("#examApp").innerHTML=`<div class="card narrow"><span class="badge">ONLINE EXAM</span><h1>${esc(exam.examName||exam.id)}</h1><p>${esc(exam.onlineExamDuration||60)} minutes • ${esc(exam.questionCount||exam.onlineExamTotalQuestions||0)} questions • ${esc(exam.onlineExamMaxAttempts||1)} attempt(s)</p><form id="examLogin"><label>Application Number<input id="oeApp" required autocomplete="username"></label><label>Password<input id="oePass" type="password" required autocomplete="current-password"></label><button class="btn primary">Start / Resume Exam</button></form><p id="oeMsg" class="message"></p></div>`;
  $("#examLogin").onsubmit=login;
}

async function login(e){
  e.preventDefault();
  const n=$("#oeApp").value.trim().toUpperCase();
  try{
    await signInWithEmailAndPassword(auth,`${n.toLowerCase()}@candidate.examportal.local`,$("#oePass").value);
    const a=await getDoc(doc(db,"applications",n));
    if(!a.exists())throw new Error("Application not found");
    app={id:a.id,...a.data()};
    if(!["Final Submitted","Approved"].includes(app.status))throw new Error("Application is not eligible for the online exam.");
    if(exam.onlineExamRequiresPayment===true&&app.paymentStatus!=="Successful")throw new Error("Successful payment is required for this exam.");
    const attemptId=`${examId}_${n}`;
    const ar=await getDoc(doc(db,"onlineAttempts",attemptId));
    if(ar.exists()){
      attempt={id:ar.id,...ar.data()};
      if(attempt.status==="Submitted")return renderCompleted();
    }else{
      attempt={id:attemptId,applicationNumber:n,authUid:auth.currentUser.uid,examId,status:"Starting",answers:{},createdAt:serverTimestamp()};
      await setDoc(doc(db,"onlineAttempts",attemptId),attempt);
      await new Promise(r=>setTimeout(r,700));
      const fresh=await getDoc(doc(db,"onlineAttempts",attemptId));
      if(fresh.exists())attempt={id:fresh.id,...fresh.data()};
    }
    await loadQuestions();
  }catch(e){showMsg($("#oeMsg"),e.message||"Unable to start exam.",true)}
}

async function loadQuestions(){
  let s=await getDocs(query(collection(db,"onlineAttempts",attempt.id,"questions"),orderBy("order","asc")));
  if(!s.size){
    await new Promise(r=>setTimeout(r,1200));
    s=await getDocs(query(collection(db,"onlineAttempts",attempt.id,"questions"),orderBy("order","asc")));
  }
  questions=s.docs.map(d=>({id:d.id,...d.data()}));
  if(!questions.length)return msg("Exam paper is still being prepared. Please refresh once.",true);
  index=Math.min(Number(attempt.currentIndex||0),questions.length-1);
  renderExam();
  startTimer();
}

function renderExam(){
  const q=questions[index],ans=answerValue(q.id),total=questions.length;
  $("#examApp").innerHTML=`<div class="exam-shell">
    <section>
      <div class="card exam-head"><div class="admin-head"><div><span class="badge">LIVE TEST</span><h2>${esc(exam.examName||exam.id)}</h2></div><div><div class="muted">Time left</div><div id="timer" class="timer">--:--:--</div></div></div><div class="progress"><i style="width:${((index+1)/total)*100}%"></i></div></div>
      <div class="card question-card"><p class="muted">Question ${index+1} of ${total} • ${esc(q.marks??exam.onlineExamMarksPerQuestion??1)} marks</p><h2>${esc(q.question)}</h2>${(q.options||[]).map((o,i)=>{const key=String.fromCharCode(65+i);return `<label class="option"><input type="radio" name="answer" value="${key}" ${ans===key?"checked":""}> <span><b>${key}.</b> ${esc(o)}</span></label>`}).join("")}</div>
      <div class="card exam-actions"><button class="btn" id="prev" ${index===0?"disabled":""}>Previous</button><button class="btn" id="clear" ${ans?"":"disabled"}>Clear</button><button class="btn primary" id="next">${index===total-1?"Review & Submit":"Next"}</button></div>
    </section>
    <aside class="card exam-side"><h3>Question Palette</h3><p class="muted">${answeredCount()} / ${total} answered</p><div class="palette">${questions.map((x,i)=>`<button data-q="${i}" class="${answerValue(x.id)?"answered ":""}${i===index?"current":""}">${i+1}</button>`).join("")}</div><hr><button class="btn danger" id="submitExam">Submit Exam</button></aside>
  </div>`;
  document.querySelectorAll('input[name="answer"]').forEach(r=>r.onchange=()=>saveAnswer(q.id,r.value));
  $("#prev").onclick=()=>{if(index>0){index--;renderExam()}};
  $("#next").onclick=()=>{if(index===total-1)confirmSubmit();else{index++;renderExam()}};
  $("#clear").onclick=()=>saveAnswer(q.id,"");
  document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{index=Number(b.dataset.q);renderExam()});
  $("#submitExam").onclick=confirmSubmit;
}
async function saveAnswer(qid,value){
  attempt.answers={...(attempt.answers||{}),[qid]:value};
  if(value)attempt.answers[qid]=value;else delete attempt.answers[qid];
  attempt.currentIndex=index;
  clearTimeout(dirtyTimer);
  dirtyTimer=setTimeout(()=>{savePromise=updateDoc(doc(db,"onlineAttempts",attempt.id),{answers:{...(attempt.answers||{})},currentIndex:index,updatedAt:serverTimestamp()}).catch(e=>{console.error("ANSWER SAVE ERROR:",e);throw e})},150);
  renderExam();
}
async function flushAnswerSave(){clearTimeout(dirtyTimer);if(!attempt?.id)return;const data={answers:{...(attempt.answers||{})},currentIndex:index,updatedAt:serverTimestamp()};savePromise=updateDoc(doc(db,"onlineAttempts",attempt.id),data);await savePromise;}\nfunction startTimer(){clearInterval(timer);const tick=async()=>{const end=attempt.expiresAt?.toDate?attempt.expiresAt.toDate():new Date(attempt.expiresAt);const left=end.getTime()-Date.now();const el=$("#timer");if(!el)return;if(left<=0){clearInterval(timer);await submit(true);return}el.textContent=formatTime(left);el.classList.toggle("warn",left<300000)};tick();timer=setInterval(tick,1000)}
async function confirmSubmit(){if(confirm(`Submit exam now? You answered ${answeredCount()} of ${questions.length} questions.`))await submit(false)}
async function submit(auto){
  clearInterval(timer);
  try{
    try{await updateDoc(doc(db,"onlineAttempts",attempt.id),{answers:attempt.answers||{},currentIndex:index,updatedAt:serverTimestamp()})}catch{}
    await updateDoc(doc(db,"onlineAttempts",attempt.id),{status:"Submitted",submittedAt:serverTimestamp(),autoSubmitted:auto,currentIndex:index,updatedAt:serverTimestamp()});
    const fresh=await getDoc(doc(db,"onlineAttempts",attempt.id));
    attempt={id:fresh.id,...fresh.data()};
    renderCompleted()
  }catch(e){alert("Submission failed. Please retry.");startTimer()}
}
async function renderCompleted(){
  clearInterval(timer);
  const s=await getDoc(doc(db,"onlineAttempts",attempt.id));if(s.exists())attempt={id:s.id,...s.data()};
  const done=attempt.graded===true;
  $("#examApp").innerHTML=`<div class="card result-card"><span class="badge">EXAM SUBMITTED</span><h1>${esc(exam.examName||exam.id)}</h1><p>Your answers have been submitted successfully.</p>${done?`<div class="score">${esc(attempt.score??0)}</div><p>${esc(attempt.correct??0)} correct • ${esc(attempt.wrong??0)} wrong • ${esc(attempt.attempted??0)} attempted</p><p class="pill">${attempt.passed?"Passed":"Not Passed"}</p>`:"<p class='muted'>Result is being calculated. Refresh this page shortly.</p>"}</div>`;
  if(!done)setTimeout(renderCompleted,2500);
}
init();
