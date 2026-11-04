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
    const items = [];
    items.push(10);
    const exec = (res) => {
      res(66);
      items.push(20);
    };
    const p1 = new MyPromise(exec);
    const cb1 = p1.then((fulfil) => items.push(fulfil));
    items.push(100);
    items.push(1);
    console.log(`items: ${items}`);
    console.log("queued tasks:", microtaskQueue.getTask(0).toString());
    runEventLoop();
    console.log(`items: ${items}`);
  });

  it("Prom test 3: Immediate reject", () => {
    const exec = (res, rej) => {
      rej("Failed");
    };
    const p1 = new MyPromise(exec);
    const cb1 = p1.then(undefined, (rej) => {
      console.log(`error caught`, rej);
      return "BB BB BC";
    });
    // const cb2 = cb1.then(undefined, (rej) => {
    //   console.log(`rejjed: ${rej}`);
    // });
    runEventLoop();
  });

  it("Prom test 4: Chaining of then", () => {
    const rand = randomNumber();
    const successRand = [];
    console.log(`random number: ${rand}`);
    const exec = (res, rej) => {
      if (rand > 499) {
        res(`succeded with: ${rand}`);
      } else {
        rej(`Failed with: ${rand}`);
      }
    };
    const p1 = new MyPromise(exec);
    const cb1 = p1.then(
      (v) => {
        successRand.push(v);
        return v;
      },
      (r) => {
        console.log(`failed with ${r}`);
        return r;
      }
    );

    const cb2 = cb1.then((v) => {
      console.log(`then what: ${v}`);
      return v;
    }, undefined);
    runEventLoop();
    console.log("success array: ", successRand);
  });

  it("Prom test 5: Ordering, microtask vs macrotask", () => {
    runtimeSetTimeout(() => console.log("2: timeout"), 0);
    const rand = randomNumber();
    const successRand = [];
    console.log(`random number: ${rand}`);
    const exec = (res, rej) => {
      if (rand > 499) {
        res(`succeded with: ${rand}`);
      } else {
        rej(`Failed with: ${rand}`);
      }
    };
    const p1 = new MyPromise(exec);
    const cb1 = p1.then(
      (v) => {
        successRand.push(v);
        return v;
      },
      (r) => {
        console.log(`failed with ${r}`);
        return r;
      }
    );
    const cb2 = cb1.then((v) => {
      console.log(`then what: ${v}`);
      return v;
    }, undefined);
    runEventLoop();
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

    // expect(order).toEqual([
    //   "returning inner promise",
    //   "chained result: inner value",
    // ]);
  });
});
