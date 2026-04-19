/* @ts-self-types="./dist/index.d.ts" */

import { Client, ok, simpleFetchHandler } from "@atcute/client";
import { safeParse } from "@atcute/lexicons";
import {
	type ActorIdentifier,
	isActorIdentifier,
	parseCanonicalResourceUri,
} from "@atcute/lexicons/syntax";
import { type Main, mainSchema } from "@atcute/standard-site/types/document";
import type { Loader } from "astro/loaders";
import { z } from "astro/zod";

const loaderOptionsSchema = z.object({
	collectionName: z.string().default("standard-site-loader"),
	didUri: z.string().refine(isActorIdentifier, {
		message:
			"Must be a valid DID. If you provided a username, find your DID here: https://ilo.so/bluesky-did",
	}),
	serviceBaseUrl: z.url().default("https://public.api.bsky.app"),
	limit: z
		.number({
			message:
				"Limit (number of records on this page) must be between 1 and 100, inclusive.",
		})
		.min(1)
		.max(100)
		.default(50),
	fetchAll: z.boolean().default(false),
});

export type StandardSiteLoaderOptions = z.infer<typeof loaderOptionsSchema>;

const documentSchema = z.custom<Main>(
	(data) => safeParse(mainSchema, data, { strict: true }).ok,
	{ message: "Invalid site.standard.document record" },
);

async function* listAllRecords(
	rpc: Client,
	repo: ActorIdentifier,
	limit: number,
	fetchAll: boolean,
) {
	let cursor: string | undefined;
	let page = 1;

	do {
		const { records, cursor: newCursor } = await ok(
			rpc.get("com.atproto.repo.listRecords", {
				params: {
					repo,
					collection: "site.standard.document",
					limit,
					cursor,
				},
			}),
		);

		yield { records, page };
		cursor = newCursor;
		page++;
	} while (fetchAll && cursor);
}

const standardSiteLoader = (
	options: Partial<StandardSiteLoaderOptions>,
): Loader => ({
	name: options.collectionName ?? "standard-site-loader",
	schema: documentSchema,
	load: async ({ store, logger, parseData }) => {
		logger.debug(
			`Starting load with user-provided loader options: ${JSON.stringify(options)}`,
		);
		const { serviceBaseUrl, didUri, limit, fetchAll } =
			await loaderOptionsSchema.parseAsync(options);

		logger.debug(
			`User-provided loader options validated, setting up client with base URL: ${serviceBaseUrl}`,
		);

		const rpc = new Client({
			handler: simpleFetchHandler({ service: serviceBaseUrl }),
		});

		logger.debug("Client set up, starting document fetch cycle");

		store.clear();

		try {
			for await (const { records, page } of listAllRecords(
				rpc,
				didUri,
				limit,
				fetchAll,
			)) {
				logger.debug(`Processing page ${page} (${records.length} records)`);

				for (const record of records) {
					const parsedRkey = parseCanonicalResourceUri(record.uri);
					if (!parsedRkey.ok) {
						logger.warn(
							`Skipping record with unparseable URI: "${record.uri}"`,
						);
						continue;
					}
					const { rkey } = parsedRkey.value;
					try {
						const parsed = await parseData({
							id: rkey,
							data: record.value as Main,
						});
						store.set({ id: rkey, data: parsed });
					} catch (err) {
						logger.warn(
							`Skipping record ${rkey}: ${err instanceof Error ? err.message : String(err)}`,
						);
					}
				}
			}
		} catch (err) {
			logger.error(
				`Failed during fetch: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		logger.debug("Document fetch cycle complete");
	},
});

export { standardSiteLoader };
