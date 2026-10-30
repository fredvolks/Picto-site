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
      const value=await evaluate("\nconst keys=[\".header\",\".login-link\",\".hero\",\".hero-title\",\".intro\",\".benefits\",\".signup-section\",\".signup-button\",\".site-footer\"];\nconst bounds={};\nfor(const key of keys){const n=document.querySelector(key);if(!n)throw Error(\"missing \"+key);const r=n.getBoundingClientRect();bounds[key]={left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,visible:getComputedStyle(n).display!==\"none\"};}\nconst labels=[...document.querySelectorAll('.pictau-label')].map(n=>({\n text:n.textContent.trim(),\n border:getComputedStyle(n).borderTopWidth,\n borderColor:getComputedStyle(n).borderTopColor,\n align:getComputedStyle(n).alignItems,\n justify:getComputedStyle(n).justifyContent\n}));\nconst benefits=[...document.querySelectorAll('.benefit')].map(n=>{const r=n.getBoundingClientRect();const t=n.querySelector('strong').getBoundingClientRect();return{x:r.x,width:r.width,strongWidth:t.width,center:t.left+t.width/2,boxCenter:r.left+r.width/2,iconHeight:n.querySelector('.benefit-icon').getBoundingClientRect().height,fonts:Number.parseFloat(getComputedStyle(n.querySelector('strong')).fontSize)};});\nconst range=document.createRange();range.selectNodeContents(document.querySelector('.hero-title'));\nconst titleRect=range.getBoundingClientRect();\nreturn{width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,bounds,labels,benefits,\n titleInk:{top:titleRect.top,bottom:titleRect.bottom},\n planCount:document.querySelectorAll('.plan').length,signupCount:document.querySelectorAll('.signup-button').length,\n signupHref:document.querySelector('.signup-button').getAttribute('href'),\n loginText:document.querySelector('.login-link').textContent.trim(),loginCount:document.querySelectorAll('.login-link').length,\n language:document.documentElement.lang,legal:document.querySelectorAll('.site-footer a').length,\n devicesDisplay:getComputedStyle(document.querySelector('.hero-visual')).display,\n unwantedLines:document.querySelectorAll('.laptop-lines,.phone-line,.laptop-subheading,.phone-heading').length};");
      const name=lang+"-"+width+"x"+height;
      assert.equal(value.language,lang,name+" language");
      assert.equal(value.planCount,0,name+" no plan on home");
      assert.equal(value.signupCount,1,name+" one signup CTA");
      assert.equal(value.signupHref,"./forfait.html",name+" valid separate plan link");
      assert.equal(value.loginCount,1,name+" one login");
      assert.equal(value.loginText,lang==="fr"?"Connexion":"Sign in",name+" sign in direct");
      assert.equal(value.legal,3,name+" three legal links");
      assert.equal(value.unwantedLines,0,name+" no fake blue skeleton");
      assert.ok(value.scrollW<=width+2,name+" horizontal overflow: "+JSON.stringify(value));
      assert.ok(value.scrollH<=height+2,name+" vertical overflow: "+JSON.stringify(value));
      for(const [selector,r] of Object.entries(value.bounds)){
        assert.ok(r.visible&&r.width>0&&r.height>0,name+" "+selector+" visible");
        assert.ok(r.left>=-2&&r.right<=width+2,name+" "+selector+" within horizontal viewport "+JSON.stringify(r));
        assert.ok(r.top>=-2&&r.bottom<=height+2,name+" "+selector+" within vertical viewport "+JSON.stringify(r));
      }
      assert.ok(value.titleInk.top>=value.bounds[".hero"].top-2&&value.titleInk.bottom<=value.bounds[".hero"].bottom+2,name+" title ink not clipped");
      assert.equal(value.benefits.length,3,name+" three benefits");
      for(const benefit of value.benefits){
        assert.ok(benefit.iconHeight>=30,name+" benefit icon large enough");
        assert.ok(benefit.fonts>=12,name+" benefit title readable");
        assert.ok(Math.abs(benefit.center-benefit.boxCenter)<=3,name+" benefits properly centered: "+JSON.stringify(benefit));
      }
      assert.equal(value.labels.length,5,name+" five examples from app");
      assert.deepEqual(value.labels.map(x=>x.text),lang==="fr"?["toilette","collation","lire","école","pause"]:["toilet","snack","read","school","break"],name+" source labels bilingual");
      for(const label of value.labels){
        assert.ok(parseFloat(label.border)>0,name+" black separator line");
        assert.match(label.borderColor,/rgb\(17, 17, 17\)/,name+" black separator ink");
        assert.equal(label.align,"center",name+" label vertically centered");
        assert.equal(label.justify,"center",name+" label horizontally centered");
      }
      if(width<=370&&height<=620)assert.equal(value.devicesDisplay,"none",name+" no decorative visual on short phone");
      else assert.notEqual(value.devicesDisplay,"none",name+" authentic sample images visible");
      const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(screenshots,name+".png"),Buffer.from(shot.data,"base64"));
      console.log("PASS "+name+" : page unique, deux actions, bénéfices et ligne noire");
    }
  }
  // Le CTA de l'accueil doit réellement ouvrir le forfait; pas de faux paiement.
  for(const width of [320,768,1440]){
    await command("Emulation.setDeviceMetricsOverride",{width,height:width===320?568:width===768?1024:900,mobile:width===320,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/index.html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-button')");
    await evaluate("document.querySelector('.signup-button').click();return true;");
    await waitFor("return location.pathname.endsWith('/forfait.html') && !!document.querySelector('.signup-page')");
    const p=await evaluate("return {plan:document.querySelectorAll('.signup-plan').length,price:document.querySelector('.signup-plan-price strong').textContent.trim(),forms:document.querySelectorAll('form').length,back:document.querySelector('.signup-footer a').getAttribute('href'),docHeight:document.documentElement.scrollHeight,docWidth:document.documentElement.scrollWidth,consent:document.querySelector('#signup-consent').checked};");
    assert.equal(p.plan,1,"One distinct signup plan page");
    assert.match(p.price,/9,99/);
    assert.equal(p.forms,1,"Preparatory form, no account or payment creation");
    assert.equal(p.consent,false,"Consent is never prechecked");
    assert.equal(p.back,"./index.html","Valid navigation back");
    assert.ok(p.docWidth<=width+1,"Signup has no horizontal scroll");
    assert.ok(p.docHeight<=(width===320?568:width===768?1024:900)+1,"Signup fits the mobile viewport at rest");
    const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
    await writeFile(join(screenshots,"forfait-"+width+"px.png"),Buffer.from(shot.data,"base64"));
  }
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:640,mobile:true,deviceScaleFactor:1});
  await command("Page.navigate",{url:base+"/index.html"});
  await waitFor("return document.readyState==='complete' && !!document.querySelector('.signup-button')");
  const zoom=await evaluate("document.body.style.zoom='1.85';return {overflow:getComputedStyle(document.documentElement).overflowY,scroll:document.documentElement.scrollHeight,height:innerHeight,button:!!document.querySelector('.signup-button')};");
  assert.equal(zoom.overflow,"auto","Zoom: allow vertical scroll");
  assert.equal(zoom.button,true,"Zoom: CTA still in DOM");
  assert.ok(zoom.scroll>zoom.height,"Zoom: expanded content may scroll rather than clip");
  await evaluate("document.body.style.zoom='';return true;");
  // Parcours réel : depuis le bouton sous la connexion vers le forfait Design 3.
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,mobile:true,deviceScaleFactor:1});
  await command("Page.navigate",{url:base+"/app/index.html"});
  await waitFor("return !!document.querySelector('.hosted-signup a')");
  const createLink=await evaluate("return document.querySelector('.hosted-signup a').getAttribute('href')");
  assert.equal(createLink,"../forfait.html","The sign-up action must link to the actual registration page");
  await evaluate("document.querySelector('.hosted-signup a').click();return true;");
  await waitFor("return location.pathname.endsWith('/forfait.html') && !!document.querySelector('.signup-page')");
  const actualSignup=await evaluate("return {hasForm:!!document.querySelector('#signup-form'),price:document.querySelector('.signup-plan-price strong').textContent.trim()}");
  assert.equal(actualSignup.hasForm,true,"The account-creation form must be shown");
  assert.match(actualSignup.price,/9,99/);
  console.log("PASS connexion vers inscription Design 3 sur mobile");
  for(const name of ["connexion","contact","conditions","confidentialite"]){
    await command("Page.navigate",{url:base+"/"+name+".html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.info-surface')");
    const info=await evaluate("return{back:!!document.querySelector('a[href=\"./index.html\"]'),forms:document.querySelectorAll('form').length};");
    assert.equal(info.back,true,name+" return home");
    assert.equal(info.forms,0,name+" no fake form");
  }
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
