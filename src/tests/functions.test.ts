import { describe, expect, it, beforeEach } from "vitest";
import { DemoFuncClass } from "../functions";

describe("functions tests", () => {
  it("func test 1: this and args", () => {
    const demoClass = new DemoFuncClass();
    console.log("demo class object:", demoClass);
    const normal = demoClass.normalFunc;
    const arrow = demoClass.arrowFunc;
    console.log(`normal: ${normal}, arrow: ${arrow}`);
    normal();
    arrow();
    const normalBind = demoClass.normalFunc.bind(demoClass);
    normalBind();
    arrow();
  });
});
