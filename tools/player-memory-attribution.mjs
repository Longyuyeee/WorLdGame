import assert from 'node:assert/strict';

/** Diagnostic-only dump: never part of natural-GC acceptance samples. No raw trace is saved. */
export async function memoryAttribution(client){
  let timer;
  let complete;
  const stream=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('Memory trace did not complete')),30000);
    complete=({data})=>{const message=JSON.parse(String(data));if(message.method==='Tracing.tracingComplete')resolve(message.params.stream);};
    client.socket.addEventListener('message',complete);
  });
  // The stream may time out while another CDP request is still pending.
  void stream.catch(()=>{});
  let started=false,handle;
  try{
    await client.send('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{includedCategories:['disabled-by-default-memory-infra'],memoryDumpConfig:{allowed_dump_modes:['detailed'],triggers:[]}}});started=true;
    const dump=await client.send('Tracing.requestMemoryDump',{deterministic:false,levelOfDetail:'detailed'});
    assert.equal(dump.success,true,'Chromium memory dump failed');
    await client.send('Tracing.end');started=false;
    handle=await stream;assert.ok(handle);
    let contents='';
    for(;;){const part=await client.send('IO.read',{handle,size:1024*1024});contents+=part.base64Encoded?Buffer.from(part.data,'base64').toString('utf8'):part.data;assert.ok(contents.length<64*1024*1024,'Memory trace exceeded diagnostic limit');if(part.eof)break;}
    return summarizeMemoryTrace(JSON.parse(contents),dump.dumpGuid);
  }finally{
    clearTimeout(timer);client.socket.removeEventListener('message',complete);
    if(started)await client.send('Tracing.end').catch(()=>{});
    if(handle)await client.send('IO.close',{handle}).catch(()=>{});
  }
}
export function summarizeMemoryTrace(trace,dumpGuid){
  const guid=value=>{const text=String(value).replace(/^0x/i,'');return /^[a-f\d]+$/i.test(text)?BigInt(`0x${text}`).toString(16):null;};
  assert.ok(guid(dumpGuid),'Invalid dump GUID');
  const eventGuid=event=>guid(event.id??event.id2?.global??event.id2?.local);
  const candidates=trace.traceEvents.filter(event=>event.ph==='v'&&Object.keys(event.args?.dumps?.allocators??{}).length>0);
  let events=candidates.filter(event=>eventGuid(event)===guid(dumpGuid)),idCorrelation='request-guid';
  // Perfetto's JSON exporter may remap the request GUID to a trace-local ID (e.g. 0).
  // Each trace here has exactly one explicit request and no periodic triggers.
  if(!events.length&&candidates.length&&new Set(candidates.map(eventGuid)).size===1&&eventGuid(candidates[0])!==null&&candidates.every(event=>event.args.dumps.level_of_detail==='detailed')){
    events=candidates;idCorrelation='single-detailed-dump-trace-local-id';
  }
  assert.ok(events.length,'No unambiguous detailed allocator dump in trace');
  return {source:'Chromium-memory-infra-detailed-nondeterministic',dumpGuid,traceDumpId:eventGuid(events[0]),idCorrelation,
    limits:'Diagnostic dump may perturb the process; allocator sizes overlap and are not resident-page ownership or unique physical bytes; small internal buckets and raw trace/maps/paths omitted',
    processes:events.map(event=>{
      const allocators=Object.entries(event.args.dumps.allocators).flatMap(([name,value])=>{
      if(!/^(discardable|skia|blink_gc|v8|malloc|partition_alloc|gpu|shared_memory|cc|canvas|web_cache)(\/|$)/.test(name))return [];
      const bytes=Object.fromEntries(Object.entries(value.attrs??{}).filter(([,attr])=>attr.type==='scalar'&&attr.units==='bytes'&&/^[a-f\d]+$/i.test(attr.value)).map(([key,attr])=>[key,parseInt(attr.value,16)]));
      if(!Object.values(bytes).every(Number.isSafeInteger))throw Error('Invalid allocator size');
      return Object.keys(bytes).length?[{name,bytes}]:[];
      });
      // Keep roots, image-cache leaves, and substantial allocations; omit tiny internal buckets.
      const retained=allocators.filter(row=>row.name.split('/').length<=3||row.name.startsWith('cc/image_memory/')||Math.max(row.bytes.size??0,row.bytes.effective_size??0,row.bytes.locked_size??0)>=1024*1024);
      return {pid:event.pid,omittedAllocatorRows:allocators.length-retained.length,allocators:retained};
    })};
}
