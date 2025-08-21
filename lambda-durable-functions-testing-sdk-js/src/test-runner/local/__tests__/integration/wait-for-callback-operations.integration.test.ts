import { LocalDurableTestRunner } from "../../local-durable-test-runner";
import { WaitingOperationStatus } from "../../../durable-test-runner";
import {
  DurableContext,
  withDurableFunctions,
} from "@amzn/durable-executions-language-sdk";

beforeAll(() => LocalDurableTestRunner.setupTestEnvironment());
afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

/**
 * Integration tests for waitForCallback operations in LocalDurableTestRunner
 * Tests the complete waitForCallback workflow including submitter execution and callback completion.
 */
describe("WaitForCallback Operations Integration", () => {
  it("should handle basic waitForCallback with anonymous submitter", async () => {
    let receivedCallbackId: string | undefined;

    const handler = withDurableFunctions(
      async (_event: unknown, context: DurableContext) => {
        const result = await context.waitForCallback<{ data: string }>(
          async (callbackId) => {
            receivedCallbackId = callbackId;
            return Promise.resolve();
          }
        );

        return {
          callbackResult: result,
          submitterReceived: (receivedCallbackId?.length ?? 0) > 0,
          completed: true,
        };
      }
    );

    const runner = new LocalDurableTestRunner({
      handlerFunction: handler,
      skipTime: true,
    });

    // Start the execution (this will pause at the callback)
    const executionPromise = runner.run({
      payload: { test: "waitForCallback-anonymous" },
    });

    const callbackOperation = runner.getOperationByIndex<{ data: string }>(1);

    // Wait for the operation to be available
    await callbackOperation.waitForData(WaitingOperationStatus.STARTED);
    // Simulate external system completing the callback
    await callbackOperation.sendCallbackSuccess({ data: "callback-completed" });

    // Now the execution should complete
    const result = await executionPromise;

    expect(result.getResult()).toEqual({
      callbackResult: { data: "callback-completed" },
      submitterReceived: true,
      completed: true,
    });
    expect(receivedCallbackId).toBeDefined();
  });

  // todo: add more tests when more waitForCallback support is added
  // to fully support waitForCallback we need:
  //   - waitForCallback checkpoints at start and finish
  //   - Child context step will have a subtype in the API
});
