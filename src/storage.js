import {API_BASE_URL} from "./config";
const PREFIX="wydev:";
export const loadState=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(PREFIX+key)) ?? fallback}catch{return fallback}};
export const saveState=(key,value)=>localStorage.setItem(PREFIX+key,JSON.stringify(value));

const preferenceKeys=["fontSize","wordWrap","reducedMotion","density"];
export const getLocalPreferences=()=>Object.fromEntries(preferenceKeys.map(k=>[k,loadState(k,undefined)]).filter(([,v])=>v!==undefined));

async function preferenceRequest(path,options={}){
  const r=await fetch(`${API_BASE_URL}${path}`,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  let data={}; try{data=await r.json()}catch{}
  if(!r.ok) throw new Error(data?.error||`Preference request failed (${r.status})`);
  return data;
}

export const loadSyncedPreferences=async()=>{
  const data=await preferenceRequest("/preferences");
  const prefs=data?.preferences||{};
  for(const k of preferenceKeys) if(Object.prototype.hasOwnProperty.call(prefs,k)) saveState(k,prefs[k]);
  return prefs;
};

export const syncPreferences=async(preferences)=>preferenceRequest("/preferences",{method:"PUT",body:JSON.stringify({preferences:Object.fromEntries(preferenceKeys.filter(k=>Object.prototype.hasOwnProperty.call(preferences,k)).map(k=>[k,preferences[k]]))})});
