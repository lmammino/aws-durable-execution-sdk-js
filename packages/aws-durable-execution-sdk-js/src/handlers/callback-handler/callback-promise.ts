import {
  ExecutionContext,
  DurablePromise,
  OperationLifecycleState,
} from "../../types";
import { OperationStatus } from "@aws-sdk/client-lambda";
import { safeDeserialize } from "../../errors/serdes-errors/serdes-errors";
import {
  CallbackError,
  CallbackTimeoutError,
} from "../../errors/durable-error/durable-error";
import { Serdes } from "../../utils/serdes/serdes";
import { log } from "../../utils/logger/logger";
import { Checkpoint } from "../../utils/checkpoint/checkpoint-helper";

export const createCallbackPromise = <T>(
  context: ExecutionContext,
  checkpoint: Checkpoint,
  stepId: string,
  stepName: string | undefined,
  serdes: Omit<Serdes<T>, "serialize">,
  checkAndUpdateReplayMode: () => void,
): DurablePromise<T> => {
  return new DurablePromise(async (): Promise<T> => {
    log("🔄", "Callback promise phase 2:", { stepId, stepName });

    checkpoint.markOperationAwaited(stepId);

    await checkpoint.waitForStatusChange(stepId);

    const stepData = context.getStepData(stepId);

    if (stepData?.Status === OperationStatus.SUCCEEDED) {
      log("✅", "Callback completed:", { stepId });
      checkAndUpdateReplayMode();

      checkpoint.markOperationState(stepId, OperationLifecycleState.COMPLETED);

      const callbackData = stepData.CallbackDetails;
      if (!callbackData) {
        throw new CallbackError(
          `No callback data found for completed callback: ${stepId}`,
        );
      }

      const result = await safeDeserialize(
        serdes,
        callbackData.Result,
        stepId,
        stepName,
        context.terminationManager,
        context.durableExecutionArn,
      );

      return result as T;
    }

    // Handle failure
    log("❌", "Callback failed:", { stepId, status: stepData?.Status });

    checkpoint.markOperationState(stepId, OperationLifecycleState.COMPLETED);

    const callbackData = stepData?.CallbackDetails;
    const error = callbackData?.Error;
    const isTimedOut = stepData?.Status === OperationStatus.TIMED_OUT;

    if (error) {
      const cause = new Error(error.ErrorMessage);
      cause.name = error.ErrorType || "Error";
      cause.stack = error.StackTrace?.join("\n");

      if (isTimedOut) {
        throw new CallbackTimeoutError(
          error.ErrorMessage || "Callback timed out",
          cause,
          error.ErrorData,
        );
      }

      throw new CallbackError(
        error.ErrorMessage || "Callback failed",
        cause,
        error.ErrorData,
      );
    }

    if (isTimedOut) {
      throw new CallbackTimeoutError("Callback timed out");
    }

    throw new CallbackError("Callback failed");
  });
};
