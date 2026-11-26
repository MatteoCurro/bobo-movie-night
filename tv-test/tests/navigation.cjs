/* No dependencies: exercise the actual D-pad functions against TV-like geometry. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('tv-test/app/src/main/assets/tv.js','utf8');
const a=src.indexOf('function ensure(item,axis){');
const b=src.indexOf('function onClick(e){',a);
assert(a>=0&&b>a,'D-pad source found');
const implementation=src.slice(a,b);

function suite(elements,initial){
 const actions={pageScroll:[],pageTop:[],railScroll:[]};
 const header={hidden:false,getBoundingClientRect:()=>({height:92})};
 const document={activeElement:initial,getElementById:()=>header};
 const window={
  innerHeight:1080,
  scrollTo:x=>actions.pageTop.push(x),
  scrollBy:x=>actions.pageScroll.push(x)
 };
 for(const el of elements){
  el.disabled=false;el.isConnected=true;
  el.focus=()=>{document.activeElement=el;};
  el.getBoundingClientRect=()=>el.rect;
  el.closest=(selector)=>{
   if(selector==='[hidden]')return null;
   if(selector==='.rail,.season-list')return el.rail||null;
   if(selector==='.results')return el.grid||null;
   if(selector==='#topbar')return el.nav||null;
   return null;
  };
 }
 const context={window,document,getComputedStyle:()=>({visibility:'visible'}),els:()=>elements};
 vm.createContext(context);
 vm.runInContext(implementation,context);
 return {move:context.move,document,actions};
}
function el(x,y,w,h,extra={}){
 return {rect:{left:x,top:y,right:x+w,bottom:y+h,width:w,height:h},...extra};
}
{
 const rail={
  getBoundingClientRect:()=>({left:0,right:420}),
  scrollBy:x=>actions.railScroll.push(x)
 };
 // Attach the recorder after the suite returns so the scroll callback has it.
 const items=[el(35,260,120,190,{rail}),el(180,260,120,190,{rail}),el(435,260,120,190,{rail})];
 let actions;
 const test=suite(items,items[1]);actions=test.actions;
 test.move('ArrowRight');
 assert.equal(test.document.activeElement,items[2],'right key chooses the next poster');
 assert.equal(actions.pageScroll.length,0,'right key must not move the document vertically');
 assert.equal(actions.railScroll.length,1,'only the rail may scroll horizontally');
 test.move('ArrowRight');
 assert.equal(test.document.activeElement,items[2],'right key at rail edge stays put');
}
{
 const grid={};
 const items=[
  el(395,250,140,200,{grid}),
  el(45,490,140,200,{grid}),
  el(395,490,140,200,{grid})
 ];
 const test=suite(items,items[0]);
 test.move('ArrowRight');
 assert.equal(test.document.activeElement,items[0],'right key cannot wrap to next grid row');
 assert.equal(test.actions.pageScroll.length,0);
 test.move('ArrowDown');
 assert.equal(test.document.activeElement,items[2],'down key stays in aligned column');
}
{
 const nav={};
 const home=el(60,20,120,50,{nav});
 const card=el(75,500,180,250);
 const test=suite([home,card],card);
 test.move('ArrowUp');
 assert.equal(test.document.activeElement,home,'up key finds top navigation');
 assert.equal(test.actions.pageTop.length,1,'focusing sticky navigation returns to actual page top');
 assert.equal(test.actions.pageTop[0].top,0);
}
console.log('TV directional navigation passed: rail, grid and sticky header.');
