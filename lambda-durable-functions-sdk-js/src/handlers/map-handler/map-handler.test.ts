import { createMapHandler } from "./map-handler";
import { ExecutionContext, DurableContext, MapFunc } from "../../types";
import { TEST_CONSTANTS } from "../../testing/test-constants";

describe("Map Handler", () => {
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockExecuteConcurrently: jest.MockedFunction<
    DurableContext["executeConcurrently"]
  >;
  let mapHandler: ReturnType<typeof createMapHandler>;

  beforeEach(() => {
    mockExecutionContext = {
      isVerbose: false,
    } as jest.Mocked<ExecutionContext>;

    mockExecuteConcurrently = jest.fn();
    mapHandler = createMapHandler(
      mockExecutionContext,
      mockExecuteConcurrently,
    );
  });

  describe("parameter parsing", () => {
    it("should parse parameters with name", async () => {
      const items = ["item1", "item2"];
      const mapFunc: MapFunc<string> = jest.fn().mockResolvedValue("result");

      mockExecuteConcurrently.mockResolvedValue(["result1", "result2"]);

      await mapHandler("test-map", items, mapFunc);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        "test-map",
        [
          { id: "map-item-0", data: "item1", index: 0 },
          { id: "map-item-1", data: "item2", index: 1 },
        ],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_MAP_CONFIG,
      );
    });

    it("should parse parameters without name", async () => {
      const items = ["item1", "item2"];
      const mapFunc: MapFunc<string> = jest.fn().mockResolvedValue("result");

      mockExecuteConcurrently.mockResolvedValue(["result1", "result2"]);

      await mapHandler(items, mapFunc);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [
          { id: "map-item-0", data: "item1", index: 0 },
          { id: "map-item-1", data: "item2", index: 1 },
        ],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_MAP_CONFIG,
      );
    });

    it("should accept undefined as name parameter", async () => {
      const items = ["item"];
      const mapFunc: MapFunc<string> = jest.fn();

      mockExecuteConcurrently.mockResolvedValue(["result"]);

      await mapHandler(undefined, items, mapFunc);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [{ id: "map-item-0", data: "item", index: 0 }],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_MAP_CONFIG,
      );
    });

    it("should parse parameters with config", async () => {
      const items = ["item1", "item2"];
      const mapFunc: MapFunc<string> = jest.fn().mockResolvedValue("result");
      const config = {
        ...TEST_CONSTANTS.DEFAULT_MAP_CONFIG,
        maxConcurrency: 2,
      };

      mockExecuteConcurrently.mockResolvedValue(["result1", "result2"]);

      await mapHandler(items, mapFunc, config);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [
          { id: "map-item-0", data: "item1", index: 0 },
          { id: "map-item-1", data: "item2", index: 1 },
        ],
        expect.any(Function),
        { ...TEST_CONSTANTS.DEFAULT_MAP_CONFIG, maxConcurrency: 2 },
      );
    });
  });

  describe("validation", () => {
    it("should throw error for non-array items", async () => {
      const mapFunc: MapFunc<string> = jest.fn();

      await expect(mapHandler("not-an-array" as any, mapFunc)).rejects.toThrow(
        "Map operation requires an array of items",
      );
    });

    it("should throw error for non-function mapFunc", async () => {
      const items = ["item1", "item2"];

      await expect(mapHandler(items, "not-a-function" as any)).rejects.toThrow(
        "Map operation requires a function to process items",
      );
    });
  });

  describe("execution", () => {
    it("should handle empty array", async () => {
      const items: string[] = [];
      const mapFunc: MapFunc<string> = jest.fn();

      mockExecuteConcurrently.mockResolvedValue([]);

      const result = await mapHandler(items, mapFunc);

      expect(result).toEqual([]);
      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_MAP_CONFIG,
      );
    });

    it("should create correct execution items", async () => {
      const items = ["item1", "item2", "item3"];
      const mapFunc: MapFunc<string> = jest.fn().mockResolvedValue("result");

      mockExecuteConcurrently.mockResolvedValue([
        "result1",
        "result2",
        "result3",
      ]);

      await mapHandler(items, mapFunc);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        undefined,
        [
          { id: "map-item-0", data: "item1", index: 0 },
          { id: "map-item-1", data: "item2", index: 1 },
          { id: "map-item-2", data: "item3", index: 2 },
        ],
        expect.any(Function),
        TEST_CONSTANTS.DEFAULT_MAP_CONFIG,
      );
    });

    it("should create executor that calls mapFunc correctly", async () => {
      const items = ["item1", "item2"];
      const mapFunc: MapFunc<string> = jest
        .fn()
        .mockResolvedValueOnce("result1")
        .mockResolvedValueOnce("result2");

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

      const result = await mapHandler(items, mapFunc);

      expect(result).toEqual(["result1", "result2"]);
      expect(mapFunc).toHaveBeenCalledTimes(2);
      expect(mapFunc).toHaveBeenCalledWith(
        expect.any(Object),
        "item1",
        0,
        items,
      );
      expect(mapFunc).toHaveBeenCalledWith(
        expect.any(Object),
        "item2",
        1,
        items,
      );
    });

    it("should pass through maxConcurrency config", async () => {
      const items = ["item1", "item2"];
      const mapFunc: MapFunc<string> = jest.fn().mockResolvedValue("result");
      const config = {
        ...TEST_CONSTANTS.DEFAULT_MAP_CONFIG,
        maxConcurrency: 5,
      };

      mockExecuteConcurrently.mockResolvedValue(["result1", "result2"]);

      await mapHandler("test-map", items, mapFunc, config);

      expect(mockExecuteConcurrently).toHaveBeenCalledWith(
        "test-map",
        expect.any(Array),
        expect.any(Function),
        config,
      );
    });
  });
});
