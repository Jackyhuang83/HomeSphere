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
