export class SerialRateLimiter {
  private tail:Promise<void>=Promise.resolve();
  private lastStartedAt=0;
  constructor(private readonly minIntervalMs:number){}
  async schedule<T>(task:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const previous=this.tail;
    this.tail=previous.catch(()=>{}).then(()=>gate);
    await previous.catch(()=>{});
    try{
      signal?.throwIfAborted();
      const wait=this.lastStartedAt+this.minIntervalMs-Date.now();
      if(wait>0) await sleep(wait,signal);
      this.lastStartedAt=Date.now();
      return await task();
    }finally{release();}
  }
}
function sleep(ms:number,signal?:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(resolve,ms);
    if(!signal)return;
    const abort=()=>{clearTimeout(timer);reject(signal.reason??new DOMException('Aborted','AbortError'));};
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  });
}
