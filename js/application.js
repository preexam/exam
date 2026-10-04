import {auth,db,doc,getDoc,showMsg,signInWithEmailAndPassword,signOut} from "./firebase.js";
import {showRegistrationSuccess,setupRecoveryLinks} from "./account-recovery.js";

const $=s=>document.querySelector(s);
const API_BASE=location.hostname==="exam-henna-two.vercel.app"?"":"https://exam-henna-two.vercel.app";

document.querySelectorAll("[data-auth-tab]").forEach(tab=>{
  tab.onclick=()=>{
    document.querySelectorAll("[data-auth-tab]").forEach(x=>x.classList.toggle("active",x===tab));
    document.querySelectorAll("[data-auth-panel]").forEach(x=>x.classList.toggle("active",x.dataset.authPanel===tab.dataset.authTab));
  };
});
function openAuthTab(name){document.querySelector(`[data-auth-tab="${name}"]`)?.click();}

setupRecoveryLinks();

const regMobile=$("#regMobile"),regMsg=$("#regMsg");
$("#registerForm").onsubmit=async e=>{
  e.preventDefault();
  const name=$("#regName").value.trim(),dob=$("#regDob").value,mobile=regMobile.value.trim(),password=$("#regPassword").value,confirmPassword=$("#regPasswordConfirm").value;
  if(name.length<2){showMsg(regMsg,"Please enter your full name.",true);return}
  if(!/^\d{10}$/.test(mobile)){showMsg(regMsg,"Mobile number must be exactly 10 digits.",true);return}
  if(!dob){showMsg(regMsg,"Date of birth is required.",true);return}
  const dobDate=new Date(dob+"T00:00:00"),today=new Date();today.setHours(0,0,0,0);
  if(Number.isNaN(dobDate.getTime())||dobDate>today){showMsg(regMsg,"Date of birth cannot be in the future.",true);return}
  if(password.length<6){showMsg(regMsg,"Password must be at least 6 characters.",true);return}
  if(password!==confirmPassword){showMsg(regMsg,"Password and Confirm Password do not match.",true);return}
  const submit=e.submitter; if(submit)submit.disabled=true;
  try{
    const response=await fetch(API_BASE+"/api/registerCandidate",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name,dob,mobile,password})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Registration failed. Please try again.");
    sessionStorage.setItem("candidatePassword",password);
    await signOut(auth).catch(()=>{});
    $("#loginApp").value=data.applicationNumber||"";
    $("#loginPass").value="";
    showMsg(regMsg,"Registration completed successfully.");
    showRegistrationSuccess(data.applicationNumber,()=>openAuthTab("signin"));
  }catch(err){
    showMsg(regMsg,err?.message||"Registration failed. Please try again.",true);
  }finally{
    if(submit)submit.disabled=false;
  }
};

$("#loginForm").onsubmit=async e=>{
  e.preventDefault();
  const n=$("#loginApp").value.trim().toUpperCase();
  if(!n){showMsg($("#loginMsg"),"Please enter your Application Number.",true);return}
  try{
    await signInWithEmailAndPassword(auth,`${n.toLowerCase()}@candidate.examportal.local`,$("#loginPass").value);
    const a=await getDoc(doc(db,"applications",n));
    if(!a.exists()||a.data().authUid!==auth.currentUser?.uid){await signOut(auth);showMsg($("#loginMsg"),"Application not found or access denied.",true);return}
    sessionStorage.setItem("candidateApp",n);
    sessionStorage.setItem("candidatePassword",$("#loginPass").value);
    location.href="application-dashboard.html";
  }catch(e){
    showMsg($("#loginMsg"),"Login failed. Check your Application Number and password.",true);
  }
};
