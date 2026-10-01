import {collection,doc,getDoc,getDocs,setDoc,addDoc,deleteDoc,query,orderBy,serverTimestamp,runTransaction,db,escapeHtml,showMsg} from "./firebase.js";

const $=s=>document.querySelector(s);
const esc=v=>escapeHtml(v??"");

export async function onlineExamAdmin(){
  const admin=window.__adminData;
  if(!(admin?.permissions?.all===true||admin?.permissions?.exams===true||admin?.role==="superadmin")){
    $("#panel").innerHTML='<div class="card"><h2>Permission denied</h2><p>Exam permission is required.</p></div>';
    return;
  }
  const exams=await getDocs(query(collection(db,"exams"),orderBy("createdAt","desc")));
  const rows=exams.docs.map(d=>({id:d.id,...d.data()}));
  $("#panel").innerHTML=`
    <h2>Online Exam Engine</h2>
    <p class="muted">Create the online test, configure timing/marking, manage questions and publish only after the paper is ready.</p>
    <div class="actions">
      <button class="btn primary" id="oeNew">New Online Exam</button>
      <button class="btn" id="oeRefresh">Refresh</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Exam</th><th>Mode</th><th>Questions</th><th>Duration</th><th>Attempts</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${rows.filter(x=>x.mode==="Online"||x.onlineExamEnabled).map(x=>`
        <tr>
          <td>${esc(x.examName||x.id)}<br><small>${esc(x.id)}</small></td>
          <td>${esc(x.onlineExamEnabled?"Online":"—")}</td>
          <td>${esc(x.questionCount||0)}</td>
          <td>${esc(x.onlineExamDuration||60)} min</td>
          <td>${esc(x.onlineExamMaxAttempts||1)}</td>
          <td>${x.onlineExamPublished?"Published":"Draft"}</td>
          <td><button class="btn small" data-oe-config="${esc(x.id)}">Configure</button> <button class="btn small" data-oe-q="${esc(x.id)}">Questions</button></td>
        </tr>`).join("")||'<tr><td colspan="7" class="muted">No online exams configured.</td></tr>'}
    </tbody></table></div>
    <p id="oeMsg" class="message"></p>`;
  $("#oeNew").onclick=()=>onlineExamConfig();
  $("#oeRefresh").onclick=()=>onlineExamAdmin();
  $("#panel").querySelectorAll("[data-oe-config]").forEach(b=>b.onclick=()=>onlineExamConfig(b.dataset.oeConfig));
  $("#panel").querySelectorAll("[data-oe-q]").forEach(b=>b.onclick=()=>onlineQuestions(b.dataset.oeQ));
}

async function onlineExamConfig(id=null){
  const snap=id?await getDoc(doc(db,"exams",id)):null;
  const x=snap?.exists()?{id:snap.id,...snap.data()}:{id:"",examName:"",onlineExamDuration:60,onlineExamTotalQuestions:50,onlineExamMarksPerQuestion:1,onlineExamNegativeMark:0,onlineExamPassMarks:0,onlineExamMaxAttempts:1,onlineExamShuffle:true,onlineExamRequiresPayment:false,onlineExamPublished:false};
  $("#panel").innerHTML=`
    <h2>Online Exam Configuration</h2>
    <form id="oeForm" class="form-grid">
      <label>Exam<select name="examId" required>${(window.__examCache||[]).map(e=>`<option value="${esc(e.id)}" ${e.id===x.id?"selected":""}>${esc(e.examName||e.id)}</option>`).join("")}</select></label>
      <label>Duration (minutes)<input name="onlineExamDuration" type="number" min="1" max="600" value="${esc(x.onlineExamDuration||60)}" required></label>
      <label>Total Questions<input name="onlineExamTotalQuestions" type="number" min="1" max="500" value="${esc(x.onlineExamTotalQuestions||50)}" required></label>
      <label>Marks / Question<input name="onlineExamMarksPerQuestion" type="number" min="0" step="0.01" value="${esc(x.onlineExamMarksPerQuestion??1)}" required></label>
      <label>Negative Marks / Wrong<input name="onlineExamNegativeMark" type="number" min="0" step="0.01" value="${esc(x.onlineExamNegativeMark??0)}" required></label>
      <label>Pass Marks<input name="onlineExamPassMarks" type="number" min="0" step="0.01" value="${esc(x.onlineExamPassMarks||0)}"></label>
      <label>Maximum Attempts<input name="onlineExamMaxAttempts" type="number" min="1" max="5" value="${esc(x.onlineExamMaxAttempts||1)}"></label>
      <label class="check"><input name="onlineExamShuffle" type="checkbox" ${x.onlineExamShuffle!==false?"checked":""}> Shuffle questions</label>
      <label class="check"><input name="onlineExamRequiresPayment" type="checkbox" ${x.onlineExamRequiresPayment===true?"checked":""}> Require successful payment</label>
      <label class="check"><input name="onlineExamPublished" type="checkbox" ${x.onlineExamPublished===true?"checked":""}> Publish exam</label>
      <div class="actions"><button class="btn primary">Save Online Exam</button><button type="button" class="btn" id="oeBack">Back</button></div>
      <p id="oeCfgMsg" class="message"></p>
    </form>`;
  $("#oeBack").onclick=onlineExamAdmin;
  $("#oeForm").onsubmit=async e=>{
    e.preventDefault();
    const f=e.target,v=Object.fromEntries(new FormData(f).entries()),eid=v.examId;
    const update={
      onlineExamEnabled:true,
      onlineExamDuration:Math.max(1,Math.min(600,Number(v.onlineExamDuration||60))),
      onlineExamTotalQuestions:Math.max(1,Math.min(500,Number(v.onlineExamTotalQuestions||50))),
      onlineExamMarksPerQuestion:Math.max(0,Number(v.onlineExamMarksPerQuestion||0)),
      onlineExamNegativeMark:Math.max(0,Number(v.onlineExamNegativeMark||0)),
      onlineExamPassMarks:Math.max(0,Number(v.onlineExamPassMarks||0)),
      onlineExamMaxAttempts:Math.max(1,Math.min(5,Number(v.onlineExamMaxAttempts||1))),
      onlineExamShuffle:f.onlineExamShuffle.checked,
      onlineExamRequiresPayment:f.onlineExamRequiresPayment.checked,
      onlineExamPublished:f.onlineExamPublished.checked,
      updatedAt:serverTimestamp()
    };
    if(update.onlineExamNegativeMark>update.onlineExamMarksPerQuestion) return showMsg($("#oeCfgMsg"),"Negative marks cannot exceed marks per question.",true);
    await setDoc(doc(db,"exams",eid),update,{merge:true});
    showMsg($("#oeCfgMsg"),"Online exam configuration saved.");
  };
}

