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
const outDir=path.resolve(__dirname,'../audit-output');
const report={schema:'gflo-sepolia-pie-legacy-readonly-v2',commit:process.env.GITHUB_SHA||null,startedAt:new Date().toISOString(),network:'Ethereum Sepolia',expectedChainId:11155111,accounts:subjects,attempts:[],endpoint:null,anchor:null,contracts:{},conclusion:'INCONCLUSIVE',warnings:['Event coverage trusts the RPC provider; receipt checks are not a cryptographic proof against omitted whole transactions.','PASS is identity-state corroboration, not contract security or migration authorization.']};

const eventIface=new Interface([
 'event PathChosen(address indexed user,uint8 path)',
 'event XPGained(address indexed user,uint256 amount)',
 'event TierUpgraded(address indexed user,uint8 newTier)',
 'event CommitmentBurned(address indexed user,uint256 amount)'
]);
const hex=n=>'0x'+n.toString(16);
const uint=x=>typeof x==='string'&&/^0x[0-9a-f]+$/i.test(x)&&Number.isSafeInteger(Number(BigInt(x)))?Number(BigInt(x)):null;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const eventSignatures=['PathChosen(address,uint8)','XPGained(address,uint256)','TierUpgraded(address,uint8)','CommitmentBurned(address,uint256)'];
const deploymentTxs={
 PRIMARY_LEGACY:'0x6d9e3176ff02a6bd956f6ec269f5cd3285ed72e66181ea0c11cd48ab701830e9',
 EARLIER_LEGACY:'0x35d54a99dc9ad82bef9c07b7205b638eb08185cd060f7dd677140bad5ce65b10'
};
// A range is complete only if every inclusive subrange succeeded. Failed parents
// remain in attempts; they never count as coverage or as empty event history.
async function collectLogs(request,address,start,end){
 const history={fromBlock:hex(start),toBlock:hex(end),filter:'address only; no topic filter',maxBlocks:9999,attempts:[],coverage:[],raw:[],errors:[],complete:false};
 async function range(lo,hi){
  if(history.attempts.length>=512){history.errors.push('Log request budget exhausted');return;}
  const query={address,fromBlock:hex(lo),toBlock:hex(hi)};
  const response=await request('eth_getLogs',[query]);
  history.attempts.push({query,rpc:response});
  const message=JSON.stringify(response.error||'');
  const split=(!response.ok&&/block range|query.*range|too many.*(results|logs)|response.*size|size.*limit|more than.*(results|logs)|timeout|timed out|abort/i.test(message))||
    (response.ok&&Array.isArray(response.result)&&response.result.length>=1000);
  if(split&&lo<hi){const mid=Math.floor((lo+hi)/2);await range(lo,mid);await range(mid+1,hi);return;}
  if(!response.ok||!Array.isArray(response.result)||split){
   history.errors.push({query,error:response.error||'Invalid or possibly truncated log result'});return;
  }
  history.coverage.push({fromBlock:hex(lo),toBlock:hex(hi),count:response.result.length});
  for(const log of response.result){
   const b=uint(log.blockNumber);
   if(!same(log.address,address)||b===null||b<lo||b>hi){history.errors.push('Out-of-range or wrong-address log');continue;}
   history.raw.push(log);
  }
 }
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start){history.errors.push('Invalid history bounds');return history;}
 for(let lo=start;lo<=end;lo+=9999){
  await range(lo,Math.min(end,lo+9998));
  if(history.errors.length)break;
 }
 let next=start;
 for(const c of history.coverage){if(uint(c.fromBlock)!==next)history.errors.push('Non-contiguous log coverage');next=uint(c.toBlock)+1;}
 history.complete=history.errors.length===0&&next===end+1;
 return history;
}
function decodeHistory(history,address){
 const decoded=[],errors=[],seen=new Set();
 for(const raw of history.raw){
  try{
   if(!same(raw.address,address)||raw.removed!==false||uint(raw.blockNumber)===null||
      uint(raw.transactionIndex)===null||uint(raw.logIndex)===null||
      !/^0x[0-9a-f]{64}$/i.test(raw.blockHash)||!/^0x[0-9a-f]{64}$/i.test(raw.transactionHash))throw Error('Invalid log metadata');
   const key=raw.blockHash.toLowerCase()+':'+raw.logIndex.toLowerCase();
   if(seen.has(key))throw Error('Duplicate log');seen.add(key);
   const parsed=eventIface.parseLog(raw);
   if(!parsed)throw Error('Unknown event signature / ABI mismatch');
   const encoded=eventIface.encodeEventLog(parsed.fragment,parsed.args);
   if(!same(encoded.data,raw.data)||encoded.topics.length!==raw.topics.length||
      encoded.topics.some((t,i)=>!same(t,raw.topics[i])))throw Error('Non-canonical event encoding / ABI mismatch');
   const value=parsed.args[1].toString();
   if(parsed.name==='PathChosen'&&(BigInt(value)<1n||BigInt(value)>3n))throw Error('Unknown Path enum');
   decoded.push({name:parsed.name,user:parsed.args[0],value,blockNumber:raw.blockNumber,
    blockHash:raw.blockHash,transactionHash:raw.transactionHash,transactionIndex:raw.transactionIndex,logIndex:raw.logIndex});
  }catch(e){errors.push({transactionHash:raw.transactionHash,logIndex:raw.logIndex,error:safeError(e)});}
 }
 decoded.sort((a,b)=>uint(a.blockNumber)-uint(b.blockNumber)||uint(a.transactionIndex)-uint(b.transactionIndex)||uint(a.logIndex)-uint(b.logIndex));
 return{decoded,errors,complete:history.complete&&errors.length===0};
}
function replayEvents(events,baseline,view){
 const state={xp:BigInt(baseline.xp),path:baseline.path,tier:baseline.tier},uncertainties=[];
 const counts={PathChosen:0,XPGained:0,TierUpgraded:0,CommitmentBurned:0};
 for(const e of events){
  counts[e.name]++;
  if(e.name==='XPGained')state.xp+=BigInt(e.value);
  if(e.name==='PathChosen'){
   const p=Number(e.value);
   if(p===1){
    if(state.path!==0||state.xp!==0n)uncertainties.push('PathChosen after pre-existing identity/XP; reset semantics not proven');
    state.tier=0;
   }else{
    const tierEvent=events.some(t=>t.name==='TierUpgraded'&&same(t.transactionHash,e.transactionHash)&&Number(t.value)===p-1);
    if(!tierEvent)uncertainties.push('Path upgrade without matching TierUpgraded; do not infer tier');
   }
   state.path=p;
  }
  if(e.name==='TierUpgraded')state.tier=Number(e.value);
 }
 const derived={xp:state.xp.toString(),path:state.path,tier:state.tier};
 const mismatches=['xp','path','tier'].filter(k=>derived[k]!==view[k]);
 return{baseline,derived,view,counts,uncertainties,mismatches,status:uncertainties.length?'INCONCLUSIVE':mismatches.length?'FAIL':'PASS'};
}

