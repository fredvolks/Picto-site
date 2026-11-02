import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {existsSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,extname} from "node:path";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";

const root=resolve(".");

const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent((req.url||"/").split("?")[0]);
    const file=resolve(root,"."+pathname,(pathname==="/")?"index.html":"");
    if(!file.startsWith(root+"/")){res.writeHead(403);res.end();return;}
    const body=await readFile(file);
    res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream"});
    res.end(body);
  }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
const base="http://127.0.0.1:"+port;
let chrome;
let socket;
let serial=0;
const pending=new Map();
let profile=mkdtempSync(join(tmpdir(),"pictau-chrome-"));
const profiles=[profile];
const screenshots=resolve("artifacts/vitrine");
let chromeErrors="";
const browserJsExceptions=[];
function chromeBinary(){
  if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
  for(const cmd of ["google-chrome","chromium","chromium-browser"]){
    try{return execFileSync("which",[cmd],{encoding:"utf8"}).trim();}catch{}
  }
  throw new Error("No Chrome/Chromium binary available");
}
async function command(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timeout: "+method));},9000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(body){
  const code="(()=>{"+body+"})()";
  const response=await command("Runtime.evaluate",{expression:code,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw new Error("Browser JS error: "+JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function waitFor(predicate,timeout=9000){
  const began=Date.now();
  while(Date.now()-began<timeout){
    try{if(await evaluate(predicate))return;}catch{}
    await sleep(150);
  }
  throw new Error("UI did not load: "+predicate);
}
try{
  let endpoint;
  for(let launch=0;launch<3&&!endpoint;launch++){
    if(launch){profile=mkdtempSync(join(tmpdir(),"pictau-chrome-retry-"));profiles.push(profile);}
    chromeErrors="";
    chrome=spawn(chromeBinary(),["--headless=new","--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking","--disable-extensions","--no-first-run","--no-default-browser-check","--user-data-dir="+profile,"--remote-debugging-port=0","about:blank"],{stdio:["ignore","ignore","pipe"],env:{...process.env,DBUS_SESSION_BUS_ADDRESS:""}});
    chrome.stderr.on("data",chunk=>{chromeErrors+=String(chunk).slice(-2500);});
    chrome.on("error",err=>{chromeErrors+="\n"+String(err);});
    for(let attempt=0;attempt<180;attempt++){
      try{
        const portFile=await readFile(join(profile,"DevToolsActivePort"),"utf8");
        const devtoolsPort=Number(portFile.split("\n")[0]);
        if(Number.isInteger(devtoolsPort)&&devtoolsPort>0){
          const pages=await (await fetch("http://127.0.0.1:"+devtoolsPort+"/json/list",{signal:AbortSignal.timeout(1400)})).json();
          endpoint=pages.find(p=>p.type==="page")?.webSocketDebuggerUrl;
        }
        if(endpoint)break;
      }catch{}
      if(chrome.exitCode!==null)break;
      await sleep(100);
    }
    if(!endpoint){
      if(chrome.exitCode===null){
        const exiting=new Promise(resolve=>chrome.once("exit",resolve));
        chrome.kill("SIGKILL");
        await Promise.race([exiting,sleep(1500)]);
      }
      console.warn("Chrome launch attempt "+(launch+1)+" failed; retrying.");
    }
  }
  if(!endpoint)throw new Error("Chrome remote debugging unavailable after 3 launches; exit="+chrome?.exitCode+"; stderr="+chromeErrors.slice(-1600));
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
    socket.addEventListener("open",resolve,{once:true});
    socket.addEventListener("error",reject,{once:true});
  });
  socket.addEventListener("message",event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==="Runtime.exceptionThrown")browserJsExceptions.push(msg.params?.exceptionDetails?.text+": "+(msg.params?.exceptionDetails?.exception?.description||""));
    const p=pending.get(msg.id);
    if(p){pending.delete(msg.id);if(msg.error)p.reject(new Error(JSON.stringify(msg.error)));else p.resolve(msg.result||{});}
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await mkdir(screenshots,{recursive:true});

  const sizes=[[320,568],[360,640],[390,844],[412,915],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]];
  for(const [width,height] of sizes){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=680,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/index.html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-button')");
    for(const lang of ["fr","en"]){
      await evaluate("document.querySelector('[data-lang="+lang+"]').click();return true;");
      await waitFor("return document.documentElement.lang==='"+lang+"'");
      const value=await evaluate("\nconst selectors=[\".topbar\",\".login-link\",\".hero\",\".poster-heading\",\".poster-tiles\",\".poster-bottom\",\".signup-button\",\"footer\"];\nconst bounds={};\nfor(const selector of selectors){\n  const el=document.querySelector(selector);\n  if(!el)throw Error(\"missing \"+selector);\n  const r=el.getBoundingClientRect();\n  bounds[selector]={left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,visible:getComputedStyle(el).display!==\"none\"};\n}\nconst rect=el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};};\nconst hit=(a,b)=>a.left<b.right-2&&b.left<a.right-2&&a.top<b.bottom-2&&b.top<a.bottom-2;\nconst labels=[...document.querySelectorAll(\".picto-label\")].map(el=>({\n text:el.textContent.trim(),border:getComputedStyle(el).borderTopWidth,\n borderColor:getComputedStyle(el).borderTopColor,align:getComputedStyle(el).textAlign,\n fontSize:Number.parseFloat(getComputedStyle(el).fontSize)\n}));\nconst cards=[...document.querySelectorAll(\".p-card\")].map(rect);\nconst words=[...document.querySelectorAll(\".poster-heading span,.poster-heading em\")].map(rect);\nreturn {\n width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,\n scrollH:document.documentElement.scrollHeight,bounds,labels,cardCount:cards.length,\n titleCollision:cards.some(card=>words.some(word=>hit(card,word))),\n labelCollision:[...document.querySelectorAll(\".picto-label\")].map(rect).some((label,i)=>cards.some((card,j)=>i!==j&&hit(label,card))),\n actionCollision:cards.some(card=>hit(card,rect(document.querySelector(\".poster-bottom\")))),\n signupCount:document.querySelectorAll(\".signup-button\").length,\n signupHref:document.querySelector(\".signup-button\")?.getAttribute(\"href\"),\n loginText:document.querySelector(\".login-link\")?.textContent.trim(),\n loginCount:document.querySelectorAll(\".login-link\").length,\n language:document.documentElement.lang,legal:document.querySelectorAll(\"footer nav a\").length,\n repeatedBenefits:document.querySelectorAll(\".steps,.benefits\").length,\n navLabel:document.querySelector(\".topbar nav\")?.getAttribute(\"aria-label\"),\n brandLabel:document.querySelector(\".brand\")?.getAttribute(\"aria-label\"),\n design:document.body.dataset.pictauHomeDesign\n};");


    const dimensions=await evaluate('return [...document.querySelectorAll(".p-card")].map(card=>{const art=card.querySelector(".picto");return {cardWidth:card.offsetWidth,cardHeight:card.offsetHeight,pictoWidth:art.offsetWidth,pictoHeight:art.offsetHeight}});');
    assert.equal(dimensions.length,3,"Trois pictogrammes doivent rester présents sur les pages");
    for(const [i,d] of dimensions.entries()){
      assert.ok(Math.abs(d.cardWidth-d.cardHeight)<=1,"Carte pictogramme "+(i+1)+" non carrée : "+JSON.stringify(d));
      assert.ok(Math.abs(d.pictoWidth-d.pictoHeight)<=1,"Cadre noir pictogramme "+(i+1)+" non carré : "+JSON.stringify(d));
    }
      const name=lang+"-"+width+"x"+height;
      assert.equal(value.design,"5",name+" official Design 5");
      assert.equal(value.language,lang,name+" language");
      assert.equal(value.signupCount,1,name+" one signup CTA");
      assert.equal(value.signupHref,"./forfait.html",name+" signup route");
      assert.equal(value.loginCount,1,name+" one direct login");
      assert.equal(value.loginText,lang==="fr"?"Connexion":"Sign in",name+" sign-in label");
      assert.equal(value.navLabel,lang==="fr"?"Navigation principale":"Main navigation",name+" accessible navigation");
      assert.equal(value.brandLabel,lang==="fr"?"Pict-au — Accueil":"Pict-au — Home",name+" accessible logo");
      assert.equal(value.legal,3,name+" three legal links");
      assert.equal(value.repeatedBenefits,0,name+" no duplicated steps");
      assert.equal(value.cardCount,3,name+" exactly three pictos");
      assert.deepEqual(value.labels.map(x=>x.text),lang==="fr"?["Trouver","Personnaliser","Imprimer"]:["Find","Personalize","Print"],name+" translated picto labels");
      for(const label of value.labels){
        assert.ok(parseFloat(label.border)>0,name+" pictogram separator");
        assert.match(label.borderColor,/rgb\(44, 56, 52\)/,name+" dark line");
        assert.equal(label.align,"center",name+" label centered");
        assert.ok(label.fontSize>=8,name+" readable caption");
      }
      assert.equal(value.titleCollision,false,name+" no heading/card overlap");
      assert.equal(value.labelCollision,false,name+" no labels blocked by adjacent cards");
      assert.equal(value.actionCollision,false,name+" no CTA collision");
      assert.ok(value.scrollW<=width+2,name+" no horizontal overflow: "+JSON.stringify(value));
      assert.ok(value.scrollH<=height+2,name+" no vertical overflow at rest: "+JSON.stringify(value));
      for(const [selector,r] of Object.entries(value.bounds)){
        assert.ok(r.visible&&r.width>0&&r.height>0,name+" "+selector+" visible");
        assert.ok(r.left>=-2&&r.right<=width+2,name+" "+selector+" within width "+JSON.stringify(r));
        assert.ok(r.top>=-2&&r.bottom<=height+2,name+" "+selector+" within height "+JSON.stringify(r));
      }
      const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(screenshots,name+".png"),Buffer.from(shot.data,"base64"));
      console.log("PASS "+name+" : page unique, deux actions, bénéfices et ligne noire");
    }
  }

  // Le responsive change aux seuils 520/521, 750/751 et 899/900.
  // Une capture peut paraître acceptable en dépit d'un ratio faux : mesurer le DOM.
  for(const width of [340,520,521,700,750,751,820,899,900,980,1100]){
    const height=width<=520?780:width<=900?1024:900;
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=520,deviceScaleFactor:1});
    for(const pageName of ["index","forfait"]){
      await command("Page.navigate",{url:base+"/"+pageName+".html"});
      await waitFor("return document.readyState==='complete' && document.querySelectorAll('.p-card').length===3");
      const squares=await evaluate('return [...document.querySelectorAll(".p-card")].map(card=>{const p=card.querySelector(".picto");return {cw:card.offsetWidth,ch:card.offsetHeight,pw:p.offsetWidth,ph:p.offsetHeight};});');
      for(const d of squares){
        assert.ok(Math.abs(d.cw-d.ch)<=1&&Math.abs(d.pw-d.ph)<=1,
          "Ratio 1:1 non respecté sur "+pageName+" "+width+"x"+height+": "+JSON.stringify(d));
      }
    }
  }

  // Test anti-faux-positif : même logo et mêmes contrôles à leur position et
  // leur taille réelles. Ne plus se contenter d'un SVG/texte identique.
  const headerMetrics=`
    const box=selector=>{
      const el=document.querySelector(selector);
      if(!el)throw Error('Contrôle absent : '+selector);
      const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
      return {x:r.x,y:r.y,w:r.width,h:r.height,font:cs.fontSize,weight:cs.fontWeight,
        color:cs.color,background:cs.backgroundColor,radius:cs.borderRadius,
        label:el.textContent.trim()};
    };
    return {logo:box('.brand'),fr:box('[data-lang=fr]'),en:box('[data-lang=en]'),
      login:box('a[href="./app/"]')};
  `;
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[700,900],[768,1024],[820,1180],[1024,768],[1440,900],[1920,1080]]){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=700,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/index.html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.brand')");
    await evaluate("return document.fonts.ready.then(()=>true);");
    const homeHeader=await evaluate(headerMetrics);
    const headerRow=await evaluate(`return (()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,cx:r.x+r.width/2,cy:r.y+r.height/2}};
      const hdr=document.querySelector('[data-pa-universal-header]');
      const logo=hdr.querySelector('.pictau-brand-img'),fr=hdr.querySelector('[data-lang=fr]'),
        en=hdr.querySelector('[data-lang=en]'),login=hdr.querySelector('.login-link,.signup-login,.pa-universal-current,.pa-universal-account');
      if(!logo||!fr||!en||!login)throw Error("En-tête incomplet");
      return {logo:rect(logo),fr:rect(fr),en:rect(en),login:rect(login),
        scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    })();`);
    const item=headerRow;
    assert.ok(item.scrollWidth<=item.viewport+1,"En-tête déborde : "+JSON.stringify(item));
    assert.ok(item.logo.right+2<=item.fr.x&&item.fr.right<=item.en.x+1&&item.en.right<=item.login.x+1,
      "Logo + FR + EN + Connexion chevauchés : "+JSON.stringify(item));
    for(const x of ["fr","en","login"])
      assert.ok(Math.abs(item.logo.cy-item[x].cy)<=13,
        "Logo, FR, EN et Connexion ne sont PAS sur une seule ligne : "+JSON.stringify(item));


    const mobileAsset=width<=680;
    const logoInfo=await evaluate(`return (async()=>{
      const img=document.querySelector(".brand .pictau-brand-img");
      await img.decode();
      const source=img.currentSrc;
      const text=await (await fetch(source)).text();
      const doc=new DOMParser().parseFromString(text,"image/svg+xml");
      const tiles=[...doc.querySelectorAll("rect")];
      return {source,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
        tiles:tiles.map(r=>({width:r.getAttribute("width"),height:r.getAttribute("height")}))};
    })();`);
    assert.ok(logoInfo.naturalWidth>0&&logoInfo.naturalHeight>0,"SVG du logo chargé à "+width);
    assert.ok(logoInfo.source.endsWith(mobileAsset?"pictau-logo-le-fil-mobile.svg":"pictau-logo-le-fil.svg"),
      "Source responsive erronée du logo : "+JSON.stringify(logoInfo));
    assert.equal(logoInfo.tiles.length,3,"Les trois carrés du logo manquent à "+width);
    if(mobileAsset){
      const glyphTest=await evaluate(`return (()=>{
        const img=document.querySelector(".brand .pictau-brand-img");
        const r=img.getBoundingClientRect(),header=document.querySelector(".topbar").getBoundingClientRect();
        const nav=document.querySelector(".topbar nav").getBoundingClientRect();
        return {logoWidth:r.width,logoHeight:r.height,navY:nav.top,logoY:r.top,
          logoBottom:r.bottom,headerBottom:header.bottom,docWidth:document.documentElement.scrollWidth};
      })();`);
      assert.ok(glyphTest.logoWidth>=110,"Logo complet illisible à "+width+": "+JSON.stringify(glyphTest));
      assert.ok(glyphTest.docWidth<=width+1,"Débordement horizontal à "+width+": "+JSON.stringify(glyphTest));
      assert.ok(glyphTest.navY<glyphTest.logoBottom&&glyphTest.navY+44>glyphTest.logoY,
        "Logo et boutons doivent être SUR LA MÊME LIGNE à "+width+": "+JSON.stringify(glyphTest));
    }

    for(const tile of logoInfo.tiles) assert.equal(tile.width,tile.height,"Tuile logo non carrée à "+width);

    await command("Page.navigate",{url:base+"/forfait.html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-brand')");
    await evaluate("return document.fonts.ready.then(()=>true);");
    const signupHeader=await evaluate(headerMetrics);
    const signupHeaderRow=await evaluate(`return (()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,cx:r.x+r.width/2,cy:r.y+r.height/2}};
      const hdr=document.querySelector('[data-pa-universal-header]');
      const logo=hdr.querySelector('.pictau-brand-img'),fr=hdr.querySelector('[data-lang=fr]'),
        en=hdr.querySelector('[data-lang=en]'),login=hdr.querySelector('.login-link,.signup-login,.pa-universal-current,.pa-universal-account');
      if(!logo||!fr||!en||!login)throw Error("En-tête incomplet");
      return {logo:rect(logo),fr:rect(fr),en:rect(en),login:rect(login),
        scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    })();`);
    const signupItem=signupHeaderRow;
    assert.ok(signupItem.scrollWidth<=signupItem.viewport+1,"En-tête déborde : "+JSON.stringify(signupItem));
    assert.ok(signupItem.logo.right+2<=signupItem.fr.x&&signupItem.fr.right<=signupItem.en.x+1&&signupItem.en.right<=signupItem.login.x+1,
      "Logo + FR + EN + Connexion chevauchés : "+JSON.stringify(signupItem));
    for(const x of ["fr","en","login"])
      assert.ok(Math.abs(signupItem.logo.cy-item[x].cy)<=13,
        "Logo, FR, EN et Connexion ne sont PAS sur une seule ligne : "+JSON.stringify(signupItem));

    if(width===768){const layout=await evaluate('const el=document.querySelector(".signup-page"),h=document.querySelector(".signup-header"),s=getComputedStyle(el),r=el.getBoundingClientRect(),rh=h.getBoundingClientRect();return {marginLeft:s.marginLeft,marginRight:s.marginRight,width:s.width,pageX:r.x,pageRight:r.right,headerX:rh.x,headerWidth:rh.width,viewport:innerWidth,clientWidth:document.documentElement.clientWidth}');console.log("HEADER_768_DIAGNOSTIC "+JSON.stringify({homeHeader,signupHeader,layout}));}
    for(const key of ["logo","fr","en","login"]){
      const expected=homeHeader[key],actual=signupHeader[key],id=width+"x"+height+" "+key;
      for(const dim of ["x","y","w","h"])
        assert.ok(Math.abs(expected[dim]-actual[dim])<=2,id+" "+dim+
          " : accueil="+expected[dim]+" inscription="+actual[dim]);
      for(const prop of ["font","weight","color","background","radius","label"])
        assert.equal(actual[prop],expected[prop],id+" "+prop+" : en-têtes différents");
    }
    console.log("PASS HEADER PARITY "+width+"x"+height+" : logo, FR, EN, connexion identiques");
  }
  // Le CTA de l'accueil doit réellement ouvrir le forfait; pas de faux paiement.
  for(const width of [320,375,390,430,768,1440]){
    await command("Emulation.setDeviceMetricsOverride",{width,height:width===320?568:width===375?667:width===390?740:width===430?932:width===768?1024:900,mobile:width<=430,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/index.html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-button')");
    await evaluate("document.querySelector('.signup-button').click();return true;");
    await waitFor("return location.pathname.endsWith('/forfait.html') && document.readyState==='complete' && !!document.querySelector('.signup-page') && !!document.querySelector('.signup-footer a')");
    // L'accueil mémorise légitimement EN; choisir FR avant la vérification
    // FR, puis vérifier une seconde fois que le formulaire passe en anglais.
    await evaluate("document.querySelector('[data-lang=fr]').click();return true;");

    const dimensions=await evaluate('return [...document.querySelectorAll(".p-card")].map(card=>{const art=card.querySelector(".picto");return {cardWidth:card.offsetWidth,cardHeight:card.offsetHeight,pictoWidth:art.offsetWidth,pictoHeight:art.offsetHeight}});');
    assert.equal(dimensions.length,3,"Trois pictogrammes doivent rester présents sur les pages");
    for(const [i,d] of dimensions.entries()){
      assert.ok(Math.abs(d.cardWidth-d.cardHeight)<=1,"Carte pictogramme "+(i+1)+" non carrée : "+JSON.stringify(d));
      assert.ok(Math.abs(d.pictoWidth-d.pictoHeight)<=1,"Cadre noir pictogramme "+(i+1)+" non carré : "+JSON.stringify(d));
    }
    const p=await evaluate("return {plan:document.querySelectorAll('.signup-plan').length,price:document.querySelector('.signup-plan-price strong').textContent.trim(),forms:document.querySelectorAll('form').length,back:document.querySelector('.signup-footer a').getAttribute('href'),docHeight:document.documentElement.scrollHeight,docWidth:document.documentElement.scrollWidth,consent:document.querySelector('#signup-consent').checked,visibleForm:document.querySelector('#signup-status').getBoundingClientRect().bottom};");
    assert.equal(p.plan,1,"One distinct signup plan page");
    assert.match(p.price,/9,99/);
    assert.equal(p.forms,1,"Preparatory form, no account or payment creation");
    assert.equal(p.consent,false,"Consent is never prechecked");
    assert.equal(p.back,"./index.html","Valid navigation back");
    assert.ok(p.docWidth<=width+1,"Signup has no horizontal scroll");
    if(width<=430){
      const viewport=width===320?568:width===375?667:width===390?740:932;
      assert.ok(p.docHeight<=viewport+1,"ONE mobile screen "+width+": "+JSON.stringify(p));
      assert.ok(p.visibleForm<=viewport+1,"Form visible without scrolling "+width+": "+JSON.stringify(p));
    }

    // Critère visuel tiré du défaut Samsung : pas uniquement "pas de scroll".
    if(width<=430&&width>=390){
      const composition=await evaluate('const h=document.querySelector(".signup-header").getBoundingClientRect(),s=document.querySelector(".signup-showcase").getBoundingClientRect(),t=document.querySelector(".signup-tiles").getBoundingClientRect(),f=document.querySelector(".signup-form-card").getBoundingClientRect();return {header:h.bottom,showcase:s.top,tiles:t.height,form:f.bottom};');
      const viewport=width===390?740:932;
      assert.ok(composition.form>=viewport*.82,"La page est visuellement tassée en haut sur "+width+": "+JSON.stringify(composition));
      assert.ok(composition.showcase-composition.header>=viewport*.035,"Le titre colle au logo sur "+width+": "+JSON.stringify(composition));
      assert.ok(composition.tiles>=88,"Les pictogrammes mobiles sont trop petits sur "+width+": "+JSON.stringify(composition));
    }
    assert.equal(await evaluate("return document.body.dataset.pictauSignupDesign"),"5","Approved signup Design 5");
    assert.deepEqual(await evaluate('return [...document.querySelectorAll(".picto-label")].map(el=>el.textContent.trim())'),["Trouver","Personnaliser","Imprimer"]);
    await evaluate("document.querySelector('[data-lang=en]').click();return true;");
    assert.deepEqual(await evaluate('return [...document.querySelectorAll(".picto-label")].map(el=>el.textContent.trim())'),["Find","Personalize","Print"]);
    await evaluate("document.querySelector('[data-lang=fr]').click();return true;");
    const reachable=await evaluate('window.scrollTo(0,document.documentElement.scrollHeight);const f=document.querySelector(".signup-footer").getBoundingClientRect();return {bottom:f.bottom,top:f.top,height:innerHeight,overflow:getComputedStyle(document.documentElement).overflowY};');
    assert.notEqual(reachable.overflow,"hidden","Scrolling remains possible with keyboard/zoom");
    assert.ok(reachable.top>=-1&&reachable.bottom<=reachable.height+2,
      "Signup footer must be reachable by scrolling "+width+": "+JSON.stringify(reachable));
    await evaluate("window.scrollTo(0,0);return true;");
    const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,fromSurface:true});
    await writeFile(join(screenshots,"forfait-design5-"+width+"px.png"),Buffer.from(shot.data,"base64"));
  }
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:640,mobile:true,deviceScaleFactor:1});
  await command("Page.navigate",{url:base+"/index.html"});
  await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-button')");
  const zoom=await evaluate("document.body.style.zoom='1.85';window.scrollTo(0,document.documentElement.scrollHeight);return {scroll:document.documentElement.scrollHeight,height:innerHeight,position:window.scrollY,button:!!document.querySelector('.signup-button')};");
  assert.equal(zoom.button,true,"Zoom: CTA still in DOM");
  assert.ok(zoom.scroll>zoom.height,"Zoom: enlarged page extends beyond the viewport");
  assert.ok(zoom.position>0,"Zoom: user can actually scroll to the enlarged content");
  await evaluate("document.body.style.zoom='';return true;");
  // Régression réelle constatée par captures Samsung 1 novembre :
  // AUCUNE taille / position de FR, EN ou Connexion ne doit changer en
  // basculant la langue, sur n'importe quelle page du site.
  const languageGeometry=[
    "const header=document.querySelector('[data-pa-universal-header]');",
    "if(!header)throw Error('En-tête partagé absent');",
    "const element=(sel)=>{const e=header.querySelector(sel);if(!e)throw Error('Contrôle absent : '+sel);const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};",
    "return {fr:element('[data-lang=fr]'),en:element('[data-lang=en]'),action:element('.login-link,.signup-login,.pa-universal-current,.pa-universal-account'),logo:element('.pictau-brand-img'),viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};"
  ].join("\n");
  for(const [width,height] of [[320,568],[350,700],[360,640],[390,844],[430,932],[520,900],[521,900],[750,1024],[768,1024],[1024,768],[1440,900]]){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=768,deviceScaleFactor:1});
    for(const page of ["index.html","forfait.html","connexion.html","contact.html","conditions.html","confidentialite.html","app/index.html"]){
      await command("Page.navigate",{url:base+"/"+page});
      try{
      await waitFor("return document.readyState==='complete' && !!document.querySelector('[data-pa-universal-header] [data-lang=fr]') && !!document.querySelector('[data-pa-universal-header] .pictau-brand-img')",16000);
      }catch(error){
        console.error("Browser page failing: "+page+" "+width+"x"+height);
        console.error("Runtime exceptions: "+JSON.stringify(browserJsExceptions.slice(-8)));
        console.error("Module status: "+JSON.stringify(await evaluate("return {url:location.href,scripts:[...document.querySelectorAll('script')].map(s=>s.src),root:document.querySelector('#app')?.innerHTML.slice(0,200),title:document.title};")));
        throw error;
      }
      await evaluate("document.querySelector('[data-pa-universal-header] [data-lang=fr]').click();return true;");
      await waitFor("return document.documentElement.lang==='fr'");
      const frGeometry=await evaluate(languageGeometry);
      await evaluate("document.querySelector('[data-pa-universal-header] [data-lang=en]').click();return true;");
      await waitFor("return document.documentElement.lang==='en'");
      const enGeometry=await evaluate(languageGeometry);
      const where=page+" "+width+"x"+height;
      for(const control of ["fr","en","action","logo"]){
        for(const dimension of ["x","y","w","h"]){
          assert.ok(Math.abs(frGeometry[control][dimension]-enGeometry[control][dimension])<=1.1,
            "Bascule FR/EN déplace ou redimensionne "+control+" "+dimension+" "+where+" FR="+JSON.stringify(frGeometry[control])+" EN="+JSON.stringify(enGeometry[control]));
        }
      }
      for(const g of [frGeometry,enGeometry]){
        assert.ok(g.scrollWidth<=g.viewport+1,"En-tête débordant "+where+" "+JSON.stringify(g));
        assert.ok(g.logo.right+1<=g.fr.x&&g.fr.right<=g.en.x+1&&g.en.right<=g.action.x+1,
          "Logo / langues / connexion chevauchés "+where+" "+JSON.stringify(g));
        for(const key of ["fr","en","action"])
          assert.ok(Math.abs((g.logo.y+g.logo.h/2)-(g[key].y+g[key].h/2))<=13,
            "En-tête sur plusieurs rangées "+where+" "+JSON.stringify(g));
      }
      if(width===390 && ["index.html","forfait.html","app/index.html"].includes(page)){
        const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
        await writeFile(join(screenshots,"lang-stable-"+page.replace("/","-")+"-"+width+"-en.png"),Buffer.from(shot.data,"base64"));
      }
      console.log("PASS LANGUE EN-TÊTE STABLE",where);
    }
  }

  // Contrat anti-régression demandé : les DEUX cartes blanches ont exactement
  // les mêmes dimensions, et le contenu de gauche forme un bloc de la
  // largeur/hauteur de la carte blanche à droite. Pas de fausse validation par
  // présence de sélecteur CSS — rectangles réellement rendus par Chromium.
  for(const [width,height] of [[900,900],[1024,800],[1280,900],[1440,900],[1920,1080]]){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:false,deviceScaleFactor:1});
    for(const language of ["fr","en"]){
      await command("Page.navigate",{url:base+"/forfait.html"});
      await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-form-card')");
      await evaluate("return document.fonts.ready.then(()=>true)");
      await evaluate("document.querySelector('[data-lang="+language+"]').click();return true;");
      await waitFor("return document.documentElement.lang==='"+language+"'");
      const signup=await evaluate(`
        const get=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,centerY:r.y+r.height/2};};
        return {left:get('.signup-showcase'),card:get('.signup-form-card'),documentW:document.documentElement.scrollWidth,windowW:innerWidth,display:getComputedStyle(document.querySelector('.signup-page')).display};
      `);
      await command("Page.navigate",{url:base+"/app/index.html"});
      await waitFor("return document.readyState==='complete' && !!document.querySelector('.hosted-access-v5 .hosted-access-panel')",16000);
      await evaluate("return document.fonts.ready.then(()=>true)");
      await evaluate("document.querySelector('[data-action=lang][data-lang="+language+"]').click();return true;");
      await waitFor("return document.documentElement.lang==='"+language+"'");
      const login=await evaluate(`
        const get=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,centerY:r.y+r.height/2};};
        return {left:get('.hosted-e-intro'),card:get('.hosted-access-panel'),documentW:document.documentElement.scrollWidth,windowW:innerWidth,display:getComputedStyle(document.querySelector('.hosted-e-layout')).display};
      `);
      const where=width+"x"+height+" "+language;
      const close=(a,b,what)=>assert.ok(Math.abs(a-b)<=2,
        "Panneaux non harmonisés "+what+" "+where+" signup="+JSON.stringify(signup)+" login="+JSON.stringify(login));
      close(signup.card.w,login.card.w,"largeur carte login/signup");
      close(signup.card.h,login.card.h,"hauteur carte login/signup");
      for(const page of [signup,login]){
        close(page.left.w,page.card.w,"largeur gauche/droite");
        close(page.left.h,page.card.h,"hauteur gauche/droite");
        close(page.left.centerY,page.card.centerY,"alignement vertical gauche/droite");
        assert.ok(page.left.right+8<page.card.x,"Colonnes en chevauchement "+where+" "+JSON.stringify(page));
        assert.ok(page.documentW<=page.windowW+2,"Débordement horizontal "+where+" "+JSON.stringify(page));
      }
      if(width===1440){
        const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
        await writeFile(join(screenshots,"auth-equal-cards-login-"+language+".png"),Buffer.from(shot.data,"base64"));
      }
      console.log("PASS CARTES BLANCHES IDENTIQUES",where,signup.card.w,signup.card.h);
    }
  }
  // Tablette et téléphone : pas de hauteur de carte desktop forcée,
  // pas de rupture à 899/900 px, pas de scroll horizontal.
  for(const [width,height] of [[320,568],[390,844],[680,800],[768,1024],[899,900]]){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=768,deviceScaleFactor:1});
    for(const path of ["/forfait.html","/app/index.html"]){
      await command("Page.navigate",{url:base+path});
      await waitFor("return document.readyState==='complete' && !!document.querySelector('form')");
      const layout=await evaluate(`
        const s=document.querySelector('.signup-form-card,.hosted-access-panel'),r=s.getBoundingClientRect();
        return {height:r.height,scroll:document.documentElement.scrollWidth,window:innerWidth,
          forcedMin:getComputedStyle(s).minHeight,form:!!document.querySelector('form'),
          action:!!document.querySelector('button[type=submit]')};
      `);
      assert.ok(layout.scroll<=layout.window+2,"Débordement responsive "+width+" "+path);
      assert.ok(layout.form&&layout.action,"Formulaire disparu "+width+" "+path);
      assert.equal(layout.forcedMin,"0px","Hauteur desktop imposée au mobile/tablette "+width+" "+path);
    }
    console.log("PASS AUTH RESPONSIVE SANS HAUTEUR FORCÉE",width+"x"+height);
  }
  // Vérification visuelle réglementaire de @Boss : retirer les supports blancs
  // externes sans supprimer la bordure NOIRE et le carré des trois pictos.
  // Vérifie le CSS COMPUTÉ Chromium et non une simple présence de sélecteur.
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[899,900],[900,900],[1024,800],[1440,900],[1920,1080]]){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=768,deviceScaleFactor:1});
    for(const [page,tile,inside] of [
      ["index.html",".poster-tiles .p-card",".poster-tiles .p-card .picto"],
      ["forfait.html",".signup-tiles .p-card",".signup-tiles .p-card .picto"],
      ["app/index.html",".hosted-e-tiles .hosted-e-tile",".hosted-e-tiles .hosted-e-tile .hosted-e-art"]
    ]){
      await command("Page.navigate",{url:base+"/"+page});
      await waitFor("return document.readyState==='complete' && document.querySelectorAll("+JSON.stringify(tile)+").length===3",16000);
      for(const lang of ["fr","en"]){
        if(page==="app/index.html"){
          await evaluate("document.querySelector('[data-action=lang][data-lang="+lang+"]').click();return true");
        }else{
          await evaluate("document.querySelector('[data-lang="+lang+"]').click();return true");
        }
        await waitFor("return document.documentElement.lang==='"+lang+"'");
        const result=await evaluate([
          "const tileSel="+JSON.stringify(tile)+";const inSel="+JSON.stringify(inside)+";",
          "const cards=[...document.querySelectorAll(tileSel)];",
          "const items=cards.map(c=>{const cs=getComputedStyle(c),r=c.getBoundingClientRect(),inner=c.querySelector(inSel.replace(tileSel,'').trim()),is=getComputedStyle(inner);return {",
          "  width:r.width,height:r.height,aspect:cs.aspectRatio,padding:[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft],",
          "  borders:[cs.borderTopWidth,cs.borderRightWidth,cs.borderBottomWidth,cs.borderLeftWidth],",
          "  radius:cs.borderTopLeftRadius,shadow:cs.boxShadow,bg:cs.backgroundColor,",
          "  insideBorder:is.borderTopWidth,insideColor:is.borderTopColor,insideBg:is.backgroundColor,innerRect:inner.getBoundingClientRect().width",
          "};});",
          "return {lang:document.documentElement.lang,w:innerWidth,scrollW:document.documentElement.scrollWidth,items};"
        ].join("\n"));
        const where=page+" "+width+"×"+height+" "+lang;
        assert.equal(result.items.length,3,"Trio absent "+where);
        for(const item of result.items){
          assert.ok(Math.abs(item.width-item.height)<=1.2,"Le picto n'est plus carré "+where+" "+JSON.stringify(item));
          assert.ok(item.padding.every(p=>parseFloat(p)===0),"Marge blanche externe "+where+" "+JSON.stringify(item));
          assert.ok(item.borders.every(p=>parseFloat(p)===0),"Bordure de support extérieure "+where+" "+JSON.stringify(item));
          assert.equal(item.radius,"0px","Coin arrondi externe "+where);
          assert.equal(item.shadow,"none","Ombre support externe "+where);
          assert.equal(item.bg,"rgba(0, 0, 0, 0)","Fond de support externe "+where);
          assert.ok(parseFloat(item.insideBorder)>=1,"Contour noir interne absent "+where+" "+JSON.stringify(item));
          assert.equal(item.insideColor,"rgb(44, 56, 52)","Contour noir interne modifié "+where);
          assert.ok(item.innerRect>0,"Dessin interne disparu "+where);
        }
        assert.ok(result.scrollW<=result.w+2,"Overflow horizontal "+where);
        if(width===390&&lang==="fr"){
          const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
          await writeFile(join(screenshots,"sans-cadre-exterieur-"+page.replace("/","-")+".png"),Buffer.from(shot.data,"base64"));
        }
        console.log("PASS PICTOS SANS CADRE BLANC",where);
      }
    }
  }
  // Parcours réel : depuis le bouton sous la connexion vers le forfait Design 5.
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,mobile:true,deviceScaleFactor:1});
  // Contrôle d'harmonisation universelle : rendu réel Chromium de la maquette E
  // sur la VRAIE application (/app/), et comparaison de ses dessins avec l'accueil.
  for(const [width,height] of [[320,568],[360,640],[390,740],[390,844],[430,932],[768,1024],[1024,768],[1440,900]]){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=768,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/index.html"});
    await waitFor("return document.querySelectorAll('.poster-tiles svg').length===3");
    const referenceSvgs=await evaluate("return [...document.querySelectorAll('.poster-tiles svg')].map(svg=>svg.outerHTML)");
    const referenceLogo=await evaluate("return document.querySelector('.home-logo .pictau-brand-img').getAttribute('src').split('/').pop()");
    await command("Page.navigate",{url:base+"/app/index.html"});
    await waitFor("return !!document.querySelector('.hosted-access-v5 .hosted-email-form') && document.querySelectorAll('.hosted-e-tile').length===3",16000);
    const metrics=await evaluate(`
      const box=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
      return {w:innerWidth,docW:document.documentElement.scrollWidth,design:document.querySelector('.hosted-access-v5')!==null,
        header:box('.hosted-access-header'),logo:box('.hosted-access-header .pa-universal-logo-link'),intro:box('.hosted-e-intro'),
        panel:box('.hosted-access-panel'),tiles:[...document.querySelectorAll('.hosted-e-tile')].map(e=>({w:e.offsetWidth,h:e.offsetHeight})),
        svgs:[...document.querySelectorAll('.hosted-e-tile svg')].map(svg=>svg.outerHTML),
        logoFile:document.querySelector('.hosted-access-header .pa-universal-logo-link img').getAttribute('src').split('/').pop(),
        forgot:!!document.querySelector('[data-action=auth-forgot]'),
        google:!!document.querySelector('[data-action=google-login]'),
        email:!!document.querySelector('form[data-form=email-login]'),
        signup:document.querySelector('.hosted-signup a')?.getAttribute('href'),
        footer:document.querySelector('.hosted-e-footer')?.getBoundingClientRect().bottom,
        lang:document.documentElement.lang};
    `);
    assert.equal(metrics.design,true,"Maquette E absente "+width);
    assert.equal(metrics.logoFile,referenceLogo,"Logo réel non harmonisé "+width);
    const loginRow=await evaluate(`return (()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,cx:r.x+r.width/2,cy:r.y+r.height/2}};
      const h=document.querySelector('.hosted-access-header[data-pa-universal-header]');
      return{logo:rect(h.querySelector('.pictau-brand-img')),fr:rect(h.querySelector('[data-lang=fr]')),
        en:rect(h.querySelector('[data-lang=en]')),login:rect(h.querySelector('.pa-universal-current'))};
    })();`);
    assert.ok(loginRow.logo.right<=loginRow.fr.x&&loginRow.fr.right<=loginRow.en.x+1&&loginRow.en.right<=loginRow.login.x+1,
      "Connexion : chevauchement de l'en-tête "+width+": "+JSON.stringify(loginRow));
    for(const key of ["fr","en","login"])
      assert.ok(Math.abs(loginRow.logo.cy-loginRow[key].cy)<=13,
        "Connexion : en-tête NON aligné à "+width+": "+JSON.stringify(loginRow));

    assert.equal(metrics.tiles.length,3,"Trois pictogrammes officiels requis "+width);
    for(let i=0;i<3;i++){
      assert.equal(metrics.svgs[i],referenceSvgs[i],"Dessin officiel différent : "+i+" sur "+width);
      assert.ok(Math.abs(metrics.tiles[i].w-metrics.tiles[i].h)<=1,"Picto non carré "+width+": "+JSON.stringify(metrics.tiles[i]));
    }
    assert.ok(metrics.docW<=metrics.w+1,"Débordement horizontal Login E "+width+": "+JSON.stringify(metrics));

    if(width<=680){
      const view=await evaluate(`
        const box=selector=>{const el=document.querySelector(selector);if(!el)throw Error('Action de connexion absente: '+selector);const r=el.getBoundingClientRect(),st=getComputedStyle(el);return {top:r.top,bottom:r.bottom,height:r.height,display:st.display,visibility:st.visibility};};
        return {height:innerHeight,viewportWidth:innerWidth,
          htmlScroll:document.documentElement.scrollHeight,bodyScroll:document.body.scrollHeight,
          pageScroll:document.querySelector('#app').scrollHeight,client:document.documentElement.clientHeight,
          rootOverflow:getComputedStyle(document.documentElement).overflowY,
          authSubmit:box('form[data-form=email-login] button[type=submit]'),
          email:box('#auth-email'),password:box('#auth-password'),
          forgot:box('[data-action=auth-forgot]'),
          google:box('[data-action=google-login]'),
          signup:box('.hosted-signup a'),
          intro:box('.hosted-e-intro'),pics:box('.hosted-e-tiles')};
      `);
      const where=width+"x"+height;
      for(const control of ["email","password","forgot","authSubmit","google","signup"]){
        const r=view[control];
        assert.ok(r.display!=="none"&&r.visibility!=="hidden"&&r.height>0,
          "Action essentielle cachée "+control+" "+where+": "+JSON.stringify(view));
        assert.ok(r.top>=-1&&r.bottom<=view.height+1,
          "Connexion NON sur un écran : "+control+" "+where+": "+JSON.stringify(view));
      }
      assert.ok(view.htmlScroll<=view.height+2&&view.bodyScroll<=view.height+2&&view.pageScroll<=view.height+2,
        "Défilement mobile au repos "+where+": "+JSON.stringify(view));
      assert.ok(view.rootOverflow!=="hidden"&&view.rootOverflow!=="clip",
        "Scroll interdit même avec clavier ou zoom "+where+": "+JSON.stringify(view));
      assert.ok(Math.abs(view.pics.height-view.pics.bottom+view.pics.top)<2,"Mesures pictos incohérentes");
      console.log("PASS LOGIN MOBILE UNE VUE",where);
    }

    assert.ok(metrics.email&&metrics.google&&metrics.forgot&&metrics.signup==="../forfait.html","Auth ou lien perdu "+width);
    if(width<=768)assert.ok(metrics.panel.y>=metrics.intro.bottom-2,"Login mobile : éléments se chevauchent "+width);
    else assert.ok(metrics.panel.x>=metrics.intro.right-2,"Login desktop : colonnes se chevauchent "+width);
    const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
    await writeFile(join(screenshots,"login-design-e-"+width+"x"+height+".png"),Buffer.from(shot.data,"base64"));
    await evaluate("document.querySelector('[data-action=lang][data-lang=en]').click();return true;");
    await waitFor("return document.documentElement.lang==='en'");
    const en=await evaluate("return {cards:[...document.querySelectorAll('.hosted-e-tile-label')].map(e=>e.textContent.trim()),title:document.querySelector('#hosted-access-title').textContent.trim()}");
    assert.deepEqual(en.cards,["Find","Personalize","Print"],"English icons "+width);
    assert.equal(en.title,"Sign in","English form "+width);
    await evaluate("document.querySelector('[data-action=auth-forgot]').click();return true;");
    await waitFor("return !!document.querySelector('form[data-form=email-reset]')");
    await evaluate("document.querySelector('[data-action=auth-back-login]').click();return true;");
    await waitFor("return !!document.querySelector('form[data-form=email-login]')");
    console.log("HARMONISATION LOGIN E PASS",width+"x"+height);
  }
  await command("Page.navigate",{url:base+"/app/index.html"});
  await waitFor("return !!document.querySelector('.hosted-signup a')");
  const createLink=await evaluate("return document.querySelector('.hosted-signup a').getAttribute('href')");
  assert.equal(createLink,"../forfait.html","The sign-up action must link to the actual registration page");
  await evaluate("document.querySelector('.hosted-signup a').click();return true;");
  await waitFor("return location.pathname.endsWith('/forfait.html') && document.readyState==='complete' && !!document.querySelector('.signup-page') && !!document.querySelector('.signup-footer a')");
  const actualSignup=await evaluate("return {hasForm:!!document.querySelector('#signup-form'),price:document.querySelector('.signup-plan-price strong').textContent.trim()}");
  assert.equal(actualSignup.hasForm,true,"The account-creation form must be shown");
  assert.match(actualSignup.price,/9,99/);
  console.log("PASS connexion vers inscription Design 5 sur mobile");
  for(const name of ["connexion","contact","conditions","confidentialite"]){
    await command("Page.navigate",{url:base+"/"+name+".html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.info-surface')");
    const info=await evaluate("return{back:!!document.querySelector('a[href=\"./index.html\"]'),forms:document.querySelectorAll('form').length};");
    assert.equal(info.back,true,name+" return home");
    assert.equal(info.forms,0,name+" no fake form");
  }
  // La connexion publique doit mener à la vraie création de compte, pas revenir à la connexion.
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,mobile:true,deviceScaleFactor:1});
  await command("Page.navigate",{url:base+"/connexion.html"});
  await waitFor("return document.readyState==='complete' && !!document.querySelector('a[href=\"./forfait.html\"]')");
  const publicSignup=await evaluate("return {links:document.querySelectorAll('a[href=\"./forfait.html\"]').length,text:document.querySelector('a[href=\"./forfait.html\"]').textContent.trim()}");
  assert.equal(publicSignup.links,1,"Connexion publique : un seul lien de création de compte");
  assert.ok(["Créer un compte","Create an account"].includes(publicSignup.text),"Libellé localisé du bouton création");
  await evaluate("document.querySelector('a[href=\"./forfait.html\"]').click();return true;");
  await waitFor("return location.pathname.endsWith('/forfait.html') && document.readyState==='complete' && !!document.querySelector('#signup-form')");
  const publicForm=await evaluate("return {form:!!document.querySelector('#signup-form'),price:document.querySelector('.signup-plan-price strong').textContent.trim()}");
  assert.equal(publicForm.form,true,"Lien création → formulaire du forfait");
  assert.match(publicForm.price,/9,99/,"Tarif mensuel actuel");
  console.log("PASS connexion publique → création de compte Design 3");
  // Banque > Images : contrôle du vrai CSS sur mobile / tablette / PC.
  // Fiche factice seulement : aucune connexion Super Admin ou image privée.
  await command("Page.navigate",{url:base+"/app/index.html"});
  await waitFor("return document.readyState==='complete' && !!document.querySelector('link[href=\"./src/styles.css\"]')");
  await evaluate(
    "document.body.innerHTML='<main class=\"pa-bank-results\"><div class=\"admin-bank-grid admin-bank-view-list\"></div></main>';"
    +"const grid=document.querySelector('.admin-bank-grid');"
    +"for(let i=0;i<3;i++){"
    +"const card=document.createElement('article');"
    +"card.className='admin-bank-card admin-bank-item';"
    +"card.innerHTML='<span class=\"admin-bank-thumb\"><img data-private-thumb alt=\"\"></span><div class=\"admin-bank-item-meta\"><strong>Picto '+(i+1)+'</strong></div><button type=\"button\" class=\"pa-bank-card-open\">Ouvrir</button>';"
    +"const img=card.querySelector('img');"
    +"const dims=[[80,80],[160,80],[80,160]][i];"
    +"img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"'+dims[0]+'\" height=\"'+dims[1]+'\" viewBox=\"0 0 '+dims[0]+' '+dims[1]+'\"><path fill=\"black\" d=\"M0 0h40v40H0z\"/></svg>');"
    +"grid.appendChild(card);"
    +"}return true;"
  );
  for(const width of [320,375,768,1024,1440,1920]){
    await command("Emulation.setDeviceMetricsOverride",{width,height:900,mobile:width<800,deviceScaleFactor:1});
    for(const view of ["list","small","medium"]){
      const data=await evaluate(
        "const g=document.querySelector('.pa-bank-results .admin-bank-grid');"
        +"g.className='admin-bank-grid admin-bank-view-"+view+"';"
        +"const thumbs=[...g.querySelectorAll('.admin-bank-item .admin-bank-thumb')];"
        +"const boxes=thumbs.map(el=>{const r=el.getBoundingClientRect(),img=el.querySelector('img'),ri=img.getBoundingClientRect();"
        +"return {width:r.width,height:r.height,left:r.left,right:r.right,"
        +"imgWidth:ri.width,imgHeight:ri.height,objectFit:getComputedStyle(img).objectFit,"
        +"objectPosition:getComputedStyle(img).objectPosition,"
        +"centered:Math.abs((ri.left+ri.right)/2-(r.left+r.right)/2)<=1}});"
        +"return {boxes,screen:innerWidth,scrollWidth:document.documentElement.scrollWidth};"
      );
      assert.equal(data.boxes.length,3,"Banque : le banc doit afficher 3 miniatures");
      for(const box of data.boxes){
        assert.ok(Math.abs(box.width-72)<0.2&&Math.abs(box.height-72)<0.2,
          "Miniature non uniforme "+width+"px "+view+" : "+JSON.stringify(box));
        assert.equal(box.objectFit,"contain","Image déformée "+width+"px "+view);
        assert.equal(box.objectPosition,"50% 50%","Image non centrée "+width+"px "+view);
        assert.ok(box.centered,"Miniature décentrée "+width+"px "+view);
        assert.ok(box.imgWidth<=72&&box.imgHeight<=72,"Image déborde "+width+"px "+view);
      }
      assert.ok(data.scrollWidth<=width+1,
        "Débordement horizontal Banque "+width+"px "+view+" : "+data.scrollWidth);
      console.log("BANQUE MINIATURES OK",width,view,"72x72 px, contain, centrées");
    }
  }

  // Banque > Images : tests de pixels sur le vrai pipeline local (pas seulement les carrés CSS).
  // Trois PNG fictifs : noir de taille/place différente et format panoramique; zéro compte privé.
  const inkStats=await evaluate(
    "return import('./src/bank-thumbnail.js').then(async ({createNormalizedBankThumbnail,BANK_THUMBNAIL_PIXELS})=>{"
    +"const ink=await import('./src/png-ink.js');const sizes=[[200,200,10,10,70,70],[200,200,146,146,30,30],[200,100,45,30,100,40]];"
    +"const all=[];"
    +"for(const [w,h,x,y,bw,bh] of sizes){"
    +"const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;"
    +"const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);"
    +"ctx.fillStyle='#000';ctx.fillRect(x,y,bw,bh);"
    +"const original=await new Promise(ok=>canvas.toBlob(ok,'image/png'));"
    +"const normalized=await createNormalizedBankThumbnail(original);"
    +"const bitmap=await createImageBitmap(normalized);"
    +"const out=document.createElement('canvas');out.width=out.height=BANK_THUMBNAIL_PIXELS;"
    +"const outCtx=out.getContext('2d',{willReadFrequently:true});outCtx.drawImage(bitmap,0,0);bitmap.close();"
    +"const bounds=ink.findInkBoundsRGBA(outCtx.getImageData(0,0,out.width,out.height).data,out.width,out.height);"
    +"all.push({width:out.width,height:out.height,inkWidth:bounds.width,inkHeight:bounds.height,"
    +"centerX:bounds.x+bounds.width/2,centerY:bounds.y+bounds.height/2,"
    +"sourceUnchanged:original.size>0,outputBytes:normalized.size});"
    +"}return all;"
    +"});"
  );
  assert.equal(inkStats.length,3,"Les 3 PNG fictifs doivent être normalisés");
  for(const [index,entry] of inkStats.entries()){
    assert.equal(entry.width,216,"Dimension PNG normalisée "+index);
    assert.equal(entry.height,216,"Dimension PNG normalisée "+index);
    assert.ok(entry.sourceUnchanged&&entry.outputBytes>0,"Source ou rendu invalide "+index);
    assert.ok(Math.abs(entry.centerX-108)<=2&&Math.abs(entry.centerY-108)<=2,
      "Dessin non centré "+index+" "+JSON.stringify(entry));
    assert.ok(Math.max(entry.inkWidth,entry.inkHeight)>=154&&Math.max(entry.inkWidth,entry.inkHeight)<=176,
      "Dessin mal calibré "+index+" "+JSON.stringify(entry));
  }
  const squareInk=[inkStats[0],inkStats[1]];
  assert.ok(Math.abs(squareInk[0].inkWidth-squareInk[1].inkWidth)<=8,
    "Deux dessins carrés de tailles initiales différentes doivent finir à la même grandeur");
  console.log("BANQUE ENCRE NORMALISÉE OK",JSON.stringify(inkStats));

  console.log("Vitrine validée : 10 formats × FR/EN, forfait Design 3, zoom et pages légales.");
}catch(error){
  console.error(error);
  process.exitCode=1;
}finally{
  if(socket)socket.close();
  if(chrome){
    if(chrome.exitCode===null){
      chrome.kill("SIGKILL");
      await Promise.race([new Promise(resolve=>chrome.once("exit",resolve)),sleep(1500)]);
    }
  }
  server.close();
  for(const dir of profiles){
    try{rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:120});}
    catch(error){console.warn("Nettoyage du profil Chrome différé :",error.message);}
  }
}
