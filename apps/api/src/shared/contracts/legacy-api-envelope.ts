export interface LegacyApiEnvelope<TData> {
    EM: string;
    EC: number;
    DT: TData;
}

/**
 * Maps only the payload while retaining the established EM/EC/DT response shape.
 */
export function mapLegacyEnvelopeData<
    TEnvelope extends LegacyApiEnvelope<unknown>,
    TMappedData,
>(
    envelope: TEnvelope,
    mapData: (data: TEnvelope["DT"]) => TMappedData,
): Omit<TEnvelope, "DT"> & { DT: TMappedData } {
    return {
        ...envelope,
        DT: mapData(envelope.DT),
    };
}
