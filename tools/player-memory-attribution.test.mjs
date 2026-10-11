import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMemoryTrace} from './player-memory-attribution.mjs';
test('allocator diagnostic selects the requested dump and strips raw maps and unrelated payloads',()=>{
  const trace={traceEvents:[{ph:'v',id2:{global:'0x00a1'},pid:1,args:{dumps:{process_mmaps:{privatePath:'not exported'},allocators:{
    'discardable':{attrs:{size:{type:'scalar',units:'bytes',value:'1000'},label:{type:'string',value:'not exported'}}},
    'unrelated/path':{attrs:{size:{type:'scalar',units:'bytes',value:'1000'}}}
  }}}},{ph:'v',id:'0xa2',pid:2,args:{dumps:{allocators:{}}}}]};
  const result=summarizeMemoryTrace(trace,'a1');
  assert.deepEqual(result.processes,[{pid:1,omittedAllocatorRows:0,allocators:[{name:'discardable',bytes:{size:4096}}]}]);
  assert.doesNotMatch(JSON.stringify(result),/not exported|privatePath|unrelated/);
  assert.throws(()=>summarizeMemoryTrace(trace,'ff'));
});
test('allocator diagnostic rejects unsafe sizes instead of rounding',()=>{
  assert.throws(()=>summarizeMemoryTrace({traceEvents:[{ph:'v',id:'1',pid:1,args:{dumps:{allocators:{malloc:{attrs:{size:{type:'scalar',units:'bytes',value:'ffffffffffffffff'}}}}}}}]},'1'));
});
test('single detailed dump may use a trace-local ID; ambiguous remapping is rejected',()=>{
  const event={ph:'v',id:'0x0',pid:1,args:{dumps:{level_of_detail:'detailed',allocators:{skia:{attrs:{size:{type:'scalar',units:'bytes',value:'1000'}}}}}}};
  assert.equal(summarizeMemoryTrace({traceEvents:[event]},'0x1').idCorrelation,'single-detailed-dump-trace-local-id');
  assert.throws(()=>summarizeMemoryTrace({traceEvents:[event,{...event,id:'0x2'}]},'0x1'));
  event.args.dumps.level_of_detail='background';assert.throws(()=>summarizeMemoryTrace({traceEvents:[event]},'0x1'));
});
test('compact attribution preserves image-cache leaves but omits tiny internal buckets',()=>{
  const bytes=size=>({attrs:{size:{type:'scalar',units:'bytes',value:size}}});
  const result=summarizeMemoryTrace({traceEvents:[{ph:'v',id:'1',pid:1,args:{dumps:{allocators:{
    'malloc/partitions/allocator/bucket/tiny':bytes('10'),
    'cc/image_memory/cache/at_raster/image':bytes('0'),
    'malloc/partitions/allocator/bucket/large':bytes('100000')
  }}}}]},'1');
  assert.equal(result.processes[0].omittedAllocatorRows,1);
  assert.equal(result.processes[0].allocators.length,2);
});
