import {useEffect,useState} from "react";
import CodeMirror from "@uiw/react-codemirror";
import {javascript} from "@codemirror/lang-javascript";
import {json} from "@codemirror/lang-json";
import {markdown} from "@codemirror/lang-markdown";
import {python} from "@codemirror/lang-python";
import {oneDark} from "@codemirror/theme-one-dark";
import {languageFor} from "../utils";
const lang=x=>x==="json"?json():x==="markdown"?markdown():x==="python"?python():javascript({jsx:true,typescript:true});
export default function CodeEditor({path,value,onChange,fontSize=14,onViewReady}){const [text,setText]=useState(value||"");useEffect(()=>setText(value||""),[path]);return <div className="editor"><CodeMirror value={text} height="calc(100vh - 128px)" theme={oneDark} extensions={[lang(languageFor(path))]} onChange={v=>{setText(v);onChange(v)}} basicSetup={{lineNumbers:true,foldGutter:true,wordWrap:true}} onCreateEditor={view=>onViewReady?.(view)} style={{fontSize}}/></div>}