async function onlineQuestions(examId){
  const exam=await getDoc(doc(db,"exams",examId));
  if(!exam.exists())return;
  const x=exam.data();
  const qs=await getDocs(query(collection(db,"onlineQuestions",examId,"items"),orderBy("order","asc")));
  const rows=qs.docs.map(d=>({id:d.id,...d.data()}));
  $("#panel").innerHTML=`
    <h2>Question Bank — ${esc(x.examName||examId)}</h2>
    <p class="muted">Correct answers are stored separately and are never included in the candidate question document.</p>
    <form id="qForm" class="form-grid">
      <label>Question<input name="question" required></label>
      <label>Option A<input name="optionA" required></label>
      <label>Option B<input name="optionB" required></label>
      <label>Option C<input name="optionC" required></label>
      <label>Option D<input name="optionD" required></label>
      <label>Correct Answer<select name="correct"><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
      <label>Marks<input name="marks" type="number" min="0" step="0.01" value="${esc(x.onlineExamMarksPerQuestion??1)}"></label>
      <label>Order<input name="order" type="number" min="1" value="${rows.length+1}"></label>
      <label>Section<input name="section" value="General"></label>
      <label class="check"><input name="active" type="checkbox" checked> Active</label>
      <div class="actions"><button class="btn primary">Add Question</button><button type="button" class="btn" id="qBack">Back</button></div>
      <p id="qMsg" class="message"></p>
    </form>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Question</th><th>Section</th><th>Marks</th><th>Active</th><th>Action</th></tr></thead><tbody>
      ${rows.map((q,i)=>`<tr><td>${i+1}</td><td>${esc(q.question)}</td><td>${esc(q.section)}</td><td>${esc(q.marks)}</td><td>${q.active===false?"No":"Yes"}</td><td><button class="btn small" data-del-q="${q.id}">Delete</button></td></tr>`).join("")||'<tr><td colspan="6" class="muted">No questions yet.</td></tr>'}
    </tbody></table></div>`;
  $("#qBack").onclick=onlineExamAdmin;
  $("#qForm").onsubmit=async e=>{
    e.preventDefault();
    const f=e.target,v=Object.fromEntries(new FormData(f).entries());
    const opts=[v.optionA,v.optionB,v.optionC,v.optionD].map(String);
    if(new Set(opts.map(s=>s.trim().toLowerCase())).size!==4)return showMsg($("#qMsg"),"All four options must be different.",true);
    const qRef=await addDoc(collection(db,"onlineQuestions",examId,"items"),{
      question:String(v.question).trim(),options:opts,marks:Math.max(0,Number(v.marks||0)),order:Math.max(1,Number(v.order||1)),section:String(v.section||"General").trim(),active:f.active.checked,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    await setDoc(doc(db,"onlineAnswerKeys",examId,"items",qRef.id),{correct:String(v.correct),marks:Math.max(0,Number(v.marks||0)),updatedAt:serverTimestamp()});
    await runTransaction(db,async tx=>{
      const ref=doc(db,"exams",examId),s=await tx.get(ref),data=s.data()||{},ids=Array.isArray(data.questionIds)?data.questionIds.slice():[];
      if(!ids.includes(qRef.id))ids.push(qRef.id);
      tx.update(ref,{questionIds:ids,questionCount:ids.length,updatedAt:serverTimestamp()});
    });
    showMsg($("#qMsg"),"Question added.");
    onlineQuestions(examId);
  };
  $("#panel").querySelectorAll("[data-del-q]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.delQ;
    if(!confirm("Delete this question?"))return;
    await deleteDoc(doc(db,"onlineQuestions",examId,"items",id));
    await deleteDoc(doc(db,"onlineAnswerKeys",examId,"items",id));
    await runTransaction(db,async tx=>{
      const ref=doc(db,"exams",examId),s=await tx.get(ref),data=s.data()||{},ids=(data.questionIds||[]).filter(x=>x!==id);
      tx.update(ref,{questionIds:ids,questionCount:ids.length,updatedAt:serverTimestamp()});
    });
    onlineQuestions(examId);
  });
}
