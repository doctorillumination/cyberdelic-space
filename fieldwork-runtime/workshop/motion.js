export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Exact critically damped motion: stable across frame rates, with no overshoot.
export function spring(position, velocity, target, omega, dt) {
  const offset = position - target;
  const impulse = velocity + omega * offset;
  const decay = Math.exp(-omega * dt);
  return [(offset + impulse * dt) * decay + target,
    (velocity - omega * impulse * dt) * decay];
}

export class LeanMotion {
  constructor({ reduced = false } = {}) {
    this.position = [0, 0]; this.velocity = [0, 0]; this.target = [0, 0];
    this.dragging = false; this.releaseTime = Infinity; this.reduced = reduced;
  }
  begin(x, y, width, height) {
    this.dragging = true; this.releaseTime = Infinity;
    this.origin = [x, y]; this.dimensions = [width, height];
    this.bias = this.position.map(v => Math.atanh(clamp(v, -.998, .998)));
    this.target = [...this.position];
  }
  drag(x, y) {
    if (!this.dragging) return;
    this.target = [
      Math.tanh(this.bias[0] - (x - this.origin[0]) / (this.dimensions[0] * .22)),
      Math.tanh(this.bias[1] + (y - this.origin[1]) / (this.dimensions[1] * .28))
    ];
  }
  end(now) { this.dragging = false; this.releaseTime = now; }
  nudge(x, y, now) {
    this.target = [clamp(this.target[0] + x, -.995, .995), clamp(this.target[1] + y, -.995, .995)];
    this.releaseTime = now;
  }
  reset() { this.target = [0, 0]; this.releaseTime = -Infinity; }
  update(dt, now) {
    const returning = !this.dragging && !this.reduced && now > this.releaseTime + 1200;
    if (returning) this.target = [0, 0];
    const omega = this.dragging ? 16 : returning ? 1.85 : 12;
    for (let axis = 0; axis < 2; axis++) {
      [this.position[axis], this.velocity[axis]] = spring(this.position[axis], this.velocity[axis], this.target[axis], omega, Math.min(dt, .05));
      this.position[axis] = clamp(this.position[axis], -.9999, .9999);
      if (Math.abs(this.position[axis]) < .000025 && Math.abs(this.velocity[axis]) < .000025 && this.target[axis] === 0) {
        this.position[axis] = 0; this.velocity[axis] = 0;
      }
    }
    return this.position;
  }
}

export function captureBlend(x, y, columns=7, rows=5) {
  const gx=(clamp(x,-1,1)+1)*.5*(columns-1),gy=(clamp(y,-1,1)+1)*.5*(rows-1);
  const column=Math.min(columns-2,Math.floor(gx)),row=Math.min(rows-2,Math.floor(gy));
  const fx=gx-column,fy=gy-row,base=row*columns+column;
  return { indices: [base, base + 1, base + columns, base + columns + 1],
    weights: [(1-fx)*(1-fy), fx*(1-fy), (1-fx)*fy, fx*fy] };
}
