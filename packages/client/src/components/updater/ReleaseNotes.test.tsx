import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ReleaseNotes,
  parseMarkdown,
  tokenizeInline,
} from "./ReleaseNotes";

/**
 * Verbatim `notes` string from:
 * https://github.com/Yueby/termix/releases/download/v0.1.1/latest.json
 */
const REAL_V011_NOTES = `## [0.1.1](https://github.com/Yueby/termix/compare/v0.1.0..v0.1.1) - 2026-09-29

### Features

- *(client)* Sync to a self-deployed Termix server - ([84b74fe](https://github.com/Yueby/termix/commit/84b74fe7337df827b35929bc456589707753371e))
- *(client)* Choose where the vault syncs - ([35ea2e5](https://github.com/Yueby/termix/commit/35ea2e575fb4c8c69499a498fcdf7e26683ce307))
- *(client)* Sync automatically, and never resolve a conflict behind your back - ([371a316](https://github.com/Yueby/termix/commit/371a316526bd371d742753700d51a99f729b34c5))
- *(client)* Take the remote's version when it is ahead - ([221cbbe](https://github.com/Yueby/termix/commit/221cbbe9c0bc8eade4c81d1a364a53b9f7ad7b5a))
- *(rust)* Verify host keys, reject changed ones - ([bb8b879](https://github.com/Yueby/termix/commit/bb8b879e07162408a08500cd4a7c7750ee07bd1b))
- *(server)* Check in the migrations, and run the tests against them - ([9a953e1](https://github.com/Yueby/termix/commit/9a953e107992680bb1dc9f36f2b9eb9ec42320e8))

### Bug Fixes

- *(client)* Tear down a connection cancelled mid-flight, and fix the hook order - ([494ad45](https://github.com/Yueby/termix/commit/494ad45dbe95df8911d53ba11cb5b604b2785989))
- *(client)* Retry a push that failed - ([b03cb11](https://github.com/Yueby/termix/commit/b03cb11de2e63e4077182203931cc89aa14ae34e))
- *(rust)* Drain the SSH channel, and stop three ways of losing data - ([1cfe11b](https://github.com/Yueby/termix/commit/1cfe11b50f7aab7b0fd259aa733e9af9e7a0db6e))
- *(rust)* Anchor the proxy bypass wildcard - ([b78e863](https://github.com/Yueby/termix/commit/b78e8638861a5a0fcb1f136b7c47346569668136))
- *(rust)* Reap local shells, drain the session maps, and stop three silent failures - ([c7d2f0f](https://github.com/Yueby/termix/commit/c7d2f0f07a15c54b27f1db07c276f609c45e0db9))
- *(rust)* Keep the encryption key private, and stop reporting successful saves as failures - ([1417d9d](https://github.com/Yueby/termix/commit/1417d9d760e8d568d7b493c5f70aae2209b63676))
- *(rust)* Strip any scheme from a proxy URL - ([c855a0b](https://github.com/Yueby/termix/commit/c855a0b94857607d5502e8fa73895e35e6a655a0))
- *(server)* Typecheck both runtimes, close the fail-open paths - ([1b12fea](https://github.com/Yueby/termix/commit/1b12feabdebc28bb6fb3019f47f9f2c96dd1b1e4))
- *(server)* Run the context middleware before the routes - ([e566574](https://github.com/Yueby/termix/commit/e566574b9d5d1b21edee0ba6a475dc2554110bf2))
- *(server)* Make the sync push version check atomic - ([c8990ab](https://github.com/Yueby/termix/commit/c8990ab07a4da3f678ea8621ab6f7a6bde917d8f))
- *(server)* Claim a refresh token in one statement - ([42a7ace](https://github.com/Yueby/termix/commit/42a7aceffc7066e92a0c69566ec0b31ee60041e1))
- *(server)* Keep argon2 out of the Worker graph, and gate the Worker build - ([eef24c1](https://github.com/Yueby/termix/commit/eef24c147dcd81ddb1db2ba795c6b9dd132619ed))
- *(server)* Create the schema on startup - ([aa06fef](https://github.com/Yueby/termix/commit/aa06fef7d5a2938e056fdade8c1719310784093f))
- Let the platform handle title bar dragging - ([d1d5825](https://github.com/Yueby/termix/commit/d1d58253632bc588347a8cfb9563c328e9d4115f))

### Refactoring

- *(rust)* Clear the clippy backlog - ([2e66402](https://github.com/Yueby/termix/commit/2e6640299429d0a445d6603219b58bc613788b1b))
- *(server)* One shared token instead of an account system - ([7d027d9](https://github.com/Yueby/termix/commit/7d027d9b84cc96b725f37ef593911a61f8447123))

### Performance

- *(client)* Virtualize the SFTP file table - ([a6d141e](https://github.com/Yueby/termix/commit/a6d141ec83ecdfac97cdb83bba86eee2a9c66e29))

### Documentation

- Record the code and project review - ([e373c37](https://github.com/Yueby/termix/commit/e373c37a3932ac4a97321dc19c17cbe6ebfaf9c2))
- Move the review to its current state - ([9e03871](https://github.com/Yueby/termix/commit/9e0387156beb9ddb04c1c757c44f5a46b8b7b6c0))
- Record the last two fixes - ([7f64dea](https://github.com/Yueby/termix/commit/7f64deac4e3f75196a1e7916c71b8543596cfa8f))
- Bring the review up to date with the fixes - ([ae4ef02](https://github.com/Yueby/termix/commit/ae4ef02394e02015221212d4f006e8bdd8fd0b06))
- Document both deployments, and point D1 at the migrations - ([49570eb](https://github.com/Yueby/termix/commit/49570eb5b7b2bd5a381aac51e6cda37fb340387f))

### Testing

- *(client)* Cover key-type detection, and gate it - ([c5f83eb](https://github.com/Yueby/termix/commit/c5f83eb998a79d31c7ab6abc851c1436e1a4037c))
- Cover the server's runtime behaviour and the decryption contract - ([f03f544](https://github.com/Yueby/termix/commit/f03f5443b472d0d18a48ef2907240b42b0a9d465))

### Styling

- *(rust)* Bring the tree to rustfmt - ([d906eba](https://github.com/Yueby/termix/commit/d906eba7f55a44daca0a743a366ae5284601924d))

### Maintenance

- *(release)* Harden the release workflow - ([c80b95a](https://github.com/Yueby/termix/commit/c80b95a2abda45bbc8ee141d2dd06841beaee92a))
- *(release)* 0.1.1 - ([e217c0c](https://github.com/Yueby/termix/commit/e217c0c0bf9a3bb90e2e76e681cb1db87db9dd0e))
- Build the release notes on git-cliff's own template - ([ab94eba](https://github.com/Yueby/termix/commit/ab94ebab93188651ca197a26123eb55a8f04559e))
- Read the pull request number from commit.remote - ([b60d361](https://github.com/Yueby/termix/commit/b60d36148e921e52cf66dfca2d653a480c0f15dc))
- Grant pull-requests: read so commits can be resolved to their PRs - ([81fd0e9](https://github.com/Yueby/termix/commit/81fd0e93338405d2995f2ce7f463612db01f4df8))
- Gate the server typecheck and rustfmt - ([d522442](https://github.com/Yueby/termix/commit/d5224420b2934bb9e92f64ac84f229cea6a7cc46))
- Gate the server tests and clippy - ([b6c7bc6](https://github.com/Yueby/termix/commit/b6c7bc67cbaf7090a2ac44d5a0596bc50a1240f5))`;

