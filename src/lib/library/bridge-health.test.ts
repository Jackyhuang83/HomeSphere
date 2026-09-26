import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBridgeHealth } from './bridge-health';

const keys=['HOMESPHERE_LIBRARY_MODE','HOMESPHERE_STRM_ROOT','HOMESPHERE_STRM_PLAYBACK_MODE','HOMESPHERE_STRM_ALLOWED_HOSTS','HOMESPHERE_115_COOKIE'] as const;
const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));

afterEach(()=>{
  for(const key of keys) {
    const value=original[key];
    if(value===undefined) delete process.env[key];
    else process.env[key]=value;
  }
});

describe('getBridgeHealth',()=>{
  it('reports missing allowlist in resolve mode',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'homesphere-bridge-'));
    process.env.HOMESPHERE_LIBRARY_MODE='strm';
    process.env.HOMESPHERE_STRM_ROOT=dir;
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE='resolve';
    delete process.env.HOMESPHERE_STRM_ALLOWED_HOSTS;
    const status=getBridgeHealth();
    expect(status.ready).toBe(false);
    expect(status.errors.join(' ')).toContain('HOMESPHERE_STRM_ALLOWED_HOSTS');
    fs.rmSync(dir,{recursive:true,force:true});
  });

  it('is ready with readable STRM root and bridge allowlist',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'homesphere-bridge-'));
    process.env.HOMESPHERE_LIBRARY_MODE='strm';
    process.env.HOMESPHERE_STRM_ROOT=dir;
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE='resolve';
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    const status=getBridgeHealth();
    expect(status.ready).toBe(true);
    expect(status.allowedHosts).toEqual(['media-bridge']);
    fs.rmSync(dir,{recursive:true,force:true});
  });

  it('warns if a 115 cookie is still present in STRM mode',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'homesphere-bridge-'));
    process.env.HOMESPHERE_LIBRARY_MODE='strm';
    process.env.HOMESPHERE_STRM_ROOT=dir;
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE='resolve';
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    process.env.HOMESPHERE_115_COOKIE='secret-cookie';
    const status=getBridgeHealth();
    expect(status.credentialsPresentInHomeSphere).toBe(true);
    expect(status.warnings.join(' ')).toContain('建议删除');
    fs.rmSync(dir,{recursive:true,force:true});
  });
});
