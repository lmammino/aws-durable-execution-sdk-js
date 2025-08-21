import { createParallelHandler } from "./parallel-handler";
import { ExecutionContext, DurableContext, ParallelFunc } from "../../types";
import { TEST_CONSTANTS } from "../../testing/test-constants";

describe("Parallel Handler", () => {
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockExecuteConcurrently: jest.MockedFunction<
    DurableContext["executeConcurrently"]
  >;
  let parallelHandler: ReturnType<typeof createParallelHandler>;

  beforeEach(() => {
    mockExecutionContext = {
      isVerbose: false,
    } as jest.Mocked<ExecutionContext>;

    mockExecuteConcurrently = jest.fn();
    parallelHandler = createParallelHandler(
      mockExecutionContext,
      mockExecuteConcurrently,
    );
  });

  describe("parameter parsing", () => {
    it("should parse parameters with name", async () => {
      const branch1: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result1");
      const branch2: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result2");
      const branches = [branch1, branch2];

      mockExecuteConcurrently.mockResolvedValue(["result1", "result2"]);

      await parallelHandler("test-parallel", branches);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        "test-parallel",
        [
          { id: "parallel-branch-0", data: branch1, index: 0 },
          { id: "parallel-branch-1", data: branch2, index: 1 },
        ],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_PARALLEL_CONFIG,
      );
    });

    it("should parse parameters without name", async () => {
      const branch1: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result1");
      const branch2: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result2");
      const branches = [branch1, branch2];

      mockExecuteConcurrently.mockResolvedValue(["result1", "result2"]);

      await parallelHandler(branches);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [
          { id: "parallel-branch-0", data: branch1, index: 0 },
          { id: "parallel-branch-1", data: branch2, index: 1 },
        ],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_PARALLEL_CONFIG,
      );
    });

    it("should accept undefined as name parameter", async () => {
      const branch: ParallelFunc<string> = jest.fn();
      const branches = [branch];

      mockExecuteConcurrently.mockResolvedValue(["result"]);

      await parallelHandler(undefined, branches);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [{ id: "parallel-branch-0", data: branch, index: 0 }],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_PARALLEL_CONFIG,
      );
    });

    it("should parse parameters with config", async () => {
      const branch1: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result1");
      const branches = [branch1];
      const config = {
        ...TEST_CONSTANTS.DEFAULT_PARALLEL_CONFIG,
        maxConcurrency: 2,
      };

      mockExecuteConcurrently.mockResolvedValue(["result1"]);

      await parallelHandler(branches, config);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [{ id: "parallel-branch-0", data: branch1, index: 0 }],
        expect.any(Function),
        config,
      );
    });
  });

  describe("validation", () => {
    it("should throw error for non-array branches", async () => {
      await expect(parallelHandler("not-an-array" as any)).rejects.toThrow(
        "Parallel operation requires an array of branch functions",
      );
    });

    it("should throw error for non-function branches", async () => {
      const branches = [jest.fn(), "not-a-function"];

      await expect(parallelHandler(branches as any)).rejects.toThrow(
        "All branches must be functions",
      );
    });
  });

  describe("execution", () => {
    it("should handle empty array", async () => {
      const branches: ParallelFunc<string>[] = [];

      mockExecuteConcurrently.mockResolvedValue([]);

      const result = await parallelHandler(branches);

      expect(result).toEqual([]);
      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_PARALLEL_CONFIG,
      );
    });

    it("should create correct execution items", async () => {
      const branch1: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result1");
      const branch2: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result2");
      const branch3: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result3");
      const branches = [branch1, branch2, branch3];

      mockExecuteConcurrently.mockResolvedValue([
        "result1",
        "result2",
        "result3",
      ]);

      await parallelHandler(branches);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [
          { id: "parallel-branch-0", data: branch1, index: 0 },
          { id: "parallel-branch-1", data: branch2, index: 1 },
          { id: "parallel-branch-2", data: branch3, index: 2 },
        ],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_PARALLEL_CONFIG,
      );
    });

    it("should create executor that calls branch functions correctly", async () => {
      const branch1: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result1");
      const branch2: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result2");
      const branches = [branch1, branch2];

      let capturedExecutor: any;
      mockExecuteConcurrently.mockImplementation(async (...args: any[]) => {
        // Unified signature: (name, items, executor, config) where name can be undefined
        const [, executionItems, executor] = args;

        capturedExecutor = executor;
        // Simulate calling the executor for each item
        const results = [];
        for (const item of executionItems as any[]) {
          const mockChildContext = {} as DurableContext;
          const result = await (executor as any)(item, mockChildContext);
          results.push(result);
        }
        return results;
      });

      const result = await parallelHandler(branches);

      expect(result).toEqual(["result1", "result2"]);
      expect(branch1).toHaveBeenCalledTimes(1);
      expect(branch2).toHaveBeenCalledTimes(1);
      expect(branch1).toHaveBeenCalledWith(expect.any(Object));
      expect(branch2).toHaveBeenCalledWith(expect.any(Object));
    });

    it("should pass through maxConcurrency config", async () => {
      const branch1: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result1");
      const branches = [branch1];
      const config = {
        ...TEST_CONSTANTS.DEFAULT_PARALLEL_CONFIG,
        maxConcurrency: 5,
      };

      mockExecuteConcurrently.mockResolvedValue(["result1"]);

      await parallelHandler("test-parallel", branches, config);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        "test-parallel",
        expect.any(Array),
        expect.any(Function),
        config,
      );
    });

    it("should handle branch failures", async () => {
      const branch1: ParallelFunc<string> = jest
        .fn()
        .mockResolvedValue("result1");
      const branch2: ParallelFunc<string> = jest
        .fn()
        .mockRejectedValue(new Error("Branch failed"));
      const branches = [branch1, branch2];

      let capturedExecutor: any;
      mockExecuteConcurrently.mockImplementation(async (...args: any[]) => {
        // Unified signature: (name, items, executor, config) where name can be undefined
        const [, executionItems, executor] = args;

        capturedExecutor = executor;
        // Simulate calling the executor for each item
        const results = [];
        for (const item of executionItems as any[]) {
          const mockChildContext = {} as DurableContext;
          try {
            const result = await (executor as any)(item, mockChildContext);
            results.push(result);
          } catch (error) {
            throw error; // Re-throw to simulate failure
          }
        }
        return results;
      });

      await expect(parallelHandler(branches)).rejects.toThrow("Branch failed");
    });
  });
});
