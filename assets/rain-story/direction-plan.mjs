// Named authoring cues. before is the zero-based original paragraph index.
export const mediaNames = {
  station: '雨夜站台', waiting: '候车室·旧信', train: '夜行列车', studio: '雨后的画室',
  cafe: '雨夜面馆', coast: '雨后的海边街道', neutral: '小夏·手中的信', thoughtful: '小夏·认真倾听', smile: '小夏·安心微笑'
};
export const directions = [
  { name: '车站的雨', background: 'station', portrait: 'neutral', cues: [{ before: 5, portrait: 'thoughtful' }] },
  { name: '候车室的旧信', background: 'waiting', portrait: 'thoughtful', cues: [{ before: 6, portrait: 'neutral' }] },
  { name: '站台前的约定', background: 'station', portrait: 'thoughtful', cues: [{ before: 3, portrait: 'smile' }] },
  { name: '留下', background: 'station', portrait: 'neutral', cues: [{ before: 4, portrait: 'smile', position: 'right' }] },
  { name: '灯下的回信', background: 'cafe', portrait: 'neutral', position: 'right', cues: [{ before: 5, portrait: 'smile', position: 'right' }] },
  { name: '雨后的天明', background: 'studio', hide: true, cues: [{ before: 3, portrait: 'smile', position: 'right' }, { before: 6, background: 'station', portrait: 'neutral' }, { before: 7, portrait: 'smile', position: 'center' }] },
  { name: '远行', background: 'station', portrait: 'neutral', cues: [{ before: 3, background: 'train' }] },
  { name: '车窗与海', background: 'studio', hide: true, cues: [{ before: 4, background: 'coast' }, { before: 5, background: 'studio' }, { before: 9, background: 'station' }] },
  { name: '再一次见面', background: 'station', portrait: 'smile', cues: [{ before: 1, background: 'cafe' }, { before: 6, background: 'station', portrait: 'thoughtful' }, { before: 8, hide: true }, { before: 9, background: 'studio' }] }
];
