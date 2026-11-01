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
      assert.ok(glyphTest.logoWidth>=190,"Logo complet illisible à "+width+": "+JSON.stringify(glyphTest));
      assert.ok(glyphTest.docWidth<=width+1,"Débordement horizontal à "+width+": "+JSON.stringify(glyphTest));
      if(width<=520)assert.ok(glyphTest.navY>=glyphTest.logoBottom-1,
        "Mobile : boutons ne sont pas sous le logo à "+width+": "+JSON.stringify(glyphTest));
    }

    for(const tile of logoInfo.tiles) assert.equal(tile.width,tile.height,"Tuile logo non carrée à "+width);

    await command("Page.navigate",{url:base+"/forfait.html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-brand')");
    await evaluate("return document.fonts.ready.then(()=>true);");
    const signupHeader=await evaluate(headerMetrics);
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
  // Parcours réel : depuis le bouton sous la connexion vers le forfait Design 5.
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,mobile:true,deviceScaleFactor:1});
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
