import { microtaskQueue } from "./eventloop";

type PossibleStates = "Pending" | "Fulfilled" | "Rejected";
let instanceId = 0;

// Loose structural check for "does this look like a promise/thenable" —
// deliberately duck-typed (checks for a callable .then) rather than an
// `instanceof OwnPromise` check, because real Promise.resolve() adopts
// ANY thenable, not just its own class's instances.
function isThenable(value: unknown): value is { then: Function } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).then === "function"
  );
}

export class MyPromise {
  state: PossibleStates = "Pending";
  value: unknown = undefined;
  reason: unknown = undefined;
  reactions = [];
  instance: number = 0;

  constructor(
    executor: (
      res: (val: unknown) => void,
      rej: (reason: unknown) => void
    ) => void
  ) {
    console.log(`-------------- CONSTRUCTOR START -------------------`);
    const boundResolve = this.resolve.bind(this);
    const boundReject = this.reject.bind(this);
    instanceId++;
    this.instance = instanceId;
    try {
      console.log(
        `instance: ${this.instance}, state: ${this.state}, value: ${this.value}, reason: ${this.reason}`
      );
      executor(boundResolve, boundReject);
      console.log(
        ` state: ${this.state}, value: ${this.value}, reason: ${this.reason}`
      );
    } catch (err) {
      boundReject(err);
    }

    console.log(`-------------- CONSTRUCTOR END -------------------`);
  }

  resolve(value: unknown) {
    console.log(`-------------------- RESOLVE START ------------------------`);

    console.log(
      `instance: ${this.instance}, state: ${this.state}, value: ${this.value}`
    );

    if (this.state != "Pending") return;
    console.log("detailed value", value);
    console.log(`is it thenable: ${isThenable(value)}`);
    // If resolved with a thenable, adopt its eventual state instead of
    // settling immediately with a Promise-shaped value. Nothing calls
    // .then() on `value` here YET (that plumbing lands with the .then()
    // increment) — this branch exists now so resolve() doesn't need to be
    // revisited later, but it currently only guards against treating a
    // thenable as a plain value; full adoption behavior is wired up once
    // .then() exists to subscribe to it.
    if (isThenable(value)) {
      // Placeholder hook: full adoption (subscribing to the inner
      // thenable's eventual state) is completed in the .then() increment.
      // For now we intentionally do not settle, to avoid faking behavior
      // we haven't built yet.
      value.then(
        (innerValue: unknown) => this.resolve(innerValue),
        (innerReason: unknown) => this.reject(innerReason)
      );
      return;
    }

    this.value = value;
    this.state = "Fulfilled";
    this.settleReactions();
    console.log(`-------------------- RESOLVE END ------------------------`);
  }

  reject(reason: unknown) {
    console.log(`-------------------- REJECT START ------------------------`);

    console.log(
      `instance: ${this.instance}, state: ${this.state}, reason: ${this.reason}`
    );

    if (this.state != "Pending") return;

    this.reason = reason;
    this.state = "Rejected";
    this.settleReactions();
    console.log(`-------------------- REJECT END ------------------------`);
  }

  settleReactions(): void {
    console.log(
      `-------------------- SETTLEREACTIONS START ------------------------`
    );

    console.log(
      `instance: ${this.instance}, state: ${this.state}, value:${this.value}, reason: ${this.reason}`
    );
    const state = this.state;
    const settledValue = state === "Fulfilled" ? this.value : this.reason;

    for (const reaction of this.reactions) {
      const callback =
        state === "Fulfilled" ? reaction.onFulfilled : reaction.onRejected;
      if (callback) {
        microtaskQueue.enqueue(() => callback(settledValue));
      }
    }
    this.reactions = [];

    console.log(
      `-------------------- SETTLEREACTIONS END ------------------------`
    );
  }

  then(onFulfilled, onRejected) {
    console.log(`---------------- THEN START --------------------`);

    let settleNextFulfilled!: (value: unknown) => void;
    let settleNextRejected!: (reason: unknown) => void;
    const nextPromiseExec = (res, rej) => {
      settleNextFulfilled = res;
      settleNextRejected = rej;
    };
    const nextPromise = new MyPromise(nextPromiseExec);
    const settleNext = (callbackFn, valueOrReason, isRejectionPath) => {
      try {
        const result = callbackFn(valueOrReason);
        console.log("settled next result: ${}", result);
        settleNextFulfilled(result);
      } catch (err) {
        console.log(`settled next error: ${err}`);
        settleNextRejected(err);
      }
    };
    console.log(`on fulfilled, on rejected : ${onFulfilled}, ${onRejected}`);
    console.log(this);
    if (this.state == "Fulfilled") {
      microtaskQueue.enqueue(() => settleNext(onFulfilled, this.value, false));
    } else if (this.state == "Rejected") {
      microtaskQueue.enqueue(() => settleNext(onRejected, this.reason, true));
    } else {
      this.reactions.push({
        onFulfilled: (value) => {
          settleNext(onFulfilled, value, false);
        },
        onRejected: (reason) => {
          settleNext(onRejected, reason, true);
        },
      });
    }
    console.log(`---------------- THEN END --------------------`);
    return nextPromise;
  }
}
