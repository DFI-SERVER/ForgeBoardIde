import { invoke } from "@tauri-apps/api/core";

export interface PingResponse {
  pong: string;
  version: string;
}

export async function ping(): Promise<PingResponse> {
  return invoke<PingResponse>("ping");
}
