import { OperationStatus, OperationType } from "@amzn/dex-internal-sdk";
import { OperationStorage } from "../operation-storage";
import { OperationWaitManager } from "../operation-wait-manager";
import { MockOperation } from "../mock-operation";
import { CheckpointOperation } from "../../../../checkpoint-server/storage/checkpoint-manager";
import { createExecutionId } from "../../../../checkpoint-server/utils/tagged-strings";
import { IndexedOperations } from "../../../common/indexed-operations";

// Mock the OperationWaitManager
jest.mock("../operation-wait-manager");

describe("OperationStorage", () => {
  let mockWaitManager: jest.Mocked<OperationWaitManager>;
  let mockIndexedOperations: IndexedOperations;

  // Sample operations for testing
  const sampleOperations: CheckpointOperation[] = [
    {
      operation: {
        Id: "op1",
        Name: "operation1",
        Type: OperationType.STEP,
        Status: OperationStatus.SUCCEEDED,
      },
      update: {},
    },
    {
      operation: {
        Id: "op2",
        Name: "operation2",
        Type: OperationType.WAIT,
        Status: OperationStatus.SUCCEEDED,
      },
      update: {},
    },
    {
      operation: {
        Id: "op3",
        Name: "operation1", // Same name as first operation
        Type: OperationType.CALLBACK,
        Status: OperationStatus.FAILED,
      },
      update: {},
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockWaitManager =
      new OperationWaitManager() as jest.Mocked<OperationWaitManager>;
    mockIndexedOperations = new IndexedOperations([]);
    jest.spyOn(mockWaitManager, "tryResolveWaitingOperations");
  });

  describe("constructor", () => {
    it("should initialize with empty operations", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      expect(storage.getCompletedOperations()).toEqual([]);
    });

    it("should accept a wait manager as dependency", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      expect(storage).toBeDefined();
      // The wait manager should be stored as a private dependency
    });
  });

  describe("getOperations", () => {
    it("should return empty array when no operations have been added", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      expect(storage.getCompletedOperations()).toEqual([]);
    });

    it("should return all operations after they have been populated", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      storage.populateOperations(sampleOperations);

      expect(storage.getCompletedOperations()).toHaveLength(
        sampleOperations.length
      );
    });

    it("should not return execution operations", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      storage.populateOperations(
        sampleOperations.concat({
          operation: {
            Id: "Execution-operation-id",
            Type: OperationType.EXECUTION,
          },
          update: {},
        })
      );

      expect(storage.getCompletedOperations()).toHaveLength(
        sampleOperations.length
      );
    });
  });

  describe("populateOperations", () => {
    it("should add operations to storage", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      storage.populateOperations(sampleOperations);

      expect(storage.getCompletedOperations()).toHaveLength(
        sampleOperations.length
      );
    });

    it("should update registered mock operations with matching ID", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { id: "op1" },
        mockWaitManager,
        mockIndexedOperations
      );

      // Register the mock operation
      storage.registerOperation(mockOperation);

      // Initially no data is populated
      expect(mockOperation.getOperationData()).toBeUndefined();

      // Add operations
      storage.populateOperations(sampleOperations);

      // Now the mock operation should have data
      expect(mockOperation.getOperationData()).toEqual({
        ...sampleOperations[0].operation,
      });
    });

    it("should update registered mock operations with matching name and index", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { name: "operation1", index: 1 },
        mockWaitManager,
        mockIndexedOperations
      );

      // Register the mock operation
      storage.registerOperation(mockOperation);

      // Initially no data is populated
      expect(mockOperation.getOperationData()).toBeUndefined();

      // Add operations
      storage.populateOperations(sampleOperations);

      // Now the mock operation should have data (the second operation with name "operation1")
      expect(mockOperation.getOperationData()).toEqual({
        ...sampleOperations[2].operation,
      });
    });

    it("should update registered mock operations with matching index only", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { index: 1 },
        mockWaitManager,
        mockIndexedOperations
      );

      // Register the mock operation
      storage.registerOperation(mockOperation);

      // Initially no data is populated
      expect(mockOperation.getOperationData()).toBeUndefined();

      // Add operations
      storage.populateOperations(sampleOperations);

      // Now the mock operation should have data (index 1)
      expect(mockOperation.getOperationData()).toEqual({
        ...sampleOperations[1].operation,
      });
    });

    it("should not throw for mock operations without matching operation data", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { name: "nonexistent" },
        mockWaitManager,
        mockIndexedOperations
      );

      // Register the mock operation
      storage.registerOperation(mockOperation);

      // Add operations
      expect(() => {
        storage.populateOperations(sampleOperations);
      }).not.toThrow();

      // The mock operation should still have no data
      expect(mockOperation.getOperationData()).toBeUndefined();
    });

    it("should notify wait manager when operations are populated", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { id: "op1" },
        mockWaitManager,
        mockIndexedOperations
      );

      // Register the mock operation
      storage.registerOperation(mockOperation);

      // Add operations
      storage.populateOperations(sampleOperations);

      // Verify wait manager was notified for the populated operation
      expect(mockWaitManager.tryResolveWaitingOperations).toHaveBeenCalledWith(
        mockOperation,
        OperationStatus.SUCCEEDED
      );
    });

    it("should notify wait manager for multiple populated operations", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation1 = new MockOperation(
        { id: "op1" },
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation2 = new MockOperation(
        { id: "op2" },
        mockWaitManager,
        mockIndexedOperations
      );

      // Register the mock operations
      storage.registerOperation(mockOperation1);
      storage.registerOperation(mockOperation2);

      // Add operations
      storage.populateOperations(sampleOperations);

      // Verify wait manager was notified for both operations
      expect(mockWaitManager.tryResolveWaitingOperations).toHaveBeenCalledWith(
        mockOperation1,
        OperationStatus.SUCCEEDED
      );
      expect(mockWaitManager.tryResolveWaitingOperations).toHaveBeenCalledWith(
        mockOperation2,
        OperationStatus.SUCCEEDED
      );
      expect(mockWaitManager.tryResolveWaitingOperations).toHaveBeenCalledTimes(
        2
      );
    });
  });

  describe("registerOperation", () => {
    it("should register a mock operation", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { name: "test-op" },
        mockWaitManager,
        mockIndexedOperations
      );

      storage.registerOperation(mockOperation);

      // Add operations after registration
      storage.populateOperations([
        {
          operation: {
            Id: "test-id",
            Name: "test-op",
            Type: OperationType.STEP,
            Status: OperationStatus.SUCCEEDED,
          },
          update: {},
        },
      ]);

      // The mock operation should have data populated
      expect(mockOperation.getOperationData()).toEqual({
        Id: "test-id",
        Name: "test-op",
        Type: OperationType.STEP,
        Status: OperationStatus.SUCCEEDED,
      });
    });

    it("should populate mock operation data if matching operation exists", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      // Add operations first
      storage.populateOperations(sampleOperations);

      // Then register a mock operation with matching ID
      const mockOperation = new MockOperation(
        { id: "op2" },
        mockWaitManager,
        mockIndexedOperations
      );
      storage.registerOperation(mockOperation);

      // The mock operation should have data populated immediately
      expect(mockOperation.getOperationData()).toEqual({
        ...sampleOperations[1].operation,
      });
    });

    it("should handle mock operations with empty string id", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { id: "" },
        mockWaitManager,
        mockIndexedOperations
      ); // Empty string is falsy but valid

      storage.registerOperation(mockOperation);

      // Add operations with empty string ID
      storage.populateOperations([
        {
          operation: {
            Id: "", // Empty string ID
            Name: "test-op",
            Type: OperationType.STEP,
            Status: OperationStatus.SUCCEEDED,
          },
          update: {},
        },
      ]);

      // The mock operation should have data populated
      expect(mockOperation.getOperationData()).toEqual({
        Id: "",
        Name: "test-op",
        Type: OperationType.STEP,
        Status: OperationStatus.SUCCEEDED,
      });
    });

    it("should handle mock operations with empty string name", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { name: "" },
        mockWaitManager,
        mockIndexedOperations
      ); // Empty string is falsy but valid

      storage.registerOperation(mockOperation);

      // Add operations with empty string name
      storage.populateOperations([
        {
          operation: {
            Id: "test-id",
            Type: OperationType.STEP,
            Name: "", // Empty string name
            Status: OperationStatus.SUCCEEDED,
          },
          update: {},
        },
      ]);

      // The mock operation should have data populated
      expect(mockOperation.getOperationData()).toEqual({
        Id: "test-id",
        Name: "",
        Type: OperationType.STEP,
        Status: OperationStatus.SUCCEEDED,
      });
    });

    it("should handle mock operations with index 0", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { index: 0 },
        mockWaitManager,
        mockIndexedOperations
      ); // 0 is falsy but valid index

      storage.registerOperation(mockOperation);

      // Add operations
      storage.populateOperations([
        {
          operation: {
            Id: "first-op",
            Name: "operation-at-index-0",
            Type: OperationType.STEP,
            Status: OperationStatus.SUCCEEDED,
          },
          update: {},
        },
        {
          operation: {
            Id: "second-op",
            Name: "operation-at-index-1",
            Type: OperationType.WAIT,
            Status: OperationStatus.SUCCEEDED,
          },
          update: {},
        },
      ]);

      // The mock operation should have data populated with the first operation (index 0)
      expect(mockOperation.getOperationData()).toEqual({
        Id: "first-op",
        Name: "operation-at-index-0",
        Type: OperationType.STEP,
        Status: OperationStatus.SUCCEEDED,
      });
    });

    it("should notify wait manager when registering operations with existing data", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      // Add operations first
      storage.populateOperations(sampleOperations);

      // Then register a mock operation with matching ID
      const mockOperation = new MockOperation(
        { id: "op2" },
        mockWaitManager,
        mockIndexedOperations
      );
      storage.registerOperation(mockOperation);

      // Verify wait manager was notified when the operation was registered
      expect(mockWaitManager.tryResolveWaitingOperations).toHaveBeenCalledWith(
        mockOperation,
        OperationStatus.SUCCEEDED
      );
    });
  });

  describe("registerMocks", () => {
    it("should call registerMocks on all registered mock operations", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation1 = new MockOperation(
        { name: "op1" },
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation2 = new MockOperation(
        { name: "op2" },
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation3 = new MockOperation(
        { index: 0 },
        mockWaitManager,
        mockIndexedOperations
      );

      // Spy on the registerMocks method of each mock operation
      const registerMocksSpy1 = jest.spyOn(mockOperation1, "registerMocks");
      const registerMocksSpy2 = jest.spyOn(mockOperation2, "registerMocks");
      const registerMocksSpy3 = jest.spyOn(mockOperation3, "registerMocks");

      // Register the mock operations
      storage.registerOperation(mockOperation1);
      storage.registerOperation(mockOperation2);
      storage.registerOperation(mockOperation3);

      const executionId = createExecutionId("test-execution-id");

      // Call registerMocks
      storage.registerMocks(executionId);

      // Verify that registerMocks was called on all mock operations with the correct executionId
      expect(registerMocksSpy1).toHaveBeenCalledWith(executionId);
      expect(registerMocksSpy2).toHaveBeenCalledWith(executionId);
      expect(registerMocksSpy3).toHaveBeenCalledWith(executionId);
      expect(registerMocksSpy1).toHaveBeenCalledTimes(1);
      expect(registerMocksSpy2).toHaveBeenCalledTimes(1);
      expect(registerMocksSpy3).toHaveBeenCalledTimes(1);
    });

    it("should not throw when no mock operations are registered", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );

      const executionId = createExecutionId("test-execution-id");

      // Should not throw even with no registered operations
      expect(() => {
        storage.registerMocks(executionId);
      }).not.toThrow();
    });

    it("should handle mixed types of mock operations", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const idBasedMock = new MockOperation(
        { id: "test-id" },
        mockWaitManager,
        mockIndexedOperations
      );
      const nameBasedMock = new MockOperation(
        { name: "test-name", index: 1 },
        mockWaitManager,
        mockIndexedOperations
      );
      const indexBasedMock = new MockOperation(
        { index: 2 },
        mockWaitManager,
        mockIndexedOperations
      );

      // Spy on registerMocks methods
      const idMockSpy = jest.spyOn(idBasedMock, "registerMocks");
      const nameMockSpy = jest.spyOn(nameBasedMock, "registerMocks");
      const indexMockSpy = jest.spyOn(indexBasedMock, "registerMocks");

      // Register different types of mock operations
      storage.registerOperation(idBasedMock);
      storage.registerOperation(nameBasedMock);
      storage.registerOperation(indexBasedMock);

      const executionId = createExecutionId("mixed-execution-id");

      // Call registerMocks
      storage.registerMocks(executionId);

      // All should be called regardless of their type
      expect(idMockSpy).toHaveBeenCalledWith(executionId);
      expect(nameMockSpy).toHaveBeenCalledWith(executionId);
      expect(indexMockSpy).toHaveBeenCalledWith(executionId);
    });

    it("should call registerMocks even if mock operations are not populated with data", () => {
      const storage = new OperationStorage(
        mockWaitManager,
        mockIndexedOperations
      );
      const mockOperation = new MockOperation(
        { name: "nonexistent-op" },
        mockWaitManager,
        mockIndexedOperations
      );

      const registerMocksSpy = jest.spyOn(mockOperation, "registerMocks");

      // Register a mock operation that won't match any real operations
      storage.registerOperation(mockOperation);

      // Populate with operations that don't match
      storage.populateOperations(sampleOperations);

      const executionId = createExecutionId("test-execution-id");

      // registerMocks should still be called even though the operation has no data
      storage.registerMocks(executionId);

      expect(registerMocksSpy).toHaveBeenCalledWith(executionId);
      expect(registerMocksSpy).toHaveBeenCalledTimes(1);
    });
  });
});