async function selectHistoryProvider(current,name,contract,entry,block,evidence){
 const candidates=[...new Set([current,...endpoints,'https://sepolia.gateway.tenderly.co','https://ethereum-sepolia.public.blastapi.io'])];
 evidence.providerSelection=[];
 for(const endpoint of candidates){
  const probe={endpoint,ok:false};evidence.providerSelection.push(probe);
  probe.chain=await rpc(endpoint,'eth_chainId',[]);
  if(!probe.chain.ok||uint(probe.chain.result)!==11155111){probe.reason='Unverified Sepolia chain ID';continue;}
  probe.anchor=await rpc(endpoint,'eth_getBlockByNumber',[block,false]);
  if(!probe.anchor.ok||!same(probe.anchor.result?.hash,report.anchor.hash)){probe.reason='Audit anchor unavailable or differs';continue;}
  probe.codeBefore=await rpc(endpoint,'eth_getCode',[contract.address,hex(contract.start-1)]);
  const at=await rpc(endpoint,'eth_getCode',[contract.address,hex(contract.start)]);
  probe.codeAt=at.ok?{ok:true,bytes:(at.result.length-2)/2,hash:keccak256(at.result)}:at;
  if(!probe.codeBefore.ok||probe.codeBefore.result!=='0x'||!at.ok||at.result==='0x'||probe.codeAt.hash!==entry.code.hash){
   probe.reason='Historical deployment boundary/code unavailable or differs';continue;
  }
  probe.baselines={};
  for(const [who,address] of Object.entries(subjects)){
   const r=await rpc(endpoint,'eth_call',[{to:contract.address,data:iface.encodeFunctionData('identities',[address])},hex(contract.start)]);
   probe.baselines[who]={rpc:r,ok:false};
   try{if(r.ok){probe.baselines[who].decoded=decode('identities',r.result);probe.baselines[who].ok=true;}}catch(e){probe.baselines[who].error=safeError(e);}
  }
  if(Object.values(probe.baselines).some(b=>!b.ok)){probe.reason='Historical identity baseline unavailable';continue;}
  probe.creation=await rpc(endpoint,'eth_getTransactionReceipt',[deploymentTxs[name]]);
  if(!probe.creation.ok||!same(probe.creation.result?.contractAddress,contract.address)||probe.creation.result?.status!=='0x1'){
   probe.reason='Deployment receipt unavailable';continue;
  }
  const history=await collectLogs((method,params)=>rpc(endpoint,method,params),contract.address,contract.start,uint(block));
  if(!history.complete){probe.reason='Incomplete event history';probe.history=history;continue;}
  probe.ok=true;evidence.history=history;evidence.endpoint=endpoint;return endpoint;
 }
 evidence.errors.push('No verified RPC provides the complete historical state, deployment receipt and log range');
 return null;
}

