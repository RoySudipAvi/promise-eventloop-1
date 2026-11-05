import { describe, expect, it, beforeEach } from "vitest";
import { MyPromise } from "../promise";
import {
  microtaskQueue,
  runEventLoop,
  runtimeSetTimeout,
  macrotaskQueue,
} from "../eventloop";

const randomNumber = () => {
  return Math.floor(Math.random() * 999);
};

describe("Promise Part 1", () => {
  it("Prom test 1: Immediate array update, but the resolve value is not used", () => {
    const items = [];
    const exec = (res, rej) => {
      res(42);
      items.push(33);
    };

    const p1 = new MyPromise(exec);
    items.push(69);
    console.log(items);
  });

  it("Prom test 2: Immediate resolve", () => {
    const items: number[] = [];
    items.push(10);
    const exec = (res: (v: unknown) => void) => {
      res(66);
      items.push(20);
    };
    const p1 = new MyPromise(exec);
    const cb1 = p1.then((fulfil: number) => items.push(fulfil));
    items.push(100);
    items.push(1);

    // Synchronous phase: the .then callback is queued but not run.
    expect(items).toEqual([10, 20, 100, 1]);
    expect(microtaskQueue.size()).toBe(1);
    expect(cb1).toBeInstanceOf(MyPromise);
    expect(cb1.state).toBe("Pending");

    runEventLoop();

    // The callback ran last and appended the resolved value.
    expect(items).toEqual([10, 20, 100, 1, 66]);
    expect(microtaskQueue.isEmpty()).toBe(true);

    // cb1 fulfils with items.push(66), the new length.
    expect(cb1.state).toBe("Fulfilled");
    expect(cb1.value).toBe(5);
  });

  it("Prom test 3: Immediate reject", () => {
    const caught: unknown[] = [];
    const exec = (_res: (v: unknown) => void, rej: (r: unknown) => void) => {
      rej("Failed");
    };
    const p1 = new MyPromise(exec);
    expect(p1.state).toBe("Rejected");
    expect(p1.reason).toBe("Failed");

    const cb1 = p1.then(undefined, (rej: unknown) => {
      caught.push(rej);
      return "BB BB BC";
    });
    // cb1 has no onFulfilled, so when it fulfils the value must pass through.
    const cb2 = cb1.then(undefined, (rej: unknown) => {
      caught.push(`unexpected: ${rej}`);
    });

    runEventLoop();

    expect(caught).toEqual(["Failed"]);

    // Returning from a rejection handler recovers the chain.
    expect(cb1.state).toBe("Fulfilled");
    expect(cb1.value).toBe("BB BB BC");

    // cb2 passes cb1's value through unchanged.
    expect(cb2.state).toBe("Fulfilled");
    expect(cb2.value).toBe("BB BB BC");
  });

  it.each([
    ["fulfil", true],
    ["reject", false],
  ])("Prom test 4: Chaining of then (%s branch)", (_label, shouldFulfil) => {
    const order: string[] = [];
    const successRand: unknown[] = [];
    const exec = (res: (v: unknown) => void, rej: (r: unknown) => void) => {
      if (shouldFulfil) res("succeeded");
      else rej("failed");
    };
    const p1 = new MyPromise(exec);
    const cb1 = p1.then(
      (v: unknown) => {
        order.push("cb1 fulfilled");
        successRand.push(v);
        return v;
      },
      (r: unknown) => {
        order.push("cb1 rejected");
        return r;
      },
    );
    const cb2 = cb1.then((v: unknown) => {
      order.push("cb2 fulfilled");
      return v;
    }, undefined);

    // Nothing runs synchronously.
    expect(order).toEqual([]);

    runEventLoop();

    if (shouldFulfil) {
      expect(order).toEqual(["cb1 fulfilled", "cb2 fulfilled"]);
      expect(successRand).toEqual(["succeeded"]);
      expect(cb1.value).toBe("succeeded");
      expect(cb2.value).toBe("succeeded");
    } else {
      // Returning from a rejection handler recovers: cb1 and cb2 both fulfil.
      expect(order).toEqual(["cb1 rejected", "cb2 fulfilled"]);
      expect(successRand).toEqual([]);
      expect(cb1.value).toBe("failed");
      expect(cb2.value).toBe("failed");
    }
    expect(cb1.state).toBe("Fulfilled");
    expect(cb2.state).toBe("Fulfilled");
  });

  it("Prom test 5: Ordering, microtask vs macrotask", () => {
    const order: string[] = [];

    // Registered FIRST, yet it must run LAST: macrotasks wait for microtasks.
    runtimeSetTimeout(() => order.push("timeout"), 0);

    const p1 = new MyPromise((res: (v: unknown) => void) => res("ok"));
    const cb1 = p1.then((v: unknown) => {
      order.push("cb1");
      return v;
    });
    const cb2 = cb1.then((v: unknown) => {
      order.push("cb2");
      return v;
    });
    order.push("sync end");

    // Before the loop: only synchronous code has run.
    expect(order).toEqual(["sync end"]);
    expect(microtaskQueue.size()).toBe(1); // cb1; cb2 isn't queued until cb1 settles
    expect(macrotaskQueue.size()).toBe(1);

    runEventLoop();

    // sync code, then the whole microtask chain, then the timer.
    expect(order).toEqual(["sync end", "cb1", "cb2", "timeout"]);
    expect(cb2.state).toBe("Fulfilled");
    expect(cb2.value).toBe("ok");
    expect(microtaskQueue.isEmpty()).toBe(true);
    expect(macrotaskQueue.isEmpty()).toBe(true);
  });

  it("Prom test 6: returning a thenable from", () => {
    const order: string[] = [];
    const exec = (resolve) => {
      runtimeSetTimeout(() => resolve("inner value"), 0); /// Enqued in the macrotask queue (() => resolve("inner value"))
    };
    const inner = new MyPromise(exec);

    const exec1 = (resolve) => resolve("start");
    new MyPromise(exec1) /// this.value = "start", this.state = "Fulfilled"
      .then(() => {
        order.push("returning inner promise");
        console.log("inner in first then: ", inner);
        return inner;
      }) /// Microtask queueu 1
      .then((v) => {
        console.log("v in second then: ", v);
        order.push(`chained result: ${v}`);
      });

    runEventLoop();
    expect(order).toEqual([
      "returning inner promise",
      "chained result: inner value",
    ]);
    // expect(order).toEqual([
    //   "returning inner promise",
    //   "chained result: inner value",
    // ]);
  });

  it("Prom test 6b: returning a promise costs extra microtask ticks", () => {
    const order: string[] = [];

    // Chain A returns an already-fulfilled promise from its first .then.
    new MyPromise((res: (v: unknown) => void) => res(undefined))
      .then(() => new MyPromise((res: (v: unknown) => void) => res("A")))
      .then(() => order.push("A chain"));

    // Chain B is a plain chain that ticks once per .then.
    new MyPromise((res: (v: unknown) => void) => res(undefined))
      .then(() => order.push("t1"))
      .then(() => order.push("t2"))
      .then(() => order.push("t3"))
      .then(() => order.push("t4"));

    runEventLoop();

    // Same order native Promises produce.
    expect(order).toEqual(["t1", "t2", "t3", "A chain", "t4"]);
  });

  it("Prom test 7: once resolved with a promise, later settle calls are ignored", () => {
    const order: string[] = [];

    // Case 1: resolve(promise) followed by reject() from the executor.
    new MyPromise((res: (v: unknown) => void, rej: (r: unknown) => void) => {
      res(new MyPromise((r: (v: unknown) => void) => r("A")));
      rej("late");
    }).then(
      (v: unknown) => order.push(`case1 ok ${v}`),
      (e: unknown) => order.push(`case1 err ${e}`),
    );

    // Case 2: a thenable that hands back a promise, then calls resolve again.
    new MyPromise((r: (v: unknown) => void) => r("s"))
      .then(() => ({
        then(res: (v: unknown) => void) {
          res(new MyPromise((r: (v: unknown) => void) => r("inner")));
          res("second");
        },
      }))
      .then((v: unknown) => order.push(`case2 ok ${v}`));

    runEventLoop();

    expect(order).toEqual(["case1 ok A", "case2 ok inner"]);
  });

  it("Prom test 8: a thenable whose then() throws rejects the promise", () => {
    const order: string[] = [];

    // Throws before resolving: the promise must reject with the error.
    new MyPromise((r: (v: unknown) => void) => r("s"))
      .then(() => ({
        then() {
          throw "early";
        },
      }))
      .then(
        (v: unknown) => order.push(`ok ${v}`),
        (e: unknown) => order.push(`err ${e}`),
      );

    // Throws after resolving: the throw must be ignored.
    new MyPromise((r: (v: unknown) => void) => r("s"))
      .then(() => ({
        then(res: (v: unknown) => void) {
          res("fine");
          throw "late";
        },
      }))
      .then(
        (v: unknown) => order.push(`ok2 ${v}`),
        (e: unknown) => order.push(`err2 ${e}`),
      );

    runEventLoop();

    expect(order).toEqual(["err early", "ok2 fine"]);
  });

  it("Prom test 9: resolving a promise with itself rejects with TypeError", () => {
    const order: string[] = [];

    // Case 1: hand the promise its own resolver and resolve it with itself.
    let resolveSelf!: (v: unknown) => void;
    const p1 = new MyPromise((r: (v: unknown) => void) => {
      resolveSelf = r;
    });
    resolveSelf(p1);
    p1.then(
      () => order.push("case1 ok"),
      (e: unknown) => order.push(`case1 TypeError=${e instanceof TypeError}`),
    );

    // Case 2: a .then callback returns the promise that .then itself returned.
    const p2: MyPromise = new MyPromise((r: (v: unknown) => void) =>
      r("s"),
    ).then(() => p2);
    p2.then(
      () => order.push("case2 ok"),
      (e: unknown) => order.push(`case2 TypeError=${e instanceof TypeError}`),
    );

    runEventLoop();

    expect(order).toEqual(["case1 TypeError=true", "case2 TypeError=true"]);
  });

  it("Prom test 10: a function with a .then property is a thenable", () => {
    const order: string[] = [];

    // Case 1: resolve directly with a function that has a .then.
    const f: any = () => {};
    f.then = (res: (v: unknown) => void) => res("fn");
    new MyPromise((r: (v: unknown) => void) => r(f)).then((v: unknown) =>
      order.push(`ok ${v}`),
    );

    // Case 2: return such a function from a .then callback.
    const g: any = () => {};
    g.then = (res: (v: unknown) => void) => res("fn2");
    new MyPromise((r: (v: unknown) => void) => r("s"))
      .then(() => g)
      .then((v: unknown) => order.push(`ok ${v}`));

    runEventLoop();

    expect(order).toEqual(["ok fn", "ok fn2"]);
  });
});
