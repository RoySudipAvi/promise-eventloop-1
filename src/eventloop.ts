type Task = () => void;

class MicrotaskQueue {
  private tasks = [];

  getTask(index: number) {
    return this.tasks[index];
  }

  enqueue(task: Task): void {
    this.tasks.push(task);
  }

  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  size(): number {
    return this.tasks.length;
  }

  dequeue(): Task | undefined {
    const entry = this.tasks.shift();
    if (!entry) return undefined;

    return entry;
  }

  reset(): void {
    this.tasks = [];
  }
}

interface ScheduledMacrotask {
  task: Task;
  effectiveTime: number; // scheduledAt + delay, in virtual time units
  insertionOrder: number; // tiebreaker for equal effectiveTime
}

class MacrotaskQueue {
  private tasks: ScheduledMacrotask[] = [];
  private insertionCounter = 0;
  // Virtual clock: advances to match whatever task we just dequeued,
  // so "now" always reflects the most recently run macrotask's time.
  private currentTime = 0;

  // delay defaults to 0, same as setTimeout's default.
  enqueue(task: Task, delay = 0): void {
    const effectiveTime = this.currentTime + Math.max(0, delay);
    console.log(`effective time: ${effectiveTime}`);
    this.tasks.push({
      task,
      effectiveTime,
      insertionOrder: this.insertionCounter++,
    });
  }

  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  size(): number {
    return this.tasks.length;
  }

  // Finds and removes the task with the soonest effectiveTime;
  // ties broken by insertion order (earlier-queued task runs first).
  dequeue(): Task | undefined {
    if (this.tasks.length === 0) return undefined;

    let bestIndex = 0;

    for (let i = 1; i < this.tasks.length; i++) {
      const candidate = this.tasks[i];
      const best = this.tasks[bestIndex];
      const isSooner = candidate.effectiveTime < best.effectiveTime;
      const isTiedButEarlier =
        candidate.effectiveTime === best.effectiveTime &&
        candidate.insertionOrder < best.insertionOrder;
      if (isSooner || isTiedButEarlier) {
        bestIndex = i;
      }
    }

    const [chosen] = this.tasks.splice(bestIndex, 1);
    this.currentTime = chosen.effectiveTime;

    return chosen.task;
  }

  reset(): void {
    this.tasks = [];
    this.insertionCounter = 0;
    this.currentTime = 0;
  }
}

export const microtaskQueue = new MicrotaskQueue();
export const macrotaskQueue = new MacrotaskQueue();

export function resetEventLoop(): void {
  microtaskQueue.reset();
  macrotaskQueue.reset();
}

export function runtimeSetTimeout(callback: () => void, delay = 0): void {
  macrotaskQueue.enqueue(callback, delay);
}

// Runs a single task, catching errors so one bad callback doesn't take down
// the whole loop (matters once this is driving a live visualizer).
function runTask(task: Task): void {
  try {
    task();
  } catch (err) {
    console.error("Uncaught error in queued task:", err);
  }
}

// Drains the microtask queue completely — including any microtasks enqueued
// as a side effect of running one (chained .then() calls). Must re-check
// isEmpty() each iteration rather than snapshotting the length upfront.
export function drainMicrotasks(): void {
  while (!microtaskQueue.isEmpty()) {
    const task = microtaskQueue.dequeue();
    console.log(`task: ${task}`);
    if (task) runTask(task);
  }
}

// Runs exactly one macrotask (the soonest by effective time), if any exist.
// Does NOT drain microtasks afterward — that's the caller's (runEventLoop's)
// responsibility, to keep this function doing exactly one thing.
export function runOneMacrotask(): void {
  const task = macrotaskQueue.dequeue();

  if (task) runTask(task);
}

// The actual event loop driver. Call after the initial synchronous script
// has finished running. Order: drain microtasks -> one macrotask -> drain
// microtasks -> next macrotask -> ... until both queues are empty.
export function runEventLoop(): void {
  drainMicrotasks();

  while (!macrotaskQueue.isEmpty()) {
    runOneMacrotask();
    drainMicrotasks();
  }
}
