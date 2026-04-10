export interface ActionResponseTransport {
  send(line: string): Promise<void>;
}
