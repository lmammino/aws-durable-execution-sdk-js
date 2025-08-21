import {
  OperationType,
  Operation,
  OperationStatus,
  SendDurableExecutionCallbackSuccessCommand,
  ErrorObject,
  SendDurableExecutionCallbackFailureCommand,
  SendDurableExecutionCallbackHeartbeatCommand,
  SendDurableExecutionCallbackFailureCommandOutput,
  SendDurableExecutionCallbackHeartbeatCommandOutput,
} from "@amzn/dex-internal-sdk";
import { CheckpointOperation } from "../../../checkpoint-server/storage/checkpoint-manager";
import {
  DurableOperation,
  WaitingOperationStatus,
} from "../../durable-test-runner";
import { getDurableExecutionsClient } from "../../local/api-client/durable-executions-client";
import { OperationWaitManager } from "../../local/operations/operation-wait-manager";
import { doesStatusMatch } from "../../local/operations/status-matcher";
import { tryJsonParse } from "../utils";
import { IndexedOperations } from "../indexed-operations";

export interface OperationResultContextDetails<ResultValue = unknown> {
  readonly result: ResultValue | undefined;
  readonly error: ErrorObject | undefined;
}

export interface OperationResultStepDetails<ResultValue = unknown> {
  readonly attempt: number | undefined;
  readonly nextAttemptTimestamp: Date | undefined;
  readonly result: ResultValue | undefined;
  readonly error: ErrorObject | undefined;
}

export interface OperationResultCallbackDetails<ResultValue = unknown> {
  readonly callbackId: string;
  readonly error?: ErrorObject;
  readonly result?: ResultValue;
}

export interface WaitResultDetails {
  readonly waitSeconds?: number;
}

export class OperationWithData<OperationResultValue = unknown>
  implements DurableOperation<OperationResultValue>
{
  constructor(
    private readonly waitManager: OperationWaitManager,
    private readonly operationIndex: IndexedOperations,
    private checkpointOperationData?: CheckpointOperation | undefined
  ) {}

  populateData(checkpointOperation: CheckpointOperation) {
    this.checkpointOperationData = checkpointOperation;
  }

  async waitForData(
    status: WaitingOperationStatus = WaitingOperationStatus.STARTED
  ): Promise<OperationWithData<OperationResultValue>> {
    if (
      doesStatusMatch(this.checkpointOperationData?.operation.Status, status)
    ) {
      return new OperationWithData(
        this.waitManager,
        this.operationIndex,
        this.checkpointOperationData
      );
    }

    await this.waitManager.waitForOperation(this, status);
    return new OperationWithData(
      this.waitManager,
      this.operationIndex,
      this.checkpointOperationData
    );
  }

  getContextDetails():
    | OperationResultContextDetails<OperationResultValue>
    | undefined {
    const operationData = this.getOperationData();

    if (!operationData) {
      return undefined;
    }

    if (operationData.Type !== OperationType.CONTEXT) {
      throw new Error(`Operation type ${operationData.Type} is not CONTEXT`);
    }

    const contextDetails = operationData.ContextDetails;

    return {
      result: tryJsonParse(contextDetails?.Result),
      error: contextDetails?.Error,
    };
  }

  getStepDetails():
    | OperationResultStepDetails<OperationResultValue>
    | undefined {
    const operationData = this.getOperationData();

    if (!operationData) {
      return undefined;
    }

    if (operationData.Type !== OperationType.STEP) {
      throw new Error(`Operation type ${operationData.Type} is not STEP`);
    }

    const stepDetails = operationData.StepDetails;

    return {
      attempt: stepDetails?.Attempt,
      nextAttemptTimestamp: stepDetails?.NextAttemptTimestamp,
      result: tryJsonParse(stepDetails?.Result),
      error: stepDetails?.Error,
    };
  }

  getCallbackDetails():
    | OperationResultCallbackDetails<OperationResultValue>
    | undefined {
    const operationData = this.getOperationData();

    if (!operationData) {
      return undefined;
    }

    // TODO: also check the operation subtype (when it is added)
    if (operationData.Type !== OperationType.CALLBACK) {
      throw new Error(`Operation type ${operationData.Type} is not CALLBACK`);
    }

    const callbackDetails = operationData.CallbackDetails;

    const callbackId = operationData.CallbackDetails?.CallbackId;
    if (callbackId === undefined) {
      throw new Error("Could not find callback ID in callback details");
    }

    return {
      callbackId,
      error: callbackDetails?.Error,
      result: tryJsonParse(callbackDetails?.Result),
    };
  }

  getWaitDetails(): WaitResultDetails | undefined {
    const operationData = this.getOperationData();

    if (!operationData) {
      return undefined;
    }

    if (operationData.Type !== OperationType.WAIT) {
      throw new Error(`Operation type ${operationData.Type} is not WAIT`);
    }

    return {
      waitSeconds:
        this.checkpointOperationData?.update.WaitOptions?.WaitSeconds,
    };
  }

  getChildOperations(): OperationWithData[] | undefined {
    const result = this.getOperationData();
    if (!result) {
      return undefined;
    }

    if (!result.Id) {
      throw new Error("Could not find operation ID");
    }

    const checkpointOperations = this.operationIndex.getOperationChildren(
      result.Id
    );

    return checkpointOperations.map(
      (checkpointOperation) =>
        new OperationWithData(
          this.waitManager,
          this.operationIndex,
          checkpointOperation
        )
    );
  }

  // TODO: need subtypes to properly get operations by path for map/parallel
  // getChildOperationByPath(path: (string | number)[]): EnhancedOperationData;

  getOperationData(): Operation | undefined {
    return this.checkpointOperationData?.operation;
  }

  getId(): string | undefined {
    return this.checkpointOperationData?.operation.Id;
  }

  getName(): string | undefined {
    return this.checkpointOperationData?.operation.Name;
  }

  getType(): OperationType | undefined {
    return this.checkpointOperationData?.operation.Type;
  }

  getStatus(): OperationStatus | undefined {
    return this.checkpointOperationData?.operation.Status;
  }

  getStartTimestamp(): Date | undefined {
    return this.checkpointOperationData?.operation.StartTimestamp;
  }

  getEndTimestamp(): Date | undefined {
    return this.checkpointOperationData?.operation.EndTimestamp;
  }

  sendCallbackSuccess(result: string | OperationResultValue) {
    const callbackDetails = this.getCallbackDetails();

    if (!callbackDetails) {
      throw new Error("Could not find callback details");
    }

    const client = getDurableExecutionsClient();

    return client.send(
      new SendDurableExecutionCallbackSuccessCommand({
        Result: typeof result === "string" ? result : JSON.stringify(result),
        CallbackId: callbackDetails.callbackId,
      })
    );
  }

  sendCallbackFailure(
    error: ErrorObject
  ): Promise<SendDurableExecutionCallbackFailureCommandOutput> {
    const callbackDetails = this.getCallbackDetails();

    if (!callbackDetails) {
      throw new Error("Could not find callback details");
    }
    const client = getDurableExecutionsClient();

    return client.send(
      new SendDurableExecutionCallbackFailureCommand({
        Error: error,
        CallbackId: callbackDetails.callbackId,
      })
    );
  }

  sendCallbackHeartbeat(): Promise<SendDurableExecutionCallbackHeartbeatCommandOutput> {
    const callbackDetails = this.getCallbackDetails();

    if (!callbackDetails) {
      throw new Error("Could not find callback details");
    }

    const client = getDurableExecutionsClient();

    return client.send(
      new SendDurableExecutionCallbackHeartbeatCommand({
        CallbackId: callbackDetails.callbackId,
      })
    );
  }
}
