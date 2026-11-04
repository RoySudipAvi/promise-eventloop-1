export class DemoFuncClass {
  value = 42;
  normalFunc() {
    // 1. FIXED: Pass separately with commas for live browser inspection
    console.log("NORMAL:");
    console.dir(this, { depth: null, showHidden: true });
    console.log("args normal (comma):", arguments);
  }

  arrowFunc = (...args) => {
    // 3. FIXED: Arrow functions don't have an "arguments" keyword.
    // Use the Rest parameters (...args) shown above instead!
    console.log("ARROW:");
    console.dir(this, { depth: null, showHidden: true });
    console.log("args arrow:", args);
  };
}
