import { hydrateNativeAtlasMediaAsync, type NativeAtlasDelivery } from "../apps/player-shell/src/native-atlas";
import { prepareNativeAtlasMediaAsync } from "../apps/player-shell/src/lazy-atlas-media";

/** Controlled resource preparation only: same payload, alternating policy, no Player/quality canvases. */
export async function measure(media: {assetId:string;url:string}[], groups: NativeAtlasDelivery[], lazy: boolean) {
  const tasks: {start:number;duration:number}[] = [];
  const observer = new PerformanceObserver(list => { for(const task of list.getEntries()) tasks.push({start:task.startTime,duration:task.duration}); });
  observer.observe({type:"longtask",buffered:false});
  const created = new Set<string>(), create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let liveBytes=0,peakBytes=0,nonImageBlobCreations=0;
  const sizes=new Map<string,number>();
  URL.createObjectURL = blob => { const url=create.call(URL,blob); if(!(blob instanceof Blob)||blob.type!=="image/png"){nonImageBlobCreations++;return url;} created.add(url); const size=blob.size;sizes.set(url,size);liveBytes+=size;peakBytes=Math.max(peakBytes,liveBytes);return url; };
  URL.revokeObjectURL = url => { if(created.delete(url)){liveBytes-=sizes.get(url)??0;sizes.delete(url);}revoke.call(URL,url); };
  const start=performance.now();let dispose:(()=>void)|undefined;
  try {
    const session=await (lazy?prepareNativeAtlasMediaAsync:hydrateNativeAtlasMediaAsync)(media,groups);
    dispose=session.dispose;
    const ready=performance.now(),startup={milliseconds:ready-start,urls:created.size,blobBytes:liveBytes};
    const source=session.media.find(asset=>asset.atlas)?.atlas;
    const lease=source?.acquireFallback?await source.acquireFallback():undefined;
    const entered=performance.now(),firstGroup={milliseconds:entered-ready,urls:created.size,blobBytes:liveBytes};
    lease?.release();session.dispose();
    await new Promise(resolve=>setTimeout(resolve,50));
    tasks.push(...observer.takeRecords().map(task=>({start:task.startTime,duration:task.duration})));
    return {lazy,startup,firstGroup,peakBlobBytes:peakBytes,releasedUrls:created.size,releasedBlobBytes:liveBytes,nonImageBlobCreations,longTasks:tasks.filter(task=>task.start>=start&&task.start<entered)};
  } finally {dispose?.();created.forEach(url=>revoke.call(URL,url));URL.createObjectURL=create;URL.revokeObjectURL=revoke;observer.disconnect();}
}

export async function measureReuse(media:{assetId:string;url:string}[],groups:NativeAtlasDelivery[]){
  const session=await prepareNativeAtlasMediaAsync(media,groups);
  const members=groups.map(group=>session.media.find(asset=>asset.atlas?.group===group)!);
  try{
    const anchor=await members[0]!.atlas!.acquireFallback!();
    const first=await members[1]!.atlas!.acquireFallback!();first.release();
    const start=performance.now(),revisit=await members[1]!.atlas!.acquireFallback!();
    const reused=first.url===revisit.url,revisitMilliseconds=performance.now()-start;
    revisit.release();
    const gallery=await Promise.all(members.map(member=>member.atlas!.acquireFallback!()));
    const open=JSON.parse(document.documentElement.dataset.atlasFallback!);
    gallery.forEach(lease=>lease.release());anchor.release();
    const closed=JSON.parse(document.documentElement.dataset.atlasFallback!);
    return {reused,revisitMilliseconds,open,closed};
  }finally{session.dispose();}
}
