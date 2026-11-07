import { useCallback, useEffect, useRef, useState } from "react";

import { getPreferenceValues } from "@vicinae/api";

import { readLocalInfo, type LocalInfo } from "~/api/local.ts";
import type { PublicInfo } from "~/api/public.ts";
import { getPublicIp } from "~/api/public-store.ts";
import { readAppTraffic, readDevSample } from "~/api/traffic.ts";
import type { AppTraffic } from "~/utils/parse.ts";
import { applySample, initialRateState, type RateState } from "~/utils/rates.ts";

const LOCAL_INTERVAL_MS = 10_000;
const APP_INTERVAL_MS = 2500;
const PUBLIC_INTERVAL_MS = 300_000;

export interface NetworkState {
	local: LocalInfo | null;
	publicIp: PublicInfo | null;
	apps: AppTraffic[];
	rates: RateState;
	loading: boolean;
	refresh: (force?: boolean) => void;
}

export function useNetwork(): NetworkState {
	const prefs = getPreferenceValues<Preferences>();
	const scope = prefs.interfaceScope === "all" ? "all" : "primary";
	const sampleMs = Number(prefs.speedInterval ?? "2000") || 2000;
	const showPerApp = prefs.showPerApp ?? true;

	const [local, setLocal] = useState<LocalInfo | null>(null);
	const [publicIp, setPublicIp] = useState<PublicInfo | null>(null);
	const [apps, setApps] = useState<AppTraffic[]>([]);
	const [rates, setRates] = useState<RateState>(initialRateState);
	const [loading, setLoading] = useState(true);
	const ratesRef = useRef(rates);
	const ifaceRef = useRef("");

	const sample = useCallback(async () => {
		const dev = await readDevSample(scope, ifaceRef.current);
		if (!dev) return;
		ratesRef.current = applySample(ratesRef.current, dev, Date.now());
		setRates(ratesRef.current);
	}, [scope]);

	const loadLocal = useCallback(async () => {
		const info = await readLocalInfo();
		ifaceRef.current = info.primary?.iface ?? "";
		setLocal(info);
		setLoading(false);
	}, []);

	const loadPublic = useCallback(async (force = false) => {
		setPublicIp(await getPublicIp(force));
	}, []);

	const loadApps = useCallback(async () => {
		setApps(await readAppTraffic());
	}, []);

	const refresh = useCallback(
		(force = false) => {
			void loadLocal();
			void sample();
			void loadPublic(force);
			if (showPerApp) void loadApps();
		},
		[loadLocal, sample, loadPublic, loadApps, showPerApp],
	);

	useEffect(() => {
		refresh();
		const timers = [
			setInterval(() => void sample(), sampleMs),
			setInterval(() => void loadLocal(), LOCAL_INTERVAL_MS),
			setInterval(() => void loadPublic(), PUBLIC_INTERVAL_MS),
		];
		if (showPerApp) timers.push(setInterval(() => void loadApps(), APP_INTERVAL_MS));
		return () => timers.forEach(clearInterval);
	}, [refresh, sample, sampleMs, loadLocal, loadPublic, loadApps, showPerApp]);

	return { local, publicIp, apps, rates, loading, refresh };
}