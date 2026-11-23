import assert from "node:assert/strict";

import type { FeaturedFeed } from "../src/utils/api.ts";
import { discoverSections, plainTitle } from "../src/utils/discover.ts";

let checks = 0;
function check(name: string, body: () => void) {
	try {
		body();
		checks++;
		console.log(`ok   ${name}`);
	} catch (error) {
		console.log(`FAIL ${name}`);
		console.log(`     ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}

const feed: FeaturedFeed = {
	tfa: {
		title: "Ice_Warrior",
		description: "Fictional alien from Doctor Who",
		extract: "",
		content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Ice_Warrior" } },
		thumbnail: { source: "https://x/ice.jpg" },
	},
	image: {
		title: "File:Pointe Saint Mathieu - Phare.jpg",
		description: { text: "View of Pointe Saint-Mathieu with the lighthouse" },
		thumbnail: { source: "https://x/phare.jpg" },
		file_page: "https://commons.wikimedia.org/wiki/File:Poite.jpg",
	},
	onthisday: [
		{
			year: 1963,
			text: "Doctor Who first aired.",
			pages: [{ title: "Doctor_Who", thumbnail: { source: "https://x/who.jpg" } }],
		},
	],
	mostread: {
		articles: [
			{
				title: "Quantum_mechanics",
				normalizedtitle: "Quantum mechanics",
				description: "Description of physical properties",
				thumbnail: { source: "https://x/qm.jpg" },
			},
		],
	},
};

check("a feed title loses the wiki's underscores", () => {
	assert.equal(plainTitle("Ice_Warrior"), "Ice Warrior");
});

check("the feed becomes the four sections the view lists", () => {
	assert.deepEqual(
		discoverSections(feed).map((section) => section.title),
		["Featured Article", "Picture of the Day", "On This Day", "Most Read"],
	);
});

check("the featured row opens the article under its plain title", () => {
	const [featured] = discoverSections(feed);
	assert.equal(featured?.rows[0]?.title, "Ice Warrior");
	assert.equal(featured?.rows[0]?.read, "Ice Warrior");
});

check("the picture opens its file page instead of an article", () => {
	const picture = discoverSections(feed)[1]?.rows[0];
	assert.equal(picture?.read, undefined);
	assert.equal(picture?.url, "https://commons.wikimedia.org/wiki/File:Poite.jpg");
});

check("an anniversary names the year and the event", () => {
	const anniversary = discoverSections(feed)[2]?.rows[0];
	assert.equal(anniversary?.title, "Doctor Who");
	assert.equal(anniversary?.subtitle, "1963 — Doctor Who first aired.");
});

check("a wiki without a most-read section is not a broken view", () => {
	const thin: FeaturedFeed = { tfa: feed.tfa };
	assert.deepEqual(discoverSections(thin).map((section) => section.title), ["Featured Article"]);
	assert.deepEqual(discoverSections(undefined), []);
});
