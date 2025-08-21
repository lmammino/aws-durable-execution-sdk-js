import {
  CheckpointDurableExecutionCommand,
  CheckpointDurableExecutionRequest,
  CheckpointDurableExecutionResponse,
  LambdaClient,
  GetDurableExecutionStateCommand,
  GetDurableExecutionStateResponse,
} from "@amzn/dex-internal-sdk";
import {
  DurableExecutionInvocationInput,
  DurableExecutionInvocationOutput,
} from "../types";
import { ExecutionState } from "./storage-provider";
import { getCredentialsProvider } from "./credentials-provider";

/**
 * Implementation of ExecutionState that uses the new @amzn/dex-internal-sdk
 */
export class ApiStorage implements ExecutionState {
  protected client: LambdaClient;

  constructor(endpoint: string, region: string) {
    this.client = new LambdaClient({
      endpoint,
      region,
      credentials: getCredentialsProvider(),
    });
  }

  /**
   * Gets step data from the durable execution
   * @param checkpointToken The checkpoint token
   * @param nextMarker The pagination token
   * @returns Response with operations data
   */
  async getStepData(
    checkpointToken: string,
    nextMarker: string,
  ): Promise<GetDurableExecutionStateResponse> {
    const response = await this.client.send(
      new GetDurableExecutionStateCommand({
        CheckpointToken: checkpointToken,
        Marker: nextMarker,
        MaxItems: 1000,
      }),
    );

    return response;
  }

  /**
   * Checkpoints the durable execution with operation updates
   * @param checkpointToken The checkpoint token
   * @param data The checkpoint data
   * @returns Checkpoint response
   */
  async checkpoint(
    checkpointToken: string,
    data: CheckpointDurableExecutionRequest,
  ): Promise<CheckpointDurableExecutionResponse> {
    const response = await this.client.send(
      new CheckpointDurableExecutionCommand({
        CheckpointToken: checkpointToken,
        ClientToken: data.ClientToken,
        Updates: data.Updates,
      }),
    );
    return response;
  }

  /**
   * Optional complete method
   */
  complete?(
    _event: DurableExecutionInvocationInput,
    _response: DurableExecutionInvocationOutput | null,
  ): void {
    // Implementation if needed
  }
}
