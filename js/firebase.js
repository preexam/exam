import { auth, db, storage } from "./firebase-config.js";
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";
export {auth,db,storage,ref,uploadBytes,getDownloadURL,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,query,where,orderBy,limit,serverTimestamp,Timestamp,writeBatch,signInWithEmailAndPassword,signOut,onAuthStateChanged,updatePassword,createUserWithEmailAndPassword};
export const clean=v=>String(v??"").trim();
export const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
export function showMsg(el,msg,error=false){if(el){el.textContent=msg;el.className="message"+(error?" danger-text":"");}}
export const defaultSettings={portalName:"Government Exam Portal",portalShortName:"EXAM PORTAL",activeExamId:"default",applicationOpen:true,admitCardPublished:false,resultPublished:false,maintenanceMode:false,sessionTimeoutMinutes:30,applicationPrefix:"EXAM",applicationSequence:100001,rollPrefix:"",rollStart:100001,rollWidth:6,formSections:{personal:true,address:true,education:true,category:true,other:true,photo:true,documents:true,declaration:true}};
export async function getSettings(){const s=await getDoc(doc(db,"settings","portal"));return s.exists()?s.data():defaultSettings;}
export async function isAdminUser(uid){if(!uid)return null;const s=await getDoc(doc(db,"admins",uid));return s.exists()?s.data():null;}
export function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
export function downloadText(filename,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
export function toDate(v){if(!v)return "";if(v?.toDate)return v.toDate().toLocaleString();const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString();}
