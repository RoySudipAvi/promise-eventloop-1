# promise-eventloop — Overview

A small learning project that rebuilds two things JavaScript normally hides from you:

1. **The event loop**: the microtask queue, the macrotask (timer) queue, and the rules for when each one runs.
2. **A Promise**: `MyPromise`, a from-scratch implementation of `new Promise(...)` and `.then(...)` that schedules its callbacks on that event loop instead of the engine's.

Everything is plain TypeScript with no runtime dependencies. You drive the event loop yourself by calling `runEventLoop()`, which makes the order of execution easy to observe, test and step through.

> For internals, flow diagrams, step-by-step traces and usage examples, read the [Developer Guide](./developer-guide.md).

---

## What's in the project

| Path | What it is |
|---|---|
| `src/eventloop.ts` | The simulated event loop: a microtask queue, a macrotask queue with a **virtual clock**, `runtimeSetTimeout`, and `runEventLoop`. |
| `src/promise.ts` | `MyPromise`: states, `resolve`/`reject`, `.then` chaining, thenable adoption. |
| `src/tests/promise.test.ts` | Tests for the promise and its ordering against the event loop (12 test cases). |
| `src/functions.ts`, `src/tests/functions.test.ts` | A side experiment on `this` and `arguments` in normal methods vs arrow functions. Unrelated to the promise. |
| `src/App.tsx`, `src/main.tsx` | The untouched Vite + React starter. The library is exercised through tests, not the UI. |

---

## What works today

- **Promise states**: `Pending`, `Fulfilled`, `Rejected`; a promise settles once.
- **`.then(onFulfilled, onRejected)`** returns a new promise and supports chaining.
- **Value pass-through**: a missing handler forwards the value or the rejection to the next promise.
- **Error handling**: a throw inside the executor or a callback becomes a rejection.
- **Thenable adoption**: resolving with another promise, a plain object with `.then`, or a function with `.then` makes the promise follow it. The extra microtask ticks this costs match native Promises.
- **Guards from the spec**: later `resolve`/`reject` calls are ignored once a promise is resolved (even while it is still following another promise), and resolving a promise with itself rejects with a `TypeError`.
- **Event loop**: all microtasks drain before the next macrotask; timers run in order of virtual time, then registration order; nested timers are relative to the timer that scheduled them.

## What is not there yet

- `catch`, `finally`, and the static helpers (`Promise.resolve`, `reject`, `all`, `race`, ...).
- `clearTimeout`, `setInterval`, `queueMicrotask`.
- Unhandled-rejection tracking.
- Complete TypeScript annotations: the tests run (Vitest does not type-check), but `tsc -b`, and therefore `npm run build`, currently reports type errors.
- Some edge cases are listed in the [known limitations](./developer-guide.md#7-differences-from-native-promise-and-known-limitations).

---

## Quick start

```bash
npm install
npm test          # runs Vitest: 13 tests (12 for the library, 1 side experiment)
```

A first program (save as `examples/hello.ts` and run `npx tsx examples/hello.ts`):

```ts
import { MyPromise } from "../src/promise";
import { runEventLoop } from "../src/eventloop";

console.log = () => {}; // silence the library's tracing; we print with console.info

const p = new MyPromise((resolve) => resolve(42));
p.then((value) => console.info("got", value));

console.info("sync code finished");
runEventLoop(); // nothing runs until you start the loop
```

Output:

```text
sync code finished
got 42
```

Notice the order. The `.then` callback does not run when you register it, and it does not run while your synchronous code is still going. It runs when the event loop gets to it.

> The library prints a lot of tracing through `console.log`. The examples silence it with `console.log = () => {};` and print their own output with `console.info`.

---

## The mental model in five lines

```
1. Run the synchronous code to the end.
2. Run ALL queued microtasks (promise callbacks), including ones they queue.
3. Run ONE macrotask (the timer that is due soonest).
4. Go back to step 2.
5. Stop when both queues are empty.
```

That is exactly what `runEventLoop()` does, and it is why a `setTimeout(..., 0)` registered *first* still runs *after* a promise callback registered later.

---

## Status and direction

This is a learning project, built incrementally. The tests were turned from log-only experiments into assertions, and `MyPromise` was checked against native Promise ordering in scenarios such as chain interleaving, rejection pass-through, thenable adoption and tick counts. A comment in `src/eventloop.ts` points toward driving a live visualizer of the loop, which the explicit, step-able design (`runOneMacrotask`, `drainMicrotasks`) is meant to support.

Next: the [Developer Guide](./developer-guide.md).
