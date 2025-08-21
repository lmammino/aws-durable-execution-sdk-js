import { OperationStatus } from "@amzn/dex-internal-sdk";
import {
  DurableOperation,
  WaitingOperationStatus,
} from "../../durable-test-runner";
import { doesStatusMatch } from "./status-matcher";

interface WaitingOperationInfo {
  resolve: (mockOperation: DurableOperation<unknown>) => void;
  expectedStatus: WaitingOperationStatus;
}

/**
 * Manages waiting operations and promise resolution for mock operations.
 * Separated from OperationStorage to maintain single responsibility principle.
 */
export class OperationWaitManager {
  private readonly operationsWaiting = new Map<
    DurableOperation<unknown>,
    Set<WaitingOperationInfo>
  >();

  /**
   * Creates a promise that resolves when the specified operation reaches the expected status.
   * @param operation The mock operation to wait for
   * @param status The expected status (defaults to STARTED)
   * @returns Promise that resolves with the mock operation when the status is reached
   */
  waitForOperation(
    operation: DurableOperation<unknown>,
    status: WaitingOperationStatus
  ): Promise<DurableOperation<unknown>> {
    return new Promise<DurableOperation<unknown>>((resolve) => {
      const operationsWaiting =
        this.operationsWaiting.get(operation) ??
        new Set<WaitingOperationInfo>();

      operationsWaiting.add({
        resolve,
        expectedStatus: status,
      });

      this.operationsWaiting.set(operation, operationsWaiting);
    });
  }

  /**
   * Attempts to resolve any waiting operations for the given mock operation.
   * Called when operation data is updated.
   * @param mockOperation The mock operation that was updated
   * @param status The current status of the operation object
   */
  tryResolveWaitingOperations(
    mockOperation: DurableOperation<unknown>,
    status: OperationStatus | undefined
  ): void {
    const waitingOperationsSet = this.operationsWaiting.get(mockOperation);
    if (!waitingOperationsSet) {
      return;
    }

    for (const waitingOperation of waitingOperationsSet) {
      if (doesStatusMatch(status, waitingOperation.expectedStatus)) {
        waitingOperationsSet.delete(waitingOperation);
        waitingOperation.resolve(mockOperation);
      }
    }

    // Clean up empty sets
    if (waitingOperationsSet.size === 0) {
      this.operationsWaiting.delete(mockOperation);
    }
  }

  /**
   * Clears all waiting operations. Useful for cleanup.
   */
  clearWaitingOperations(): void {
    this.operationsWaiting.clear();
  }

  /**
   * Gets the number of operations currently being waited for.
   * Useful for testing and debugging.
   * @returns The total number of waiting operations
   */
  getWaitingOperationsCount(): number {
    let totalCount = 0;
    for (const waitingSet of this.operationsWaiting.values()) {
      totalCount += waitingSet.size;
    }
    return totalCount;
  }
}
