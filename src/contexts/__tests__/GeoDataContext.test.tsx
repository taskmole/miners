import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { GeoDataProvider, useGeoData } from "@/contexts/GeoDataContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <GeoDataProvider>{children}</GeoDataProvider>;
const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: null }] };
const empty = { type: "FeatureCollection", features: [] };

function respond(body: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("GeoDataContext", () => {
    const fetchMock = vi.fn();
    beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

    it("loads nothing until asked", () => {
        renderHook(() => useGeoData(), { wrapper });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("downloads each file once no matter how often it is asked", async () => {
        fetchMock.mockImplementation(() => respond(fc));
        const { result } = renderHook(() => useGeoData(), { wrapper });
        act(() => { result.current.requestGeoData(); result.current.requestGeoData(); });
        await waitFor(() => expect(result.current.incomeData).not.toBeNull());
        act(() => result.current.requestGeoData());
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("treats an empty answer as a failure and retries only after the cooldown", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        fetchMock.mockImplementation(() => respond(empty));
        const { result } = renderHook(() => useGeoData(), { wrapper });
        vi.spyOn(console, "error").mockImplementation(() => {});
        await act(async () => { result.current.requestGeoData(); await Promise.resolve(); });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        expect(result.current.incomeData).toBeNull();

        act(() => result.current.requestGeoData());
        expect(fetchMock).toHaveBeenCalledTimes(2); // still cooling down

        fetchMock.mockImplementation(() => respond(fc));
        vi.setSystemTime(Date.now() + 31_000);
        act(() => result.current.requestGeoData());
        await waitFor(() => expect(result.current.incomeData).not.toBeNull());
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });
});
