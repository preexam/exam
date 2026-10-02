import { auth, db, storage } from "./firebase-config.js";
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
export {auth,db,storage,ref,uploadBytes,getDownloadURL,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,query,where,orderBy,limit,serverTimestamp,Timestamp,writeBatch,runTransaction,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,onAuthStateChanged,updatePassword};
export const clean=v=>String(v??"").trim();
export function appNo(prefix="EXAM"){const p=String(prefix||"EXAM").replace(/[^A-Za-z0-9]/g,"").slice(0,12)||"EXAM";const id=typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,"").slice(0,14).toUpperCase():`${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`.toUpperCase();return `${p}${id}`;}
export const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
export function showMsg(el,msg,error=false){if(el){el.textContent=msg;el.className="message"+(error?" danger-text":"");}}
export const defaultSettings={portalName:"Government Exam Portal",portalShortName:"EXAM PORTAL",activeExamId:"default",applicationOpen:true,admitCardPublished:false,resultPublished:false,maintenanceMode:false,sessionTimeoutMinutes:30,applicationPrefix:"EXAM",applicationSequence:100001,rollPrefix:"",rollStart:100001,rollWidth:6,formSections:{personal:true,address:true,education:true,category:true,other:true,photo:true,documents:true,declaration:true}};
export async function getSettings(){const s=await getDoc(doc(db,"settings","portal"));return s.exists()?{...defaultSettings,...s.data()}:defaultSettings;}
export async function getActiveExam(settings=null){
  const s=settings||await getSettings();
  const id=s.activeExamId||"default";
  const snap=await getDoc(doc(db,"exams",id));
  return snap.exists()?{id:snap.id,...snap.data()}:null;
}
export function dateValue(v){if(!v)return null;const d=v?.toDate?v.toDate():new Date(v);return Number.isNaN(d.getTime())?null:d;}
export function withinWindow(start,end,now=new Date()){
  const t=now.getTime(), a=dateValue(start)?.getTime(), b=dateValue(end)?.getTime();
  return (!a||t>=a)&&(!b||t<=b);
}
export function examLifecycle(exam,now=new Date()){
  if(!exam)return {applicationOpen:null,correctionOpen:false,admitReleased:false,resultReleased:false};
  const pick=(ms,raw)=>ms!=null?Number(ms):dateValue(raw)?.getTime();
  const applicationStart=pick(exam.applicationStartMs,exam.applicationStart);
  const applicationEnd=pick(exam.applicationEndMs,exam.applicationEnd);
  const correctionStart=pick(exam.correctionStartMs,exam.correctionStart);
  const correctionEnd=pick(exam.correctionEndMs,exam.correctionEnd);
  const admitRelease=pick(exam.admitReleaseMs,exam.admitRelease);
  const resultRelease=pick(exam.resultReleaseMs,exam.resultRelease);
  const inMs=(start,end)=>{const t=now.getTime();return (start==null||t>=start)&&(end==null||t<=end)};
  return {
    applicationOpen:inMs(applicationStart,applicationEnd)&&exam.status!=="Closed"&&exam.status!=="Archived",
    correctionOpen:exam.allowCorrection!==false&&inMs(correctionStart,correctionEnd),
    admitReleased:admitRelease!=null&&now.getTime()>=admitRelease,
    resultReleased:resultRelease!=null&&now.getTime()>=resultRelease
  };
}
export async function isAdminUser(uid){if(!uid)return null;const s=await getDoc(doc(db,"admins",uid));return s.exists()?s.data():null;}
export function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
export function downloadText(filename,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export function toDate(v){if(!v)return "";if(v?.toDate)return v.toDate().toLocaleString();const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString();}
