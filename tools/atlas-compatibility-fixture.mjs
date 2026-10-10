import { zlibSync } from 'fflate';
// Deliberately uncompressed deterministic source fixtures, not production artwork.
export function makeAtlasSource(variant) {
  const chunk=(type,data)=>{const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);Buffer.from(data).copy(b,8);let crc=0xffffffff;for(const value of b.subarray(4,-4)){crc^=value;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}b.writeUInt32BE((crc^0xffffffff)>>>0,b.length-4);return b;};
  const size=256, header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const at=y*(size*4+1)+1+x*4;raw[at]=(x%64)*3;raw[at+1]=(y%64)*3;raw[at+2]=x>=192 && y>=192?variant*70:100;raw[at+3]=255;}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlibSync(raw,{level:0})),chunk('IEND',Buffer.alloc(0))]);
}
