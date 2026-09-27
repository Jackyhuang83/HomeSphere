import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBridgeHealth } from './bridge-health';

const keys=['HOMESPHERE_STRM_ROOT','HOMESPHERE_STRM_ALLOWED_HOSTS'] as const;
const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));

afterEach(()=>{
  for(const key of keys){
    const value=original[key];
    if(value===undefined) delete process.env[key]; else process.env[key]=value;
  }
});

describe('getBridgeHealth',()=>{
  it('reports missing allowlist',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'homesphere-bridge-'));
    process.env.HOMESPHERE_STRM_ROOT=dir;
    delete process.env.HOMESPHERE_STRM_ALLOWED_HOSTS;
    const status=getBridgeHealth();
    expect(status.ready).toBe(false);
    expect(status.errors.join(' ')).toContain('HOMESPHERE_STRM_ALLOWED_HOSTS');
    fs.rmSync(dir,{recursive:true,force:true});
  });

  it('is ready with readable STRM root and bridge allowlist',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'homesphere-bridge-'));
    process.env.HOMESPHERE_STRM_ROOT=dir;
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    const status=getBridgeHealth();
    expect(status.ready).toBe(true);
    expect(status.allowedHosts).toEqual(['media-bridge']);
    fs.rmSync(dir,{recursive:true,force:true});
  });
});
