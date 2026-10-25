import { FIELD } from './fluid.js';
const wrap = value => value - FIELD * Math.round(value / FIELD);

export function buildDanceGroups(particles, seed = 0) {
  const count = particles.length, data = new Float32Array(count * 8), groups = [];
  const remaining = new Set(particles.map((_, id) => id));
  const order = [...remaining].sort((a, b) => particles[b].r - particles[a].r);
  for (const leader of order) {
    if (!remaining.has(leader)) continue;
    const origin = particles[leader], members = [leader];
    remaining.delete(leader);
    const nearby = [...remaining].map(id => {
      const p = particles[id], distance = Math.hypot(wrap(p.x-origin.x),wrap(p.y-origin.y));
      return { id, distance, gap: distance/(p.r+origin.r) };
    }).filter(p => p.distance < 1.35 && p.gap < 1.8).sort((a,b) => a.gap-b.gap);
    for (const candidate of nearby.slice(0,1+leader%3)) { members.push(candidate.id); remaining.delete(candidate.id); }
    const volume = members.reduce((sum,id) => sum + particles[id].r ** 3,0);
    const center = members.reduce((sum,id) => {
      const p = particles[id], weight = p.r ** 3 / volume;
      sum[0] += (origin.x+wrap(p.x-origin.x))*weight;
      sum[1] += (origin.y+wrap(p.y-origin.y))*weight;
      return sum;
    },[0,0]).map(wrap);
    const phase = (origin.phase/(Math.PI*2))%1;
    const period = 6.5+((leader*17+seed)%47)/47*3.5;
    for (const id of members) {
      const p = particles[id];
      data.set([groups.length,leader,phase,period],id*4);
      data.set([wrap(center[0]-p.x),wrap(center[1]-p.y),p.r,volume],count*4+id*4);
    }
    groups.push({ leader, members, center, volume, phase, period });
  }
  return { data, groups };
}

export function danceDiagnostics(state, topology) {
  const count = state.length/16;
  let volume = 0, joinedPairs = 0, mergedGroups = 0, largestRadius = 0;
  for (let id = 0; id < count; id++) {
    const radius = state[id*4+2];
    volume += radius ** 3;
    largestRadius = Math.max(largestRadius,radius);
  }
  const groupSpans = topology.groups.map(group => {
    let span = 0, joins = 0;
    for (let a = 0; a < group.members.length; a++) for (let b = a+1; b < group.members.length; b++) {
      const i = group.members[a]*4, j = group.members[b]*4;
      const distance = Math.hypot(wrap(state[i]-state[j]),wrap(state[i+1]-state[j+1]));
      span = Math.max(span,distance);
      if (distance < .85*(state[i+2]+state[j+2])) joins++;
    }
    joinedPairs += joins;
    if (joins) mergedGroups++;
    return Number(span.toFixed(3));
  });
  const initialVolume = topology.groups.reduce((sum,group) => sum+group.volume,0);
  return { joinedPairs, mergedGroups, largestRadius, volumeError: Math.abs(volume/initialVolume-1), groupSpans };
}