describe("ReleaseNotes parser and tokenizer", () => {
  it("returns null for empty or whitespace-only inputs", () => {
    expect(parseMarkdown("")).toBeNull();
    expect(parseMarkdown("   \n\n\t  ")).toBeNull();
    expect(renderToString(<ReleaseNotes notes="" />)).toBe("");
    expect(renderToString(<ReleaseNotes notes={null} />)).toBe("");
    expect(renderToString(<ReleaseNotes notes={undefined} />)).toBe("");
  });

  it("parses plain text into clean paragraphs", () => {
    const plain = "A small patch release addressing clipboard permissions.";
    const blocks = parseMarkdown(plain);
    expect(blocks).toHaveLength(1);
    expect(blocks![0].type).toBe("paragraph");
    if (blocks![0].type === "paragraph") {
      expect(blocks![0].content).toBe(plain);
    }

    const html = renderToString(<ReleaseNotes notes={plain} />);
    expect(html).toContain("A small patch release addressing clipboard permissions.");
    expect(html).toContain("<p");
  });

  it("parses multi-paragraph plain text without markdown", () => {
    const text = "First paragraph of update.\n\nSecond paragraph with details.";
    const blocks = parseMarkdown(text);
    expect(blocks).toHaveLength(2);
    expect(blocks![0].type).toBe("paragraph");
    expect(blocks![1].type).toBe("paragraph");
    if (blocks![0].type === "paragraph" && blocks![1].type === "paragraph") {
      expect(blocks![0].content).toBe("First paragraph of update.");
      expect(blocks![1].content).toBe("Second paragraph with details.");
    }

    const html = renderToString(<ReleaseNotes notes={text} />);
    expect(html).toContain("First paragraph of update.");
    expect(html).toContain("Second paragraph with details.");
  });

  it("tokenizes scopes, commit hashes, bold, and code", () => {
    const line =
      "*(client)* [**breaking**] Fix in `ssh.rs` - ([84b74fe](https://github.com/Yueby/termix/commit/84b74fe7337df827b35929bc456589707753371e))";
    const tokens = tokenizeInline(line);

    expect(tokens.some((t) => t.type === "scope" && t.text === "client")).toBe(true);
    expect(
      tokens.some(
        (t) => t.type === "badge" && t.label === "breaking" && t.variant === "destructive",
      ),
    ).toBe(true);
    expect(tokens.some((t) => t.type === "code" && t.text === "ssh.rs")).toBe(true);
    expect(
      tokens.some(
        (t) =>
          t.type === "link" &&
          t.label === "84b74fe" &&
          t.isCommit === true &&
          t.safe === true,
      ),
    ).toBe(true);
  });

  it("neutralizes unsafe link protocols without injecting executable HTML", () => {
    const dangerous =
      "Click [exploit](javascript:alert(1)) or [data-xss](data:text/html,<script>alert(1)</script>)";
    const tokens = tokenizeInline(dangerous);

    const jsToken = tokens.find((t) => t.type === "link" && t.label === "exploit");
    expect(jsToken).toBeDefined();
    if (jsToken && jsToken.type === "link") {
      expect(jsToken.safe).toBe(false);
    }

    const html = renderToString(<ReleaseNotes notes={dangerous} />);
    // Must NOT contain href="javascript:..." or href="data:..."
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    // The label is rendered as inert text
    expect(html).toContain("exploit");
  });

  it("escapes raw HTML tags so they never become live markup", () => {
    const rawHtml = "Security note: <script>alert('xss')</script> and <img src=x onerror=alert(1)>";
    const html = renderToString(<ReleaseNotes notes={rawHtml} />);

    // React escapes text nodes: <script> becomes &lt;script&gt;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("ReleaseNotes with verbatim v0.1.1 latest.json notes", () => {
  it("parses the full 5.8KB notes into structured blocks", () => {
    const blocks = parseMarkdown(REAL_V011_NOTES);
    expect(blocks).not.toBeNull();
    // 1 h2 version header + 8 h3 section headers + 8 lists = 17 blocks
    expect(blocks!).toHaveLength(17);

    const headingBlocks = blocks!.filter(
      (b): b is Extract<typeof b, { type: "heading" }> => b.type === "heading",
    );
    expect(headingBlocks.map((h) => h.content)).toEqual([
      "[0.1.1](https://github.com/Yueby/termix/compare/v0.1.0..v0.1.1) - 2026-09-29",
      "Features",
      "Bug Fixes",
      "Refactoring",
      "Performance",
      "Documentation",
      "Testing",
      "Styling",
      "Maintenance",
    ]);

    const listBlocks = blocks!.filter((b) => b.type === "list");
    expect(listBlocks).toHaveLength(8);
  });

  it("renders verbatim v0.1.1 notes to HTML with proper structure, scopes and commit links", () => {
    const html = renderToString(<ReleaseNotes notes={REAL_V011_NOTES} />);

    // Check headings exist
    expect(html).toContain("Features");
    expect(html).toContain("Bug Fixes");
    expect(html).toContain("Refactoring");
    expect(html).toContain("Performance");
    expect(html).toContain("Documentation");
    expect(html).toContain("Testing");
    expect(html).toContain("Styling");
    expect(html).toContain("Maintenance");

    // Check scopes are rendered as badges
    expect(html).toContain("client");
    expect(html).toContain("rust");
    expect(html).toContain("server");
    expect(html).toContain("release");

    // Check commit hash links are rendered
    expect(html).toContain("84b74fe");
    expect(html).toContain("35ea2e5");
    expect(html).toContain("bb8b879");
    expect(html).toContain("494ad45");

    // Check compare link exists
    expect(html).toContain("https://github.com/Yueby/termix/compare/v0.1.0..v0.1.1");

    // Check container classes include wrapping
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain("break-words");
  });

  it("handles very long notes with 100+ items without blowing up or overflowing", () => {
    const manyItems = Array.from({ length: 120 }, (_, i) =>
      `- *(perf)* Optimization item #${i + 1} with a very long url - ([${(i + 1000000).toString(16)}](https://github.com/Yueby/termix/commit/${"a".repeat(40)}))`
    ).join("\n");

    const longNotes = `### Stress Test\n\n${manyItems}`;
    const blocks = parseMarkdown(longNotes);
    expect(blocks).toHaveLength(2);
    if (blocks![1].type === "list") {
      expect(blocks![1].items).toHaveLength(120);
    }

    const html = renderToString(<ReleaseNotes notes={longNotes} />);
    expect(html).toContain("Optimization item #120");
    expect(html).toContain("break-all");
  });
});
