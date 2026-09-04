export type EntityId = string | number;
export type RequestPayload = object;
export type QueryParameters = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ApiEnvelope<T> {
  EC: number | string;
  EM: string;
  DT: T;
}
