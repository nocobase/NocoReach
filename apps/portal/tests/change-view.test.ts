import {it,expect} from 'vitest';
import {lineDiff,hunks} from '../src/pages/change-view';
it('line diff marks removed before added and keeps unchanged lines',()=>{
 const d=lineDiff('a\nb\nc\nd','a\nB\nc\nd\ne');
 expect(d.map(l=>`${l.type}:${l.text}`)).toEqual(['same:a','del:b','add:B','same:c','same:d','add:e']);
 expect(lineDiff('','new').map(l=>l.type)).toEqual(['add']);expect(lineDiff('old','').map(l=>l.type)).toEqual(['del']);
});
it('hunks keep two lines around each change and fold the rest',()=>{
 const before=Array.from({length:20},(_,i)=>`line ${i}`).join('\n'),after=before.replace('line 10','LINE 10');
 const h=hunks(lineDiff(before,after));
 expect(h[0]).toEqual({type:'gap',count:8});expect(h.filter(x=>x.type!=='gap').length).toBe(6);expect(h[h.length-1]).toEqual({type:'gap',count:7});
});
