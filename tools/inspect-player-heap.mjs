import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Offline inspection only: snapshots may contain story/save data; keep raw files local.
const snapshot=JSON.parse(await readFile(process.argv[2],'utf8'));
const {nodes,edges,strings}=snapshot,meta=snapshot.snapshot.meta;
const nf=meta.node_fields.length,ef=meta.edge_fields.length;
const nt=meta.node_fields.indexOf('type'),nn=meta.node_fields.indexOf('name'),ne=meta.node_fields.indexOf('edge_count'),nd=meta.node_fields.indexOf('detachedness');
const et=meta.edge_fields.indexOf('type'),en=meta.edge_fields.indexOf('name_or_index'),to=meta.edge_fields.indexOf('to_node');
assert.ok([nt,nn,ne,nd,et,en,to].every(index=>index>=0),'Unsupported heap snapshot schema');
assert.equal(nodes.length%nf,0);assert.equal(edges.length%ef,0);
const count=nodes.length/nf,starts=new Uint32Array(count+1),parents=new Int32Array(count).fill(-1),via=new Int32Array(count).fill(-1);
let cursor=0;const nativeCounts={};
for(let i=0;i<count;i++){
  starts[i]=cursor;cursor+=nodes[i*nf+ne]*ef;
  if(meta.node_types[nt][nodes[i*nf+nt]]==='native'){
    const key=`${strings[nodes[i*nf+nn]]} detached=${nd<0?'?':nodes[i*nf+nd]}`;
    nativeCounts[key]=(nativeCounts[key]??0)+1;
  }
}starts[count]=cursor;
const queue=[0];parents[0]=0;
for(let head=0;head<queue.length;head++){
  const index=queue[head];
  for(let edge=starts[index];edge<starts[index+1];edge+=ef){
    if(meta.edge_types[et][edges[edge+et]]==='weak')continue;
    const target=edges[edge+to]/nf;
    if(parents[target]!==-1)continue;
    parents[target]=index;via[target]=edge;queue.push(target);
  }
}
const describe=index=>`${index}:${meta.node_types[nt][nodes[index*nf+nt]]}:${strings[nodes[index*nf+nn]]}`;
const paths=[];
for(let i=0;i<count&&paths.length<3;i++){
  const name=strings[nodes[i*nf+nn]];
  if(meta.node_types[nt][nodes[i*nf+nt]]!=='native'||!(nd>=0&&nodes[i*nf+nd]===2)||!/HTML|<|Text/.test(name))continue;
  const path=[];let at=i;
  while(at!==0&&parents[at]>=0&&path.length<35){
    const edge=via[at],type=meta.edge_types[et][edges[edge+et]];
    path.push({node:describe(at),edge:['element','hidden'].includes(type)?edges[edge+en]:strings[edges[edge+en]],edgeType:type});at=parents[at];
  }
  paths.push(path.reverse());
}
const sum=pattern=>Object.entries(nativeCounts).filter(([name])=>pattern.test(name)).reduce((total,[,n])=>total+n,0);
const totals={cssAnimations:sum(/^CSSAnimation /),detachedDialogueButtons:sum(/^<button class="player-dialogue .* detached=2$/),detachedDialogueTextNodes:sum(/^<span class="player-dialogue__text .* detached=2$/),detachedIndicators:sum(/^<i aria-hidden="true"> detached=2$/)};
const result=JSON.stringify({totals,nativeCounts:Object.entries(nativeCounts).sort((a,b)=>b[1]-a[1]).slice(0,50),paths},null,2)+'\n';
if(process.argv[3])await writeFile(process.argv[3],result);else console.log(result);
