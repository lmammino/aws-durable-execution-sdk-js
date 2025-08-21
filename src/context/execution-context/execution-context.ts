import { ExecutionContext, DurableExecutionInvocationInput } from "../../types";
import { Operation } from "@amzn/dex-internal-sdk";
import { ExecutionStateFactory } from "../../storage/storage-factory";
import { TerminationManager } from "../../termination-manager/termination-manager";
import { log } from "../../utils/logger/logger";
import { randomUUID } from "crypto";
import {
  getStepData as getStepDataUtil,
  hashId,
} from "../../utils/step-id-utils/step-id-utils";

export const initializeExecutionContext = async (
  event: DurableExecutionInvocationInput,
): Promise<{ executionContext: ExecutionContext; checkpointToken: string }> => {
  const isLocalMode = process.env.DURABLE_LOCAL_MODE === "true";
  const isRecordDefinitionMode =
    process.env.DURABLE_RECORD_DEFINITION_MODE === "true";
  const isVerbose =
    process.env.DURABLE_VERBOSE_MODE === "true" || isRecordDefinitionMode;

  const dexEndpoint =
    event.DexEndpoint ||
    process.env.DEX_ENDPOINT ||
    "https://dex.us-east-1.amazonaws.com";
  const dexRegion =
    event.DexRegion ||
    process.env.DEX_REGION ||
    process.env.AWS_REGION ||
    "us-east-1";

  log(isVerbose, "🔵", "Initializing durable function with event:", event);
  log(isVerbose, "🔧", `Running in mode: ${isLocalMode ? "LOCAL" : "LAMBDA"}`);
  log(
    isVerbose,
    "🔧",
    `Recording definition mode: ${isRecordDefinitionMode ? "ENABLED" : "DISABLED"}`,
  );
  log(isVerbose, "📍", "Function Input:", event);
  log(isVerbose, "🛜", "DEX Endpoint:", dexEndpoint);
  log(isVerbose, "🌍", "DEX Region:", dexRegion);

  const checkpointToken = event.CheckpointToken;
  const durableExecutionArn = event.DurableExecutionArn;

  // Temporary log checkpointToken to catch any issue related to Invalid checkpoint token
  log(true, "🔑🔑🔑🔑🔑", "Received checkpointToken:", checkpointToken);

  const state = ExecutionStateFactory.createExecutionState(
    dexEndpoint,
    dexRegion,
  );

  const operationsArray = [...(event.InitialExecutionState.Operations || [])];
  let nextMarker = event.InitialExecutionState.NextMarker;

  while (nextMarker) {
    const response = await state.getStepData(checkpointToken, nextMarker);
    operationsArray.push(...(response.Operations || []));
    nextMarker = response.NextMarker || "";
  }

  const initialExecutionEvent = operationsArray[0];
  const customerHandlerEvent = JSON.parse(
    initialExecutionEvent.ExecutionDetails?.InputPayload ?? "{}",
  );

  log(isVerbose, "📝", "Operations:", operationsArray);

  const stepData: Record<string, Operation> = operationsArray.reduce(
    (acc, operation: Operation) => {
      if (operation.Id) {
        // The stepData received from backend has Id and ParentId as hash, so no need to hash it again
        acc[operation.Id] = operation;
      }
      return acc;
    },
    {} as Record<string, Operation>,
  );

  log(isVerbose, "📝", "Loaded step data:", stepData);

  return {
    executionContext: {
      executionContextId: randomUUID(),
      customerHandlerEvent,
      state,
      _stepData: stepData,
      terminationManager: new TerminationManager(),
      isLocalMode,
      isVerbose,
      durableExecutionArn,
      getStepData(stepId: string) {
        return getStepDataUtil(stepData, stepId);
      },
    },
    checkpointToken,
  };
};
