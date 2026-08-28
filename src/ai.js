import {API_BASE_URL} from "./config";

export async function diagnose(payload, signal){
  const r=await fetch(`${API_BASE_URL}/ai/diagnose`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const error=new Error(data.error||"AI diagnosis failed");
    error.code=data.code||"AI_ERROR";
    error.limit=data.limit;
    error.used=data.used;
    error.remaining=data.remaining;
    error.plan=data.plan;
    throw error;
  }
  return data;
}
