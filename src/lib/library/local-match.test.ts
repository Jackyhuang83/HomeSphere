import { describe, expect, it } from 'vitest';
import { matchLocalCandidates, normalizeLibraryTitle } from './local-match';

describe('normalizeLibraryTitle',()=>{
  it('ignores case, spacing and punctuation',()=>{
    expect(normalizeLibraryTitle('Dune: Part Two')).toBe(normalizeLibraryTitle('dune-part_two'));
  });
});

describe('matchLocalCandidates',()=>{
  const candidates=[
    {id:'1',title:'Silo',originalTitle:'羊毛战记',year:'2023',mediaType:'tv' as const},
    {id:'2',title:'Dune: Part Two',year:'2024',mediaType:'movie' as const},
    {id:'3',title:'The Office',year:'2001',mediaType:'tv' as const},
    {id:'4',title:'The Office',year:'2005',mediaType:'tv' as const},
  ];

  it('matches a unique normalized title',()=>{
    const result=matchLocalCandidates([{key:'x',title:'Dune Part Two',isTv:false}],candidates);
    expect(result.x).toMatchObject({workId:'2',quality:'title'});
  });

  it('matches an original-title alias',()=>{
    const result=matchLocalCandidates([{key:'x',title:'羊毛战记',isTv:true}],candidates);
    expect(result.x?.workId).toBe('1');
  });

  it('does not guess between ambiguous same-title works',()=>{
    const result=matchLocalCandidates([{key:'x',title:'The Office',isTv:true}],candidates);
    expect(result.x).toBeUndefined();
  });

  it('uses year to disambiguate',()=>{
    const result=matchLocalCandidates([{key:'x',title:'The Office',year:'2005',isTv:true}],candidates);
    expect(result.x).toMatchObject({workId:'4',quality:'title-year'});
  });

  it('respects movie vs tv type',()=>{
    const result=matchLocalCandidates([{key:'x',title:'Silo',isTv:false}],candidates);
    expect(result.x).toBeUndefined();
  });
});
