import { microtaskQueue } from "./eventloop";

type PossibleStates = "Pending" | "Fulfilled" | "Rejected";
let instanceId = 0;

// Loose structural check for "does this look like a promise/thenable" —
// deliberately duck-typed (checks for a callable .then) rather than an
// `instanceof OwnPromise` check, because real Promise.resolve() adopts
// ANY thenable, not just its own class's instances.
function isThenable(value: unknown): value is { then: Function } {
  return (
    (typeof value === "object" || typeof value === "function") &&
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
  private locked = false;

  constructor(
    executor: (
      res: (val: unknown) => void,
      rej: (reason: unknown) => void,
    ) => void,
  ) {
    const boundResolve = this.resolve.bind(this);
    const boundReject = this.reject.bind(this);
    instanceId++;
    this.instance = instanceId;
    try {
      executor(boundResolve, boundReject);
    } catch (err) {
      boundReject(err);
    }
  }
  private resolveProcedure(value: unknown) {
    if (value === this) {
      this.settleRejected(new TypeError("Chaining cycle detected for promise"));
      return;
    }
    if (isThenable(value)) {
      microtaskQueue.enqueue(() => {
        // The thenable may call its callbacks more than once; only the
        // first call counts.
        let called = false;
        try {
          value.then(
            (innerValue: unknown) => {
              if (called) return;
              called = true;
              this.resolveProcedure(innerValue);
            },
            (innerReason: unknown) => {
              if (called) return;
              called = true;
              this.settleRejected(innerReason);
            },
          );
        } catch (err) {
          // If then() throws before calling either callback, reject.
          // If it already called one, the throw is ignored.
          if (!called) {
            called = true;
            this.settleRejected(err);
          }
        }
      });
      return;
    }
    this.value = value;
    this.state = "Fulfilled";
    this.settleReactions();
  }

  resolve(value: unknown) {
    if (this.locked || this.state != "Pending") return;
    this.locked = true;
    this.resolveProcedure(value);
  }

  reject(reason: unknown) {
    if (this.locked || this.state != "Pending") return;
    this.locked = true;
    this.settleRejected(reason);
  }

  private settleRejected(reason: unknown) {
    this.reason = reason;
    this.state = "Rejected";
    this.settleReactions();
  }
  settleReactions(): void {
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
      if (typeof callbackFn !== "function") {
        if (isRejectionPath) settleNextRejected(valueOrReason);
        else settleNextFulfilled(valueOrReason);
        return;
      }
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
