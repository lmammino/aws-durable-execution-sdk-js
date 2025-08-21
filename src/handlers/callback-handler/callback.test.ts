import { createCallback } from "./callback";
import {
  ExecutionContext,
  CreateCallbackConfig,
  OperationSubType,
} from "../../types";
import { TerminationManager } from "../../termination-manager/termination-manager";
import { TerminationReason } from "../../termination-manager/types";
import {
  OperationStatus,
  OperationType,
  Operation,
} from "@amzn/dex-internal-sdk";
import { defaultSerdes } from "../../utils/serdes/serdes";
import { hashId } from "../../utils/step-id-utils/step-id-utils";
import { createMockExecutionContext } from "../../testing/mock-context";
import { TEST_CONSTANTS } from "../../testing/test-constants";

// Mock the logger to avoid console output during tests
jest.mock("../../utils/logger/logger", () => ({
  log: jest.fn(),
}));

// Mock the serdes utilities
jest.mock("../../errors/serdes-errors/serdes-errors", () => ({
  safeDeserialize: jest.fn(),
}));

import { safeDeserialize } from "../../errors/serdes-errors/serdes-errors";

describe("Callback Handler", () => {
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCheckpoint: jest.Mock;
  let createStepId: jest.Mock;
  let callbackHandler: ReturnType<typeof createCallback>;
  let mockTerminationManager: jest.Mocked<TerminationManager>;
  let mockSafeDeserialize: jest.MockedFunction<typeof safeDeserialize>;

  beforeEach(() => {
    // Reset all mocks before each test to ensure isolation
    jest.resetAllMocks();

    // Create a mock termination manager
    mockTerminationManager = {
      terminate: jest.fn(),
      getTerminationPromise: jest.fn(),
    } as unknown as jest.Mocked<TerminationManager>;

    mockExecutionContext = createMockExecutionContext({
      terminationManager: mockTerminationManager,
    });

    mockCheckpoint = jest.fn().mockResolvedValue({});
    createStepId = jest.fn().mockReturnValue(TEST_CONSTANTS.CALLBACK_ID);

    mockSafeDeserialize = safeDeserialize as jest.MockedFunction<
      typeof safeDeserialize
    >;
    mockSafeDeserialize.mockResolvedValue("deserialized-result");

    callbackHandler = createCallback(
      mockExecutionContext,
      mockCheckpoint,
      createStepId,
    );
  });

  describe("Completed Callback Scenarios", () => {
    test("should return cached result for already completed callback", async () => {
      // Set up a callback that was already completed
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.SUCCEEDED,
          CallbackDetails: {
            CallbackId: "callback-123",
            Result: "completed-result",
          },
        } as Operation,
      };

      const [promise, callbackId] =
        await callbackHandler<string>("test-callback");

      // Verify the callback ID is returned immediately
      expect(callbackId).toBe("callback-123");

      // Verify the promise resolves to the deserialized result
      const result = await promise;
      expect(result).toBe("deserialized-result");

      // Verify safeDeserialize was called with correct parameters
      expect(mockSafeDeserialize).toHaveBeenCalledWith(
        defaultSerdes,
        "completed-result",
        TEST_CONSTANTS.CALLBACK_ID,
        "test-callback",
        mockTerminationManager,
        false,
        "test-arn",
      );

      // Verify checkpoint was not called for completed callback
      expect(mockCheckpoint).not.toHaveBeenCalled();
      // Verify terminate was not called for completed callback
      expect(mockTerminationManager.terminate).not.toHaveBeenCalled();
    });

    test("should handle completed callback without name", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.SUCCEEDED,
          CallbackDetails: {
            CallbackId: "callback-456",
            Result: "result-data",
          },
        } as Operation,
      };

      const [promise, callbackId] = await callbackHandler<string>();

      expect(callbackId).toBe("callback-456");
      const result = await promise;
      expect(result).toBe("deserialized-result");

      // Verify safeDeserialize was called with undefined name
      expect(mockSafeDeserialize).toHaveBeenCalledWith(
        defaultSerdes,
        "result-data",
        TEST_CONSTANTS.CALLBACK_ID,
        undefined,
        mockTerminationManager,
        false,
        "test-arn",
      );
    });

    test("should throw error if completed callback has no callback ID", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.SUCCEEDED,
          CallbackDetails: {
            Result: "some-result",
          },
        } as Operation,
      };

      await expect(callbackHandler<string>("test-callback")).rejects.toThrow(
        "No callback ID found for completed callback: test-callback-id",
      );
    });

    test("should throw error if completed callback has no result", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.SUCCEEDED,
          CallbackDetails: {
            CallbackId: "callback-789",
          },
        } as Operation,
      };

      await expect(callbackHandler<string>("test-callback")).rejects.toThrow(
        "No result found for completed callback: test-callback-id",
      );
    });

    test("should use custom serdes for completed callback", async () => {
      const customSerdes = {
        serialize: jest.fn(),
        deserialize: jest.fn(),
      };

      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.SUCCEEDED,
          CallbackDetails: {
            CallbackId: "callback-custom",
            Result: "custom-result",
          },
        } as Operation,
      };

      const config: CreateCallbackConfig = {
        serdes: customSerdes,
        timeout: 300,
      };

      const [promise, callbackId] = await callbackHandler<string>(
        "custom-callback",
        config,
      );

      expect(callbackId).toBe("callback-custom");
      await promise;

      // Verify custom serdes was used
      expect(mockSafeDeserialize).toHaveBeenCalledWith(
        customSerdes,
        "custom-result",
        TEST_CONSTANTS.CALLBACK_ID,
        "custom-callback",
        mockTerminationManager,
        false,
        "test-arn",
      );
    });
  });

  describe("Failed Callback Scenarios", () => {
    test("should throw error for failed callback", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.FAILED,
          CallbackDetails: {
            CallbackId: "callback-failed-123",
          },
          StepDetails: {
            Result: "Callback execution failed",
          },
        } as Operation,
      };

      const [promise, callbackId] =
        await callbackHandler<string>("failed-callback");
      expect(callbackId).toBe("callback-failed-123");
      await expect(promise).rejects.toThrow("Callback execution failed");
    });

    test("should throw generic error for failed callback without error message", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.FAILED,
          CallbackDetails: {
            CallbackId: "callback-failed-456",
          },
          StepDetails: {},
        } as Operation,
      };

      const [promise, callbackId] =
        await callbackHandler<string>("failed-callback");
      expect(callbackId).toBe("callback-failed-456");
      await expect(promise).rejects.toThrow("Callback failed");
    });

    test("should throw error for failed callback without CallbackId", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.FAILED,
          StepDetails: {
            Result: "Callback execution failed",
          },
        } as Operation,
      };

      await expect(callbackHandler<string>("failed-callback")).rejects.toThrow(
        "No callback ID found for failed callback: test-callback-id",
      );
    });
  });

  describe("Started Callback Scenarios", () => {
    test("should return never-resolving promise for started callback and terminate when awaited", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "started-callback-123",
          },
        } as Operation,
      };

      const [promise, callbackId] =
        await callbackHandler<string>("started-callback");

      // Verify the callback ID is returned immediately
      expect(callbackId).toBe("started-callback-123");

      // Verify terminate was NOT called yet (should only be called when promise is awaited)
      expect(mockTerminationManager.terminate).not.toHaveBeenCalled();

      // Now await the promise, which should trigger termination
      const promiseResult = promise.then(() => "should-never-resolve");

      // Verify terminate was called when the promise was awaited
      expect(mockTerminationManager.terminate).toHaveBeenCalledWith({
        reason: TerminationReason.CALLBACK_PENDING,
        message: "Callback started-callback is pending external completion",
      });

      // The promise should never resolve, so this timeout should trigger
      await expect(
        Promise.race([
          promiseResult,
          new Promise((resolve) => setTimeout(() => resolve("timeout"), 100)),
        ]),
      ).resolves.toBe("timeout");
    });

    test("should not terminate when callbackHandler is called but promise is not awaited", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "started-callback-123",
          },
        } as Operation,
      };

      // Call callbackHandler but don't await the returned promise
      const [promise, callbackId] =
        await callbackHandler<string>("started-callback");

      // Verify the callback ID is returned immediately
      expect(callbackId).toBe("started-callback-123");

      // Verify terminate was NOT called since we haven't awaited the promise
      expect(mockTerminationManager.terminate).not.toHaveBeenCalled();

      // Even after some time, terminate should still not be called
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockTerminationManager.terminate).not.toHaveBeenCalled();
    });

    test("should use stepId in message when name is not provided for started callback", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "started-callback-456",
          },
        } as Operation,
      };

      const [promise] = await callbackHandler<string>();

      // Await the promise to trigger termination
      const promiseResult = promise.then(() => "should-never-resolve");

      // Verify terminate was called with stepId in message
      expect(mockTerminationManager.terminate).toHaveBeenCalledWith({
        reason: TerminationReason.CALLBACK_PENDING,
        message: "Callback test-callback-id is pending external completion",
      });
    });

    test("should throw error if started callback has no callback ID", async () => {
      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {},
        } as Operation,
      };

      await expect(callbackHandler<string>("started-callback")).rejects.toThrow(
        "No callback ID found for started callback: test-callback-id",
      );
    });
  });

  describe("New Callback Creation Scenarios", () => {
    test("should create new callback and return never-resolving promise", async () => {
      // Mock the checkpoint to simulate callback creation
      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        // Simulate the API updating stepData with callback ID after checkpoint
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "new-callback-789",
          },
        } as Operation;
      });

      const [promise, callbackId] =
        await callbackHandler<string>("new-callback");

      // Verify checkpoint was called with correct parameters
      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: "new-callback",
        CallbackOptions: {
          TimeoutSeconds: undefined,
          HeartbeatTimeoutSeconds: undefined,
        },
      });

      // Verify the callback ID is returned
      expect(callbackId).toBe("new-callback-789");

      // Verify terminate was NOT called yet (should only be called when promise is awaited)
      expect(mockTerminationManager.terminate).not.toHaveBeenCalled();

      // Now await the promise, which should trigger termination
      const promiseResult = promise.then(() => "should-never-resolve");

      // Verify terminate was called when the promise was awaited
      expect(mockTerminationManager.terminate).toHaveBeenCalledWith({
        reason: TerminationReason.CALLBACK_PENDING,
        message:
          "Callback new-callback created and pending external completion",
      });
    });

    test("should create new callback with timeout configuration", async () => {
      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "timeout-callback-123",
          },
        } as Operation;
      });

      const config: CreateCallbackConfig = {
        timeout: 300,
        heartbeatTimeout: 60,
      };

      const [promise, callbackId] = await callbackHandler<string>(
        "timeout-callback",
        config,
      );

      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: "timeout-callback",
        CallbackOptions: {
          TimeoutSeconds: 300,
          HeartbeatTimeoutSeconds: 60,
        },
      });

      expect(callbackId).toBe("timeout-callback-123");
    });

    test("should create new callback without name", async () => {
      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "unnamed-callback-456",
          },
        } as Operation;
      });

      const [promise, callbackId] = await callbackHandler<string>();

      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: undefined,
        CallbackOptions: {
          TimeoutSeconds: undefined,
          HeartbeatTimeoutSeconds: undefined,
        },
      });

      expect(callbackId).toBe("unnamed-callback-456");

      // Verify terminate was NOT called yet (should only be called when promise is awaited)
      expect(mockTerminationManager.terminate).not.toHaveBeenCalled();

      // Now await the promise, which should trigger termination
      const promiseResult = promise.then(() => "should-never-resolve");

      // Verify termination message uses stepId when name is undefined
      expect(mockTerminationManager.terminate).toHaveBeenCalledWith({
        reason: TerminationReason.CALLBACK_PENDING,
        message:
          "Callback test-callback-id created and pending external completion",
      });
    });

    test("should throw error if callback ID not found after checkpoint", async () => {
      // Mock checkpoint to not update stepData with callback ID
      mockCheckpoint.mockResolvedValue({});

      await expect(
        callbackHandler<string>("missing-id-callback"),
      ).rejects.toThrow(
        "Callback ID not found in stepData after checkpoint: test-callback-id",
      );
    });

    test("should throw error if CallbackDetails missing after checkpoint", async () => {
      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          // Missing CallbackDetails
        } as Operation;
      });

      await expect(
        callbackHandler<string>("missing-details-callback"),
      ).rejects.toThrow(
        "Callback ID not found in stepData after checkpoint: test-callback-id",
      );
    });
  });

  describe("Configuration Parameter Handling", () => {
    test("should handle string name as first parameter", async () => {
      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "string-param-callback",
          },
        } as Operation;
      });

      const config: CreateCallbackConfig = {
        timeout: 120,
      };

      const [promise, callbackId] = await callbackHandler<string>(
        "string-name",
        config,
      );

      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: "string-name",
        CallbackOptions: {
          TimeoutSeconds: 120,
          HeartbeatTimeoutSeconds: undefined,
        },
      });

      expect(callbackId).toBe("string-param-callback");
    });

    test("should handle config object as first parameter", async () => {
      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "config-first-callback",
          },
        } as Operation;
      });

      const config: CreateCallbackConfig = {
        timeout: 180,
        heartbeatTimeout: 30,
      };

      const [promise, callbackId] = await callbackHandler<string>(config);

      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: undefined,
        CallbackOptions: {
          TimeoutSeconds: 180,
          HeartbeatTimeoutSeconds: 30,
        },
      });

      expect(callbackId).toBe("config-first-callback");
    });

    test("should accept undefined as name parameter", async () => {
      const config: CreateCallbackConfig = { timeout: 300 };

      mockExecutionContext._stepData = {};

      // Mock the checkpoint to simulate callback creation
      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "undefined-callback-123",
          },
        } as Operation;
      });

      const callbackHandler = createCallback(
        mockExecutionContext,
        mockCheckpoint,
        createStepId,
      );

      const result = callbackHandler(undefined, config);

      // Wait for the async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        ParentId: undefined,
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: undefined,
        CallbackOptions: {
          TimeoutSeconds: 300,
          HeartbeatTimeoutSeconds: undefined,
        },
      });

      // Verify it returns a promise
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe("Verbose Logging", () => {
    test("should pass verbose flag to safeDeserialize", async () => {
      mockExecutionContext.isVerbose = true;

      const stepId = TEST_CONSTANTS.CALLBACK_ID;
      const hashedStepId = hashId(stepId);
      mockExecutionContext._stepData = {
        [hashedStepId]: {
          Id: hashedStepId,
          Status: OperationStatus.SUCCEEDED,
          CallbackDetails: {
            CallbackId: "verbose-callback",
            Result: "verbose-result",
          },
        } as Operation,
      };

      const [promise] = await callbackHandler<string>("verbose-test");
      await promise;

      expect(mockSafeDeserialize).toHaveBeenCalledWith(
        defaultSerdes,
        "verbose-result",
        TEST_CONSTANTS.CALLBACK_ID,
        "verbose-test",
        mockTerminationManager,
        true, // isVerbose should be true
        "test-arn",
      );
    });
  });

  describe("ParentId Handling", () => {
    test("should include ParentId in checkpoint when creating new callback with defined parentId", async () => {
      mockExecutionContext.parentId = "parent-step-123";

      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "new-callback-with-parent",
          },
        } as Operation;
      });

      await callbackHandler<string>("test-callback-with-parent");

      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        ParentId: "parent-step-123",
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: "test-callback-with-parent",
        CallbackOptions: {
          TimeoutSeconds: undefined,
          HeartbeatTimeoutSeconds: undefined,
        },
      });
    });

    test("should include ParentId as undefined in checkpoint when creating new callback with undefined parentId", async () => {
      mockExecutionContext.parentId = undefined;

      mockCheckpoint.mockImplementation(async (stepId, operation) => {
        const hashedStepId = hashId(stepId);
        mockExecutionContext._stepData[hashedStepId] = {
          Id: hashedStepId,
          Status: OperationStatus.STARTED,
          CallbackDetails: {
            CallbackId: "new-callback-without-parent",
          },
        } as Operation;
      });

      await callbackHandler<string>("test-callback-without-parent");

      expect(mockCheckpoint).toHaveBeenCalledWith(TEST_CONSTANTS.CALLBACK_ID, {
        Id: TEST_CONSTANTS.CALLBACK_ID,
        ParentId: undefined,
        Action: "START",
        SubType: OperationSubType.CALLBACK,
        Type: OperationType.CALLBACK,
        Name: "test-callback-without-parent",
        CallbackOptions: {
          TimeoutSeconds: undefined,
          HeartbeatTimeoutSeconds: undefined,
        },
      });
    });
  });
});
