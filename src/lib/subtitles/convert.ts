export function decodeSubtitleBuffer(buffer:ArrayBuffer):string {
  const bytes=new Uint8Array(buffer);
  const encodings=['utf-8','gb18030','big5'] as const;
  for(const encoding of encodings){
    try{
      return new TextDecoder(encoding,{fatal:true}).decode(bytes);
    }catch{}
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export function subtitleToVtt(input:string,filename:string):string {
  const ext=filename.toLowerCase().split('.').pop()||'';
  const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  if(ext==='vtt'||text.trimStart().startsWith('WEBVTT'))return normalizeVtt(text);
  if(ext==='ass'||ext==='ssa'||/^\[Script Info\]/mi.test(text))return assToVtt(text);
  return srtToVtt(text);
}

export function srtToVtt(input:string):string {
  const body=input
    .replace(/^\uFEFF/,'')
    .replace(/\r\n?/g,'\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

export function assToVtt(input:string):string {
  const lines=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  let inEvents=false;
  let format:string[]=[];
  const cues:string[]=[];
  for(const raw of lines){
    const line=raw.trim();
    if(/^\[Events\]$/i.test(line)){inEvents=true;continue;}
    if(/^\[.+\]$/.test(line)&&!/^\[Events\]$/i.test(line)){inEvents=false;continue;}
    if(!inEvents)continue;
    if(/^Format:/i.test(line)){
      format=line.slice(line.indexOf(':')+1).split(',').map(item=>item.trim().toLowerCase());
      continue;
    }
    if(!/^Dialogue:/i.test(line)||format.length===0)continue;
    const payload=line.slice(line.indexOf(':')+1).trimStart();
    const parts=splitAssFields(payload,format.length);
    const record=Object.fromEntries(format.map((key,index)=>[key,parts[index]??''])) as Record<string,string>;
    const start=assTimeToVtt(record.start);
    const end=assTimeToVtt(record.end);
    if(!start||!end)continue;
    const text=cleanAssText(record.text||'');
    if(!text)continue;
    cues.push(`${start} --> ${end}\n${text}`);
  }
  if(cues.length===0)throw new Error('ASS/SSA 字幕中没有可转换的对白');
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function normalizeVtt(input:string):string {
  const body=input.trimStart().replace(/^WEBVTT[^\n]*\n?/,'').trim();
  return `WEBVTT\n\n${body}\n`;
}

function splitAssFields(value:string,count:number):string[] {
  const out:string[]=[];
  let rest=value;
  for(let i=0;i<count-1;i++){
    const idx=rest.indexOf(',');
    if(idx<0){out.push(rest);rest='';break;}
    out.push(rest.slice(0,idx));
    rest=rest.slice(idx+1);
  }
  out.push(rest);
  while(out.length<count)out.push('');
  return out;
}

function assTimeToVtt(value:string):string|undefined {
  const match=value.trim().match(/^(\d+):(\d{2}):(\d{2})[.](\d{1,3})$/);
  if(!match)return undefined;
  const hours=String(Number(match[1])).padStart(2,'0');
  const fraction=(match[4]+'000').slice(0,3);
  return `${hours}:${match[2]}:${match[3]}.${fraction}`;
}

function cleanAssText(value:string):string {
  return value
    .replace(/\{[^}]*\}/g,'')
    .replace(/\\[Nn]/g,'\n')
    .replace(/\\h/g,' ')
    .replace(/<[^>]+>/g,'')
    .trim();
}


export function shiftVttTimestamps(input:string,offsetSeconds:number):string {
  if(!Number.isFinite(offsetSeconds)||Math.abs(offsetSeconds)<0.0005)return input;
  const delta=Math.round(offsetSeconds*1000);
  const lines=input.replace(/\r\n?/g,'\n').split('\n');
  return lines.map(line=>{
    const match=line.match(/^(\s*)(\d{2,}:\d{2}:\d{2}\.\d{3})(\s+-->\s+)(\d{2,}:\d{2}:\d{2}\.\d{3})(.*)$/);
    if(!match)return line;
    const rawStart=parseVttTimestamp(match[2]);
    const rawEnd=parseVttTimestamp(match[4]);
    if(rawStart===undefined||rawEnd===undefined)return line;
    let start=Math.max(0,rawStart+delta);
    let end=rawEnd+delta;
    if(end<=0){
      start=0;
      end=1;
    }else if(end<=start){
      end=start+1;
    }
    return `${match[1]}${formatVttTimestamp(start)}${match[3]}${formatVttTimestamp(end)}${match[5]}`;
  }).join('\n');
}

function parseVttTimestamp(value:string):number|undefined {
  const match=value.match(/^(\d{2,}):(\d{2}):(\d{2})\.(\d{3})$/);
  if(!match)return undefined;
  const hours=Number(match[1]);
  const minutes=Number(match[2]);
  const seconds=Number(match[3]);
  const millis=Number(match[4]);
  if(!Number.isFinite(hours)||minutes>59||seconds>59)return undefined;
  return (((hours*60)+minutes)*60+seconds)*1000+millis;
}

function formatVttTimestamp(value:number):string {
  const total=Math.max(0,Math.round(value));
  const hours=Math.floor(total/3600000);
  const minutes=Math.floor((total%3600000)/60000);
  const seconds=Math.floor((total%60000)/1000);
  const millis=total%1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
}
