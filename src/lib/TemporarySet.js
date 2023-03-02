export default class extends Set {
  constructor(ttlMs = 1000) {
    super();
    this.ttlMs = ttlMs;
  }

  add(obj) {
    super.add(obj);
    setTimeout(() => super.delete(obj), this.ttlMs);
  }
}
