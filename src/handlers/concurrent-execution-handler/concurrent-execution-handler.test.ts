import {
  createConcurrentExecutionHandler,
  ConcurrentExecutionItem,
  ConcurrentExecutor,
} from "./concurrent-execution-handler";
import { ExecutionContext, DurableContext } from "../../types";

describe("ConcurrentExecutionHandler", () => {
  let mockExecutionContext: ExecutionContext;
  let mockRunInChildContext: jest.MockedFunction<
    DurableContext["runInChildContext"]
  >;
  let concurrentExecutionHandler: ReturnType<
    typeof createConcurrentExecutionHandler
  >;

  beforeEach(() => {
    mockExecutionContext = {
      isVerbose: false,
    } as ExecutionContext;

    mockRunInChildContext = jest.fn();

    // Common mock implementation for runInChildContext used across tests
    mockRunInChildContext.mockImplementation(async (nameOrFn, fnOrOptions) => {
      // Handle the overloaded signature: runInChildContext(name, fn) or runInChildContext(fn)
      let fn: any;
      if (typeof nameOrFn === "function") {
        fn = nameOrFn;
      } else if (typeof fnOrOptions === "function") {
        fn = fnOrOptions;
      } else {
        throw new Error("No function provided to runInChildContext");
      }

      // Create a mock child context with runInChildContext method
      const mockChildContext = {
        isVerbose: false,
        runInChildContext: jest
          .fn()
          .mockImplementation(async (nameOrFn: any, fnOrOptions?: any) => {
            // Handle the overloaded signature for nested calls
            let nestedFn: any;
            if (typeof nameOrFn === "function") {
              nestedFn = nameOrFn;
            } else if (typeof fnOrOptions === "function") {
              nestedFn = fnOrOptions;
            } else {
              throw new Error(
                "No function provided to nested runInChildContext",
              );
            }
            return await nestedFn(mockChildContext);
          }),
      };

      return await fn(mockChildContext);
    });

    concurrentExecutionHandler = createConcurrentExecutionHandler(
      mockExecutionContext,
      mockRunInChildContext,
    );
  });

  describe("parameter parsing", () => {
    it("should parse parameters with name", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();

      await concurrentExecutionHandler("test-name", items, executor);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        "test-name",
        expect.any(Function),
        { subType: undefined },
      );
    });

    it("should parse parameters without name", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();

      await concurrentExecutionHandler(items, executor);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        { subType: undefined },
      );
    });

    it("should accept undefined as name parameter", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();

      await concurrentExecutionHandler(undefined, items, executor);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        { subType: undefined },
      );
    });

    it("should actually execute the executor function", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test1", index: 0 },
        { id: "item-1", data: "test2", index: 1 },
      ];

      const executor: ConcurrentExecutor<string, string> = jest
        .fn()
        .mockImplementation(async (item, context) => {
          // Verify we get the actual item and context
          expect(item).toEqual(
            expect.objectContaining({
              id: expect.stringMatching(/^item-\d+$/),
              data: expect.stringMatching(/^test\d+$/),
              index: expect.any(Number),
            }),
          );
          expect(context).toBeDefined();
          return `processed-${item.data}`;
        });

      const result = await concurrentExecutionHandler(items, executor);

      // Verify the executor was called for each item
      expect(executor).toHaveBeenCalledTimes(2);
      expect(result).toEqual(["processed-test1", "processed-test2"]);
    });

    it("should handle executor errors and throw the first one", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "success", index: 0 },
        { id: "item-1", data: "fail", index: 1 },
        { id: "item-2", data: "success", index: 2 },
      ];

      const executor: ConcurrentExecutor<string, string> = jest
        .fn()
        .mockImplementation(async (item) => {
          if (item.data === "fail") {
            throw new Error("Executor failed");
          }
          return `processed-${item.data}`;
        });

      await expect(concurrentExecutionHandler(items, executor)).rejects.toThrow(
        "Executor failed",
      );

      // Should have attempted all items despite the error
      expect(executor).toHaveBeenCalledTimes(3);
    });

    it("should handle non-Error exceptions", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "fail", index: 0 },
      ];

      const executor: ConcurrentExecutor<string, string> = jest
        .fn()
        .mockImplementation(async () => {
          throw "String error"; // Non-Error exception
        });

      await expect(concurrentExecutionHandler(items, executor)).rejects.toThrow(
        "String error",
      );
    });

    it("should continue execution when some items fail", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "success1", index: 0 },
        { id: "item-1", data: "fail", index: 1 },
        { id: "item-2", data: "success2", index: 2 },
        { id: "item-3", data: "fail", index: 3 },
        { id: "item-4", data: "success3", index: 4 },
      ];

      const executor: ConcurrentExecutor<string, string> = jest
        .fn()
        .mockImplementation(async (item) => {
          if (item.data === "fail") {
            throw new Error(`Failed on ${item.data}`);
          }
          return `processed-${item.data}`;
        });

      await expect(concurrentExecutionHandler(items, executor)).rejects.toThrow(
        "Failed on fail",
      ); // Should throw the first error (index 1)

      // Should have attempted ALL items despite failures
      expect(executor).toHaveBeenCalledTimes(5);

      // Verify it was called with each item
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ data: "success1", index: 0 }),
        expect.any(Object),
      );
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ data: "fail", index: 1 }),
        expect.any(Object),
      );
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ data: "success2", index: 2 }),
        expect.any(Object),
      );
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ data: "fail", index: 3 }),
        expect.any(Object),
      );
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ data: "success3", index: 4 }),
        expect.any(Object),
      );
    });
  });

  describe("validation", () => {
    it("should throw error for non-array items", async () => {
      const executor: ConcurrentExecutor<string, string> = jest.fn();

      await expect(
        concurrentExecutionHandler("not-an-array" as any, executor),
      ).rejects.toThrow("Concurrent execution requires an array of items");
    });

    it("should throw error for non-function executor", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];

      await expect(
        concurrentExecutionHandler(items, "not-a-function" as any),
      ).rejects.toThrow("Concurrent execution requires an executor function");
    });

    it("should throw error for zero maxConcurrency config", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();
      const config = { maxConcurrency: 0 };

      await expect(
        concurrentExecutionHandler(items, executor, config),
      ).rejects.toThrow(
        "Invalid maxConcurrency: 0. Must be a positive number or undefined for unlimited concurrency.",
      );
    });

    it("should throw error for negative maxConcurrency config", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();
      const config = { maxConcurrency: -1 };

      await expect(
        concurrentExecutionHandler(items, executor, config),
      ).rejects.toThrow(
        "Invalid maxConcurrency: -1. Must be a positive number or undefined for unlimited concurrency.",
      );
    });
  });

  describe("execution", () => {
    it("should handle empty array", async () => {
      const items: ConcurrentExecutionItem<string>[] = [];
      const executor: ConcurrentExecutor<string, string> = jest.fn();

      mockRunInChildContext.mockResolvedValue([]);

      const result = await concurrentExecutionHandler(items, executor);

      expect(result).toEqual([]);
      expect(executor).not.toHaveBeenCalled();
    });

    it("should execute items concurrently", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test1", index: 0 },
        { id: "item-1", data: "test2", index: 1 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();

      mockRunInChildContext.mockResolvedValue(["result1", "result2"]);

      await concurrentExecutionHandler(items, executor);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        { subType: undefined },
      );
    });

    it("should respect maxConcurrency config", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();
      const config = { maxConcurrency: 2 };

      mockRunInChildContext.mockResolvedValue(["result"]);

      await concurrentExecutionHandler(items, executor, config);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        { subType: undefined },
      );
    });

    it("should wait for promises when at maxConcurrency limit", async () => {
      // Create more items than maxConcurrency to force waiting
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test1", index: 0 },
        { id: "item-1", data: "test2", index: 1 },
        { id: "item-2", data: "test3", index: 2 },
        { id: "item-3", data: "test4", index: 3 },
      ];
      const config = { maxConcurrency: 2 }; // Limit to 2 concurrent executions

      const resolvePromises: Array<() => void> = [];
      const executionOrder: number[] = [];

      const executor: ConcurrentExecutor<string, string> = jest
        .fn()
        .mockImplementation(async (item) => {
          executionOrder.push(item.index);

          // Return a promise that we can control when it resolves
          return new Promise<string>((resolve) => {
            resolvePromises.push(() => resolve(`processed-${item.data}`));
          });
        });

      // Override the default mock implementation for this specific test's timing needs
      mockRunInChildContext.mockImplementation(
        async (nameOrFn, fnOrOptions) => {
          let fn: any;
          if (typeof nameOrFn === "function") {
            fn = nameOrFn;
          } else if (typeof fnOrOptions === "function") {
            fn = fnOrOptions;
          }

          const mockChildContext = {
            isVerbose: false,
            runInChildContext: jest
              .fn()
              .mockImplementation(async (nameOrFn: any, fnOrOptions?: any) => {
                let nestedFn: any;
                if (typeof nameOrFn === "function") {
                  nestedFn = nameOrFn;
                } else if (typeof fnOrOptions === "function") {
                  nestedFn = fnOrOptions;
                }
                const nestedChildContext = {} as unknown as DurableContext;
                return await nestedFn(nestedChildContext);
              }),
          } as unknown as DurableContext;

          // Start the execution but don't wait for it to complete immediately
          const executionPromise = fn(mockChildContext);

          // Allow the first 2 items to start immediately
          setTimeout(() => {
            if (resolvePromises.length >= 2) {
              // Resolve the first 2 to allow the next 2 to start
              resolvePromises[0]();
              resolvePromises[1]();
            }
          }, 10);

          // Resolve the remaining items after a short delay
          setTimeout(() => {
            resolvePromises.forEach((resolve) => resolve());
          }, 50);

          return await executionPromise;
        },
      );

      const result = await concurrentExecutionHandler(items, executor, config);

      // Verify all items were processed
      expect(executor).toHaveBeenCalledTimes(4);
      expect(result).toEqual([
        "processed-test1",
        "processed-test2",
        "processed-test3",
        "processed-test4",
      ]);

      // Verify that execution started in order (first 2 should start immediately)
      expect(executionOrder.slice(0, 2)).toEqual([0, 1]);
    });

    it("should wait for remaining promises to complete after all items started", async () => {
      // Test the scenario where all items have been started but some are still executing
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "fast", index: 0 },
        { id: "item-1", data: "slow", index: 1 },
      ];
      const config = { maxConcurrency: 5 }; // Higher than item count

      let slowPromiseResolve: () => void;

      const executor: ConcurrentExecutor<string, string> = jest
        .fn()
        .mockImplementation(async (item) => {
          if (item.data === "fast") {
            return `processed-${item.data}`;
          } else {
            // Return a promise that resolves later
            return new Promise<string>((resolve) => {
              slowPromiseResolve = () => resolve(`processed-${item.data}`);
            });
          }
        });

      // Start the concurrent execution
      const resultPromise = concurrentExecutionHandler(items, executor, config);

      // Resolve the slow promise after a delay to trigger the waiting logic
      setTimeout(() => {
        if (slowPromiseResolve) {
          slowPromiseResolve();
        }
      }, 20);

      const result = await resultPromise;

      expect(executor).toHaveBeenCalledTimes(2);
      expect(result).toEqual(["processed-fast", "processed-slow"]);
    });

    it("should handle undefined maxConcurrency config", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();
      const config = { maxConcurrency: undefined }; // This should trigger the || Infinity branch

      mockRunInChildContext.mockResolvedValue(["result"]);

      await concurrentExecutionHandler(items, executor, config);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        { subType: undefined },
      );
    });

    it("should handle null maxConcurrency config", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();
      const config = { maxConcurrency: null as any }; // This should trigger the || Infinity branch

      mockRunInChildContext.mockResolvedValue(["result"]);

      await concurrentExecutionHandler(items, executor, config);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        { subType: undefined },
      );
    });

    it("should handle config without maxConcurrency property", async () => {
      const items: ConcurrentExecutionItem<string>[] = [
        { id: "item-0", data: "test", index: 0 },
      ];
      const executor: ConcurrentExecutor<string, string> = jest.fn();
      const config = {}; // No maxConcurrency property at all

      mockRunInChildContext.mockResolvedValue(["result"]);

      await concurrentExecutionHandler(items, executor, config);

      expect(mockRunInChildContext).toHaveBeenCalledWith(
        undefined,
        expect.any(Function),
        { subType: undefined },
      );
    });
  });
});
