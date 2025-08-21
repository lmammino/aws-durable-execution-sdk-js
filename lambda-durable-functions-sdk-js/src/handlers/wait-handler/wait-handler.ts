import { ExecutionContext, OperationSubType } from "../../types";
import { OperationStatus, OperationType } from "@amzn/dex-internal-sdk";
import { log } from "../../utils/logger/logger";
import { createCheckpoint } from "../../utils/checkpoint/checkpoint";
import { TerminationReason } from "../../termination-manager/types";
import { OperationInterceptor } from "../../mocks/operation-interceptor";
import { CheckpointFailedError } from "../../errors/checkpoint-errors/checkpoint-errors";

export const createWaitHandler = (
  context: ExecutionContext,
  checkpoint: ReturnType<typeof createCheckpoint>,
  createStepId: () => string,
) => {
  return async (millis: number, name?: string | undefined): Promise<void> => {
    const stepId = createStepId();

    log(context.isVerbose, "⏲️", "Wait requested:", { stepId, name, millis });

    if (context.getStepData(stepId)?.Status === OperationStatus.SUCCEEDED) {
      log(context.isVerbose, "⏭️", "Wait already completed:", { stepId });
      return;
    }

    const wouldBeMocked = OperationInterceptor.forExecution(
      context.durableExecutionArn,
    ).recordOnly(name);
    if (wouldBeMocked) {
      throw new CheckpointFailedError("Wait step cannot be mocked");
    }

    await checkpoint(stepId, {
      Id: stepId,
      ParentId: context.parentId,
      Action: "START",
      SubType: OperationSubType.WAIT,
      Type: OperationType.WAIT,
      Name: name,
      WaitOptions: {
        WaitSeconds: millis / 1000,
      },
    });

    context.terminationManager.terminate({
      reason: TerminationReason.WAIT_SCHEDULED,
      message: `Operation ${name || stepId} scheduled to wait`,
    });

    return new Promise(() => {});
  };
};
