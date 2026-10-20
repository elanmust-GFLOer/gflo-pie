'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Interface,id,keccak256}=require('ethers');
const user='0xBF579B9DFe4E8f017eaFD67390f359B229380b80';
const deployer='0xF80a456710B7aF746D88733dc456BC3190E6FA31';
const subjects={USER:user,DEPLOYER:deployer};
const contracts={PRIMARY_LEGACY:{address:'0x9CF55d0b9D61Dc28EF3cb10765CF4b861Cd0991e',start:10413309},EARLIER_LEGACY:{address:'0xDa3BdF42006a2d90E14aB58a202C6bedBB6865ba',start:10320895}};
const endpoints=['https://ethereum-sepolia-rpc.publicnode.com','https://rpc.sepolia.org','https://sepolia.drpc.org'];
const iface=new Interface(['function identities(address) view returns(uint256 xp,uint8 path,uint8 tier)','function getIdentity(address) view returns(uint256 xp,uint8 path,uint8 tier,uint256 nextThreshold)','function getXP(address) view returns(uint256)','function getTier(address) view returns(uint8)','function getPath(address) view returns(uint8)']);
const methods=['identities','getIdentity','getXP','getTier','getPath'];
const evTopics=['PathChosen(address,uint8)','XPGained(address,uint256)','TierUpgraded(address,uint8)'].map(id);
const outDir=path.resolve(__dirname,'../audit-output');
const report={schema:'gflo-sepolia-pie-legacy-readonly-v1',commit:process.env.GITHUB_SHA||null,startedAt:new Date().toISOString(),network:'Ethereum Sepolia',expectedChainId:11155111,accounts:subjects,attempts:[],endpoint:null,anchor:null,contracts:{},conclusion:'INCONCLUSIVE',warnings:[]};
let seq=0;
const safeError=e=>String(e?.message||e).slice(0,1200);
async function rpc(endpoint,method,params){
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);
 try{const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}),signal:ctl.signal});
 if(!res.ok)throw Error('HTTP '+res.status);const body=await res.json();
 if(body.error)return{ok:false,error:body.error};
 if(!Object.hasOwn(body,'result'))return{ok:false,error:'Missing JSON-RPC result'};
 return{ok:true,result:body.result};}catch(e){return{ok:false,error:safeError(e)}}finally{clearTimeout(timeout)}
}
function decode(method,result){
 const d=iface.decodeFunctionResult(method,result);
 if(method==='identities')return{xp:d[0].toString(),path:Number(d[1]),tier:Number(d[2])};
 if(method==='getIdentity')return{xp:d[0].toString(),path:Number(d[1]),tier:Number(d[2]),nextThreshold:d[3].toString()};
 if(method==='getXP')return{xp:d[0].toString()};
 if(method==='getTier')return{tier:Number(d[0])};
 if(method==='getPath')return{path:Number(d[0])};
 return{};
}
async function audit(){
 let url=null;
 for(const endpoint of endpoints){const x=await rpc(endpoint,'eth_chainId',[]);report.attempts.push({endpoint,result:x});
 if(x.ok&&typeof x.result==='string'&&parseInt(x.result,16)===11155111){url=endpoint;break;}}
 if(!url){report.warnings.push('No RPC with verified Sepolia chain ID.');return;}
 report.endpoint=url;
 let a=await rpc(url,'eth_getBlockByNumber',['finalized',false]),mode='finalized';
 if(!a.ok||!a.result?.hash){a=await rpc(url,'eth_getBlockByNumber',['latest',false]);mode='latest';}
 if(!a.ok||!a.result?.hash||!a.result?.number){report.warnings.push('No valid block/hash anchor.');return;}
 const block=a.result.number;
 report.anchor={number:block,hash:a.result.hash,mode,chainId:11155111};
 for(const [name,contract] of Object.entries(contracts)){
  const entry={address:contract.address,code:null,subjects:{},logs:[]};report.contracts[name]=entry;
  const code=await rpc(url,'eth_getCode',[contract.address,block]);
  entry.code=code.ok&&typeof code.result==='string'?{ok:true,bytes:(code.result.length-2)/2,hash:keccak256(code.result)}:{ok:false,error:code.error||'Invalid result'};
  for(const [who,address] of Object.entries(subjects)){
   const state={address,calls:{},normalized:{},conflicts:[],status:'INCONCLUSIVE'};entry.subjects[who]=state;
   for(const method of methods){
    const calldata=iface.encodeFunctionData(method,[address]);
    const result=await rpc(url,'eth_call',[{to:contract.address,data:calldata},block]);
    const record={selector:calldata.slice(0,10),rpc:result,ok:false};
    if(result.ok&&typeof result.result==='string'&&result.result!=='0x'){try{record.decoded=decode(method,result.result);record.ok=true;}catch(e){record.decodeError=safeError(e)}}
    else if(result.ok)record.decodeError='Empty result';
    state.calls[method]=record;
    if(record.ok)for(const [key,val] of Object.entries(record.decoded)){
     if(key==='nextThreshold')continue;
     if(Object.hasOwn(state.normalized,key)&&state.normalized[key]!==val)state.conflicts.push(key+' mismatch at '+method);
     state.normalized[key]=val;
    }
   }
   const complete=['xp','path','tier'].every(k=>Object.hasOwn(state.normalized,k));
   state.status=(complete&&!state.conflicts.length&&entry.code.ok&&entry.code.bytes>0)?'PASS':'INCONCLUSIVE';
   const topic='0x'+address.toLowerCase().slice(2).padStart(64,'0');
   const query={address:contract.address,fromBlock:'0x'+contract.start.toString(16),toBlock:block,topics:[evTopics,topic]};
   entry.logs.push({subject:who,query,rpc:await rpc(url,'eth_getLogs',[query])});
  }
 }
 const verify=await rpc(url,'eth_getBlockByNumber',[block,false]);
 report.anchor.check={ok:verify.ok,hash:verify.result?.hash||null,same:verify.ok&&verify.result?.hash?.toLowerCase()===report.anchor.hash.toLowerCase()};
 const entries=Object.values(report.contracts);
 const complete=entries.length===2&&entries.every(e=>e.code.ok&&e.code.bytes>0&&Object.values(e.subjects).every(s=>s.status==='PASS')&&e.logs.every(l=>l.rpc.ok));
 report.conclusion=complete&&report.anchor.check.same?'PASS':'INCONCLUSIVE';
 if(!complete)report.warnings.push('Incomplete ABI reads, bytecode, or log corroboration. Do not infer zeros for failed calls.');
 if(!report.anchor.check.same)report.warnings.push('Anchor hash not reconfirmed.');
}
function write(){
 fs.mkdirSync(outDir,{recursive:true});
 const json=(x)=>JSON.stringify(x,null,2)+'\n';
 fs.writeFileSync(path.join(outDir,'audit.json'),json(report));
 const lines=['# GFLO Sepolia Legacy PIE read-only audit','', 'Result: **'+report.conclusion+'**','Commit: '+report.commit,'Chain ID: '+(report.anchor?.chainId||'UNVERIFIED'),'Block: '+(report.anchor?.number||'UNVERIFIED'),'Block hash: '+(report.anchor?.hash||'UNVERIFIED'),'Endpoint: '+(report.endpoint||'UNAVAILABLE'),'','PASS means consistent readable legacy state, NOT a security audit.','','| Contract | Account | XP | Path | Tier | Status |','|---|---|---:|---:|---:|---|'];
 for(const [c,entry] of Object.entries(report.contracts))for(const [name,state]of Object.entries(entry.subjects)){const n=state.normalized;lines.push('| '+c+' | '+name+' | '+(n.xp??'UNKNOWN')+' | '+(n.path??'UNKNOWN')+' | '+(n.tier??'UNKNOWN')+' | '+state.status+' |');}
 lines.push('','## Uncertainties',...report.warnings.map(w=>'- '+w),'','All raw responses, ABI call selectors, read errors, event logs, bytecode fingerprints and anchor confirmation are in audit.json.','');
 fs.writeFileSync(path.join(outDir,'audit.md'),lines.join('\n'));
 const digest=['audit.json','audit.md'].map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(outDir,f))).digest('hex')+'  '+f).join('\n')+'\n';
 fs.writeFileSync(path.join(outDir,'sha256.txt'),digest);
 console.log('GFLO_LEGACY_AUDIT='+report.conclusion);
 console.log('ANCHOR='+JSON.stringify(report.anchor));
 for(const [c,entry]of Object.entries(report.contracts))for(const [name,state]of Object.entries(entry.subjects))console.log(c+'/'+name+': '+state.status+' '+JSON.stringify(state.normalized));
}
(async()=>{try{await audit()}catch(e){report.warnings.push('Unexpected error: '+safeError(e));}finally{write()}if(report.conclusion!=='PASS')process.exitCode=2})();
