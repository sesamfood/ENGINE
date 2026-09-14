import "qz-tray";

declare module "qz-tray" {
  // The upstream typings omit QZ's documented pre-signed print overload.
  export function print(
    configs: PrintConfig | PrintConfig[],
    data: PrintData[],
    signature: Array<string | undefined>,
    signingTimestamp: number,
  ): Promise<void>;
}
