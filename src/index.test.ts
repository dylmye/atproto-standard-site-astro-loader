import type { LoaderContext } from "astro/loaders";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { type StandardSiteLoaderOptions, standardSiteLoader } from "./index.js";

const BASE_URL = "https://mock.api.bsky.app.local";
const LIST_RECORDS_URL = `${BASE_URL}/xrpc/com.atproto.repo.listRecords`;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// --- Fixtures ---

const makeRecord = (rkey: string, overrides = {}) => ({
	uri: `at://did:plc:abc123/site.standard.document/${rkey}`,
	cid: `bafyreib${rkey}`,
	value: {
		$type: "site.standard.document",
		title: `Document ${rkey}`,
		publishedAt: "2024-01-01T00:00:00Z",
		site: "https://example.com",
		...overrides,
	},
});

// --- Mock context ---

const mockContext = {
	store: { set: vi.fn(), clear: vi.fn() },
	logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
	parseData: vi.fn(({ data }) => Promise.resolve(data)),
};

beforeEach(() => {
	vi.clearAllMocks();
});

// --- Tests ---

describe("standardSiteLoader", () => {
	const defaultOptions: Partial<StandardSiteLoaderOptions> = {
		didUri: "did:plc:abc123",
		serviceBaseUrl: BASE_URL,
	};

	it("clears the store and loads records", async () => {
		server.use(
			http.get(LIST_RECORDS_URL, () =>
				HttpResponse.json({
					records: [makeRecord("self"), makeRecord("other")],
				}),
			),
		);

		const loader = standardSiteLoader(defaultOptions);
		await loader.load(mockContext as unknown as LoaderContext);

		expect(mockContext.store.clear).toHaveBeenCalledOnce();
		expect(mockContext.store.set).toHaveBeenCalledTimes(2);
		expect(mockContext.store.set).toHaveBeenCalledWith(
			expect.objectContaining({ id: "self" }),
		);
	});

	it("stops after one page when fetchAll is false", async () => {
		server.use(
			http.get(LIST_RECORDS_URL, () =>
				HttpResponse.json({
					records: [makeRecord("self")],
					cursor: "next-cursor",
				}),
			),
		);

		await standardSiteLoader(defaultOptions).load(
			mockContext as unknown as LoaderContext,
		);

		expect(mockContext.store.set).toHaveBeenCalledTimes(1);
	});

	it("paginates all pages when fetchAll is true", async () => {
		server.use(
			http.get(LIST_RECORDS_URL, ({ request }) => {
				const cursor = new URL(request.url).searchParams.get("cursor");
				if (!cursor) {
					return HttpResponse.json({
						records: [makeRecord("page1")],
						cursor: "cursor-2",
					});
				}
				return HttpResponse.json({ records: [makeRecord("page2")] });
			}),
		);

		await standardSiteLoader({ ...defaultOptions, fetchAll: true }).load(
			mockContext as unknown as LoaderContext,
		);

		expect(mockContext.store.set).toHaveBeenCalledTimes(2);
	});

	it("skips records with unparseable URIs and warns", async () => {
		server.use(
			http.get(LIST_RECORDS_URL, () =>
				HttpResponse.json({
					records: [{ uri: "not-a-uri", cid: "bafy123", value: {} }],
				}),
			),
		);

		await standardSiteLoader(defaultOptions).load(
			mockContext as unknown as LoaderContext,
		);

		expect(mockContext.store.set).not.toHaveBeenCalled();
		expect(mockContext.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("unparseable URI"),
		);
	});

	it("skips records that fail parseData and warns", async () => {
		server.use(
			http.get(LIST_RECORDS_URL, () =>
				HttpResponse.json({ records: [makeRecord("self")] }),
			),
		);
		mockContext.parseData.mockRejectedValueOnce(new Error("schema mismatch"));

		await standardSiteLoader(defaultOptions).load(
			mockContext as unknown as LoaderContext,
		);

		expect(mockContext.store.set).not.toHaveBeenCalled();
		expect(mockContext.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("schema mismatch"),
		);
	});

	it("logs an error and exits gracefully when the API fails", async () => {
		server.use(http.get(LIST_RECORDS_URL, () => HttpResponse.error()));

		await standardSiteLoader(defaultOptions).load(
			mockContext as unknown as LoaderContext,
		);

		expect(mockContext.logger.error).toHaveBeenCalledWith(
			expect.stringContaining("Failed during fetch"),
		);
		expect(mockContext.store.set).not.toHaveBeenCalled();
	});
});
