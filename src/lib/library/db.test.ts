import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __closeLibraryDbForTest,
  listWorks,
  makeMediaId,
  makeWorkId,
  reconcileMedia,
  setWorkHidden,
  upsertMedia,
  upsertWork,
} from './db';

let dataDir='';

beforeEach(()=>{
  __closeLibraryDbForTest();
  dataDir=mkdtempSync(path.join(tmpdir(),'homesphere-db-'));
  process.env.HOMESPHERE_DATA_DIR=dataDir;
});

afterEach(()=>{
  __closeLibraryDbForTest();
  delete process.env.HOMESPHERE_DATA_DIR;
  rmSync(dataDir,{recursive:true,force:true});
});

describe('library visibility and reconcile',()=>{
  it('hides works from the normal library and exposes them in hidden mode',()=>{
    const workId=makeWorkId('movie:test:2026');
    const mediaId=makeMediaId('Movies/Test.2026.strm');
    const now=Date.now();

    upsertWork({
      id:workId,
      groupKey:'movie:test:2026',
      title:'Test',
      year:'2026',
      mediaType:'movie',
      scrapeStatus:'pending',
      manualMatch:false,
      updatedAt:now,
    });
    upsertMedia({
      id:mediaId,
      workId,
      sourceUrl:'https://example.115.com/test',
      path:'Movies/Test.2026.strm',
      filename:'Test.2026.strm',
      title:'Test',
      year:'2026',
      mediaType:'movie',
      updatedAt:now,
    });

    expect(listWorks().total).toBe(1);
    expect(listWorks({hidden:true}).total).toBe(0);

    expect(setWorkHidden(workId,true)).toBe(true);
    expect(listWorks().total).toBe(0);
    expect(listWorks({hidden:true}).items[0]?.id).toBe(workId);

    expect(setWorkHidden(workId,false)).toBe(true);
    expect(listWorks().items[0]?.id).toBe(workId);
  });

  it('reports stale media and empty work cleanup',()=>{
    const workId=makeWorkId('movie:stale:2025');
    const mediaId=makeMediaId('Movies/Stale.2025.strm');
    const now=Date.now();

    upsertWork({
      id:workId,
      groupKey:'movie:stale:2025',
      title:'Stale',
      year:'2025',
      mediaType:'movie',
      scrapeStatus:'pending',
      manualMatch:false,
      updatedAt:now,
    });
    upsertMedia({
      id:mediaId,
      workId,
      sourceUrl:'https://example.115.com/stale',
      path:'Movies/Stale.2025.strm',
      filename:'Stale.2025.strm',
      title:'Stale',
      year:'2025',
      mediaType:'movie',
      updatedAt:now,
    });

    expect(reconcileMedia([])).toEqual({removedMedia:1,removedWorks:1});
    expect(listWorks().total).toBe(0);
  });
});
