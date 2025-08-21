import { ExecutionState } from "./storage-provider";
import { ApiStorage } from "./api-storage";
import { RecordDefinitionStorage } from "./record-definition-storage";

export class ExecutionStateFactory {
  static createExecutionState(
    dexEndpoint: string,
    dexRegion: string,
  ): ExecutionState {
    const isRecordDefinitionMode =
      process.env.DURABLE_RECORD_DEFINITION_MODE === "true";

    if (isRecordDefinitionMode) {
      return new RecordDefinitionStorage(dexEndpoint, dexRegion);
    }

    return new ApiStorage(dexEndpoint, dexRegion);
  }
}