async function corroborate(url,name,contract,entry,block){
 const evidence={status:'INCONCLUSIVE',errors:[],abi:[],deployment:null,history:null,decoded:null,receiptChecks:[],subjects:{}};
 entry.corroboration=evidence;
 const historyEndpoint=await selectHistoryProvider(url,name,contract,entry,block,evidence);
 if(!historyEndpoint){entry.auditStatus='INCONCLUSIVE';return;}
 const request=(method,params)=>rpc(historyEndpoint,method,params);
 // Both legacy artifact ABIs must agree on signature AND indexed layout.
 for(const folder of ['compiled2','compiled3']){
  const file=path.resolve(__dirname,'../../'+folder+'/contracts_PIECore_sol_PIECore.abi');
  try{
   const abi=JSON.parse(fs.readFileSync(file,'utf8')),expected=new Interface(abi);
   for(const sig of eventSignatures){
    const f=expected.getEvent(sig);
    if(!f||f.anonymous||f.inputs.length!==2||!f.inputs[0].indexed||f.inputs[1].indexed||
       f.topicHash!==id(sig))throw Error('Event ABI disagreement: '+sig);
   }
   evidence.abi.push({file:folder+'/contracts_PIECore_sol_PIECore.abi',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),ok:true});
  }catch(e){evidence.errors.push('Legacy ABI validation: '+safeError(e));}
 }
 const before=await request('eth_getCode',[contract.address,hex(contract.start-1)]);
 const at=await request('eth_getCode',[contract.address,hex(contract.start)]);
 const receipt=await request('eth_getTransactionReceipt',[deploymentTxs[name]]);
 const deploymentBlock=await request('eth_getBlockByNumber',[hex(contract.start),false]);
 evidence.deployment={transactionHash:deploymentTxs[name],codeBefore:before,codeAt:at,receipt,block:deploymentBlock};
 if(!before.ok||before.result!=='0x'||!at.ok||at.result==='0x'||
    !receipt.ok||receipt.result?.status!=='0x1'||!same(receipt.result?.contractAddress,contract.address)||
    !same(receipt.result?.from,deployer)||uint(receipt.result?.blockNumber)!==contract.start||
    !deploymentBlock.ok||!same(deploymentBlock.result?.hash,receipt.result?.blockHash)||
    !entry.code.ok||!at.ok||keccak256(at.result)!==entry.code.hash){
  evidence.errors.push('Deployment boundary, creator, block or bytecode continuity not verified');
 }
 const baselines={};
 for(const [who,address] of Object.entries(subjects)){
  const call=await request('eth_call',[{to:contract.address,data:iface.encodeFunctionData('identities',[address])},hex(contract.start)]);
  const rec={rpc:call};
  try{if(!call.ok)throw Error(JSON.stringify(call.error));rec.decoded=decode('identities',call.result);baselines[who]=rec.decoded;}
  catch(e){rec.error=safeError(e);evidence.errors.push('Deployment-block baseline unavailable for '+who);}
  evidence.subjects[who]={baseline:rec,status:'INCONCLUSIVE'};
 }
 const history=evidence.history;
 const decoded=decodeHistory(history,contract.address);evidence.decoded=decoded;
 // Check every returned event against the canonical block and full receipt.
 // Also detect missing sibling events in each observed transaction receipt.
 const byTx=new Map();
 for(const log of history.raw)byTx.set(log.transactionHash,log);
 for(const [tx,log] of byTx){
  const r=await request('eth_getTransactionReceipt',[tx]);
  const b=await request('eth_getBlockByNumber',[log.blockNumber,false]);
  const expected=history.raw.filter(x=>same(x.transactionHash,tx));
  const actual=Array.isArray(r.result?.logs)?r.result.logs.filter(x=>same(x.address,contract.address)):[];
  const compact=x=>JSON.stringify([x.address?.toLowerCase(),x.blockHash?.toLowerCase(),x.blockNumber,x.transactionHash?.toLowerCase(),x.transactionIndex,x.logIndex,x.topics?.map(t=>t.toLowerCase()),x.data?.toLowerCase()]);
  const ok=r.ok&&r.result?.status==='0x1'&&b.ok&&same(b.result?.hash,log.blockHash)&&
   same(r.result?.blockHash,log.blockHash)&&same(r.result?.transactionHash,tx)&&
   uint(r.result?.blockNumber)===uint(log.blockNumber)&&actual.length===expected.length&&
   actual.every(x=>expected.some(y=>compact(x)===compact(y)));
  evidence.receiptChecks.push({transactionHash:tx,rpc:r,block:b,ok});
  if(!ok)evidence.errors.push('Log/receipt/canonical-block disagreement: '+tx);
 }
 const complete=history.complete&&decoded.complete&&evidence.errors.length===0;
 for(const [who,address] of Object.entries(subjects)){
  const s=evidence.subjects[who],view=entry.subjects[who];
  s.events=decoded.decoded.filter(e=>same(e.user,address));
  // The baseline is the END of the deployment block, so deployment-block
  // events are retained as evidence but must not be applied a second time.
  s.replayFromBlock=hex(contract.start+1);
  if(!complete||!baselines[who]||view.status!=='PASS'){s.reason='Incomplete history, ABI, deployment, receipt or view evidence';continue;}
  s.comparison=replayEvents(s.events.filter(e=>uint(e.blockNumber)>contract.start),baselines[who],view.normalized);
  s.status=s.comparison.status;
 }
 const statuses=Object.values(evidence.subjects).map(s=>s.status);
 evidence.status=complete?(statuses.includes('FAIL')?'FAIL':statuses.every(s=>s==='PASS')?'PASS':'INCONCLUSIVE'):'INCONCLUSIVE';
 entry.auditStatus=evidence.status;
 console.log('EVENT_CORROBORATION '+name+' '+evidence.status+' chunks='+history.coverage.length+' logs='+history.raw.length);
}
async function selfTest(){
 const assert=require('node:assert/strict');
 const addr=contracts.PRIMARY_LEGACY.address,tx='0x'+'11'.repeat(32),bh='0x'+'22'.repeat(32);
 const ev=(name,value,index=0)=>{const x=eventIface.encodeEventLog(eventIface.getEvent(name),[user,value]);return{...x,address:addr,removed:false,blockNumber:'0x2',transactionIndex:'0x0',logIndex:hex(index),transactionHash:tx,blockHash:bh};};
 const zero={xp:'0',path:0,tier:0};
 const logs=[ev('PathChosen',1),ev('XPGained',15000,1)];
 const h={raw:logs,complete:true};
 const d=decodeHistory(h,addr);assert.equal(d.complete,true);
 assert.equal(replayEvents(d.decoded,zero,{xp:'15000',path:1,tier:0}).status,'PASS');
 assert.equal(replayEvents(d.decoded,zero,zero).status,'FAIL');
 assert.equal(decodeHistory({raw:[logs[0],logs[0]],complete:true},addr).complete,false);
 assert.equal(decodeHistory({raw:[{...logs[0],data:'0x'}],complete:true},addr).complete,false);
 assert.equal(decodeHistory({raw:[{...logs[0],topics:['0x'+'ff'.repeat(32)]}],complete:true},addr).complete,false);
 assert.equal(decodeHistory({raw:logs,complete:false},addr).complete,false);
 assert.equal(replayEvents([{name:'PathChosen',value:'2',transactionHash:tx}],zero,zero).status,'INCONCLUSIVE');
 let calls=0;
 const split=await collectLogs(async(method,[q])=>{calls++;assert.equal(method,'eth_getLogs');return uint(q.toBlock)-uint(q.fromBlock)>1?{ok:false,error:{code:-32701,message:'exceed maximum block range: 2'}}:{ok:true,result:[]};},addr,0,5);
 assert.equal(split.complete,true);assert.equal(split.coverage.reduce((n,c)=>n+uint(c.toBlock)-uint(c.fromBlock)+1,0),6);assert.ok(calls>1);
 const failed=await collectLogs(async()=>({ok:false,error:{code:-1,message:'history unavailable'}}),addr,0,5);
 assert.equal(failed.complete,false);
 const invalid=await collectLogs(async()=>({ok:true,result:[{address:addr,blockNumber:'0x9'}]}),addr,0,5);
 assert.equal(invalid.complete,false);
 const cap=await collectLogs(async()=>({ok:true,result:Array(1000).fill(logs[0])}),addr,2,2);
 assert.equal(cap.complete,false);
 const exact=await collectLogs(async()=>({ok:true,result:[]}),addr,0,19998);
 assert.deepEqual(exact.coverage.map(c=>[uint(c.fromBlock),uint(c.toBlock)]),[[0,9998],[9999,19997],[19998,19998]]);
 assert.equal(exact.complete,true);
 assert.equal(replayEvents([],zero,zero).status,'PASS');
 console.log('OFFLINE_AUDIT_SELF_TESTS=PASS (14 cases; no RPC)');
}

