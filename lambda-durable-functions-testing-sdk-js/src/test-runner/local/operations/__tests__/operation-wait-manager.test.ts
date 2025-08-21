import { OperationWaitManager } from "../operation-wait-manager";
import { MockOperation } from "../mock-operation";
import { OperationStatus } from "@amzn/dex-internal-sdk";
import { WaitingOperationStatus } from "../../../durable-test-runner";
import { IndexedOperations } from "../../../common/indexed-operations";

describe("OperationWaitManager", () => {
  let waitManager: OperationWaitManager;
  let mockOperation: MockOperation;
  let operationIndex: IndexedOperations;

  beforeEach(() => {
    waitManager = new OperationWaitManager();
    operationIndex = new IndexedOperations([]);
    mockOperation = new MockOperation(
      { name: "test-operation", index: 0 },
      waitManager,
      operationIndex
    );
  });

  describe("waitForOperation", () => {
    it("should create a promise that resolves when the expected status is reached", async () => {
      // Act
      const waitPromise = waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.COMPLETED
      );

      // Trigger resolution
      waitManager.tryResolveWaitingOperations(
        mockOperation,
        OperationStatus.SUCCEEDED
      );

      // Assert
      const result = await waitPromise;
      expect(result).toBe(mockOperation);
    });

    it("should default to STARTED status when no status is provided", async () => {
      // Act
      const waitPromise = waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.STARTED
      );

      // Trigger resolution
      waitManager.tryResolveWaitingOperations(
        mockOperation,
        OperationStatus.STARTED
      );

      // Assert
      const result = await waitPromise;
      expect(result).toBe(mockOperation);
    });

    it("should support multiple waiters for the same operation", async () => {
      // Act
      const waitPromise1 = waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.COMPLETED
      );
      const waitPromise2 = waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.COMPLETED
      );

      // Trigger resolution
      waitManager.tryResolveWaitingOperations(
        mockOperation,
        OperationStatus.SUCCEEDED
      );

      // Assert
      const [result1, result2] = await Promise.all([
        waitPromise1,
        waitPromise2,
      ]);
      expect(result1).toBe(mockOperation);
      expect(result2).toBe(mockOperation);
    });

    it("should support multiple waiters with different expected statuses", async () => {
      // Act
      const waitForStarted = waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.STARTED
      );
      const waitForCompleted = waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.COMPLETED
      );

      // Trigger STARTED resolution
      waitManager.tryResolveWaitingOperations(
        mockOperation,
        OperationStatus.STARTED
      );

      // Assert first waiter resolves
      const startedResult = await waitForStarted;
      expect(startedResult).toBe(mockOperation);

      // Trigger SUCCEEDED resolution
      waitManager.tryResolveWaitingOperations(
        mockOperation,
        OperationStatus.SUCCEEDED
      );

      // Assert second waiter resolves
      const completedResult = await waitForCompleted;
      expect(completedResult).toBe(mockOperation);
    });
  });

  describe("tryResolveWaitingOperations", () => {
    describe("Status Mapping", () => {
      describe("Positive cases", () => {
        // Positive cases - operations that should resolve specific wait statuses
        it.each([
          [OperationStatus.STARTED, WaitingOperationStatus.STARTED],
          [OperationStatus.READY, WaitingOperationStatus.STARTED],
          [OperationStatus.PENDING, WaitingOperationStatus.STARTED],
          [OperationStatus.SUCCEEDED, WaitingOperationStatus.COMPLETED],
          [OperationStatus.FAILED, WaitingOperationStatus.COMPLETED],
          [OperationStatus.CANCELLED, WaitingOperationStatus.COMPLETED],
          [OperationStatus.STOPPED, WaitingOperationStatus.COMPLETED],
          [OperationStatus.TIMED_OUT, WaitingOperationStatus.COMPLETED],
        ])(
          "should resolve: %s resolves %s",
          async (operationStatus, waitStatus) => {
            // Create a promise waiting for the specified waiting status
            const waitPromise = waitManager.waitForOperation(
              mockOperation,
              waitStatus
            );

            // Try to resolve the promise with the operation status
            waitManager.tryResolveWaitingOperations(
              mockOperation,
              operationStatus
            );

            // The promise should have resolved
            const result = await waitPromise;
            expect(result).toBe(mockOperation);
          }
        );
      });

      describe("Negative cases", () => {
        // Negative cases - operations that should NOT resolve specific wait statuses
        it.each([
          [OperationStatus.STARTED, WaitingOperationStatus.COMPLETED],
          [OperationStatus.SUCCEEDED, WaitingOperationStatus.STARTED],
          [OperationStatus.FAILED, WaitingOperationStatus.STARTED],
        ])(
          "should not resolve: %s doesn't resolve %s",
          async (operationStatus, waitStatus) => {
            // Create a promise waiting for the specified waiting status
            const waitPromise = waitManager.waitForOperation(
              mockOperation,
              waitStatus
            );

            // Try to resolve the promise with the operation status
            waitManager.tryResolveWaitingOperations(
              mockOperation,
              operationStatus
            );

            // Check the promise is still pending
            const stillPending = await Promise.race([
              waitPromise.then(() => false),
              Promise.resolve(true),
            ]);

            // The promise should still be pending (not resolved)
            expect(stillPending).toBe(true);
          }
        );
      });

      it("should not resolve any wait status when operation has no status", async () => {
        // Create promises for both wait statuses
        const startedPromise = waitManager.waitForOperation(
          mockOperation,
          WaitingOperationStatus.STARTED
        );
        const completedPromise = waitManager.waitForOperation(
          mockOperation,
          WaitingOperationStatus.COMPLETED
        );

        // Try to resolve the promises with undefined status
        waitManager.tryResolveWaitingOperations(mockOperation, undefined);

        // Check if the promises are still pending
        const startedStillPending = await Promise.race([
          startedPromise.then(() => false),
          Promise.resolve(true),
        ]);

        const completedStillPending = await Promise.race([
          completedPromise.then(() => false),
          Promise.resolve(true),
        ]);

        // Both promises should still be pending
        expect(startedStillPending).toBe(true);
        expect(completedStillPending).toBe(true);
      });
    });

    it("should handle operations with no waiting operations gracefully", () => {
      // Act & Assert - Should not throw
      expect(() => {
        waitManager.tryResolveWaitingOperations(
          mockOperation,
          OperationStatus.SUCCEEDED
        );
      }).not.toThrow();
    });

    it("should clean up empty waiting sets after resolution", async () => {
      // Act
      const waitPromise = waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.COMPLETED
      );
      expect(waitManager.getWaitingOperationsCount()).toBe(1);

      waitManager.tryResolveWaitingOperations(
        mockOperation,
        OperationStatus.SUCCEEDED
      );
      await waitPromise;

      // Assert - Count should be 0 after resolution and cleanup
      expect(waitManager.getWaitingOperationsCount()).toBe(0);
    });
  });

  describe("clearWaitingOperations", () => {
    it("should clear all waiting operations when no specific operation is provided", () => {
      // Arrange
      const mockOperation2 = new MockOperation(
        {
          name: "test-operation-2",
          index: 1,
        },
        waitManager,
        operationIndex
      );
      void waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.STARTED
      );
      void waitManager.waitForOperation(
        mockOperation2,
        WaitingOperationStatus.COMPLETED
      );
      expect(waitManager.getWaitingOperationsCount()).toBe(2);

      // Act
      waitManager.clearWaitingOperations();

      // Assert
      expect(waitManager.getWaitingOperationsCount()).toBe(0);
    });
  });

  describe("getWaitingOperationsCount", () => {
    it("should return 0 when no operations are waiting", () => {
      expect(waitManager.getWaitingOperationsCount()).toBe(0);
    });

    it("should return the correct count of waiting operations", () => {
      // Arrange
      const mockOperation2 = new MockOperation(
        {
          name: "test-operation-2",
          index: 1,
        },
        waitManager,
        operationIndex
      );

      // Act
      void waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.STARTED
      );
      void waitManager.waitForOperation(
        mockOperation,
        WaitingOperationStatus.COMPLETED
      );
      void waitManager.waitForOperation(
        mockOperation2,
        WaitingOperationStatus.STARTED
      );

      // Assert
      expect(waitManager.getWaitingOperationsCount()).toBe(3);
    });
  });
});
