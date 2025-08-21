import { MockOperation } from "./mock-operation";
import { IndexedOperations } from "../../common/indexed-operations";
import { CheckpointOperation } from "../../../checkpoint-server/storage/checkpoint-manager";
import { ExecutionId } from "../../../checkpoint-server/utils/tagged-strings";
import { OperationWaitManager } from "./operation-wait-manager";
import { OperationWithData } from "../../common/operations/operation-with-data";
import { OperationType } from "@amzn/dex-internal-sdk";

export class OperationStorage {
  private readonly mockOperations: MockOperation[] = [];

  constructor(
    private readonly waitManager: OperationWaitManager,
    private readonly indexedOperations: IndexedOperations
  ) {}

  private populateMockOperation(mockOperation: MockOperation) {
    if (mockOperation._mockId !== undefined) {
      const data = this.indexedOperations.getById(mockOperation._mockId);
      if (data) {
        mockOperation.populateData(data);
        this.waitManager.tryResolveWaitingOperations(
          mockOperation,
          data.operation.Status
        );
      }
      return;
    }

    if (mockOperation._mockName !== undefined) {
      const data = this.indexedOperations.getByNameAndIndex(
        mockOperation._mockName,
        mockOperation._mockIndex
      );
      if (data) {
        mockOperation.populateData(data);
        this.waitManager.tryResolveWaitingOperations(
          mockOperation,
          data.operation.Status
        );
      }
      return;
    }

    if (mockOperation._mockIndex !== undefined) {
      const data = this.indexedOperations.getByIndex(mockOperation._mockIndex);
      if (data) {
        mockOperation.populateData(data);
        this.waitManager.tryResolveWaitingOperations(
          mockOperation,
          data.operation.Status
        );
      }
      return;
    }
  }

  getCompletedOperations(): OperationWithData[] {
    return (
      this.indexedOperations
        .getOperations()
        .map((data) => {
          const operation = new OperationWithData(
            this.waitManager,
            this.indexedOperations
          );
          operation.populateData(data);
          return operation;
        })
        // TODO: should we even add execution operations to the storage?
        .filter((operation) => operation.getType() !== OperationType.EXECUTION)
    );
  }

  registerMocks(executionId: ExecutionId) {
    for (const mockOperation of this.mockOperations) {
      mockOperation.registerMocks(executionId);
    }
  }

  /**
   * Will be run every time checkpoint data is received.
   * @param checkpointOperations
   */
  populateOperations(checkpointOperations: CheckpointOperation[]) {
    if (!checkpointOperations.length) {
      return;
    }

    this.indexedOperations.addOperations(checkpointOperations);

    // TODO: consider optimizing the list iteration
    // we call this every time we get checkpoint data
    for (const mockOperation of this.mockOperations) {
      this.populateMockOperation(mockOperation);
    }
  }

  registerOperation(operation: MockOperation) {
    this.mockOperations.push(operation);
    this.populateMockOperation(operation);
  }
}
