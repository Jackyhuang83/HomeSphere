import { describe, expect, it } from 'vitest';
import { normalize, titleVariants } from './matcher';

describe('titleVariants',()=>{
  it('splits Chinese and English bilingual movie titles',()=>{
    expect(titleVariants('奈德 Nyad')).toEqual(['奈德 Nyad','奈德','Nyad']);
    expect(titleVariants('飞驰人生2 Pegasus 2')).toEqual(['飞驰人生2 Pegasus 2','飞驰人生2','Pegasus 2']);
  });

  it('keeps a single-language title unchanged',()=>{
    expect(titleVariants('Twilight of the Warriors Walled In')).toEqual(['Twilight of the Warriors Walled In']);
  });

  it('normalizes punctuation for matching',()=>{
    expect(normalize('Young-and-Dangerous 6')).toBe(normalize('Young and Dangerous 6'));
  });
});
