import {auth,db,doc,getDoc,showMsg,signInWithEmailAndPassword,signOut,setPersistence,browserLocalPersistence} from "./firebase.js";
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
  const password=$("#loginPass").value;
  const msg=$("#loginMsg");
  if(!n){showMsg(msg,"Please enter your Application Number / अपना Application Number दर्ज करें।",true);return}
  if(!password){showMsg(msg,"Please enter your password / अपना Password दर्ज करें।",true);return}
  const submit=e.submitter;
  if(submit)submit.disabled=true;
  try{
    await setPersistence(auth,browserLocalPersistence);
    const credential=await signInWithEmailAndPassword(auth,`${n.toLowerCase()}@candidate.examportal.local`,password);
    const signedInUser=credential.user;
    const a=await getDoc(doc(db,"applications",n));
    let applicationOwned=false;
    if(a.exists()){
      const data=a.data()||{};
      applicationOwned=data.authUid===signedInUser.uid||data.candidateId===signedInUser.uid;
      if(!applicationOwned){
        const candidateSnap=await getDoc(doc(db,"candidates",signedInUser.uid));
        applicationOwned=candidateSnap.exists()&&candidateSnap.data()?.applicationNumber===n;
      }
    }
    if(!applicationOwned){
      await signOut(auth);
      showMsg(msg,"Application not found or access denied. / Application नहीं मिला या access denied है।",true);
      return;
    }
    sessionStorage.setItem("candidateApp",n);
    sessionStorage.setItem("candidatePassword",password);
    showMsg(msg,"Sign in successful. Opening your application... / Sign In सफल है। Application खोला जा रहा है...");
    location.href="application-dashboard.html";
  }catch(error){
    const code=String(error?.code||"");
    let message="Login failed. Please check your Application Number and password. / Application Number और Password जाँचें।";
    if(code==="auth/invalid-credential"||code==="auth/wrong-password"||code==="auth/user-not-found"){
      message="Incorrect Application Number or Password. / Application Number या Password गलत है।";
    }else if(code==="auth/too-many-requests"){
      message="Too many attempts. Please wait and try again. / बहुत अधिक प्रयास हुए हैं। थोड़ी देर बाद फिर प्रयास करें।";
    }else if(code==="auth/operation-not-allowed"){
      message="Sign In service is not enabled in Firebase. / Firebase में Sign In service enabled नहीं है।";
    }else if(code==="permission-denied"||String(error?.message||"").toLowerCase().includes("permission")){
      message="Login succeeded, but application access was denied. / Login सफल हुआ, लेकिन application access denied है।";
    }
    console.error("Candidate sign-in failed:",error);
    showMsg(msg,message,true);
  }finally{
    if(submit)submit.disabled=false;
  }
};
