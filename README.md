# promise-eventloop

A from-scratch rebuild of two things JavaScript normally hides from you: **the event loop** and **the Promise**.

- **Event loop**: a microtask queue, a macrotask (timer) queue with a *virtual clock*, and a driver that applies the real ordering rules.
- **`MyPromise`**: a hand-written `new Promise(...)` / `.then(...)` that schedules its callbacks on *that* event loop instead of the engine's.

Plain TypeScript with no runtime dependencies for the library itself. You drive the loop yourself with `runEventLoop()`, so execution order is easy to observe, test and step through.

---

## Why this exists

"Promises run before `setTimeout`" is usually a rule people memorise. Here you can *see* it: every callback is queued explicitly, nothing runs until you start the loop, and the queues can be inspected between steps.

```
1. Run the synchronous code to the end.
2. Run ALL queued microtasks (promise callbacks), including ones they queue.
3. Run ONE macrotask (the timer that is due soonest).
4. Go back to step 2.
5. Stop when both queues are empty.
```

---

## Features

**`MyPromise`**
- States: `Pending`, `Fulfilled`, `Rejected`; a promise settles only once
- `.then(onFulfilled, onRejected)` returns a new promise, so chaining works
- Missing handlers pass values and rejections through to the next promise
- A throw inside the executor or a callback becomes a rejection
- Thenable adoption: resolving with another promise, or any object or function with a `.then`, makes the promise follow it. Adoption is deferred to a microtask, which is what native Promises do
- Spec guards: once resolved (even while still following another promise), later `resolve`/`reject` calls are ignored, and resolving a promise with itself rejects with a `TypeError`

**Event loop**
- All microtasks drain before the next macrotask, including microtasks queued by other microtasks
- Timers run in virtual-time order, ties broken by registration order; a timer scheduled from inside another timer is relative to that timer's time
- Nothing really waits: a 100 ms timer fires instantly once the loop reaches it
- Steppable: `drainMicrotasks()` and `runOneMacrotask()` are exported separately
- An error thrown inside a raw queued task is caught and logged, so one bad callback doesn't stop the loop

---

## Quick start

```bash
npm install
npm test
```

```ts
import { MyPromise } from "./src/promise";
import { runEventLoop } from "./src/eventloop";

const p = new MyPromise((resolve) => resolve(42));
p.then((value) => console.info("got", value));

console.info("sync code finished");
runEventLoop(); // nothing runs until you start the loop
```

```text
sync code finished
got 42
```

> `.then` and the event loop still print tracing through `console.log`. Silence it with `console.log = () => {};` and print your own output with `console.info`.

### Microtasks vs macrotasks

```ts
import { MyPromise } from "./src/promise";
import { runEventLoop, runtimeSetTimeout } from "./src/eventloop";

runtimeSetTimeout(() => console.info("3: timer (macrotask)"), 0);
new MyPromise((resolve) => resolve(undefined)).then(() =>
  console.info("2: promise callback (microtask)")
);
console.info("1: synchronous code");

runEventLoop();
```

```text
1: synchronous code
2: promise callback (microtask)
3: timer (macrotask)
```

The timer was registered first, but the loop always drains microtasks before taking a macrotask.

### Turning a timer into a promise

```ts
const delay = (ms: number, value: unknown) =>
  new MyPromise((resolve) => runtimeSetTimeout(() => resolve(value), ms));

delay(50, "A")
  .then((a) => {
    console.info("first:", a);
    return delay(20, a + "B"); // returning a promise: the chain waits for it
  })
  .then((ab) => console.info("second:", ab));

runEventLoop();
```

The second step lands at virtual time 50 + 20 = 70, but the run finishes instantly.

---

## API

| Export | From | Purpose |
|---|---|---|
| `MyPromise` | `src/promise.ts` | The promise implementation |
| `runtimeSetTimeout(cb, delay = 0)` | `src/eventloop.ts` | Register a macrotask `delay` virtual time units from now |
| `runEventLoop()` | `src/eventloop.ts` | Drain microtasks, then repeat "one macrotask, drain microtasks" until both queues are empty |
| `drainMicrotasks()` | `src/eventloop.ts` | Run microtasks until the queue is empty |
| `runOneMacrotask()` | `src/eventloop.ts` | Run exactly one macrotask |
| `resetEventLoop()` | `src/eventloop.ts` | Empty both queues and reset the virtual clock (use between tests) |
| `microtaskQueue`, `macrotaskQueue` | `src/eventloop.ts` | The queue singletons, for inspection |

---

## Project structure

```
src/
  eventloop.ts           Microtask queue, macrotask queue + virtual clock, loop driver
  promise.ts             MyPromise: states, resolve/reject, .then, thenable adoption
  functions.ts           Side experiment: `this` / `arguments` in methods vs arrow functions
  tests/
    promise.test.ts      Promise behaviour and ordering against the event loop
    functions.test.ts    Side experiment (logs only)
  App.tsx, main.tsx      Vite + React starter shell (the library is exercised through tests)
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Run the Vitest suite |
| `npm run dev` | Start the Vite dev server |
| `npm run lint` | Run ESLint |
| `npm run build` | `tsc -b && vite build` (see known issues) |

---

## Status and limitations

A learning project, built incrementally.

**Not implemented yet**
- `catch`, `finally`, and the static helpers (`Promise.resolve`, `reject`, `all`, `race`, ...)
- `clearTimeout`, `setInterval`, `queueMicrotask`
- Unhandled-rejection tracking

**Known issues**
- Several parameters have no type annotations, so `tsc -b` (and therefore `npm run build`) can report type errors. Tests are unaffected because Vitest doesn't type-check.
- A native `Promise` is a valid thenable, but it settles on the engine's real microtask queue, which this loop can't see. Call `runEventLoop()` again after the native promise has settled.
- Virtual time only orders tasks; `Date.now()` and `performance.now()` are unaffected.

**Ideas for next steps**: `catch` / `finally`, `Promise.all` and friends, `clearTimeout`, and a live visualizer that steps the loop with `runOneMacrotask` / `drainMicrotasks` and renders both queues between steps.

---

## Tech stack

TypeScript · Vitest · Vite · React 19 (starter shell only) · ESLint
