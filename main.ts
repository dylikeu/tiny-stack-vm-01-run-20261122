'use strict';
// Tiny stack VM: clean-room implementation of the make.fun tiny stack ISA v1.
// One run answers i001..i040: /input/<id>/{program,input}.bin ->
// /output/<id>/{stdout.bin,exit.txt}. Env overrides for local testing:
// MAKEFUN_INPUT_DIR, MAKEFUN_OUTPUT_DIR. Plain JS, node built-ins only.
const fs=require('node:fs'),path=require('node:path');
const J=path.join,R=fs.readFileSync,W=fs.writeFileSync,K=fs.mkdirSync;
const E=Buffer.alloc(0);
const IN_DIR=process.env.MAKEFUN_INPUT_DIR||'/input';
const OUT_DIR=process.env.MAKEFUN_OUTPUT_DIR||'/output';
// Opcode table, 5 chars per opcode: 2-digit byte, imm, pops, pushes.
const OPS={},T='00000011010240103010040120502206023070331602117021180211902120021210212202123011240212502126021270112802129021300213202133021340214820049210502105120052000640116502080010810108200183010';
for(let i=0;i<T.length;i+=5)OPS[+T.slice(i,i+2)]=[+T[i+2],+T[i+3],+T[i+4]];
// Binary ops 0x10..0x22, indexed by opcode-16; slots 7, 11, 15 unused.
const BIN=[(x,y)=>x+y|0,(x,y)=>x-y|0,Math.imul,
(x,y)=>x===-2147483648&&y===-1?x:x/y|0,(x,y)=>y===-1?0:x%y|0,
(x,y)=>(x>>>0)/(y>>>0)|0,(x,y)=>(x>>>0)%(y>>>0)|0,0,
(x,y)=>x&y,(x,y)=>x|y,(x,y)=>x^y,0,(x,y)=>x<<(y&31),(x,y)=>x>>(y&31),
(x,y)=>x>>>(y&31)|0,0,(x,y)=>x===y?1:0,(x,y)=>x<y?1:0,
(x,y)=>x>>>0<y>>>0?1:0];
function run(p,input){
  const n=p.length,D=new Int32Array(256),C=new Int32Array(64),
  M=new Int32Array(256),out=Buffer.alloc(65536);
  let sp=0,cp=0,olen=0,ipos=0,pc=0,steps=0;
  const done=e=>({stdout:out.subarray(0,olen),exit:e});
  for(;;){
    if(steps===1e6)return done(10);
    if(pc<0||pc>=n)return done(9);
    const b=p[pc],op=OPS[b];
    if(!op)return done(5);
    if(pc+op[0]>=n)return done(9);
    steps++;
    const nx=pc+1+op[0];
    if(sp<op[1])return done(2);
    if(sp-op[1]+op[2]>256)return done(3);
    pc=nx;
    if(b>=16&&b<=34&&b!==23&&b!==27&&b!==31){
      const y=D[sp-1],x=D[sp-2];
      if(b>=19&&b<=22&&!y)return done(4);
      sp-=2;D[sp++]=BIN[b-16](x,y);continue;
    }
    switch(b){
      case 0:return done(0);
      case 1:D[sp++]=p.readInt8(nx-1);break;
      case 2:D[sp++]=p.readInt32LE(nx-4);break;
      case 3:sp--;break;
      case 4:D[sp]=D[sp-1];sp++;break;
      case 5:{const t=D[sp-1];D[sp-1]=D[sp-2];D[sp-2]=t;break;}
      case 6:D[sp]=D[sp-2];sp++;break;
      case 7:{const a=D[sp-3];D[sp-3]=D[sp-2];D[sp-2]=D[sp-1];D[sp-1]=a;break;}
      case 23:D[sp-1]=-D[sp-1]|0;break;
      case 27:D[sp-1]=~D[sp-1];break;
      case 48:case 49:case 50:
        // JMP always; JZ if popped v==0; JNZ if v!=0 (JMP pops nothing).
        if(b===48||(b===49)===(D[--sp]===0))pc=nx+p.readInt16LE(nx-2);
        break;
      case 51:
        if(cp===64)return done(7);
        C[cp++]=nx;pc=p.readUInt16LE(nx-2);
        break;
      case 52:if(!cp)return done(8);pc=C[--cp];break;
      case 64:{const a=D[sp-1];if(a<0||a>255)return done(6);D[sp-1]=M[a];break;}
      case 65:{const a=D[sp-1],v=D[sp-2];if(a<0||a>255)return done(6);sp-=2;M[a]=v;break;}
      case 80:{
        const s=String(D[sp-1]);
        if(olen+s.length>65536)return done(11);
        sp--;olen+=out.write(s,olen);
        break;
      }
      case 81:if(olen+1>65536)return done(11);out[olen++]=D[--sp]&255;break;
      case 82:D[sp++]=ipos<input.length?input[ipos++]:-1;break;
      case 83:return done(D[--sp]&255);
    }
  }
}
for(let i=1;i<=40;i++){
  const id='i'+('00'+i).slice(-3);
  try{
    const prog=R(J(IN_DIR,id,'program.bin'));
    let input=E;
    try{input=R(J(IN_DIR,id,'input.bin'));}catch(e){}
    const r=run(prog,input),dir=J(OUT_DIR,id);
    K(dir,{recursive:true});
    W(J(dir,'stdout.bin'),r.stdout);
    W(J(dir,'exit.txt'),r.exit+'\n');
  }catch(e){
    try{
      const dir=J(OUT_DIR,id);
      K(dir,{recursive:true});
      W(J(dir,'stdout.bin'),E);
      W(J(dir,'exit.txt'),'0\n');
    }catch(e2){}
  }
}