let seq=0;
const safeError=e=>String(e?.message||e).slice(0,1200);

const endpointLastRequest=new Map();
async function rpc(endpoint,method,params){
 if(!['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_getLogs','eth_getTransactionReceipt'].includes(method))throw Error('Read-only RPC allowlist rejected '+method);
 const retries=[];
 for(let attempt=0;attempt<3;attempt++){
  const pause=Math.max(0,350-(Date.now()-(endpointLastRequest.get(endpoint)||0)));
  if(pause)await new Promise(resolve=>setTimeout(resolve,pause));
  endpointLastRequest.set(endpoint,Date.now());
  const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);
  let answer,retryDelay=null;
  try{
   const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++seq,method,params}),signal:ctl.signal});
   const text=await res.text();let body=null;
   try{body=JSON.parse(text);}catch{}
   const retryAfter=res.headers?.get('retry-after')||null;
   if(body?.error)answer={ok:false,error:body.error,httpStatus:res.status};
   else if(!res.ok)answer={ok:false,error:{kind:'HTTP',status:res.status,body:text.slice(0,1200)},httpStatus:res.status};
   else if(!body||!Object.hasOwn(body,'result'))answer={ok:false,error:'Missing JSON-RPC result',httpStatus:res.status};
   else answer={ok:true,result:body.result};
   if(retryAfter)answer.retryAfter=retryAfter;
   const rateLimited=res.status===429||(!answer.ok&&/rate.?limit|too many requests/i.test(JSON.stringify(answer.error)));
   if(rateLimited){
    const seconds=retryAfter&&/^\d+(\.\d+)?$/.test(retryAfter)?Number(retryAfter):retryAfter?Math.max(0,(Date.parse(retryAfter)-Date.now())/1000):2*(attempt+1);
    if(Number.isFinite(seconds)&&seconds<=30)retryDelay=Math.max(1000,Math.ceil(seconds*1000));
   }
  }catch(e){answer={ok:false,error:safeError(e)}}
  finally{clearTimeout(timeout)}
  if(retryDelay!==null&&attempt<2){
   retries.push(answer);
   await new Promise(resolve=>setTimeout(resolve,retryDelay));
   continue;
  }
  if(retries.length)answer.retryAttempts=retries;
  return answer;
 }
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
 report.anchor={number:block,decimalNumber:uint(block),hash:a.result.hash,mode,chainId:11155111};
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

  }
  await corroborate(url,name,contract,entry,block);
 }
 const verify=await rpc(url,'eth_getBlockByNumber',[block,false]);
 report.anchor.check={ok:verify.ok,hash:verify.result?.hash||null,same:verify.ok&&verify.result?.hash?.toLowerCase()===report.anchor.hash.toLowerCase()};
 const entries=Object.values(report.contracts);
 const complete=mode==='finalized'&&entries.length===2&&entries.every(e=>e.code.ok&&e.code.bytes>0&&Object.values(e.subjects).every(s=>s.status==='PASS')&&e.corroboration?.status==='PASS');
 report.conclusion=complete&&report.anchor.check.same?'PASS':report.anchor.check.same&&entries.some(e=>e.corroboration?.status==='FAIL')?'FAIL':'INCONCLUSIVE';
 report.eventSignatures=eventSignatures.map(signature=>({signature,topic0:id(signature)}));
 if(!complete)report.warnings.push('Incomplete ABI reads, bytecode, or log corroboration. Do not infer zeros for failed calls.');
 if(!report.anchor.check.same)report.warnings.push('Anchor hash not reconfirmed.');
 if(mode!=='finalized')report.warnings.push('Finalized anchor unavailable; latest anchor cannot produce full PASS.');
}
function write(){
 fs.mkdirSync(outDir,{recursive:true});
 const json=(x)=>JSON.stringify(x,null,2)+'\n';
 fs.writeFileSync(path.join(outDir,'audit.json'),json(report));
 const lines=['# GFLO Sepolia Legacy PIE read-only audit','', 'Result: **'+report.conclusion+'**','Commit: '+report.commit,'Chain ID: '+(report.anchor?.chainId||'UNVERIFIED'),'Block: '+(report.anchor?.number||'UNVERIFIED'),'Block hash: '+(report.anchor?.hash||'UNVERIFIED'),'Endpoint: '+(report.endpoint||'UNAVAILABLE'),'','PASS means consistent readable legacy state, NOT a security audit.','','| Contract | Account | XP | Path | Tier | Status |','|---|---|---:|---:|---:|---|'];
 for(const [c,entry] of Object.entries(report.contracts))for(const [name,state]of Object.entries(entry.subjects)){const n=state.normalized;lines.push('| '+c+' | '+name+' | '+(n.xp??'UNKNOWN')+' | '+(n.path??'UNKNOWN')+' | '+(n.tier??'UNKNOWN')+' | '+state.status+' |');}
 for(const [name,e] of Object.entries(report.contracts)){
  lines.push('', '## '+name+' event corroboration: '+e.corroboration?.status);
  for(const [who,s] of Object.entries(e.corroboration?.subjects||{}))lines.push(who+': '+s.status+'; events='+JSON.stringify(s.comparison?.counts||{})+'; derived='+JSON.stringify(s.comparison?.derived||null));
 }
 lines.push('','## Uncertainties',...report.warnings.map(w=>'- '+w),'','All raw responses, ABI call selectors, read errors, event logs, bytecode fingerprints and anchor confirmation are in audit.json.','');
 fs.writeFileSync(path.join(outDir,'audit.md'),lines.join('\n'));
 const digest=['audit.json','audit.md'].map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(outDir,f))).digest('hex')+'  '+f).join('\n')+'\n';
 fs.writeFileSync(path.join(outDir,'sha256.txt'),digest);
 console.log('GFLO_LEGACY_AUDIT='+report.conclusion);
 console.log('ANCHOR='+JSON.stringify(report.anchor));
 for(const [c,entry]of Object.entries(report.contracts))for(const [name,state]of Object.entries(entry.subjects))console.log(c+'/'+name+': '+state.status+' '+JSON.stringify(state.normalized));
}
if(require.main===module)(async()=>{try{await selfTest();if(process.argv.includes('--self-test'))return;await audit()}catch(e){report.warnings.push('Unexpected error: '+safeError(e));}finally{if(!process.argv.includes('--self-test'))write()}if(report.conclusion!=='PASS')process.exitCode=2})();
module.exports={collectLogs,decodeHistory,replayEvents,selfTest};
