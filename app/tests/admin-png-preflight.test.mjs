import test from "node:test";
import assert from "node:assert/strict";
import {VALID_TEST_PNG_BYTES} from "./fixtures/valid-png.mjs";
import {inspectCompletePngBytes,MAX_PRIVATE_PNG_PIXELS} from "../src/admin-review.js";
import {validateDraftPng,preflightPrivateDraftFiles,importPrivateDraftBatch} from "../src/admin-import.js";

function png(bytes=VALID_TEST_PNG_BYTES,name="pomme.png"){
  return Object.assign(new Blob([bytes],{type:"image/png"}),{name});
}
function rewriteIhdrCrc(bytes){
  let crc=0xffffffff;
  for(let i=12;i<29;i++){
    crc^=bytes[i];
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  const n=(crc^0xffffffff)>>>0;
  bytes[29]=(n>>>24)&255;bytes[30]=(n>>>16)&255;
  bytes[31]=(n>>>8)&255;bytes[32]=n&255;
  return bytes;
}

test("Un vrai PNG RGBA 1×1 passe l'inspection complète avant tout upload",async()=>{
  const result=inspectCompletePngBytes(VALID_TEST_PNG_BYTES);
  assert.equal(result.width,1);
  assert.equal(result.height,1);
  assert.equal(result.bytes,VALID_TEST_PNG_BYTES.length);
  assert.equal(MAX_PRIVATE_PNG_PIXELS,32_000_000);
  await assert.doesNotReject(validateDraftPng(png()));
});

test("Un PNG tronqué, modifié ou avec données ajoutées est refusé",async()=>{
  const b=VALID_TEST_PNG_BYTES;
  const altered=Uint8Array.from(b);altered[45]^=1;
  for(const [bytes,pattern] of [
    [b.slice(0,8),/incomplète/i],
    [b.slice(0,-12),/IEND|incomplète/i],
    [altered,/CRC|intégrité/i],
    [Uint8Array.from([...b,0]),/IEND|Fin PNG/i]
  ]){
    await assert.rejects(validateDraftPng(png(bytes)),pattern);
  }
});

test("Des dimensions supérieures à 32 millions de pixels sont rejetées",()=>{
  const b=Uint8Array.from(VALID_TEST_PNG_BYTES);
  b.set([0,0,32,0],16);b.set([0,0,16,0],20);
  rewriteIhdrCrc(b);
  assert.throws(()=>inspectCompletePngBytes(b),/32 millions/i);
});

test("Le décodage navigateur et la libération du bitmap sont obligatoires",async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,"createImageBitmap");
  let closes=0;
  try{
    globalThis.createImageBitmap=async()=>({width:1,height:1,close(){closes++;}});
    assert.equal(await validateDraftPng(png()),true);
    assert.equal(closes,1);
    globalThis.createImageBitmap=async()=>({width:2,height:1,close(){closes++;}});
    await assert.rejects(validateDraftPng(png()),/décoder/i);
    assert.equal(closes,2);
    globalThis.createImageBitmap=async()=>{throw Error("Corrupted decoded pixels");};
    await assert.rejects(validateDraftPng(png()),/décoder/i);
  }finally{
    if(previous)Object.defineProperty(globalThis,"createImageBitmap",previous);
    else delete globalThis.createImageBitmap;
  }
});

test("Un lot mixte est bloqué à la source et identifie le PNG fautif sans mutation",async()=>{
  let writes=0;
  const broken=VALID_TEST_PNG_BYTES.slice(0,-12);
  await assert.rejects(importPrivateDraftBatch(null,"admin",[
    png(VALID_TEST_PNG_BYTES,"premier.png"),png(broken,"deuxieme.png")
  ],"autres",{importOne:async()=>{writes++;}}),/Image 2 sur 2.*incomplète/i);
  assert.equal(writes,0);
});

test("Un échec du décodeur sur le deuxième PNG arrête tout le lot",async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,"createImageBitmap");
  let checked=0,writes=0,closed=0;
  try{
    globalThis.createImageBitmap=async()=>{
      if(++checked===2)throw Error("Image illisible");
      return {width:1,height:1,close(){closed++;}};
    };
    await assert.rejects(importPrivateDraftBatch(null,"admin",[
      png(VALID_TEST_PNG_BYTES,"1.png"),
      png(VALID_TEST_PNG_BYTES,"2.png"),
      png(VALID_TEST_PNG_BYTES,"3.png")
    ],"autres",{importOne:async()=>{writes++;}}),/Image 2 sur 3.*décoder/i);
    assert.equal(checked,2);
    assert.equal(closed,1);
    assert.equal(writes,0);
  }finally{
    if(previous)Object.defineProperty(globalThis,"createImageBitmap",previous);
    else delete globalThis.createImageBitmap;
  }
});


test("Avant la confirmation, chaque PNG est vérifié et la progression est locale",async()=>{
  let checked=0;
  const ok=await preflightPrivateDraftFiles([
    png(VALID_TEST_PNG_BYTES,"image1.png"),png(VALID_TEST_PNG_BYTES,"image2.png")
  ].map(file=>file),{
    onChecked:({completed,total})=>{checked++;assert.equal(completed,checked);assert.equal(total,2);}
  });
  assert.equal(ok,true);
  assert.equal(checked,2);
});

test("Un PNG tronqué dans le deuxième choix bloque la validation avant envoi",async()=>{
  let checked=0;
  const broken=new Blob([Uint8Array.of(137,80,78,71,13,10,26,10)],{type:"image/png"});
  Object.assign(broken,{name:"mauvais.png"});
  await assert.rejects(preflightPrivateDraftFiles([
    png(VALID_TEST_PNG_BYTES,"correct.png"),broken
  ],{onChecked:()=>{checked++;}}),/Image 2 sur 2.*incomplète/i);
  assert.equal(checked,1,"Aucun résultat valide n'est annoncé après l'image corrompue");
});

test("Une sélection remplacée rend le contrôle précédent caduc",async()=>{
  let checked=0,current=true;
  const result=await preflightPrivateDraftFiles([png(VALID_TEST_PNG_BYTES,"1.png"),png(VALID_TEST_PNG_BYTES,"2.png")],{
    isCurrent:()=>current,
    onChecked:()=>{checked++;current=false;}
  });
  assert.equal(result,false);
  assert.equal(checked,1);
});
