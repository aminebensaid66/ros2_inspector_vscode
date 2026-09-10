'use strict';

class RefreshCoordinator {
  constructor() { this.generation = 0; this.controller = null; }
  begin() {
    this.cancel('superseded');
    this.generation += 1;
    this.controller = new AbortController();
    return { generation: this.generation, controller: this.controller, signal: this.controller.signal };
  }
  isCurrent(generation) { return generation === this.generation && !this.controller?.signal.aborted; }
  cancel(reason = 'cancelled') {
    if (this.controller && !this.controller.signal.aborted) this.controller.abort(reason);
  }
  dispose() { this.cancel('disposed'); this.controller = null; }
}

module.exports = { RefreshCoordinator };
